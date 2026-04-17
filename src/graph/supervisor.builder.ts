import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import type {
  BaseCheckpointSaver,
  END as END_TYPE,
  MessagesAnnotation as MessagesAnnotationType,
  Annotation as AnnotationType,
  StateGraph,
  START as START_TYPE,
} from '@langchain/langgraph';
import type { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { AgentInfo } from '../interfaces/agent.interface';
import type {
  SubtaskRewriter,
  SupervisorAgentOptions,
  SupervisorRoutingStrategy,
  TaskDelegationMode,
} from '../decorators/supervisor-agent.decorator';

export interface BuiltSupervisor {
  invoke(
    input: { messages: BaseMessage[] } | unknown,
    config?: Record<string, unknown>,
  ): Promise<{ messages: BaseMessage[] }>;
  streamEvents(
    input: { messages: BaseMessage[] } | unknown,
    opts: { version: 'v2' } & Record<string, unknown>,
  ): AsyncIterable<StreamEvent>;
}

/** Resolves the LLM to use for a given worker. */
export type WorkerModelFactory = (
  worker: AgentInfo,
) => BaseChatModel | Promise<BaseChatModel>;

export interface BuildSupervisorParams {
  /** Model used by the supervisor's own routing decision. */
  model: BaseChatModel;
  workers: AgentInfo[];
  options: SupervisorAgentOptions;
  /** Optional checkpoint saver — enables multi-turn memory + interrupts. */
  checkpointSaver?: BaseCheckpointSaver;
  /**
   * Optional per-worker model resolver. If omitted, every worker reuses
   * `params.model`. Useful when different workers should run on different
   * providers (e.g. cheap model for weather, flagship for reasoning).
   */
  workerModelFactory?: WorkerModelFactory;
  /**
   * Optional rule-based router. If the supervisor's `routingStrategy` is
   * `'rule-based'` the builder calls this before falling back to `workers[0]`.
   * Return the chosen worker name or `'__end__'` to terminate.
   */
  ruleRouter?: (messages: BaseMessage[]) => string | undefined;
  /**
   * Per-worker recursion cap (defaults to 12). This is the budget each
   * worker's internal ReAct loop gets per router dispatch — prevents a
   * single worker from exhausting the parent graph's recursionLimit.
   */
  workerRecursionLimit?: number;
}

interface SupervisorState {
  messages: BaseMessage[];
  next?: string;
  /**
   * When `taskDelegation: 'rewritten'` and the default in-router rewrite
   * is used, the router stores the focused sub-task here so the worker
   * node can read it without a second LLM call.
   */
  nextTask?: string;
}

type LangGraphRuntime = {
  StateGraph: typeof StateGraph;
  MessagesAnnotation: typeof MessagesAnnotationType;
  Annotation: typeof AnnotationType;
  END: typeof END_TYPE;
  START: typeof START_TYPE;
};

type PrebuiltRuntime = {
  createReactAgent: typeof createReactAgent;
};

function loadLangGraph(): LangGraphRuntime {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@langchain/langgraph') as Partial<LangGraphRuntime>;
  if (
    !mod.StateGraph ||
    !mod.MessagesAnnotation ||
    !mod.Annotation ||
    !mod.END ||
    !mod.START
  ) {
    throw new Error(
      '@langchain/langgraph is required to build a supervisor agent.',
    );
  }
  return {
    StateGraph: mod.StateGraph,
    MessagesAnnotation: mod.MessagesAnnotation,
    Annotation: mod.Annotation,
    END: mod.END,
    START: mod.START,
  };
}

function loadPrebuilt(): PrebuiltRuntime {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@langchain/langgraph/prebuilt') as Partial<PrebuiltRuntime>;
  if (!mod.createReactAgent) {
    throw new Error(
      '@langchain/langgraph/prebuilt is required to build a supervisor agent.',
    );
  }
  return { createReactAgent: mod.createReactAgent };
}

/**
 * Compiles a supervisor `StateGraph` wiring one router node to N worker
 * nodes. Each worker runs its own `createReactAgent` built from its tools
 * + system prompt — isolated from the others. The router decides the next
 * worker either via the supervisor LLM or a declarative rule function.
 *
 * Workers loop back to the router so the supervisor can delegate multiple
 * steps in a single user turn (e.g. weather → booking → knowledge); the
 * router terminates by returning `__end__` or when it returns an
 * unrecognised worker name.
 */
export async function buildSupervisor(
  params: BuildSupervisorParams,
): Promise<BuiltSupervisor> {
  const { StateGraph, MessagesAnnotation, Annotation, END, START } = loadLangGraph();
  const { createReactAgent } = loadPrebuilt();

  // Extend MessagesAnnotation with `next` (router decision) and
  // `lastWorker` (for handoff bookkeeping). Without these extra slots the
  // conditional edge can't read state.next — default schemas only preserve
  // declared channels.
  const State = Annotation.Root({
    ...MessagesAnnotation.spec,
    next: Annotation<string | undefined>({
      reducer: (_prev: string | undefined, next: string | undefined) => next,
      default: () => undefined,
    }),
    nextTask: Annotation<string | undefined>({
      reducer: (_prev: string | undefined, next: string | undefined) => next,
      default: () => undefined,
    }),
  });

  const routingStrategy: SupervisorRoutingStrategy =
    params.options.routingStrategy ?? 'llm';
  const workerNames = params.workers.map((w) => w.name);
  // Default to a finite iteration cap rather than `final_answer` — a
  // misbehaving router that never emits FINISH would otherwise hit
  // LangGraph's 25-step recursion limit with an opaque error. 10 is
  // generous for 3–4 workers; override via the decorator when needed.
  const terminateOn =
    params.options.terminateOn ?? { kind: 'max_iterations', limit: 10 };
  const delegationMode: TaskDelegationMode =
    params.options.taskDelegation ?? 'focused';
  // Rewritten mode combines routing + sub-task crafting into a single
  // router call — unless the caller provided an explicit rewriter, which
  // we take as a signal that they want the separate two-call pattern.
  const useCombinedRewrite =
    delegationMode === 'rewritten' && !params.options.subtaskRewriter;
  const rewriter: SubtaskRewriter =
    params.options.subtaskRewriter ?? defaultSubtaskRewriter;

  const workerAgents = new Map<string, ReturnType<typeof createReactAgent>>();
  for (const worker of params.workers) {
    const model = params.workerModelFactory
      ? await params.workerModelFactory(worker)
      : params.model;
    workerAgents.set(
      worker.name,
      createReactAgent({
        llm: model,
        tools: worker.tools,
        prompt: worker.options.systemPrompt,
      }),
    );
  }

  /**
   * Loose builder view. LangGraph's `StateGraph` tracks node names in a
   * string-literal union that only grows via chained `.addNode()` calls.
   * Our graph is built iteratively with dynamic worker names, so we
   * operate on a wider interface internally and rely on runtime safety
   * (every name added is also referenced when wiring edges).
   */
  interface LooseGraph {
    addNode(
      name: string,
      fn: (state: SupervisorState) => Promise<Partial<SupervisorState>>,
    ): LooseGraph;
    addEdge(from: string, to: string): LooseGraph;
    addConditionalEdges(
      from: string,
      router: (state: SupervisorState) => string,
    ): LooseGraph;
    compile(options?: { checkpointer?: BaseCheckpointSaver }): BuiltSupervisor;
  }

  const graph = new StateGraph(State) as unknown as LooseGraph;
  const supervisorName = params.options.name;
  let iterations = 0;

  graph.addNode('router', async (state) => {
    iterations += 1;
    if (
      terminateOn.kind === 'max_iterations' &&
      iterations > terminateOn.limit
    ) {
      return { messages: state.messages, next: String(END) };
    }
    // Compute lastWorker fresh from this turn's messages — NOT from a
    // persistent state channel that would leak across turns via the
    // checkpointer and mislabel handoff pills on follow-up prompts.
    const lastWorker = lastWorkerThisTurn(state.messages, params.workers);
    const decision = await decideNext(
      routingStrategy,
      state,
      params.model,
      params.workers,
      params.options,
      params.ruleRouter,
      delegationMode,
    );
    const next = decision.next;
    // Emit a handoff custom event whenever the router selects a worker
    // (including re-selecting the same worker) so UIs can reflect the
    // change. When terminating (next === END), emit a handoff back to the
    // supervisor so the stream wraps up attributed to the top-level agent.
    const isWorker = next && workerNames.includes(next);
    const from = lastWorker ?? supervisorName;
    const to = isWorker ? next : supervisorName;
    if (from !== to) {
      try {
        await dispatchCustomEvent('agent-handoff', { from, to });
      } catch {
        // dispatchCustomEvent throws when no active callback manager is
        // available (synchronous sync paths). Safe to ignore.
      }
    }
    return {
      messages: state.messages,
      next,
      // Propagate the focused task when combined-rewrite is active. The
      // worker node consumes and acts on it; we don't clear it from state
      // because the next router tick will overwrite it anyway.
      nextTask: decision.task,
    };
  });

  for (const worker of params.workers) {
    graph.addNode(worker.name, async (state) => {
      const agent = workerAgents.get(worker.name);
      if (!agent) {
        return { messages: [...state.messages], lastWorker: worker.name };
      }
      // If the router already crafted a focused task (combined rewrite),
      // skip the per-worker rewrite and hand the task in directly.
      const prebuiltTask = useCombinedRewrite ? state.nextTask : undefined;
      const workerInput = prebuiltTask
        ? [new HumanMessage(prebuiltTask)]
        : await buildWorkerInput({
            mode: delegationMode,
            worker,
            messages: state.messages,
            model: params.model,
            rewriter,
          });
      if (prebuiltTask) {
        try {
          await dispatchCustomEvent('subtask-rewrite', {
            worker: worker.name,
            task: prebuiltTask,
          });
        } catch {
          /* best-effort */
        }
      }
      // Cap each worker's internal ReAct loop. Without this a single worker
      // can exhaust the parent graph's recursionLimit on repeated tool
      // calls, starving the rest of the router's budget.
      let tagged: BaseMessage;
      try {
        const result = (await agent.invoke(
          { messages: workerInput },
          { recursionLimit: params.workerRecursionLimit ?? 8 },
        )) as { messages: BaseMessage[] };
        const lastNew = result.messages[result.messages.length - 1];
        // Tag the worker-produced AI message via both `name` (human-readable)
        // and `additional_kwargs.source_agent` (survives LangGraph
        // serialisation) — the router uses the latter to compute per-turn
        // answered workers.
        tagged = isAiMessage(lastNew)
          ? new AIMessage({
              content: (lastNew as AIMessage).content,
              name: worker.name,
              additional_kwargs: {
                ...((lastNew as AIMessage).additional_kwargs ?? {}),
                source_agent: worker.name,
              },
            })
          : lastNew;
      } catch (err) {
        const msg = (err as Error).message || '';
        if (!/Recursion limit/i.test(msg)) throw err;
        tagged = new AIMessage({
          content: `(${worker.name} could not complete its task within the step budget and is handing back to the supervisor.)`,
          name: worker.name,
          additional_kwargs: { source_agent: worker.name },
        });
      }
      return {
        messages: [...state.messages, tagged],
      };
    });
  }

  // Synthesis node — after routing finishes, compose a single cohesive
  // reply in the supervisor's voice. This is what the user sees as the
  // "final answer"; raw worker outputs stay visible as debug steps but
  // aren't what the user is meant to read.
  const synthesisEnabled = params.options.finalSynthesis !== false;
  if (synthesisEnabled) {
    graph.addNode('synthesize', async (state) => {
      // Derive lastWorker from the current turn only. Guard against a
      // from==to noop handoff when no worker ran this turn (the router
      // terminated directly to synthesis).
      const fromAgent = lastWorkerThisTurn(state.messages, params.workers);
      if (fromAgent && fromAgent !== supervisorName) {
        try {
          await dispatchCustomEvent('agent-handoff', {
            from: fromAgent,
            to: supervisorName,
          });
        } catch {
          /* best-effort */
        }
      }
      const synthSystem = new SystemMessage(
        `You are ${supervisorName}. You are the ONLY voice the user hears — ` +
          'your specialists have already produced their answers as tagged AI ' +
          'messages above; the user has not seen them directly.\n\n' +
          "Compose ONE cohesive reply to the user's latest request. Rules:\n" +
          "  - Speak in your own voice (first person, warm, concise).\n" +
          '  - Use every specialist answer FROM THIS TURN that is relevant — ' +
          'verbatim facts, reformulated prose.\n' +
          '  - NEVER invent new facts. NEVER claim an action has been taken ' +
          '(booking confirmed, email sent, reservation made, payment processed, ' +
          'etc.) unless a specialist from this turn produced a tool result ' +
          'confirming it. If the user asked you to take an action and no ' +
          'specialist ran for it this turn, say "I need to re-engage the ' +
          'specialist" or ask the user to confirm — do not fabricate.\n' +
          '  - If a specialist said they had no answer, acknowledge that ' +
          'limitation honestly instead of hiding it.\n' +
          '  - If a specialist offered choices (e.g. a list of hotels), relay ' +
          "them AND ask the user's preference yourself — the specialist cannot " +
          'talk to the user.\n' +
          '  - Structure multi-part replies with short section headers or ' +
          'bullet points when helpful.',
      );
      // Mistral compatibility: last message must be a user/tool turn.
      const last = state.messages[state.messages.length - 1];
      const probe = new HumanMessage(
        'Compose the final reply to the user now.',
      );
      const input = isAiMessage(last)
        ? [synthSystem, ...state.messages, probe]
        : [synthSystem, ...state.messages];
      let finalText = '';
      try {
        const response = await params.model.invoke(input);
        finalText =
          typeof response.content === 'string'
            ? response.content
            : Array.isArray(response.content)
            ? response.content
                .map((c) => (typeof c === 'string' ? c : (c as { text?: string }).text ?? ''))
                .join('')
            : '';
      } catch (err) {
        // If synthesis itself fails, fall back to concatenating worker
        // answers so the user still gets SOMETHING. Auth errors still
        // propagate — the coordinator will turn them into an error event.
        const message = (err as Error).message || '';
        if (/\b40[13]\b|incorrect api key|unauthori[sz]ed|invalid.*api.*key/i.test(message)) {
          throw err;
        }
        finalText = state.messages
          .filter((m) => isAiMessage(m))
          .map((m) => String(m.content ?? ''))
          .join('\n\n');
      }
      return {
        messages: [
          ...state.messages,
          new AIMessage({ content: finalText, name: supervisorName }),
        ],
      };
    });
  }

  graph.addEdge(String(START), 'router');
  graph.addConditionalEdges('router', (state) => {
    if (state.next && workerNames.includes(state.next)) return state.next;
    return synthesisEnabled ? 'synthesize' : String(END);
  });
  // Loop workers back to the router so the supervisor can chain multiple
  // specialists in a single turn. The router decides when to finish.
  for (const name of workerNames) {
    graph.addEdge(name, 'router');
  }
  if (synthesisEnabled) graph.addEdge('synthesize', String(END));

  return graph.compile({ checkpointer: params.checkpointSaver });
}

interface RouterDecision {
  next: string;
  task?: string;
}

async function decideNext(
  strategy: SupervisorRoutingStrategy,
  state: SupervisorState,
  model: BaseChatModel,
  workers: AgentInfo[],
  options: SupervisorAgentOptions,
  ruleRouter?: (messages: BaseMessage[]) => string | undefined,
  delegationMode: TaskDelegationMode = 'focused',
): Promise<RouterDecision> {
  if (strategy === 'rule-based') {
    const chosen = ruleRouter?.(state.messages);
    if (!chosen) return { next: '__end__' };
    return { next: chosen };
  }
  // Pre-compute which workers have already produced an answer IN THIS TURN.
  // "This turn" means: since the most recent user message. Workers tag
  // their output via `additional_kwargs.source_agent` (which survives
  // LangGraph serialisation); we scan messages after the latest human
  // turn to build the set. State-persisted tracking would leak across
  // turns via the checkpointer and cause follow-up prompts to short-circuit
  // to END without routing anyone.
  const answered = answeredWorkersThisTurn(state.messages, workers);
  const pending = workers.filter((w) => !answered.has(w.name));
  // No pending workers left — nothing useful left to route. End the turn
  // without burning another router LLM call.
  if (pending.length === 0) return { next: '__end__' };
  const answeredList = answered.size > 0 ? [...answered].join(', ') : '(none yet)';
  const pendingList = pending.length > 0
    ? pending.map((w) => `- ${w.name}: ${w.description}`).join('\n')
    : '(none — every worker has already responded)';

  const system =
    options.systemPrompt ??
    'You are a supervisor orchestrating specialized worker agents.';
  // Combined routing + sub-task rewriting: when mode is `rewritten` and no
  // custom rewriter is supplied, we ask the router to emit both in one
  // response so we don't pay for two LLM calls per hop.
  const useCombined = delegationMode === 'rewritten' && !options.subtaskRewriter;
  const combinedInstructions = useCombined
    ? '\n\nYour reply MUST use one of these two exact formats (no other prose):\n\n' +
      '  NEXT: <WorkerName>\n' +
      '  TASK: <a single-line, self-contained instruction for that worker, ' +
      'inlining any references from earlier turns>\n\n' +
      'OR when every topic has been covered:\n' +
      '  FINISH\n'
    : '\n\nReply with exactly one worker name from the pending list, or FINISH — no other text.';
  // Hint the LLM about continuation semantics — short confirmation /
  // selection messages ("first one", "ok", "yes", "sounds good") are
  // almost always a follow-up to a prior specialist's offer and MUST be
  // routed to that specialist to take action. A deterministic fallback
  // below catches cases where the LLM still bails.
  const prefix = new SystemMessage(
    `${system}\n\n` +
      `Workers already answered this turn: ${answeredList}\n` +
      `Workers that have NOT yet answered:\n${pendingList}\n\n` +
      "Decision rule:\n" +
      "  - If the user's request mentions a topic owned by ANY worker in the " +
      'pending list, route to that worker.\n' +
      '  - If the user\'s latest message is a SHORT CONTINUATION — ' +
      'confirming ("yes", "ok", "sounds good"), selecting from a prior ' +
      'offer ("first one", "the cheaper one"), or a follow-up to an earlier ' +
      'specialist action — route to the specialist whose offer they are ' +
      'continuing. DO NOT finish: that specialist needs to take the next step.\n' +
      "  - Only reply FINISH when every topic in the user's request has been " +
      'addressed by a worker in the "already answered" list (or is outside all workers\' domains) ' +
      'AND the user has NOT asked for follow-up action.\n' +
      '  - Never re-route to a worker in the "already answered" list.' +
      combinedInstructions,
  );
  const probe = new HumanMessage(
    'Based on the conversation above, which worker should run next? Reply with a worker name or FINISH.',
  );
  // Mistral rejects requests whose last role is "assistant" (code 3230). To
  // stay provider-neutral we always end the router turn with a user probe
  // when the last state message is an AI turn. Using `_getType()` instead
  // of `instanceof AIMessage` — LangGraph serialises messages between
  // nodes so the prototype chain is not preserved.
  const last = state.messages[state.messages.length - 1];
  const needsProbe = isAiMessage(last);
  const messages = needsProbe
    ? [prefix, ...state.messages, probe]
    : [prefix, ...state.messages];

  let raw = '';
  try {
    const response = await model.invoke(messages);
    raw = typeof response.content === 'string' ? response.content : '';
  } catch (err) {
    const message = (err as Error).message || '';
    const isAuth = /\b40[13]\b|incorrect api key|unauthori[sz]ed|invalid.*api.*key/i.test(
      message,
    );
    if (isAuth) throw err;
    return { next: '__end__' };
  }

  // In combined mode the router may reply with a structured NEXT/TASK
  // block. Try to parse that first — fall back to the plain "worker name"
  // heuristic when the model doesn't honour the format.
  if (useCombined) {
    const parsed = parseRouterBlock(raw);
    if (parsed.finish) return { next: '__end__' };
    if (parsed.next) {
      const matched = pending.find(
        (w) => w.name.toLowerCase() === parsed.next!.toLowerCase(),
      );
      if (matched) return { next: matched.name, task: parsed.task };
    }
  }

  // Prefer an explicit pending-worker pick from the router's answer —
  // ignore mentions of already-answered workers (otherwise "WeatherAgent
  // has answered, FINISH" re-routes to WeatherAgent and loops).
  const explicit = pending.find((w) =>
    raw.toLowerCase().includes(w.name.toLowerCase()),
  );
  if (explicit) return { next: explicit.name };

  // Any "we're about to end" case (FINISH, empty, garbled, already-answered
  // worker) runs through the deterministic post-validator. Small / impatient
  // models tend to bail after one worker even when the user's request
  // clearly spans multiple domains — scan the user's latest message for
  // keywords from each pending worker's description and force a re-route.
  const override = postValidateFinish(state, pending);
  if (override) return { next: override };
  // Second fallback: the user may have sent a short continuation ("first
  // one", "ok", "yes") that doesn't contain any domain keywords. If the
  // previous turn ended with a specialist's offer, that same specialist
  // almost certainly needs to act on the follow-up — force-route there.
  const continuation = continuationTargetWorker(state, workers, pending);
  if (continuation) return { next: continuation };
  return { next: '__end__' };
}

/**
 * If the user's latest message is a short continuation / confirmation and
 * a prior turn ended with a specialist making an offer, return that
 * specialist so the router can route to them. The supervisor-synthesis
 * message between turns doesn't count; we walk past it to find the last
 * worker.
 */
function continuationTargetWorker(
  state: SupervisorState,
  workers: AgentInfo[],
  pending: AgentInfo[],
): string | undefined {
  const lastHuman = [...state.messages]
    .reverse()
    .find((m) => (m as { _getType?: () => string })._getType?.() === 'human');
  if (!lastHuman) return undefined;
  const text = String(lastHuman.content ?? '').trim().toLowerCase();
  // Short + continuation-shaped. Keep the heuristic tight so we don't
  // force-route every 1-line greeting.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const looksLikeContinuation =
    wordCount <= 6 ||
    /^(yes|yeah|yep|ok|okay|sure|sounds good|go ahead|please|confirm|the (first|second|third|cheaper|cheapest|priciest|best)|first|second|third|last)\b/i.test(
      text,
    );
  if (!looksLikeContinuation) return undefined;
  // Find the most recent worker-tagged AI message anywhere in history
  // (not just this turn — the offer typically came in the previous turn).
  const names = new Set(workers.map((w) => w.name));
  const pendingNames = new Set(pending.map((w) => w.name));
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const m = state.messages[i] as {
      additional_kwargs?: { source_agent?: string };
      name?: string;
    };
    const tag = m.additional_kwargs?.source_agent ?? m.name;
    if (tag && names.has(tag) && pendingNames.has(tag)) return tag;
  }
  return undefined;
}

