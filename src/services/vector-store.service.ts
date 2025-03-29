import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { DocumentSearchResult, DocumentIngestionOptions, DocumentQueryOptions } from '../interfaces/vector-store.interface';

/**
 * Simple mock implementation of the vector store service for demo and testing
 * This avoids the need to install specific vector store dependencies
 */
@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);
  private readonly collections: Map<string, Document[]> = new Map();
  private embeddings: any;

  constructor() {
    this.logger.log('Initializing mock vector store service');
    // Initialize with default empty collection
    this.collections.set('default', []);
    this.collections.set('knowledge_base', []);
    
    // Create simple embeddings model (or mock one if OpenAI not available)
    try {
      this.embeddings = new OpenAIEmbeddings({
        modelName: 'text-embedding-3-small'
      });
    } catch (error) {
      this.logger.warn('Could not initialize OpenAIEmbeddings, using mock embeddings');
      this.embeddings = {
        embedQuery: async (text: string) => {
          // Simple mock - just return random numbers
          return Array.from({ length: 10 }, () => Math.random());
        }
      };
    }
  }

  /**
   * Gets or creates a vector store collection
   */
  async getVectorStore(collectionName: string = 'default'): Promise<any> {
    if (!this.collections.has(collectionName)) {
      this.collections.set(collectionName, []);
      this.logger.log(`Created new collection: ${collectionName}`);
    }
    return { collection: collectionName };
  }

  /**
   * Adds documents to the vector store
   */
  async addDocuments(
    documents: Document[] | string[],
    collectionName: string = 'default',
    options: DocumentIngestionOptions = {}
  ): Promise<number> {
    try {
      // Normalize documents if they're strings
      const docs: Document[] = documents.map(doc => {
        if (typeof doc === 'string') {
          return new Document({
            pageContent: doc,
            metadata: options.metadata || {},
          });
        }
        return {
          ...doc,
          metadata: { ...doc.metadata, ...options.metadata },
        };
      });

      // Get the collection
      if (!this.collections.has(collectionName)) {
        this.collections.set(collectionName, []);
      }
      
      // Add documents to collection
      const collection = this.collections.get(collectionName)!;
      collection.push(...docs);
      
      this.logger.log(`Added ${docs.length} documents to collection ${collectionName}`);
      return docs.length;
    } catch (error) {
      this.logger.error(`Error adding documents: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Simple similarity search using basic string matching
   */
  async similaritySearch(
    query: string,
    collectionName: string = 'default',
    options: DocumentQueryOptions = {}
  ): Promise<DocumentSearchResult[]> {
    try {
      // Get collection
      if (!this.collections.has(collectionName)) {
        return [];
      }
      
      const collection = this.collections.get(collectionName)!;
      
      // Set defaults
      const k = options.limit || 4;
      
      // Simple keyword search (this is a mockup, not actual vector similarity)
      const queryWords = query.toLowerCase().split(/\s+/);
      
      // Score documents by matching words
      const scoredDocs = collection.map(doc => {
        const content = doc.pageContent.toLowerCase();
        // Count matching words
        const matchingWords = queryWords.filter(word => content.includes(word));
        const score = matchingWords.length / queryWords.length;
        
        return {
          document: doc,
          score: score || 0.1, // Ensure some minimal score
        };
      });
      
      // Sort by score and take top k
      const results = scoredDocs
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
      
      // Filter by minimum score if specified
      const filteredResults = options.minScore
        ? results.filter(result => result.score >= (options.minScore || 0))
        : results;
      
      this.logger.log(`Found ${filteredResults.length} results for query in collection ${collectionName}`);
      return filteredResults;
    } catch (error) {
      this.logger.error(`Error searching documents: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Creates a RAG context from a query
   */
  async createRagContext(
    query: string,
    collectionName: string = 'default',
    options: DocumentQueryOptions = {}
  ): Promise<string> {
    try {
      // Get relevant documents
      const results = await this.similaritySearch(query, collectionName, options);
      
      if (results.length === 0) {
        return '';
      }
      
      // Format documents into context
      let context = 'Relevant information from knowledge base:\n\n';
      
      results.forEach((result, index) => {
        const { document, score } = result;
        context += `[Document ${index + 1}] ${document.pageContent}\n\n`;
        
        // Add metadata if available and relevant
        if (document.metadata && Object.keys(document.metadata).length > 0) {
          const metadataStr = Object.entries(document.metadata)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          context += `Source: ${metadataStr}\n\n`;
        }
      });
      
      return context;
    } catch (error) {
      this.logger.error(`Error creating RAG context: ${(error as Error).message}`);
      return '';
    }
  }
  
  /**
   * Delete documents from collection (mock implementation)
   */
  async deleteDocuments(
    filter: Record<string, any>,
    collectionName: string = 'default'
  ): Promise<boolean> {
    this.logger.log(`Mock deletion from collection ${collectionName}`);
    return true;
  }
}