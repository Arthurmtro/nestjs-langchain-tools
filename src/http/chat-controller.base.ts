import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { GraphCoordinatorService } from '../graph/graph-coordinator.service';
import type { CoordinatorStreamEvent } from '../graph/stream-events';

export interface ChatRequestBody {
  message: string;
  sessionId?: string;
}

export interface ServerSentEvent {
  data: CoordinatorStreamEvent;
  type?: string;
}

/**
 * Minimal chat controller base class. Subclass it and mark the subclass
 * with `@Controller('chat')` to expose:
 *
 * - `POST /chat` → synchronous message processing
 * - `GET /chat/stream?q=...&sessionId=...` → SSE event stream
 *
 * Both methods default the session identifier to the `x-session-id`
 * header if no explicit value is given (see {@link resolveSessionId}).
 * Override the resolver for richer behaviour (JWT sub, OAuth user id).
 */
@Controller()
export abstract class LangChainChatController {
  protected abstract coordinator: GraphCoordinatorService;

  @Post()
  async chat(@Body() body: ChatRequestBody): Promise<{ reply: string }> {
    const sessionId = this.resolveSessionId(body.sessionId);
    const reply = await this.coordinator.processMessage(body.message, {
      sessionId,
    });
    return { reply };
  }

  @Sse('stream')
  stream(
    @Query('q') q: string,
    @Query('sessionId') sessionIdRaw?: string,
  ): Observable<ServerSentEvent> {
    const sessionId = this.resolveSessionId(sessionIdRaw);
    return this.coordinator
      .processMessageStream(q, { sessionId })
      .pipe(map((event) => ({ data: event, type: event.type })));
  }

  @Get('healthz')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Strategy hook for session identification. Default: use the provided
   * value, else fall back to `"default"`. Override to pull from request
   * headers / auth principal.
   */
  protected resolveSessionId(provided?: string): string {
    return provided && provided.length > 0 ? provided : 'default';
  }
}
