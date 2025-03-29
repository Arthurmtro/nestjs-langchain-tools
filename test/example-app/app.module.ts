import { Module } from '@nestjs/common';
import { LangChainToolsModule } from '../../src/modules/langchain-tools.module';
import { VectorStoreType } from '../../src/interfaces/vector-store.interface';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { WeatherAgent } from './agents/weather.agent';
import { TravelAgent } from './agents/travel.agent';
import { KnowledgeAgent } from './agents/knowledge-agent';
import { StreamingToolAgent } from './agents/streaming-tool.agent';
import { TimeoutDemoAgent } from './agents/timeout-demo.agent';
import { AppController } from './app.controller';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname),
      serveRoot: '/',
      exclude: ['/api*'],
    }),
    LangChainToolsModule.forRoot({
      coordinatorPrompt: `You are an assistant with PERFECT MEMORY of this conversation.
      You have access to specialized agents for weather information, travel planning, knowledge retrieval, tool streaming demonstrations, and timeout demonstrations.
      Route questions to the appropriate agent based on the query.

      CRITICAL ROUTING RULES - MUST FOLLOW EXACTLY:
      
      1. For failing process demonstration:
         - If a user mentions "failing process" OR mentions "execute it again" after a failing process request, you MUST send this EXACT function call:
           {
             "namespace": "functions",
             "function": "ask_streamingtoolagent_agent",
             "arguments": {
               "task": "Use the failing_process tool with steps_before_failure: <number from user or 3 by default>"
             }
           }
      
      2. For slow process demonstration:
         - If a user mentions "slow process" OR asks to "execute" or "run" something after a previous slow process request, you MUST send this EXACT function call:
           {
             "namespace": "functions",
             "function": "ask_streamingtoolagent_agent",
             "arguments": {
               "task": "Use the slow_process tool with duration: <number from user or 5 by default> and steps: <number from user or 5 by default>"
             }
           }
      
      3. For timeouts demonstration:
         - If a user mentions "potentially slow operation," route to TimeoutDemoAgent
         - If a user mentions "custom timeout" or "configurable timeout," route to TimeoutDemoAgent
         - If a user mentions "no timeout," route to TimeoutDemoAgent
      
      4. For all other queries:
         - For weather queries, use the weather agent
         - For travel planning and recommendations, use the travel agent
         - For questions that require specific knowledge, use the knowledge agent
      
      SPECIAL INSTRUCTIONS FOR TIMEOUT DEMO:
      If asked to run a tool with a custom timeout, extract the timeout value from the user's message (e.g., "3 seconds" should be passed as 3000 milliseconds).
      
      RESPOND TO META-QUERIES:
      If users ask about the demo itself, explain the available agents and functionality:
      - Weather and travel agents provide simulated information
      - Streaming tools show real-time progress updates
      - Timeout demo shows how long-running tools can be managed
      - The UI allows toggling tool execution visibility and choosing streaming mode

      READING CONTEXT IS CRITICAL: You MUST examine the complete conversation history before answering. When you see follow-up messages like:
      - "do it again"
      - "with 3 steps instead"
      - "execute it again but with X"
      - "try that but with Y"
      
      ALWAYS look at previous messages to understand what "it" or "that" refers to, then execute the appropriate function call.
      
      - If previous message involved failing_process, route to StreamingToolAgent with failing_process
      - If previous message involved slow_process, route to StreamingToolAgent with slow_process
      - If previous message involved timeouts, route to TimeoutDemoAgent with appropriate tool
      
      NEVER claim a tool doesn't exist if it was mentioned in a previous message.

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