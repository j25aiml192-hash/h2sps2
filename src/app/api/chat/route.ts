/**
 * POST /api/chat
 *
 * Body:
 *   {
 *     messages: Message[],
 *     options?: OrchestratorOptions,
 *     mode?: "election" | "generic",   // default: auto-detect
 *     electionContext?: {
 *       state?: string;
 *       isFirstTimeVoter?: boolean;
 *     }
 *   }
 *
 * Response (generic mode):
 *   { result: string, usedProvider: string }
 *
 * Response (election mode):
 *   { result: DebateResult, usedProvider: "election-agents" }
 *
 * Auto-detection: if the last user message contains election keywords,
 * the request is routed to conductElectionDebate() automatically.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chat } from "@/lib/ai-providers";
import { conductElectionDebate } from "@/lib/election-agents";

// ── Keyword-based election topic detector ─────────────────────
const ELECTION_KEYWORDS = [
  "vote", "voter", "voting", "election", "elect", "ballot", "evm", "vvpat",
  "eci", "election commission", "constituency", "candidate", "mla", "mp",
  "lok sabha", "rajya sabha", "vidhan sabha", "polling", "booth",
  "electoral roll", "voter id", "epic", "nota", "model code", "mcc",
  "delimitation", "reservation", "sc st obc seat", "turnout",
  "campaign", "manifesto", "party", "assembly", "bypolls",
  "nomination", "returning officer", "presiding officer",
];

function isElectionTopic(text: string): boolean {
  const lower = text.toLowerCase();
  return ELECTION_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Request schema ────────────────────────────────────────────
const MessageSchema = z.object({
  role:    z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  mode:     z.enum(["election", "generic", "auto"]).default("auto"),
  electionContext: z.object({
    state:            z.string().optional(),
    isFirstTimeVoter: z.boolean().optional(),
  }).optional(),
  options: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens:   z.number().int().positive().optional(),
    topP:        z.number().min(0).max(1).optional(),
    model:       z.string().optional(),
    systemPrompt: z.string().optional(),
    chain:       z.array(z.enum(["groq","gemini","cerebras","together","nim"])).optional(),
    sessionId:   z.string().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const parsed = ChatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { messages, options, mode, electionContext } = parsed.data;

    // Determine routing
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const routeToElection =
      mode === "election" ||
      (mode === "auto" && isElectionTopic(lastUserMessage));

    if (routeToElection) {
      // ── Election multi-agent debate mode ─────────────────────
      const result = await conductElectionDebate(lastUserMessage, {
        state:            electionContext?.state,
        isFirstTimeVoter: electionContext?.isFirstTimeVoter,
        sessionId:        options?.sessionId,
      });
      return NextResponse.json({ result, usedProvider: "election-agents", mode: "election" });
    }

    // ── Generic single-model chat mode ────────────────────────
    const { result, usedProvider } = await chat(messages, options);
    return NextResponse.json({ result, usedProvider, mode: "generic" });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[POST /api/chat]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
