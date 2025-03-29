import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ToolDiscoveryService } from '../services/tool-discovery.service';
import { AgentDiscoveryService } from '../services/agent-discovery.service';
import { CoordinatorService } from '../services/coordinator.service';
import { MemoryService } from '../services/memory.service';
import { VectorStoreService } from '../services/vector-store.service';
import { LangChainToolsModuleOptions } from '../interfaces/module.interface';

/**
 * Module token for dependency injection
 * @internal
 */
export const LANGCHAIN_TOOLS_OPTIONS = 'LANGCHAIN_TOOLS_OPTIONS';

/**
 * NestJS module for integrating LangChain agents and tools
 */
@Module({
  imports: [DiscoveryModule],
  providers: [
    ToolDiscoveryService, 
    AgentDiscoveryService, 
    CoordinatorService, 
    MemoryService,
    VectorStoreService
  ],
  exports: [
    ToolDiscoveryService, 
    AgentDiscoveryService, 
    CoordinatorService, 
    MemoryService,
    VectorStoreService
  ],
})
export class LangChainToolsModule {
  /**
   * Configures the LangChainTools module globally with custom options
   * 
   * @param options - Configuration options for the module
   * @returns A dynamic module configuration
   * 
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     LangChainToolsModule.forRoot({
   *       coordinatorPrompt: 'You are a helpful assistant...',
   *       coordinatorModel: 'gpt-4-turbo',
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRoot(options?: LangChainToolsModuleOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: LANGCHAIN_TOOLS_OPTIONS,
      useValue: options || {},
    };

    return {
      module: LangChainToolsModule,
      global: true,
      providers: [optionsProvider],
      exports: [optionsProvider],
    };
  }

  /**
   * Configures the LangChainTools module for a feature module
   * 
   * @returns A dynamic module configuration
   */
  static forFeature(): DynamicModule {
    return {
      module: LangChainToolsModule,
    };
  }
}