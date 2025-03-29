import { Injectable } from '@nestjs/common';
import { ToolsAgent } from '../../../src/decorators/agent.decorator';
import { AgentTool } from '../../../src/decorators/tool.decorator';
import { ToolStreamService } from '../../../src/services/tool-stream.service';
import { z } from 'zod';

/**
 * Example agent that demonstrates streaming tools
 */
@ToolsAgent({
  name: 'StreamingToolAgent',
  description: 'Demonstrates streaming tool progress updates',
  systemPrompt: 'You are a helpful assistant that can demonstrate streaming tool execution. Use the slow_process tool to show streaming in action.',
  modelName: 'gpt-4o',
  temperature: 0,
  useMemory: true, // Enable memory for this agent
})
@Injectable()
export class StreamingToolAgent {
  constructor(private readonly toolStreamService: ToolStreamService) {}

  /**
   * A tool that demonstrates streaming by simulating a slow process
   */
  @AgentTool({
    name: 'slow_process',
    description: 'A tool that demonstrates streaming by simulating a slow process with regular updates',
    schema: z.object({
      duration: z.number().describe('Duration of the process in seconds (1-10)'),
      steps: z.number().optional().describe('Number of steps to report (default: 5)'),
    }),
    streaming: true,
  })
  async slowProcess(input: { duration: number; steps?: number }): Promise<string> {
    const duration = Math.min(Math.max(input.duration, 1), 10); // Clamp between 1-10 seconds
    const steps = input.steps || 5;
    const stepDuration = (duration * 1000) / steps;
    
    // Function to wait for a specified time
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Send initial progress update immediately
    this.toolStreamService.updateToolProgress(
      'slow_process',
      'Starting slow process...',
      0
    );
    
    // For each step, send multiple progress updates
    for (let i = 1; i <= steps; i++) {
      // Each step has multiple sub-updates for smoother progress
      const subUpdates = 5;
      const subUpdateDuration = stepDuration / subUpdates;
      
      for (let j = 1; j <= subUpdates; j++) {
        // Wait for the sub-step duration
        await sleep(subUpdateDuration);
        
        // Calculate progress percentage more granularly
        const progressBase = ((i - 1) / steps) * 100;
        const progressIncrement = (j / subUpdates) * (100 / steps);
        const progress = Math.floor(progressBase + progressIncrement);
        
        // Send progress update
        this.toolStreamService.updateToolProgress(
          'slow_process',
          `Step ${i}/${steps} in progress (${j}/${subUpdates})`,
          progress
        );
      }
      
      // Send step completion update
      this.toolStreamService.updateToolProgress(
        'slow_process',
        `Step ${i}/${steps} completed`,
        Math.floor((i / steps) * 100)
      );
    }
    
    // Return the final result
    return `Process completed successfully in ${duration} seconds with ${steps} steps.`;
  }
  
  /**
   * A tool that demonstrates error handling in streaming
   */
  @AgentTool({
    name: 'failing_process',
    description: 'A tool that demonstrates error handling in streaming by failing after some steps',
    schema: z.object({
      steps_before_failure: z.number().describe('Number of steps to complete before failing (1-5)'),
    }),
    streaming: true,
  })
  async failingProcess(input: { steps_before_failure: number }): Promise<string> {
    const stepsBeforeFailure = Math.min(Math.max(input.steps_before_failure, 1), 5);
    
    // Function to wait for a specified time
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Send initial progress update immediately
    this.toolStreamService.updateToolProgress(
      'failing_process',
      'Starting process that will eventually fail...',
      0
    );
    
    for (let i = 1; i <= stepsBeforeFailure; i++) {
      // Each step has multiple sub-updates for smoother progress
      const subUpdates = 4;
      const subUpdateDuration = 250; // 250ms * 4 = 1 second per step
      
      for (let j = 1; j <= subUpdates; j++) {
        // Wait for the sub-step duration
        await sleep(subUpdateDuration);
        
        // Calculate progress percentage more granularly
        const progressBase = ((i - 1) / 5) * 100;
        const progressIncrement = (j / subUpdates) * (100 / 5);
        const progress = Math.floor(progressBase + progressIncrement);
        
        // Send progress update
        this.toolStreamService.updateToolProgress(
          'failing_process',
          `Step ${i}/5 in progress (${j}/${subUpdates})`,
          progress
        );
      }
      
      // Send step completion update
      this.toolStreamService.updateToolProgress(
        'failing_process',
        `Step ${i}/5 completed`,
        Math.floor((i / 5) * 100)
      );
    }
    
    // Send a warning that we're about to fail
    this.toolStreamService.updateToolProgress(
      'failing_process',
      `Warning: Process about to fail as requested...`,
      Math.floor((stepsBeforeFailure / 5) * 100)
    );
    
    // Wait a moment before failing
    await sleep(500);
    
    // Throw an error after the specified number of steps
    throw new Error(`Process failed after ${stepsBeforeFailure} steps as requested`);
  }
}