import { SetMetadata } from '@nestjs/common';
import { AgentOptions } from '../interfaces/agent.interface';

/** 
 * Metadata key for discovering agent classes
 * @internal
 */
export const AGENT_METADATA = 'langchain:agent';

/**
 * Re-export types from interfaces for backward compatibility
 */
export type { 
  AgentOptions,
  BaseAgentOptions,
  OpenAIAgentOptions,
  AnthropicAgentOptions,
  LlamaAgentOptions,
  MistralAgentOptions,
  CustomModelAgentOptions
} from '../interfaces/agent.interface';

export { ModelProvider, AgentType } from '../interfaces/agent.interface';

/**
 * Class decorator that marks a NestJS provider as an LLM agent with tools
 * 
 * @param options - Configuration options for the agent
 * @returns Decorator function
 * 
 * @example
 * ```typescript
 * @Injectable()
 * @ToolsAgent({
 *   name: 'Weather Agent',
 *   description: 'Provides weather information',
 *   systemPrompt: 'You are a weather specialist...',
 *   modelType: ModelProvider.OPENAI,
 *   modelName: 'gpt-4o',
 * })
 * export class WeatherAgentService { ... }
 * ```
 */
export const ToolsAgent = (options: AgentOptions): ClassDecorator => {
  return SetMetadata(AGENT_METADATA, options);
};