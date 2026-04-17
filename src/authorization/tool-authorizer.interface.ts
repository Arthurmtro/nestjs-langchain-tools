import type { ToolAuthorizationMetadata } from '../decorators/authorize.decorator';

/**
 * Context presented to the authorizer on every tool call.
 */
export interface ToolAuthorizationContext {
  /** Name of the tool being invoked */
  toolName: string;
  /** Metadata declared by `@Authorize(...)` on the tool method */
  metadata: ToolAuthorizationMetadata;
  /** Free-form runtime context — typically the current request / principal */
  runtime?: unknown;
}

/**
 * Return `true` (or `{ allowed: true }`) to allow the tool to run, and
 * `false` (or `{ allowed: false, reason: '...' }`) to deny. Denials are
 * surfaced as tool errors visible to the LLM, not thrown exceptions.
 */
export type ToolAuthorizationDecision =
  | boolean
  | { allowed: boolean; reason?: string };

export interface ToolAuthorizer {
  authorize(
    ctx: ToolAuthorizationContext,
  ): ToolAuthorizationDecision | Promise<ToolAuthorizationDecision>;
}

export const TOOL_AUTHORIZER = Symbol('LANGCHAIN_TOOL_AUTHORIZER');
