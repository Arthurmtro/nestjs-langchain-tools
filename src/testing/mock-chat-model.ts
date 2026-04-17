import { SimpleChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type {
  BaseLanguageModelCallOptions,
} from '@langchain/core/language_models/base';

export interface MockToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export type MockScript =
  | string
  | { content: string }
  | { toolCalls: MockToolCall[] }
  | { delayMs: number; content: string };

export interface MockChatModelOptions {
  /**
   * Ordered list of responses returned on successive `invoke()` calls.
   * After the list is exhausted the last element is repeated.
   *
   * Each script entry is either:
   * - a plain string → returned as AI content
   * - `{ content }` → same as above, explicit form
   * - `{ toolCalls }` → returns an AIMessage with tool_calls (simulate
   *   tool-calling flow without hitting a real LLM)
   * - `{ delayMs, content }` → simulate latency
   */
  script?: MockScript[];
  /** Deprecated alias for `script`. Retained for v0.2 compatibility. */
  responses?: string[];
  /**
   * Dynamic responder. Receives the incoming messages and returns the reply.
   * Takes precedence over `script` / `responses` when provided.
   */
  responder?: (messages: BaseMessage[]) => string | Promise<string>;
}

/**
 * Deterministic offline chat model for unit tests. Extends LangChain's
 * `SimpleChatModel` so it plugs into the same call sites as the real
 * `ChatOpenAI` / `ChatAnthropic` without hitting the network.
 *
 * Tool-calling behavior is intentionally minimal — tests that need tool
 * invocations should construct their own response strings, or use the
 * `responder` hook to return structured content.
 */
export class MockChatModel extends SimpleChatModel {
  readonly calls: Array<{ messages: BaseMessage[] }> = [];
  private cursor = 0;
  private readonly mockOptions: MockChatModelOptions;

  constructor(options: MockChatModelOptions = {}) {
    super({});
    this.mockOptions = options;
  }

  _llmType(): string {
    return 'mock-chat';
  }

  async _call(
    messages: BaseMessage[],
    _options?: BaseLanguageModelCallOptions,
  ): Promise<string> {
    this.calls.push({ messages });
    if (this.mockOptions.responder) {
      return this.mockOptions.responder(messages);
    }
    const step = this.peekStep();
    if (typeof step === 'string') return step;
    if (step && 'content' in step) {
      if ('delayMs' in step && step.delayMs > 0) {
        await new Promise((r) => setTimeout(r, step.delayMs));
      }
      return step.content;
    }
    return 'OK';
  }

  /**
   * Returns the next scripted step, advancing the cursor. Used by tests
   * that need to assert on the scripted plan (see `assertCalledWith`).
   */
  private peekStep(): MockScript | undefined {
    const script =
      this.mockOptions.script ??
      (this.mockOptions.responses?.map<MockScript>((r) => r) ?? []);
    if (script.length === 0) return undefined;
    const step = script[Math.min(this.cursor, script.length - 1)];
    this.cursor += 1;
    return step;
  }

  /** Assertion helper — throws if the model received no calls matching `matcher`. */
  assertCalledWith(matcher: (messages: BaseMessage[]) => boolean): void {
    if (!this.calls.some((c) => matcher(c.messages))) {
      throw new Error(
        `MockChatModel did not receive any call matching the matcher (observed ${this.calls.length} calls).`,
      );
    }
  }

  /** Resets the call log and script cursor. */
  reset(): void {
    this.calls.length = 0;
    this.cursor = 0;
  }
}
