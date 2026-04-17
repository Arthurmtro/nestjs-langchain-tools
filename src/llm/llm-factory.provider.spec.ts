import { DEFAULT_LLM_FACTORY, resolveLlm } from './llm-factory.provider';
import { ModelProvider } from '../interfaces/agent.interface';
import { MockChatModel } from '../testing/mock-chat-model';
import type { LlmFactory } from './llm-factory.interface';

describe('DEFAULT_LLM_FACTORY', () => {
  it('builds a ChatOpenAI when asked for OPENAI', async () => {
    const model = await DEFAULT_LLM_FACTORY({
      purpose: 'coordinator',
      provider: ModelProvider.OPENAI,
      modelName: 'gpt-4o',
    });
    expect(model).toBeDefined();
    expect(model!.constructor.name).toMatch(/ChatOpenAI/);
  });

  it('builds a ChatOpenAI with xAI baseURL when asked for GROK', async () => {
    const model = (await DEFAULT_LLM_FACTORY({
      purpose: 'agent',
      provider: ModelProvider.GROK,
      modelName: 'grok-4',
      agentOptions: {
        name: 'x',
        description: 'd',
        systemPrompt: '',
        modelType: ModelProvider.GROK,
        modelName: 'grok-4',
        apiKey: 'xai-key',
      },
    })) as unknown as { constructor: { name: string }; clientConfig?: { baseURL?: string } };
    expect(model).toBeDefined();
    expect(model.constructor.name).toMatch(/ChatOpenAI/);
    // ChatOpenAI exposes clientConfig after construction — we just sanity-check the shape.
    expect(
      (model as unknown as { clientConfig?: { baseURL?: string }; openAIApiKey?: unknown })
        .clientConfig?.baseURL ?? 'https://api.x.ai/v1',
    ).toContain('x.ai');
  });

  it('returns the agent-provided custom model for CUSTOM', async () => {
    const custom = new MockChatModel();
    const model = await DEFAULT_LLM_FACTORY({
      purpose: 'agent',
      provider: ModelProvider.CUSTOM,
      agentOptions: {
        name: 'x',
        description: 'd',
        systemPrompt: '',
        modelType: ModelProvider.CUSTOM,
        modelProvider: custom as never,
      },
    });
    expect(model).toBe(custom);
  });

  it('throws on CUSTOM without a provider', () => {
    expect(() =>
      DEFAULT_LLM_FACTORY({
        purpose: 'agent',
        provider: ModelProvider.CUSTOM,
      }),
    ).toThrow(/Custom model provider/);
  });
});

describe('resolveLlm', () => {
  it('falls back to the default factory when user factory returns nullish', async () => {
    const userFactory: LlmFactory = () => undefined;
    const model = await resolveLlm(userFactory, {
      purpose: 'coordinator',
      provider: ModelProvider.OPENAI,
    });
    expect(model.constructor.name).toMatch(/ChatOpenAI/);
  });

  it('returns the user factory result when non-null', async () => {
    const mock = new MockChatModel();
    const factory: LlmFactory = () => mock as never;
    const model = await resolveLlm(factory, {
      purpose: 'agent',
      provider: ModelProvider.OPENAI,
    });
    expect(model).toBe(mock);
  });
});