/**
 * Returns the worker whose tagged AI message is most recent THIS TURN —
 * i.e. the last worker to have handed back to the supervisor. Used for
 * handoff labels without tracking a stateful `lastWorker` channel that
 * would leak across turns via the checkpointer.
 */
export function lastWorkerThisTurn(
  messages: BaseMessage[],
  workers: AgentInfo[],
): string | undefined {
  const names = new Set(workers.map((w) => w.name));
  // Walk backwards until we hit a human turn boundary or exhaust.
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as {
      _getType?: () => string;
      additional_kwargs?: { source_agent?: string };
      name?: string;
    };
    const t = m._getType?.();
    if (t === 'human') return undefined;
    const tag = m.additional_kwargs?.source_agent ?? m.name;
    if (tag && names.has(tag)) return tag;
  }
  return undefined;
}

/**
 * Computes which workers have produced an answer since the latest user
 * message. Uses `additional_kwargs.source_agent` which is the tag each
 * worker node stamps on its output — unlike `name`, that field always
 * survives LangGraph's message serialisation.
 */
export function answeredWorkersThisTurn(
  messages: BaseMessage[],
  workers: AgentInfo[],
): Set<string> {
  const names = new Set(workers.map((w) => w.name));
  // Walk backwards from the end and stop at the latest human turn — the
  // AI messages encountered before stopping are "this turn's answers".
  const turnStart = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      const t = (m as { _getType?: () => string })._getType?.();
      if (t === 'human') return i + 1; // first message AFTER the human
    }
    return 0;
  })();
  const answered = new Set<string>();
  for (let i = turnStart; i < messages.length; i += 1) {
    const msg = messages[i] as {
      additional_kwargs?: { source_agent?: string };
      name?: string;
    };
    const tag =
      msg.additional_kwargs?.source_agent ?? (msg.name as string | undefined);
    if (tag && names.has(tag)) answered.add(tag);
  }
  return answered;
}

