import { Injectable, Logger, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AgentDiscoveryService, AgentInfo } from './agent-discovery.service';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const DEFAULT_COORDINATOR_PROMPT = `
You are a coordinator that routes tasks to specialized agents.
Your job is to understand the user's request and delegate it to the most appropriate agent.

Remember:
1. You have access to several specialized agents, each with their own expertise.
2. Always delegate the task to the most appropriate agent.
3. If a task requires multiple agents, break it down into subtasks and delegate each subtask.
4. If you're unsure which agent to use, analyze the user's request more carefully.

{input}
`;

@Injectable()
export class CoordinatorService implements OnModuleInit {
  private coordinatorAgent: AgentExecutor;
  private readonly logger = new Logger(CoordinatorService.name);
  private initialized = false;

  constructor(
    private readonly agentDiscoveryService: AgentDiscoveryService,
    @Optional() @Inject('LANGCHAIN_TOOLS_OPTIONS') private options?: any,
  ) {}

  async onModuleInit() {
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
        this.logger.error('Failed to initialize coordinator:', error.stack);
      }
    }, 1000);
  }

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

      const model = new ChatOpenAI({
        modelName: 'gpt-4-turbo',
        temperature: 0,
      });

      const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
      ]);

      const agent = await createOpenAIFunctionsAgent({
        llm: model,
        tools: agentTools,
        prompt,
      });

      this.coordinatorAgent = AgentExecutor.fromAgentAndTools({
        agent,
        tools: agentTools,
        handleParsingErrors: true,
        returnIntermediateSteps: false,
      });
      
      this.initialized = true;
      this.logger.log('Coordinator agent initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize coordinator agent:', error.stack);
      throw error;
    }
  }

  private createAgentTools(agents: AgentInfo[]): DynamicStructuredTool[] {
    return agents.map(agent => {
      const toolName = `ask_${agent.name.toLowerCase().replace(/\\s+/g, '_')}_agent`;
      this.logger.log(`Creating tool for agent: ${agent.name} as ${toolName}`);
      
      return new DynamicStructuredTool({
        name: toolName,
        description: `Delegate a task to the ${agent.name} agent. ${agent.description}`,
        schema: z.object({
          task: z.string().describe(`The task to delegate to the ${agent.name} agent`),
        }),
        func: async (input) => {
          const { task } = input;
          try {
            this.logger.log(`Delegating task to ${agent.name}: ${task.substring(0, 50)}...`);
            const result = await agent.executor.invoke({ input: task });
            this.logger.log(`Got result from ${agent.name}`);
            return result.output;
          } catch (error) {
            this.logger.error(`Error delegating to ${agent.name}:`, error.stack);
            return `Error with ${agent.name}: ${error.message}`;
          }
        }
      });
    });
  }

  async processMessage(message: string): Promise<string> {
    if (!this.initialized) {
      this.logger.warn('Coordinator not initialized yet, initializing now...');
      // Try to initialize synchronously if needed
      await this.agentDiscoveryService.discoverAndInitializeAgents();
      await this.initialize();
      
      if (!this.initialized) {
        throw new Error('Failed to initialize coordinator agent');
      }
    }
    
    try {
      this.logger.log(`Processing message: ${message.substring(0, 50)}...`);
      const result = await this.coordinatorAgent.invoke({ input: message });
      return result.output;
    } catch (error) {
      this.logger.error('Error processing message:', error.stack);
      throw new Error(`Error processing message: ${error.message}`);
    }
  }
}