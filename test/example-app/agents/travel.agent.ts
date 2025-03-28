import { Injectable } from '@nestjs/common';
import { ToolsAgent } from '../../../src/decorators/agent.decorator';
import { AgentTool } from '../../../src/decorators/tool.decorator';
import { z } from 'zod';

@ToolsAgent({
  name: 'TravelAgent',
  description: 'Can provide travel recommendations and information',
  systemPrompt: 'You are a helpful travel assistant that provides travel information and recommendations.',
  modelType: 'openai',
  temperature: 0,
  // Enable conversation memory to remember previous interactions
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
    // In a real implementation, this would query a travel database
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
    // In a real implementation, this would query a hotel database
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
    // In a real implementation, this would query a flight search API
    return `Flights from ${origin} to ${destination} on ${date}: 
      - Airline XYZ: Departure 08:00, Arrival 10:30, $350
      - Airline ABC: Departure 12:15, Arrival 14:45, $295
      - Airline DEF: Departure 17:30, Arrival 20:00, $410`;
  }
}