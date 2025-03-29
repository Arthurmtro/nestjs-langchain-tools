import { Module } from '@nestjs/common';
import { LangChainToolsModule } from '../../src/modules/langchain-tools.module';
import { VectorStoreType } from '../../src/interfaces/vector-store.interface';
import { WeatherAgent } from './agents/weather.agent';
import { TravelAgent } from './agents/travel.agent';
import { KnowledgeAgent } from './agents/knowledge-agent';
import { StreamingToolAgent } from './agents/streaming-tool.agent';
import { AppController } from './app.controller';

@Module({
  imports: [
    LangChainToolsModule.forRoot({
      coordinatorPrompt: `You are an assistant with PERFECT MEMORY of this conversation.
      You have access to specialized agents for weather information, travel planning, knowledge retrieval, and tool streaming demonstrations. 
      Route questions to the appropriate agent based on the query.

      - For weather queries, use the weather agent
      - For travel planning and recommendations, use the travel agent
      - For questions that require specific knowledge or information lookup, use the knowledge agent with its RAG capabilities
      - For demonstrating streaming tools, use the streaming tool agent
        - The slow_process tool shows real-time progress updates
        - The failing_process tool demonstrates error handling in streaming

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
      
      // Enable tool streaming
      enableToolStreaming: true,
      
      // Tool streaming callback
      onToolStream: (update) => {
        console.log(`[TOOL STREAM] ${update.toolName} - ${update.type}: ${update.content || ''}`);
      }
    }),
  ],
  controllers: [AppController],
  providers: [
    WeatherAgent,
    TravelAgent,
    KnowledgeAgent,
    StreamingToolAgent,
  ],
})
export class AppModule {}