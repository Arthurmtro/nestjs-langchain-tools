export interface ModelPricing {
  /** USD cost per 1 million prompt tokens. */
  promptPerMillion: number;
  /** USD cost per 1 million completion tokens. */
  completionPerMillion: number;
}

/**
 * Reference pricing table. Values are in USD/million tokens and reflect the
 * public pricing pages of OpenAI / Anthropic / Mistral at the time of
 * writing. Override per deployment via `LangChainToolsModuleOptions.pricing`
 * — the defaults are a reasonable starting point for cost telemetry, not a
 * contractual guarantee.
 */
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { promptPerMillion: 2.5, completionPerMillion: 10 },
  'gpt-4o-mini': { promptPerMillion: 0.15, completionPerMillion: 0.6 },
  'gpt-4-turbo': { promptPerMillion: 10, completionPerMillion: 30 },
  'gpt-4': { promptPerMillion: 30, completionPerMillion: 60 },
  'gpt-3.5-turbo': { promptPerMillion: 0.5, completionPerMillion: 1.5 },

  // Anthropic
  'claude-3-7-sonnet-latest': { promptPerMillion: 3, completionPerMillion: 15 },
  'claude-3-5-sonnet-latest': { promptPerMillion: 3, completionPerMillion: 15 },
  'claude-3-opus-latest': { promptPerMillion: 15, completionPerMillion: 75 },
  'claude-3-haiku-20240307': { promptPerMillion: 0.25, completionPerMillion: 1.25 },

  // Mistral
  'mistral-large-latest': { promptPerMillion: 2, completionPerMillion: 6 },
  'mistral-medium-latest': { promptPerMillion: 0.4, completionPerMillion: 2 },
  'mistral-small-latest': { promptPerMillion: 0.2, completionPerMillion: 0.6 },

  // xAI Grok
  'grok-4': { promptPerMillion: 5, completionPerMillion: 15 },
  'grok-4-mini': { promptPerMillion: 0.2, completionPerMillion: 0.8 },
  'grok-3': { promptPerMillion: 3, completionPerMillion: 15 },
  'grok-3-mini': { promptPerMillion: 0.3, completionPerMillion: 0.5 },
  'grok-2': { promptPerMillion: 2, completionPerMillion: 10 },
  'grok-beta': { promptPerMillion: 5, completionPerMillion: 15 },

  // Local / free
  'llama3.1': { promptPerMillion: 0, completionPerMillion: 0 },
  'mock-chat': { promptPerMillion: 0, completionPerMillion: 0 },
};

export interface CostBreakdown {
  model: string;
  promptUsd: number;
  completionUsd: number;
  totalUsd: number;
}

export function computeCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  pricing: Record<string, ModelPricing> = DEFAULT_PRICING,
): CostBreakdown {
  const entry = pricing[model] ?? { promptPerMillion: 0, completionPerMillion: 0 };
  const promptUsd = (promptTokens / 1_000_000) * entry.promptPerMillion;
  const completionUsd =
    (completionTokens / 1_000_000) * entry.completionPerMillion;
  return {
    model,
    promptUsd,
    completionUsd,
    totalUsd: promptUsd + completionUsd,
  };
}
