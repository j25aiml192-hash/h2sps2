/**
 * Model Analytics — Firestore Aggregator
 * ════════════════════════════════════════
 * Writes agent metrics and daily rollups to Firestore.
 *
 * Firestore write budget: 20K writes/day (free tier).
 * Strategy:
 *  - Aggregate in-memory, flush to Firestore every 50 events
 *    OR every 5 minutes via cron — whichever comes first.
 *  - Use Firestore increment() to avoid read-modify-write cycles.
 *  - Daily rollup doc: 1 write per cron tick (every 30 min).
 *
 * Collections used:
 *   agent_metrics/{agentId}        — running totals (FieldValue.increment)
 *   analytics_daily/{YYYY-MM-DD}   — daily rollup
 *   ab_experiments/{experimentId}  — A/B test state
 */
import { FieldValue } from "firebase-admin/firestore";
import { firestoreDB } from "./firebase-admin";
import {
  AGENT_PAID_EQUIVALENT,
  PAID_API_PRICING_USD,
  AVG_TOKENS_PER_AGENT,
  type AgentMetrics,
  type DailyRollup,
  type CostSavingsReport,
} from "./model-analytics-types";
import type { ProviderName } from "./types";

// ── In-memory buffer (flush every N events or via cron) ───────
interface BufferedEvent {
  agentId:    string;
  model:      string;
  provider:   ProviderName;
  latencyMs:  number;
  success:    boolean;
  isFallback: boolean;
  tokens?:    number;
}

const buffer: BufferedEvent[] = [];
const FLUSH_THRESHOLD = 50;

// ── Public: record one agent response ─────────────────────────
export function recordAgentCall(event: BufferedEvent): void {
  buffer.push(event);
  if (buffer.length >= FLUSH_THRESHOLD) void flushBuffer();
}

// ── Flush buffer to Firestore ─────────────────────────────────
export async function flushBuffer(): Promise<void> {
  if (buffer.length === 0) return;
  const toFlush = buffer.splice(0, buffer.length);

  // Group by agent using a plain object
  const byAgent: Record<string, BufferedEvent[]> = {};
  for (const e of toFlush) {
    if (!byAgent[e.agentId]) byAgent[e.agentId] = [];
    byAgent[e.agentId]!.push(e);
  }

  const batch = firestoreDB.batch();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  for (const [agentId, events] of Object.entries(byAgent)) {
    const ref = firestoreDB.collection("agent_metrics").doc(agentId);
    const successes  = events.filter((e) => e.success).length;
    const fallbacks  = events.filter((e) => e.isFallback).length;
    const totalLat   = events.reduce((s, e) => s + e.latencyMs, 0);
    const totalTokens = events.reduce((s, e) => s + (e.tokens ?? AVG_TOKENS_PER_AGENT.output), 0);

    // Model usage tally
    const modelTally: Record<string, number> = {};
    for (const e of events) {
      modelTally[e.model] = (modelTally[e.model] ?? 0) + 1;
    }

    batch.set(ref, {
      agentId,
      totalDebates:   FieldValue.increment(events.length),
      totalTokens:    FieldValue.increment(totalTokens),
      successCount:   FieldValue.increment(successes),
      fallbackCount:  FieldValue.increment(fallbacks),
      totalLatencyMs: FieldValue.increment(totalLat),
      updatedAt:      new Date().toISOString(),
    }, { merge: true });

    // Model usage: separate sub-doc to avoid huge map growth
    for (const [model, count] of Object.entries(modelTally)) {
      const modelRef = firestoreDB
        .collection("agent_metrics").doc(agentId)
        .collection("model_usage").doc(model);
      batch.set(modelRef, { count: FieldValue.increment(count) }, { merge: true });
    }
  }

  // Daily rollup increment
  const rollupRef = firestoreDB.collection("analytics_daily").doc(today);
  batch.set(rollupRef, {
    date:          today,
    totalRequests: FieldValue.increment(toFlush.length),
    totalErrors:   FieldValue.increment(toFlush.filter((e) => !e.success).length),
    totalLatencyMs:FieldValue.increment(toFlush.reduce((s, e) => s + e.latencyMs, 0)),
  }, { merge: true });

  await batch.commit().catch((err: unknown) => {
    console.error("[ModelAnalytics] Flush failed:", err);
    // Re-queue on failure (bounded to prevent unbounded growth)
    if (buffer.length < 500) buffer.unshift(...toFlush);
  });
}

