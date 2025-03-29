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
    
    for (let i = 1; i <= steps; i++) {
      // Wait for the step duration
      await sleep(stepDuration);
      
      // Calculate progress percentage
      const progress = Math.floor((i / steps) * 100);
      
      // Send progress update
      this.toolStreamService.updateToolProgress(
        'slow_process',
        `Step ${i}/${steps} completed`,
        progress
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
    
    for (let i = 1; i <= stepsBeforeFailure; i++) {
      // Wait for a second
      await sleep(1000);
      
      // Calculate progress percentage
      const progress = Math.floor((i / 5) * 100);
      
      // Send progress update
      this.toolStreamService.updateToolProgress(
        'failing_process',
        `Step ${i}/5 completed`,
        progress
      );
    }
    
    // Throw an error after the specified number of steps
    throw new Error(`Process failed after ${stepsBeforeFailure} steps as requested`);
  }
}