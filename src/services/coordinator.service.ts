import { Injectable, Logger, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AgentDiscoveryService } from './agent-discovery.service';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BufferMemory } from 'langchain/memory';
import { AgentInfo, ModelProvider } from '../interfaces/agent.interface';
import { LangChainToolsModuleOptions } from '../interfaces/module.interface';
import { LANGCHAIN_TOOLS_OPTIONS } from '../modules/langchain-tools.module';
import {
  AGENT_INITIALIZATION_DELAY,
  AGENT_TOOL_NAME_PATTERN,
  DEFAULT_COORDINATOR_MODEL,
  DEFAULT_COORDINATOR_PROMPT
} from '../constants/coordinator.constants';

/**
 * Service that orchestrates multiple agents and routes requests
 */
@Injectable()
export class CoordinatorService implements OnModuleInit {
  private coordinatorAgent: AgentExecutor | null = null;
  private readonly logger = new Logger(CoordinatorService.name);
  private initialized = false;

  constructor(
    private readonly agentDiscoveryService: AgentDiscoveryService,
    @Optional() @Inject(LANGCHAIN_TOOLS_OPTIONS) 
    private readonly options?: LangChainToolsModuleOptions,
  ) {}

  /**
   * Initializes the coordinator after module initialization
   */
  async onModuleInit(): Promise<void> {
    // Delay initialization slightly to ensure all agents are registered
    setTimeout(async () => {
      try {
        // Wait for agents to be discovered and initialized
        await this.agentDiscoveryService.discoverAndInitializeAgents();
        
        // Get the coordinator prompt from options if provided
        const systemPrompt = this.options?.coordinatorPrompt || DEFAULT_COORDINATOR_PROMPT;
        
        // Initialize the coordinator
        await this.initialize(systemPrompt);
      } catch (error) {
        const err = error as Error;
        this.logger.error('Failed to initialize coordinator:', err.stack);
      }
    }, AGENT_INITIALIZATION_DELAY);
  }

  /**
   * Initializes the coordinator agent with the given prompt
   * 
   * @param systemPrompt - System prompt for the coordinator
   */
  async initialize(systemPrompt: string = DEFAULT_COORDINATOR_PROMPT): Promise<void> {
    try {
      this.logger.log('Initializing coordinator agent...');
      const agents = this.agentDiscoveryService.getAllAgents();
      
      if (agents.length === 0) {
        this.logger.warn('No agents found for coordinator to manage');
        return;
      }
      
      this.logger.log(`Creating coordinator with ${agents.length} agents`);
      const agentTools = this.createAgentTools(agents);

      // Get coordinator model configuration from options
      const modelName = this.options?.coordinatorModel || DEFAULT_COORDINATOR_MODEL;
      const modelProvider = this.options?.coordinatorProvider || ModelProvider.OPENAI;
      const temperature = this.options?.coordinatorTemperature ?? 0;
      
      // Create the language model
      let model;
      if (modelProvider === ModelProvider.OPENAI) {
        model = new ChatOpenAI({
          modelName,
          temperature,
        });
      } else {
        this.logger.warn(`Unsupported coordinator model provider: ${modelProvider}, falling back to OpenAI`);
        model = new ChatOpenAI({
          modelName: DEFAULT_COORDINATOR_MODEL,
          temperature: 0,
        });
      }

      // Create the prompt template
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
      ]);

      // Create the agent
      const agent = await createOpenAIFunctionsAgent({
        llm: model,
        tools: agentTools,
        prompt,
      });

      // Configure memory if requested
      let memory: BufferMemory | undefined;
      if (this.options?.coordinatorUseMemory) {
        memory = new BufferMemory({
          returnMessages: true,
          memoryKey: "chat_history",
          inputKey: "input",
          outputKey: "output",
        });
      }

      // Create the agent executor
      this.coordinatorAgent = AgentExecutor.fromAgentAndTools({
        agent,
        tools: agentTools,
        memory,
        handleParsingErrors: true,
        returnIntermediateSteps: false,
      });
      
      this.initialized = true;
      this.logger.log('Coordinator agent initialized successfully');
    } catch (error) {
      const err = error as Error;
      this.logger.error('Failed to initialize coordinator agent:', err.stack);
      throw error;
    }
  }

  /**
   * Creates tools for the coordinator to delegate to agents
   * 
   * @param agents - Array of agent infos
   * @returns Array of tools for delegation
   */
  private createAgentTools(agents: AgentInfo[]): DynamicStructuredTool[] {
    return agents.map(agent => {
      const toolName = AGENT_TOOL_NAME_PATTERN
        .replace('{agent_name}', agent.name.toLowerCase().replace(/\s+/g, '_'));
        
      this.logger.log(`Creating tool for agent: ${agent.name} as ${toolName}`);
      
      return new DynamicStructuredTool({
        name: toolName,
        description: `Delegate a task to the ${agent.name} agent. ${agent.description}`,
        schema: z.object({
          task: z.string().describe(`The task to delegate to the ${agent.name} agent`),
        }),
        func: async (input: { task: string }) => {
          const { task } = input;
          try {
            this.logger.log(`Delegating task to ${agent.name}: ${this.truncateLog(task)}`);
            const result = await agent.executor.invoke({ input: task });
            this.logger.log(`Got result from ${agent.name}`);
            return result.output as string;
          } catch (error) {
            const err = error as Error;
            this.logger.error(`Error delegating to ${agent.name}:`, err.stack);
            return `Error with ${agent.name}: ${err.message}`;
          }
        }
      });
    });
  }

  /**
   * Processes a user message and routes it to the appropriate agent
   * 
   * @param message - The user message to process
   * @returns The response from the coordinator or agent
   */
  async processMessage(message: string): Promise<string> {
    if (!this.initialized || !this.coordinatorAgent) {
      this.logger.warn('Coordinator not initialized yet, initializing now...');
      // Try to initialize synchronously if needed
      await this.agentDiscoveryService.discoverAndInitializeAgents();
      await this.initialize();
      
      if (!this.initialized || !this.coordinatorAgent) {
        throw new Error('Failed to initialize coordinator agent');
      }
    }
    
    try {
      this.logger.log(`Processing message: ${this.truncateLog(message)}`);
      const result = await this.coordinatorAgent.invoke({ input: message });
      return result.output as string;
    } catch (error) {
      const err = error as Error;
      this.logger.error('Error processing message:', err.stack);
      throw new Error(`Error processing message: ${err.message}`);
    }
  }

  /**
   * Truncates a string for logging purposes
   * 
   * @param text - The text to truncate
   * @param maxLength - Maximum length before truncation
   * @returns Truncated text
   */
  private truncateLog(text: string, maxLength = 50): string {
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  }
}