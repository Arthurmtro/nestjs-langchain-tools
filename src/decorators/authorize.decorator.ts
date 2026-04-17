import { SetMetadata } from '@nestjs/common';

export const TOOL_AUTHORIZATION_METADATA = 'langchain:tool-authorization';

/**
 * Declarative metadata applied by {@link Authorize}.
 */
export interface ToolAuthorizationMetadata {
  /** Roles required to invoke the tool. The authorizer compares against runtime. */
  roles?: string[];
  /** Named policy identifier passed to the authorizer. */
  policy?: string;
  /** Arbitrary extra metadata forwarded to the authorizer. */
  attributes?: Record<string, unknown>;
}

/**
 * Method decorator that attaches authorization metadata to an `@AgentTool`.
 *
 * The {@link ToolAuthorizer} provided in module options (or injected by the
 * application) receives this metadata together with the current runtime
 * context before each tool invocation.
 *
 * @example
 * ```typescript
 * @AgentTool({ name: 'delete_user', description: '...', input: DeleteUserDto })
 * @Authorize({ roles: ['admin'] })
 * deleteUser(input: DeleteUserDto) { ... }
 * ```
 */
export const Authorize = (
  metadata: ToolAuthorizationMetadata,
): MethodDecorator => SetMetadata(TOOL_AUTHORIZATION_METADATA, metadata);
