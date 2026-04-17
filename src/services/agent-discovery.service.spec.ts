import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { Injectable } from '@nestjs/common';
import { AgentDiscoveryService } from './agent-discovery.service';
import { ToolDiscoveryService } from './tool-discovery.service';
import {
  AgentOptions,
  AgentType,
  ModelProvider,
} from '../interfaces/agent.interface';
import {
  SUPERVISOR_AGENT_METADATA,
  SupervisorAgentOptions,
} from '../decorators/supervisor-agent.decorator';
import { AGENT_METADATA } from '../decorators/agent.decorator';

class MockDiscoveryService {
  getProviders() {
    return [] as unknown[];
  }
}

class MockToolDiscoveryService {
  discoverToolsForProvider() {
    return [];
  }
}

@Injectable()
class TestAgent {}

describe('AgentDiscoveryService', () => {
  let service: AgentDiscoveryService;
  let discoveryService: DiscoveryService;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentDiscoveryService,
        { provide: DiscoveryService, useClass: MockDiscoveryService },
        { provide: Reflector, useValue: new Reflector() },
        { provide: ToolDiscoveryService, useClass: MockToolDiscoveryService },
      ],
    }).compile();
    service = module.get(AgentDiscoveryService);
    discoveryService = module.get(DiscoveryService);
    reflector = module.get(Reflector);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('skips agents without tools or retrieval', async () => {
    const agentMetadata: AgentOptions = {
      name: 'Test',
      description: 'test',
      systemPrompt: 'system',
      modelType: ModelProvider.OPENAI,
      agentType: AgentType.TOOL_CALLING,
    };
    jest
      .spyOn(discoveryService, 'getProviders')
      .mockReturnValue([
        { instance: new TestAgent(), metatype: TestAgent } as never,
      ]);
    jest.spyOn(reflector, 'get').mockReturnValue(agentMetadata);

    const agents = await service.discoverAndInitializeAgents();
    expect(agents.size).toBe(0);
  });

  it('exposes registered agents via getAgentByName / getAllAgents', () => {
    const info = {
      name: 'X',
      description: 'd',
      options: { name: 'X', description: 'd', systemPrompt: 's' } as AgentOptions,
      tools: [],
    };
    (service as unknown as { agents: Map<string, typeof info> }).agents.set(
      'X',
      info,
    );
    expect(service.getAgentByName('X')).toBe(info);
    expect(service.getAllAgents()).toHaveLength(1);
  });

  describe('supervisor discovery', () => {
    class Worker {}
    class Boss {}

    it('registers @SupervisorAgent classes and exposes them', async () => {
      const workerOpts: AgentOptions = {
        name: 'Worker',
        description: 'w',
        systemPrompt: 's',
        modelType: ModelProvider.OPENAI,
        agentType: AgentType.TOOL_CALLING,
      };
      const supOpts: SupervisorAgentOptions = {
        name: 'Boss',
        description: 'b',
        systemPrompt: 'route',
        workers: ['Worker'],
      };

      jest
        .spyOn(discoveryService, 'getProviders')
        .mockReturnValue([
          { instance: new Worker(), metatype: Worker } as never,
          { instance: new Boss(), metatype: Boss } as never,
        ]);
      jest
        .spyOn(reflector, 'get')
        .mockImplementation((key: unknown, target: unknown) => {
          if (key === AGENT_METADATA && target === Worker) return workerOpts;
          if (key === SUPERVISOR_AGENT_METADATA && target === Boss) return supOpts;
          return undefined;
        });
      // The worker needs a tool to register, so stub the tool discovery.
      (
        service as unknown as {
          toolDiscoveryService: { discoverToolsForProvider: () => unknown[] };
        }
      ).toolDiscoveryService = {
        discoverToolsForProvider: () => [{ name: 'noop' }],
      };

      const supervisors = await service.discoverSupervisors();
      expect(supervisors.size).toBe(1);
      expect(service.getSupervisorByName('Boss')?.name).toBe('Boss');
      expect(service.getAllSupervisors()).toHaveLength(1);
    });

    it('warns when a supervisor references an unknown worker', async () => {
      const supOpts: SupervisorAgentOptions = {
        name: 'Lonely',
        description: '',
        workers: ['Ghost'],
      };
      jest
        .spyOn(discoveryService, 'getProviders')
        .mockReturnValue([{ instance: new Boss(), metatype: Boss } as never]);
      jest
        .spyOn(reflector, 'get')
        .mockImplementation((key: unknown) =>
          key === SUPERVISOR_AGENT_METADATA ? supOpts : undefined,
        );
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
      await service.discoverSupervisors();
      expect(warn).toHaveBeenCalled();
      expect(service.getAllSupervisors()).toHaveLength(1);
    });

    it('is idempotent across repeated calls', async () => {
      jest.spyOn(discoveryService, 'getProviders').mockReturnValue([]);
      const first = await service.discoverSupervisors();
      const second = await service.discoverSupervisors();
      expect(first).toBe(second);
    });
  });
});