/**
 * Parses the router's combined NEXT/TASK block:
 *   NEXT: <WorkerName>
 *   TASK: <instruction>
 * Tolerates whitespace and markdown fences; returns both fields when
 * present, or a `finish` flag when the model said FINISH. Exported for
 * unit tests — the logic is isolated enough to exercise directly.
 */
export function parseRouterBlock(raw: string): {
  next?: string;
  task?: string;
  finish?: boolean;
} {
  if (/^\s*FINISH\s*$/im.test(raw)) return { finish: true };
  const nextMatch = raw.match(/NEXT\s*:\s*([A-Za-z0-9_-]+)/i);
  const taskMatch = raw.match(/TASK\s*:\s*([\s\S]+?)(?:\n\s*$|$)/i);
  const next = nextMatch?.[1]?.trim();
  const task = taskMatch?.[1]?.trim().replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  return { next, task };
}

/**
 * Heuristic: checks whether the user's latest request still mentions a
 * topic owned by a worker that hasn't answered yet. Derives keywords from
 * each worker's description (words of 4+ chars), matches against the user's
 * lowercased message. Returns the first pending worker whose keyword
 * appears; undefined if none match.
 */
function postValidateFinish(
  state: SupervisorState,
  pending: AgentInfo[],
): string | undefined {
  // Find the latest HUMAN message — that's what drives the turn's intent.
  const lastHuman = [...state.messages]
    .reverse()
    .find((m) => (m as { _getType?: () => string })._getType?.() === 'human');
  if (!lastHuman) return undefined;
  const text = String(lastHuman.content ?? '').toLowerCase();
  if (!text) return undefined;
  for (const worker of pending) {
    const keywords = deriveKeywords(worker.description);
    if (keywords.some((kw) => text.includes(kw))) return worker.name;
  }
  return undefined;
}

