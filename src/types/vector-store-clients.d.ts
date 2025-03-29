// Type definitions for dynamically imported vector store clients
// This allows us to use dynamic imports without TypeScript errors

declare module '@pinecone-database/pinecone' {
  export class PineconeClient {
    init(config: { apiKey: string; environment: string }): Promise<void>;
    Index(name: string): any;
  }
}

declare module '@qdrant/js-client-rest' {
  export class QdrantClient {
    constructor(config: { url: string; apiKey?: string });
  }
}