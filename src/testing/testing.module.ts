import { DynamicModule, Module } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { LangChainToolsModule } from '../modules/langchain-tools.module';
import type { LlmFactory } from '../llm/llm-factory.interface';
import type { SessionStore } from '../memory/session-store.interface';
import { InMemorySessionStore } from '../memory/in-memory-session-store';
import { InMemoryVectorStore } from '../vector-stores/in-memory.vector-store';
import { DeterministicHashEmbeddings } from '../vector-stores/embeddings';
import { MockChatModel } from './mock-chat-model';

export interface LangChainToolsTestingModuleOptions {
  /** Pre-built LLM used for every agent & the coordinator. */
  llm?: BaseChatModel;
  /** Alternative custom factory — takes precedence over `llm`. */
  llmFactory?: LlmFactory;
  /** Custom session store (defaults to in-memory). */
  sessionStore?: SessionStore;
}

/**
 * Drop-in testing module providing a MockChatModel + in-memory session &
 * vector stores, so agent tests run offline and deterministically.
 *
 * ```ts
 * const module = await Test.createTestingModule({
 *   imports: [
 *     LangChainToolsTestingModule.forRoot({
 *       llm: new MockChatModel({ responses: ['Paris'] }),
 *     }),
 *     MyAgentsModule,
 *   ],
 * }).compile();
 * ```
 */
@Module({})
export class LangChainToolsTestingModule {
  static forRoot(
    options: LangChainToolsTestingModuleOptions = {},
  ): DynamicModule {
    const mockModel: BaseChatModel = options.llm ?? new MockChatModel();
    const factory: LlmFactory = options.llmFactory ?? (() => mockModel);
    return {
      module: LangChainToolsTestingModule,
      imports: [
        LangChainToolsModule.forRoot({
          llmFactory: factory,
          coordinatorLlm: mockModel,
          coordinatorUseMemory: false,
          sessionStore: options.sessionStore ?? new InMemorySessionStore(),
          vectorStore: undefined,
        }),
      ],
      exports: [LangChainToolsModule],
    };
  }
}

/** Re-exports for test ergonomics. */
export {
  MockChatModel,
  InMemoryVectorStore,
  InMemorySessionStore,
  DeterministicHashEmbeddings,
};
