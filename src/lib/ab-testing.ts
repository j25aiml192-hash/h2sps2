/**
 * A/B Test Engine
 * ════════════════
 * Assigns users to experiment variants using a deterministic
 * hash of their session ID (cookie-based, no Firestore read per request).
 *
 * Allocation example:
 *   control:  80% — use default agent-model assignments
 *   variantA: 10% — professor uses Gemini instead of Groq
 *   variantB: 10% — all agents use fastest available model
 *
 * Server usage (in API routes):
 *   const variant = getVariantFromSession(sessionId, experiment);
 *
 * Client usage (in React):
 *   const { variant } = useABTest("model_speed_test");
 */
import { firestoreDB } from "./firebase-admin";
import type { ABExperiment, ABVariant, ABVariantMetrics } from "./model-analytics-types";
import type { ProviderName } from "./types";

const EXPERIMENTS_COL = "ab_experiments";

// ── Deterministic hash (no crypto dep, Vercel Edge-safe) ──────
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

/**
 * Assigns a variant using weighted allocation.
 * The same sessionId + experimentId always returns the same variant.
 */
export function assignVariant(
  sessionId: string,
  experimentId: string,
  allocation: Record<ABVariant, number>   // e.g. { control:80, variantA:10, variantB:10 }
): ABVariant {
  const seed   = hashString(`${sessionId}:${experimentId}`) % 100;
  let cumulative = 0;
  for (const [variant, pct] of Object.entries(allocation) as [ABVariant, number][]) {
    cumulative += pct;
    if (seed < cumulative) return variant;
  }
  return "control";
}

// ── Get overrides for a variant ────────────────────────────────
export async function getActiveExperiment(): Promise<ABExperiment | null> {
  const snap = await firestoreDB
    .collection(EXPERIMENTS_COL)
    .where("status", "==", "running")
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]!.data() as ABExperiment;
}

export function getModelOverrides(
  experiment: ABExperiment,
  variant: ABVariant
): Partial<Record<string, { provider: ProviderName; model: string }>> {
  return experiment.agentOverrides[variant] ?? {};
}

// ── Record variant result (fire-and-forget) ───────────────────
export function recordVariantResult(
  experimentId: string,
  variant: ABVariant,
  result: Partial<ABVariantMetrics>
): void {
  const ref = firestoreDB.collection(EXPERIMENTS_COL).doc(experimentId);
  const { FieldValue } = require("firebase-admin/firestore") as { FieldValue: typeof import("firebase-admin/firestore").FieldValue }; // eslint-disable-line @typescript-eslint/no-require-imports

  const updates: Record<string, unknown> = {
    [`metrics.${variant}.requests`]: FieldValue.increment(1),
  };
  if (result.avgLatencyMs !== undefined) {
    updates[`metrics.${variant}.totalLatencyMs`] = FieldValue.increment(result.avgLatencyMs);
  }
  if (result.avgQualityScore !== undefined) {
    updates[`metrics.${variant}.totalQuality`] = FieldValue.increment(result.avgQualityScore);
  }
  if (result.errorRate !== undefined && result.errorRate > 0) {
    updates[`metrics.${variant}.errors`] = FieldValue.increment(1);
  }

  ref.update(updates).catch((e: unknown) =>
    console.error("[ABTest] Record failed:", e)
  );
}

// ── CRUD ──────────────────────────────────────────────────────
export async function createExperiment(
  experiment: Omit<ABExperiment, "metrics">
): Promise<string> {
  const emptyMetrics: ABVariantMetrics = {
    requests: 0, avgLatencyMs: 0, avgQualityScore: 0, userEngagement: 0, errorRate: 0,
  };
  const doc: ABExperiment = {
    ...experiment,
    metrics: { control: { ...emptyMetrics }, variantA: { ...emptyMetrics }, variantB: { ...emptyMetrics } },
  };
  await firestoreDB.collection(EXPERIMENTS_COL).doc(experiment.experimentId).set(doc);
  return experiment.experimentId;
}

export async function listExperiments(): Promise<ABExperiment[]> {
  const snap = await firestoreDB
    .collection(EXPERIMENTS_COL)
    .orderBy("startedAt", "desc")
    .limit(10)
    .get();
  return snap.docs.map((d) => d.data() as ABExperiment);
}

export async function concludeExperiment(
  experimentId: string,
  winner: ABVariant
): Promise<void> {
  await firestoreDB.collection(EXPERIMENTS_COL).doc(experimentId).update({
    status:  "completed",
    winner,
    endedAt: new Date().toISOString(),
  });
}

// ── Auto-pick winner (highest quality × speed score) ──────────
export function pickWinner(metrics: Record<ABVariant, ABVariantMetrics>): ABVariant {
  let best: ABVariant = "control";
  let bestScore = -Infinity;

  for (const [v, m] of Object.entries(metrics) as [ABVariant, ABVariantMetrics][]) {
    if (m.requests < 10) continue; // not enough data
    // Score = quality (0-1) * 60% + speed bonus (0-1) * 40%
    const speedScore = m.avgLatencyMs > 0 ? Math.min(1, 3000 / m.avgLatencyMs) : 0;
    const score = m.avgQualityScore * 0.6 + speedScore * 0.4 - m.errorRate * 0.3;
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return best;
}
