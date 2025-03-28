import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import {
  AGENT_METADATA,
} from '../decorators/agent.decorator';
import { ToolDiscoveryService } from './tool-discovery.service';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOllama } from '@langchain/ollama';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BufferMemory } from 'langchain/memory';
import { ToolInterface } from '@langchain/core/tools';
import { 
  AgentInfo, 
  ModelProvider, 
  AgentOptions,
  OpenAIAgentOptions,
  AnthropicAgentOptions,
  LlamaAgentOptions,
  MistralAgentOptions,
  CustomModelAgentOptions
} from '../interfaces/agent.interface';

/**
 * Default model names for different providers
 */
const DEFAULT_MODEL_NAMES = {
  [ModelProvider.OPENAI]: 'gpt-4o',
  [ModelProvider.ANTHROPIC]: 'claude-3-sonnet-20240229',
  [ModelProvider.MISTRAL]: 'mistral-large-latest',
};

/**
 * Service for discovering and initializing agent classes
 */
@Injectable()
export class AgentDiscoveryService {
  private agents: Map<string, AgentInfo> = new Map();
  private readonly logger = new Logger(AgentDiscoveryService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly toolDiscoveryService: ToolDiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  /**
   * Discovers all agent classes and initializes them with their tools
   * 
   * @returns Map of initialized agents
   */
  async discoverAndInitializeAgents(): Promise<Map<string, AgentInfo>> {
    this.logger.log('Discovering agents...');
    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const { instance, metatype } = wrapper as InstanceWrapper;
      if (!instance || !metatype) continue;

      const agentMetadata: AgentOptions | undefined = this.reflector.get(
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
          const err = error as Error;
          this.logger.error(`Error initializing agent ${agentMetadata.name}:`, err.stack);
        }
      }
    }

    this.logger.log(`Discovered and initialized ${this.agents.size} agents`);
    return this.agents;
  }

  /**
   * Initializes an agent with the given options and tools
   * 
   * @param agentOptions - Configuration options for the agent
   * @param tools - Array of tools available to the agent
   */
  private async initializeAgent(
    agentOptions: AgentOptions,
    tools: ToolInterface[]
  ): Promise<void> {
    try {
      // Create the language model instance based on provider type
      const model = this.createModelInstance(agentOptions);

      // Create a chat prompt template
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", agentOptions.systemPrompt],
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
      ]);

      // Create the agent using OpenAI tools agent API
      const agent = await createOpenAIToolsAgent({
        llm: model,
        tools,
        prompt,
      });

      // Setup memory if requested
      let memory: BufferMemory | undefined;
      if (agentOptions.useMemory) {
        memory = new BufferMemory({
          returnMessages: true,
          memoryKey: "chat_history",
          inputKey: "input",
          outputKey: "output",
        });
      }

      // Create the agent executor
      const executor = new AgentExecutor({
        agent,
        tools,
        memory,
        handleParsingErrors: agentOptions.handleParsingErrorMessage || true,
        returnIntermediateSteps: agentOptions.returnIntermediateSteps || false,
      });

      // Register the agent
      this.agents.set(agentOptions.name, {
        name: agentOptions.name,
        description: agentOptions.description,
        executor,
      });

      this.logger.log(`Agent ${agentOptions.name} initialized successfully with ${agentOptions.modelType || ModelProvider.OPENAI} model`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to initialize agent ${agentOptions.name}:`, err.stack);
      throw error;
    }
  }

  /**
   * Creates a language model instance based on agent options
   * 
   * @param agentOptions - Configuration options for the agent
   * @returns Initialized language model
   */
  private createModelInstance(agentOptions: AgentOptions): BaseChatModel {
    const modelType = agentOptions.modelType || ModelProvider.OPENAI;

    switch (modelType) {
      case ModelProvider.OPENAI: {
        const options = agentOptions as OpenAIAgentOptions;
        return new ChatOpenAI({
          modelName: options.modelName || DEFAULT_MODEL_NAMES[ModelProvider.OPENAI],
          temperature: options.temperature ?? 0,
          openAIApiKey: options.apiKey,
          configuration: options.apiUrl ? { baseURL: options.apiUrl } : undefined,
        });
      }

      case ModelProvider.ANTHROPIC: {
        const options = agentOptions as AnthropicAgentOptions;
        return new ChatAnthropic({
          modelName: options.modelName || DEFAULT_MODEL_NAMES[ModelProvider.ANTHROPIC],
          temperature: options.temperature ?? 0,
          anthropicApiKey: options.apiKey,
        });
      }

      case ModelProvider.MISTRAL: {
        const options = agentOptions as MistralAgentOptions;
        return new ChatMistralAI({
          modelName: options.modelName || DEFAULT_MODEL_NAMES[ModelProvider.MISTRAL],
          temperature: options.temperature ?? 0,
          apiKey: options.apiKey,
        });
      }

      case ModelProvider.LLAMA: {
        const options = agentOptions as LlamaAgentOptions;
        return new ChatOllama({
          model: options.modelPath,
          temperature: options.temperature ?? 0,
          ...(options.contextSize ? { context: options.contextSize } : {}),
        });
      }

      case ModelProvider.CUSTOM: {
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

  /**
   * Gets an agent by name
   * 
   * @param name - The name of the agent
   * @returns The agent info, or undefined if not found
   */
  getAgentByName(name: string): AgentInfo | undefined {
    return this.agents.get(name);
  }

  /**
   * Gets all initialized agents
   * 
   * @returns Array of all agent infos
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }
}