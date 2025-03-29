import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import {
  AGENT_METADATA,
} from '../decorators/agent.decorator';
import { RETRIEVAL_OPTIONS_KEY } from '../decorators/with-retrieval.decorator';
import { ToolDiscoveryService } from './tool-discovery.service';
import { VectorStoreService } from './vector-store.service';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOllama } from '@langchain/ollama';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder, PromptTemplate } from '@langchain/core/prompts';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BufferMemory } from 'langchain/memory';
import { ToolInterface } from '@langchain/core/tools';
import { DynamicTool } from '@langchain/core/tools';
import { RunnableSequence } from '@langchain/core/runnables';
import { 
  AgentInfo, 
  ModelProvider, 
  AgentOptions,
  OpenAIAgentOptions,
  AnthropicAgentOptions,
  LlamaAgentOptions,
  MistralAgentOptions,
  CustomModelAgentOptions,
  RetrievalOptions
} from '../interfaces/agent.interface';
import { LANGCHAIN_TOOLS_OPTIONS } from '../modules/langchain-tools.module';

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
    @Optional() private readonly vectorStoreService: VectorStoreService,
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
          // Get the tools for the agent
          const agentTools = this.toolDiscoveryService.discoverToolsForProvider(instance);
          
          // Check for retrieval options
          const retrievalOptions: RetrievalOptions | undefined = this.reflector.get(
            RETRIEVAL_OPTIONS_KEY,
            metatype,
          );
          
          // Merge retrieval options from decorator and agent options
          const mergedRetrievalOptions = retrievalOptions || agentMetadata.retrieval;
          
          // Log if retrieval is enabled
          if (mergedRetrievalOptions?.enabled) {
            this.logger.log(`Agent ${agentMetadata.name} has retrieval enabled`);
          }

          if (agentTools.length > 0 || mergedRetrievalOptions?.enabled) {
            this.logger.log(`Initializing agent: ${agentMetadata.name} with ${agentTools.length} tools`);
            
            // Add retrieval options to agent metadata if they exist
            const agentOptionsWithRetrieval = {
              ...agentMetadata,
              retrieval: mergedRetrievalOptions,
            };
            
            await this.initializeAgent(agentOptionsWithRetrieval, agentTools);
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

      // Add the retrieval tool if RAG is enabled and vector store service is available
      if (agentOptions.retrieval?.enabled && this.vectorStoreService) {
        const retrievalTool = this.createRetrievalTool(agentOptions);
        if (retrievalTool) {
          tools = [...tools, retrievalTool];
          this.logger.log(`Added retrieval tool to agent ${agentOptions.name}`);
        }
      }

      // Determine the system prompt - add RAG context if enabled
      let systemPrompt = agentOptions.systemPrompt;
      if (agentOptions.retrieval?.enabled) {
        systemPrompt += `\n\nYou can search for information in the knowledge base using the search_knowledge_base tool when you need specific information. The knowledge base contains documents with relevant information for answering questions.`;
      }

      // Create a chat prompt template
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        // Only include chat_history if memory is enabled to avoid the error
        ...(agentOptions.useMemory ? [new MessagesPlaceholder("chat_history")] : []),
        ["human", "{input}"],
        // Only include context if retrieval is enabled to avoid the error
        ...(agentOptions.retrieval?.enabled ? [new MessagesPlaceholder("context")] : []),
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
      const executor = AgentExecutor.fromAgentAndTools({
        agent,
        tools,
        memory,
        handleParsingErrors: agentOptions.handleParsingErrorMessage || true,
        returnIntermediateSteps: agentOptions.returnIntermediateSteps || false,
      });

      // If retrieval is enabled, set up a chain with context retrieval
      if (agentOptions.retrieval?.enabled && this.vectorStoreService) {
        // Wrap the executor in a RunnableSequence that retrieves context first
        const retrievalExecutor = this.createRetrievalChain(agentOptions, executor);
        
        // Register the agent with the wrapped executor
        this.agents.set(agentOptions.name, {
          name: agentOptions.name,
          description: agentOptions.description,
          executor: retrievalExecutor,
        });
        
        this.logger.log(`Agent ${agentOptions.name} initialized with RAG capabilities`);
      } else {
        // Register the agent with the standard executor
        this.agents.set(agentOptions.name, {
          name: agentOptions.name,
          description: agentOptions.description,
          executor,
        });
        
        this.logger.log(`Agent ${agentOptions.name} initialized successfully with ${agentOptions.modelType || ModelProvider.OPENAI} model`);
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to initialize agent ${agentOptions.name}:`, err.stack);
      throw error;
    }
  }
  
  /**
   * Creates a tool for retrieving information from vector store
   * 
   * @param agentOptions - Agent configuration options
   * @returns Retrieval tool or undefined if not available
   */
  private createRetrievalTool(agentOptions: AgentOptions): ToolInterface | undefined {
    if (!this.vectorStoreService) {
      this.logger.warn(`Vector store service not available for agent ${agentOptions.name}`);
      return undefined;
    }
    
    const retrievalOptions = agentOptions.retrieval;
    if (!retrievalOptions?.enabled) {
      return undefined;
    }
    
    const collectionName = retrievalOptions.collectionName || 'default';
    
    return new DynamicTool({
      name: "search_knowledge_base",
      description: "Search the knowledge base for information related to a specific query or question. Use this when you need to find specific information that might be in the knowledge base.",
      func: async (query: string) => {
        try {
          this.logger.log(`Agent ${agentOptions.name} searching knowledge base for: ${query}`);
          const results = await this.vectorStoreService!.similaritySearch(
            query, 
            collectionName,
            {
              limit: retrievalOptions.topK || 4,
              minScore: retrievalOptions.scoreThreshold,
            }
          );
          
          if (results.length === 0) {
            return "No relevant information found in the knowledge base.";
          }
          
          let response = `Found ${results.length} relevant documents:\n\n`;
          
          for (let i = 0; i < results.length; i++) {
            const { document, score } = results[i];
            response += `Document ${i + 1} (relevance: ${Math.round(score * 100)}%):\n${document.pageContent}\n\n`;
            
            if (retrievalOptions.includeMetadata && document.metadata) {
              const metadataStr = Object.entries(document.metadata)
                .filter(([key]) => key !== 'text' && key !== 'content')
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
              
              if (metadataStr) {
                response += `Source: ${metadataStr}\n\n`;
              }
            }
          }
          
          return response;
        } catch (error) {
          const err = error as Error;
          this.logger.error(`Error searching knowledge base: ${err.message}`);
          return `Error searching knowledge base: ${err.message}`;
        }
      }
    });
  }
  
  /**
   * Creates a retrieval chain that first retrieves context then runs the agent
   * 
   * @param agentOptions - Agent configuration options
   * @param executor - Original agent executor
   * @returns A combined executor with retrieval capabilities
   */
  private createRetrievalChain(
    agentOptions: AgentOptions,
    executor: AgentExecutor
  ): AgentExecutor {
    if (!this.vectorStoreService || !agentOptions.retrieval?.enabled) {
      return executor;
    }
    
    const collectionName = agentOptions.retrieval.collectionName || 'default';
    const retrievalOptions = agentOptions.retrieval;
    
    // Create a custom executor that retrieves context before running the agent
    const retrievalExecutor = {
      ...executor,
      invoke: async (input: any) => {
        try {
          // Extract query from input
          const query = input.input;
          
          // Retrieve relevant context
          this.logger.log(`Retrieving context for query: ${query}`);
          const context = await this.vectorStoreService!.createRagContext(
            query,
            collectionName,
            {
              limit: retrievalOptions.topK || 4,
              minScore: retrievalOptions.scoreThreshold,
            }
          );
          
          // Add context to input
          const inputWithContext = {
            ...input,
            context: context ? [{ type: 'system', content: context }] : []
          };
          
          // Run the executor with the enhanced input
          const result = await executor.invoke(inputWithContext);
          
          // Store the retrieved context in memory if configured
          if (retrievalOptions.storeRetrievedContext && executor.memory && context) {
            try {
              await executor.memory.saveContext(
                { input: `SYSTEM: Retrieved Context: ${context}` },
                { output: 'SYSTEM: Context saved.' }
              );
            } catch (memoryError) {
              this.logger.error(`Error saving context to memory: ${(memoryError as Error).message}`);
            }
          }
          
          return result;
        } catch (error) {
          const err = error as Error;
          this.logger.error(`Error in retrieval chain: ${err.message}`);
          // Fall back to regular execution if retrieval fails
          return executor.invoke(input);
        }
      }
    } as AgentExecutor;
    
    return retrievalExecutor;
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
          streaming: options.streaming ?? false,
          callbacks: options.streaming && options.onToken ? [
            {
              handleLLMNewToken(token) {
                options.onToken?.(token);
              },
            },
          ] : undefined,
        });
      }

      case ModelProvider.ANTHROPIC: {
        const options = agentOptions as AnthropicAgentOptions;
        return new ChatAnthropic({
          modelName: options.modelName || DEFAULT_MODEL_NAMES[ModelProvider.ANTHROPIC],
          temperature: options.temperature ?? 0,
          anthropicApiKey: options.apiKey,
          streaming: options.streaming ?? false,
          callbacks: options.streaming && options.onToken ? [
            {
              handleLLMNewToken(token) {
                options.onToken?.(token);
              },
            },
          ] : undefined,
        });
      }

      case ModelProvider.MISTRAL: {
        const options = agentOptions as MistralAgentOptions;
        return new ChatMistralAI({
          modelName: options.modelName || DEFAULT_MODEL_NAMES[ModelProvider.MISTRAL],
          temperature: options.temperature ?? 0,
          apiKey: options.apiKey,
          streaming: options.streaming ?? false,
          callbacks: options.streaming && options.onToken ? [
            {
              handleLLMNewToken(token) {
                options.onToken?.(token);
              },
            },
          ] : undefined,
        });
      }

      case ModelProvider.LLAMA: {
        const options = agentOptions as LlamaAgentOptions;
        return new ChatOllama({
          model: options.modelPath,
          temperature: options.temperature ?? 0,
          ...(options.contextSize ? { context: options.contextSize } : {}),
          streaming: options.streaming ?? false,
          callbacks: options.streaming && options.onToken ? [
            {
              handleLLMNewToken(token) {
                options.onToken?.(token);
              },
            },
          ] : undefined,
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