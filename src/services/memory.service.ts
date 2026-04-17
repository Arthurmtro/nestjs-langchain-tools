import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
} from '@langchain/core/messages';
import { InMemorySessionStore } from '../memory/in-memory-session-store';
import {
  SESSION_STORE,
  SessionStore,
} from '../memory/session-store.interface';

/**
 * Thin facade over the configured {@link SessionStore} — gives the
 * graph coordinator (and your controllers) a stable message-oriented API
 * without exposing the raw store.
 *
 * LangGraph handles conversation state via checkpointers; this service
 * exists for callers that want a flat message-log view (admin panel,
 * analytics, export).
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly store: SessionStore;

  constructor(
    @Optional() @Inject(SESSION_STORE) store?: SessionStore,
  ) {
    this.store = store ?? new InMemorySessionStore();
  }

  async getMessages(sessionId = 'default'): Promise<BaseMessage[]> {
    return Promise.resolve(this.store.getMessages(sessionId));
  }

  async addHumanMessage(text: string, sessionId = 'default'): Promise<void> {
    await this.store.appendMessage(sessionId, new HumanMessage(text));
    this.logger.debug(`Added human message to ${sessionId}`);
  }

  async addAIMessage(text: string, sessionId = 'default'): Promise<void> {
    await this.store.appendMessage(sessionId, new AIMessage(text));
    this.logger.debug(`Added AI message to ${sessionId}`);
  }

  async clearMemory(sessionId = 'default'): Promise<void> {
    await this.store.clear(sessionId);
  }

  async listSessions(): Promise<string[]> {
    return Promise.resolve(this.store.listSessions());
  }
}
