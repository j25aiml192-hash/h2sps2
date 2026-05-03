// ============================================================
// Core Types for Multi-Model AI Provider Infrastructure
// ============================================================

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface ChatOptions {
  temperature?: number;       // 0.0 – 2.0
  maxTokens?: number;
  topP?: number;
  model?: string;             // override the provider default model
  systemPrompt?: string;      // convenience – prepended as system message
}

export interface RateLimitInfo {
  remaining: number;
  resetAt: Date;
}

export interface HealthStatus {
  healthy: boolean;
  latencyMs?: number;
  errorMessage?: string;
}

export type ProviderName =
  | "groq"
  | "gemini"
  | "cerebras"
  | "together"
  | "nim";

// The single interface every provider class must implement
export interface AIProvider {
  readonly name: ProviderName;
  chat(messages: Message[], options?: ChatOptions): Promise<string>;
  checkHealth(): Promise<boolean>;
  getRateLimit(): RateLimitInfo;
}

// Circuit-breaker state stored per-provider
export interface CircuitState {
  failures: number;
  disabledUntil: Date | null;
}

// Logged whenever the orchestrator switches providers
export interface ProviderSwitchEvent {
  fromProvider: ProviderName | null;
  toProvider: ProviderName;
  reason: string;
  timestamp: Date;
  sessionId?: string;
}

// Analytics event written to Firestore
export interface AnalyticsEvent {
  type: "provider_switch" | "circuit_open" | "circuit_close" | "request_success" | "request_error";
  provider: ProviderName;
  detail: Record<string, unknown>;
  timestamp: Date;
}
