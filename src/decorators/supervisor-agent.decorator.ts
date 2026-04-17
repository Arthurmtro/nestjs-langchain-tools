import { SetMetadata } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';

export const SUPERVISOR_AGENT_METADATA = 'langchain:supervisor-agent';

export type SupervisorRoutingStrategy = 'llm' | 'rule-based';

/**
 * How the supervisor prepares input for each worker invocation.
 *
 *  - `full-context` (cheapest): the worker sees the entire conversation,
 *    warts and all. Best for cheap/fast runs; worst for overreach.
 *  - `focused` (recommended default): the worker still sees the full
 *    conversation, but the graph injects a per-turn `SystemMessage`
 *    reminding it to only address the part of the request in its domain.
 *  - `rewritten` (strongest): the supervisor runs an extra LLM pass to
 *    reformulate the user's multi-part request into a self-contained
 *    sub-task, then hands only that sub-task to the worker. Highest quality,
 *    ~2x the LLM cost per hop.
 */
export type TaskDelegationMode = 'full-context' | 'focused' | 'rewritten';

/**
 * User-provided rewriter for `taskDelegation: 'rewritten'`. If omitted,
 * buildSupervisor uses a default implementation that calls the supervisor
 * LLM to produce a focused sub-task.
 */
export type SubtaskRewriter = (args: {
  messages: BaseMessage[];
  worker: string;
  workerDescription: string;
  model: BaseChatModel;
}) => string | Promise<string>;

export interface SupervisorAgentOptions {
  /** Human-readable name for the supervisor (used in telemetry / tool naming). */
  name: string;

  /** Optional description (used in logs). */
  description?: string;

  /** System prompt guiding the supervisor's routing decisions. */
  systemPrompt?: string;

  /**
   * Worker agent names. Must match `@ToolsAgent({ name })` registered
   * elsewhere in the application. The supervisor delegates to one of
   * these workers per turn.
   */
  workers: string[];

  /**
   * Routing strategy. `llm` uses the supervisor's LLM to pick a worker
   * by name; `rule-based` expects a `route()` method on the decorated class
   * returning the chosen worker name.
   */
  routingStrategy?: SupervisorRoutingStrategy;

  /**
   * When the supervisor should stop. `final_answer` runs until a worker
   * emits content without further tool calls; `max_iterations` caps the
   * number of worker invocations.
   */
  terminateOn?:
    | { kind: 'final_answer' }
    | { kind: 'max_iterations'; limit: number };

  /**
   * How much context / focus each worker receives per invocation.
   * Defaults to `'focused'` — see {@link TaskDelegationMode}.
   */
  taskDelegation?: TaskDelegationMode;

  /** Custom rewriter used only when `taskDelegation` is `'rewritten'`. */
  subtaskRewriter?: SubtaskRewriter;

  /**
   * When `true` (default) the supervisor runs a final synthesis LLM call
   * after all workers have responded, producing ONE cohesive reply in its
   * own voice. Set to `false` to return raw worker outputs directly — the
   * last worker speaks to the user.
   */
  finalSynthesis?: boolean;
}

/**
 * Class decorator that registers a multi-agent supervisor built on a
 * LangGraph `StateGraph`. The supervisor node decides which worker to
 * dispatch to on each turn; worker nodes return their output which the
 * supervisor either finalises or loops on.
 *
 * @example
 * ```ts
 * @Injectable()
 * @SupervisorAgent({
 *   name: 'TravelOrchestrator',
 *   workers: ['WeatherAgent', 'BookingAgent'],
 *   routingStrategy: 'llm',
 *   systemPrompt: 'Pick the best worker for each sub-task.',
 * })
 * export class TravelSupervisor {}
 * ```
 */
export const SupervisorAgent = (
  options: SupervisorAgentOptions,
): ClassDecorator => SetMetadata(SUPERVISOR_AGENT_METADATA, options);