/**
 * Pulls word-level keywords out of a description. Filters short / common
 * stopwords. Each worker's description typically enumerates its domains
 * ("weather and forecasts", "hotels and reservations", …) so this works
 * well for route-selection without bespoke vocab maps.
 */
const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'that', 'this', 'are', 'from', 'has', 'have',
  'into', 'questions', 'answers', 'answers.', 'request', 'requests',
  'information', 'general',
]);
function deriveKeywords(description: string): string[] {
  const tokens = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  // Include simple singular/plural hops so "hotels" in description matches
  // "hotel" in user text and vice versa.
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    if (t.endsWith('s')) out.add(t.slice(0, -1));
    else out.add(t + 's');
  }
  return [...out];
}

/**
 * Robust check for "this message is an AIMessage". LangGraph can strip the
 * class prototype when shuttling state between nodes, so `instanceof`
 * returns false for worker-produced messages on subsequent router ticks.
 * `_getType()` is part of LangChain's serialisable message contract and
 * survives the round-trip.
 */
function isAiMessage(message: BaseMessage | undefined): boolean {
  if (!message) return false;
  if (message instanceof AIMessage) return true;
  const getType = (message as { _getType?: () => string })._getType;
  return typeof getType === 'function' && getType.call(message) === 'ai';
}

