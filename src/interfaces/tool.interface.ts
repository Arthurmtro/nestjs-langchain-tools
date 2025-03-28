import { z } from 'zod';

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
}