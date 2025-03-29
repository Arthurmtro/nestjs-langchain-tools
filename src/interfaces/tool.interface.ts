import { z } from 'zod';

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
  COMPLETE = 'complete'
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
 * Configuration for agent tools
 */
export interface ToolOptions {
  /** Unique name for the tool */
  name: string;
  
  /** Detailed description explaining what the tool does */
  description: string;
  
  /** Zod schema for type-safe validation of the tool's input */
  schema?: z.ZodType;
  
  /** Whether this tool supports streaming updates */
  streaming?: boolean;
}