import { Test, TestingModule } from '@nestjs/testing';
import { CoordinatorService } from './coordinator.service';
import { AgentDiscoveryService } from './agent-discovery.service';
import { AgentExecutor } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { AgentInfo } from '../interfaces/agent.interface';

// Mock implementation of AgentDiscoveryService
class MockAgentDiscoveryService {
  agents: Map<string, AgentInfo> = new Map();

  constructor() {
    // Add some mock agents
    this.agents.set('TestAgent1', {
      name: 'TestAgent1',
      description: 'Test agent 1',
      executor: {
        invoke: jest.fn().mockResolvedValue({ output: 'Result from TestAgent1' }),
      } as unknown as AgentExecutor,
    });

    this.agents.set('TestAgent2', {
      name: 'TestAgent2',
      description: 'Test agent 2',
      executor: {
        invoke: jest.fn().mockResolvedValue({ output: 'Result from TestAgent2' }),
      } as unknown as AgentExecutor,
    });
  }

  async discoverAndInitializeAgents(): Promise<Map<string, AgentInfo>> {
    return this.agents;
  }

  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  getAgentByName(name: string): AgentInfo | undefined {
    return this.agents.get(name);
  }
}

describe('CoordinatorService', () => {
  let service: CoordinatorService;
  let agentDiscoveryService: AgentDiscoveryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoordinatorService,
        {
          provide: AgentDiscoveryService,
          useClass: MockAgentDiscoveryService,
        },
      ],
    }).compile();

    service = module.get<CoordinatorService>(CoordinatorService);
    agentDiscoveryService = module.get<AgentDiscoveryService>(AgentDiscoveryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize the coordinator', async () => {
      // Just test that the method exists and doesn't throw
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  describe('processMessage', () => {
    beforeEach(async () => {
      // Setup the coordinator with a mock agent executor
      (service as any).initialized = true;
      (service as any).coordinatorAgent = {
        invoke: jest.fn().mockResolvedValue({ output: 'Coordinator response' }),
      };
    });

    it('should route requests to the coordinator agent', async () => {
      const result = await service.processMessage('Test request');
      expect(result).toBe('Coordinator response');
      expect((service as any).coordinatorAgent.invoke).toHaveBeenCalledWith({ input: 'Test request' });
    });

    it('should initialize the coordinator if not already initialized', async () => {
      // Reset the initialized flag
      (service as any).initialized = false;
      
      // Create mock coordinator agent for the initialization to succeed
      const mockCoordinatorAgent = {
        invoke: jest.fn().mockResolvedValue({ output: 'Coordinator response' }),
      };
      
      // Spy on the initialize method and make it succeed
      const initSpy = jest.spyOn(service as any, 'initialize').mockImplementation(async () => {
        (service as any).initialized = true;
        (service as any).coordinatorAgent = mockCoordinatorAgent;
      });
      
      // Set up other needed mocks
      jest.spyOn(agentDiscoveryService, 'discoverAndInitializeAgents').mockResolvedValue(new Map());
      
      // This should now succeed
      await service.processMessage('Test request');
      
      // Verify initialize was called
      expect(initSpy).toHaveBeenCalled();
    });

    it('should handle errors during request routing', async () => {
      // Make the coordinator throw an error
      (service as any).coordinatorAgent.invoke = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(service.processMessage('Test request')).rejects.toThrow('Error processing message: Test error');
    });
    
    it('should handle streaming mode when requested', async () => {
      // Setup mock for streaming
      (service as any).initialized = true;
      (service as any).coordinatorAgent = {
        streamLog: jest.fn().mockImplementation(async function* () {
          yield { 
            ops: [{ op: 'add', path: '/logs/ChatOpenAI', value: 'Hello ' }] 
          };
          yield { 
            ops: [{ op: 'add', path: '/logs/ChatOpenAI', value: 'world!' }] 
          };
        })
      };
      
      // Mock callback to track tokens
      const tokens: string[] = [];
      const onToken = (token: string) => {
        tokens.push(token);
      };
      
      // Call with streaming mode
      const result = await service.processMessage('Test request', true, onToken);
      
      // Verify results
      expect(result).toBe('Hello world!');
      expect(tokens).toEqual(['Hello ', 'world!']);
    });
    
    it('should handle errors during streaming', async () => {
      // Setup mock for streaming that throws error
      (service as any).initialized = true;
      (service as any).coordinatorAgent = {
        streamLog: jest.fn().mockImplementation(async function* () {
          yield { 
            ops: [{ op: 'add', path: '/logs/ChatOpenAI', value: 'Start ' }] 
          };
          throw new Error('Streaming error');
        })
      };
      
      // Call with streaming mode
      await expect(service.processMessage('Test request', true)).rejects.toThrow('Error processing streaming message: Streaming error');
    });
  });
});