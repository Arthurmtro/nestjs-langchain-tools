import { Injectable } from '@nestjs/common';
import { CostBreakdown, DEFAULT_PRICING, ModelPricing, computeCost } from './pricing';

export interface TokenUsageEntry {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** USD cost derived from the configured pricing table. */
  costUsd: number;
  /** Optional session identifier forwarded by the caller. */
  sessionId?: string;
  /** Optional agent identifier — populated by the module when a
   *  per-agent TokenUsageCallback is wired. */
  agent?: string;
  timestamp: number;
}

export interface RecordInput {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
  sessionId?: string;
  agent?: string;
}

/**
 * Aggregates token consumption across LLM calls. Populated automatically
 * when {@link TokenUsageCallback} is attached to a model (which the module
 * does by default), and queryable at any time for dashboards or audits.
 */
@Injectable()
export class TokenUsageService {
  private readonly entries: TokenUsageEntry[] = [];
  private readonly listeners = new Set<(entry: TokenUsageEntry) => void>();
  private pricing: Record<string, ModelPricing> = { ...DEFAULT_PRICING };

  setPricing(pricing: Record<string, ModelPricing>): void {
    this.pricing = { ...DEFAULT_PRICING, ...pricing };
  }

  record(entry: RecordInput): TokenUsageEntry {
    const totalTokens =
      entry.totalTokens ?? entry.promptTokens + entry.completionTokens;
    const breakdown = computeCost(
      entry.model,
      entry.promptTokens,
      entry.completionTokens,
      this.pricing,
    );
    const full: TokenUsageEntry = {
      model: entry.model,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      totalTokens,
      costUsd: breakdown.totalUsd,
      sessionId: entry.sessionId,
      agent: entry.agent,
      timestamp: Date.now(),
    };
    this.entries.push(full);
    for (const listener of this.listeners) {
      try {
        listener(full);
      } catch {
        // swallow listener errors; telemetry must never break callers.
      }
    }
    return full;
  }

  totals(sessionId?: string): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  } {
    const entries = sessionId
      ? this.entries.filter((e) => e.sessionId === sessionId)
      : this.entries;
    return entries.reduce(
      (acc, e) => ({
        promptTokens: acc.promptTokens + e.promptTokens,
        completionTokens: acc.completionTokens + e.completionTokens,
        totalTokens: acc.totalTokens + e.totalTokens,
        costUsd: acc.costUsd + e.costUsd,
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 },
    );
  }

  history(): readonly TokenUsageEntry[] {
    return this.entries;
  }

  /** Per-agent totals for a given session (or globally). */
  byAgent(sessionId?: string): Array<{
    agent: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    calls: number;
  }> {
    const entries = sessionId
      ? this.entries.filter((e) => e.sessionId === sessionId)
      : this.entries;
    const byKey = new Map<
      string,
      {
        agent: string;
        model: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        costUsd: number;
        calls: number;
      }
    >();
    for (const e of entries) {
      const agent = e.agent ?? 'unknown';
      const key = agent + '|' + e.model;
      const current = byKey.get(key) ?? {
        agent,
        model: e.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        calls: 0,
      };
      current.promptTokens += e.promptTokens;
      current.completionTokens += e.completionTokens;
      current.totalTokens += e.totalTokens;
      current.costUsd += e.costUsd;
      current.calls += 1;
      byKey.set(key, current);
    }
    return Array.from(byKey.values());
  }

  /** Per-model cost breakdown for a given session (or globally). */
  breakdown(sessionId?: string): CostBreakdown[] {
    const entries = sessionId
      ? this.entries.filter((e) => e.sessionId === sessionId)
      : this.entries;
    const byModel = new Map<
      string,
      { promptTokens: number; completionTokens: number }
    >();
    for (const e of entries) {
      const current = byModel.get(e.model) ?? {
        promptTokens: 0,
        completionTokens: 0,
      };
      current.promptTokens += e.promptTokens;
      current.completionTokens += e.completionTokens;
      byModel.set(e.model, current);
    }
    return Array.from(byModel.entries()).map(([model, counts]) =>
      computeCost(model, counts.promptTokens, counts.completionTokens, this.pricing),
    );
  }

  subscribe(listener: (entry: TokenUsageEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.entries.length = 0;
  }
}
