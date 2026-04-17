import { Test } from '@nestjs/testing';
import { LangChainToolsModule } from './langchain-tools.module';
import { MODULE_OPTIONS_TOKEN } from '../config/configurable-module';
import { ModuleOptionsValidationError } from '../config/module-options';
import { LLM_FACTORY } from '../llm/llm-factory.provider';
import { SESSION_STORE } from '../memory/session-store.interface';
import { TOOL_AUTHORIZER } from '../authorization/tool-authorizer.interface';
import { VECTOR_STORE } from '../vector-stores/vector-store.provider';
import { ModelProvider } from '../interfaces/agent.interface';

describe('LangChainToolsModule', () => {
  it('forRoot validates options and exposes the options token', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LangChainToolsModule.forRoot({
          coordinatorModel: 'gpt-4o',
          coordinatorProvider: ModelProvider.OPENAI,
        }),
      ],
    }).compile();
    const options = moduleRef.get(MODULE_OPTIONS_TOKEN);
    expect(options.coordinatorModel).toBe('gpt-4o');
  });

  it('forRoot throws on invalid options', () => {
    expect(() =>
      LangChainToolsModule.forRoot({ coordinatorTemperature: 10 as never }),
    ).toThrow(ModuleOptionsValidationError);
  });

  it('forRootAsync validates options resolved from the factory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LangChainToolsModule.forRootAsync({
          useFactory: async () => ({
            coordinatorProvider: ModelProvider.ANTHROPIC,
            coordinatorTemperature: 0.2,
          }),
        }),
      ],
    }).compile();
    const options = moduleRef.get(MODULE_OPTIONS_TOKEN);
    expect(options.coordinatorProvider).toBe(ModelProvider.ANTHROPIC);
  });

  it('forRootAsync surfaces validation errors from the factory result', async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          LangChainToolsModule.forRootAsync({
            useFactory: async () => ({ coordinatorTemperature: 99 as never }),
          }),
        ],
      }).compile(),
    ).rejects.toThrow(ModuleOptionsValidationError);
  });

  it('wires default LLM, session, authorizer and vector-store providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LangChainToolsModule.forRoot({})],
    }).compile();
    expect(typeof moduleRef.get(LLM_FACTORY)).toBe('function');
    expect(moduleRef.get(SESSION_STORE)).toBeDefined();
    expect(moduleRef.get(TOOL_AUTHORIZER)).toBeDefined();
    expect(moduleRef.get(VECTOR_STORE)).toBeDefined();
  });
});
