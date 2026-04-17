import { validate as runValidate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { ClassConstructor } from './class-validator-json-schema';

export class ToolInputValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Tool input failed validation:\n  - ${issues.join('\n  - ')}`,
    );
    this.name = 'ToolInputValidationError';
  }
}

/**
 * Transforms a plain object into an instance of the given DTO class and
 * validates it. Returns the validated instance.
 *
 * This is what tools decorated with a DTO receive as their `input` argument.
 * Tool code can rely on the instance being fully typed and validated — the
 * same guarantee a Nest controller gets from `ValidationPipe`.
 */
export async function validateAndTransform<T extends object>(
  cls: ClassConstructor<T>,
  raw: unknown,
): Promise<T> {
  const instance = plainToInstance(cls, raw, {
    enableImplicitConversion: true,
  });
  const errors = await runValidate(instance as object, {
    whitelist: true,
    forbidUnknownValues: false,
  });
  if (errors.length > 0) {
    const issues: string[] = [];
    for (const err of errors) {
      const constraints = err.constraints ?? {};
      for (const msg of Object.values(constraints)) {
        issues.push(`${err.property}: ${msg}`);
      }
    }
    throw new ToolInputValidationError(issues);
  }
  return instance as T;
}
