import { Module } from '@nestjs/common';
import { LangChainToolsModule } from '../../src/modules/langchain-tools.module';
import { WeatherAgent } from './agents/weather.agent';
import { TravelAgent } from './agents/travel.agent';
import { AppController } from './app.controller';

@Module({
  imports: [
    LangChainToolsModule.forRoot({
      coordinatorPrompt: `You are a travel planning assistant with PERFECT MEMORY of this conversation.
      You have access to specialized agents for weather and travel information. Route questions to the appropriate agent.

      CRITICALLY IMPORTANT: You MUST use conversation history to understand context. When the user asks about previous messages,
      refers to past questions, or uses pronouns like "it", "that", or "this" to reference earlier topics, you MUST look at the
      chat_history to understand what they are referring to. Never claim you don't have memory or can't remember previous messages.

      For example, if a user asks about the weather in Paris, and then later asks "when did I ask about?", you must remember they
      were asking about Paris.`,
      coordinatorUseMemory: true,
      enableStreaming: true,
    }),
  ],
  controllers: [AppController],
  providers: [
    WeatherAgent,
    TravelAgent,
  ],
})
export class AppModule {}