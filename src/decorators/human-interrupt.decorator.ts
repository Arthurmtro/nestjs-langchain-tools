import { SetMetadata } from '@nestjs/common';

export const HUMAN_INTERRUPT_METADATA = 'langchain:human-interrupt';

export interface HumanInterruptMetadata {
  /** Prompt shown to the human operator when the interrupt fires. */
  prompt?: string;
  /** Optional reason identifier (used in telemetry and `InterruptEvent`). */
  reason?: string;
}

/**
 * Method decorator marking a tool (or agent node) as one that can pause
 * execution for human review. Works with `GraphCoordinatorService.resume()`:
 * when the underlying LangGraph node calls `interrupt()`, the coordinator
 * surfaces an {@link InterruptEvent} and keeps the checkpoint alive until
 * `resume(threadId, humanInput)` is called.
 *
 * ```ts
 * @AgentTool({ name: 'confirm_wire_transfer', input: WireDto })
 * @HumanInterrupt({ prompt: 'Approve the wire transfer below.' })
 * transfer(input: WireDto) {
 *   // This body runs ONLY after a human approves.
 * }
 * ```
 *
 * The actual `interrupt()` call is inserted automatically by the tool
 * discovery layer when it detects this metadata.
 */
export const HumanInterrupt = (
  metadata: HumanInterruptMetadata = {},
): MethodDecorator => SetMetadata(HUMAN_INTERRUPT_METADATA, metadata);
