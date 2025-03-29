import { Module } from '@nestjs/common';
import { LangChainToolsModule } from '../../src/modules/langchain-tools.module';
import { VectorStoreType } from '../../src/interfaces/vector-store.interface';
import { WeatherAgent } from './agents/weather.agent';
import { TravelAgent } from './agents/travel.agent';
import { KnowledgeAgent } from './agents/knowledge-agent';
import { StreamingToolAgent } from './agents/streaming-tool.agent';
import { TimeoutDemoAgent } from './agents/timeout-demo.agent';
import { AppController } from './app.controller';

@Module({
  imports: [
    LangChainToolsModule.forRoot({
      coordinatorPrompt: `You are an assistant with PERFECT MEMORY of this conversation.
      You have access to specialized agents for weather information, travel planning, knowledge retrieval, tool streaming demonstrations, and timeout demonstrations.
      Route questions to the appropriate agent based on the query.

      - For weather queries, use the weather agent
      - For travel planning and recommendations, use the travel agent
      - For questions that require specific knowledge or information lookup, use the knowledge agent with its RAG capabilities
      - For demonstrating streaming tools, use the streaming tool agent
        - The slow_process tool shows real-time progress updates
        - The failing_process tool demonstrates error handling in streaming
      - For demonstrating tool timeouts, use the timeout demo agent
        - The potentially_slow_operation tool demonstrates timeouts (set to 5 seconds)
        - The configurable_timeout_operation tool lets users specify a custom timeout
        - The no_timeout_operation tool demonstrates a tool without a timeout

      CRITICALLY IMPORTANT: You MUST use conversation history to understand context. When the user asks about previous messages,
      refers to past questions, or uses pronouns like "it", "that", or "this" to reference earlier topics, you MUST look at the
      chat_history to understand what they are referring to. Never claim you don't have memory or can't remember previous messages.

      For example, if a user asks about the weather in Paris, and then later asks "when did I ask about?", you must remember they
      were asking about Paris.`,
      coordinatorUseMemory: true,
      enableStreaming: true,
      // Vector store configuration - using in-memory store for the example
      vectorStore: {
        type: VectorStoreType.MEMORY,
        collectionName: 'default'
      },
      // Default embedding model
      embeddingModel: 'text-embedding-3-small',
      
      // Enable tool streaming - explicitly set to true for clarity
      enableToolStreaming: true,
      
      // Tool streaming callback with detailed logging
      onToolStream: (update) => {
        console.log(`[TOOL STREAM] ${update.toolName} - ${update.type}${update.progress !== undefined ? ` (${update.progress}%)` : ''}: ${update.content || ''}`);
      },
      
      // Global tool timeout settings (can be overridden per tool)
      toolTimeout: {
        enabled: true,
        durationMs: 30000 // 30 seconds global timeout
      },
      
      // Timeout callback
      onToolTimeout: (toolName, timeoutMs) => {
        console.log(`[TOOL TIMEOUT] ${toolName} exceeded timeout of ${timeoutMs}ms`);
      }
    }),
  ],
  controllers: [AppController],
  providers: [
    WeatherAgent,
    TravelAgent,
    KnowledgeAgent,
    StreamingToolAgent,
    TimeoutDemoAgent,
  ],
})
export class AppModule {}