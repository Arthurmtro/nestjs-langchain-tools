import type { BaseMessage } from '@langchain/core/messages';
import type { SessionStore } from './session-store.interface';

interface SessionEntry {
  messages: BaseMessage[];
  expiresAt?: number;
}

export interface InMemorySessionStoreOptions {
  /** Maximum number of messages kept per session. Older messages are dropped. */
  maxMessages?: number;
  /** Time-to-live for a session in milliseconds. */
  ttlMs?: number;
}

/**
 * Default in-memory {@link SessionStore}.
 *
 * Suitable for single-instance deployments and tests. For multi-replica
 * production environments supply a Redis-backed implementation via
 * `sessionStore` in module options.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(private readonly options: InMemorySessionStoreOptions = {}) {}

  getMessages(sessionId: string): BaseMessage[] {
    const entry = this.readEntry(sessionId);
    return entry ? [...entry.messages] : [];
  }

  appendMessage(sessionId: string, message: BaseMessage): void {
    const entry = this.sessions.get(sessionId) ?? this.createEntry();
    entry.messages.push(message);
    if (
      this.options.maxMessages &&
      entry.messages.length > this.options.maxMessages
    ) {
      entry.messages.splice(0, entry.messages.length - this.options.maxMessages);
    }
    if (this.options.ttlMs) {
      entry.expiresAt = Date.now() + this.options.ttlMs;
    }
    this.sessions.set(sessionId, entry);
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  listSessions(): string[] {
    this.purgeExpired();
    return Array.from(this.sessions.keys());
  }

  private readEntry(sessionId: string): SessionEntry | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return entry;
  }

  private createEntry(): SessionEntry {
    return {
      messages: [],
      expiresAt: this.options.ttlMs
        ? Date.now() + this.options.ttlMs
        : undefined,
    };
  }

  private purgeExpired(): void {
    if (!this.options.ttlMs) return;
    const now = Date.now();
    for (const [id, entry] of this.sessions) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.sessions.delete(id);
      }
    }
  }
}
