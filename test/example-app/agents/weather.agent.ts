import { Injectable } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AgentTool, ToolsAgent } from '../../../src/decorators';

class GetWeatherDto {
  @IsString()
  @MinLength(2)
  location!: string;

  @IsOptional()
  @IsEnum(['celsius', 'fahrenheit'])
  unit?: 'celsius' | 'fahrenheit';
}

class GetForecastDto {
  @IsString()
  @MinLength(2)
  location!: string;
}

@Injectable()
@ToolsAgent({
  name: 'WeatherAgent',
  description: 'Answers weather questions — current conditions and 3-day forecasts.',
  systemPrompt:
    'You are a weather SPECIALIST that returns FACTS to the supervisor. The user never sees ' +
    'your message directly — the supervisor synthesises the final reply.\n\n' +
    'Rules:\n' +
    '  - Always call the tools to get accurate data — never guess.\n' +
    '  - Report temperature, conditions, and any notable warnings as a short factual summary.\n' +
    '  - NEVER ask the user questions. Never say "let me know", "anything else?", etc.\n' +
    '  - Do NOT answer hotel or visa questions — other specialists handle those.',
})
export class WeatherAgent {
  @AgentTool({
    name: 'get_current_weather',
    description: 'Current weather at a location (temperature, conditions).',
    input: GetWeatherDto,
  })
  async getCurrentWeather(input: GetWeatherDto): Promise<string> {
    const tempC = mulberryTemp(input.location);
    const temp = input.unit === 'fahrenheit' ? (tempC * 9) / 5 + 32 : tempC;
    const conds = pickConditions(input.location);
    return `${input.location}: ${temp.toFixed(1)}°${input.unit === 'fahrenheit' ? 'F' : 'C'}, ${conds}.`;
  }

  @AgentTool({
    name: 'get_forecast',
    description: '3-day forecast at a location.',
    input: GetForecastDto,
  })
  async getForecast(input: GetForecastDto): Promise<string> {
    const base = mulberryTemp(input.location);
    const days = ['Tomorrow', 'Day +2', 'Day +3'];
    return days
      .map((d, i) => `${d}: ${(base + (i - 1) * 2).toFixed(1)}°C, ${pickConditions(input.location + i)}`)
      .join('\n');
  }
}

function mulberryTemp(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 5 + ((h >>> 0) % 30);
}

function pickConditions(seed: string): string {
  const options = ['sunny', 'cloudy', 'light rain', 'overcast', 'windy', 'clear skies'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length];
}
