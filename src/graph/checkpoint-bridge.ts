import type { BaseCheckpointSaver, MemorySaver } from '@langchain/langgraph';

type MemorySaverCtor = new () => MemorySaver;

/**
 * Lazy loader for LangGraph's `MemorySaver`. We don't import it at module
 * load time because LangGraph is an optional peer dependency — projects
 * that don't use the graph coordinator shouldn't pay the cost.
 */
export async function createDefaultCheckpointSaver(): Promise<BaseCheckpointSaver> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@langchain/langgraph') as {
    MemorySaver?: MemorySaverCtor;
  };
  if (!mod.MemorySaver) {
    throw new Error(
      '@langchain/langgraph is required. Install it: pnpm add @langchain/langgraph',
    );
  }
  return new mod.MemorySaver();
}

/**
 * Builds the `configurable` object passed to LangGraph invocations so that
 * checkpoints are scoped to a session. LangGraph uses `thread_id` as the
 * primary key — we map our `sessionId` onto it directly.
 */
export function graphConfig(
  sessionId: string,
): { configurable: { thread_id: string } } {
  return { configurable: { thread_id: sessionId } };
}
