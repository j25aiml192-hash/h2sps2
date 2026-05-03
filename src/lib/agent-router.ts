/**
 * ============================================================
 * Smart Agent Router
 * ============================================================
 * Routes each agent to its optimal provider/model based on:
 *  1. Personality-matched primary provider
 *  2. Current rate-limit state (falls back if remaining < threshold)
 *  3. SLA timeout (citizen fastest, professor can wait)
 *
 * Runs all 4 agents in parallel via Promise.allSettled.
 * Each agent has an individual timeout; failure never blocks others.
 * ============================================================
 */
import { AGENT_CONFIGS, AGENT_NAMES, type AgentName } from "./agent-configs";
import { getProviderRateLimits } from "./ai-providers";
import type { Message, ProviderName } from "./types";
import type { AgentResponse } from "./debate-types";

// ── Low rate-limit threshold – fall back if remaining < this ─
const RATE_LIMIT_LOW_THRESHOLD = 5;

/**
 * Pick primary or fallback based on live rate-limit state.
 */
function selectProviderModel(agent: AgentName): {
  provider: ProviderName;
  model: string;
  usedFallback: boolean;
} {
  const cfg = AGENT_CONFIGS[agent];
  const limits = getProviderRateLimits();
  const primaryRemaining = limits[cfg.primary.provider]?.remaining ?? 999;

  if (primaryRemaining < RATE_LIMIT_LOW_THRESHOLD) {
    console.log(
      `[Router] ${agent}: primary ${cfg.primary.provider} rate-limited (${primaryRemaining} remaining) → using fallback ${cfg.fallback.provider}`
    );
    return { ...cfg.fallback, usedFallback: true };
  }

  return { ...cfg.primary, usedFallback: false };
}

/**
 * Wrap a promise with a hard timeout.
 * Resolves with the value or rejects with a TimeoutError.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[Timeout] ${label} exceeded ${ms}ms`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e); }
    );
  });
}

/**
 * Call a single agent with routing + timeout + fallback awareness.
 */
async function runAgent(
  agent: AgentName,
  topic: string,
  chatHistory: Message[]
): Promise<AgentResponse> {
  const cfg = AGENT_CONFIGS[agent];
  const { provider, model, usedFallback } = selectProviderModel(agent);

  const messages: Message[] = [
    { role: "system", content: cfg.systemPrompt },
    ...chatHistory,
    { role: "user", content: topic },
  ];

  const t0 = Date.now();

  // Dynamically import the provider class to avoid circular deps
  const { GroqProvider, GeminiProvider, CerebrasProvider, NIMProvider } =
    await import("./ai-providers");

  const providerInstances: Record<ProviderName, () => InstanceType<
    typeof GroqProvider | typeof GeminiProvider | typeof CerebrasProvider |
    typeof NIMProvider
  >> = {
    groq:     () => new GroqProvider(),
    gemini:   () => new GeminiProvider(),
    cerebras: () => new CerebrasProvider(),
    together: () => new GroqProvider(), // fallback: together removed, redirect to groq
    nim:      () => new NIMProvider(),
  };

  const instance = providerInstances[provider]();

  const text = await instance.chat(messages, {
    model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
  });

  return {
    agent,
    text,
    model,
    provider,
    latencyMs: Date.now() - t0,
    usedFallback,
    status: "success",
  };
}

/**
 * Run all 4 agents in parallel with per-agent timeouts.
 * Uses Promise.allSettled so one failure never blocks others.
 */
export async function runAllAgents(
  topic: string,
  chatHistory: Message[] = []
): Promise<AgentResponse[]> {
  const settled = await Promise.allSettled(
    AGENT_NAMES.map((agent) =>
      withTimeout(
        runAgent(agent, topic, chatHistory),
        AGENT_CONFIGS[agent].timeoutMs,
        agent
      )
    )
  );

  return settled.map((result, i): AgentResponse => {
    const agent = AGENT_NAMES[i];

    if (result.status === "fulfilled") return result.value;

    // Failure path — build a graceful "unavailable" response
    const err = result.reason instanceof Error
      ? result.reason.message
      : String(result.reason);

    const isTimeout = err.startsWith("[Timeout]");
    console.error(`[Router] ${agent} failed: ${err}`);

    return {
      agent,
      text: "",
      model: AGENT_CONFIGS[agent].primary.model,
      provider: AGENT_CONFIGS[agent].primary.provider,
      latencyMs: AGENT_CONFIGS[agent].timeoutMs,
      usedFallback: false,
      status: isTimeout ? "timeout" : "error",
      errorMessage: err,
    };
  });
}

/**
 * Compute performance analytics from raw agent responses.
 */
export function computePerformance(responses: AgentResponse[]) {
  const successful = responses.filter((r) => r.status === "success");
  const failed = responses.filter((r) => r.status !== "success");

  const fastest = successful.reduce<AgentResponse | null>(
    (best, r) => (!best || r.latencyMs < best.latencyMs ? r : best),
    null
  );

  const avgLatencyMs =
    successful.length > 0
      ? Math.round(successful.reduce((s, r) => s + r.latencyMs, 0) / successful.length)
      : 0;

  return {
    fastestModel: fastest?.model ?? "n/a",
    fastestProvider: fastest?.provider ?? ("groq" as ProviderName),
    avgLatencyMs,
    successCount: successful.length,
    failureCount: failed.length,
  };
}
