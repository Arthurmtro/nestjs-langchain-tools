import { Injectable } from '@nestjs/common';
import { SupervisorAgent } from '../../../src/decorators/supervisor-agent.decorator';

/**
 * Orchestrator that does NOT own any tool — it only routes user requests
 * to the right specialist. The supervisor LLM picks one worker per turn
 * based on the conversation so far.
 */
@Injectable()
@SupervisorAgent({
  name: 'TravelConcierge',
  description: 'Top-level travel concierge routing requests to specialists.',
  systemPrompt:
    'You are a travel concierge orchestrating three specialists:\n' +
    '  - WeatherAgent: current weather and forecasts ONLY.\n' +
    '  - BookingAgent: hotel search and reservation ONLY.\n' +
    '  - KnowledgeAgent: visas, destination tips and cultural advice ONLY.\n\n' +
    "If the user asks about weather in any form, WeatherAgent MUST run before you finish. " +
    'If they ask about hotels/booking, BookingAgent MUST run. If they ask about visas or tips, ' +
    'KnowledgeAgent MUST run. A multi-part question requires routing to each matching specialist ' +
    'in turn — one per step — before you may reply FINISH.',
  workers: ['WeatherAgent', 'BookingAgent', 'KnowledgeAgent'],
  routingStrategy: 'llm',
})
export class TravelSupervisor {}
