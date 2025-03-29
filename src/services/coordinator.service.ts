import { Injectable, Logger, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AgentDiscoveryService } from './agent-discovery.service';
import { MemoryService } from './memory.service';
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
    private readonly memoryService: MemoryService,
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
      // Determine if streaming should be enabled
      const streaming = this.options?.enableStreaming ?? false;

      if (modelProvider === ModelProvider.OPENAI) {
        model = new ChatOpenAI({
          modelName,
          temperature,
          streaming,
        });
      } else {
        this.logger.warn(`Unsupported coordinator model provider: ${modelProvider}, falling back to OpenAI`);
        model = new ChatOpenAI({
          modelName: DEFAULT_COORDINATOR_MODEL,
          temperature: 0,
          streaming,
        });
      }

      // Create the prompt template, including chat_history
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        new MessagesPlaceholder("chat_history"),
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
        
        // Pre-load with a system message to prompt the model
        await memory.saveContext(
          { input: "SYSTEM: Initialize conversation memory." },
          { output: "SYSTEM: Conversation memory initialized. I will remember all messages in this conversation." }
        );
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
   * Helper to ensure memory is properly set up for a session
   * 
   * @param sessionId - The session identifier 
   * @returns Memory variables for the session
   */
  private async setupSessionMemory(sessionId: string = 'default'): Promise<{ chat_history: any[] }> {
    // Create a memory instance for this session
    const memory = this.memoryService.getChatMemoryForSession(sessionId);
    
    // Update the coordinator agent with the session memory
    if (this.coordinatorAgent) {
      this.coordinatorAgent.memory = memory;
    }
    
    // Pre-load memory variables
    try {
      const memoryVariables = await memory.loadMemoryVariables({});
      const historyMessages = memoryVariables.chat_history || [];
      this.logger.log(`Memory setup - Session ${sessionId} - Messages: ${historyMessages.length}`);
      return { chat_history: historyMessages };
    } catch (error) {
      this.logger.error(`Memory setup error: ${(error as Error).message}`);
      return { chat_history: [] };
    }
  }
  
  /**
   * Processes a user message and routes it to the appropriate agent
   * 
   * @param message - The user message to process
   * @param streaming - Whether to use streaming for this message
   * @param onToken - Optional callback for token streaming
   * @param sessionId - Session identifier for memory management
   * @returns The response from the coordinator or agent
   */
  async processMessage(
    message: string, 
    streaming: boolean = false,
    onToken?: (token: string) => void,
    sessionId: string = 'default'
  ): Promise<string> {
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
      this.logger.log(`Processing message: ${this.truncateLog(message)} (session: ${sessionId})`);
      
      // Set up memory for this session
      const { chat_history } = await this.setupSessionMemory(sessionId);
      
      // Use streaming if requested
      let response: string;
      if (streaming) {
        response = await this.processMessageStreaming(message, onToken, sessionId);
      } else {
        // Otherwise use standard processing
        this.logger.log(`Processing with memory - Session: ${sessionId}`);
        
        // Load memory before invocation to check state
        if (this.coordinatorAgent.memory) {
          try {
            const memoryVariables = await this.coordinatorAgent.memory.loadMemoryVariables({});
            const historyMessages = memoryVariables.chat_history || [];
            this.logger.log(`Memory pre-invoke - Message count: ${historyMessages.length}`);
          } catch (memError) {
            this.logger.error(`Memory pre-invoke error: ${(memError as Error).message}`);
          }
        }
        
        const result = await this.coordinatorAgent.invoke({ input: message });
        response = result.output as string;
        
        // Check memory after invocation
        if (this.coordinatorAgent.memory) {
          try {
            const memoryVariables = await this.coordinatorAgent.memory.loadMemoryVariables({});
            const historyMessages = memoryVariables.chat_history || [];
            this.logger.log(`Memory post-invoke - Message count: ${historyMessages.length}`);
          } catch (memError) {
            this.logger.error(`Memory post-invoke error: ${(memError as Error).message}`);
          }
        }
      }
      
      return response;
    } catch (error) {
      const err = error as Error;
      this.logger.error('Error processing message:', err.stack);
      throw new Error(`Error processing message: ${err.message}`);
    }
  }
  
  /**
   * Processes a user message with streaming responses
   * 
   * @param message - The user message to process 
   * @param onToken - Optional callback for token streaming
   * @param sessionId - Session identifier for memory management
   * @returns The complete response string
   */
  private async processMessageStreaming(
    message: string,
    onToken?: (token: string) => void,
    sessionId: string = 'default'
  ): Promise<string> {
    if (!this.coordinatorAgent) {
      throw new Error('Coordinator agent not initialized');
    }
    
    try {
      this.logger.log(`Processing message with streaming: ${this.truncateLog(message)} (session: ${sessionId})`);
      
      // Create a variable to collect the complete response
      let fullResponse = '';
      
      // Set up memory for this session
      const { chat_history } = await this.setupSessionMemory(sessionId);
      
      // Use the streaming interface from langchain
      const stream = await this.coordinatorAgent.streamLog({ 
        input: message,
        chat_history: chat_history  // Explicitly provide chat history
      });
      
      for await (const chunk of stream) {
        if (chunk.ops?.length && chunk.ops[0].op === 'add') {
          const addOp = chunk.ops[0];
          if (
            addOp.path.startsWith('/logs/ChatOpenAI') && 
            typeof addOp.value === 'string' && 
            addOp.value.length > 0
          ) {
            // Extract the token from the stream
            const token = addOp.value;
            
            // Append to the full response
            fullResponse += token;
            
            // Call the token callback if provided
            if (onToken) {
              onToken(token);
            }
          }
        }
      }
      
      // After streaming, we need to manually save to memory
      // as the invoke method would normally handle this
      if (this.coordinatorAgent.memory) {
        this.logger.log(`Saving to memory - Session: ${sessionId}`);
        this.logger.log(`Input: ${message}`);
        this.logger.log(`Output: ${fullResponse}`);
        
        try {
          await this.coordinatorAgent.memory.saveContext(
            { input: message },
            { output: fullResponse }
          );
          
          // Make sure the memory works by loading it
          const memoryVariables = await this.coordinatorAgent.memory.loadMemoryVariables({});
          const historyMessages = memoryVariables.chat_history || [];
          this.logger.log(`Memory loaded - Message count: ${historyMessages.length}`);
        } catch (memError) {
          this.logger.error(`Memory error: ${(memError as Error).message}`);
        }
      }
      
      return fullResponse;
    } catch (error) {
      const err = error as Error;
      this.logger.error('Error processing streaming message:', err.stack);
      throw new Error(`Error processing streaming message: ${err.message}`);
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