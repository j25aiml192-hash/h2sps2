"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import {
  CheckCircle, XCircle, HelpCircle, Lightbulb, Zap, Timer,
  AlertTriangle, ArrowRight, Sparkles, Scale,
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

const AGENT_META: Record<AgentName, {
  label: string; title: string; emoji: string;
  gradient: string; border: string; badge: string; glow: string;
}> = {
  professor: {
    label: "Professor", title: "Elena Vasquez", emoji: "🎓",
    gradient: "from-blue-950/60 to-blue-900/30",
    border: "border-blue-500/30", badge: "bg-blue-500/20 text-blue-300 border-blue-400/30",
    glow: "shadow-blue-500/10",
  },
  activist: {
    label: "Activist", title: "Maya Chen", emoji: "✊",
    gradient: "from-red-950/60 to-red-900/30",
    border: "border-red-500/30", badge: "bg-red-500/20 text-red-300 border-red-400/30",
    glow: "shadow-red-500/10",
  },
  journalist: {
    label: "Journalist", title: "James Okafor", emoji: "📰",
    gradient: "from-amber-950/60 to-amber-900/30",
    border: "border-amber-500/30", badge: "bg-amber-500/20 text-amber-300 border-amber-400/30",
    glow: "shadow-amber-500/10",
  },
  citizen: {
    label: "Citizen", title: "Amit Patil", emoji: "🙋",
    gradient: "from-emerald-950/60 to-emerald-900/30",
    border: "border-emerald-500/30", badge: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
    glow: "shadow-emerald-500/10",
  },
};


function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin-slow" />;
}

function AgentCard({ result }: { result: AgentResult }) {
  const meta = AGENT_META[result.agent];
  const ok = result.status === "success";
  return (
    <div className={`rounded-2xl border ${meta.border} bg-gradient-to-br ${meta.gradient} p-5 flex flex-col gap-4 shadow-lg ${meta.glow} animate-slide-up backdrop-blur-sm`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border ${meta.border} bg-black/20`}>
            {meta.emoji}
          </div>
          <div>
            <p className="text-sm font-bold text-white">{meta.label}</p>
            <p className="text-xs text-white/50">{meta.title}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${meta.badge} font-mono`}>{result.provider}</span>
          {ok && <span className="text-xs text-white/40 font-mono">{result.latencyMs}ms</span>}
        </div>
      </div>

      {/* Divider */}
      <div className={`h-px bg-gradient-to-r from-transparent via-white/10 to-transparent`} />

      {/* Content */}
      {ok ? (
        <p className="text-sm text-white/85 leading-relaxed">{result.text}</p>
      ) : (
        <div className="flex items-center gap-2 text-sm text-white/40 italic py-2">
          <AlertTriangle size={14} className="text-yellow-500 shrink-0" />
          <span>Agent unavailable — {result.status === "timeout" ? "timed out" : "provider error"}</span>
        </div>
      )}

      {/* Footer model tag */}
      <div className="mt-auto">
        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${meta.border} text-white/30`}>{result.model}</span>
        {result.usedFallback && <span className="ml-2 text-xs text-yellow-400/70">↩ fallback</span>}
      </div>
    </div>
  );
}

function AgentCardSkeleton({ agent }: { agent: AgentName }) {
  const meta = AGENT_META[agent];
  return (
    <div className={`rounded-2xl border ${meta.border} bg-gradient-to-br ${meta.gradient} p-5 flex flex-col gap-4 shadow-lg animate-pulse`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border ${meta.border} bg-black/20`}>
          {meta.emoji}
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-20 rounded bg-white/10" />
          <div className="h-2.5 w-16 rounded bg-white/10" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Spinner />
          <span className="text-xs text-white/40">thinking…</span>
        </div>
      </div>
      <div className={`h-px bg-gradient-to-r from-transparent via-white/10 to-transparent`} />
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-11/12 rounded bg-white/10" />
        <div className="h-3 w-4/5 rounded bg-white/10" />
        <div className="h-3 w-3/4 rounded bg-white/10" />
        <div className="h-3 w-2/3 rounded bg-white/10" />
      </div>
    </div>
  );
}

function SynthesisPanel({ synthesis }: { synthesis: DebateSynthesis }) {
  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/40 to-purple-950/30 p-6 space-y-5 animate-slide-up shadow-lg shadow-indigo-500/5">
      <div className="flex items-center gap-2">
        <Scale size={16} className="text-indigo-400" />
        <h3 className="text-sm font-bold text-white">AI Synthesis</h3>
        <span className="ml-auto text-xs text-white/30 font-mono">Groq · Llama 3.1 8B</span>
      </div>

      {/* Consensus quote */}
      <div className="border-l-2 border-indigo-500/50 pl-4">
        <p className="text-sm text-white/80 italic leading-relaxed">&ldquo;{synthesis.consensus}&rdquo;</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-950/30 border border-green-500/20 rounded-xl p-4">
          <p className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1.5"><CheckCircle size={12} /> Agreements</p>
          <ul className="space-y-1.5">
            {synthesis.agreements.map((a, i) => (
              <li key={i} className="text-xs text-white/60 leading-relaxed flex items-start gap-1.5">
                <span className="mt-0.5 text-green-500/60">•</span>{a}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5"><XCircle size={12} /> Contradictions</p>
          <ul className="space-y-1.5">
            {synthesis.contradictions.map((c, i) => (
              <li key={i} className="text-xs text-white/60 leading-relaxed flex items-start gap-1.5">
                <span className="mt-0.5 text-red-500/60">•</span>{c}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5"><HelpCircle size={12} /> Missing Angles</p>
          <ul className="space-y-1.5">
            {synthesis.missingPerspectives.map((m, i) => (
              <li key={i} className="text-xs text-white/60 leading-relaxed flex items-start gap-1.5">
                <span className="mt-0.5 text-amber-500/60">•</span>{m}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FactCheckPanel({ checks }: { checks: FactCheck[] }) {
  if (!checks.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3 animate-slide-up">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <CheckCircle size={14} className="text-emerald-400" /> Fact Checks
      </h3>
      <div className="space-y-2">
        {checks.map((fc, i) => (
          <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/5">
            <span className="mt-0.5 shrink-0">
              {fc.verified === true
                ? <CheckCircle size={13} className="text-emerald-400" />
                : fc.verified === false
                ? <XCircle size={13} className="text-red-400" />
                : <HelpCircle size={13} className="text-white/30" />}
            </span>
            <span className="text-xs text-white/60 leading-relaxed flex-1">{fc.claim}</span>
            {fc.source && <span className="shrink-0 text-xs text-white/25 italic">{fc.source}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

const FOLLOW_UP_COLORS: Record<FollowUpQuestion["category"], string> = {
  "Deeper Dive":           "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "Related Topic":         "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "Practical Application": "bg-teal-500/20  text-teal-300  border-teal-500/30",
};

function FollowUpPanel({ questions, onSelect }: { questions: FollowUpQuestion[]; onSelect: (q: string) => void }) {
  if (!questions.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3 animate-slide-up">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Lightbulb size={14} className="text-yellow-400" /> Explore Further
      </h3>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <button key={i} onClick={() => onSelect(q.question)}
            className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/5 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all group">
            <span className={`mt-0.5 shrink-0 text-xs px-2 py-0.5 rounded-full border ${FOLLOW_UP_COLORS[q.category]}`}>{q.category}</span>
            <span className="text-xs text-white/55 group-hover:text-white/85 transition-colors leading-relaxed">{q.question}</span>
            <ArrowRight size={13} className="shrink-0 mt-0.5 ml-auto text-white/20 group-hover:text-indigo-400 transition-colors" />
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
const ELECTION_TOPICS = [
  "How do I check my name on the electoral roll?",
  "What is NOTA and when should I use it?",
  "Can I vote if I moved to a different city?",
  "What is the Model Code of Conduct?",
];

export default function DebatePage() {
  const [mounted, setMounted] = useState(false);
  const [topic, setTopic]     = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<DebateResponse | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [electionMode, setElectionMode] = useState(false);
  const [stateVal, setStateVal]         = useState("");
  const [firstTimeVoter, setFTV]        = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <AppShell subtitle="Policy Simulator">
        <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 px-6 py-16 space-y-10">
          <div className="max-w-2xl mx-auto space-y-4 text-center">
            <div className="h-10 w-64 mx-auto rounded-2xl bg-white/5 animate-pulse" />
            <div className="h-4 w-96 mx-auto rounded bg-white/5 animate-pulse" />
          </div>
          <div className="max-w-2xl mx-auto h-14 rounded-2xl bg-white/5 animate-pulse" />
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
      const endpoint = electionMode ? "/api/election/debate" : "/api/agents/debate";
      const body = electionMode
        ? { topic: finalTopic, state: stateVal || undefined, isFirstTimeVoter: firstTimeVoter }
        : { topic: finalTopic };
      const res  = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as DebateResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Debate failed");
      setResult(data);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  const examples = electionMode ? ELECTION_TOPICS : EXAMPLE_TOPICS;

  return (
    <AppShell subtitle={electionMode ? "Election Mode" : "Policy Simulator"}>
      {/* Dark background for the whole page */}
      <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-950 to-gray-900">
        {/* Hero section */}
        <div className="relative overflow-hidden">
          {/* Background glow blobs */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 right-1/4 w-80 h-80 bg-purple-600/8 rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-4xl mx-auto px-6 pt-16 pb-12 text-center space-y-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
              <Sparkles size={12} />
              {electionMode ? "Civic Intelligence" : "Multi-Model AI Debate"}
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
              {electionMode ? "Civic Planner" : "Policy Simulator"}
            </h1>
            <p className="text-base text-white/50 max-w-xl mx-auto leading-relaxed">
              {electionMode
                ? "Ask Indian election experts — 4 AI agents give parallel civic perspectives."
                : "4 AI personas debate in parallel. We synthesise, fact-check, and surface what to explore next."}
            </p>

            {/* Mode toggle */}
            <div className="flex justify-center">
              <button
                onClick={() => { setElectionMode((v) => !v); setResult(null); setError(null); setTopic(""); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                  electionMode
                    ? "bg-orange-500/15 text-orange-300 border-orange-500/30 hover:bg-orange-500/20"
                    : "bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white/70"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full transition-all ${electionMode ? "bg-orange-400" : "bg-white/20"}`} />
                🗳️ Election Mode
              </button>
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="max-w-2xl mx-auto px-6 pb-10 space-y-4">
          <div className="flex gap-2">
            <input value={topic} onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleDebate(); }}
              placeholder={electionMode ? "Ask about voting, elections, schemes…" : "Enter a policy topic to debate…"}
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/40 transition-all" />
            <button onClick={() => void handleDebate()} disabled={loading || !topic.trim()}
              className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm transition-all flex items-center gap-2 whitespace-nowrap">
              {loading ? <><Spinner /> Debating…</> : <>Simulate <ArrowRight size={14} /></>}
            </button>
          </div>

          {/* Election extras */}
          {electionMode && (
            <div className="flex flex-wrap items-center gap-3 px-1">
              <select value={stateVal} onChange={(e) => setStateVal(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white/70 focus:outline-none focus:border-indigo-500/40 transition-all">
                <option value="">All India</option>
                {["Maharashtra","Delhi","Uttar Pradesh","Tamil Nadu","West Bengal","Karnataka","Gujarat","Rajasthan","Bihar","Andhra Pradesh"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer select-none">
                <input type="checkbox" checked={firstTimeVoter} onChange={(e) => setFTV(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded" />
                First-time voter
              </label>
            </div>
          )}

          {/* Example chips */}
          {!result && !loading && (
            <div className="flex flex-wrap gap-2 justify-center pt-1">
              {examples.map((t) => (
                <button key={t} onClick={() => void handleDebate(t)}
                  className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all">
                  {t.length > 55 ? t.slice(0, 55) + "…" : t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="max-w-6xl mx-auto px-6 pb-20 space-y-6">
          {/* Error */}
          {error && (
            <div className="max-w-2xl mx-auto bg-red-500/10 border border-red-500/25 rounded-2xl p-4 text-sm text-red-300 flex items-center gap-2 animate-slide-up">
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          {/* Loading — agent skeletons */}
          {loading && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {AGENT_ORDER.map((a) => <AgentCardSkeleton key={a} agent={a} />)}
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 flex items-center gap-3 text-sm text-white/40">
                <Spinner /> Running synthesis pipeline (Groq · Gemini · Cerebras)…
              </div>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <div className="space-y-6 animate-slide-up">
              {/* Meta bar */}
              <div className="flex items-center justify-between flex-wrap gap-3 px-1">
                <div>
                  <p className="text-xs text-white/35 mb-0.5">Topic</p>
                  <p className="text-sm font-medium text-white/80">{result.topic}</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-white/35">
                  <span className="flex items-center gap-1.5"><Zap size={11} className="text-yellow-400" /> <span className="text-white/55">Fastest:</span> {result.modelPerformance.fastestProvider}</span>
                  <span className="flex items-center gap-1.5"><Timer size={11} /> Avg: {result.modelPerformance.avgLatencyMs}ms</span>
                  <span>
                    <span className="text-emerald-400 font-semibold">{result.modelPerformance.successCount}</span>
                    <span className="mx-1">/</span>
                    <span className="text-red-400 font-semibold">{result.modelPerformance.failureCount}</span>
                    <span className="ml-1">agents</span>
                  </span>
                </div>
              </div>

              {/* Agent grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {AGENT_ORDER.map((agent) => {
                  const r = result.agents.find((a) => a.agent === agent);
                  return r ? <AgentCard key={agent} result={r} /> : null;
                })}
              </div>

              {/* Synthesis */}
              <SynthesisPanel synthesis={result.synthesis} />

              {/* Fact-check + Follow-up */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <FactCheckPanel checks={result.factChecks} />
                <FollowUpPanel questions={result.followUpQuestions} onSelect={(q) => { setTopic(q); void handleDebate(q); }} />
              </div>

              {/* Footer ID */}
              <p className="text-center text-xs text-white/20 font-mono pt-2">debate/{result.debateId}</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
