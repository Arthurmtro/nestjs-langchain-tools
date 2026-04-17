import { mapStreamEvent } from './stream-events';

describe('mapStreamEvent', () => {
  it('maps on_chat_model_stream to a token event', () => {
    const out = mapStreamEvent({
      event: 'on_chat_model_stream',
      name: 'ChatOpenAI',
      run_id: 'r1',
      data: { chunk: { content: 'Hello' } },
      metadata: { langgraph_node: 'agent' },
    } as never);
    expect(out).toEqual({ type: 'token', content: 'Hello', agent: 'agent' });
  });

  it('ignores empty chat model chunks', () => {
    const out = mapStreamEvent({
      event: 'on_chat_model_stream',
      name: 'ChatOpenAI',
      run_id: 'r1',
      data: { chunk: { content: '' } },
    } as never);
    expect(out).toBeUndefined();
  });

  it("suppresses tokens emitted from the supervisor's router node (internal routing)", () => {
    const out = mapStreamEvent({
      event: 'on_chat_model_stream',
      name: 'ChatOpenAI',
      run_id: 'r1',
      data: { chunk: { content: 'WeatherAgent' } },
      metadata: { langgraph_node: 'router' },
    } as never);
    expect(out).toBeUndefined();
  });

  it('extracts text from array-shaped multimodal content', () => {
    const out = mapStreamEvent({
      event: 'on_chat_model_stream',
      name: 'ChatOpenAI',
      run_id: 'r1',
      data: { chunk: { content: [{ text: 'Hello ' }, { text: 'World' }] } },
    } as never);
    expect(out).toEqual({ type: 'token', content: 'Hello World', agent: undefined });
  });

  it('maps on_tool_start and on_tool_end', () => {
    const start = mapStreamEvent({
      event: 'on_tool_start',
      name: 'search',
      run_id: 'r2',
      data: { input: { q: 'nest' } },
    } as never);
    const end = mapStreamEvent({
      event: 'on_tool_end',
      name: 'search',
      run_id: 'r2',
      data: { output: { results: [] } },
    } as never);
    expect(start).toEqual({
      type: 'tool-start',
      tool: 'search',
      input: { q: 'nest' },
      runId: 'r2',
    });
    expect(end).toEqual({
      type: 'tool-end',
      tool: 'search',
      output: { results: [] },
      runId: 'r2',
    });
  });

  it('maps tool-progress custom events', () => {
    const out = mapStreamEvent({
      event: 'on_custom_event',
      name: 'tool-progress',
      run_id: 'r3',
      data: { tool: 'slow', progress: 42, message: 'halfway' },
    } as never);
    expect(out).toEqual({
      type: 'tool-progress',
      tool: 'slow',
      progress: 42,
      message: 'halfway',
      data: undefined,
    });
  });

  it('maps agent-handoff custom events', () => {
    const out = mapStreamEvent({
      event: 'on_custom_event',
      name: 'agent-handoff',
      run_id: 'r4',
      data: { from: 'Triage', to: 'Booking' },
    } as never);
    expect(out).toEqual({ type: 'agent-handoff', from: 'Triage', to: 'Booking' });
  });

  it('returns undefined for irrelevant event types', () => {
    expect(
      mapStreamEvent({
        event: 'on_chain_start',
        name: 'whatever',
        run_id: 'r5',
        data: {},
      } as never),
    ).toBeUndefined();
  });
});
