import { Test, TestingModule } from '@nestjs/testing';
import { CoordinatorService } from './coordinator.service';
import { AgentDiscoveryService, AgentInfo } from './agent-discovery.service';
import { AgentExecutor } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';

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
  });
});