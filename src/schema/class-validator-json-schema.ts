import 'reflect-metadata';
import { getMetadataStorage } from 'class-validator';

/**
 * JSON Schema (Draft 2020-12 subset) accepted by LLM tool-calling APIs.
 */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  nullable?: boolean;
  additionalProperties?: boolean | JsonSchema;
}

/**
 * Constructor reference (class).
 */
export type ClassConstructor<T extends object = object> = new (
  ...args: unknown[]
) => T;

export interface JsonSchemaOptions {
  /**
   * When `true` (default), emit value constraints (`minLength`, `minimum`,
   * `maxLength`, `maximum`). These are useful for OpenAPI generation but
   * can cause double-validation when the schema is passed to LangChain's
   * `tool()` — the framework pre-validates before our own class-validator
   * runs. Set to `false` to emit a structural-only schema; class-validator
   * remains the single source of truth for constraints at runtime.
   */
  includeConstraints?: boolean;
}

/**
 * Converts a class decorated with class-validator into a JSON Schema suitable
 * for passing to a LangChain tool definition.
 *
 * Supported constraints: IsString, IsNumber, IsInt, IsBoolean, IsArray,
 * IsEnum, IsOptional, IsEmail, IsUUID, IsUrl, IsDate, Min, Max, MinLength,
 * MaxLength, ArrayMinSize, ArrayMaxSize, ValidateNested (recursive), plus
 * TypeScript design-type reflection as a fallback.
 *
 * Unknown constraints are ignored rather than failing — JSON Schema is a
 * guiding hint for the LLM, not a ground-truth validator. The DTO itself
 * remains the source of truth at runtime (via `validateAndTransform`).
 */
export function classValidatorToJsonSchema(
  target: ClassConstructor,
  options: JsonSchemaOptions = {},
): JsonSchema {
  return schemaForClass(target, new Set(), options);
}

function schemaForClass(
  target: ClassConstructor,
  seen: Set<ClassConstructor>,
  options: JsonSchemaOptions,
): JsonSchema {
  if (seen.has(target)) {
    return { type: 'object' };
  }
  seen.add(target);

  const storage = getMetadataStorage();
  const metadatas = storage.getTargetValidationMetadatas(
    target,
    target.name,
    true,
    false,
  );

  const propertyMetas: Record<string, Array<{ type: string; constraints?: unknown[] }>> = {};
  const optional = new Set<string>();

  for (const meta of metadatas) {
    const property = meta.propertyName;
    if (!property) continue;
    const typeName = meta.name ?? (meta.type as unknown as string);
    const decoratorType = meta.type as unknown as string;
    // class-validator tags optional properties via conditionalValidation metadata.
    if (
      decoratorType === 'conditionalValidation' ||
      typeName === 'conditionalValidation'
    ) {
      optional.add(property);
      continue;
    }
    (propertyMetas[property] ??= []).push({
      type: typeName ?? decoratorType,
      constraints: meta.constraints,
    });
  }

  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [property, metas] of Object.entries(propertyMetas)) {
    const designType = Reflect.getMetadata(
      'design:type',
      target.prototype,
      property,
    ) as ClassConstructor | undefined;

    const propertySchema = buildPropertySchema(property, metas, designType, seen, target, options);
    properties[property] = propertySchema;

    if (!optional.has(property)) {
      required.push(property);
    }
  }

  const schema: JsonSchema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) schema.required = required;
  return schema;
}

