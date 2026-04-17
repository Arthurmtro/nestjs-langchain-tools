import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import type { ToolInterface } from '@langchain/core/tools';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';

/* Type-only imports — LangGraph stays an optional peer dep. */
import type {
  BaseCheckpointSaver,
  Command as LangGraphCommand,
} from '@langchain/langgraph';
import type { createReactAgent } from '@langchain/langgraph/prebuilt';

import { Observable, Subscriber } from 'rxjs';
import { MODULE_OPTIONS_TOKEN } from '../config/configurable-module';
import type { LangChainToolsModuleOptions } from '../config/module-options';
import { LLM_FACTORY, resolveLlm } from '../llm/llm-factory.provider';
import type { LlmFactory } from '../llm/llm-factory.interface';
import { ModelProvider } from '../interfaces/agent.interface';
import {
  DEFAULT_COORDINATOR_MODEL,
  DEFAULT_COORDINATOR_PROMPT,
} from '../constants/coordinator.constants';
import {
  AgentDiscoveryService,
  SupervisorInfo,
} from '../services/agent-discovery.service';
import type { AgentInfo } from '../interfaces/agent.interface';
import {
  CoordinatorStreamEvent,
  mapStreamEvent,
} from './stream-events';
import {
  createDefaultCheckpointSaver,
  graphConfig,
} from './checkpoint-bridge';
import { buildSupervisor } from './supervisor.builder';

export interface GraphProcessOptions {
  sessionId?: string;
  onToken?: (token: string) => void;
}

/**
 * Shape of the graph returned by `createReactAgent`. We use our own
 * narrow interface rather than reaching into LangGraph's generics because
 * the LangChain team iterates on those internals regularly, and this
 * surface is exactly what we need and nothing else.
 */
export interface CompiledReactAgent {
  invoke(
    input: GraphInvokeInput,
    config?: GraphRuntimeConfig,
  ): Promise<GraphInvokeResult>;
  streamEvents(
    input: GraphInvokeInput,
    options: GraphStreamEventsOptions,
  ): AsyncIterable<StreamEvent>;
}

export type GraphInvokeInput =
  | { messages: BaseMessage[] }
  | LangGraphCommand;

export interface GraphRuntimeConfig {
  configurable: { thread_id: string };
}

export interface GraphInvokeResult {
  messages: BaseMessage[];
}

export interface GraphStreamEventsOptions extends GraphRuntimeConfig {
  version: 'v2';
}

type CreateReactAgent = typeof createReactAgent;
type CreateReactAgentParams = Parameters<CreateReactAgent>[0];

/**
 * LangGraph-first coordinator. Uses `createReactAgent` from
 * `@langchain/langgraph/prebuilt` as the default orchestrator. Streams
 * events through {@link processMessageStream} as typed
 * {@link CoordinatorStreamEvent}s, supports checkpoint-based state, and
 * exposes a `resume()` path for human-in-the-loop flows.
 */
