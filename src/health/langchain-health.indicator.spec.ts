import { LangChainHealthIndicator } from './langchain-health.indicator';
import type { AgentDiscoveryService } from '../services/agent-discovery.service';
import type { AgentInfo } from '../interfaces/agent.interface';

function stubAgents(n: number): AgentInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `a${i}`,
    description: '',
    options: { name: `a${i}`, description: '', systemPrompt: '' },
    tools: [],
  }));
}

function mockAgentService(agents: AgentInfo[]): AgentDiscoveryService {
  return { getAllAgents: () => agents } as unknown as AgentDiscoveryService;
}

describe('LangChainHealthIndicator', () => {
  it('reports down when no agents are registered', () => {
    const indicator = new LangChainHealthIndicator(mockAgentService([]));
    expect(indicator.check()).toEqual({
      langchain: { status: 'down', agents: 0, reason: 'No agents discovered' },
    });
  });

  it('reports up with agent count', () => {
    const indicator = new LangChainHealthIndicator(mockAgentService(stubAgents(3)));
    expect(indicator.check('llm')).toEqual({
      llm: { status: 'up', agents: 3 },
    });
  });
});
