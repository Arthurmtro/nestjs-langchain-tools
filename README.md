# nestjs-langchain-tools

[![NPM Version](https://img.shields.io/npm/v/nestjs-langchain-tools.svg)](https://www.npmjs.com/package/nestjs-langchain-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The NestJS × LangChain integration.** LangGraph-first, class-validator native, observability auto-wired, shipped adapters for Redis / Mongo / Qdrant / pgvector / Pinecone.

```bash
pnpm add nestjs-langchain-tools \
  @langchain/core @langchain/openai @langchain/langgraph \
  class-validator class-transformer rxjs reflect-metadata
```

## Why this package

Building LangChain apps in NestJS used to mean one of:
- Writing a thin `OpenAIService` wrapper and re-implementing every LangChain feature by hand
- Rolling a custom decorator system on top of `AgentExecutor` and fighting DI
- Leaking LangChain internals all over your controllers

`nestjs-langchain-tools` is the opinionated layer : **one decorator per agent, one per tool, auto-discovered at boot, streaming by default, observability for free, every backend pluggable**.

## 60 seconds setup

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { LangChainToolsModule, ModelProvider } from 'nestjs-langchain-tools';
import { WeatherAgent } from './weather.agent';
import { ChatController } from './chat.controller';

@Module({
  imports: [
    LangChainToolsModule.forRootAsync({
      useFactory: () => ({
        coordinatorProvider: ModelProvider.OPENAI,
        coordinatorModel: 'gpt-4o',
        coordinatorUseMemory: true,
      }),
    }),
  ],
  controllers: [ChatController],
  providers: [WeatherAgent],
})
export class AppModule {}
```

```typescript
// weather.agent.ts
import { Injectable } from '@nestjs/common';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ToolsAgent, AgentTool } from 'nestjs-langchain-tools';

class GetWeatherDto {
  @IsString()
  location!: string;

  @IsEnum(['celsius', 'fahrenheit'])
  @IsOptional()
  unit?: 'celsius' | 'fahrenheit';
}

@Injectable()
@ToolsAgent({
  name: 'WeatherAgent',
  description: 'Answers weather questions',
  systemPrompt: 'You are a weather expert. Use the tool for every question.',
})
export class WeatherAgent {
  @AgentTool({
    name: 'get_weather',
    description: 'Current weather at a location',
    input: GetWeatherDto,
  })
  async getWeather(input: GetWeatherDto): Promise<string> {
    // input is a fully validated, typed instance — no manual parsing needed
    return `It's 22°${input.unit === 'fahrenheit' ? 'F' : 'C'} in ${input.location}.`;
  }
}
```

```typescript
// chat.controller.ts
import { Controller } from '@nestjs/common';
import { LangChainChatController } from 'nestjs-langchain-tools/http';
import { GraphCoordinatorService } from 'nestjs-langchain-tools';

@Controller('chat')
export class ChatController extends LangChainChatController {
  constructor(protected coordinator: GraphCoordinatorService) {
    super();
  }
}
```

You now have:
- `POST /chat` → synchronous reply
- `GET /chat/stream?q=...&sessionId=...` → **SSE stream of typed events** (tokens, tool calls, progress, errors)
- Zero boilerplate wiring

## Features

### 🎯 Decorator-driven
One decorator per agent (`@ToolsAgent`), one per tool (`@AgentTool`). Auto-discovered via Nest's `DiscoveryService`. No manual registration.

### 🔒 class-validator native
Tool inputs are plain NestJS DTOs. They're validated at runtime **and** converted to JSON Schema for the LLM — no Zod required.

```typescript
class TransferDto {
  @IsString() @MinLength(10) accountId!: string;
  @IsInt() @Min(1) @Max(1_000_000) amount!: number;
  @IsEnum(['EUR', 'USD', 'GBP']) currency!: string;
}

@AgentTool({ name: 'transfer', input: TransferDto })
@Authorize({ roles: ['finance-admin'] })
async transfer(input: TransferDto) { /* input is typed, validated, authorized */ }
```

### 🌊 LangGraph-first orchestration
`GraphCoordinatorService` uses `createReactAgent` from `@langchain/langgraph` under the hood. Stream every token, tool call, and handoff as typed Observable events.

```typescript
this.coordinator.processMessageStream('Book me a Paris hotel').subscribe({
  next: (event) => {
    switch (event.type) {
      case 'token':        /* { content: 'Found...', agent: 'BookingAgent' } */
      case 'tool-start':   /* { tool: 'search_hotels', input: {...} } */
      case 'tool-progress':/* { tool: 'search_hotels', progress: 40 } */
      case 'tool-end':     /* { tool: 'search_hotels', output: {...} } */
      case 'agent-handoff':/* { from: 'Supervisor', to: 'BookingAgent' } */
      case 'interrupt':    /* { threadId, reason: 'needs_approval' } */
      case 'complete':     /* { content: 'Booked...', threadId } */
      case 'error':        /* { error: 'rate limited' } */
    }
  },
});
```

### 🎚️ Async generator tools
Stream progress from within a tool without calling a service:

```typescript
@AgentTool({ name: 'index_corpus', input: IndexDto, streaming: true })
async *indexCorpus(input: IndexDto): AsyncGenerator<
  { progress: number; message: string },
  string
> {
  yield { progress: 10, message: 'parsing' };
  const parsed = await this.parse(input);
  yield { progress: 50, message: 'embedding' };
  await this.embed(parsed);
  yield { progress: 100, message: 'done' };
  return `${parsed.length} documents indexed`;
}
```

Every `yield` becomes a `tool-progress` event in the stream.

### 🧑‍⚖️ Tool authorization
Protect tools with a `@Authorize` decorator and a pluggable `ToolAuthorizer` that sees the current request:

```typescript
@AgentTool({ name: 'delete_account', input: DeleteAccountDto })
@Authorize({ roles: ['admin'] })
async deleteAccount(input: DeleteAccountDto) { /* ... */ }

// In module options:
LangChainToolsModule.forRoot({
  toolAuthorizer: {
    authorize: ({ metadata, runtime }) => {
      const user = (runtime as Request).user;
      return metadata.roles!.every((r) => user.roles.includes(r));
    },
  },
})
```

### 🔭 Observability auto-wired
**LangSmith tracing** activates automatically when `LANGSMITH_API_KEY` is set. **Token + cost tracking** is active out of the box via `TokenUsageService`:

```typescript
constructor(private readonly usage: TokenUsageService) {}

@Get('usage')
billing() {
  const totals = this.usage.totals(); // { promptTokens, completionTokens, totalTokens, costUsd }
  const byModel = this.usage.breakdown(); // per-model USD breakdown
  const perSession = this.usage.totals('user_42'); // session-scoped
  return { totals, byModel, perSession };
}
```

Pricing ships for GPT-4o, Claude 3.x, Mistral Large, Haiku, and more — override per deployment with `.setPricing({ ... })`.

### 🧠 Memory & checkpointing
Single `sessionId` identifies a conversation thread. Plug any `SessionStore`:

```typescript
import { MongoSessionStore } from 'nestjs-langchain-tools/mongo';
import { RedisSessionStore } from 'nestjs-langchain-tools/redis';

LangChainToolsModule.forRoot({
  sessionStore: new MongoSessionStore({
    collection: client.db('app').collection('lc_sessions'),
    ttlSeconds: 60 * 60 * 24 * 7,
    maxMessages: 200,
    ensureIndexes: true,
  }),
  // Or use Redis for sub-ms latency:
  // sessionStore: new RedisSessionStore({ client: ioredis, ttlSeconds: 3600 }),
})
```

### 👥 Multi-agent supervisor
Coordinate specialists via a LangGraph supervisor:

```typescript
@Injectable()
@SupervisorAgent({
  name: 'TravelOrchestrator',
  workers: ['WeatherAgent', 'BookingAgent'],
  routingStrategy: 'llm',
  systemPrompt: 'Pick the best worker for each sub-task.',
})
export class TravelSupervisor {}
```

### ✋ Human-in-the-loop
```typescript
@AgentTool({ name: 'approve_wire', input: WireDto })
@HumanInterrupt({ prompt: 'Review and approve this wire transfer.' })
async wire(input: WireDto) { /* only runs after `coordinator.resume(threadId, decision)` */ }
```

### 🛠 Resilience
```typescript
import { withRetry } from 'nestjs-langchain-tools';

const result = await withRetry(() => model.invoke(messages), {
  maxAttempts: 4,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  factor: 2,
});
```
Automatic retry on 429 / 5xx / network errors with exponential backoff + jitter.

### 🧪 Testing harness
```typescript
import { LangChainToolsTestingModule, MockChatModel } from 'nestjs-langchain-tools/testing';

const mock = new MockChatModel({
  script: [
    { toolCalls: [{ name: 'get_weather', args: { location: 'Paris' } }] },
    'The weather in Paris is sunny.',
  ],
});

const moduleRef = await Test.createTestingModule({
  imports: [
    LangChainToolsTestingModule.forRoot({ llm: mock }),
    MyAgentsModule,
  ],
}).compile();
```

## Shipped adapters

| Sub-path | Capability | Peer dep |
|---|---|---|
| `nestjs-langchain-tools/redis` | `RedisSessionStore`, `createRedisCheckpointSaver` | `ioredis` or `redis` |
| `nestjs-langchain-tools/mongo` | `MongoSessionStore`, `createMongoCheckpointSaver`, `MongoAtlasVectorStore` | `mongodb` |
| `nestjs-langchain-tools/qdrant` | `QdrantVectorStore` | `@qdrant/js-client-rest` |
| `nestjs-langchain-tools/pgvector` | `PgVectorStore` (Postgres + pgvector extension) | `pg` |
| `nestjs-langchain-tools/pinecone` | `PineconeVectorStore` | `@pinecone-database/pinecone` |

All adapters accept a user-provided client — **no connection management inside the library**.

## Configuration reference

```typescript
LangChainToolsModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => ({
    // Coordinator
    coordinatorProvider: ModelProvider.ANTHROPIC,
    coordinatorModel: 'claude-3-7-sonnet-latest',
    coordinatorTemperature: 0.3,
    coordinatorUseMemory: true,
    coordinatorPrompt: 'You are a helpful concierge.',

    // Streaming
    enableStreaming: true,
    enableToolStreaming: true,

    // Memory
    sessionStore: new MongoSessionStore({ ... }),
    maxMessagesPerSession: 200,

    // Tools
    toolTimeout: { enabled: true, durationMs: 30_000 },
    toolAuthorizer: myAuthorizer,

    // Vector store (RAG)
    vectorStore: { type: VectorStoreType.CUSTOM, adapter: new QdrantVectorStore({...}) },

    // Escape hatches
    llmFactory: (ctx) => myCustomModel(ctx),   // provider-agnostic
    coordinatorLlm: preBuiltModel,             // bypass factory entirely
  }),
})
```

Every field is validated at boot by class-validator — misconfiguration fails fast with a descriptive error.

## Recipes

### RAG over a Postgres knowledge base
```typescript
import { Pool } from 'pg';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PgVectorStore } from 'nestjs-langchain-tools/pgvector';

