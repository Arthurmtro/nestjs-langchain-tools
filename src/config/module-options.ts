import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  validateSync,
} from 'class-validator';
import { Type, plainToInstance } from 'class-transformer';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Scope } from '@nestjs/common';
import { ModelProvider } from '../interfaces/agent.interface';
import type { ToolStreamUpdate } from '../interfaces/tool.interface';
import type { VectorStoreOptions } from '../interfaces/vector-store.interface';
import type { LlmFactory } from '../llm/llm-factory.interface';
import type { SessionStore } from '../memory/session-store.interface';
import type { ToolAuthorizer } from '../authorization/tool-authorizer.interface';

export class ToolTimeoutDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(1)
  durationMs!: number;
}

/**
 * Top-level options for LangChainToolsModule.
 *
 * All primitive fields are validated by class-validator when the module
 * boots. Non-primitive fields (factories, callbacks, LangChain instances)
 * are passed through without validation — they cannot be represented as
 * JSON and are only checked structurally.
 */
export class LangChainToolsModuleOptions {
  /** System prompt used by the coordinator agent */
  @IsOptional()
  @IsString()
  coordinatorPrompt?: string;

  /** Model name for the coordinator (e.g. "gpt-4o") */
  @IsOptional()
  @IsString()
  coordinatorModel?: string;

  /** Provider for the coordinator model */
  @IsOptional()
  @IsEnum(ModelProvider)
  coordinatorProvider?: ModelProvider;

  /** Whether the coordinator keeps conversation memory */
  @IsOptional()
  @IsBoolean()
  coordinatorUseMemory?: boolean;

  /**
   * Orchestration mode for the coordinator graph.
   *   - `auto` (default): use the supervisor graph when any class in the
   *     application has `@SupervisorAgent`; fall back to a flat
   *     ReAct agent otherwise.
   *   - `flat`: always use a single ReAct agent with every tool merged.
   *   - `supervisor`: require a supervisor — throw if none is discovered.
   */
  @IsOptional()
  @IsIn(['auto', 'flat', 'supervisor'])
  orchestration?: 'auto' | 'flat' | 'supervisor';

  /**
   * Module-wide default for how the supervisor delegates sub-tasks to
   * workers. Decorator-level `taskDelegation` wins if set.
   */
  @IsOptional()
  @IsIn(['full-context', 'focused', 'rewritten'])
  supervisorTaskDelegation?: 'full-context' | 'focused' | 'rewritten';

  /** Sampling temperature (0..2) for the coordinator */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  coordinatorTemperature?: number;

  /** Whether LLM token streaming is enabled globally */
  @IsOptional()
  @IsBoolean()
  enableStreaming?: boolean;

  /** Whether tool execution streaming is enabled globally */
  @IsOptional()
  @IsBoolean()
  enableToolStreaming?: boolean;

  /** Default embedding model for RAG */
  @IsOptional()
  @IsString()
  embeddingModel?: string;

  /** Global tool timeout (ms or structured config) */
  @IsOptional()
  toolTimeout?: ToolTimeoutDto | number;

  /** Vector store configuration (RAG) */
  @IsOptional()
  @IsObject()
  vectorStore?: VectorStoreOptions;

  /** Maximum number of messages kept per session (default 100) */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxMessagesPerSession?: number;

  /** Session TTL in milliseconds (default: no TTL) */
  @IsOptional()
  @IsInt()
  @Min(1000)
  sessionTtlMs?: number;

  // ---- function / instance fields: structural only, not validated ----

  /** Callback on every streamed LLM token */
  onToken?: (token: string) => void;

  /** Callback on every tool stream event */
  onToolStream?: (update: ToolStreamUpdate) => void;

  /** Callback when a tool times out */
  onToolTimeout?: (toolName: string, timeoutMs: number) => void;

  /** Custom LLM factory — overrides the default OpenAI/Anthropic/Mistral/Ollama map */
  llmFactory?: LlmFactory;

  /** Custom session store — overrides the default InMemorySessionStore */
  sessionStore?: SessionStore;

  /** Tool authorizer — resolves @Authorize metadata against the current request */
  toolAuthorizer?: ToolAuthorizer;

  /** Optional pre-built LLM used for the coordinator (bypasses llmFactory) */
  coordinatorLlm?: BaseChatModel;

  /** Scope for discovered services. REQUEST isolates per-request state. */
  scope?: Scope;
}

export class ModuleOptionsValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Invalid LangChainToolsModule options:\n  - ${issues.join('\n  - ')}`,
    );
    this.name = 'ModuleOptionsValidationError';
  }
}

/**
 * Keys whose values are functions or framework class instances. We keep them
 * out of class-transformer entirely — transforming a MockLLM / ChatOpenAI /
 * user-supplied callback would either trigger side-effectful constructors or
 * strip the original reference.
 */
const PASSTHROUGH_KEYS: ReadonlyArray<keyof LangChainToolsModuleOptions> = [
  'onToken',
  'onToolStream',
  'onToolTimeout',
  'llmFactory',
  'sessionStore',
  'toolAuthorizer',
  'coordinatorLlm',
  'scope',
];

/**
 * Validates module options at boot. Throws a descriptive error listing every
 * failing constraint. Functions and class instances are passed through
 * untouched.
 */
export function validateModuleOptions(
  raw: Partial<LangChainToolsModuleOptions> | undefined,
): LangChainToolsModuleOptions {
  const source = (raw ?? {}) as Record<string, unknown>;

  // Split the input: plain fields go to class-transformer, passthrough fields
  // are copied verbatim after validation.
  const plainSource: Record<string, unknown> = {};
  const passthroughValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (PASSTHROUGH_KEYS.includes(key as keyof LangChainToolsModuleOptions)) {
      passthroughValues[key] = value;
    } else {
      plainSource[key] = value;
    }
  }

  const instance = plainToInstance(LangChainToolsModuleOptions, plainSource, {
    enableImplicitConversion: false,
  });

  for (const [key, value] of Object.entries(passthroughValues)) {
    if (value !== undefined) {
      (instance as Record<string, unknown>)[key] = value;
    }
  }

  const errors = validateSync(instance, {
    whitelist: false,
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
    throw new ModuleOptionsValidationError(issues);
  }

  return instance;
}
