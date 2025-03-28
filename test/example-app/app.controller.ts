
import { Controller, Get, Post, Body } from '@nestjs/common';
import { CoordinatorService } from '../../src/services/coordinator.service';

@Controller('api')
export class AppController {
  constructor(private readonly coordinatorService: CoordinatorService) {}

  @Post('chat')
  async chat(@Body() body: { message: string }): Promise<{ response: string }> {
    // Process the message through the coordinator
    // The coordinator will route it to the appropriate agent
    const response = await this.coordinatorService.processMessage(body.message);
    return { response };
  }

  @Get('agents')
  getAgents(): { agents: Array<{ name: string; description: string }> } {
    // Get a list of all available agents for informational purposes
    // We need to access the agentDiscoveryService through the coordinator
    const agents = (this.coordinatorService as any).agentDiscoveryService?.getAllAgents() || [];
    return {
      agents: agents.map(agent => ({
        name: agent.name,
        description: agent.description
      }))
    };
  }
}