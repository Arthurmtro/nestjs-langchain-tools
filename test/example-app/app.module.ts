import { Module } from '@nestjs/common';
import { LangChainToolsModule } from '../../src/modules/langchain-tools.module';
import { WeatherAgent } from './agents/weather.agent';
import { TravelAgent } from './agents/travel.agent';
import { AppController } from './app.controller';

@Module({
  imports: [
    LangChainToolsModule.forRoot({
      // Optional global configuration
      coordinatorPrompt: `You are a travel planning assistant. You have access to specialized agents for weather and travel information. Route questions to the appropriate agent.`,
    }),
  ],
  controllers: [AppController],
  providers: [
    // Register your agents
    WeatherAgent,
    TravelAgent,
  ],
})
export class AppModule {}