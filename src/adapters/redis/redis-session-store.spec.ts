import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { RedisSessionStore, RedisClientLike } from './redis-session-store';

function makeClient(): RedisClientLike & {
  data: Map<string, string[]>;
  expire: jest.Mock;
  ltrim: jest.Mock;
} {
  const data = new Map<string, string[]>();
  return {
    data,
    rpush: jest.fn(async (key: string, value: string) => {
      const list = data.get(key) ?? [];
      list.push(value);
      data.set(key, list);
      return list.length;
    }),
    lrange: jest.fn(async (key: string, start: number, stop: number) => {
      const list = data.get(key) ?? [];
      const end = stop === -1 ? list.length : stop + 1;
      return list.slice(start, end);
    }),
    del: jest.fn(async (key: string) => {
      const existed = data.delete(key) ? 1 : 0;
      return existed;
    }),
    keys: jest.fn(async (pattern: string) => {
      const prefix = pattern.replace(/\*$/, '');
      return Array.from(data.keys()).filter((k) => k.startsWith(prefix));
    }),
    expire: jest.fn(async () => 1),
    ltrim: jest.fn(async (key: string, start: number, stop: number) => {
      const list = data.get(key) ?? [];
      const begin = start < 0 ? Math.max(list.length + start, 0) : start;
      const end = stop < 0 ? list.length + stop + 1 : stop + 1;
      data.set(key, list.slice(begin, end));
      return 'OK';
    }),
  };
}

describe('RedisSessionStore', () => {
  it('round-trips human and ai messages', async () => {
    const client = makeClient();
    const store = new RedisSessionStore({ client });
    await store.appendMessage('s1', new HumanMessage('hello'));
    await store.appendMessage('s1', new AIMessage('hi there'));
    const msgs = await store.getMessages('s1');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe('hello');
    expect(msgs[1].content).toBe('hi there');
  });

  it('isolates sessions', async () => {
    const client = makeClient();
    const store = new RedisSessionStore({ client });
    await store.appendMessage('a', new HumanMessage('one'));
    await store.appendMessage('b', new HumanMessage('two'));
    expect(await store.getMessages('a')).toHaveLength(1);
    expect(await store.getMessages('b')).toHaveLength(1);
  });

  it('applies ltrim when maxMessages is set', async () => {
    const client = makeClient();
    const store = new RedisSessionStore({ client, maxMessages: 2 });
    await store.appendMessage('s', new HumanMessage('1'));
    await store.appendMessage('s', new HumanMessage('2'));
    await store.appendMessage('s', new HumanMessage('3'));
    expect(client.ltrim).toHaveBeenCalled();
  });

  it('calls expire when ttlSeconds is set', async () => {
    const client = makeClient();
    const store = new RedisSessionStore({ client, ttlSeconds: 60 });
    await store.appendMessage('s', new HumanMessage('alive'));
    expect(client.expire).toHaveBeenCalledWith(expect.any(String), 60);
  });

  it('clears a session', async () => {
    const client = makeClient();
    const store = new RedisSessionStore({ client });
    await store.appendMessage('s', new HumanMessage('x'));
    await store.clear('s');
    expect(await store.getMessages('s')).toHaveLength(0);
  });

  it('lists sessions by scanning with prefix', async () => {
    const client = makeClient();
    const store = new RedisSessionStore({ client });
    await store.appendMessage('a', new HumanMessage('x'));
    await store.appendMessage('b', new HumanMessage('y'));
    const ids = await store.listSessions();
    expect(ids.sort()).toEqual(['a', 'b']);
  });
});
