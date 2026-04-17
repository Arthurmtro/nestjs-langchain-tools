# Migration guide: v0.2 → v0.3

v0.3 is a targeted upgrade. Most code compiles unchanged. Three breaking changes; the rest are additions.

## Breaking changes

### 1. A new coordinator is now the recommended default

`GraphCoordinatorService` (based on `@langchain/langgraph`'s `createReactAgent`) is registered alongside the legacy `CoordinatorService`.

- **If you want v0.2 behaviour**: keep injecting `CoordinatorService`. Nothing changes; no migration needed.
- **If you want the new streaming/HITL/checkpointing**: inject `GraphCoordinatorService` instead.

```diff
- constructor(private readonly coordinator: CoordinatorService) {}
+ constructor(private readonly coordinator: GraphCoordinatorService) {}
```

Both expose `processMessage()` and `processMessageStream()` with the same signatures.

### 2. `processMessageStream` event types extended

v0.2 emitted `{ type: 'token' | 'tool-start' | 'tool-end' | 'complete' | 'error' }`. v0.3 adds:
- `'tool-progress'` — emitted by async-generator tools via `yield`
- `'agent-handoff'` — emitted when a supervisor routes between workers
- `'interrupt'` — emitted when a tool marked `@HumanInterrupt` pauses

If you `switch` on `event.type`, add cases for the new types (or a default branch). No field of the existing event types changed.

### 3. `@langchain/langgraph` is a soft-required peer dependency

The legacy `CoordinatorService` still runs without LangGraph installed, but `GraphCoordinatorService` / `@SupervisorAgent` / `@HumanInterrupt` require it. Install if you use these features:

```bash
pnpm add @langchain/langgraph
```

## Additions you can opt into

### Auto-wired LangSmith
Set `LANGSMITH_API_KEY` (or `LANGCHAIN_API_KEY`) in your environment. That's it — every LLM call is traced automatically.

### Auto-wired token + cost tracking
`TokenUsageService` is now injected into the default LLM factory and records every call, computes USD cost from a built-in pricing table. Inject the service wherever you want the data:

```typescript
constructor(private readonly usage: TokenUsageService) {}

billing() {
  return this.usage.totals(sessionId); // includes costUsd
}
```

### Adapters for real backends
v0.2 shipped only in-memory stores. v0.3 ships:

```typescript
import { MongoSessionStore } from 'nestjs-langchain-tools/mongo';
import { RedisSessionStore } from 'nestjs-langchain-tools/redis';
import { QdrantVectorStore } from 'nestjs-langchain-tools/qdrant';
import { PgVectorStore } from 'nestjs-langchain-tools/pgvector';
import { PineconeVectorStore } from 'nestjs-langchain-tools/pinecone';
```

Each accepts a user-provided client (`ioredis`, `mongodb`, `pg`, etc.). No connection management inside the library.

### Async generator tools
```diff
- @AgentTool({ name: 'index', input: Dto })
- async index(input: Dto): Promise<string> {
-   this.toolStream.updateToolProgress('index', 'parsing', 10);
-   // ...
-   return result;
- }
+ @AgentTool({ name: 'index', input: Dto, streaming: true })
+ async *index(input: Dto): AsyncGenerator<{ progress: number; message: string }, string> {
+   yield { progress: 10, message: 'parsing' };
+   // ...
+   return result;
+ }
```

The old manual `updateToolProgress` API still works.

### Human-in-the-loop
```typescript
@AgentTool({ name: 'wire', input: WireDto })
@HumanInterrupt({ prompt: 'Approve?' })
async wire(input: WireDto) { /* only after resume(threadId, ...) */ }
```
Get the `threadId` from the `interrupt` event in the stream, surface it to the operator, then call `coordinator.resume(threadId, decision)`.

### `LangChainChatController` base class
Scrap your hand-rolled controller:

```diff
- @Controller('chat')
- export class ChatController {
-   constructor(private readonly coordinator: GraphCoordinatorService) {}
-   @Post() chat(@Body() body) { return this.coordinator.processMessage(body.message); }
-   @Sse('stream') stream(@Query('q') q: string) {
-     return this.coordinator.processMessageStream(q).pipe(map(e => ({ data: e })));
-   }
- }
+ import { LangChainChatController } from 'nestjs-langchain-tools/http';
+ @Controller('chat')
+ export class ChatController extends LangChainChatController {
+   constructor(protected coordinator: GraphCoordinatorService) { super(); }
+ }
```

### `withRetry` helper
```typescript
import { withRetry } from 'nestjs-langchain-tools';
const result = await withRetry(() => model.invoke(msgs));
```

## Minor changes that should be transparent

- `tsconfig` `target` bumped from `es2017` to `es2021` (async generators compile natively)
- `TokenUsageService.record()` now returns the recorded entry (was `void`) and includes `costUsd`. Existing usages keep working since you can ignore the return value.
- `TokenUsageService.totals()` now returns `{ promptTokens, completionTokens, totalTokens, costUsd }`. If your code did `.toEqual({ promptTokens, completionTokens, totalTokens })`, loosen to `.toMatchObject(...)`.
- `validateModuleOptions` no longer fails when module options include class instances (e.g. `coordinatorLlm: new MockChatModel(...)`). Previously class-transformer would try to rebuild them.

## Removed (was deprecated)

Nothing. All v0.2 exports remain.
