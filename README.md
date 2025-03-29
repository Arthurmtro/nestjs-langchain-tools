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
- **Streaming Support** - Real-time token streaming with SSE and tool execution updates
- **RAG Integration** - Built-in support for Retrieval Augmented Generation with vector databases
- **Tool Timeouts** - Configure timeouts for long-running tools

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

### RAG (Retrieval Augmented Generation)

Enable knowledge base capabilities for your agents:

```typescript
// In your module configuration
LangChainToolsModule.forRoot({
  // ... other options
  vectorStore: {
    type: VectorStoreType.MEMORY, // Or PINECONE, CHROMA, FAISS, QDRANT
    collectionName: 'my_collection',
    // Additional provider-specific options
  },
  embeddingModel: 'text-embedding-3-small', // OpenAI embedding model
})

// In your agent class
@ToolsAgent({ /* ... */ })
@WithRetrieval({
  enabled: true,
  collectionName: 'my_collection',
  topK: 5,                   // Number of documents to retrieve
  scoreThreshold: 0.7,       // Minimum similarity score (0-1)
  includeMetadata: true,     // Include document metadata in context
  storeRetrievedContext: true, // Save retrieved context to memory
})
export class KnowledgeAgent {
  constructor(private readonly vectorStoreService: VectorStoreService) {
    // Initialize knowledge base
    this.initializeKnowledgeBase();
  }

  async initializeKnowledgeBase() {
    // Add documents to the knowledge base
    await this.vectorStoreService.addDocuments([
      DocumentProcessor.fromText("Example content", { source: "example" })
    ], 'my_collection');
  }
}
```

## 🧪 Testing

```bash
# Set your API key
export OPENAI_API_KEY=your-api-key

# Run unit tests only (skips integration tests)
npm run test:unit

# Run all tests
npm test

# Run integration tests
npm run test:integration

# Run example app
npm run example
```

## 🔍 Example Application

Check out the complete example in the `/test/example-app` directory:

- Weather Agent with forecast tools
- Travel Agent with hotel and attraction tools
- Knowledge Agent with RAG capabilities for answering questions
- Streaming Tool Agent for visualizing progressive updates
- Timeout Demo Agent for handling long-running operations
- Interactive demo with streaming capabilities and RAG visualization

### Streaming Responses and Tool Progress Updates

The package supports real-time streaming responses through Server-Sent Events (SSE) with both token streaming and tool execution updates. Here's how to set it up in your controller:

```typescript
import { Controller, Post, Body, Sse, Query } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { CoordinatorService, ToolStreamService, ToolStreamUpdate } from 'nestjs-langchain-tools';

@Controller('api')
export class YourController {
  constructor(
    private readonly coordinatorService: CoordinatorService,
    private readonly toolStreamService: ToolStreamService
  ) {}

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
    
    // Setup tool streaming if available
    if (this.toolStreamService) {
      this.toolStreamService.setStreamingEnabled(true);
      this.toolStreamService.setCallback((update: ToolStreamUpdate) => {
        // Send tool updates to client
        subject.next({ data: { toolUpdate: update } });
      });
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

Check out the complete interactive demo in `/test/example-app/interactive-demo.html` for frontend implementation examples.

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
   - Executes unit tests (integration tests are skipped in CI)
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