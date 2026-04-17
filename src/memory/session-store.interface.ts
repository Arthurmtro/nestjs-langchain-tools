import type { BaseMessage } from '@langchain/core/messages';

/**
 * Persistent store for per-session chat messages.
 *
 * Implementations can back the store with Redis, Postgres, DynamoDB, etc.
 * The default implementation keeps messages in memory (see
 * {@link InMemorySessionStore}).
 */
export interface SessionStore {
  getMessages(sessionId: string): Promise<BaseMessage[]> | BaseMessage[];
  appendMessage(
    sessionId: string,
    message: BaseMessage,
  ): Promise<void> | void;
  clear(sessionId: string): Promise<void> | void;
  listSessions(): Promise<string[]> | string[];
}

export const SESSION_STORE = Symbol('LANGCHAIN_SESSION_STORE');
