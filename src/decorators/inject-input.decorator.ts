import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Parameter decorator that extracts the request body for easy input access
 * 
 * @example
 * ```typescript
 * @Post('chat')
 * async chat(@InjectInput() input: { message: string }): Promise<{ response: string }> {
 *   return {
 *     response: await this.coordinatorService.processMessage(input.message),
 *   };
 * }
 * ```
 */
export const InjectInput = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.body;
  },
);