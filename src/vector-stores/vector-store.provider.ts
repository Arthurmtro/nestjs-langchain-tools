import type { LangChainToolsModuleOptions } from '../config/module-options';
import {
  CustomVectorStoreOptions,
  VectorStoreType,
} from '../interfaces/vector-store.interface';
import { InMemoryVectorStore } from './in-memory.vector-store';
import type { VectorStoreAdapter } from './vector-store.interface';

export const VECTOR_STORE = Symbol('LANGCHAIN_VECTOR_STORE');

/**
 * Resolves a vector store adapter from module options. Falls back to
 * {@link InMemoryVectorStore} when no configuration is provided.
 */
export const DEFAULT_VECTOR_STORE = (
  options: LangChainToolsModuleOptions,
): VectorStoreAdapter => {
  const cfg = options.vectorStore;
  if (!cfg) return new InMemoryVectorStore();

  switch (cfg.type) {
    case VectorStoreType.MEMORY:
      return new InMemoryVectorStore();
    case VectorStoreType.CUSTOM: {
      const custom = cfg as CustomVectorStoreOptions & {
        adapter?: VectorStoreAdapter;
      };
      if (custom.adapter) return custom.adapter;
      throw new Error(
        'CUSTOM vector store requires an `adapter` implementing VectorStoreAdapter',
      );
    }
    default:
      // Pinecone / Chroma / FAISS / Qdrant require peer dependencies — the
      // adapter ships as a pluggable factory rather than a hard import.
      throw new Error(
        `Vector store type "${cfg.type}" is not bundled. Provide a custom adapter via vectorStore.type = CUSTOM or implement your own factory.`,
      );
  }
};

export { VectorStoreAdapter } from './vector-store.interface';
