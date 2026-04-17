import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type SessionIdResolver = (req: Record<string, unknown>) => string;

const defaultResolver: SessionIdResolver = (req) => {
  const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
  const header = headers['x-session-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  const user = (req.user ?? {}) as { id?: string; sub?: string };
  return user.id ?? user.sub ?? 'default';
};

/**
 * Resolves a stable session identifier from the current request so that
 * chat memory / RAG context can be scoped per user without REQUEST-scoped
 * providers.
 *
 * Default lookup order: `X-Session-Id` header → `req.user.id` →
 * `req.user.sub` → `"default"`. Pass a custom resolver to override.
 *
 * @example
 * ```typescript
 * @Post('chat')
 * chat(@Body() body: ChatDto, @SessionId() sessionId: string) {
 *   return this.coordinator.processMessage(body.message, { sessionId });
 * }
 * ```
 */
export const SessionId = createParamDecorator(
  (resolver: SessionIdResolver | undefined, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    return (resolver ?? defaultResolver)(req);
  },
);
