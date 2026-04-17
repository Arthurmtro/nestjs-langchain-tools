import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { GraphCoordinatorService } from '../../src/graph/graph-coordinator.service';
import {
  CoordinatorStreamEvent,
} from '../../src/graph/stream-events';
import { TokenUsageService } from '../../src/observability/token-usage.service';
import { DEFAULT_PRICING } from '../../src/observability/pricing';
import { MemoryService } from '../../src/services/memory.service';
import { AgentDiscoveryService } from '../../src/services/agent-discovery.service';
import {
  SUPERVISOR_AGENT_METADATA,
  SupervisorAgentOptions,
} from '../../src/decorators/supervisor-agent.decorator';
import { ModelProvider } from '../../src/interfaces/agent.interface';
import {
  MODEL_CATALOGUE,
  RuntimeConfigService,
  RuntimeConfigSnapshot,
  RuntimeModelConfig,
  RuntimeModelOverride,
} from './runtime-config.service';

interface ChatBody {
  message: string;
  sessionId?: string;
}

interface ConfigBody {
  provider: ModelProvider;
  modelName: string;
  apiKey?: string;
  temperature?: number;
}

interface AgentOverrideBody {
  provider?: ModelProvider;
  modelName?: string;
  apiKey?: string;
  temperature?: number;
}

interface ResumeBody {
  threadId: string;
  decision: 'approve' | 'reject';
  notes?: string;
}

@Controller('api')
export class AppController {
  constructor(
    private readonly coordinator: GraphCoordinatorService,
    private readonly usage: TokenUsageService,
    private readonly memory: MemoryService,
    private readonly agents: AgentDiscoveryService,
    private readonly runtime: RuntimeConfigService,
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  private discoverSupervisors(): Array<{ name: string; description: string }> {
    const out: Array<{ name: string; description: string }> = [];
    for (const wrapper of this.discovery.getProviders()) {
      const metatype = wrapper.metatype;
      if (!metatype) continue;
      const meta = this.reflector.get<SupervisorAgentOptions | undefined>(
        SUPERVISOR_AGENT_METADATA,
        metatype,
      );
      if (!meta) continue;
      out.push({ name: meta.name, description: meta.description ?? '' });
    }
    return out;
  }

  @Get('catalogue')
  catalogue(): {
    providers: typeof MODEL_CATALOGUE;
    config: RuntimeConfigSnapshot;
    supervisors: Array<{ name: string; description: string }>;
    agents: Array<{ name: string; description: string; tools: string[] }>;
    pricedModels: string[];
    orchestration: {
      taskDelegation: 'full-context' | 'focused' | 'rewritten';
    };
  } {
    return {
      providers: MODEL_CATALOGUE,
      config: this.runtime.snapshot(),
      supervisors: this.discoverSupervisors(),
      agents: this.agents.getAllAgents().map((a) => ({
        name: a.name,
        description: a.description,
        tools: a.tools.map((t) => (t as { name: string }).name),
      })),
      pricedModels: Object.keys(DEFAULT_PRICING),
      orchestration: {
        taskDelegation:
          this.coordinator.getSupervisorOverride().taskDelegation ?? 'focused',
      },
    };
  }

  @Post('supervisor/mode')
  setSupervisorMode(
    @Body() body: { taskDelegation: 'full-context' | 'focused' | 'rewritten' },
  ): { taskDelegation: 'full-context' | 'focused' | 'rewritten' } {
    const allowed = ['full-context', 'focused', 'rewritten'] as const;
    if (!allowed.includes(body.taskDelegation)) {
      throw new HttpException(
        'taskDelegation must be one of: ' + allowed.join(', '),
        HttpStatus.BAD_REQUEST,
      );
    }
    this.coordinator.setSupervisorOverride({
      taskDelegation: body.taskDelegation,
    });
    this.usage.reset();
    return { taskDelegation: body.taskDelegation };
  }

  @Post('config')
  setConfig(@Body() body: ConfigBody): RuntimeModelConfig {
    if (!body.provider || !body.modelName) {
      throw new HttpException(
        'provider and modelName are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const next = this.runtime.set(body);
    this.coordinator.reset();
    return next;
  }

  @Post('config/agent/:name')
  setAgentOverride(
    @Param('name') name: string,
    @Body() body: AgentOverrideBody,
  ): RuntimeModelOverride {
    const override = this.runtime.setOverride(name, body);
    this.coordinator.reset();
    return override;
  }

  @Delete('config/agent/:name')
  clearAgentOverride(@Param('name') name: string): { cleared: true } {
    this.runtime.clearOverride(name);
    this.coordinator.reset();
    return { cleared: true };
  }

  @Post('chat')
  async chat(@Body() body: ChatBody): Promise<{ reply: string }> {
    const sessionId = body.sessionId ?? 'default';
    const reply = await this.coordinator.processMessage(body.message, {
      sessionId,
    });
    return { reply };
  }

  @Sse('chat/stream')
  stream(
    @Query('q') q: string,
    @Query('sessionId') sessionId = 'default',
  ): Observable<{ type: string; data: CoordinatorStreamEvent }> {
    return this.coordinator
      .processMessageStream(q, { sessionId })
      .pipe(map((event) => ({ type: event.type, data: event })));
  }

  @Post('chat/resume')
  async resume(@Body() body: ResumeBody): Promise<{ events: CoordinatorStreamEvent[] }> {
    const events = await this.coordinator.resume(body.threadId, {
      decision: body.decision,
      notes: body.notes,
    });
    return { events };
  }

  @Get('usage')
  usage_() {
    // The global token-usage callback isn't session-scoped (it's attached at
    // model construction), so we aggregate globally. The demo clears the
    // session on reload/Clear — good enough for a showcase.
    const totals = this.usage.totals();
    // Relabel "coordinator" as the supervisor name — the graph coordinator's
    // routing call is what the user perceives as the supervisor.
    const supervisors = this.discoverSupervisors();
    const supervisorName = supervisors[0]?.name;
    const byAgent = this.usage.byAgent().map((row) =>
      row.agent === 'coordinator' && supervisorName
        ? { ...row, agent: supervisorName }
        : row,
    );
    const byModel = this.usage.breakdown();
    const priced = new Set(Object.keys(DEFAULT_PRICING));
    const allFree = byModel.every((b) => !priced.has(b.model));
    const allPriced = byModel.every((b) => priced.has(b.model));
    return {
      totals,
      byAgent,
      byModel,
      history: this.usage.history().slice(-20),
      pricing: {
        computable: byModel.length === 0 ? null : allPriced,
        allFree,
        unknownModels: byModel
          .filter((b) => !priced.has(b.model))
          .map((b) => b.model),
      },
    };
  }

  @Get('sessions/:id/messages')
  async history(@Param('id') id: string) {
    const messages = await this.memory.getMessages(id);
    return messages.map((m) => ({
      role: m._getType?.() ?? 'human',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
  }

  @Post('sessions/:id/clear')
  async clear(@Param('id') id: string): Promise<{ cleared: true }> {
    await this.memory.clearMemory(id);
    return { cleared: true };
  }

  @Post('sessions/clear-all')
  async clearAll(): Promise<{ cleared: true }> {
    // Demo convenience: clear both memory (if any) and usage so the
    // cost counter resets when the user hits "Clear".
    this.usage.reset();
    return { cleared: true };
  }
}
