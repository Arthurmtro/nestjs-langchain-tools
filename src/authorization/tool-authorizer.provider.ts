import type { ToolAuthorizer } from './tool-authorizer.interface';

export { TOOL_AUTHORIZER } from './tool-authorizer.interface';

/**
 * Default authorizer: denies any tool that declares auth metadata.
 *
 * The default is intentionally conservative — once you add `@Authorize(...)`
 * to a tool, you opt in to needing a real authorizer. Plug in your own
 * implementation (RBAC, OPA, Casbin, custom) via module options:
 *
 * ```ts
 * LangChainToolsModule.forRoot({ toolAuthorizer: new MyAuthorizer() })
 * ```
 */
export const DEFAULT_TOOL_AUTHORIZER: ToolAuthorizer = {
  authorize({ metadata, toolName }) {
    if (
      !metadata ||
      ((!metadata.roles || metadata.roles.length === 0) &&
        !metadata.policy)
    ) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Tool "${toolName}" requires authorization, but no toolAuthorizer was configured`,
    };
  },
};
