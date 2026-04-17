import type { StreamEvent } from '@langchain/core/tracers/log_stream';

/**
 * Typed, framework-neutral representation of an event emitted by the
 * coordinator. Consumers subscribe to an `Observable<CoordinatorStreamEvent>`
 * from {@link GraphCoordinatorService.processMessageStream} and render
 * each discriminated type to their UI / SSE channel.
 */
export type CoordinatorStreamEvent =
  | TokenEvent
  | ToolStartEvent
  | ToolEndEvent
  | ToolProgressEvent
  | AgentHandoffEvent
  | InterruptEvent
  | CompleteEvent
  | ErrorEvent;

export interface TokenEvent {
  type: 'token';
  content: string;
  agent?: string;
}

export interface ToolStartEvent {
  type: 'tool-start';
  tool: string;
  input: unknown;
  runId?: string;
}

export interface ToolEndEvent {
  type: 'tool-end';
  tool: string;
  output: unknown;
  runId?: string;
}

export interface ToolProgressEvent {
  type: 'tool-progress';
  tool: string;
  progress?: number;
  message?: string;
  data?: unknown;
}

export interface AgentHandoffEvent {
  type: 'agent-handoff';
  from: string;
  to: string;
}

export interface InterruptEvent {
  type: 'interrupt';
  threadId: string;
  reason: string;
  payload?: unknown;
}

export interface CompleteEvent {
  type: 'complete';
  content: string;
  threadId?: string;
}

export interface ErrorEvent {
  type: 'error';
  error: string;
}

interface ChatModelStreamData {
  chunk?: { content?: string | Array<string | { text?: string }> };
}

interface ToolProgressPayload {
  tool?: string;
  progress?: number;
  message?: string;
  data?: unknown;
}

interface AgentHandoffPayload {
  from?: string;
  to?: string;
}

/**
 * Maps a raw LangChain `streamEvents v2` chunk to our typed coordinator
 * event. Returns `undefined` for irrelevant events (chain start/end noise,
 * retriever events, etc.).
 */
export function mapStreamEvent(
  event: StreamEvent,
): CoordinatorStreamEvent | undefined {
  switch (event.event) {
    case 'on_chat_model_stream': {
      const data = event.data as ChatModelStreamData | undefined;
      const content = extractContent(data?.chunk?.content);
      if (!content) return undefined;
      const agent = readLanggraphNode(event.metadata);
      // The supervisor's `router` node invokes the LLM to pick the next
      // worker ("WeatherAgent" / "FINISH"). That output is internal — it
      // must never surface as user-facing content.
      if (agent === 'router') return undefined;
      return { type: 'token', content, agent };
    }
    case 'on_tool_start': {
      return {
        type: 'tool-start',
        tool: event.name,
        input: (event.data as { input?: unknown } | undefined)?.input,
        runId: event.run_id,
      };
    }
    case 'on_tool_end': {
      return {
        type: 'tool-end',
        tool: event.name,
        output: (event.data as { output?: unknown } | undefined)?.output,
        runId: event.run_id,
      };
    }
    case 'on_custom_event': {
      if (event.name === 'tool-progress') {
        const data = (event.data ?? {}) as ToolProgressPayload;
        return {
          type: 'tool-progress',
          tool: data.tool ?? 'unknown',
          progress: data.progress,
          message: data.message,
          data: data.data,
        };
      }
      if (event.name === 'agent-handoff') {
        const data = (event.data ?? {}) as AgentHandoffPayload;
        return {
          type: 'agent-handoff',
          from: data.from ?? 'unknown',
          to: data.to ?? 'unknown',
        };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

function extractContent(
  content: string | Array<string | { text?: string }> | undefined,
): string | undefined {
  if (!content) return undefined;
  if (typeof content === 'string') return content.length > 0 ? content : undefined;
  const joined = content
    .map((chunk) => {
      if (typeof chunk === 'string') return chunk;
      return chunk.text ?? '';
    })
    .join('');
  return joined.length > 0 ? joined : undefined;
}

function readLanggraphNode(metadata: Record<string, unknown> | undefined): string | undefined {
  if (!metadata) return undefined;
  const node = metadata['langgraph_node'];
  return typeof node === 'string' ? node : undefined;
}
