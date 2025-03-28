# NestJS LangChain Tools

A NestJS module for easy integration with LangChain tools and agents using decorators. This package provides a multi-agent architecture with automatic discovery and coordination. Works with OpenAI, Anthropic, Mistral, and other LLM providers.

## Installation

```bash
npm install nestjs-langchain-tools
```

## Features

- 🛠️ **Decorator-based Tools**: Easily create tools with a simple decorator API
- 🤖 **Multi-Agent Architecture**: Build specialized agents for different tasks
- 🧠 **Agent Coordination**: Route requests to the most appropriate agent
- 🔌 **Provider Agnostic**: Works with OpenAI, Anthropic, Mistral, and Llama
- 🧩 **Memory Support**: Optional conversation memory for stateful interactions
- 📝 **Custom Prompts**: Set different system prompts for each agent
- 🔒 **Type-Safe**: Uses TypeScript and Zod schemas
- 🏗️ **NestJS Integration**: Seamlessly integrates with NestJS dependency injection

## Usage

### 1. Import the module in your app.module.ts

```typescript
import { Module } from '@nestjs/common';
import { LangChainToolsModule } from 'nestjs-langchain-tools';

@Module({
  imports: [
    LangChainToolsModule.forRoot({
      coordinatorPrompt: `
        You are the Hotel California's AI concierge.
        You coordinate different specialized agents to help guests with their requests.

        Available agents:
        - Client Management Agent: For handling guest profiles and information
        - Reservation Agent: For managing room bookings and reservations

        Analyze each request carefully and route it to the most appropriate agent.
        Always be polite, professional, and helpful.

        {input}
      `,
    }),
    // Other modules...
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
  name: 'Client Management Agent',
  description: 'Handles all client-related operations',
  systemPrompt: `
    You are a client management specialist.
    You can help with creating, retrieving, updating, and listing client information.
    Always be professional and courteous when handling client information.

    {input}
  `,
})
export class ClientAgentService {
  constructor(private readonly clientService: ClientService) {}

  @AgentTool({
    name: 'create_client',
    description: 'Create a new client',
    schema: z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
    }),
  })
  async createClient(input: any) {
    const result = await this.clientService.create(input);
    return `Client created successfully: ${result.name} (ID: ${result.id})`;
  }

  // More tools...
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

## API Reference

### Decorators

#### @ToolsAgent(options)

Marks a class as an agent with its own tools.

Options:

- `name`: The name of the agent
- `description`: Description of what the agent does
- `systemPrompt`: The system prompt for the agent
- `modelType`: The LLM provider to use ('openai', 'anthropic', 'mistral', 'llama', 'custom')
- `modelName`: The model name to use (depends on the provider)
- `temperature`: Temperature setting (default: 0)
- `useMemory`: Enable conversation memory (default: false)
- `returnIntermediateSteps`: Whether to return reasoning steps (default: false)
- `handleParsingErrorMessage`: Custom error message for parsing errors

#### @AgentTool(options)

Marks a method as a tool that the agent can use.

Options:

- `name`: The name of the tool
- `description`: Description of what the tool does
- `schema`: Zod schema for the tool's input

### Services

#### CoordinatorService

- `processMessage(message: string): Promise<string>`: Process a user message and route it to the appropriate agent

#### AgentDiscoveryService

- `discoverAndInitializeAgents()`: Discover and initialize all agents
- `getAgentByName(name: string)`: Get an agent by name
- `getAllAgents()`: Get all agents

#### ToolDiscoveryService

- `discoverTools()`: Discover all tools
- `discoverToolsForProvider(instance: any)`: Discover tools for a specific provider

## Testing the Multi-Agent System

The package includes integration tests and example code to verify that the multi-agent system works correctly:

### Integration Tests

To run the integration tests (requires an API key):

```bash
# Set your API key first
export OPENAI_API_KEY=your-api-key

# Run the integration tests (edit file to remove .skip())
npm test test/integration/multi-agent-flow.spec.ts
```

### Example Application

There's a complete example application in the [/test/example-app](/test/example-app) directory that demonstrates:

- Weather Agent with weather forecast tools
- Travel Agent with attractions, hotels, and flights tools
- A coordinator that routes questions to the appropriate agent

To run the example:

```bash
# Set your API key
export OPENAI_API_KEY=your-api-key

# Build the project
npm run build

# Run the example app
ts-node test/example-app/main.ts

# Send test requests
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is the weather like in Paris and what hotels do you recommend?"}'
```

## Troubleshooting

### Common Issues

1. **Agents not discovered**: Make sure you've applied both `@ToolsAgent()` and `@Injectable()` decorators to your agent classes.

2. **Tools not discovered**: Ensure that methods are decorated with `@AgentTool()` and have proper schemas.

3. **Initialization errors**: Check your API key is correctly set in your environment for the LLM provider you're using.

4. **Coordinator not working**: Make sure to wait for the initialization process to complete before using the coordinator.

5. **LLM provider issues**: If changing from OpenAI to another provider, ensure you have the correct dependencies installed and API keys set.

## License

MIT