@Injectable()
export class GraphCoordinatorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GraphCoordinatorService.name);
  private graph: CompiledReactAgent | null = null;
  private checkpointer: BaseCheckpointSaver | null = null;
  private initialized = false;
  /**
   * Runtime override for supervisor options. Only fields the app wants to
   * override at runtime need be populated — everything else falls through
   * to the decorator / module-level defaults.
   */
  private supervisorOverride: Partial<{
    taskDelegation: 'full-context' | 'focused' | 'rewritten';
  }> = {};

  constructor(
    private readonly agentDiscoveryService: AgentDiscoveryService,
    @Optional() @Inject(LLM_FACTORY) private readonly llmFactory?: LlmFactory,
    @Optional()
    @Inject(MODULE_OPTIONS_TOKEN)
    private readonly options?: LangChainToolsModuleOptions,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.initialize();
    } catch (err) {
      this.logger.error(
        'Failed to initialize graph coordinator:',
        (err as Error).stack,
      );
    }
  }

  async initialize(): Promise<void> {
    await this.agentDiscoveryService.discoverAndInitializeAgents();
    await this.agentDiscoveryService.discoverSupervisors();
    this.checkpointer = await createDefaultCheckpointSaver();

    const mode = this.resolveOrchestrationMode();
    if (mode === 'supervisor') {
      await this.initializeSupervisor();
    } else {
      await this.initializeFlat();
    }
    this.initialized = true;
  }

  private resolveOrchestrationMode(): 'flat' | 'supervisor' {
    const requested = this.options?.orchestration ?? 'auto';
    const supervisors = this.agentDiscoveryService.getAllSupervisors();
    if (requested === 'flat') return 'flat';
    if (requested === 'supervisor') {
      if (supervisors.length === 0) {
        throw new Error(
          'orchestration="supervisor" but no class with @SupervisorAgent was discovered. ' +
            'Either register one or switch to orchestration="flat" (or "auto").',
        );
      }
      return 'supervisor';
    }
    // auto
    return supervisors.length > 0 ? 'supervisor' : 'flat';
  }

  private async initializeFlat(): Promise<void> {
    const tools = this.collectTools();
    const model = await this.buildModel();
    const prompt = this.options?.coordinatorPrompt ?? DEFAULT_COORDINATOR_PROMPT;

    const createAgent = requireCreateReactAgent();
    const params: CreateReactAgentParams = {
      llm: model,
      tools,
      prompt,
      checkpointSaver: this.checkpointer ?? undefined,
    } as CreateReactAgentParams;
    this.graph = createAgent(params) as unknown as CompiledReactAgent;
    this.logger.log(
      `Graph coordinator initialized (mode=flat, tools=${tools.length}, checkpointer=memory)`,
    );
  }

  private async initializeSupervisor(): Promise<void> {
    const supervisors = this.agentDiscoveryService.getAllSupervisors();
    if (supervisors.length > 1) {
      this.logger.warn(
        `Multiple supervisors discovered (${supervisors
          .map((s) => s.name)
          .join(', ')}) — using "${supervisors[0].name}"`,
      );
    }
    const supervisor = supervisors[0];
    const workers = this.resolveWorkers(supervisor);
    if (workers.length === 0) {
      this.logger.warn(
        `Supervisor "${supervisor.name}" has no resolvable workers — falling back to flat mode.`,
      );
      await this.initializeFlat();
      return;
    }
    const model = await this.buildModel();
    const workerFactory = async (worker: AgentInfo) =>
      this.buildAgentModel(worker);
    const ruleRouter =
      supervisor.options.routingStrategy === 'rule-based'
        ? this.buildRuleRouter(supervisor)
        : undefined;
    // Merge order (highest to lowest): runtime override > decorator >
    // module option > builder default ('focused').
    const taskDelegation =
      this.supervisorOverride.taskDelegation ??
      supervisor.options.taskDelegation ??
      this.options?.supervisorTaskDelegation ??
      'focused';
    const mergedOptions = { ...supervisor.options, taskDelegation };
    this.graph = (await buildSupervisor({
      model,
      workers,
      options: mergedOptions,
      checkpointSaver: this.checkpointer ?? undefined,
      workerModelFactory: workerFactory,
      ruleRouter,
    })) as unknown as CompiledReactAgent;
    this.logger.log(
      `Graph coordinator initialized (mode=supervisor, name=${supervisor.name}, workers=${workers.length}, delegation=${taskDelegation})`,
    );
  }

  /**
   * Runtime override for supervisor options. Only runtime-relevant fields
   * are supported (currently `taskDelegation`). Pass `{}` or omit a field
   * to revert to the decorator / module-level default. Call `reset()` so
   * the next message rebuilds the graph with the new setting.
   */
  setSupervisorOverride(
    override: Partial<{
      taskDelegation: 'full-context' | 'focused' | 'rewritten';
    }>,
  ): void {
    this.supervisorOverride = { ...this.supervisorOverride, ...override };
    this.reset();
  }

  getSupervisorOverride(): Readonly<{
    taskDelegation?: 'full-context' | 'focused' | 'rewritten';
  }> {
    return { ...this.supervisorOverride };
  }

  private resolveWorkers(supervisor: SupervisorInfo): AgentInfo[] {
    const all = this.agentDiscoveryService.getAllAgents();
    const declared = supervisor.options.workers ?? [];
    if (declared.length === 0) return all;
    const byName = new Map(all.map((a) => [a.name, a] as const));
    const out: AgentInfo[] = [];
    for (const name of declared) {
      const worker = byName.get(name);
      if (worker) out.push(worker);
    }
    return out;
  }

  private buildRuleRouter(
    supervisor: SupervisorInfo,
  ): ((messages: BaseMessage[]) => string | undefined) | undefined {
    const instance = supervisor.instance as {
      route?: (messages: BaseMessage[]) => string | undefined;
    };
    if (typeof instance?.route !== 'function') return undefined;
    return (messages: BaseMessage[]) => instance.route!(messages);
  }

  private async buildAgentModel(worker: AgentInfo): Promise<BaseChatModel> {
    if (!this.llmFactory) {
      throw new Error(
        'No LLM factory configured for worker "' + worker.name + '"',
      );
    }
    const opts = worker.options as { modelName?: string; modelType?: ModelProvider; temperature?: number };
    return resolveLlm(this.llmFactory, {
      purpose: 'agent',
      provider: opts.modelType ?? ModelProvider.OPENAI,
      modelName: opts.modelName,
      temperature: opts.temperature,
      streaming: true,
      agentOptions: worker.options,
    });
  }

  /** Non-streaming processing. Returns the final assistant message text. */
  async processMessage(
    message: string,
    options: GraphProcessOptions = {},
  ): Promise<string> {
    const graph = await this.ensureInitialized();
    const sessionId = options.sessionId ?? 'default';
    const result = await graph.invoke(
      { messages: [new HumanMessage(message)] },
      { recursionLimit: 60, ...graphConfig(sessionId) } as never,
    );
    return extractText(result.messages[result.messages.length - 1]);
  }

  /**
   * Returns an RxJS Observable of typed stream events suitable for piping
   * to an SSE controller. Tokens, tool lifecycle and custom progress
   * events are surfaced as discriminated-union events.
   */
  processMessageStream(
    message: string,
    options: GraphProcessOptions = {},
  ): Observable<CoordinatorStreamEvent> {
    return new Observable<CoordinatorStreamEvent>((subscriber) =>
      this.runStream(message, options, subscriber),
    );
  }

  /**
   * Resumes execution after a {@link HumanInterrupt}. Pass the thread id
   * surfaced in the {@link InterruptEvent} and the operator's decision.
   */
  async resume(
    threadId: string,
    humanInput: unknown,
  ): Promise<CoordinatorStreamEvent[]> {
    const graph = await this.ensureInitialized();
    const Command = requireCommand();
    const command = new Command({ resume: humanInput });
    const result = await graph.invoke(
      command,
      { recursionLimit: 60, ...graphConfig(threadId) } as never,
    );
    const last = result.messages[result.messages.length - 1];
    return [
      { type: 'complete', content: extractText(last), threadId },
    ];
  }

  /** Escape hatch — exposes the compiled graph for advanced use cases. */
  getGraph(): CompiledReactAgent | null {
    return this.graph;
  }

  /**
   * Invalidates the compiled graph so the next call rebuilds it with a
   * fresh LLM. Call this after rotating API keys, switching providers or
   * otherwise changing the runtime config. Safe to call multiple times.
   */
  reset(): void {
    this.graph = null;
    this.initialized = false;
    this.checkpointer = null;
  }

  private runStream(
    message: string,
    options: GraphProcessOptions,
    subscriber: Subscriber<CoordinatorStreamEvent>,
  ): () => void {
    let cancelled = false;
    void (async () => {
      const sessionId = options.sessionId ?? 'default';
      const started = Date.now();
      this.logger.log(
        `stream start — session=${sessionId} msg="${truncate(message, 80)}"`,
      );
      // Hoisted so the recursion-limit catch branch can finalise with
      // whatever tokens already streamed.
      let full = '';
      try {
        const graph = await this.ensureInitialized();
        // LangGraph's default recursionLimit is 25. For a supervisor graph
        // that's router + N workers each doing a few tool calls, that's
        // tight. Raise it to 60 so a 3-hop multi-tool turn fits comfortably.
        const stream = graph.streamEvents(
          { messages: [new HumanMessage(message)] },
          {
            version: 'v2',
            recursionLimit: 60,
            ...graphConfig(sessionId),
          } as never,
        );
        let rawCount = 0;
        let mappedCount = 0;
        for await (const raw of stream) {
          if (cancelled) break;
          rawCount += 1;
          const mapped = mapStreamEvent(raw);
          if (!mapped) continue;
          mappedCount += 1;
          this.logStreamEvent(sessionId, mapped);
          if (mapped.type === 'token') {
            full += mapped.content;
            options.onToken?.(mapped.content);
          }
          subscriber.next(mapped);
        }
        if (!cancelled) {
          subscriber.next({ type: 'complete', content: full, threadId: sessionId });
          subscriber.complete();
          this.logger.log(
            `stream done — session=${sessionId} rawEvents=${rawCount} mapped=${mappedCount} chars=${full.length} in ${Date.now() - started}ms`,
          );
        }
      } catch (err) {
        const error = err as Error;
        // GraphRecursionError means the supervisor never emitted FINISH.
        // Treat it as a soft stop: whatever tokens already streamed are
        // valid output; we just cap the turn here instead of nuking the
        // reply. All other errors still propagate.
        if (/Recursion limit/i.test(error.message)) {
          this.logger.warn(
            `stream capped — session=${sessionId}: ${error.message}`,
          );
          if (!cancelled) {
            subscriber.next({ type: 'complete', content: full, threadId: sessionId });
            subscriber.complete();
          }
          return;
        }
        this.logger.error(
          `stream error — session=${sessionId}: ${error.message}`,
          error.stack,
        );
        subscriber.next({ type: 'error', error: error.message });
        subscriber.error(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }

  private logStreamEvent(
    sessionId: string,
    event: CoordinatorStreamEvent,
  ): void {
    switch (event.type) {
      case 'tool-start':
        this.logger.log(
          `  [${sessionId}] tool-start ${event.tool} input=${truncate(JSON.stringify(event.input), 120)}`,
        );
        break;
      case 'tool-end':
        this.logger.log(
          `  [${sessionId}] tool-end ${event.tool} output=${truncate(JSON.stringify(event.output), 120)}`,
        );
        break;
      case 'tool-progress':
        this.logger.debug(
          `  [${sessionId}] tool-progress ${event.tool} ${event.progress ?? ''} ${event.message ?? ''}`,
        );
        break;
      case 'agent-handoff':
        this.logger.log(`  [${sessionId}] handoff ${event.from} → ${event.to}`);
        break;
      case 'interrupt':
        this.logger.warn(
          `  [${sessionId}] interrupt reason=${event.reason}`,
        );
        break;
      case 'error':
        this.logger.error(`  [${sessionId}] error: ${event.error}`);
        break;
      default:
        // tokens are noisy — skip at INFO level
        break;
    }
  }

  private async ensureInitialized(): Promise<CompiledReactAgent> {
    if (this.initialized && this.graph) return this.graph;
    await this.initialize();
    if (!this.initialized || !this.graph) {
      throw new Error('Graph coordinator failed to initialize');
    }
    return this.graph;
  }

  private collectTools(): ToolInterface[] {
    const agents = this.agentDiscoveryService.getAllAgents();
    const tools: ToolInterface[] = [];
    for (const agent of agents) tools.push(...agent.tools);
    return tools;
  }

  private async buildModel(): Promise<BaseChatModel> {
    if (this.options?.coordinatorLlm) return this.options.coordinatorLlm;
    if (!this.llmFactory) {
      throw new Error('No LLM factory configured for graph coordinator');
    }
    return resolveLlm(this.llmFactory, {
      purpose: 'coordinator',
      provider: this.options?.coordinatorProvider ?? ModelProvider.OPENAI,
      modelName: this.options?.coordinatorModel ?? DEFAULT_COORDINATOR_MODEL,
      temperature: this.options?.coordinatorTemperature ?? 0,
      streaming: true,
      onToken: this.options?.onToken,
    });
  }
}

/**
 * Lazy loader for `createReactAgent` — LangGraph is an optional peer dep.
 * The cast is confined here; every caller downstream is typed.
 */
function requireCreateReactAgent(): CreateReactAgent {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@langchain/langgraph/prebuilt') as {
    createReactAgent?: CreateReactAgent;
  };
  if (!mod.createReactAgent) {
    throw new Error(
      '@langchain/langgraph is required for GraphCoordinatorService. ' +
        'Install it: pnpm add @langchain/langgraph',
    );
  }
  return mod.createReactAgent;
}

function requireCommand(): typeof LangGraphCommand {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@langchain/langgraph') as {
    Command?: typeof LangGraphCommand;
  };
  if (!mod.Command) {
    throw new Error(
      '@langchain/langgraph is required to resume interrupted threads.',
    );
  }
  return mod.Command;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + '…';
}

function extractText(message: BaseMessage | undefined): string {
  if (!message) return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((chunk) => {
        if (typeof chunk === 'string') return chunk;
        if (chunk && typeof chunk === 'object' && 'text' in chunk) {
          const text = (chunk as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }
  return '';
}
