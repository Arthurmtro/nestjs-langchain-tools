import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  answeredWorkersThisTurn,
  buildSupervisor,
  buildWorkerInput,
  lastWorkerThisTurn,
  parseRouterBlock,
} from './supervisor.builder';
import type { AgentInfo } from '../interfaces/agent.interface';
import type { SupervisorAgentOptions } from '../decorators/supervisor-agent.decorator';

function worker(name: string): AgentInfo {
  return {
    name,
    description: name,
    options: { name, description: name, systemPrompt: 'respond' } as AgentInfo['options'],
    tools: [],
  };
}

describe('buildSupervisor', () => {
  it('routes to the worker named in the supervisor LLM response and then terminates on FINISH', async () => {
    // First response picks a worker, second response returns FINISH to end.
    const supervisorModel = new FakeListChatModel({
      responses: ['WeatherAgent', 'FINISH'],
    });
    const workerModel = new FakeListChatModel({
      responses: ['The weather is sunny.'],
    });

    const options: SupervisorAgentOptions = {
      name: 'Boss',
      description: 'top',
      workers: ['WeatherAgent'],
      systemPrompt: 'route',
      // Disable synthesis so this assertion targets raw worker output.
      finalSynthesis: false,
    };

    const sup = await buildSupervisor({
      model: supervisorModel as unknown as BaseChatModel,
      workers: [worker('WeatherAgent')],
      options,
      workerModelFactory: () => workerModel as unknown as BaseChatModel,
    });

    const result = await sup.invoke({
      messages: [new HumanMessage('what is the weather')],
    });
    const last = result.messages[result.messages.length - 1];
    // The worker's answer should be appended to the message history.
    expect(String(last.content)).toContain('sunny');
  });

  it('ends immediately when the supervisor says FINISH', async () => {
    const supervisorModel = new FakeListChatModel({ responses: ['FINISH'] });
    const workerModel = new FakeListChatModel({ responses: ['never called'] });
    const sup = await buildSupervisor({
      model: supervisorModel as unknown as BaseChatModel,
      workers: [worker('W')],
      options: {
        name: 'Boss',
        description: '',
        workers: ['W'],
        finalSynthesis: false,
      },
      workerModelFactory: () => workerModel as unknown as BaseChatModel,
    });
    const result = await sup.invoke({
      messages: [new HumanMessage('hi')],
    });
    // Only the user message — the worker was never invoked.
    expect(result.messages).toHaveLength(1);
  });

  it('honours a rule-based router', async () => {
    const supervisorModel = new FakeListChatModel({ responses: [] });
    const workerModel = new FakeListChatModel({
      responses: ['hotel list 1', 'hotel list 2'],
    });
    let called = 0;
    const sup = await buildSupervisor({
      model: supervisorModel as unknown as BaseChatModel,
      workers: [worker('Booking')],
      options: {
        name: 'Boss',
        description: '',
        workers: ['Booking'],
        routingStrategy: 'rule-based',
      },
      workerModelFactory: () => workerModel as unknown as BaseChatModel,
      ruleRouter: () => {
        called += 1;
        // Return the worker once then terminate.
        return called === 1 ? 'Booking' : undefined;
      },
    });
    const result = await sup.invoke({
      messages: [new HumanMessage('book a hotel')],
    });
    expect(called).toBeGreaterThanOrEqual(1);
    expect(result.messages.some((m) => String(m.content).includes('hotel list 1'))).toBe(
      true,
    );
  });

  it('appends a probe message when the last message is an AI turn (Mistral compat)', async () => {
    // Record the exact messages the supervisor LLM sees so we can assert
    // the last message is a HumanMessage even when the prior turn ended
    // with an AIMessage.
    const seenMessages: unknown[] = [];
    class Probe {
      invoke = (messages: unknown) => {
        seenMessages.push(messages);
        return Promise.resolve(new AIMessage('FINISH'));
      };
    }
    const supervisorModel = new Probe() as unknown as BaseChatModel;
    const workerModel = new FakeListChatModel({ responses: [] });

    const sup = await buildSupervisor({
      model: supervisorModel,
      workers: [worker('W')],
      options: {
        name: 'Boss',
        description: '',
        workers: ['W'],
        // Synthesis would invoke the probe model again; isolate router probe.
        finalSynthesis: false,
      },
      workerModelFactory: () => workerModel as unknown as BaseChatModel,
    });
    // Feed a state whose last message is already an AIMessage — simulates
    // the state right after a worker node ran.
    await sup.invoke({
      messages: [new HumanMessage('hi'), new AIMessage('worker reply')],
    });
    expect(seenMessages.length).toBe(1);
    const last = (seenMessages[0] as unknown[])[(seenMessages[0] as unknown[]).length - 1];
    expect(last).toBeInstanceOf(HumanMessage);
    expect(String((last as HumanMessage).content)).toMatch(/worker should run next/i);
  });

  it('overrides a premature FINISH when the user still has pending topics matching a pending worker', async () => {
    // Supervisor says FINISH after WeatherAgent, but the user asked for
    // hotels and visa too. Post-validator should spot "hotels" / "visa"
    // in the user text and re-route to the next pending worker.
    const supervisorModel = new FakeListChatModel({
      // Turn 1 → WeatherAgent, Turn 2 → premature FINISH, Turn 3 →
      // "BookingAgent" after override produced Booking, Turn 4 → FINISH.
      responses: ['WeatherAgent', 'FINISH', 'KnowledgeAgent', 'FINISH'],
    });
    const weatherModel = new FakeListChatModel({ responses: ['sunny'] });
    const bookingModel = new FakeListChatModel({ responses: ['two hotels'] });
    const knowledgeModel = new FakeListChatModel({ responses: ['no visa needed'] });
    const modelByName: Record<string, BaseChatModel> = {
      WeatherAgent: weatherModel as unknown as BaseChatModel,
      BookingAgent: bookingModel as unknown as BaseChatModel,
      KnowledgeAgent: knowledgeModel as unknown as BaseChatModel,
    };

    const sup = await buildSupervisor({
      model: supervisorModel as unknown as BaseChatModel,
      workers: [
        {
          name: 'WeatherAgent',
          description: 'weather and forecasts',
          options: {
            name: 'WeatherAgent',
            description: 'w',
            systemPrompt: 's',
          } as AgentInfo['options'],
          tools: [],
        },
        {
          name: 'BookingAgent',
          description: 'hotels and reservations',
          options: {
            name: 'BookingAgent',
            description: 'b',
            systemPrompt: 's',
          } as AgentInfo['options'],
          tools: [],
        },
        {
          name: 'KnowledgeAgent',
          description: 'visa information and travel tips',
          options: {
            name: 'KnowledgeAgent',
            description: 'k',
            systemPrompt: 's',
          } as AgentInfo['options'],
          tools: [],
        },
      ],
      options: {
        name: 'Boss',
        description: '',
        workers: ['WeatherAgent', 'BookingAgent', 'KnowledgeAgent'],
      },
      workerModelFactory: (w) => modelByName[w.name]!,
    });

    const result = await sup.invoke({
      messages: [
        new HumanMessage('check the weather, find hotels, and give visa advice'),
      ],
    });
    // All three workers' answers should appear in the final state, even
    // though the supervisor tried to FINISH after WeatherAgent.
    const names = result.messages
      .map((m) => (m as { name?: string }).name)
      .filter(Boolean);
    expect(names).toEqual(
      expect.arrayContaining(['WeatherAgent', 'BookingAgent', 'KnowledgeAgent']),
    );
  });

  it('treats a router LLM failure as FINISH so a single bad call does not kill the turn', async () => {
    class FailingModel {
      invoke = () => Promise.reject(new Error('provider boom'));
    }
    const sup = await buildSupervisor({
      model: new FailingModel() as unknown as BaseChatModel,
      workers: [worker('W')],
      options: { name: 'Boss', description: '', workers: ['W'] },
      workerModelFactory: () =>
        new FakeListChatModel({ responses: [] }) as unknown as BaseChatModel,
    });
    const result = await sup.invoke({
      messages: [new HumanMessage('hi')],
    });
    // No crash — the graph terminates cleanly with just the user message.
    expect(result.messages[0]).toBeInstanceOf(HumanMessage);
  });

  describe('answeredWorkersThisTurn (per-turn scoping)', () => {
    const workerList = [worker('WeatherAgent'), worker('BookingAgent'), worker('KnowledgeAgent')];

    it('counts only workers that produced AI messages after the latest HumanMessage', () => {
      const messages = [
        new HumanMessage('turn 1 question'),
        new AIMessage({
          content: 'weather',
          additional_kwargs: { source_agent: 'WeatherAgent' },
        }),
        new AIMessage({
          content: 'final reply',
          additional_kwargs: {},
        }),
        new HumanMessage('turn 2 follow-up'),
      ];
      const answered = answeredWorkersThisTurn(messages, workerList);
      // No worker has answered IN THIS TURN yet — the WeatherAgent reply
      // belongs to turn 1.
      expect(answered.size).toBe(0);
    });

    it('picks up workers answered after the latest HumanMessage', () => {
      const messages = [
        new HumanMessage('turn 1'),
        new AIMessage({ content: 'old', additional_kwargs: { source_agent: 'WeatherAgent' } }),
        new HumanMessage('turn 2 asking about weather again'),
        new AIMessage({
          content: 'fresh weather',
          additional_kwargs: { source_agent: 'WeatherAgent' },
        }),
      ];
      const answered = answeredWorkersThisTurn(messages, workerList);
      expect(answered.has('WeatherAgent')).toBe(true);
      expect(answered.size).toBe(1);
    });

    it('ignores messages whose source_agent is not a known worker', () => {
      const messages = [
        new HumanMessage('x'),
        new AIMessage({
          content: 'from nowhere',
          additional_kwargs: { source_agent: 'RandomAgent' },
        }),
      ];
      expect(answeredWorkersThisTurn(messages, workerList).size).toBe(0);
    });
  });

  describe('lastWorkerThisTurn', () => {
    const workerList = [worker('WeatherAgent'), worker('BookingAgent')];

    it('returns undefined when the latest message is a fresh human turn', () => {
      const messages = [
        new HumanMessage('turn 1'),
        new AIMessage({
          content: 'forecast',
          additional_kwargs: { source_agent: 'WeatherAgent' },
        }),
        new HumanMessage('turn 2'),
      ];
      expect(lastWorkerThisTurn(messages, workerList)).toBeUndefined();
    });

    it('returns the worker name when they answered in the current turn', () => {
      const messages = [
        new HumanMessage('turn 1'),
        new AIMessage({
          content: 'hotels',
          additional_kwargs: { source_agent: 'BookingAgent' },
        }),
      ];
      expect(lastWorkerThisTurn(messages, workerList)).toBe('BookingAgent');
    });
  });

  describe('parseRouterBlock (combined rewrite)', () => {
    it('extracts NEXT + TASK from a well-formed response', () => {
      const out = parseRouterBlock(
        'NEXT: WeatherAgent\nTASK: Provide a 3-day Kyoto forecast.',
      );
      expect(out.next).toBe('WeatherAgent');
      expect(out.task).toBe('Provide a 3-day Kyoto forecast.');
      expect(out.finish).toBeUndefined();
    });

    it('recognises FINISH as a terminal verdict', () => {
      expect(parseRouterBlock('FINISH').finish).toBe(true);
      expect(parseRouterBlock('  FINISH  ').finish).toBe(true);
    });

    it('tolerates markdown fences around the TASK', () => {
      const out = parseRouterBlock(
        'NEXT: BookingAgent\nTASK: ```\nFind mid-April hotels in Rome for 2 nights.\n```',
      );
      expect(out.next).toBe('BookingAgent');
      expect(out.task).toContain('Find mid-April hotels in Rome');
    });

    it('returns undefined fields when the format is unrecognised', () => {
      const out = parseRouterBlock('Maybe WeatherAgent? Not sure.');
      expect(out.next).toBeUndefined();
      expect(out.task).toBeUndefined();
      expect(out.finish).toBeUndefined();
    });
  });

  describe('taskDelegation modes (buildWorkerInput)', () => {
    const noopModel = new FakeListChatModel({ responses: [] }) as unknown as BaseChatModel;
    const stubRewriter = jest.fn(async () => 'stub');
    const baseArgs = {
      worker: worker('WeatherAgent'),
      messages: [new HumanMessage('weather + hotels + visa for Kyoto')],
      model: noopModel,
      rewriter: stubRewriter,
    };

    beforeEach(() => stubRewriter.mockClear());

    it('full-context: returns the state messages unchanged', async () => {
      const out = await buildWorkerInput({ mode: 'full-context', ...baseArgs });
      expect(out).toBe(baseArgs.messages);
      expect(stubRewriter).not.toHaveBeenCalled();
    });

    it("focused: appends a trailing 'respond only to your domain' SystemMessage", async () => {
      const out = await buildWorkerInput({ mode: 'focused', ...baseArgs });
      expect(out).toHaveLength(baseArgs.messages.length + 1);
      const last = out[out.length - 1];
      expect(last).toBeInstanceOf(SystemMessage);
      expect(String(last.content)).toMatch(/Supervisor directive/i);
      expect(String(last.content)).toMatch(/WeatherAgent/);
      expect(stubRewriter).not.toHaveBeenCalled();
    });

    it('rewritten: calls the subtaskRewriter and returns only the rewritten task', async () => {
      stubRewriter.mockResolvedValueOnce(
        'Provide a 3-day weather forecast for Kyoto in mid-April.',
      );
      const out = await buildWorkerInput({ mode: 'rewritten', ...baseArgs });
      expect(stubRewriter).toHaveBeenCalledTimes(1);
      expect(stubRewriter).toHaveBeenCalledWith(
        expect.objectContaining({
          worker: 'WeatherAgent',
          messages: baseArgs.messages,
        }),
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toBeInstanceOf(HumanMessage);
      expect(String(out[0].content)).toMatch(/3-day weather forecast for Kyoto/);
    });
  });

  it('runs a final synthesis step by default — the last message is supervisor-tagged', async () => {
    // Supervisor model responses: route WeatherAgent (call 1). The
    // follow-up router call is short-circuited (pending workers exhausted
    // after one worker with no others to route to), so the 2nd LLM call is
    // the synthesis node.
    const supervisorModel = new FakeListChatModel({
      responses: [
        'WeatherAgent',
        'Here is your forecast: sunny and warm.',
      ],
    });
    const workerModel = new FakeListChatModel({ responses: ['sunny'] });
    const sup = await buildSupervisor({
      model: supervisorModel as unknown as BaseChatModel,
      workers: [worker('WeatherAgent')],
      options: {
        name: 'TravelBoss',
        description: 'top',
        workers: ['WeatherAgent'],
        // finalSynthesis defaults to true — explicit here for clarity.
        finalSynthesis: true,
      },
      workerModelFactory: () => workerModel as unknown as BaseChatModel,
    });
    const result = await sup.invoke({
      messages: [new HumanMessage('what is the weather')],
    });
    const last = result.messages[result.messages.length - 1];
    // Final message is tagged with the supervisor's name, not the worker's.
    expect((last as { name?: string }).name).toBe('TravelBoss');
    expect(String(last.content)).toMatch(/sunny and warm|forecast/i);
  });

  it('terminates at max_iterations even if the LLM keeps picking workers', async () => {
    const supervisorModel = new FakeListChatModel({
      // Would keep delegating forever if unchecked.
      responses: ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
    });
    const workerModel = new FakeListChatModel({
      responses: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    const sup = await buildSupervisor({
      model: supervisorModel as unknown as BaseChatModel,
      workers: [worker('W')],
      options: {
        name: 'Boss',
        description: '',
        workers: ['W'],
        terminateOn: { kind: 'max_iterations', limit: 2 },
      },
      workerModelFactory: () => workerModel as unknown as BaseChatModel,
    });
    const result = await sup.invoke({
      messages: [new HumanMessage('go')],
    });
    // We should have AT MOST (max_iterations) worker responses in the trace.
    const workerResponses = result.messages.filter((m) => (m as { name?: string }).name === 'W');
    expect(workerResponses.length).toBeLessThanOrEqual(2);
  });
});
