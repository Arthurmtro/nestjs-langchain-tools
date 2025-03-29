import { Injectable } from '@nestjs/common';
import { ToolsAgent } from '../../../src/decorators/agent.decorator';
import { WithRetrieval } from '../../../src/decorators/with-retrieval.decorator';
import { AgentTool } from '../../../src/decorators/tool.decorator';
import { z } from 'zod';
import { VectorStoreService } from '../../../src/services/vector-store.service';
import { DocumentProcessor } from '../../../src/utils/document-processor';

/**
 * Example agent that demonstrates RAG functionality
 */
@ToolsAgent({
  name: 'KnowledgeAgent',
  description: 'Can answer questions using a knowledge base',
  systemPrompt: 'You are a helpful knowledge assistant that provides accurate information from the knowledge base. If the information is not available in the knowledge base, acknowledge that you don\'t know. Always cite your sources when you provide information.',
  modelName: 'gpt-4o',
  temperature: 0,
  useMemory: true,
})
@WithRetrieval({
  enabled: true,
  collectionName: 'knowledge_base',
  topK: 5,
  scoreThreshold: 0.7,
  includeMetadata: true,
  storeRetrievedContext: true,
})
@Injectable()
export class KnowledgeAgent {
  constructor(private readonly vectorStoreService: VectorStoreService) {
    // Initialize with some example documents
    this.initializeKnowledgeBase();
  }

  /**
   * Helper method to initialize the knowledge base with some example documents
   */
  private async initializeKnowledgeBase(): Promise<void> {
    // Create some example documents
    const documents = [
      DocumentProcessor.fromText(
        "NestJS is a framework for building efficient, scalable Node.js server-side applications. " +
        "It uses progressive JavaScript, is built with TypeScript and combines elements of OOP, FP, and FRP. " +
        "NestJS provides an out-of-the-box application architecture which allows developers to create highly testable, " +
        "scalable, loosely coupled, and easily maintainable applications.",
        { title: 'NestJS Overview', source: 'documentation', category: 'framework' }
      ),
      DocumentProcessor.fromText(
        "LangChain is a framework for developing applications powered by language models. It enables applications that " +
        "are data-aware (can connect to other data sources), agentic (can take actions), and stateful. " +
        "LangChain provides modules for working with LLMs, including prompts, chains, indexes, agents, and memory.",
        { title: 'LangChain Overview', source: 'documentation', category: 'framework' }
      ),
      DocumentProcessor.fromText(
        "Retrieval Augmented Generation (RAG) is a technique that enhances Large Language Models by retrieving " +
        "relevant information from external knowledge sources. RAG combines the power of pre-trained language models " +
        "with the ability to access and use specific information that wasn't part of the model's training data. " +
        "This makes it very useful for creating more accurate and up-to-date responses.",
        { title: 'RAG Overview', source: 'research paper', category: 'technique' }
      ),
      DocumentProcessor.fromText(
        "Vector databases store embeddings - mathematical representations of content that capture semantic meaning. " +
        "They allow for semantic search, where results are returned based on meaning rather than just keywords. " +
        "Popular vector databases include Pinecone, Chroma, FAISS, and Qdrant.",
        { title: 'Vector Databases', source: 'blog post', category: 'database' }
      ),
    ];

    // Add documents to the knowledge base
    await this.vectorStoreService.addDocuments(documents, 'knowledge_base', {
      // No need to split these small documents
      splitDocument: false,
    });
  }

  @AgentTool({
    name: 'add_to_knowledge_base',
    description: 'Add new information to the knowledge base',
    schema: z.object({
      content: z.string().describe('The content to add to the knowledge base'),
      title: z.string().optional().describe('Title or identifier for this content'),
      source: z.string().optional().describe('Source of the information'),
      category: z.string().optional().describe('Category or topic of the information'),
    }),
  })
  async addToKnowledgeBase(input: { 
    content: string;
    title?: string;
    source?: string;
    category?: string;
  }): Promise<string> {
    try {
      // Create document with metadata
      const document = DocumentProcessor.fromText(
        input.content,
        {
          title: input.title || 'User Input',
          source: input.source || 'User',
          category: input.category || 'General',
          timestamp: new Date().toISOString(),
        }
      );

      // Add to knowledge base
      await this.vectorStoreService.addDocuments([document], 'knowledge_base', {
        splitDocument: true,  // Split longer documents
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      return `Successfully added to knowledge base: "${input.title || 'New content'}"`;
    } catch (error) {
      return `Error adding to knowledge base: ${(error as Error).message}`;
    }
  }

  @AgentTool({
    name: 'analyze_document',
    description: 'Analyze a document and extract key information',
    schema: z.object({
      text: z.string().describe('The document text to analyze'),
      focus: z.string().optional().describe('What aspect to focus on (e.g., "main points", "technical details")'),
    }),
  })
  async analyzeDocument(input: {
    text: string;
    focus?: string;
  }): Promise<string> {
    // This is just a demonstration tool that doesn't actually use RAG
    // Real implementation would use more sophisticated analysis
    
    const focusArea = input.focus || 'main points';
    const textLength = input.text.length;
    const wordCount = input.text.split(/\s+/).length;
    
    return `
Document Analysis (focusing on: ${focusArea})
----------------------------------------------
Length: ${textLength} characters
Word count: approximately ${wordCount} words

Note: This is a simple analysis. For more detailed insights, you can add this document to the knowledge base 
and then query specific aspects of it.
    `;
  }
}