import { Test, TestingModule } from '@nestjs/testing';
import { AgentDiscoveryService } from './agent-discovery.service';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { ToolDiscoveryService } from './tool-discovery.service';
import { AGENT_METADATA, AgentOptions } from '../decorators/agent.decorator';
import { Injectable } from '@nestjs/common';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor } from 'langchain/agents';

// Mock implementations
class MockDiscoveryService {
  getProviders() {
    return [];
  }
}

class MockReflector {
  get(metadataKey: string, target: any) {
    return null;
  }
}

class MockToolDiscoveryService {
  discoverToolsForProvider() {
    return [];
  }
}

// Test agent with the @ToolsAgent decorator
@Injectable()
class TestAgent {
  testMethod() {
    return 'test';
  }
}

describe('AgentDiscoveryService', () => {
  let service: AgentDiscoveryService;
  let discoveryService: DiscoveryService;
  let reflector: Reflector;
  let toolDiscoveryService: ToolDiscoveryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentDiscoveryService,
        { provide: DiscoveryService, useClass: MockDiscoveryService },
        { provide: Reflector, useClass: MockReflector },
        { provide: ToolDiscoveryService, useClass: MockToolDiscoveryService },
      ],
    }).compile();

    service = module.get<AgentDiscoveryService>(AgentDiscoveryService);
    discoveryService = module.get<DiscoveryService>(DiscoveryService);
    reflector = module.get<Reflector>(Reflector);
    toolDiscoveryService = module.get<ToolDiscoveryService>(ToolDiscoveryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('discoverAndInitializeAgents', () => {
    it('should discover and initialize agents', async () => {
      // Mock the discovery service to return our test agent
      const mockProviders = [
        {
          instance: new TestAgent(),
          metatype: TestAgent,
          name: 'TestAgent',
          token: 'TestAgent',
          isAlias: false
        } as any,
      ];
      jest.spyOn(discoveryService, 'getProviders').mockReturnValue(mockProviders);

      // Mock the reflector to return agent metadata
      const agentMetadata: AgentOptions = {
        name: 'TestAgent',
        description: 'Test agent for unit tests',
        systemPrompt: 'You are a test agent',
        modelType: 'openai',
        agentType: 'openapi',
      };
      jest.spyOn(reflector, 'get').mockReturnValue(agentMetadata);

      // Mock the tool discovery service to return some tools
      const mockTools = [
        {
          name: 'testTool',
          description: 'A test tool',
          schema: { type: 'object', properties: {} },
          invoke: async () => 'test result',
          call: async () => 'test result',
          lc_namespace: ['langchain', 'tools'],
          returnDirect: false,
          lc_serializable: true,
        } as any,
      ];
      jest.spyOn(toolDiscoveryService, 'discoverToolsForProvider').mockReturnValue(mockTools);

      // Mock the createModelInstance method
      const mockModel = new ChatOpenAI();
      jest.spyOn(service as any, 'createModelInstance').mockReturnValue(mockModel);

      // Mock agent execution
      const mockAgent = { invoke: jest.fn() };
      const mockExecutor = { invoke: jest.fn() } as unknown as AgentExecutor;
      jest.spyOn(ChatPromptTemplate, 'fromMessages').mockReturnValue({} as any);
      
      // Mock the initialize method to avoid actual agent creation
      jest.spyOn(service as any, 'initializeAgent').mockImplementation(
        async (agentOptions: any, tools: any[]) => {
          service['agents'].set(agentOptions.name, {
            name: agentOptions.name,
            description: agentOptions.description,
            executor: mockExecutor
          });
          return Promise.resolve();
        });

      const result = await service.discoverAndInitializeAgents();

      // Verify the service attempted to discover agents
      expect(discoveryService.getProviders).toHaveBeenCalled();
      expect(reflector.get).toHaveBeenCalledWith(AGENT_METADATA, TestAgent);
      expect(toolDiscoveryService.discoverToolsForProvider).toHaveBeenCalled();
      
      // Verify the result contains our test agent
      expect(result.size).toBeGreaterThan(0);
    });
  });

  describe('getAgentByName and getAllAgents', () => {
    it('should return agent by name', async () => {
      const mockAgent = {
        name: 'TestAgent',
        description: 'Test agent',
        executor: {} as AgentExecutor,
      };
      
      // Add a mock agent to the agents map
      (service as any).agents.set('TestAgent', mockAgent);

      const result = service.getAgentByName('TestAgent');
      expect(result).toEqual(mockAgent);
    });

    it('should return all agents', async () => {
      const mockAgent1 = {
        name: 'TestAgent1',
        description: 'Test agent 1',
        executor: {} as AgentExecutor,
      };
      
      const mockAgent2 = {
        name: 'TestAgent2',
        description: 'Test agent 2',
        executor: {} as AgentExecutor,
      };
      
      // Add mock agents to the agents map
      (service as any).agents.set('TestAgent1', mockAgent1);
      (service as any).agents.set('TestAgent2', mockAgent2);

      const result = service.getAllAgents();
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(mockAgent1);
      expect(result).toContainEqual(mockAgent2);
    });
  });
});