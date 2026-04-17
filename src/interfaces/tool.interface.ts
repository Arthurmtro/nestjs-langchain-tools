import type { z } from 'zod';
import type { ClassConstructor } from '../schema/class-validator-json-schema';

/**
 * Callback for streaming tool execution updates
 */
export type ToolStreamCallback = (update: ToolStreamUpdate) => void;

/**
 * Types of streaming updates from tools
 */
export enum ToolStreamUpdateType {
  START = 'start',
  PROGRESS = 'progress',
  ERROR = 'error',
  COMPLETE = 'complete',
  TIMEOUT = 'timeout'
}

/**
 * Streaming update from a tool
 */
export interface ToolStreamUpdate {
  /** Type of update */
  type: ToolStreamUpdateType;
  
  /** Tool that is streaming */
  toolName: string;
  
  /** Content of the update */
  content?: string;
  
  /** Progress percentage (0-100) if applicable */
  progress?: number;
  
  /** Any error information */
  error?: string;
  
  /** Final result when complete */
  result?: string;
}

/**
 * Configuration for tool timeouts
 */
export interface ToolTimeoutOptions {
  /** Whether to enable timeout for this tool */
  enabled: boolean;
  
  /** Timeout in milliseconds */
  durationMs: number;
}

/**
 * Configuration for agent tools.
 *
 * Supply **either** a class-validator DTO (`input: MyDto`) — preferred for
 * Nest apps — or a Zod `schema`. The DTO is converted to JSON Schema for
 * the LLM and used at runtime to validate and transform the tool input.
 */
export interface ToolOptions {
  /** Unique name for the tool */
  name: string;

  /** Detailed description explaining what the tool does */
  description: string;

  /**
   * Class-validator DTO describing the tool input.
   * The tool method receives a typed, validated instance of this class.
   */
  input?: ClassConstructor;

  /** Zod schema (alternative to `input`; kept for LangChain interop). */
  schema?: z.ZodType;

  /** Whether this tool supports streaming updates */
  streaming?: boolean;

  /** Timeout configuration for the tool */
  timeout?: ToolTimeoutOptions | number;
}