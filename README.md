# NestJS LangChain Tools

[![NPM Version](https://img.shields.io/npm/v/nestjs-langchain-tools.svg)](https://www.npmjs.com/package/nestjs-langchain-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful NestJS module for seamless integration with LangChain tools and agents. Build sophisticated AI features in your NestJS applications with a simple decorator-based API.

## 🚀 Features

- **Decorator-based Tools** - Create LangChain tools with a simple decorator API
- **Multi-Agent Architecture** - Build specialized agents for different tasks
- **Smart Routing** - Automatically routes requests to the right agent
- **Provider Agnostic** - Works with OpenAI, Anthropic, Mistral, and more
- **Memory Support** - Optional conversation memory for stateful interactions
- **Type-Safe** - Uses TypeScript and Zod schemas for robust type safety

## 📦 Installation

```bash
# Using npm
npm install nestjs-langchain-tools

# Using yarn
yarn add nestjs-langchain-tools

# Using pnpm
pnpm add nestjs-langchain-tools
```

## 🔧 Quick Start

### 1. Import the module in your app.module.ts

```typescript
import { Module } from '@nestjs/common';
import { LangChainToolsModule } from 'nestjs-langchain-tools';

@Module({
  imports: [
    LangChainToolsModule.forRoot({
      coordinatorPrompt: `
        You are a hotel concierge AI.
        You coordinate different specialized agents to help guests.
        
        {input}
      `,
    }),
  ],
})
export class AppModule {}
```

### 2. Create agent services with tools

```typescript
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentTool, ToolsAgent } from 'nestjs-langchain-tools';

@Injectable()
@ToolsAgent({
  name: 'Booking Agent',
  description: 'Handles all hotel reservation operations',
  systemPrompt: `You are a booking specialist. Help with room reservations. {input}`,
})
export class BookingAgentService {
  @AgentTool({
    name: 'check_availability',
    description: 'Check room availability',
    schema: z.object({
      checkIn: z.string(),
      checkOut: z.string(),
      roomType: z.string(),
    }),
  })
  async checkAvailability(input: any) {
    // Your implementation here
    return `Room availability for ${input.roomType} from ${input.checkIn} to ${input.checkOut}...`;
  }
}
```

### 3. Use the coordinator in your controllers

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { CoordinatorService } from 'nestjs-langchain-tools';

@Controller('ai')
export class AIController {
  constructor(private readonly coordinatorService: CoordinatorService) {}

  @Post('chat')
  async chat(@Body() body: { message: string }) {
    return {
      response: await this.coordinatorService.processMessage(body.message),
    };
  }
}
```

## 📘 Key Concepts

### Agents

Agents are specialized AI assistants that can use tools. Each agent handles specific domains or tasks:

```typescript
@Injectable()
@ToolsAgent({
  name: 'Weather Agent',
  description: 'Provides weather information',
  modelType: 'openai', // 'anthropic', 'mistral', etc.
  modelName: 'gpt-4o',
  temperature: 0.2,
  useMemory: true,
})
export class WeatherAgentService {
  // Tools defined here
}
```

### Tools

Tools are methods that agents can use to perform actions:

```typescript
@AgentTool({
  name: 'get_forecast',
  description: 'Get weather forecast for a location',
  schema: z.object({
    location: z.string(),
    days: z.number().optional(),
  }),
})
async getForecast(input: any) {
  // Implementation
  return `Weather forecast for ${input.location}...`;
}
```

### Coordinator

The coordinator routes user requests to the appropriate agent:

```typescript
// In your controller
const response = await this.coordinatorService.processMessage(
  "What's the weather in Paris tomorrow?"
);
```

## 📖 API Reference

### Module Configuration

```typescript
LangChainToolsModule.forRoot({
  coordinatorPrompt: string,   // System prompt for the coordinator
  coordinatorModel?: string,   // Model for coordinator (default: gpt-3.5-turbo)
  coordinatorProvider?: string // LLM provider (default: 'openai')
  // Additional options...
})
```

### Agent Decorator

```typescript
@ToolsAgent({
  name: string,               // Agent name
  description: string,        // Agent description
  systemPrompt: string,       // System prompt for the agent
  modelType?: string,         // Provider: 'openai', 'anthropic', 'mistral', 'llama', 'custom'
  modelName?: string,         // Model name
  temperature?: number,       // Temperature (default: 0)
  useMemory?: boolean,        // Enable conversation memory (default: false)
  returnIntermediateSteps?: boolean, // Return reasoning steps (default: false)
})
```

### Tool Decorator

```typescript
@AgentTool({
  name: string,               // Tool name
  description: string,        // Tool description
  schema: ZodSchema,          // Zod schema for input validation
})
```

## 🧪 Testing

```bash
# Set your API key
export OPENAI_API_KEY=your-api-key

# Run all tests
npm test

# Run example app
npm run example
```

## 🔍 Example Application

Check out the complete example in the `/test/example-app` directory:

- Weather Agent with forecast tools
- Travel Agent with hotel and attraction tools
- Coordinator that routes questions to the right agent

## 📝 License

MIT