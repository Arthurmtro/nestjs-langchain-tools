import { ConfigurableModuleBuilder } from '@nestjs/common';
import { LangChainToolsModuleOptions } from './module-options';

/**
 * Dynamic module builder for {@link LangChainToolsModule}.
 *
 * Exposes `forRoot` / `forRootAsync` with the standard Nest configurable-module
 * ergonomics (useFactory / useClass / useExisting / inject).
 *
 * Consumers inject options via the token {@link MODULE_OPTIONS_TOKEN}.
 * For backward compatibility the token is also re-exported as
 * `LANGCHAIN_TOOLS_OPTIONS` from the module barrel.
 */
export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<LangChainToolsModuleOptions>()
  .setClassMethodName('forRoot')
  .setExtras(
    { isGlobal: true },
    (definition, extras) => ({
      ...definition,
      global: extras.isGlobal ?? true,
    }),
  )
  .build();
