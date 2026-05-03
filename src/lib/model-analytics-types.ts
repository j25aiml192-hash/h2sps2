/**
 * Model Analytics Types
 * ════════════════════
 * Extended types for agent performance, A/B testing,
 * cost tracking, and model-level metrics.
 */

import type { ProviderName } from "./types";

// ── Per-agent aggregated metrics (Firestore: agent_metrics/{agentId}) ──
export interface AgentMetrics {
  agentId:         string;                        // "professor" | "activist" | ...
  totalDebates:    number;
  totalTokens:     number;
  avgLatencyMs:    number;
  p95LatencyMs:    number;
  successRate:     number;                        // 0–1
  fallbackRate:    number;                        // 0–1  (how often primary model failed)
  modelUsage:      Record<string, number>;        // modelId → % usage (0–100)
  userRating:      number;                        // 0–5 avg
  ratingCount:     number;
  updatedAt:       string;                        // ISO
}

// ── Per-provider real-time snapshot (in-memory + health API) ───
export interface ProviderSnapshot {
  provider:        ProviderName;
  healthy:         boolean;
  circuitOpen:     boolean;
  avgLatencyMs:    number;
  successRate:     number;                        // from last 100 events
  requestsToday:   number;
  errorsToday:     number;
  lastChecked:     string;
}

// ── Daily rollup (Firestore: analytics_daily/{YYYY-MM-DD}) ─────
export interface DailyRollup {
  date:            string;                        // "YYYY-MM-DD"
  totalRequests:   number;
  totalDebates:    number;
  voiceSessions:   number;
  providerBreakdown: Record<ProviderName, number>; // provider → request count
  agentBreakdown:  Record<string, number>;         // agent → debate count
  avgLatencyMs:    number;
  errorRate:       number;
  estimatedSavedUSD: number;
}

// ── A/B Test types ─────────────────────────────────────────────
export type ABVariant = "control" | "variantA" | "variantB";

export interface ABExperiment {
  experimentId:  string;
  name:          string;
  description:   string;
  status:        "running" | "paused" | "completed";
  allocation:    Record<ABVariant, number>;        // % of traffic (0–100, sum ≤ 100)
  agentOverrides: Record<ABVariant, Partial<Record<string, { provider: ProviderName; model: string }>>>;
  metrics:       Record<ABVariant, ABVariantMetrics>;
  startedAt:     string;
  endedAt?:      string;
  winner?:       ABVariant;
}

export interface ABVariantMetrics {
  requests:      number;
  avgLatencyMs:  number;
  avgQualityScore: number;                        // 0–1 from Gemini eval
  userEngagement: number;                         // 0–1 (follow-up click rate)
  errorRate:     number;
}

// ── Cost calculator ────────────────────────────────────────────
// Equivalent paid API pricing ($/1M tokens) for "what we saved"
export const PAID_API_PRICING_USD: Record<string, { input: number; output: number }> = {
  "gpt-4o":                { input: 2.50,  output: 10.00 },
  "claude-3-5-sonnet":     { input: 3.00,  output: 15.00 },
  "gpt-3.5-turbo":         { input: 0.50,  output: 1.50  },
  "gpt-4o-mini":           { input: 0.15,  output: 0.60  },
};

// Estimated equivalent model for each agent (what you'd use if paid)
export const AGENT_PAID_EQUIVALENT: Record<string, string> = {
  professor:   "gpt-4o",
  activist:    "claude-3-5-sonnet",
  journalist:  "gpt-4o",
  citizen:     "gpt-3.5-turbo",
  synthesis:   "gpt-4o-mini",
};

// Typical token usage per debate response
export const AVG_TOKENS_PER_AGENT = { input: 800, output: 600 };

export interface CostSavingsReport {
  totalDebates:        number;
  totalAgentCalls:     number;
  estimatedInputTokens:  number;
  estimatedOutputTokens: number;
  hypotheticalCostUSD: number;
  actualCostUSD:       number;                   // ~0 on free tiers
  savedUSD:            number;
  savedPercent:        number;
  breakdown:           Record<string, number>;   // agent → saved $
}
