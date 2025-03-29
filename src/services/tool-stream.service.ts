import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ToolStreamCallback, ToolStreamUpdate, ToolStreamUpdateType } from '../interfaces/tool.interface';
import { LangChainToolsModuleOptions } from '../interfaces/module.interface';
import { LANGCHAIN_TOOLS_OPTIONS } from '../modules/langchain-tools.module';
import { TOOL_STREAM_UPDATE_INTERVAL, DEFAULT_TOOL_STREAMING_ENABLED } from '../constants/tool.constants';

/**
 * Service to manage streaming from tools
 */
@Injectable()
export class ToolStreamService {
  private readonly logger = new Logger(ToolStreamService.name);
  private streamEnabled: boolean;
  private callback?: ToolStreamCallback;
  private streams: Map<string, Subject<ToolStreamUpdate>> = new Map();

  constructor(
    @Optional() @Inject(LANGCHAIN_TOOLS_OPTIONS) 
    private readonly options?: LangChainToolsModuleOptions,
  ) {
    this.streamEnabled = options?.enableToolStreaming ?? DEFAULT_TOOL_STREAMING_ENABLED;
    this.callback = options?.onToolStream;
    
    if (this.streamEnabled) {
      this.logger.log('Tool streaming is enabled');
      if (this.callback) {
        this.logger.log('Tool streaming callback is registered');
      } else {
        this.logger.warn('Tool streaming is enabled but no callback is registered');
      }
    } else {
      this.logger.log('Tool streaming is disabled');
    }
  }

  /**
   * Determines if tool streaming is enabled
   * 
   * @returns Whether streaming is enabled
   */
  isStreamingEnabled(): boolean {
    return this.streamEnabled;
  }

