import { Injectable } from '@nestjs/common';
import { ModelProvider } from '../../src/interfaces/agent.interface';

export interface RuntimeModelConfig {
  provider: ModelProvider;
  modelName: string;
  apiKey?: string;
  temperature?: number;
}

export type RuntimeModelOverride = Partial<RuntimeModelConfig>;

export interface RuntimeConfigSnapshot {
  default: RuntimeModelConfig;
  overrides: Record<string, RuntimeModelOverride>;
}

/**
 * Single-process store for the model configuration chosen via the demo UI.
 * Holds a default config plus optional per-agent overrides — a sub-agent
 * inherits the default unless explicitly overridden.
 */
@Injectable()
export class RuntimeConfigService {
  private defaultConfig: RuntimeModelConfig = {
    provider: ModelProvider.OPENAI,
    modelName: 'gpt-4o-mini',
    temperature: 0.2,
  };

  private overrides: Record<string, RuntimeModelOverride> = {};

  get(): RuntimeModelConfig {
    return { ...this.defaultConfig };
  }

  snapshot(): RuntimeConfigSnapshot {
    return {
      default: { ...this.defaultConfig },
      overrides: Object.fromEntries(
        Object.entries(this.overrides).map(([k, v]) => [k, { ...v }]),
      ),
    };
  }

  getForAgent(agentName?: string): RuntimeModelConfig {
    if (!agentName) return { ...this.defaultConfig };
    const override = this.overrides[agentName];
    return { ...this.defaultConfig, ...(override ?? {}) };
  }

  set(config: Partial<RuntimeModelConfig>): RuntimeModelConfig {
    this.defaultConfig = { ...this.defaultConfig, ...config };
    return this.get();
  }

  setOverride(
    agentName: string,
    override: RuntimeModelOverride,
  ): RuntimeModelOverride {
    const existing = this.overrides[agentName] ?? {};
    const next = { ...existing, ...override };
    if (
      next.provider === undefined &&
      next.modelName === undefined &&
      next.apiKey === undefined &&
      next.temperature === undefined
    ) {
      delete this.overrides[agentName];
      return {};
    }
    this.overrides[agentName] = next;
    return { ...next };
  }

  clearOverride(agentName: string): void {
    delete this.overrides[agentName];
  }

  reset(): void {
    this.defaultConfig = {
      provider: ModelProvider.OPENAI,
      modelName: 'gpt-4o-mini',
      temperature: 0.2,
    };
    this.overrides = {};
  }
}

/** Catalogue surfaced by the UI to populate its model picker. */
export const MODEL_CATALOGUE: Array<{
  provider: ModelProvider;
  label: string;
  apiKeyHint: string;
  models: Array<{ id: string; label: string; notes?: string }>;
}> = [
  {
    provider: ModelProvider.OPENAI,
    label: 'OpenAI',
    apiKeyHint: 'sk-...',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', notes: 'Flagship' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', notes: 'Cheap & fast' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
  },
  {
    provider: ModelProvider.ANTHROPIC,
    label: 'Anthropic',
    apiKeyHint: 'sk-ant-...',
    models: [
      { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet', notes: 'Best reasoning' },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', notes: 'Cheap & fast' },
    ],
  },
  {
    provider: ModelProvider.MISTRAL,
    label: 'Mistral',
    apiKeyHint: 'mistral key',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large', notes: 'Flagship' },
      { id: 'mistral-medium-latest', label: 'Mistral Medium', notes: 'Balanced' },
      { id: 'mistral-small-latest', label: 'Mistral Small', notes: 'Cheap & fast' },
    ],
  },
  {
    provider: ModelProvider.GROK,
    label: 'xAI Grok',
    apiKeyHint: 'xai-...',
    models: [
      { id: 'grok-4', label: 'Grok 4', notes: 'Flagship' },
      { id: 'grok-4-mini', label: 'Grok 4 mini', notes: 'Cheap & fast' },
      { id: 'grok-3-mini', label: 'Grok 3 mini' },
    ],
  },
  {
    provider: ModelProvider.LLAMA,
    label: 'Ollama (local)',
    apiKeyHint: 'no key needed',
    models: [
      { id: 'llama3.1', label: 'Llama 3.1 (local)' },
      { id: 'llama3.2', label: 'Llama 3.2 (local)' },
    ],
  },
];
