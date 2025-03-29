
import { Controller, Get, Post, Body, Logger } from '@nestjs/common';
import { CoordinatorService } from '../../src/services/coordinator.service';

@Controller('api')
export class AppController {
  private readonly logger = new Logger(AppController.name);
  
  constructor(private readonly coordinatorService: CoordinatorService) {}

  @Post('chat')
  async chat(@Body() body: { message: string }): Promise<{ response: string }> {
    this.logger.log(`Received chat request: ${JSON.stringify(body)}`);
    
    if (!body || typeof body.message !== 'string') {
      this.logger.error(`Invalid request body: ${JSON.stringify(body)}`);
      throw new Error('Invalid request body. Expected {message: string}');
    }
    
    this.logger.log(`Processing message: ${body.message}`);
    const response = await this.coordinatorService.processMessage(body.message);
    this.logger.log(`Response generated: ${response}`);
    
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