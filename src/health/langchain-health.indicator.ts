import { Injectable } from '@nestjs/common';
import { AgentDiscoveryService } from '../services/agent-discovery.service';

export interface LangChainHealthResult {
  [key: string]: {
    status: 'up' | 'down';
    agents?: number;
    reason?: string;
  };
}

/**
 * Minimal health indicator usable directly or wired into `@nestjs/terminus`.
 *
 * When terminus is available, {@link createLangChainHealthIndicator} exposes
 * a `HealthIndicator`-compatible class. This plain implementation works
 * without the terminus peer dependency.
 */
@Injectable()
export class LangChainHealthIndicator {
  constructor(private readonly agentDiscoveryService: AgentDiscoveryService) {}

  check(key = 'langchain'): LangChainHealthResult {
    const agents = this.agentDiscoveryService.getAllAgents();
    if (agents.length === 0) {
      return {
        [key]: {
          status: 'down',
          agents: 0,
          reason: 'No agents discovered',
        },
      };
    }
    return {
      [key]: {
        status: 'up',
        agents: agents.length,
      },
    };
  }
}
