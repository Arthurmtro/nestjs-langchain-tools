import { SetMetadata } from '@nestjs/common';
import { z } from 'zod';

export const TOOL_METADATA = 'langchain:tool';

export interface ToolOptions {
  name: string;
  description: string;
  schema?: z.ZodType<any, any>;
}

export const AgentTool = (options: ToolOptions) => {
  return SetMetadata(TOOL_METADATA, options);
};