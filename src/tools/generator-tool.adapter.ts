import type { LangGraphRunnableConfig } from '@langchain/langgraph';

export interface ToolProgressYield<TData = unknown> {
  progress?: number;
  message?: string;
  data?: TData;
}

type DispatchCustomEvent = (
  name: string,
  payload: unknown,
  config?: LangGraphRunnableConfig,
) => Promise<void>;

/**
 * Drains an async-generator tool, dispatching each `yield` as a
 * `tool-progress` custom event (consumed by `mapStreamEvent`) and
 * returning the generator's final value as the tool's output.
 *
 * A generator tool looks like:
 *
 * ```ts
 * @AgentTool({ name: 'slow_work', input: WorkDto })
 * async *slowWork(input: WorkDto): AsyncGenerator<ToolProgressYield, string> {
 *   yield { progress: 10, message: 'parsing' };
 *   yield { progress: 90, message: 'finalizing' };
 *   return 'done';
 * }
 * ```
 */
export async function drainGenerator<TYield, TReturn>(
  toolName: string,
  iterator: AsyncGenerator<TYield, TReturn, unknown>,
): Promise<TReturn> {
  const dispatch = await loadDispatcher();
  while (true) {
    const step = await iterator.next();
    if (step.done) return step.value;
    if (dispatch) {
      const payload = normalizeProgress(step.value);
      try {
        await dispatch('tool-progress', { tool: toolName, ...payload });
      } catch {
        // Custom event dispatch is best-effort; ignore failures.
      }
    }
  }
}

export function isAsyncGeneratorFunction(
  fn: unknown,
): fn is (...args: readonly unknown[]) => AsyncGenerator<unknown, unknown, unknown> {
  if (typeof fn !== 'function') return false;
  const ctorName = (fn as { constructor?: { name?: string } }).constructor?.name;
  if (ctorName === 'AsyncGeneratorFunction') return true;
  const source = safeSource(fn);
  if (!source) return false;
  if (/^\s*(?:async\s+)?function\s*\*/.test(source)) return true;
  if (source.includes('__asyncGenerator')) return true;
  return false;
}

async function loadDispatcher(): Promise<DispatchCustomEvent | undefined> {
  try {
    const mod = (await import('@langchain/core/callbacks/dispatch')) as {
      dispatchCustomEvent?: DispatchCustomEvent;
    };
    return mod.dispatchCustomEvent;
  } catch {
    return undefined;
  }
}

function normalizeProgress(value: unknown): ToolProgressYield {
  if (value && typeof value === 'object') {
    const v = value as Partial<ToolProgressYield>;
    return {
      progress: typeof v.progress === 'number' ? v.progress : undefined,
      message: typeof v.message === 'string' ? v.message : undefined,
      data: v.data,
    };
  }
  if (typeof value === 'string') return { message: value };
  return { data: value };
}

function safeSource(fn: unknown): string | undefined {
  try {
    return Function.prototype.toString.call(fn as (...args: unknown[]) => unknown);
  } catch {
    return undefined;
  }
}