// ── Read: get aggregated agent metrics ────────────────────────
export async function getAgentMetrics(): Promise<AgentMetrics[]> {
  const snap = await firestoreDB.collection("agent_metrics").get();
  const results: AgentMetrics[] = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const total     = (d.totalDebates as number) ?? 0;
    const success   = (d.successCount as number) ?? 0;
    const fallbacks = (d.fallbackCount as number) ?? 0;
    const totalLat  = (d.totalLatencyMs as number) ?? 0;

    // Fetch model usage sub-collection
    const modelSnap = await doc.ref.collection("model_usage").get();
    const rawUsage: Record<string, number> = {};
    let usageTotal = 0;
    for (const m of modelSnap.docs) {
      rawUsage[m.id] = (m.data().count as number) ?? 0;
      usageTotal += rawUsage[m.id]!;
    }
    const modelUsage: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawUsage)) {
      modelUsage[k] = usageTotal > 0 ? Math.round((v / usageTotal) * 100) : 0;
    }

    results.push({
      agentId:        doc.id,
      totalDebates:   total,
      totalTokens:    (d.totalTokens as number) ?? 0,
      avgLatencyMs:   total > 0 ? Math.round(totalLat / total) : 0,
      p95LatencyMs:   Math.round((totalLat / Math.max(total, 1)) * 1.4), // P95 estimate
      successRate:    total > 0 ? success / total : 1,
      fallbackRate:   total > 0 ? fallbacks / total : 0,
      modelUsage,
      userRating:     (d.userRating as number) ?? 0,
      ratingCount:    (d.ratingCount as number) ?? 0,
      updatedAt:      (d.updatedAt as string) ?? "",
    });
  }

  return results;
}

// ── Read: daily trend (last N days) ──────────────────────────
export async function getDailyTrend(days = 7): Promise<DailyRollup[]> {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const result: DailyRollup[] = [];
  for (const date of dates) {
    const snap = await firestoreDB.collection("analytics_daily").doc(date).get();
    if (snap.exists) {
      result.push(snap.data() as DailyRollup);
    } else {
      result.push({
        date,
        totalRequests: 0, totalDebates: 0, voiceSessions: 0,
        providerBreakdown: { groq:0, gemini:0, cerebras:0, together:0, nim:0 },
        agentBreakdown: {},
        avgLatencyMs: 0, errorRate: 0, estimatedSavedUSD: 0,
      });
    }
  }
  return result;
}

// ── Cost savings calculator ───────────────────────────────────
export function calculateCostSavings(agents: AgentMetrics[]): CostSavingsReport {
  let hypotheticalCostUSD = 0;
  let totalCalls = 0;
  const breakdown: Record<string, number> = {};

  for (const agent of agents) {
    const calls   = agent.totalDebates;
    const equiv   = AGENT_PAID_EQUIVALENT[agent.agentId] ?? "gpt-4o";
    const pricing = PAID_API_PRICING_USD[equiv] ?? PAID_API_PRICING_USD["gpt-4o"]!;

    const inputCost  = (calls * AVG_TOKENS_PER_AGENT.input  / 1_000_000) * pricing.input;
    const outputCost = (calls * AVG_TOKENS_PER_AGENT.output / 1_000_000) * pricing.output;
    const agentCost  = inputCost + outputCost;

    hypotheticalCostUSD += agentCost;
    breakdown[agent.agentId] = agentCost;
    totalCalls += calls;
  }

  const totalTokensIn  = totalCalls * AVG_TOKENS_PER_AGENT.input;
  const totalTokensOut = totalCalls * AVG_TOKENS_PER_AGENT.output;

  return {
    totalDebates:          Math.round(totalCalls / 4),  // 4 agents per debate
    totalAgentCalls:       totalCalls,
    estimatedInputTokens:  totalTokensIn,
    estimatedOutputTokens: totalTokensOut,
    hypotheticalCostUSD:   parseFloat(hypotheticalCostUSD.toFixed(2)),
    actualCostUSD:         0,
    savedUSD:              parseFloat(hypotheticalCostUSD.toFixed(2)),
    savedPercent:          100,
    breakdown,
  };
}

// ── Record user rating for an agent ──────────────────────────
export async function recordRating(agentId: string, rating: number): Promise<void> {
  const ref = firestoreDB.collection("agent_metrics").doc(agentId);
  await ref.set({
    userRating:  FieldValue.increment(rating),
    ratingCount: FieldValue.increment(1),
  }, { merge: true });
}