  /**
   * Enables or disables tool streaming
   * 
   * @param enabled - Whether to enable streaming
   */
  setStreamingEnabled(enabled: boolean): void {
    this.streamEnabled = enabled;
    this.logger.log(`Tool streaming ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Sets the callback to receive tool streaming updates
   * 
   * @param callback - Function to call with streaming updates
   */
  setCallback(callback: ToolStreamCallback): void {
    this.logger.log('Setting tool stream callback');
    this.callback = callback;
    
    // Make sure streaming is enabled when setting a callback
    if (!this.streamEnabled) {
      this.logger.log('Enabling tool streaming because a callback was set');
      this.streamEnabled = true;
    }
    
    // Forward any existing streams to the new callback
    this.streams.forEach((stream, toolName) => {
      this.logger.log(`Connecting callback to existing stream for tool: ${toolName}`);
      
      // Re-subscribe the existing streams to the new callback
      stream.subscribe(update => {
        try {
          this.logger.log(`Forwarding update from existing stream: ${toolName} - ${update.type}`);
          this.callback!(update);
        } catch (error) {
          this.logger.error(`Error in tool stream callback: ${(error as Error).message}`);
        }
      });
    });
  }

  /**
   * Gets or creates a stream for a tool execution
   * 
   * @param toolName - The name of the tool
   * @returns Subject for the tool's stream updates
   */
  getToolStream(toolName: string): Subject<ToolStreamUpdate> {
    if (!this.streams.has(toolName)) {
      this.logger.log(`Creating new stream for tool: ${toolName}`);
      this.streams.set(toolName, new Subject<ToolStreamUpdate>());
      
      // Set up subscription to forward events to the global callback
      if (this.callback) {
        this.logger.log(`Connecting callback to new stream for tool: ${toolName}`);
        this.streams.get(toolName)!.subscribe(update => {
          try {
            this.logger.log(`Forwarding update to callback: ${toolName} - ${update.type} - ${update.content || ''}`);
            this.callback!(update);
          } catch (error) {
            this.logger.error(`Error in tool stream callback: ${(error as Error).message}`);
          }
        });
      } else {
        this.logger.warn(`No callback registered for tool stream: ${toolName}`);
      }
    }
    
    return this.streams.get(toolName)!;
  }

  /**
   * Signals the start of a tool execution
   * 
   * @param toolName - Name of the tool
   * @param params - Parameters for the tool (optional)
   */
  startToolExecution(toolName: string, params?: Record<string, any>): void {
    if (!this.streamEnabled) return;
    
    try {
      const update: ToolStreamUpdate = {
        type: ToolStreamUpdateType.START,
        toolName,
        content: params ? `Starting ${toolName} with parameters: ${JSON.stringify(params)}` : `Starting ${toolName}`
      };
      
      this.getToolStream(toolName).next(update);
      this.logger.debug(`Tool execution started: ${toolName}`);
    } catch (error) {
      this.logger.error(`Error sending tool start update: ${(error as Error).message}`);
    }
  }

  /**
   * Sends a progress update during tool execution
   * 
   * @param toolName - Name of the tool
   * @param content - Content of the progress update
   * @param progress - Optional progress percentage (0-100)
   */
  updateToolProgress(toolName: string, content: string, progress?: number): void {
    if (!this.streamEnabled) {
      this.logger.warn(`Tool update ignored - streaming disabled: ${toolName}`);
      return;
    }
    
    try {
      const update: ToolStreamUpdate = {
        type: ToolStreamUpdateType.PROGRESS,
        toolName,
        content,
        progress
      };
      
      this.logger.log(`Tool progress update: ${toolName} - ${progress !== undefined ? progress + '% - ' : ''}${content}`);
      
      // Check if callback exists directly instead of relying on the stream
      if (this.callback) {
        try {
          this.logger.log(`Directly calling callback for: ${toolName} - ${update.type}`);
          this.callback(update);
        } catch (cbError) {
          this.logger.error(`Error calling callback directly: ${(cbError as Error).message}`);
        }
      }
      
      // Also send through the subject for any other subscribers
      this.getToolStream(toolName).next(update);
    } catch (error) {
      this.logger.error(`Error sending tool progress update: ${(error as Error).message}`);
    }
  }

  /**
   * Signals the completion of a tool execution
   * 
   * @param toolName - Name of the tool
   * @param result - Result of the tool execution
   */
  completeToolExecution(toolName: string, result: string): void {
    if (!this.streamEnabled) return;
    
    try {
      const update: ToolStreamUpdate = {
        type: ToolStreamUpdateType.COMPLETE,
        toolName,
        content: `Completed ${toolName}`,
        result
      };
      
      this.getToolStream(toolName).next(update);
      this.logger.debug(`Tool execution completed: ${toolName}`);
      
      // Clean up the stream
      setTimeout(() => {
        this.streams.delete(toolName);
      }, TOOL_STREAM_UPDATE_INTERVAL);
    } catch (error) {
      this.logger.error(`Error sending tool completion update: ${(error as Error).message}`);
    }
  }

  /**
   * Signals an error during tool execution
   * 
   * @param toolName - Name of the tool
   * @param error - Error message or object
   */
  errorToolExecution(toolName: string, error: string | Error): void {
    if (!this.streamEnabled) return;
    
    try {
      const errorMessage = typeof error === 'string' ? error : error.message;
      
      const update: ToolStreamUpdate = {
        type: ToolStreamUpdateType.ERROR,
        toolName,
        content: `Error in ${toolName}`,
        error: errorMessage
      };
      
      this.getToolStream(toolName).next(update);
      this.logger.debug(`Tool execution error: ${toolName} - ${errorMessage}`);
      
      // Clean up the stream
      setTimeout(() => {
        this.streams.delete(toolName);
      }, TOOL_STREAM_UPDATE_INTERVAL);
    } catch (error) {
      this.logger.error(`Error sending tool error update: ${(error as Error).message}`);
    }
  }
  
  /**
   * Wraps a function to enable streaming progress updates
   * 
   * @param toolName - Name of the tool
   * @param fn - Async function to wrap
   * @param metadata - Optional metadata about the function
   * @returns Wrapped function that reports progress
   */
  wrapWithStreaming<T extends (...args: any[]) => Promise<any>>(
    toolName: string,
    fn: T,
    metadata?: { description?: string }
  ): T {
    if (!this.streamEnabled) return fn;
    
    const wrappedFn = async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      try {
        // Start execution
        this.startToolExecution(toolName, args[0]);
        
        // Add description if provided
        if (metadata?.description) {
          this.updateToolProgress(toolName, metadata.description);
        }
        
        // Execute the original function
        const result = await fn(...args);
        
        // Complete execution
        this.completeToolExecution(toolName, typeof result === 'string' ? result : JSON.stringify(result));
        
        return result;
      } catch (error) {
        // Report error
        this.errorToolExecution(toolName, error as Error);
        throw error;
      }
    };
    
    return wrappedFn as T;
  }
}