const store = new PgVectorStore({
  client: new Pool({ connectionString: process.env.DATABASE_URL }),
  embeddings: new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' }),
  vectorSize: 1536,
  ensureTable: true,
});

@Injectable()
@ToolsAgent({ name: 'Support', description: '...', systemPrompt: '...' })
@WithRetrieval({ enabled: true, collectionName: 'kb', topK: 4 })
export class SupportAgent {}
```

### Streaming to a React UI via SSE
```typescript
// Client side
const es = new EventSource('/chat/stream?q=hello&sessionId=user_42');
es.addEventListener('token', (e) => append(JSON.parse(e.data).content));
es.addEventListener('tool-start', (e) => toast(`→ ${JSON.parse(e.data).tool}`));
es.addEventListener('complete', () => es.close());
```

### Multi-tenant per-user memory
```typescript
@Post('chat')
chat(@Body() body: ChatDto, @SessionId() sessionId: string) {
  return this.coordinator.processMessage(body.message, { sessionId });
}
```
`@SessionId()` resolves the session from `x-session-id` header → `req.user.id` → `req.user.sub` → `'default'`.

### Deny-by-default tool authorization
```typescript
LangChainToolsModule.forRoot({
  toolAuthorizer: {
    authorize: ({ metadata, runtime }) => {
      if (!metadata.roles?.length) return { allowed: true };
      const user = (runtime as { user?: { roles?: string[] } })?.user;
      return user?.roles?.some((r) => metadata.roles!.includes(r))
        ? { allowed: true }
        : { allowed: false, reason: 'insufficient role' };
    },
  },
})
```

## Health check

```typescript
import { LangChainHealthIndicator } from 'nestjs-langchain-tools/health';

@Controller('health')
export class HealthController {
  constructor(private readonly lc: LangChainHealthIndicator) {}
  @Get() check() { return this.lc.check('langchain'); }
}
```

A terminus-compatible variant (`LangChainTerminusIndicator`) ships in the same module for apps using `@nestjs/terminus`.

## Migration from v0.2

See [`MIGRATION-v0.2-to-v0.3.md`](./MIGRATION-v0.2-to-v0.3.md). Three breaking changes, most code is unaffected.

## Links

- Issues / feature requests: https://github.com/arthurmtro/nestjs-langchain-tools/issues
- License: MIT