function buildPropertySchema(
  property: string,
  metas: Array<{ type: string; constraints?: unknown[] }>,
  designType: ClassConstructor | undefined,
  seen: Set<ClassConstructor>,
  owner: ClassConstructor,
  options: JsonSchemaOptions,
): JsonSchema {
  const schema: JsonSchema = {};
  const includeConstraints = options.includeConstraints ?? true;

  for (const { type, constraints } of metas) {
    switch (type) {
      case 'isString':
        schema.type = 'string';
        break;
      case 'isNumber':
      case 'isNumberString':
        schema.type = schema.type ?? 'number';
        break;
      case 'isInt':
        schema.type = 'integer';
        break;
      case 'isBoolean':
        schema.type = 'boolean';
        break;
      case 'isArray':
        schema.type = 'array';
        break;
      case 'isObject':
        schema.type = schema.type ?? 'object';
        break;
      case 'isDate':
      case 'isDateString':
        schema.type = 'string';
        schema.format = 'date-time';
        break;
      case 'isEmail':
        schema.type = 'string';
        schema.format = 'email';
        break;
      case 'isUrl':
      case 'isUri':
        schema.type = 'string';
        schema.format = 'uri';
        break;
      case 'isUuid':
        schema.type = 'string';
        schema.format = 'uuid';
        break;
      case 'isEnum': {
        const enumObj = constraints?.[0];
        if (enumObj && typeof enumObj === 'object') {
          schema.enum = Object.values(enumObj as Record<string, unknown>).filter(
            (v) => typeof v === 'string' || typeof v === 'number',
          );
        }
        break;
      }
      case 'min':
        if (includeConstraints && typeof constraints?.[0] === 'number')
          schema.minimum = constraints[0];
        break;
      case 'max':
        if (includeConstraints && typeof constraints?.[0] === 'number')
          schema.maximum = constraints[0];
        break;
      case 'minLength':
        if (includeConstraints && typeof constraints?.[0] === 'number')
          schema.minLength = constraints[0];
        break;
      case 'maxLength':
        if (includeConstraints && typeof constraints?.[0] === 'number')
          schema.maxLength = constraints[0];
        break;
      case 'arrayMinSize':
        schema.type = 'array';
        // Represented on the items-level schema isn't standard; we keep it as hint.
        break;
      case 'arrayMaxSize':
        schema.type = 'array';
        break;
      case 'validateNested':
        // Nested class is resolved via ClassTransformer @Type metadata.
        break;
      default:
        break;
    }
  }

  if (!schema.type) {
    schema.type = inferTypeFromDesign(designType);
  }

  // Nested object: resolved via class-transformer's Type() metadata.
  const nestedType = getNestedType(owner, property);
  if (nestedType) {
    const nested = schemaForClass(nestedType, seen, options);
    if (schema.type === 'array') {
      schema.items = nested;
    } else {
      Object.assign(schema, nested);
    }
  } else if (schema.type === 'array' && !schema.items) {
    schema.items = { type: 'string' };
  }

  return schema;
}

function inferTypeFromDesign(
  designType: ClassConstructor | undefined,
): string | undefined {
  if (!designType) return undefined;
  const name = designType.name;
  switch (name) {
    case 'String':
      return 'string';
    case 'Number':
      return 'number';
    case 'Boolean':
      return 'boolean';
    case 'Array':
      return 'array';
    case 'Date':
      return 'string';
    case 'Object':
      return 'object';
    default:
      return undefined;
  }
}

function getNestedType(
  owner: ClassConstructor,
  property: string,
): ClassConstructor | undefined {
  // class-transformer keeps @Type() metadata in a private storage. We look
  // it up via the same accessor the library itself uses, then fall back to
  // reflect-metadata's design:type if no explicit Type() was declared.
  try {
    const storage = getClassTransformerStorage();
    if (storage) {
      const meta = storage.findTypeMetadata(owner, property);
      const resolved =
        typeof meta?.typeFunction === 'function'
          ? meta.typeFunction()
          : undefined;
      if (resolved) return resolved as ClassConstructor;
    }
  } catch {
    // fall through — class-transformer internals may have moved.
  }

  const designType = Reflect.getMetadata(
    'design:type',
    owner.prototype,
    property,
  ) as ClassConstructor | undefined;
  if (designType && !isPrimitive(designType)) return designType;

  return undefined;
}

interface TransformerStorage {
  findTypeMetadata(target: unknown, propertyName: string): {
    typeFunction?: () => unknown;
  } | undefined;
}

let cachedStorage: TransformerStorage | null | undefined;

function getClassTransformerStorage(): TransformerStorage | null {
  if (cachedStorage !== undefined) return cachedStorage;
  try {
    // class-transformer exposes this in its cjs/esm bundles under a stable path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('class-transformer/cjs/storage');
    cachedStorage = (mod?.defaultMetadataStorage ??
      null) as TransformerStorage | null;
  } catch {
    cachedStorage = null;
  }
  return cachedStorage;
}

function isPrimitive(ctor: ClassConstructor): boolean {
  return (
    ctor === (String as unknown as ClassConstructor) ||
    ctor === (Number as unknown as ClassConstructor) ||
    ctor === (Boolean as unknown as ClassConstructor) ||
    ctor === (Array as unknown as ClassConstructor) ||
    ctor === (Object as unknown as ClassConstructor) ||
    ctor === (Date as unknown as ClassConstructor)
  );
}
