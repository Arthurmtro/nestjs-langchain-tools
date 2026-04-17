import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import type { TokenUsageService } from './token-usage.service';

/**
 * LangChain callback handler that forwards `llmOutput.tokenUsage` to a
 * {@link TokenUsageService}. Attach it to a model via `callbacks`:
 *
 * ```ts
 * new ChatOpenAI({ callbacks: [new TokenUsageCallback(service)] })
 * ```
 */
export class TokenUsageCallback extends BaseCallbackHandler {
  name = 'token-usage-callback';

  /**
   * Model name observed at `handleLLMStart` keyed by runId. Many providers
   * (notably xAI via ChatOpenAI and some Anthropic builds) do NOT populate
   * `llmOutput.model_name` on streamed responses, so we capture the name
   * from the invocation params on start and use it as a last resort.
   */
  private readonly seenModels = new Map<string, string>();

  constructor(
    private readonly service: TokenUsageService,
    private readonly agent?: string,
    private readonly fallbackModel?: string,
  ) {
    super();
  }

  async handleLLMStart(
    llm: Serialized,
    _prompts: string[],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>,
  ): Promise<void> {
    const invocation = extraParams?.invocation_params as
      | { model?: string; model_name?: string; modelName?: string }
      | undefined;
    const fromLlm = (llm as { kwargs?: { model?: string; modelName?: string } } | undefined)
      ?.kwargs;
    const model =
      invocation?.model ??
      invocation?.model_name ??
      invocation?.modelName ??
      fromLlm?.model ??
      fromLlm?.modelName;
    if (model) this.seenModels.set(runId, model);
  }

  async handleLLMEnd(output: LLMResult, runId?: string): Promise<void> {
    const usage = (output.llmOutput?.tokenUsage ?? output.llmOutput?.usage_metadata) as
      | {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
        }
      | undefined;
    if (!usage) return;
    const seenModel = runId ? this.seenModels.get(runId) : undefined;
    if (runId) this.seenModels.delete(runId);
    const model =
      (output.llmOutput?.model_name as string | undefined) ??
      (output.llmOutput?.model as string | undefined) ??
      seenModel ??
      this.fallbackModel ??
      'unknown';
    this.service.record({
      model,
      promptTokens: usage.promptTokens ?? usage.input_tokens ?? 0,
      completionTokens: usage.completionTokens ?? usage.output_tokens ?? 0,
      totalTokens:
        usage.totalTokens ??
        usage.total_tokens ??
        (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
      agent: this.agent,
    });
  }
}
