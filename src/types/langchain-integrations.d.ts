// TypeScript declarations for dynamically imported LangChain integrations

// Pinecone
declare module '@pinecone-database/pinecone' {
  export class PineconeClient {
    init(config: { apiKey: string; environment: string }): Promise<void>;
    Index(name: string): any;
  }
}

declare module '@langchain/pinecone' {
  import { Embeddings } from '@langchain/core/embeddings';
  
  export class PineconeStore {
    static fromExistingIndex(
      embeddings: Embeddings,
      args: { pineconeIndex: any; namespace?: string }
    ): Promise<PineconeStore>;
  }
}

// Qdrant
declare module '@qdrant/js-client-rest' {
  export class QdrantClient {
    constructor(config: { url: string; apiKey?: string });
  }
}

declare module '@langchain/qdrant' {
  import { Embeddings } from '@langchain/core/embeddings';
  
  export class QdrantVectorStore {
    constructor(
      embeddings: Embeddings,
      args: { client: any; collectionName: string }
    );
  }
}

// Chroma
declare module '@langchain/chroma' {
  import { Embeddings } from '@langchain/core/embeddings';
  
  export class Chroma {
    constructor(
      embeddings: Embeddings,
      args: { url: string; collectionName: string }
    );
  }
}

// FAISS
declare module '@langchain/faiss' {
  import { Embeddings } from '@langchain/core/embeddings';
  
  export class FaissStore {
    constructor(embeddings: Embeddings, args: any);
    static load(path: string, embeddings: Embeddings): Promise<FaissStore>;
    save(path: string): Promise<void>;
  }
}