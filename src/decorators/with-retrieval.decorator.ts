import { SetMetadata } from '@nestjs/common';
import { RetrievalOptions } from '../interfaces/agent.interface';

/**
 * Metadata key for retrieval augmentation
 * @internal
 */
export const RETRIEVAL_OPTIONS_KEY = 'retrieval_options';

/**
 * Decorator to enable retrieval augmentation for an agent
 * 
 * @param options - Configuration options for retrieval
 * @returns Class decorator
 * 
 * @example
 * ```typescript
 * @ToolsAgent({
 *   name: 'SupportAgent',
 *   description: 'Provides product support',
 *   systemPrompt: 'You are a helpful support agent.',
 *   modelName: 'gpt-4',
 * })
 * @WithRetrieval({
 *   enabled: true,
 *   collectionName: 'product_docs',
 *   topK: 3,
 * })
 * @Injectable()
 * export class SupportAgent {
 *   // Agent implementation...
 * }
 * ```
 */
export const WithRetrieval = (options: RetrievalOptions) => {
  return SetMetadata(RETRIEVAL_OPTIONS_KEY, options);
};