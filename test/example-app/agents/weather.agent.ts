import { Injectable } from '@nestjs/common';
import { ModelProvider, ToolsAgent } from '../../../src/decorators/agent.decorator';
import { AgentTool } from '../../../src/decorators/tool.decorator';
import { z } from 'zod';

@ToolsAgent({
  name: 'WeatherAgent',
  description: 'Can get weather forecasts for any location',
  systemPrompt: 'You are a helpful weather assistant that provides weather information.',
  // Use OpenAI by default, but you can change to other providers
  modelType: ModelProvider.OPENAI,
  // Or use Anthropic:
  // modelType: ModelProvider.ANTHROPIC,
  // modelName: 'claude-3-opus-20240229',
  temperature: 0,
})
@Injectable()
export class WeatherAgent {
  // Define a tool to get weather forecasts
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
    // In a real implementation, this would call a weather API
    // For demo purposes, we return mock data
    return `The weather in ${location} for the next ${days} day(s) is sunny with a high of 75°F.`;
  }
}