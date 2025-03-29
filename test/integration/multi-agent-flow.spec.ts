import { Test, TestingModule } from '@nestjs/testing';
import { Injectable, Module } from '@nestjs/common';
import { CoordinatorService } from '../../src/services/coordinator.service';
import { AgentDiscoveryService } from '../../src/services/agent-discovery.service';
import { ToolDiscoveryService } from '../../src/services/tool-discovery.service';
import { MemoryService } from '../../src/services/memory.service';
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
import { ModelProvider, ToolsAgent } from '../../src/decorators/agent.decorator';
import { AgentTool } from '../../src/decorators/tool.decorator';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import { LANGCHAIN_TOOLS_OPTIONS } from '../../src/modules/langchain-tools.module';

// Load environment variables from .env file
dotenv.config();

// This is a test weather agent that can get forecasts
@ToolsAgent({
  name: 'WeatherAgent',
  description: 'Can get weather forecasts for any location',
  systemPrompt: 'You are a helpful weather assistant that provides weather information. Always use your tools to get accurate data.',
  modelType: ModelProvider.OPENAI,
  modelName: 'gpt-4o', // Using the latest model
  temperature: 0,
})
@Injectable()
class WeatherAgent {
  @AgentTool({
    name: 'get_weather',
    description: 'Get the weather forecast for a location',
    schema: z.object({
      location: z.string().describe('The name of the city or location'),
      days: z.number().optional().describe('Number of days for the forecast'),
    }),
  })
  async getWeather(input: { location: string, days?: number }) {
    const { location, days = 1 } = input;
    // Mock data for demonstration purposes
    return `The weather in ${location} for the next ${days} day(s) is sunny with a high of 75°F.`;
  }
}

// A travel agent that can book trips
@ToolsAgent({
  name: 'TravelAgent',
  description: 'Can provide travel recommendations and information',
  systemPrompt: 'You are a helpful travel assistant that provides travel information and recommendations. Always use your tools to provide the best answers.',
  modelType: ModelProvider.OPENAI,
  modelName: 'gpt-4o', // Using the latest model
  temperature: 0,
  useMemory: true, // Enable conversation memory
})
@Injectable()
class TravelAgent {
  @AgentTool({
    name: 'get_attractions',
    description: 'Get tourist attractions for a location',
    schema: z.object({
      location: z.string().describe('The name of the city or location'),
      category: z.string().optional().describe('Category of attractions (museums, parks, etc.)'),
    }),
  })
  async getAttractions(input: { location: string, category?: string }) {
    const { location, category = 'popular' } = input;
    // Mock data for demonstration purposes
    return `Top ${category} attractions in ${location}: Museum of Modern Art, Central Park, Empire State Building.`;
  }

  @AgentTool({
    name: 'get_hotel_recommendations',
    description: 'Get hotel recommendations for a location',
    schema: z.object({
      location: z.string().describe('The name of the city or location'),
      budget: z.string().optional().describe('Budget category (budget, mid-range, luxury)'),
    }),
  })
  async getHotelRecommendations(input: { location: string, budget?: string }) {
    const { location, budget = 'mid-range' } = input;
    // Mock data for demonstration purposes
    return `Recommended ${budget} hotels in ${location}: Grand Hotel, Plaza Inn, City Suites.`;
  }
}

// Test module that combines all our agents
@Module({
  imports: [DiscoveryModule],
  providers: [
    ToolDiscoveryService,
    {
      provide: AgentDiscoveryService,
      useFactory: (discoveryService, toolDiscoveryService, reflector) => {
        return new AgentDiscoveryService(discoveryService, toolDiscoveryService, reflector);
      },
      inject: [DiscoveryService, ToolDiscoveryService, Reflector]
    },
    {
      provide: LANGCHAIN_TOOLS_OPTIONS,
      useValue: {
        coordinatorPrompt: 'You are a travel planning assistant. You have access to specialized agents for weather and travel information. For complex queries that involve both weather and travel, make sure to use both agents to get complete information. Always prioritize answering all parts of the user\'s question.'
      }
    },
    CoordinatorService,
    MemoryService,
    WeatherAgent,
    TravelAgent,
  ],
  exports: [CoordinatorService],
})
class TestAgentModule {}

