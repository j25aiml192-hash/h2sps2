/**
 * ============================================================
 * Debate-specific Types
 * ============================================================
 */
import type { AgentName } from "./agent-configs";
import type { ProviderName } from "./types";

export interface AgentResponse {
  agent: AgentName;
  text: string;
  model: string;
  provider: ProviderName;
  latencyMs: number;
  usedFallback: boolean;
  status: "success" | "timeout" | "error";
  errorMessage?: string;
}

export interface FactCheck {
  claim: string;
  verified: boolean | null;   // null = unverifiable / no search used
  source?: string;
  flagged: boolean;           // true → show ⚠️ in UI
}

export interface FollowUpQuestion {
  question: string;
  category: "Deeper Dive" | "Related Topic" | "Practical Application";
}

export interface DebateSynthesis {
  agreements: string[];
  contradictions: string[];
  missingPerspectives: string[];
  consensus: string;
}

export interface ModelPerformance {
  fastestModel: string;
  fastestProvider: ProviderName;
  avgLatencyMs: number;
  successCount: number;
  failureCount: number;
}

// The complete Firestore document
export interface DebateRecord {
  debateId: string;
  topic: string;
  responses: Record<AgentName, AgentResponse>;
  synthesis: DebateSynthesis;
  factChecks: FactCheck[];
  followUpQuestions: FollowUpQuestion[];
  modelPerformance: ModelPerformance;
  createdAt: string;          // ISO string for Firestore
}
