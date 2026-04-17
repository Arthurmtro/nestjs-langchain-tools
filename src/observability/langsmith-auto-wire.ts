import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';

/**
 * Detects whether LangSmith tracing should be enabled, based on the
 * standard environment variables used by the LangSmith SDK.
 *
 * - `LANGSMITH_API_KEY` / `LANGCHAIN_API_KEY` — API key for the LangSmith
 *   workspace. Presence of either implies tracing is desired.
 * - `LANGSMITH_TRACING=true` / `LANGCHAIN_TRACING_V2=true` — explicit opt-in
 *   without an API key (useful for self-hosted LangSmith).
 */
export function langSmithEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.LANGSMITH_API_KEY || env.LANGCHAIN_API_KEY) return true;
  return (
    env.LANGSMITH_TRACING === 'true' ||
    env.LANGCHAIN_TRACING_V2 === 'true'
  );
}

/**
 * Builds a `LangChainTracer` callback handler when tracing is enabled. The
 * caller is expected to push the returned handler into the `callbacks`
 * array of any model / runnable it instantiates.
 *
 * Returns `undefined` when tracing is disabled so the caller can skip the
 * allocation entirely.
 */
type LangChainTracerCtor = new (fields?: {
  projectName?: string;
}) => LangChainTracer;

export async function createLangSmithTracer(
  env: NodeJS.ProcessEnv = process.env,
): Promise<BaseCallbackHandler | undefined> {
  if (!langSmithEnabled(env)) return undefined;
  try {
    const mod = (await import('@langchain/core/tracers/tracer_langchain')) as {
      LangChainTracer: LangChainTracerCtor;
    };
    return new mod.LangChainTracer({
      projectName: env.LANGSMITH_PROJECT ?? env.LANGCHAIN_PROJECT,
    });
  } catch {
    return undefined;
  }
}
