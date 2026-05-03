"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import {
  GraduationCap, Siren, Newspaper, Home,
  CheckCircle, XCircle, HelpCircle, Lightbulb, Zap, Timer, BarChart2, AlertTriangle,
} from "lucide-react";
import type { AgentName } from "@/lib/agent-configs";
import type { FactCheck, FollowUpQuestion, DebateSynthesis } from "@/lib/debate-types";
import type { ProviderName } from "@/lib/types";

interface AgentResult {
  agent: AgentName;
  status: "success" | "timeout" | "error";
  text: string | null;
  model: string;
  provider: ProviderName;
  latencyMs: number;
  usedFallback: boolean;
  errorMessage?: string;
}

interface DebateResponse {
  debateId: string;
  topic: string;
  agents: AgentResult[];
  synthesis: DebateSynthesis;
  factChecks: FactCheck[];
  followUpQuestions: FollowUpQuestion[];
  modelPerformance: {
    fastestModel: string;
    fastestProvider: ProviderName;
    avgLatencyMs: number;
    successCount: number;
    failureCount: number;
  };
  totalDurationMs: number;
}

const AGENT_META: Record<AgentName, { label: string; badge: string; card: string }> = {
  professor: { label: "Professor", badge: "bg-blue-50 text-blue-700 border-blue-200", card: "border-blue-200 bg-blue-50/40" },
  activist:  { label: "Activist",  badge: "bg-red-50 text-red-700 border-red-200",   card: "border-red-200 bg-red-50/40"   },
  journalist:{ label: "Journalist",badge: "bg-amber-50 text-amber-700 border-amber-200", card: "border-amber-200 bg-amber-50/40" },
  citizen:   { label: "Citizen",   badge: "bg-green-50 text-green-700 border-green-200", card: "border-green-200 bg-green-50/40" },
};

function AgentIcon({ agent }: { agent: AgentName }) {
  if (agent === "professor")  return <GraduationCap size={16} />;
  if (agent === "activist")   return <Siren size={16} />;
  if (agent === "journalist") return <Newspaper size={16} />;
  return <Home size={16} />;
}


const FOLLOW_UP_COLORS: Record<FollowUpQuestion["category"], string> = {
  "Deeper Dive":           "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Related Topic":         "bg-purple-50 text-purple-700 border-purple-200",
  "Practical Application": "bg-teal-50  text-teal-700  border-teal-200",
};

function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin-slow" />;
}

