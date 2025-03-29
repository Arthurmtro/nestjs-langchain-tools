# Retrieval Augmented Generation (RAG) Support

This package includes built-in support for Retrieval Augmented Generation (RAG), allowing you to easily enhance your agents with access to external knowledge bases.

## Required Dependencies

To use RAG features, you need to install:

```bash
# Core dependencies (always required for RAG)
npm install @langchain/openai # For embeddings

# Vector store dependencies (install only what you need)
npm install @langchain/pinecone @pinecone-database/pinecone # For Pinecone
npm install @langchain/chroma chromadb # For Chroma
npm install @langchain/faiss # For FAISS file-based vector store
npm install @langchain/qdrant @qdrant/js-client-rest # For Qdrant
```

## Overview

RAG is a technique that improves LLM outputs by retrieving relevant information from a knowledge base before generating a response. This provides several benefits:

1. **Access to specific information** not in the model's training data
2. **Reduced hallucinations** by grounding responses in facts
3. **More up-to-date information** than what the model was trained on
4. **Domain-specific knowledge** for specialized applications

## Features

- Vector storage with multiple backend options
- Document processing utilities
- Automatic retrieval tool generation
- Seamless integration with agent-based architecture
- Support for multiple knowledge bases
- Metadata filtering and document chunking

## Setup

### Module Configuration

To enable RAG capabilities, configure the vector store when setting up the module:

```typescript
@Module({
  imports: [
    LangChainToolsModule.forRoot({
      // ... other options
      
      // Vector store configuration
      vectorStore: {
        // Memory store (simplest option, no persistent storage)
        type: VectorStoreType.MEMORY,
        collectionName: 'default'
        
        // OR - Pinecone (cloud vector database)
        // type: VectorStoreType.PINECONE,
        // apiKey: process.env.PINECONE_API_KEY,
        // environment: process.env.PINECONE_ENVIRONMENT,
        // indexName: 'my-index',
        // namespace: 'my-namespace',
        
        // OR - Chroma (local or remote vector database)
        // type: VectorStoreType.CHROMA,
        // url: 'http://localhost:8000',
        // collectionName: 'my-collection',
      },
      
      // Default embedding model
      embeddingModel: 'text-embedding-3-small'
    }),
  ],
  // ...
})
```

### Creating a RAG-Enabled Agent

There are two ways to enable RAG for an agent:

#### 1. Using the @WithRetrieval decorator

```typescript
@ToolsAgent({
  name: 'KnowledgeAgent',
  description: 'Can answer questions using a knowledge base',
  systemPrompt: 'You are a helpful knowledge assistant...',
  modelName: 'gpt-4o',
})
@WithRetrieval({
  enabled: true,
  collectionName: 'company_docs',
  topK: 5,                   // Number of documents to retrieve
  scoreThreshold: 0.7,       // Minimum similarity score (0-1)
  includeMetadata: true,     // Include document metadata in context
  storeRetrievedContext: true, // Save retrieved context to memory
})
@Injectable()
export class KnowledgeAgent {
  // ... agent implementation
}
```

#### 2. Using the agent options directly

```typescript
@ToolsAgent({
  name: 'KnowledgeAgent',
  description: 'Can answer questions using a knowledge base',
  systemPrompt: 'You are a helpful knowledge assistant...',
  modelName: 'gpt-4o',
  retrieval: {
    enabled: true,
    collectionName: 'company_docs',
    topK: 5,
    scoreThreshold: 0.7,
    includeMetadata: true,
    storeRetrievedContext: true,
  }
})
@Injectable()
export class KnowledgeAgent {
  // ... agent implementation
}
```

## Adding Documents to the Knowledge Base

Use the `VectorStoreService` to add documents to the knowledge base:

```typescript
@Injectable()
export class MyService {
  constructor(private readonly vectorStoreService: VectorStoreService) {
    this.initializeKnowledgeBase();
  }

  private async initializeKnowledgeBase(): Promise<void> {
    // Create a document
    const document = DocumentProcessor.fromText(
      "NestJS is a framework for building efficient, scalable Node.js server-side applications.",
      { title: 'NestJS Overview', source: 'documentation' }
    );

    // Add to knowledge base
    await this.vectorStoreService.addDocuments([document], 'my_collection', {
      splitDocument: true,  // Split document into chunks
      chunkSize: 1000,      // Characters per chunk
      chunkOverlap: 200,    // Overlap between chunks
      metadata: {           // Additional metadata to add to all chunks
        category: 'framework',
        language: 'typescript',
      }
    });
  }
}
```

### Loading Documents from Files

The `DocumentProcessor` utility helps with loading documents from various sources:

```typescript
// From a single file
const doc = await DocumentProcessor.fromFile('/path/to/document.pdf', {
  source: 'internal-docs'
});

// From a directory
const docs = await DocumentProcessor.fromDirectory('/path/to/docs', {
  recursive: true,              // Include subdirectories
  extensions: ['.md', '.txt'],  // Only certain file types
  metadata: { category: 'documentation' }
});

// Process documents in batches
const processedDocs = await DocumentProcessor.processDocuments(docs, {
  splitDocument: true,
  chunkSize: 1000,
  chunkOverlap: 200,
});

// Add to vector store
await vectorStoreService.addDocuments(processedDocs, 'my_collection');
```

## How It Works

When a RAG-enabled agent receives a query:

1. The query is sent to the vector store and similar documents are retrieved
2. Retrieved documents are formatted and added to the agent's context
3. The agent can also use the explicit `search_knowledge_base` tool to look up information
4. The agent generates a response grounded in the retrieved information

## Performance Considerations

- **Memory usage**: In-memory vector stores work well for smaller collections but use more RAM
- **Chunking strategy**: Adjust chunk size based on your content (smaller for dense text, larger for code)
- **Embedding model**: More powerful embedding models provide better semantic search but are more expensive
- **Retrieval parameters**: Adjust `topK` and `scoreThreshold` based on your needs

## Supported Vector Stores

- `VectorStoreType.MEMORY`: In-memory store (no persistence) - included in LangChain core
- `VectorStoreType.PINECONE`: Pinecone vector database (cloud) - requires `@langchain/pinecone` package
- `VectorStoreType.CHROMA`: Chroma vector database (local or remote) - requires `@langchain/chroma` package
- `VectorStoreType.FAISS`: FAISS vector database (local file-based) - requires `@langchain/faiss` package
- `VectorStoreType.QDRANT`: Qdrant vector database (local or remote) - requires `@langchain/qdrant` package
- `VectorStoreType.CUSTOM`: Custom vector store implementation

## Example Agent

See the example RAG agent in `test/example-app/agents/knowledge-agent.ts` for a complete implementation example.