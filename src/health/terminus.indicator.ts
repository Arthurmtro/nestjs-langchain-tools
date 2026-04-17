import { Injectable } from '@nestjs/common';
import { LangChainHealthIndicator } from './langchain-health.indicator';

/**
 * Optional terminus-compatible indicator.
 *
 * We load `@nestjs/terminus` dynamically so it remains an optional peer
 * dependency. When terminus is installed, this class extends
 * `HealthIndicator` and produces `HealthIndicatorResult` so it can be
 * registered in a `TerminusModule`.
 *
 * ```ts
 * @Controller('health')
 * export class HealthController {
 *   constructor(
 *     private readonly health: HealthCheckService,
 *     private readonly lc: LangChainTerminusIndicator,
 *   ) {}
 *
 *   @Get()
 *   @HealthCheck()
 *   check() {
 *     return this.health.check([() => this.lc.isHealthy('langchain')]);
 *   }
 * }
 * ```
 */
@Injectable()
export class LangChainTerminusIndicator {
  constructor(private readonly indicator: LangChainHealthIndicator) {}

  async isHealthy(key = 'langchain'): Promise<Record<string, unknown>> {
    const result = this.indicator.check(key);
    const entry = result[key];
    if (entry.status === 'down') {
      const terminus = await safeRequireTerminus();
      if (terminus?.HealthCheckError) {
        throw new terminus.HealthCheckError(
          entry.reason ?? 'LangChain unhealthy',
          result,
        );
      }
      throw new Error(entry.reason ?? 'LangChain unhealthy');
    }
    return result;
  }
}

async function safeRequireTerminus(): Promise<
  | {
      HealthCheckError: new (
        message: string,
        causes: unknown,
      ) => Error;
    }
  | undefined
> {
  try {
    // Optional peer dep — use dynamic import to avoid failing when missing.
    const mod = await import('@nestjs/terminus');
    return mod as unknown as {
      HealthCheckError: new (m: string, c: unknown) => Error;
    };
  } catch {
    return undefined;
  }
}
