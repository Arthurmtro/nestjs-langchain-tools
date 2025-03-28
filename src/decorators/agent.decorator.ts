import { SetMetadata } from '@nestjs/common';

export const AGENT_METADATA = 'langchain:agent';

export type ModelType = 'openai' | 'anthropic' | 'llama' | 'mistral' | 'custom';
export type AgentType = 'openapi' | 'json' | 'react' | 'structured' | 'toolcalling' | 'custom';

export interface BaseAgentOptions {
  name: string;
  description: string;
  systemPrompt: string;
  modelType?: ModelType;
  agentType?: AgentType;
  temperature?: number;
  returnIntermediateSteps?: boolean;
  handleParsingErrors?: boolean | string;
  handleParsingErrorMessage?: string;
  useMemory?: boolean;
}

export interface OpenAIAgentOptions extends BaseAgentOptions {
  modelType?: 'openai';
  modelName?: string;
  apiKey?: string;
  apiUrl?: string;
}

export interface AnthropicAgentOptions extends BaseAgentOptions {
  modelType: 'anthropic';
  modelName?: string;
  apiKey?: string;
}

export interface LlamaAgentOptions extends BaseAgentOptions {
  modelType: 'llama';
  modelPath: string;
  contextSize?: number;
}

export interface MistralAgentOptions extends BaseAgentOptions {
  modelType: 'mistral';
  modelName?: string;
  apiKey?: string;
}

export interface CustomModelAgentOptions extends BaseAgentOptions {
  modelType: 'custom';
  modelProvider: any; // This will be injected from the module options
  customAgentGenerator?: (model: any, tools: any[], prompt: any) => Promise<any>;
}

export type AgentOptions = 
  | OpenAIAgentOptions 
  | AnthropicAgentOptions 
  | LlamaAgentOptions 
  | MistralAgentOptions
  | CustomModelAgentOptions;

export const ToolsAgent = (options: AgentOptions) => {
  return SetMetadata(AGENT_METADATA, options);
};