/**
 * Builds the message list handed to a worker's ReAct sub-agent, per the
 * supervisor's `taskDelegation` policy. Returns an array that the worker
 * will treat as the conversation history for its run.
 *
 * Exported for unit tests — the logic is mode-specific and decoupling it
 * from the graph plumbing makes strategy assertions cheap.
 */
export async function buildWorkerInput(args: {
  mode: TaskDelegationMode;
  worker: AgentInfo;
  messages: BaseMessage[];
  model: BaseChatModel;
  rewriter: SubtaskRewriter;
}): Promise<BaseMessage[]> {
  const { mode, worker, messages, model, rewriter } = args;

  if (mode === 'full-context') {
    return messages;
  }

  if (mode === 'focused') {
    // Inject a per-turn reminder right before the worker runs. The reminder
    // lives as a trailing SystemMessage so it takes priority over earlier
    // context without mutating the original conversation history.
    const focus = new SystemMessage(
      `Supervisor directive: for this turn, respond ONLY to the part of the ` +
        `user's request that falls within your domain (${worker.name}: ${worker.description}). ` +
        `Do NOT address anything outside that — another specialist will handle the rest.`,
    );
    return [...messages, focus];
  }

  // mode === 'rewritten' — pure self-contained sub-task.
  const task = await rewriter({
    messages,
    worker: worker.name,
    workerDescription: worker.description,
    model,
  });
  try {
    await dispatchCustomEvent('subtask-rewrite', {
      worker: worker.name,
      task,
    });
  } catch {
    // Event dispatch is best-effort.
  }
  return [new HumanMessage(task)];
}

