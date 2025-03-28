import { Injectable } from '@nestjs/common';
import { ToolsAgent } from '../../../src/decorators/agent.decorator';
import { AgentTool } from '../../../src/decorators/tool.decorator';
import { ToolStreamService } from '../../../src/services/tool-stream.service';
import { ToolTimeoutService } from '../../../src/services/tool-timeout.service';
import { z } from 'zod';

/**
 * Example agent that demonstrates tool timeouts
 */
@ToolsAgent({
  name: 'TimeoutDemoAgent',
  description: 'Demonstrates tool timeout functionality',
  systemPrompt: 'You are a helpful assistant that can demonstrate tool timeouts. When asked about timeouts, use the tools to show how they work.',
  modelName: 'gpt-4o',
  temperature: 0,
  useMemory: true,
})
@Injectable()
export class TimeoutDemoAgent {
  constructor(
    private readonly toolStreamService: ToolStreamService,
    private readonly toolTimeoutService: ToolTimeoutService
  ) {}

  /**
   * A tool that will timeout if run for too long
   */
  @AgentTool({
    name: 'potentially_slow_operation',
    description: 'Performs an operation that might be slow. May timeout if duration exceeds the limit.',
    schema: z.object({
      duration: z.number().describe('Duration of the operation in seconds (1-120)'),
      should_timeout: z.boolean().describe('Whether the operation should take longer than the timeout limit'),
    }),
    timeout: 5000, // 5 second timeout for this specific tool
    streaming: true,
  })
  async potentiallySlowOperation(input: { duration: number; should_timeout: boolean }): Promise<string> {
    // Clamp duration between 1 and 120 seconds
    const duration = Math.min(Math.max(input.duration, 1), 120);
    
    // Calculate actual duration based on whether we should timeout
    const actualDuration = input.should_timeout ? 
      Math.max(duration, 10) : // Ensure at least 10 seconds if should timeout
      Math.min(duration, 3);   // Ensure less than 3 seconds if should not timeout
    
    // Get an abort signal for this tool
    const abortSignal = this.toolTimeoutService.createAbortSignal('potentially_slow_operation');
    
    // Function to wait for a specified time, respecting the abort signal
    const sleep = (ms: number) => new Promise((resolve, reject) => {
      // If already aborted, reject immediately
      if (abortSignal.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }
      
      // Create a timeout
      const timer = setTimeout(resolve, ms);
      
      // Listen for abort signal
      abortSignal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Operation aborted'));
      }, { once: true });
    });
    
    // Send initial progress update
    this.toolStreamService.updateToolProgress(
      'potentially_slow_operation',
      `Starting operation that will take ${actualDuration} seconds...`,
      0
    );
    
    // Calculate how many progress updates to send (about 1 per second)
    const updates = actualDuration;
    const updateInterval = actualDuration * 1000 / updates;
    
    try {
      for (let i = 1; i <= updates; i++) {
        // Check if aborted before continuing
        if (abortSignal.aborted) {
          this.toolStreamService.updateToolProgress(
            'potentially_slow_operation',
            `Operation aborted at step ${i}/${updates}`,
            Math.floor((i / updates) * 100)
          );
          throw new Error('Operation aborted');
        }
        
        // Skip if we're over the timeout (this won't execute if timeout works)
        if (i * updateInterval > 5000 && input.should_timeout) {
          this.toolStreamService.updateToolProgress(
            'potentially_slow_operation',
            `We would be at step ${i}/${updates}, but this should have timed out by now`,
            Math.floor((i / updates) * 100)
          );
        }
        
        // Wait for the update interval
        await sleep(updateInterval);
        
        // Calculate progress percentage
        const progress = Math.floor((i / updates) * 100);
        
        // Send progress update
        this.toolStreamService.updateToolProgress(
          'potentially_slow_operation',
          `Step ${i}/${updates} completed (${progress}%)`,
          progress
        );
      }
    } catch (error) {
      if ((error as Error).message === 'Operation aborted') {
        // This is expected when timed out, so just return a nice message
        return `Operation was successfully aborted after timing out. This is the expected behavior.`;
      }
      // Re-throw unexpected errors
      throw error;
    }
    
    return `Operation completed in ${actualDuration} seconds. ${
      input.should_timeout ? 
        'This message should not be seen because the operation should have timed out.' : 
        'Operation completed successfully within the timeout limit.'
    }`;
  }

  /**
   * A tool with configurable timeout
   */
  @AgentTool({
    name: 'configurable_timeout_operation',
    description: 'Performs an operation with a configurable timeout',
    schema: z.object({
      duration: z.number().describe('Duration of the operation in seconds (1-30)'),
      timeout: z.number().describe('Timeout in milliseconds to apply to this operation'),
    }),
    timeout: {
      enabled: true,
      durationMs: 10000 // Default 10 second timeout
    },
    streaming: true,
  })
  async configurableTimeoutOperation(input: { duration: number; timeout: number }): Promise<string> {
    // Override the timeout for this specific execution
    // Note: This doesn't actually work yet, but demonstrates how the API could work
    // A future implementation could allow dynamic timeouts per execution
    
    // Clamp duration between 1 and 30 seconds
    const duration = Math.min(Math.max(input.duration, 1), 30);
    
    // Clamp timeout between 1 and 60 seconds
    const timeout = Math.min(Math.max(input.timeout, 1000), 60000);
    
    // Get an abort signal for this tool
    const abortSignal = this.toolTimeoutService.createAbortSignal('configurable_timeout_operation');
    
    // Function to wait for a specified time, respecting the abort signal
    const sleep = (ms: number) => new Promise((resolve, reject) => {
      // If already aborted, reject immediately
      if (abortSignal.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }
      
      // Create a timeout
      const timer = setTimeout(resolve, ms);
      
      // Listen for abort signal
      abortSignal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Operation aborted'));
      }, { once: true });
    });
    
    // Send initial progress update
    this.toolStreamService.updateToolProgress(
      'configurable_timeout_operation',
      `Starting operation with ${duration}s duration and ${timeout}ms timeout`,
      0
    );
    
    // For demonstration, we'll show progress updates
    const updates = duration * 2; // 2 updates per second
    const updateInterval = duration * 1000 / updates;
    
    try {
      for (let i = 1; i <= updates; i++) {
        // Check if aborted before continuing
        if (abortSignal.aborted) {
          this.toolStreamService.updateToolProgress(
            'configurable_timeout_operation',
            `Operation aborted at step ${i}/${updates}`,
            Math.floor((i / updates) * 100)
          );
          throw new Error('Operation aborted');
        }
        
        // Wait for the update interval
        await sleep(updateInterval);
        
        // Calculate progress percentage
        const progress = Math.floor((i / updates) * 100);
        
        // Calculate elapsed time
        const elapsedMs = i * updateInterval;
        
        // Send progress update with timeout information
        this.toolStreamService.updateToolProgress(
          'configurable_timeout_operation',
          `Step ${i}/${updates} (${progress}%) - Elapsed: ${elapsedMs}ms / Timeout: ${timeout}ms`,
          progress
        );
        
        // Show warning if getting close to timeout
        if (elapsedMs > timeout * 0.8 && elapsedMs < timeout) {
          this.toolStreamService.updateToolProgress(
            'configurable_timeout_operation',
            `⚠️ Warning: Getting close to timeout (${elapsedMs}ms / ${timeout}ms)`,
            progress
          );
        }
      }
    } catch (error) {
      if ((error as Error).message === 'Operation aborted') {
        // This is expected when timed out, so just return a nice message
        return `Operation was successfully aborted after timing out. This is the expected behavior.`;
      }
      // Re-throw unexpected errors
      throw error;
    }
    
    return `Operation completed in ${duration} seconds with a timeout set to ${timeout}ms.`;
  }

  /**
   * A tool that doesn't have a timeout
   */
  @AgentTool({
    name: 'no_timeout_operation',
    description: 'Performs an operation that does not have a timeout',
    schema: z.object({
      duration: z.number().describe('Duration of the operation in seconds (1-10)'),
    }),
    timeout: { 
      enabled: false,
      durationMs: 0
    },
    streaming: true,
  })
  async noTimeoutOperation(input: { duration: number }): Promise<string> {
    // Clamp duration between 1 and 10 seconds
    const duration = Math.min(Math.max(input.duration, 1), 10);
    
    // Get an abort signal for this tool (even though it won't time out)
    const abortSignal = this.toolTimeoutService.createAbortSignal('no_timeout_operation');
    
    // Function to wait for a specified time, respecting the abort signal
    const sleep = (ms: number) => new Promise((resolve, reject) => {
      // If already aborted, reject immediately (this shouldn't happen for this tool)
      if (abortSignal.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }
      
      // Create a timeout
      const timer = setTimeout(resolve, ms);
      
      // Listen for abort signal
      abortSignal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Operation aborted'));
      }, { once: true });
    });
    
    // Send initial progress update
    this.toolStreamService.updateToolProgress(
      'no_timeout_operation',
      `Starting operation with no timeout, will take ${duration} seconds`,
      0
    );
    
    // For demonstration, we'll show progress updates
    const updates = duration * 2; // 2 updates per second
    const updateInterval = duration * 1000 / updates;
    
    try {
      for (let i = 1; i <= updates; i++) {
        // Check if aborted before continuing (shouldn't happen for this tool)
        if (abortSignal.aborted) {
          this.toolStreamService.updateToolProgress(
            'no_timeout_operation',
            `Operation aborted at step ${i}/${updates} (this shouldn't happen!)`,
            Math.floor((i / updates) * 100)
          );
          throw new Error('Operation aborted');
        }
        
        // Wait for the update interval
        await sleep(updateInterval);
        
        // Calculate progress percentage
        const progress = Math.floor((i / updates) * 100);
        
        // Send progress update
        this.toolStreamService.updateToolProgress(
          'no_timeout_operation',
          `Step ${i}/${updates} completed (${progress}%)`,
          progress
        );
      }
    } catch (error) {
      if ((error as Error).message === 'Operation aborted') {
        // This is not expected for this tool, but handle it anyway
        return `Operation was unexpectedly aborted. This should not happen for this tool.`;
      }
      // Re-throw unexpected errors
      throw error;
    }
    
    return `Operation completed in ${duration} seconds with no timeout limit.`;
  }
}