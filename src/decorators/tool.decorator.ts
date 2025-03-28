import { SetMetadata } from '@nestjs/common';
import { ToolOptions } from '../interfaces/tool.interface';

/** 
 * Metadata key for discovering tool methods
 * @internal
 */
export const TOOL_METADATA = 'langchain:tool';

/**
 * Re-export types from interfaces for backward compatibility
 */
export type { ToolOptions } from '../interfaces/tool.interface';

/**
 * Method decorator that marks a class method as an LLM tool
 * 
 * @param options - Configuration options for the tool
 * @returns Decorator function
 * 
 * @example
 * ```typescript
 * @AgentTool({
 *   name: 'get_weather',
 *   description: 'Get the current weather for a location',
 *   schema: z.object({
 *     location: z.string(),
 *     unit: z.enum(['celsius', 'fahrenheit']).optional(),
 *   }),
 * })
 * async getWeather(input: { location: string; unit?: string }): Promise<string> {
 *   // Implementation
 * }
 * ```
 */
export const AgentTool = (options: ToolOptions): MethodDecorator => {
  return SetMetadata(TOOL_METADATA, options);
};