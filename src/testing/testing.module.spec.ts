import { Test } from '@nestjs/testing';
import { HumanMessage } from '@langchain/core/messages';
import { LangChainToolsTestingModule } from './testing.module';
import { MockChatModel } from './mock-chat-model';
import { LLM_FACTORY } from '../llm/llm-factory.provider';
import { MemoryService } from '../services/memory.service';
import { SESSION_STORE } from '../memory/session-store.interface';

describe('LangChainToolsTestingModule', () => {
  it('exposes the MockChatModel via LLM_FACTORY', async () => {
    const mock = new MockChatModel({ responses: ['hi'] });
    const moduleRef = await Test.createTestingModule({
      imports: [
        LangChainToolsTestingModule.forRoot({
          llm: mock as never,
        }),
      ],
    }).compile();

    const factory = moduleRef.get(LLM_FACTORY) as (
      ctx: { purpose: string; provider: string },
    ) => Promise<unknown>;
    expect(await factory({ purpose: 'agent', provider: 'openai' })).toBe(mock);
  });

  it('wires an in-memory session store and MemoryService that use it', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LangChainToolsTestingModule.forRoot()],
    }).compile();

    const memory = moduleRef.get(MemoryService);
    const store = moduleRef.get(SESSION_STORE) as {
      appendMessage: (id: string, msg: unknown) => void;
      getMessages: (id: string) => unknown[];
    };

    await memory.addHumanMessage('hi', 's1');
    expect(store.getMessages('s1')).toHaveLength(1);

    store.appendMessage('s1', new HumanMessage('direct'));
    expect((await memory.getMessages('s1')).length).toBe(2);
  });
});
