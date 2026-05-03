/**
 * ============================================================
 * Multi-Model AI Provider Abstraction Layer
 * ============================================================
 *
 * Providers:
 *   - GroqProvider     → groq-sdk
 *   - GeminiProvider   → @google/generative-ai
 *   - CerebrasProvider → fetch (api.cerebras.ai)
 *   - NIMProvider      → fetch (integrate.api.nvidia.com)
 *
 * Features:
 *   • Unified AIProvider interface
 *   • Circuit-breaker (3 failures → disabled 5 min)
 *   • Automatic fallback chain with Firestore analytics
 *   • Per-provider rate-limit tracking
 * ============================================================
 */

import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { analytics } from "./analytics";
import type {
  AIProvider,
  ChatOptions,
  CircuitState,
  Message,
  ProviderName,
  RateLimitInfo,
} from "./types";

// ── Constants ────────────────────────────────────────────────
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ── Circuit-Breaker Registry ─────────────────────────────────
const circuitStates: Record<ProviderName, CircuitState> = {
  groq:      { failures: 0, disabledUntil: null },
  gemini:    { failures: 0, disabledUntil: null },
  cerebras:  { failures: 0, disabledUntil: null },
  together:  { failures: 0, disabledUntil: null }, // kept for type-compat, never instantiated
  nim:       { failures: 0, disabledUntil: null },
};

function isCircuitOpen(name: ProviderName): boolean {
  const state = circuitStates[name];
  if (!state.disabledUntil) return false;
  if (new Date() > state.disabledUntil) {
    // Auto-reset after cooldown
    state.failures = 0;
    state.disabledUntil = null;
    analytics.circuitClose(name);
    return false;
  }
  return true;
}

function recordFailure(name: ProviderName): void {
  const state = circuitStates[name];
  state.failures += 1;
  if (state.failures >= CIRCUIT_FAILURE_THRESHOLD && !state.disabledUntil) {
    state.disabledUntil = new Date(Date.now() + CIRCUIT_COOLDOWN_MS);
    console.warn(
      `[Circuit] ${name} tripped – disabled until ${state.disabledUntil.toISOString()}`
    );
    analytics.circuitOpen(name, state.disabledUntil);
  }
}

function recordSuccess(name: ProviderName): void {
  const state = circuitStates[name];
  if (state.failures > 0) {
    state.failures = 0;
    state.disabledUntil = null;
  }
}

// ── Rate-Limit Stub ──────────────────────────────────────────
// Real implementations should parse HTTP response headers
// (X-RateLimit-Remaining, X-RateLimit-Reset) and store them.
const rateLimits: Record<ProviderName, RateLimitInfo> = {
  groq:     { remaining: 1000, resetAt: new Date(Date.now() + 60_000) },
  gemini:   { remaining: 1000, resetAt: new Date(Date.now() + 60_000) },
  cerebras: { remaining: 1000, resetAt: new Date(Date.now() + 60_000) },
  together: { remaining: 0,    resetAt: new Date(Date.now() + 60_000) }, // disabled
  nim:      { remaining: 1000, resetAt: new Date(Date.now() + 60_000) },
};

// ── Helpers ───────────────────────────────────────────────────
function buildMessages(
  messages: Message[],
  options?: ChatOptions
): Message[] {
  if (options?.systemPrompt) {
    return [{ role: "system", content: options.systemPrompt }, ...messages];
  }
  return messages;
}

