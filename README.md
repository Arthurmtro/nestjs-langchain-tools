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
- **Streaming Support** - Real-time token streaming with SSE

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
      // Enable streaming support
      enableStreaming: true,
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
- Streaming demo with SSE and fetch API

### Using Streaming Responses

The package supports real-time streaming responses through Server-Sent Events (SSE). Here's how to set it up in your controller:

```typescript
import { Controller, Post, Body, Sse, Res } from '@nestjs/common';
import { Response } from 'express';
import { Observable, Subject } from 'rxjs';
import { CoordinatorService } from 'nestjs-langchain-tools';

@Controller('api')
export class YourController {
  constructor(private readonly coordinatorService: CoordinatorService) {}

  // Traditional endpoint returning complete response
  @Post('chat')
  async chat(@Body() body: { message: string }): Promise<{ response: string }> {
    const response = await this.coordinatorService.processMessage(body.message);
    return { response };
  }

  // Server-Sent Events streaming endpoint
  @Sse('chat/sse')
  chatSSE(@Query('message') message: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    
    if (!message) {
      subject.next({ data: { error: 'Message parameter is required' } });
      subject.complete();
      return subject.asObservable();
    }
    
    this.coordinatorService.processMessage(
      message, 
      true, // Enable streaming
      (token: string) => {
        subject.next({ data: { token } });
      }
    )
    .then(() => {
      subject.next({ data: { done: true } });
      subject.complete();
    })
    .catch((error) => {
      subject.next({ data: { error: error.message } });
      subject.complete();
    });
    
    return subject.asObservable();
  }
}
```

Check out the complete streaming demo in `/test/example-app/streaming-demo.html` for frontend implementation examples.

### Command-line Testing with curl

You can also test the streaming endpoints from the command line:

```bash
# Standard endpoint
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is the weather in Paris?"}'

# SSE streaming endpoint (note that message is passed as a query parameter)
curl -N -H "Accept: text/event-stream" \
  "http://localhost:4000/api/chat/sse?message=What%20is%20the%20weather%20in%20Paris?"

# Fetch streaming endpoint
curl -X POST http://localhost:4000/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"What is the weather in Paris?"}'
```

## 🔄 CI/CD Process

This project uses GitHub Actions for continuous integration and delivery:

1. **On Pull Requests to `master`**:
   - Runs linting
   - Performs type checking
   - Executes all tests
   - Builds the package

2. **On Push to `master`**:
   - Runs all the above checks
   - Automatically publishes to npm if all checks pass

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes following conventional commits
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT