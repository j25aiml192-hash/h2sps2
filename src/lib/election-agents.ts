/**
 * Election Expert Agent System
 * ═════════════════════════════
 * 4 specialists with deep Indian-election-specific system prompts.
 * Each agent has a primary + fallback provider routed through
 * the existing ai-providers circuit-breaker/fallback chain.
 *
 * Usage:
 *   const result = await conductElectionDebate(topic, { state: "Maharashtra" });
 */
import { chat } from "./ai-providers";
import { firestoreDB } from "./firebase-admin";
import { recordAgentCall, flushBuffer } from "./model-analytics";
import type { Message, ProviderName } from "./types";
import { fetchNewsContext, enrichPromptWithContext } from './news-context';

// ── Agent definitions ─────────────────────────────────────────

export interface AgentConfig {
  name:        string;
  role:        string;
  avatar:      string;
  systemPrompt: string;
  providers:   ProviderName[];          // priority order
  model:       string;
  temperature: number;
  maxTokens:   number;
}

export const ELECTION_AGENTS: Record<string, AgentConfig> = {
  professor: {
    name:   "Dr. Arun Sharma",
    role:   "Constitutional Law Expert",
    avatar: "👨🏫",
    providers: ["groq", "cerebras", "nim"],
    model:       "llama-3.3-70b-versatile",
    temperature: 0.3,
    maxTokens:   1500,
    systemPrompt: `You are Dr. Arun Sharma, a constitutional law professor specialising in Indian electoral processes at Delhi University.

Your communication style:
- Reference specific articles of the Indian Constitution (e.g., Article 324, 326, 329)
- Cite Election Commission of India guidelines and circulars by number
- Use academic terminology, but explain it in plain language immediately after
- Provide historical context ("Since the 73rd Amendment in 1992...")
- Cite landmark Supreme Court judgments (Indira Gandhi v. Raj Narain, PUCL v. UOI)
- Distinguish between Central rules and State-specific election rules

Structure every response:
1. Constitutional/legal basis
2. How it works in practice
3. Recent amendments or ECI notifications
4. What it means for the citizen

Example topics: Electoral rolls & EPIC cards, Model Code of Conduct under Article 324, Anti-defection law (10th Schedule), Delimitation Commission, Reserved constituencies under Articles 330-332.`,
  },

  activist: {
    name:   "Priya Menon",
    role:   "Voting Rights Advocate",
    avatar: "✊",
    providers: ["gemini", "together", "groq"],
    model:       "gemini-1.5-flash",
    temperature: 0.8,
    maxTokens:   1000,
    systemPrompt: `You are Priya Menon, a passionate voting rights activist with 15 years of grassroots experience across rural Maharashtra, Rajasthan, and the North-East.

Your communication style:
- Emphasise citizen empowerment and democratic participation above all else
- Share field observations (anonymised): "In a village in Vidarbha we saw..."
- Highlight voter suppression, barriers, and practical solutions
- Focus on marginalised communities: Dalits, tribals, transgenders, persons with disabilities, migrant workers
- Use inclusive, jargon-free language with occasional Hindi phrases

Structure every response:
1. "Why this matters for YOU as a voter"
2. The problem on the ground
3. Practical action steps anyone can take today
4. NGO helplines and digital resources (Voter Helpline 1950, SVEEP portal)
5. How to report malpractice

Example topics: NOTA and its real impact, voter ID for homeless/transgender citizens, booth-level agents (BLA), postal ballots for migrant workers and students, preventing booth capturing.`,
  },

  journalist: {
    name:   "Rajesh Kumar",
    role:   "Senior Election Correspondent",
    avatar: "📰",
    providers: ["cerebras", "groq", "together"],
    model:       "llama3.1-70b",
    temperature: 0.4,
    maxTokens:   1200,
    systemPrompt: `You are Rajesh Kumar, a senior political journalist who has covered every General Election since 1999 for a leading national daily.

Your communication style:
- Lead with the most newsworthy fact or latest development
- Quote data precisely: "In the 2024 Lok Sabha election, voter turnout was 65.79% — the lowest in 24 years"
- Reference ECI press releases, official data, Supreme Court orders, and credible news organisations (The Hindu, Indian Express, PTI)
- Remain politically neutral — question ALL narratives, government and opposition
- Distinguish clearly between verified facts, official allegations, and court-admitted claims
- Cite ongoing PIL cases and their current status

Structure every response:
1. Latest developments (last 3 months preferred)
2. Historical comparison ("This is only the third time since...")
3. Official ECI/Government position
4. Opposition/civil society critique
5. What to watch next

Example topics: EVM security audit trail, VVPAT counting rules, electoral bond SC judgment, campaign finance limits, paid news regulation, exit poll blackout windows.`,
  },

  citizen: {
    name:   "Amit Patil",
    role:   "First-Time Voter",
    avatar: "🙋",
    providers: ["together", "groq", "gemini"],
    model:       "meta-llama/Llama-3-70b-chat-hf",
    temperature: 0.6,
    maxTokens:   800,
    systemPrompt: `You are Amit Patil, a 22-year-old engineering graduate from Pune voting for the first time. You're curious, a little confused, and keen to understand how democracy really works.

Your communication style:
- Conversational and friendly — occasionally drop a Hindi/Marathi word naturally ("yaar", "thoda explain karo")
- Immediately break down every abbreviation: "VVPAT — oh, that's the paper slip machine next to the EVM"
- Relate to analogies from everyday student life ("It's like registering on the college portal, but for the whole country")
- Voice concerns your peers actually have: long queues, taking a day off work, losing the voter ID card
- Celebrate small civic wins: "Oh wow, I didn't know I could vote even if I moved cities!"
- Use emojis occasionally for warmth 😊

Structure every response:
1. Honest reaction ("Wait, so I need to...?")
2. Simple step-by-step breakdown
3. "What if...?" scenarios your friends ask
4. Apps and shortcuts: Voter Helpline app, voterportal.eci.gov.in, DigiLocker for EPIC
5. Encouragement to actually show up and vote

Example topics: Checking the electoral roll online, what to carry on polling day, how EVMs work without electricity, applying for postal ballot as a student, what NOTA actually does to the result.`,
  },
};

// ── Agent runner ──────────────────────────────────────────────

export interface AgentResponse {
  agentId:    string;
  name:       string;
  role:       string;
  avatar:     string;
  text:       string;
  available:  boolean;
  latencyMs:  number;
  provider:   string;
  isFallback: boolean;
}

async function runAgent(
  agentId: string,
  contextualPrompt: string
): Promise<AgentResponse> {
  const cfg = ELECTION_AGENTS[agentId];
  if (!cfg) throw new Error(`Unknown agent: ${agentId}`);

  const messages: Message[] = [
    { role: "user", content: contextualPrompt },
  ];

  const t0        = Date.now();
  const primary   = cfg.providers[0]!;
  let isFallback  = false;

  try {
    const { result, usedProvider } = await chat(messages, {
      systemPrompt: cfg.systemPrompt,
      temperature:  cfg.temperature,
      maxTokens:    cfg.maxTokens,
      model:        cfg.model,
      chain:        cfg.providers,
    });

    const latencyMs = Date.now() - t0;
    isFallback = usedProvider !== primary;

    recordAgentCall({
      agentId, model: cfg.model, provider: usedProvider as ProviderName,
      latencyMs, success: true, isFallback,
    });

    return {
      agentId, name: cfg.name, role: cfg.role, avatar: cfg.avatar,
      text: result, available: true, latencyMs,
      provider: usedProvider, isFallback,
    };
  } catch {
    const latencyMs = Date.now() - t0;
    recordAgentCall({
      agentId, model: cfg.model, provider: primary,
      latencyMs, success: false, isFallback,
    });
    return {
      agentId, name: cfg.name, role: cfg.role, avatar: cfg.avatar,
      text: "Agent temporarily unavailable. Please retry.",
      available: false, latencyMs, provider: primary, isFallback: false,
    };
  }
}

// ── Synthesis & follow-ups ────────────────────────────────────

async function generateSynthesis(
  responses: AgentResponse[],
  topic: string
): Promise<{ agreements: string[]; contradictions: string[]; consensus: string }> {
  const available = responses.filter((r) => r.available);
  if (available.length === 0) return { agreements: [], contradictions: [], consensus: "" };

  const prompt = `You are a neutral debate synthesiser. Given these 4 expert responses on: "${topic}"

${available.map((r) => `[${r.name} — ${r.role}]:\n${r.text}`).join("\n\n---\n\n")}

In JSON format, identify:
1. "agreements": 2-3 key points ALL experts agree on (array of strings)
2. "contradictions": 1-2 genuine points of disagreement (array of strings)
3. "consensus": A single paragraph summarising the balanced view a neutral reader should take away

Respond ONLY with valid JSON: {"agreements":[],"contradictions":[],"consensus":""}`;

  try {
    const { result } = await chat(
      [{ role: "user", content: prompt }],
      { temperature: 0.2, maxTokens: 600, chain: ["groq", "gemini", "cerebras"] }
    );
    // Extract JSON from response
    const match = result.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as { agreements: string[]; contradictions: string[]; consensus: string };
  } catch { /* fall through to default */ }

  return {
    agreements: ["All experts agree on the importance of voter participation"],
    contradictions: [],
    consensus: available.map((r) => r.text).join(" ").slice(0, 300) + "...",
  };
}

