import { z } from 'zod';
import type { JsonSchema } from './class-validator-json-schema';

/**
 * Converts a subset of JSON Schema into a zod schema that LangChain's
 * `tool()` can accept. Used internally by the tool discovery layer to
 * expose field names and structural shape to the LLM without forwarding
 * runtime constraints (those are enforced by class-validator in the
 * executor).
 */
export function jsonSchemaToZod(schema: JsonSchema): z.ZodTypeAny {
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  if (schema.enum && schema.enum.length > 0) {
    const enumValues = schema.enum.filter(
      (v): v is string | number => typeof v === 'string' || typeof v === 'number',
    );
    if (enumValues.length > 0) {
      return z.union(
        enumValues.map((v) => z.literal(v)) as [
          z.ZodLiteral<string | number>,
          z.ZodLiteral<string | number>,
          ...Array<z.ZodLiteral<string | number>>,
        ],
      );
    }
  }

  switch (type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'array': {
      const items = schema.items ? jsonSchemaToZod(schema.items) : z.unknown();
      return z.array(items);
    }
    case 'object':
    default: {
      const props = schema.properties ?? {};
      const shape: Record<string, z.ZodTypeAny> = {};
      const required = new Set(schema.required ?? []);
      for (const [key, prop] of Object.entries(props)) {
        const child = jsonSchemaToZod(prop);
        shape[key] = required.has(key) ? child : child.optional();
      }
      if (Object.keys(shape).length === 0) {
        return z.record(z.string(), z.unknown());
      }
      return z.object(shape);
    }
  }
}
