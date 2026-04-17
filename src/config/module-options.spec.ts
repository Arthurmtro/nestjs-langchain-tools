import {
  LangChainToolsModuleOptions,
  ModuleOptionsValidationError,
  validateModuleOptions,
} from './module-options';
import { ModelProvider } from '../interfaces/agent.interface';

describe('validateModuleOptions', () => {
  it('returns an instance for empty input', () => {
    const result = validateModuleOptions(undefined);
    expect(result).toBeInstanceOf(LangChainToolsModuleOptions);
  });

  it('accepts valid options', () => {
    const result = validateModuleOptions({
      coordinatorModel: 'gpt-4o',
      coordinatorProvider: ModelProvider.ANTHROPIC,
      coordinatorTemperature: 0.4,
      coordinatorUseMemory: true,
      maxMessagesPerSession: 50,
    });
    expect(result.coordinatorProvider).toBe(ModelProvider.ANTHROPIC);
    expect(result.coordinatorTemperature).toBe(0.4);
  });

  it('rejects a bogus provider', () => {
    expect(() =>
      validateModuleOptions({
        coordinatorProvider: 'bogus' as never,
      }),
    ).toThrow(ModuleOptionsValidationError);
  });

  it('rejects a temperature above the allowed range', () => {
    try {
      validateModuleOptions({ coordinatorTemperature: 3 });
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ModuleOptionsValidationError);
      expect((err as ModuleOptionsValidationError).issues.join(' ')).toContain(
        'coordinatorTemperature',
      );
    }
  });

  it('passes through functions and class instances without stripping them', () => {
    const onToken = jest.fn();
    const result = validateModuleOptions({ onToken });
    expect(result.onToken).toBe(onToken);
  });
});
