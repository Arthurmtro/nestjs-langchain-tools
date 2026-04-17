import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AGENT_METADATA } from '../decorators/agent.decorator';
import {
  SUPERVISOR_AGENT_METADATA,
  SupervisorAgentOptions,
} from '../decorators/supervisor-agent.decorator';
import { RETRIEVAL_OPTIONS_KEY } from '../decorators/with-retrieval.decorator';
import {
  AgentInfo,
  AgentOptions,
  RetrievalOptions,
} from '../interfaces/agent.interface';
import { ToolDiscoveryService } from './tool-discovery.service';

/**
 * A discovered supervisor agent with the optional `route()` method hook.
 */
export interface SupervisorInfo {
  name: string;
  description: string;
  options: SupervisorAgentOptions;
  /** Decorated class instance — used for rule-based `route()` dispatch. */
  instance: unknown;
}

/**
 * Discovers classes decorated with `@ToolsAgent` across the Nest container
 * and builds a registry of agents with their tools. Does not instantiate
 * LLMs or executors — that's the graph coordinator's job.
 */
@Injectable()
export class AgentDiscoveryService {
  private readonly agents = new Map<string, AgentInfo>();
  private readonly supervisors = new Map<string, SupervisorInfo>();
  private readonly logger = new Logger(AgentDiscoveryService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly toolDiscoveryService: ToolDiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  async discoverAndInitializeAgents(): Promise<Map<string, AgentInfo>> {
    if (this.agents.size > 0) return this.agents;

    const providers = this.discoveryService.getProviders();
    for (const wrapper of providers) {
      const { instance, metatype } = wrapper as InstanceWrapper;
      if (!instance || !metatype) continue;

      const agentMetadata = this.reflector.get<AgentOptions | undefined>(
        AGENT_METADATA,
        metatype,
      );
      if (!agentMetadata) continue;

      try {
        const tools = this.toolDiscoveryService.discoverToolsForProvider(instance);
        const retrievalOptions =
          this.reflector.get<RetrievalOptions | undefined>(
            RETRIEVAL_OPTIONS_KEY,
            metatype,
          ) ?? agentMetadata.retrieval;

        const merged: AgentOptions = {
          ...agentMetadata,
          retrieval: retrievalOptions,
        };

        if (tools.length === 0 && !retrievalOptions?.enabled) {
          this.logger.warn(`No tools found for agent "${agentMetadata.name}"`);
          continue;
        }

        this.agents.set(agentMetadata.name, {
          name: agentMetadata.name,
          description: agentMetadata.description,
          options: merged,
          tools,
        });
        this.logger.log(
          `Agent "${agentMetadata.name}" registered (${tools.length} tool(s))`,
        );
      } catch (error) {
        this.logger.error(
          `Error registering agent ${agentMetadata.name}:`,
          (error as Error).stack,
        );
      }
    }
    return this.agents;
  }

  getAgentByName(name: string): AgentInfo | undefined {
    return this.agents.get(name);
  }

  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Discovers all classes decorated with `@SupervisorAgent` in the Nest
   * container. Idempotent — repeated calls return the cached registry.
   * Worker names referenced in each supervisor's `workers` list are validated
   * against the agent registry; unknown names are logged as warnings but do
   * not abort discovery.
   */
  async discoverSupervisors(): Promise<Map<string, SupervisorInfo>> {
    if (this.supervisors.size > 0) return this.supervisors;
    // Ensure workers are discovered first — we need to cross-check names.
    await this.discoverAndInitializeAgents();

    for (const wrapper of this.discoveryService.getProviders()) {
      const { instance, metatype } = wrapper as InstanceWrapper;
      if (!instance || !metatype) continue;
      const meta = this.reflector.get<SupervisorAgentOptions | undefined>(
        SUPERVISOR_AGENT_METADATA,
        metatype,
      );
      if (!meta) continue;
      const unknown = (meta.workers ?? []).filter((w) => !this.agents.has(w));
      if (unknown.length > 0) {
        this.logger.warn(
          `Supervisor "${meta.name}" references unknown worker(s): ${unknown.join(', ')}`,
        );
      }
      this.supervisors.set(meta.name, {
        name: meta.name,
        description: meta.description ?? '',
        options: meta,
        instance,
      });
      this.logger.log(
        `Supervisor "${meta.name}" registered (workers=${(meta.workers ?? []).length}, routing=${meta.routingStrategy ?? 'llm'})`,
      );
    }
    return this.supervisors;
  }

  getSupervisorByName(name: string): SupervisorInfo | undefined {
    return this.supervisors.get(name);
  }

  getAllSupervisors(): SupervisorInfo[] {
    return Array.from(this.supervisors.values());
  }
}
