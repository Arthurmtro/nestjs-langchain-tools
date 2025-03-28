import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ToolDiscoveryService } from '../services/tool-discovery.service';
import { AgentDiscoveryService } from '../services/agent-discovery.service';
import { CoordinatorService } from '../services/coordinator.service';

export interface LangChainToolsModuleOptions {
  coordinatorPrompt?: string;
}

@Module({
  imports: [DiscoveryModule],
  providers: [ToolDiscoveryService, AgentDiscoveryService, CoordinatorService],
  exports: [ToolDiscoveryService, AgentDiscoveryService, CoordinatorService],
})
export class LangChainToolsModule {
  static forRoot(options?: LangChainToolsModuleOptions): DynamicModule {
    const optionsProvider = {
      provide: 'LANGCHAIN_TOOLS_OPTIONS',
      useValue: options || {},
    };

    return {
      module: LangChainToolsModule,
      global: true,
      providers: [optionsProvider],
      exports: [optionsProvider],
    };
  }

  static forFeature(): DynamicModule {
    return {
      module: LangChainToolsModule,
    };
  }
}