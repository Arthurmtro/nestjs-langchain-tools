import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import {
  AGENT_METADATA,
  AgentOptions,
  ModelType,
  OpenAIAgentOptions,
  AnthropicAgentOptions,
  LlamaAgentOptions,
  MistralAgentOptions,
  CustomModelAgentOptions
} from '../decorators/agent.decorator';
import { ToolDiscoveryService } from './tool-discovery.service';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOllama } from '@langchain/ollama';
import { AgentExecutor, createOpenApiAgent } from 'langchain/agents';
// Import directly from agents instead of tool_calling submodule to avoid TS errors
import { createOpenAIToolsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BufferMemory } from 'langchain/memory';

export interface AgentInfo {
  name: string;
  description: string;
  executor: AgentExecutor;
}

@Injectable()
export class AgentDiscoveryService {
  private agents: Map<string, AgentInfo> = new Map();
  private readonly logger = new Logger(AgentDiscoveryService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly toolDiscoveryService: ToolDiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  async discoverAndInitializeAgents(): Promise<Map<string, AgentInfo>> {
    this.logger.log('Discovering agents...');
    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const { instance, metatype } = wrapper as InstanceWrapper;
      if (!instance || !metatype) continue;

      const agentMetadata: AgentOptions = this.reflector.get(
        AGENT_METADATA,
        metatype,
      );

      if (agentMetadata) {
        this.logger.log(`Found agent: ${agentMetadata.name}`);
        try {
          const agentTools = this.toolDiscoveryService.discoverToolsForProvider(instance);

          if (agentTools.length > 0) {
            this.logger.log(`Initializing agent: ${agentMetadata.name} with ${agentTools.length} tools`);
            await this.initializeAgent(agentMetadata, agentTools);
          } else {
            this.logger.warn(`No tools found for agent: ${agentMetadata.name}`);
          }
        } catch (error) {
          this.logger.error(`Error initializing agent ${agentMetadata.name}:`, error.stack);
        }
      }
    }

    this.logger.log(`Discovered and initialized ${this.agents.size} agents`);
    return this.agents;
  }

  private async initializeAgent(
    agentOptions: AgentOptions,
    tools: any[]
  ): Promise<void> {
    try {
      const model = this.createModelInstance(agentOptions);

      // Create a chat prompt template instead of a regular prompt template
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", agentOptions.systemPrompt],
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
      ]);

      // Create the agent using OpenAI tools agent API (works with any LLM that supports tool calls)
      const agent = await createOpenAIToolsAgent({
        llm: model,
        tools,
        prompt,
      });

      // Setup memory if requested
      let memory: BufferMemory | undefined = undefined;
      if (agentOptions.useMemory) {
        memory = new BufferMemory({
          returnMessages: true,
          memoryKey: "chat_history",
          inputKey: "input",
          outputKey: "output",
        });
      }

      // Create the executor using the constructor directly
      const executor = new AgentExecutor({
        agent,
        tools,
        memory,
        handleParsingErrors: agentOptions.handleParsingErrorMessage || true,
        returnIntermediateSteps: agentOptions.returnIntermediateSteps || false,
      });

      this.agents.set(agentOptions.name, {
        name: agentOptions.name,
        description: agentOptions.description,
        executor,
      });

      this.logger.log(`Agent ${agentOptions.name} initialized successfully with ${agentOptions.modelType || 'openai'} model`);
    } catch (error) {
      this.logger.error(`Failed to initialize agent ${agentOptions.name}:`, error.stack);
      throw error;
    }
  }

  private createModelInstance(agentOptions: AgentOptions): BaseChatModel {
    const modelType = agentOptions.modelType || 'openai';

    switch (modelType) {
      case 'openai': {
        const options = agentOptions as OpenAIAgentOptions;
        return new ChatOpenAI({
          modelName: options.modelName || 'gpt-4o',
          temperature: options.temperature !== undefined ? options.temperature : 0,
          openAIApiKey: options.apiKey,
          configuration: options.apiUrl ? { baseURL: options.apiUrl } : undefined,
        });
      }

      case 'anthropic': {
        const options = agentOptions as AnthropicAgentOptions;
        return new ChatAnthropic({
          modelName: options.modelName || 'claude-3.5-sonnet-latest',
          temperature: options.temperature !== undefined ? options.temperature : 0,
          anthropicApiKey: options.apiKey,
        });
      }

      case 'mistral': {
        const options = agentOptions as MistralAgentOptions;
        return new ChatMistralAI({
          modelName: options.modelName || 'mistral-large-latest',
          temperature: options.temperature !== undefined ? options.temperature : 0,
          apiKey: options.apiKey,
        });
      }

      case 'llama': {
        const options = agentOptions as LlamaAgentOptions;
        return new ChatOllama({
          model: options.modelPath,
          temperature: options.temperature !== undefined ? options.temperature : 0,
          ...(options.contextSize ? { context: options.contextSize } : {}),
        });
      }

      case 'custom': {
        const options = agentOptions as CustomModelAgentOptions;
        if (!options.modelProvider) {
          throw new Error(`Custom model provider not provided for agent ${agentOptions.name}`);
        }
        return options.modelProvider;
      }

      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }
  }

  getAgentByName(name: string): AgentInfo | undefined {
    return this.agents.get(name);
  }

  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }
}

