/**
 * Constants related to tools
 */

/** Default tool streaming config */
export const DEFAULT_TOOL_STREAMING_ENABLED = false;

/** Tool stream update interval in ms - less delay for more responsive UI */
export const TOOL_STREAM_UPDATE_INTERVAL = 50;

/** Default timeout for tool execution (in milliseconds) - 30 seconds */
export const DEFAULT_TOOL_TIMEOUT = 30000;

/** Whether to enable tool timeouts by default */
export const DEFAULT_TOOL_TIMEOUT_ENABLED = true;

/** Error message for tool timeout */
export const TOOL_TIMEOUT_ERROR_MESSAGE = 'Tool execution timed out';