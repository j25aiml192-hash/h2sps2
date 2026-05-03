/**
 * ============================================================
 * Debate Synthesis Pipeline  (Prompt 1C)
 * ============================================================
 *
 * Phase 1 – Synthesis   : Groq Llama 3.1 8B  (fastest)
 *   → agreements, contradictions, missing perspectives, consensus
 *
 * Phase 2 – Fact-Check  : Gemini extracts claims →
 *                          Perplexity verifies (5 free/day budget)
 *   → flagged claims with ⚠️ marker
 *
 * Phase 3 – Follow-Ups  : Cerebras (lowest inference latency)
 *   → 3 categorised follow-up questions
 *
 * All three phases run after agent responses are collected.
 * ============================================================
 */
import { GroqProvider, GeminiProvider, CerebrasProvider } from "./ai-providers";
import type { AgentResponse, DebateSynthesis, FactCheck, FollowUpQuestion } from "./debate-types";

// ── Perplexity config ────────────────────────────────────────
const PERPLEXITY_BASE = "https://api.perplexity.ai";
const PERPLEXITY_MODEL = "sonar";   // lightweight, low cost

interface PerplexityResponse {
  choices: { message: { content: string } }[];
}

// ─────────────────────────────────────────────────────────────
// PHASE 1 – SYNTHESIS  (Groq Llama 3.1 8B)
// ─────────────────────────────────────────────────────────────
export async function synthesiseDebate(
  topic: string,
  responses: AgentResponse[]
): Promise<DebateSynthesis> {
  const groq = new GroqProvider();
  const successfulResponses = responses.filter((r) => r.status === "success");

  const agentSummaries = successfulResponses
    .map((r) => `[${r.agent.toUpperCase()}]\n${r.text}`)
    .join("\n\n---\n\n");

  const prompt = `You are an expert debate analyst. Analyse these ${successfulResponses.length} perspectives on the topic: "${topic}"

${agentSummaries}

Respond ONLY with valid JSON matching this exact schema (no markdown, no code fences):
{
  "agreements": ["...", "..."],
  "contradictions": ["...", "..."],
  "missingPerspectives": ["...", "..."],
  "consensus": "..."
}

Rules:
- agreements: 2-4 points all or most agents agree on
- contradictions: 2-4 direct conflicts between agents
- missingPerspectives: 1-3 angles not covered by any agent
- consensus: 1-2 sentence summary of where reasonable people could align`;

  const raw = await groq.chat(
    [{ role: "user", content: prompt }],
    { model: "llama-3.1-8b-instant", temperature: 0.2, maxTokens: 600 }
  );

  try {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as DebateSynthesis;
  } catch {
    console.warn("[Synthesis] JSON parse failed, using fallback");
    return {
      agreements: ["Multiple agents highlighted the complexity of this topic."],
      contradictions: ["Agents differed on the most effective solutions."],
      missingPerspectives: ["Long-term economic impacts were not fully explored."],
      consensus: "There is broad recognition of the problem but significant debate about solutions.",
    };
  }
}

