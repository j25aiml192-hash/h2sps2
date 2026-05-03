/**
 * GET /api/admin/metrics
 * ─────────────────────
 * Returns aggregated model analytics:
 *   - Agent performance metrics (from Firestore)
 *   - Daily trend (last 7 days)
 *   - Cost savings report
 *   - Active A/B experiment summary
 *
 * Falls back to realistic demo data when Firestore
 * collections are empty (hackathon-friendly first run).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAgentMetrics, getDailyTrend, calculateCostSavings } from "@/lib/model-analytics";
import { listExperiments } from "@/lib/ab-testing";
import type { AgentMetrics, DailyRollup } from "@/lib/model-analytics-types";

// ── Demo seed data (used when Firestore is empty) ─────────────
const DEMO_AGENTS: AgentMetrics[] = [
  { agentId:"professor", totalDebates:1240, totalTokens:1240*1400, avgLatencyMs:1210, p95LatencyMs:1890, successRate:0.96, fallbackRate:0.11, modelUsage:{"llama-3.1-70b-versatile":89,"meta/llama-3.1-70b-instruct":11}, userRating:4.6, ratingCount:380, updatedAt: new Date().toISOString() },
  { agentId:"activist",  totalDebates:1187, totalTokens:1187*1000, avgLatencyMs:820,  p95LatencyMs:1260, successRate:0.98, fallbackRate:0.05, modelUsage:{"gemini-2.0-flash-exp":93,"mixtral-8x7b-32768":7},             userRating:4.4, ratingCount:342, updatedAt: new Date().toISOString() },
  { agentId:"journalist",totalDebates:1205, totalTokens:1205*1200, avgLatencyMs:940,  p95LatencyMs:1430, successRate:0.97, fallbackRate:0.08, modelUsage:{"llama3.1-70b":86,"llama-3.1-70b-versatile":14},              userRating:4.5, ratingCount:361, updatedAt: new Date().toISOString() },
  { agentId:"citizen",   totalDebates:1198, totalTokens:1198*700,  avgLatencyMs:580,  p95LatencyMs:870,  successRate:0.99, fallbackRate:0.03, modelUsage:{"Mistral-7B-Instruct-v0.2":96,"llama-3.1-8b-instant":4},      userRating:4.3, ratingCount:358, updatedAt: new Date().toISOString() },
];

function makeDemoTrend(): DailyRollup[] {
  const trend: DailyRollup[] = [];
  const base = [14,22,18,31,27,38,45];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const req  = base[6 - i] ?? 20;
    trend.push({
      date, totalRequests: req * 4, totalDebates: req, voiceSessions: Math.round(req * 0.3),
      providerBreakdown: { groq: Math.round(req*1.8), gemini: Math.round(req*1.2), cerebras: Math.round(req*0.7), together: Math.round(req*0.5), nim: Math.round(req*0.15) },
      agentBreakdown: { professor: req, activist: req, journalist: req, citizen: req },
      avgLatencyMs: 890, errorRate: 0.024, estimatedSavedUSD: parseFloat((req * 0.018).toFixed(2)),
    });
  }
  return trend;
}

export async function GET() {
  try {
    // Run all Firestore reads in parallel
    const [agentsRaw, trendRaw, experiments] = await Promise.allSettled([
      getAgentMetrics(),
      getDailyTrend(7),
      listExperiments(),
    ]);

    const agents = agentsRaw.status === "fulfilled" && agentsRaw.value.length > 0
      ? agentsRaw.value
      : DEMO_AGENTS;

    const trend = trendRaw.status === "fulfilled" && trendRaw.value.some((d) => d.totalRequests > 0)
      ? trendRaw.value
      : makeDemoTrend();

    const abExperiments = experiments.status === "fulfilled" ? experiments.value : [];

    const costSavings = calculateCostSavings(agents);

    return NextResponse.json({
      agents,
      trend,
      costSavings,
      abExperiments,
      generatedAt: new Date().toISOString(),
      usingDemoData: agentsRaw.status === "fulfilled" && agentsRaw.value.length === 0,
    });
  } catch (err) {
    // Full fallback to demo data on any error (keeps dashboard functional without Firestore)
    const agents = DEMO_AGENTS;
    const trend  = makeDemoTrend();
    return NextResponse.json({
      agents,
      trend,
      costSavings:    calculateCostSavings(agents),
      abExperiments:  [],
      generatedAt:    new Date().toISOString(),
      usingDemoData:  true,
      error:          (err as Error).message,
    });
  }
}
