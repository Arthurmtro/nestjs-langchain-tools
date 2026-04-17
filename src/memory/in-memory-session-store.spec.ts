import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { InMemorySessionStore } from './in-memory-session-store';

describe('InMemorySessionStore', () => {
  it('appends messages per session', () => {
    const store = new InMemorySessionStore();
    store.appendMessage('a', new HumanMessage('hi'));
    store.appendMessage('a', new AIMessage('hello'));
    store.appendMessage('b', new HumanMessage('other'));
    expect(store.getMessages('a')).toHaveLength(2);
    expect(store.getMessages('b')).toHaveLength(1);
  });

  it('caps messages at maxMessages and drops oldest first', () => {
    const store = new InMemorySessionStore({ maxMessages: 2 });
    store.appendMessage('s', new HumanMessage('1'));
    store.appendMessage('s', new HumanMessage('2'));
    store.appendMessage('s', new HumanMessage('3'));
    const msgs = store.getMessages('s');
    expect(msgs.map((m) => m.content)).toEqual(['2', '3']);
  });

  it('respects ttlMs', () => {
    jest.useFakeTimers();
    try {
      const store = new InMemorySessionStore({ ttlMs: 1000 });
      store.appendMessage('t', new HumanMessage('alive'));
      jest.setSystemTime(Date.now() + 2000);
      expect(store.getMessages('t')).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears a session', () => {
    const store = new InMemorySessionStore();
    store.appendMessage('c', new HumanMessage('x'));
    store.clear('c');
    expect(store.getMessages('c')).toHaveLength(0);
  });

  it('lists active sessions and excludes expired ones', () => {
    jest.useFakeTimers();
    try {
      const store = new InMemorySessionStore({ ttlMs: 500 });
      store.appendMessage('a', new HumanMessage('1'));
      store.appendMessage('b', new HumanMessage('1'));
      jest.setSystemTime(Date.now() + 1000);
      expect(store.listSessions()).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
