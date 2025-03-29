import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { DocumentIngestionOptions } from '../interfaces/vector-store.interface';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

/**
 * Utility class for document processing
 */
export class DocumentProcessor {
  /**
   * Splits a document into chunks
   * 
   * @param document - Document to split
   * @param options - Splitting options
   * @returns Array of chunked documents
   */
  static async splitDocument(
    document: Document,
    options: {
      chunkSize?: number;
      chunkOverlap?: number;
    } = {}
  ): Promise<Document[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: options.chunkSize || 1000,
      chunkOverlap: options.chunkOverlap || 200,
    });
    
    return await splitter.splitDocuments([document]);
  }
  
  /**
   * Creates a document from text
   * 
   * @param text - Document text
   * @param metadata - Optional metadata
   * @returns Document object
   */
  static fromText(
    text: string,
    metadata: Record<string, any> = {}
  ): Document {
    return new Document({
      pageContent: text,
      metadata,
    });
  }
  
  /**
   * Creates a document from a file
   * 
   * @param filePath - Path to the file
   * @param metadata - Additional metadata
   * @returns Document object
   */
  static async fromFile(
    filePath: string,
    metadata: Record<string, any> = {}
  ): Promise<Document> {
    // Read the file
    const content = await fs.promises.readFile(filePath, 'utf-8');
    
    // Get file information
    const fileInfo = path.parse(filePath);
    const fileMetadata = {
      source: filePath,
      filename: fileInfo.base,
      extension: fileInfo.ext.slice(1), // Remove the dot
      ...metadata,
    };
    
    return new Document({
      pageContent: content,
      metadata: fileMetadata,
    });
  }
  
  /**
   * Loads documents from a directory
   * 
   * @param directoryPath - Path to the directory
   * @param options - Loading options
   * @returns Array of documents
   */
  static async fromDirectory(
    directoryPath: string,
    options: {
      recursive?: boolean;
      extensions?: string[];
      metadata?: Record<string, any>;
    } = {}
  ): Promise<Document[]> {
    const documents: Document[] = [];
    const allowedExtensions = options.extensions || ['.txt', '.md', '.html', '.csv', '.json'];
    
    // Helper function to process files in a directory
    const processDirectory = async (dirPath: string) => {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory() && options.recursive) {
          // Process subdirectory if recursive is true
          await processDirectory(fullPath);
        } else if (entry.isFile()) {
          // Check if the file extension is allowed
          const ext = path.extname(entry.name).toLowerCase();
          if (allowedExtensions.includes(ext)) {
            try {
              const doc = await DocumentProcessor.fromFile(fullPath, options.metadata);
              documents.push(doc);
            } catch (error) {
              console.error(`Error processing file ${fullPath}: ${(error as Error).message}`);
            }
          }
        }
      }
    };
    
    await processDirectory(directoryPath);
    return documents;
  }
  
  /**
   * Processes a stream into a document
   * 
   * @param stream - Readable stream
   * @param metadata - Document metadata
   * @returns Document object
   */
  static async fromStream(
    stream: Readable,
    metadata: Record<string, any> = {}
  ): Promise<Document> {
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => {
        const content = Buffer.concat(chunks).toString('utf-8');
        resolve(new Document({ pageContent: content, metadata }));
      });
    });
  }
  
  /**
   * Processes documents in batch according to ingestion options
   * 
   * @param documents - Input documents
   * @param options - Processing options
   * @returns Processed documents
   */
  static async processDocuments(
    documents: Document[],
    options: DocumentIngestionOptions = {}
  ): Promise<Document[]> {
    // Apply metadata
    const docsWithMetadata = documents.map(doc => ({
      ...doc,
      metadata: { ...doc.metadata, ...options.metadata },
    }));
    
    // Split if requested
    if (options.splitDocument) {
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: options.chunkSize || 1000,
        chunkOverlap: options.chunkOverlap || 200,
      });
      
      const splitResults = await Promise.all(
        docsWithMetadata.map(doc => splitter.splitDocuments([doc]))
      );
      
      return splitResults.flat();
    }
    
    return docsWithMetadata;
  }
}