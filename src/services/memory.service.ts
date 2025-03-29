import { Injectable, Logger } from '@nestjs/common';
import { BaseChatMemory } from 'langchain/memory';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { ChatMessageHistory } from 'langchain/stores/message/in_memory';

/**
 * Memory service that provides persistent memory across requests
 * This is a simple in-memory implementation - in production you would use
 * a database or Redis for persistence
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly sessionMemory = new Map<string, BaseMessage[]>();

  /**
   * Retrieves the chat history for a session
   * 
   * @param sessionId - The session identifier
   * @returns Array of chat messages
   */
  getMessages(sessionId: string = 'default'): BaseMessage[] {
    if (!this.sessionMemory.has(sessionId)) {
      this.sessionMemory.set(sessionId, []);
    }
    return this.sessionMemory.get(sessionId) || [];
  }

  /**
   * Adds a human message to the chat history
   * 
   * @param text - The message content
   * @param sessionId - The session identifier
   */
  addHumanMessage(text: string, sessionId: string = 'default'): void {
    const messages = this.getMessages(sessionId);
    messages.push(new HumanMessage(text));
    this.logger.debug(`Added human message to session ${sessionId}: ${text}`);
  }

  /**
   * Adds an AI message to the chat history
   * 
   * @param text - The message content
   * @param sessionId - The session identifier
   */
  addAIMessage(text: string, sessionId: string = 'default'): void {
    const messages = this.getMessages(sessionId);
    messages.push(new AIMessage(text));
    this.logger.debug(`Added AI message to session ${sessionId}: ${text}`);
  }

  /**
   * Clears the chat history for a session
   * 
   * @param sessionId - The session identifier
   */
  clearMemory(sessionId: string = 'default'): void {
    this.sessionMemory.set(sessionId, []);
    this.logger.debug(`Cleared memory for session ${sessionId}`);
  }

  /**
   * Creates a LangChain chat memory for a session
   * This adapts our memory service to work with LangChain agents
   * 
   * @param sessionId - The session identifier
   * @returns LangChain-compatible chat memory
   */
  getChatMemoryForSession(sessionId: string = 'default'): BaseChatMemory {
    return new SessionMemoryAdapter(this, sessionId);
  }

  /**
   * Lists all active session IDs
   * 
   * @returns Array of session IDs
   */
  listSessions(): string[] {
    return Array.from(this.sessionMemory.keys());
  }
}

/**
 * Adapter class to make our memory service compatible with LangChain
 */
class SessionMemoryAdapter extends BaseChatMemory {
  chatHistory: ChatMessageHistory;
  private readonly memoryKeyName: string = "chat_history";
  
  constructor(
    private readonly memoryService: MemoryService,
    private readonly sessionId: string = 'default',
  ) {
    super();
    // Set input and output keys
    this.inputKey = "input";
    this.outputKey = "output";
    
    this.chatHistory = new ChatMessageHistory();
    
    // Pre-populate the chat history with existing messages
    const existingMessages = this.memoryService.getMessages(this.sessionId);
    if (existingMessages.length > 0) {
      for (const message of existingMessages) {
        this.chatHistory.addMessage(message);
      }
    }
  }

  /**
   * Returns the memory variables stored in this memory
   */
  async loadMemoryVariables(): Promise<Record<string, any>> {
    const messages = await this.chatHistory.getMessages();
    return { [this.memoryKeyName]: messages };
  }
  
  /**
   * Override saveContext to update our memory service
   */
  async saveContext(inputValues: Record<string, any>, outputValues: Record<string, any>): Promise<void> {
    // Ensure we have input and output keys
    const inputKey = this.inputKey || "input";
    const outputKey = this.outputKey || "output";
    
    // Get the input and output values
    const input = inputValues[inputKey];
    const output = outputValues[outputKey];
    
    // First save using the parent class method
    await super.saveContext(inputValues, outputValues);
    
    // Then update our memory service
    if (typeof input === 'string') {
      this.memoryService.addHumanMessage(input, this.sessionId);
    }
    
    if (typeof output === 'string') {
      this.memoryService.addAIMessage(output, this.sessionId);
    }
  }
  
  /**
   * Get the memory keys that the memory will return
   */
  get memoryKeys(): string[] {
    return [this.memoryKeyName];
  }
}