// ─────────────────────────────────────────────────────────────
// PHASE 2A – CLAIM EXTRACTION  (Gemini)
// ─────────────────────────────────────────────────────────────
async function extractClaims(responses: AgentResponse[]): Promise<string[]> {
  const gemini = new GeminiProvider();
  const allText = responses
    .filter((r) => r.status === "success")
    .map((r) => r.text)
    .join("\n\n");

  const prompt = `From the following debate text, extract up to 5 specific factual claims that could be independently verified (statistics, historical events, named studies, specific policies).

Debate text:
${allText.slice(0, 3000)}

Respond ONLY with a JSON array of strings (no markdown):
["claim 1", "claim 2", ...]

Return an empty array [] if no verifiable claims are found.`;

  const raw = await gemini.chat(
    [{ role: "user", content: prompt }],
    { model: "gemini-1.5-flash", temperature: 0.1, maxTokens: 300 }
  );

  try {
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (Array.isArray(parsed)) {
      return (parsed as unknown[])
        .filter((x): x is string => typeof x === "string")
        .slice(0, 5);
    }
    return [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// PHASE 2B – PERPLEXITY VERIFICATION  (budget-aware)
// ─────────────────────────────────────────────────────────────
const PERPLEXITY_DAILY_BUDGET = 5; // free tier
let perplexityCallsToday = 0;       // in-memory; resets on cold start

async function verifyClaim(claim: string): Promise<{ verified: boolean; source?: string }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey || perplexityCallsToday >= PERPLEXITY_DAILY_BUDGET) {
    return { verified: false };
  }

  perplexityCallsToday += 1;

  try {
    const res = await fetch(`${PERPLEXITY_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          {
            role: "system",
            content: 'You are a fact-checker. Reply ONLY with {"verified": true/false, "source": "url or publication name or null"}. No other text.',
          },
          {
            role: "user",
            content: `Is this claim accurate and verifiable? "${claim}"`,
          },
        ],
        max_tokens: 80,
        temperature: 0.0,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return { verified: false };

    const data = (await res.json()) as PerplexityResponse;
    const text = data.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(text) as { verified?: boolean; source?: string };
    return { verified: Boolean(parsed.verified), source: parsed.source ?? undefined };
  } catch {
    return { verified: false };
  }
}

/**
 * Full fact-checking pipeline:
 * Gemini extracts claims → Perplexity verifies (budget-capped).
 * Claims not verified are flagged with ⚠️.
 */
export async function factCheckResponses(responses: AgentResponse[]): Promise<FactCheck[]> {
  let claims: string[] = [];

  try {
    claims = await extractClaims(responses);
  } catch (err) {
    console.error("[FactCheck] Claim extraction failed:", err);
    return [];
  }

  if (claims.length === 0) return [];

  // Verify in parallel (Perplexity budget tracked internally)
  const settled = await Promise.allSettled(
    claims.map((claim) => verifyClaim(claim))
  );

  return claims.map((claim, i): FactCheck => {
    const result = settled[i];
    if (result.status === "fulfilled") {
      const { verified, source } = result.value;
      return {
        claim,
        verified,
        source,
        flagged: !verified,
      };
    }
    // Verification itself failed
    return { claim, verified: null, flagged: true };
  });
}

// ─────────────────────────────────────────────────────────────
// PHASE 3 – FOLLOW-UP QUESTIONS  (Cerebras — lowest latency)
// ─────────────────────────────────────────────────────────────
export async function generateFollowUps(
  topic: string,
  synthesis: DebateSynthesis
): Promise<FollowUpQuestion[]> {
  const cerebras = new CerebrasProvider();

  const prompt = `Based on this debate topic and synthesis, generate exactly 3 follow-up questions.

Topic: "${topic}"

Key agreements: ${synthesis.agreements.slice(0, 2).join("; ")}
Key contradictions: ${synthesis.contradictions.slice(0, 2).join("; ")}
Missing perspectives: ${synthesis.missingPerspectives.slice(0, 2).join("; ")}

Respond ONLY with a JSON array (no markdown):
[
  { "question": "...", "category": "Deeper Dive" },
  { "question": "...", "category": "Related Topic" },
  { "question": "...", "category": "Practical Application" }
]

One question per category, in the order shown.`;

  const raw = await cerebras.chat(
    [{ role: "user", content: prompt }],
    { model: "llama3.1-70b", temperature: 0.5, maxTokens: 300 }
  );

  try {
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (Array.isArray(parsed)) {
      return (parsed as unknown[])
        .filter(
          (x): x is FollowUpQuestion =>
            typeof x === "object" &&
            x !== null &&
            "question" in x &&
            "category" in x
        )
        .slice(0, 3);
    }
    return [];
  } catch {
    // Graceful fallback
    return [
      { question: `What are the long-term implications of "${topic}"?`, category: "Deeper Dive" },
      { question: `How does this compare internationally?`, category: "Related Topic" },
      { question: `What concrete first steps could a policymaker take today?`, category: "Practical Application" },
    ];
  }
}
