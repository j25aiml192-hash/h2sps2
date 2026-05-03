/**
 * POST /api/agents/debate
 * ============================================================
 * Full debate pipeline in a single endpoint:
 *
 * 1. Validate request (topic + optional chat history)
 * 2. Run 4 agents in parallel via agent-router (15s timeout each)
 * 3. Synthesise results (Groq 8B)
 * 4. Fact-check claims (Gemini → Perplexity)
 * 5. Generate follow-up questions (Cerebras)
 * 6. Persist full DebateRecord to Firestore
 * 7. Return complete payload
 * ============================================================
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { runAllAgents, computePerformance } from "@/lib/agent-router";
import { synthesiseDebate, factCheckResponses, generateFollowUps } from "@/lib/synthesis";
import { firestoreDB } from "@/lib/firebase-admin";
import { analytics } from "@/lib/analytics";
import type { AgentName } from "@/lib/agent-configs";
import type { DebateRecord } from "@/lib/debate-types";

// ── Request schema ────────────────────────────────────────────
const DebateRequestSchema = z.object({
  topic: z.string().min(5).max(500),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .optional()
    .default([]),
  sessionId: z.string().optional(),
});

// ── Firestore collection ──────────────────────────────────────
const DEBATES_COLLECTION = "debates";

export async function POST(req: NextRequest) {
  const requestStart = Date.now();

  // ── 1. Validate ──────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = DebateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { topic, chatHistory, sessionId } = parsed.data;
  const debateId = uuidv4();

  console.log(`[Debate ${debateId}] Starting: "${topic}"`);

  // ── 2. Run 4 agents in parallel ──────────────────────────────
  const agentResponses = await runAllAgents(topic, chatHistory);
  const responsesMap = Object.fromEntries(
    agentResponses.map((r) => [r.agent, r])
  ) as DebateRecord["responses"];

  const successCount = agentResponses.filter((r) => r.status === "success").length;
  console.log(`[Debate ${debateId}] Agents done: ${successCount}/4 succeeded`);

  if (successCount === 0) {
    return NextResponse.json(
      { error: "All agents failed or timed out. Please try again." },
      { status: 503 }
    );
  }

  // ── 3-5. Post-processing (synthesis + fact-check + follow-ups) ──
  // Run all three phases concurrently where possible.
  // Fact-check and follow-ups both depend on synthesis output for
  // follow-ups, but fact-check is independent — run it in parallel.
  const [synthesisResult, factCheckResult] = await Promise.allSettled([
    synthesiseDebate(topic, agentResponses),
    factCheckResponses(agentResponses),
  ]);

  const synthesis =
    synthesisResult.status === "fulfilled"
      ? synthesisResult.value
      : {
          agreements: [],
          contradictions: [],
          missingPerspectives: [],
          consensus: "Synthesis unavailable.",
        };

  const factChecks =
    factCheckResult.status === "fulfilled" ? factCheckResult.value : [];

  // Follow-ups depend on synthesis — run after
  const followUpResult = await generateFollowUps(topic, synthesis).catch(() => []);

  // ── 6. Compute performance metrics ───────────────────────────
  const modelPerformance = computePerformance(agentResponses);

  // ── 7. Build full record ──────────────────────────────────────
  const record: DebateRecord = {
    debateId,
    topic,
    responses: responsesMap,
    synthesis,
    factChecks,
    followUpQuestions: followUpResult,
    modelPerformance,
    createdAt: new Date().toISOString(),
  };

  // ── 8. Persist to Firestore (fire-and-forget) ─────────────────
  firestoreDB
    .collection(DEBATES_COLLECTION)
    .doc(debateId)
    .set({
      ...record,
      // Convert AgentName map values for Firestore
      responses: Object.fromEntries(
        Object.entries(record.responses).map(([agent, r]) => [agent, { ...r }])
      ),
      sessionId: sessionId ?? null,
      totalDurationMs: Date.now() - requestStart,
    })
    .catch((err: unknown) => {
      console.error(`[Debate ${debateId}] Firestore write failed:`, err);
    });

  // Log pipeline success
  analytics.requestSuccess("groq", Date.now() - requestStart);

  console.log(
    `[Debate ${debateId}] Complete in ${Date.now() - requestStart}ms — ` +
    `${factChecks.length} claims checked, ${followUpResult.length} follow-ups`
  );

  return NextResponse.json({
    debateId,
    topic,
    agents: agentResponses.map((r) => ({
      agent: r.agent as AgentName,
      status: r.status,
      text: r.status === "success" ? r.text : null,
      model: r.model,
      provider: r.provider,
      latencyMs: r.latencyMs,
      usedFallback: r.usedFallback,
      errorMessage: r.errorMessage,
    })),
    synthesis,
    factChecks,
    followUpQuestions: followUpResult,
    modelPerformance,
    totalDurationMs: Date.now() - requestStart,
  });
}
