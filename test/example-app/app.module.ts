import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { LangChainToolsModule } from '../../src/modules/langchain-tools.module';
import { ModelProvider } from '../../src/interfaces/agent.interface';
import type {
  LlmFactory,
  LlmFactoryContext,
} from '../../src/llm/llm-factory.interface';
import { AppController } from './app.controller';
import { RuntimeConfigService } from './runtime-config.service';
import { WeatherAgent } from './agents/weather.agent';
import { BookingAgent } from './agents/booking.agent';
import { KnowledgeAgent } from './agents/knowledge.agent';
import { TravelSupervisor } from './agents/travel-supervisor';

const runtimeConfig = new RuntimeConfigService();

/**
 * Dynamic LLM factory that reads the user's choice from the runtime config
 * service. This lets the demo UI switch model / provider / API key
 * without restarting the app.
 */
const llmFactory: LlmFactory = (ctx: LlmFactoryContext) => {
  const cfg = runtimeConfig.getForAgent(ctx.agentOptions?.name);
  const callbacks = ctx.callbacks;
  const streaming = ctx.streaming ?? false;
  // Runtime config (what the user picked in the UI) wins over the
  // coordinator's defaults — otherwise the default `gpt-4o` would
  // override a user's `grok-4` / `claude-*` choice.
  const temperature = cfg.temperature ?? ctx.temperature ?? 0.2;
  const modelName = cfg.modelName ?? ctx.modelName;

  switch (cfg.provider) {
    case ModelProvider.OPENAI:
      return new ChatOpenAI({
        model: modelName,
        temperature,
        apiKey: cfg.apiKey,
        streaming,
        callbacks,
      });
    case ModelProvider.ANTHROPIC:
      return new ChatAnthropic({
        model: modelName,
        temperature,
        apiKey: cfg.apiKey,
        streaming,
        callbacks,
      });
    case ModelProvider.MISTRAL:
      return new ChatMistralAI({
        model: modelName,
        temperature,
        apiKey: cfg.apiKey,
        streaming,
        callbacks,
      });
    case ModelProvider.GROK:
      return new ChatOpenAI({
        model: modelName,
        temperature,
        apiKey: cfg.apiKey,
        configuration: { baseURL: 'https://api.x.ai/v1' },
        streaming,
        callbacks,
      });
    case ModelProvider.LLAMA:
      return new ChatOllama({
        model: modelName,
        temperature,
        streaming,
        callbacks,
      });
    default:
      return null;
  }
};

@Module({
  imports: [
    DiscoveryModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname),
      serveRoot: '/',
      exclude: ['/api*'],
    }),
    LangChainToolsModule.forRoot({
      coordinatorUseMemory: true,
      // orchestration defaults to 'auto' — TravelSupervisor's @SupervisorAgent
      // metadata is detected automatically and the coordinator compiles a
      // supervisor graph. Set orchestration: 'flat' to force the flat
      // ReAct variant instead.
      enableStreaming: true,
      enableToolStreaming: true,
      toolTimeout: { enabled: true, durationMs: 30_000 },
      llmFactory,
    }),
  ],
  controllers: [AppController],
  providers: [
    { provide: RuntimeConfigService, useValue: runtimeConfig },
    WeatherAgent,
    BookingAgent,
    KnowledgeAgent,
    TravelSupervisor,
  ],
})
export class AppModule {}
