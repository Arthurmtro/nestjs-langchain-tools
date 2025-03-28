/**
 * Default prompt for the coordinator agent
 */
export const DEFAULT_COORDINATOR_PROMPT = `
You are a coordinator that routes tasks to specialized agents.
Your job is to understand the user's request and delegate it to the most appropriate agent.

Remember:
1. You have access to several specialized agents, each with their own expertise.
2. Always delegate the task to the most appropriate agent.
3. If a task requires multiple agents, break it down into subtasks and delegate each subtask.
4. If you're unsure which agent to use, analyze the user's request more carefully.

{input}
`;

/**
 * Default model to use for the coordinator
 */
export const DEFAULT_COORDINATOR_MODEL = 'gpt-4o';

/**
 * Time in milliseconds to wait for agent initialization
 */
export const AGENT_INITIALIZATION_DELAY = 1000;

/**
 * Naming pattern for agent tools
 */
export const AGENT_TOOL_NAME_PATTERN = 'ask_{agent_name}_agent';