/**
 * Default rewriter: asks the supervisor model to extract a focused,
 * self-contained task for the chosen worker. The prompt is explicit about
 * inlining references ("that hotel" → "Hotel Moderne") so the worker does
 * not need access to the rest of the conversation.
 */
async function defaultSubtaskRewriter(args: {
  messages: BaseMessage[];
  worker: string;
  workerDescription: string;
  model: BaseChatModel;
}): Promise<string> {
  const { messages, worker, workerDescription, model } = args;
  const system = new SystemMessage(
    `You are preparing a self-contained task for the "${worker}" specialist ` +
      `(domain: ${workerDescription}).\n\n` +
      'Rewrite the user request as a single focused instruction that this ' +
      'specialist can execute WITHOUT seeing the rest of the conversation. ' +
      'Inline any references — if the user said "that hotel" resolve it to ' +
      'the concrete name from prior turns. Include only the part of the ' +
      "request that falls within the specialist's domain. Output only the " +
      'instruction, no preamble, no quotes.',
  );
  // Reuse the router's Mistral-safe message shaping.
  const last = messages[messages.length - 1];
  const probe = new HumanMessage(
    `Produce the focused task for the ${worker} specialist now.`,
  );
  const needsProbe = isAiMessage(last);
  const input = needsProbe ? [system, ...messages, probe] : [system, ...messages];
  const response = await model.invoke(input);
  const raw = typeof response.content === 'string' ? response.content : '';
  return raw.trim();
}