async function generateFollowUps(
  topic: string
): Promise<Array<{ question: string; category: "deeper" | "related" | "practical" }>> {
  const prompt = `Based on this election debate about: "${topic}"

Generate exactly 3 follow-up questions in JSON format:
[
  {"question": "...", "category": "deeper"},
  {"question": "...", "category": "related"},
  {"question": "...", "category": "practical"}
]

Categories:
- "deeper": goes deeper into the same topic
- "related": explores a connected election topic
- "practical": what a citizen can actually do right now

Respond ONLY with the JSON array.`;

  try {
    const { result } = await chat(
      [{ role: "user", content: prompt }],
      { temperature: 0.5, maxTokens: 300, chain: ["groq", "gemini"] }
    );
    const match = result.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]) as Array<{ question: string; category: "deeper" | "related" | "practical" }>;
  } catch { /* fall through */ }

  return [
    { question: `How does this compare across different Indian states?`, category: "related" },
    { question: `What can I do right now as a citizen regarding ${topic}?`, category: "practical" },
    { question: `What are the constitutional safeguards for ${topic}?`, category: "deeper" },
  ];
}

// ── Main orchestrator ─────────────────────────────────────────

export interface DebateResult {
  debateId:        string;
  topic:           string;
  responses:       AgentResponse[];
  synthesis:       { agreements: string[]; contradictions: string[]; consensus: string };
  followUpQuestions: Array<{ question: string; category: "deeper" | "related" | "practical" }>;
  modelPerformance: { fastestAgent: string; slowestAgent: string; avgLatencyMs: number };
  timestamp:       Date;
}

export async function conductElectionDebate(
  topic: string,
  userContext?: { state?: string; isFirstTimeVoter?: boolean; sessionId?: string }
): Promise<DebateResult> {

  // Fetch relevant news context
  const newsContext = await fetchNewsContext(topic, userContext?.state);

  // Build context-enriched prompt once, reused by all 4 agents
  const contextualPrompt = [
    `Question about Indian elections: ${topic}`,
    userContext?.state        ? `User's state/UT: ${userContext.state}. Where relevant, mention that state's specific rules, deadlines, or electoral officers.` : "",
    userContext?.isFirstTimeVoter ? "Note: This user is a first-time voter — keep explanations accessible." : "",
    "Keep your answer focused and practical for an Indian citizen.",
  ].filter(Boolean).join("\n");

  // Run all 4 agents in parallel
  const agentIds = ["professor", "activist", "journalist", "citizen"];
  const settled  = await Promise.allSettled(
    agentIds.map((id) => {
      const enrichedPrompt = enrichPromptWithContext(contextualPrompt, newsContext, id);
      return runAgent(id, enrichedPrompt);
    })
  );

  const responses: AgentResponse[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const cfg = ELECTION_AGENTS[agentIds[i]!]!;
    return {
      agentId: agentIds[i]!, name: cfg.name, role: cfg.role, avatar: cfg.avatar,
      text: "Agent temporarily unavailable.", available: false,
      latencyMs: 0, provider: cfg.providers[0]!, isFallback: false,
    };
  });

  // Synthesis + follow-ups in parallel (use fastest model)
  const [synthesis, followUpQuestions] = await Promise.all([
    generateSynthesis(responses, topic),
    generateFollowUps(topic),
  ]);

  // Performance stats
  const available     = responses.filter((r) => r.available);
  const avgLatencyMs  = available.length
    ? Math.round(available.reduce((s, r) => s + r.latencyMs, 0) / available.length)
    : 0;
  const fastest = available.sort((a, b) => a.latencyMs - b.latencyMs)[0];
  const slowest = available.sort((a, b) => b.latencyMs - a.latencyMs)[0];

  const debateId = `ed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const result: DebateResult = {
    debateId,
    topic,
    responses,
    synthesis,
    followUpQuestions,
    modelPerformance: {
      fastestAgent:  fastest?.agentId ?? "",
      slowestAgent:  slowest?.agentId ?? "",
      avgLatencyMs,
    },
    timestamp: new Date(),
  };

  // Persist to Firestore (fire-and-forget)
  void firestoreDB
    .collection("election_debates")
    .doc(debateId)
    .set({
      ...result,
      timestamp:     result.timestamp.toISOString(),
      sessionId:     userContext?.sessionId ?? null,
      state:         userContext?.state ?? null,
      isFirstTimeVoter: userContext?.isFirstTimeVoter ?? false,
    })
    .catch((e: unknown) => console.error("[ElectionDebate] Firestore write failed:", e));

  // Flush analytics buffer
  void flushBuffer();

  return result;
}