// ═══════════════════════════════════════════════════════════════
// 1. GROQ PROVIDER
// ═══════════════════════════════════════════════════════════════
export class GroqProvider implements AIProvider {
  readonly name: ProviderName = "groq";
  private client: Groq;
  private defaultModel = "llama-3.3-70b-versatile";

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");
    this.client = new Groq({ apiKey });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<string> {
    const allMessages = buildMessages(messages, options);
    const t0 = Date.now();

    const response = await this.client.chat.completions.create({
      model: options?.model ?? this.defaultModel,
      messages: allMessages as Groq.Chat.ChatCompletionMessageParam[],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      top_p: options?.topP ?? 1,
    });

    analytics.requestSuccess(this.name, Date.now() - t0);

    // Update rate-limit from response headers (Groq exposes these)
    const headers = (response as unknown as { _response?: { headers?: Headers } })._response?.headers;
    if (headers) {
      const remaining = headers.get("x-ratelimit-remaining-requests");
      const reset = headers.get("x-ratelimit-reset-requests");
      if (remaining) rateLimits.groq.remaining = parseInt(remaining, 10);
      if (reset) rateLimits.groq.resetAt = new Date(reset);
    }

    return response.choices[0]?.message?.content ?? "";
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  getRateLimit(): RateLimitInfo {
    return rateLimits[this.name];
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. GEMINI PROVIDER
// ═══════════════════════════════════════════════════════════════
export class GeminiProvider implements AIProvider {
  readonly name: ProviderName = "gemini";
  private client: GoogleGenerativeAI;
  private defaultModel = "gemini-1.5-flash";

  constructor() {
    const apiKey = process.env.GOOGLE_AI_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_KEY is not set");
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<string> {
    const allMessages = buildMessages(messages, options);
    const t0 = Date.now();

    const model = this.client.getGenerativeModel({
      model: options?.model ?? this.defaultModel,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 2048,
        topP: options?.topP ?? 1,
      },
    });

    // Separate system instruction from the chat history
    const systemMsg = allMessages.find((m) => m.role === "system");
    const chatMessages = allMessages.filter((m) => m.role !== "system");

    if (systemMsg) {
      // Re-create model with system instruction
      const modelWithSystem = this.client.getGenerativeModel({
        model: options?.model ?? this.defaultModel,
        systemInstruction: systemMsg.content,
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 2048,
          topP: options?.topP ?? 1,
        },
      });

      const history = chatMessages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const chat = modelWithSystem.startChat({ history });
      const lastMsg = chatMessages[chatMessages.length - 1];
      const result = await chat.sendMessage(lastMsg?.content ?? "");
      analytics.requestSuccess(this.name, Date.now() - t0);
      return result.response.text();
    }

    // No system message – plain multi-turn chat
    const history = chatMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const lastMsg = chatMessages[chatMessages.length - 1];
    const result = await chat.sendMessage(lastMsg?.content ?? "");
    analytics.requestSuccess(this.name, Date.now() - t0);
    return result.response.text();
  }

  async checkHealth(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: this.defaultModel });
      await model.generateContent("ping");
      return true;
    } catch {
      return false;
    }
  }

  getRateLimit(): RateLimitInfo {
    return rateLimits[this.name];
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. CEREBRAS PROVIDER  (OpenAI-compatible REST API)
// ═══════════════════════════════════════════════════════════════
interface CerebrasMessage {
  role: string;
  content: string;
}

interface CerebrasResponse {
  choices: { message: { content: string } }[];
}

export class CerebrasProvider implements AIProvider {
  readonly name: ProviderName = "cerebras";
  private apiKey: string;
  private baseUrl = "https://api.cerebras.ai/v1";
  private defaultModel = "llama3.1-70b";

  constructor() {
    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) throw new Error("CEREBRAS_API_KEY is not set");
    this.apiKey = apiKey;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<string> {
    const allMessages = buildMessages(messages, options);
    const t0 = Date.now();

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model ?? this.defaultModel,
        messages: allMessages as CerebrasMessage[],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
        top_p: options?.topP ?? 1,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cerebras API error ${res.status}: ${text}`);
    }

    // Parse rate-limit headers
    const remaining = res.headers.get("x-ratelimit-remaining-requests");
    const reset = res.headers.get("x-ratelimit-reset-requests");
    if (remaining) rateLimits.cerebras.remaining = parseInt(remaining, 10);
    if (reset) rateLimits.cerebras.resetAt = new Date(reset);

    const data = (await res.json()) as CerebrasResponse;
    analytics.requestSuccess(this.name, Date.now() - t0);
    return data.choices[0]?.message?.content ?? "";
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  getRateLimit(): RateLimitInfo {
    return rateLimits[this.name];
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. TOGETHER AI PROVIDER — REMOVED
// Together AI has been replaced by Groq (llama-3.1-8b-instant)
// for the Citizen agent. No API key or SDK dependency needed.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// 5. NVIDIA NIM PROVIDER  (OpenAI-compatible)
// ═══════════════════════════════════════════════════════════════
interface NIMResponse {
  choices: { message: { content: string } }[];
}

export class NIMProvider implements AIProvider {
  readonly name: ProviderName = "nim";
  private apiKey: string;
  private baseUrl = "https://integrate.api.nvidia.com/v1";
  private defaultModel = "meta/llama-3.1-70b-instruct";

  constructor() {
    const apiKey = process.env.NIM_API_KEY;
    if (!apiKey) throw new Error("NIM_API_KEY is not set");
    this.apiKey = apiKey;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<string> {
    const allMessages = buildMessages(messages, options);
    const t0 = Date.now();

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model ?? this.defaultModel,
        messages: allMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
        top_p: options?.topP ?? 1,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NIM API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as NIMResponse;
    analytics.requestSuccess(this.name, Date.now() - t0);
    return data.choices[0]?.message?.content ?? "";
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  getRateLimit(): RateLimitInfo {
    return rateLimits[this.name];
  }
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER ORCHESTRATOR  (Circuit-Breaker + Fallback Chain)
// ═══════════════════════════════════════════════════════════════

export type FallbackChain = ProviderName[];

// together removed from default chain — use groq/cerebras/nim/gemini only
const DEFAULT_CHAIN: FallbackChain = ["groq", "cerebras", "nim", "gemini"];

type ProviderMap = { [K in ProviderName]?: AIProvider };

function buildProviderMap(): ProviderMap {
  const map: ProviderMap = {};
  const builders: [ProviderName, () => AIProvider][] = [
    ["groq",     () => new GroqProvider()],
    ["gemini",   () => new GeminiProvider()],
    ["cerebras", () => new CerebrasProvider()],
    ["nim",      () => new NIMProvider()],
    // "together" intentionally omitted — use Groq for free tier
  ];

  for (const [name, build] of builders) {
    try {
      map[name] = build();
    } catch (err) {
      console.warn(`[Orchestrator] Skipping ${name}: ${(err as Error).message}`);
    }
  }
  return map;
}

// Lazy singleton
let _providerMap: ProviderMap | null = null;
function getProviderMap(): ProviderMap {
  if (!_providerMap) _providerMap = buildProviderMap();
  return _providerMap;
}

export interface OrchestratorOptions extends ChatOptions {
  chain?: FallbackChain;
  sessionId?: string;
}

/**
 * chat() — public entry point.
 *
 * Iterates the fallback chain. For each provider:
 *   1. Checks if circuit is open (skip if so).
 *   2. Tries the provider.
 *   3. On success → records success + returns.
 *   4. On failure → records failure, logs to Firestore, tries next.
 */
export async function chat(
  messages: Message[],
  options?: OrchestratorOptions
): Promise<{ result: string; usedProvider: ProviderName }> {
  const chain = options?.chain ?? DEFAULT_CHAIN;
  const map = getProviderMap();
  let lastError: Error | null = null;
  let prevProvider: ProviderName | null = null;

  for (const name of chain) {
    if (isCircuitOpen(name)) {
      console.log(`[Orchestrator] ${name} circuit open, skipping`);
      continue;
    }

    const provider = map[name];
    if (!provider) continue;

    try {
      if (prevProvider !== null) {
        analytics.providerSwitch({
          from: prevProvider,
          to: name,
          reason: lastError?.message ?? "fallback",
          sessionId: options?.sessionId,
        });
      }

      const result = await provider.chat(messages, options);
      recordSuccess(name);
      return { result, usedProvider: name };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[Orchestrator] ${name} failed: ${error.message}`);
      analytics.requestError(name, error.message);
      recordFailure(name);
      lastError = error;
      prevProvider = name;
    }
  }

  throw new Error(
    `All providers exhausted. Last error: ${lastError?.message ?? "unknown"}`
  );
}

/**
 * checkAllProviders() — health check across all providers.
 * Useful for a /api/health endpoint.
 */
export async function checkAllProviders(): Promise<
  Record<ProviderName, { healthy: boolean; circuitOpen: boolean }>
> {
  const map = getProviderMap();
  const results = {} as Record<ProviderName, { healthy: boolean; circuitOpen: boolean }>;

  const names: ProviderName[] = ["groq", "gemini", "cerebras", "nim"];
  await Promise.allSettled(
    names.map(async (name) => {
      const provider = map[name];
      const circuitOpen = isCircuitOpen(name);
      let healthy = false;
      if (provider && !circuitOpen) {
        try {
          healthy = await provider.checkHealth();
        } catch {
          healthy = false;
        }
      }
      results[name] = { healthy, circuitOpen };
    })
  );

  return results;
}

/**
 * getProviderRateLimits() — snapshot of all rate-limit counters.
 */
export function getProviderRateLimits(): Record<ProviderName, RateLimitInfo> {
  return { ...rateLimits };
}
