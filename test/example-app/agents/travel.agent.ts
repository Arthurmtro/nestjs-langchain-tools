import { Injectable } from '@nestjs/common';
import { ModelProvider, ToolsAgent } from '../../../src/decorators/agent.decorator';
import { AgentTool } from '../../../src/decorators/tool.decorator';
import { z } from 'zod';

@ToolsAgent({
  name: 'TravelAgent',
  description: 'Can provide travel recommendations and information',
  systemPrompt: 'You are a helpful travel assistant that provides travel information and recommendations.',
  modelType: ModelProvider.OPENAI,
  temperature: 0,
  useMemory: true,
})
@Injectable()
export class TravelAgent {
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
    return `Recommended ${budget} hotels in ${location}: Grand Hotel, Plaza Inn, City Suites.`;
  }

  @AgentTool({
    name: 'search_flights',
    description: 'Search for flights between locations',
    schema: z.object({
      origin: z.string().describe('Origin city or airport'),
      destination: z.string().describe('Destination city or airport'),
      date: z.string().describe('Travel date (YYYY-MM-DD)'),
    }),
  })
  async searchFlights(input: { origin: string, destination: string, date: string }) {
    const { origin, destination, date } = input;
    return `Flights from ${origin} to ${destination} on ${date}:
      - Airline XYZ: Departure 08:00, Arrival 10:30, $350
      - Airline ABC: Departure 12:15, Arrival 14:45, $295
      - Airline DEF: Departure 17:30, Arrival 20:00, $410`;
  }
}