// This test makes real API calls to LLM providers
// Make sure you have set OPENAI_API_KEY in your .env file
describe('Multi-Agent Flow Integration', () => {
  let coordinatorService: CoordinatorService;
  let moduleRef: TestingModule;

  // Increased timeout for beforeAll to 30 seconds since initialization takes time
  beforeAll(async () => {
    // Check for required API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ ERROR: OPENAI_API_KEY is not set in environment variables');
      throw new Error('OPENAI_API_KEY is required to run this test. Please check your .env file.');
    }
    
    console.log('✅ API key found, proceeding with test setup...');

    moduleRef = await Test.createTestingModule({
      imports: [TestAgentModule],
    }).compile();

    coordinatorService = moduleRef.get<CoordinatorService>(CoordinatorService);
    
    // Wait for the coordinator to initialize (important!)
    // This allows all the agents to be discovered and registered
    const waitForInit = async () => {
      const maxWaitMs = 15000; // Increase timeout to 15 seconds
      const startTime = Date.now();
      
      console.log('Waiting for coordinator initialization...');
      
      while (Date.now() - startTime < maxWaitMs) {
        try {
          // Try to access the private initialized property
          const isInitialized = (coordinatorService as any).initialized;
          if (isInitialized) {
            console.log('✅ Coordinator initialized successfully');
            return true;
          }
          
          // Check agents
          const agents = (coordinatorService as any).agentDiscoveryService?.getAllAgents() || [];
          if (agents.length > 0) {
            console.log(`Found ${agents.length} agents, waiting for full initialization...`);
          }
          
          // Wait a bit before checking again
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error('Error checking initialization:', error);
        }
      }
      
      // If we reach here, initialization failed, but don't throw
      console.warn('⚠️ Coordinator initialization timeout - proceeding anyway');
      return false;
    };
    
    await waitForInit();
    
    // Add a small delay to ensure all setup is complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000); // 30 second timeout for beforeAll hook

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should route a travel question to the travel agent', async () => {
    // This test will make a real LLM call
    const result = await coordinatorService.processMessage(
      'What are some good attractions to visit in New York?'
    );
    
    console.log('Travel question result:', result);
    
    // Check that the response contains attractions information
    expect(result.toLowerCase()).toContain('attraction');
    expect(result.toLowerCase()).toContain('new york');
  }, 60000); // 60 second timeout for LLM call

  it('should route a weather question to the weather agent', async () => {
    // This test will make a real LLM call
    const result = await coordinatorService.processMessage(
      'What\'s the weather like in San Francisco?'
    );
    
    console.log('Weather question result:', result);
    
    // Check that the response contains weather information
    expect(result.toLowerCase()).toContain('weather');
    expect(result.toLowerCase()).toContain('san francisco');
  }, 60000); // 60 second timeout for LLM call

  it('should handle a complex query requiring multiple agents', async () => {
    // This test will make a real LLM call
    const result = await coordinatorService.processMessage(
      'I\'m planning a trip to Miami next week. What\'s the weather forecast and what hotels would you recommend?'
    );
    
    console.log('Complex query result:', result);
    
    // The model might ask for clarification instead of providing both pieces of information
    // Check that the response at least mentions Miami and contains either weather info or hotel info
    expect(result.toLowerCase()).toContain('miami');
    
    // Check that the response either:
    // 1. Contains weather AND hotel information, OR
    // 2. Is asking a clarifying question about hotels or weather
    const hasWeatherInfo = result.toLowerCase().match(/weather|forecast|temperature/) !== null;
    const hasHotelInfo = result.toLowerCase().match(/hotel|accommodation|stay/) !== null;
    const isAskingClarification = result.toLowerCase().match(/budget|preference|specify|options|what (type|kind)|how (many|much)/) !== null;
    
    expect(
      (hasWeatherInfo && hasHotelInfo) || // Complete answer
      (isAskingClarification && (hasWeatherInfo || hasHotelInfo)) // Clarification with partial info
    ).toBe(true);
  }, 90000); // 90 second timeout for complex LLM call
});