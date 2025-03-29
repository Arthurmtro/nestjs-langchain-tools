import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { LangChainToolsModuleOptions } from '../interfaces/module.interface';
import { LANGCHAIN_TOOLS_OPTIONS } from '../modules/langchain-tools.module';
import { 
  DEFAULT_TOOL_TIMEOUT,
  DEFAULT_TOOL_TIMEOUT_ENABLED,
  TOOL_TIMEOUT_ERROR_MESSAGE 
} from '../constants/tool.constants';
import { ToolOptions, ToolTimeoutOptions } from '../interfaces/tool.interface';
import { ToolStreamService } from './tool-stream.service';

/**
 * Custom error class for tool execution timeouts
 */
export class ToolTimeoutError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly timeoutMs: number
  ) {
    super(`Tool "${toolName}" execution timed out after ${timeoutMs}ms`);
    this.name = 'ToolTimeoutError';
  }
}

/**
 * Service for managing tool timeouts
 */
@Injectable()
export class ToolTimeoutService {
  private readonly logger = new Logger(ToolTimeoutService.name);
  private globalTimeoutEnabled = DEFAULT_TOOL_TIMEOUT_ENABLED;
  private globalTimeoutMs = DEFAULT_TOOL_TIMEOUT;
  private onToolTimeout?: (toolName: string, timeoutMs: number) => void;
  
  // Map to store abort controllers for each tool execution
  private abortControllers = new Map<string, AbortController>();

  constructor(
    @Optional() @Inject(LANGCHAIN_TOOLS_OPTIONS) 
    private readonly options?: LangChainToolsModuleOptions,
    @Optional() private readonly toolStreamService?: ToolStreamService,
  ) {
    // Initialize from module options
    if (options?.toolTimeout) {
      if (typeof options.toolTimeout === 'number') {
        this.globalTimeoutMs = options.toolTimeout;
        this.globalTimeoutEnabled = true;
      } else {
        this.globalTimeoutMs = options.toolTimeout.durationMs;
        this.globalTimeoutEnabled = options.toolTimeout.enabled;
      }
      
      this.onToolTimeout = options.onToolTimeout;
    }
    
    this.logger.log(`Tool timeout is ${this.globalTimeoutEnabled ? 'enabled' : 'disabled'} with default timeout of ${this.globalTimeoutMs}ms`);
  }

  /**
   * Determines if timeouts are globally enabled
   * 
   * @returns Whether timeouts are globally enabled
   */
  isTimeoutEnabled(): boolean {
    return this.globalTimeoutEnabled;
  }

  /**
   * Gets the global timeout duration in milliseconds
   * 
   * @returns Global timeout duration in ms
   */
  getGlobalTimeoutMs(): number {
    return this.globalTimeoutMs;
  }

  /**
   * Enables or disables timeouts globally
   * 
   * @param enabled - Whether to enable timeouts
   */
  setTimeoutEnabled(enabled: boolean): void {
    this.globalTimeoutEnabled = enabled;
    this.logger.log(`Tool timeout ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Sets the global timeout duration in milliseconds
   * 
   * @param timeoutMs - Timeout duration in ms
   */
  setGlobalTimeoutMs(timeoutMs: number): void {
    this.globalTimeoutMs = timeoutMs;
    this.logger.log(`Global tool timeout set to ${timeoutMs}ms`);
  }

  /**
   * Gets the timeout configuration for a specific tool
   * 
   * @param toolOptions - The tool options
   * @returns Timeout configuration for the tool
   */
  getToolTimeoutConfig(toolOptions: ToolOptions): ToolTimeoutOptions {
    // If the tool has specific timeout settings
    if (toolOptions.timeout !== undefined) {
      if (typeof toolOptions.timeout === 'number') {
        return {
          enabled: true,
          durationMs: toolOptions.timeout
        };
      }
      return toolOptions.timeout;
    }
    
    // Otherwise use global settings
    return {
      enabled: this.globalTimeoutEnabled,
      durationMs: this.globalTimeoutMs
    };
  }

  /**
   * Creates an abort controller for a tool and returns its signal
   * 
   * @param toolName - The name of the tool
   * @returns An abort signal that can be used to cancel the tool execution
   */
  createAbortSignal(toolName: string): AbortSignal {
    // Generate a unique execution ID to handle multiple executions of the same tool
    const executionId = `${toolName}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create a new abort controller
    const controller = new AbortController();
    this.abortControllers.set(executionId, controller);
    
    this.logger.debug(`Created abort controller for ${toolName} (${executionId})`);
    
    return controller.signal;
  }
  
  /**
   * Aborts a tool execution
   * 
   * @param toolName - The name of the tool
   */
  abortAllToolExecutions(toolName: string): void {
    // Find all controllers for this tool
    for (const [executionId, controller] of this.abortControllers.entries()) {
      if (executionId.startsWith(`${toolName}_`)) {
        this.logger.debug(`Aborting execution of ${toolName} (${executionId})`);
        controller.abort();
        this.abortControllers.delete(executionId);
      }
    }
  }
  
  /**
   * Executes a function with a timeout
   * 
   * @param fn - The function to execute
   * @param toolName - The name of the tool
   * @param timeoutMs - Timeout in milliseconds
   * @returns The result of the function, or throws a timeout error
   */
  async executeWithTimeout<T>(
    fn: () => Promise<T>, 
    toolName: string, 
    timeoutMs: number
  ): Promise<T> {
    // Check if the tool has already timed out (shouldn't happen, but just in case)
    if (this.toolStreamService?.hasToolTimedOut(toolName)) {
      this.logger.warn(`Tool ${toolName} has already timed out, not executing`);
      throw new ToolTimeoutError(toolName, timeoutMs);
    }
    
    // Create a variable to hold the timeout ID
    let timeoutId: NodeJS.Timeout;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new ToolTimeoutError(toolName, timeoutMs);
        
        // Log the timeout
        this.logger.warn(`Tool execution timed out: ${toolName} after ${timeoutMs}ms`);
        
        // Abort all executions of this tool
        this.abortAllToolExecutions(toolName);
        
        // Notify of timeout if streaming is enabled
        if (this.toolStreamService?.isStreamingEnabled()) {
          this.toolStreamService.timeoutToolExecution(toolName, timeoutMs);
        }
        
        // Call the timeout callback if provided
        if (this.onToolTimeout) {
          try {
            this.onToolTimeout(toolName, timeoutMs);
          } catch (callbackError) {
            this.logger.error(`Error in tool timeout callback: ${(callbackError as Error).message}`);
          }
        }
        
        reject(error);
      }, timeoutMs);
    });
    
    // Attach the clearTimeout function to the promise
    (timeoutPromise as any).clearTimeout = () => {
      clearTimeout(timeoutId);
    };

    try {
      // Race between the function and the timeout
      const result = await Promise.race([
        fn(),
        timeoutPromise
      ]) as T;
      
      // Clear the timeout if we got a result
      if ((timeoutPromise as any).clearTimeout) {
        (timeoutPromise as any).clearTimeout();
      }
      
      return result;
    } catch (error) {
      // If it's our timeout error, just rethrow it
      if (error instanceof ToolTimeoutError) {
        throw error;
      }
      
      // For other errors, clear the timeout and rethrow
      if ((timeoutPromise as any).clearTimeout) {
        (timeoutPromise as any).clearTimeout();
      }
      
      throw error;
    }
  }
}