function AgentCard({ result }: { result: AgentResult }) {
  const meta = AGENT_META[result.agent];
  return (
    <div className={`rounded-2xl border ${meta.card} p-md flex flex-col gap-3 animate-slide-up`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-ink-muted"><AgentIcon agent={result.agent} /></span>
          <span className="font-semibold text-ink text-body-sm">{meta.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {result.usedFallback && (
            <span className="text-caption px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">fallback</span>
          )}
          <span className={`text-caption px-2 py-0.5 rounded-full border ${meta.badge}`}>{result.provider}</span>
          <span className="text-caption text-ink-muted font-mono">{result.latencyMs}ms</span>
        </div>
      </div>
      <span className="text-caption text-ink-muted font-mono truncate">{result.model}</span>
      {result.status === "success" ? (
        <p className="text-body-sm text-ink leading-relaxed">{result.text}</p>
      ) : (
        <div className="flex items-center gap-2 text-body-sm text-ink-muted italic">
          <AlertTriangle size={14} className="text-yellow-500 shrink-0" />
          <span>Agent unavailable — {result.status === "timeout" ? "response timed out" : "provider error"}</span>
        </div>
      )}
    </div>
  );
}

function SynthesisPanel({ synthesis }: { synthesis: DebateSynthesis }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-md space-y-sm animate-slide-up">
      <h3 className="text-body-sm font-semibold text-ink flex items-center gap-2">
        <CheckCircle size={16} className="text-green-600" /> Consensus Analysis
        <span className="ml-auto text-caption text-ink-muted font-normal">Groq Llama 3.1 8B</span>
      </h3>
      <p className="text-body-sm text-ink italic border-l-2 border-accent-blue pl-3">&ldquo;{synthesis.consensus}&rdquo;</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-sm text-caption">
        <div>
          <p className="text-green-700 font-medium mb-1.5 flex items-center gap-1"><CheckCircle size={12} /> Agreements</p>
          <ul className="space-y-1">{synthesis.agreements.map((a, i) => <li key={i} className="text-ink-muted leading-relaxed">• {a}</li>)}</ul>
        </div>
        <div>
          <p className="text-red-600 font-medium mb-1.5 flex items-center gap-1"><XCircle size={12} /> Contradictions</p>
          <ul className="space-y-1">{synthesis.contradictions.map((c, i) => <li key={i} className="text-ink-muted leading-relaxed">• {c}</li>)}</ul>
        </div>
        <div>
          <p className="text-amber-600 font-medium mb-1.5 flex items-center gap-1"><HelpCircle size={12} /> Missing Angles</p>
          <ul className="space-y-1">{synthesis.missingPerspectives.map((m, i) => <li key={i} className="text-ink-muted leading-relaxed">• {m}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function FactCheckPanel({ checks }: { checks: FactCheck[] }) {
  if (!checks.length) return null;
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-md space-y-sm animate-slide-up">
      <h3 className="text-body-sm font-semibold text-ink">Fact Checks</h3>
      <div className="space-y-2">
        {checks.map((fc, i) => (
          <div key={i} className="flex items-start gap-2 text-caption">
            <span className="mt-0.5 shrink-0">
              {fc.verified === true ? <CheckCircle size={12} className="text-green-600" /> : fc.verified === false ? <XCircle size={12} className="text-red-500" /> : <HelpCircle size={12} className="text-ink-muted" />}
            </span>
            <span className="text-ink-muted leading-relaxed flex-1">{fc.claim}</span>
            {fc.source && <span className="shrink-0 text-ink-muted italic">{fc.source}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowUpPanel({ questions, onSelect }: { questions: FollowUpQuestion[]; onSelect: (q: string) => void }) {
  if (!questions.length) return null;
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-md space-y-sm animate-slide-up">
      <h3 className="text-body-sm font-semibold text-ink flex items-center gap-2"><Lightbulb size={14} className="text-yellow-500" /> Explore Further</h3>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <button key={i} onClick={() => onSelect(q.question)}
            className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-surface-2 hover:bg-surface-1 border border-hairline hover:border-accent-blue transition-all group">
            <span className={`mt-0.5 shrink-0 text-caption px-2 py-0.5 rounded-full border ${FOLLOW_UP_COLORS[q.category]}`}>{q.category}</span>
            <span className="text-body-sm text-ink-muted group-hover:text-ink transition-colors">{q.question}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const AGENT_ORDER: AgentName[] = ["professor", "activist", "journalist", "citizen"];
const EXAMPLE_TOPICS = [
  "Should AI replace human judges in criminal courts?",
  "Is universal basic income viable for developing nations?",
  "Should social media platforms be liable for user content?",
  "Is nuclear energy essential for net-zero by 2050?",
];

export default function DebatePage() {
  const [mounted, setMounted] = useState(false);
  const [topic, setTopic]     = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<DebateResponse | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <AppShell subtitle="Policy Simulator">
        <div className="max-w-7xl mx-auto px-6 py-[42px] space-y-[42px]">
          <div className="text-center space-y-2">
            <div className="h-9 w-56 bg-surface-2 rounded-xl mx-auto animate-pulse" />
            <div className="h-4 w-96 bg-surface-2 rounded-lg mx-auto animate-pulse" />
          </div>
          <div className="max-w-3xl mx-auto flex gap-3">
            <div className="flex-1 h-12 bg-surface-2 rounded-2xl animate-pulse" />
            <div className="w-28 h-12 bg-surface-2 rounded-2xl animate-pulse" />
          </div>
        </div>
      </AppShell>
    );
  }

  async function handleDebate(topicOverride?: string) {
    const finalTopic = topicOverride ?? topic;
    if (!finalTopic.trim() || loading) return;
    if (topicOverride) setTopic(topicOverride);
    setLoading(true); setResult(null); setError(null);
    try {
      const res  = await fetch("/api/agents/debate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: finalTopic }) });
      const data = await res.json() as DebateResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Debate failed");
      setResult(data);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <AppShell subtitle="Policy Simulator">
      <div className="max-w-7xl mx-auto px-6 py-[42px] space-y-[42px]">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-display font-semibold text-ink">Policy Simulator</h1>
          <p className="text-body-sm text-ink-muted max-w-xl mx-auto">
            4 AI agents with distinct personas debate in parallel — then we synthesise, fact-check, and suggest what to explore next.
          </p>
        </div>

        {/* Input */}
        <div className="max-w-3xl mx-auto space-y-sm">
          <div className="flex gap-3">
            <input value={topic} onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleDebate(); }}
              placeholder="Enter a policy topic to debate…"
              className="flex-1 bg-surface-1 border border-hairline rounded-2xl px-md py-sm text-body text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-accent-blue transition-all" />
            <button onClick={() => void handleDebate()} disabled={loading || !topic.trim()}
              className="px-md py-sm rounded-2xl bg-primary hover:opacity-90 disabled:opacity-40 text-on-primary font-semibold text-body-sm transition-all flex items-center gap-2">
              {loading ? <><Spinner /> Debating…</> : "Simulate →"}
            </button>
          </div>

          {!result && !loading && (
            <div className="flex flex-wrap gap-2 justify-center">
              {EXAMPLE_TOPICS.map((t) => (
                <button key={t} onClick={() => void handleDebate(t)}
                  className="text-caption px-3 py-1.5 rounded-full bg-surface-1 border border-hairline text-ink-muted hover:text-ink hover:border-accent-blue transition-all">
                  {t.length > 55 ? t.slice(0, 55) + "…" : t}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 rounded-2xl p-md text-body-sm text-red-700 flex items-center gap-2 animate-slide-up">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {loading && (
          <div className="space-y-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
              {AGENT_ORDER.map((a) => {
                const m = AGENT_META[a];
                return (
                  <div key={a} className={`rounded-2xl border ${m.card} p-md space-y-3`}>
                    <div className="flex items-center gap-2">
                      <span className="text-ink-muted"><AgentIcon agent={a} /></span>
                      <span className="text-body-sm font-semibold text-ink">{m.label}</span>
                      <Spinner />
                    </div>
                    <div className="space-y-2 animate-pulse">
                      <div className="h-3 bg-surface-2 rounded-full w-full" />
                      <div className="h-3 bg-surface-2 rounded-full w-5/6" />
                      <div className="h-3 bg-surface-2 rounded-full w-4/6" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-2xl border border-hairline bg-surface-1 p-md flex items-center gap-3 text-body-sm text-ink-muted">
              <Spinner /> Running synthesis pipeline (Groq · Gemini · Cerebras)…
            </div>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-md animate-slide-up">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-body-sm font-medium text-ink-muted">Topic: <span className="text-ink">{result.topic}</span></h2>
              <div className="flex flex-wrap items-center gap-3 text-caption text-ink-muted">
                <span className="flex items-center gap-1"><Zap size={12} /> Fastest: <strong className="text-ink">{result.modelPerformance.fastestProvider}</strong></span>
                <span className="flex items-center gap-1"><Timer size={12} /> Avg: <strong className="text-ink">{result.modelPerformance.avgLatencyMs}ms</strong></span>
                <span className="flex items-center gap-1"><BarChart2 size={12} /> <strong className="text-green-600">{result.modelPerformance.successCount}</strong> / <strong className="text-red-500">{result.modelPerformance.failureCount}</strong></span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
              {AGENT_ORDER.map((agent) => { const r = result.agents.find((a) => a.agent === agent); return r ? <AgentCard key={agent} result={r} /> : null; })}
            </div>
            <SynthesisPanel synthesis={result.synthesis} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-sm">
              <FactCheckPanel checks={result.factChecks} />
              <FollowUpPanel questions={result.followUpQuestions} onSelect={(q) => { setTopic(q); void handleDebate(q); }} />
            </div>
            <p className="text-center text-caption text-ink-muted font-mono">debate/{result.debateId}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
