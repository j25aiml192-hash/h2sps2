"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import {
  GraduationCap, Siren, Newspaper, Home,
  CheckCircle, XCircle, HelpCircle, Lightbulb, Zap, Timer,
  AlertTriangle, ArrowRight, Play,
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
  label: string; title: string; role: string;
  icon: React.ReactNode;
  badge: string; card: string; accent: string;
}> = {
  professor: {
    label: "Professor", title: "Elena Vasquez", role: "Academic Researcher",
    icon: <GraduationCap size={18} />,
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    card:  "border-blue-100 bg-blue-50/30",
    accent: "text-blue-600",
  },
  activist: {
    label: "Activist", title: "Maya Chen", role: "Community Organiser",
    icon: <Siren size={18} />,
    badge: "bg-red-50 text-red-700 border-red-200",
    card:  "border-red-100 bg-red-50/30",
    accent: "text-red-600",
  },
  journalist: {
    label: "Journalist", title: "James Okafor", role: "Investigative Reporter",
    icon: <Newspaper size={18} />,
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    card:  "border-amber-100 bg-amber-50/30",
    accent: "text-amber-600",
  },
  citizen: {
    label: "Citizen", title: "Amit Patil", role: "First-time Voter",
    icon: <Home size={18} />,
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    card:  "border-emerald-100 bg-emerald-50/30",
    accent: "text-emerald-600",
  },
};

const AGENT_BIOS: Record<AgentName, string> = {
  professor:  "Evidence-driven analysis with 25 years of policy research. Cites studies, structures arguments thesis-first, avoids oversimplification.",
  activist:   "Frontline community experience. Leads with human stories and moral clarity. Challenges power structures, asks who benefits.",
  journalist: "15 years covering policy and politics. Ruthlessly factual, balanced across sides. Follows the money and the data.",
  citizen:    "A young first-time voter's perspective. Simple language, relatable examples, genuine curiosity — the voice of the street.",
};

const AGENT_ORDER: AgentName[] = ["professor", "activist", "journalist", "citizen"];

function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin-slow" />;
}

function AgentPersonaCard({ agent }: { agent: AgentName }) {
  const meta = AGENT_META[agent];
  return (
    <div className={`rounded-2xl border ${meta.card} p-md flex flex-col gap-3`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl border ${meta.badge} flex items-center justify-center`}>
          {meta.icon}
        </div>
        <div>
          <p className="text-body-sm font-semibold text-ink">{meta.label}</p>
          <p className="text-caption text-ink-muted">{meta.title}</p>
        </div>
        <span className={`ml-auto text-caption px-2 py-0.5 rounded-full border ${meta.badge}`}>{meta.role}</span>
      </div>
      <p className="text-caption text-ink-muted leading-relaxed">{AGENT_BIOS[agent]}</p>
    </div>
  );
}

function AgentLoadingCard({ agent }: { agent: AgentName }) {
  const meta = AGENT_META[agent];
  return (
    <div className={`rounded-2xl border ${meta.card} p-md flex flex-col gap-3`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl border ${meta.badge} flex items-center justify-center`}>
          {meta.icon}
        </div>
        <div>
          <p className="text-body-sm font-semibold text-ink">{meta.label}</p>
          <p className="text-caption text-ink-muted">{meta.title}</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-caption text-ink-muted">
          <Spinner /> thinking…
        </span>
      </div>
      <div className="space-y-2 animate-pulse">
        <div className="h-3 w-full rounded-full bg-surface-2" />
        <div className="h-3 w-11/12 rounded-full bg-surface-2" />
        <div className="h-3 w-4/5 rounded-full bg-surface-2" />
        <div className="h-3 w-3/4 rounded-full bg-surface-2" />
      </div>
    </div>
  );
}

function AgentResultCard({ result }: { result: AgentResult }) {
  const meta = AGENT_META[result.agent];
  const ok = result.status === "success";
  return (
    <div className={`rounded-2xl border ${meta.card} p-md flex flex-col gap-3 animate-slide-up`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl border ${meta.badge} flex items-center justify-center`}>
          {meta.icon}
        </div>
        <div>
          <p className="text-body-sm font-semibold text-ink">{meta.label}</p>
          <p className="text-caption text-ink-muted font-mono">{result.model}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {result.usedFallback && (
            <span className="text-caption px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">fallback</span>
          )}
          <span className={`text-caption px-2 py-0.5 rounded-full border ${meta.badge}`}>{result.provider}</span>
          {ok && <span className="text-caption text-ink-muted font-mono">{result.latencyMs}ms</span>}
        </div>
      </div>
      {ok ? (
        <p className="text-body-sm text-ink leading-relaxed">{result.text}</p>
      ) : (
        <div className="flex items-center gap-2 text-body-sm text-ink-muted italic">
          <AlertTriangle size={14} className="text-yellow-500 shrink-0" />
          Agent unavailable — {result.status === "timeout" ? "response timed out" : "provider error"}
        </div>
      )}
    </div>
  );
}

function SynthesisPanel({ synthesis }: { synthesis: DebateSynthesis }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-md space-y-sm animate-slide-up">
      <h3 className="text-body-sm font-semibold text-ink flex items-center gap-2">
        <CheckCircle size={15} className="text-semantic-success" /> Consensus Analysis
        <span className="ml-auto text-caption text-ink-muted font-normal font-mono">Groq Llama 3.1 8B</span>
      </h3>
      <p className="text-body-sm text-ink italic border-l-2 border-accent-blue pl-3 leading-relaxed">
        &ldquo;{synthesis.consensus}&rdquo;
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-sm text-caption">
        <div className="bg-green-50 border border-green-100 rounded-xl p-sm">
          <p className="text-green-700 font-semibold mb-1.5 flex items-center gap-1"><CheckCircle size={11} /> Agreements</p>
          <ul className="space-y-1.5">
            {synthesis.agreements.map((a, i) => <li key={i} className="text-ink-muted leading-relaxed">• {a}</li>)}
          </ul>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-sm">
          <p className="text-red-600 font-semibold mb-1.5 flex items-center gap-1"><XCircle size={11} /> Contradictions</p>
          <ul className="space-y-1.5">
            {synthesis.contradictions.map((c, i) => <li key={i} className="text-ink-muted leading-relaxed">• {c}</li>)}
          </ul>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-sm">
          <p className="text-amber-600 font-semibold mb-1.5 flex items-center gap-1"><HelpCircle size={11} /> Missing Angles</p>
          <ul className="space-y-1.5">
            {synthesis.missingPerspectives.map((m, i) => <li key={i} className="text-ink-muted leading-relaxed">• {m}</li>)}
          </ul>
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
          <div key={i} className="flex items-start gap-2 text-caption p-2 rounded-xl bg-surface-2">
            <span className="mt-0.5 shrink-0">
              {fc.verified === true ? <CheckCircle size={12} className="text-semantic-success" />
               : fc.verified === false ? <XCircle size={12} className="text-red-500" />
               : <HelpCircle size={12} className="text-ink-muted" />}
            </span>
            <span className="text-ink-muted leading-relaxed flex-1">{fc.claim}</span>
            {fc.source && <span className="shrink-0 text-ink-muted italic">{fc.source}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

const FOLLOW_UP_COLORS: Record<FollowUpQuestion["category"], string> = {
  "Deeper Dive":           "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Related Topic":         "bg-purple-50 text-purple-700 border-purple-200",
  "Practical Application": "bg-teal-50 text-teal-700 border-teal-200",
};

function FollowUpPanel({ questions, onSelect }: { questions: FollowUpQuestion[]; onSelect: (q: string) => void }) {
  if (!questions.length) return null;
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-md space-y-sm animate-slide-up">
      <h3 className="text-body-sm font-semibold text-ink flex items-center gap-2">
        <Lightbulb size={14} className="text-yellow-500" /> Explore Further
      </h3>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <button key={i} onClick={() => onSelect(q.question)}
            className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-surface-2 hover:bg-surface-1 border border-hairline hover:border-accent-blue transition-all group">
            <span className={`mt-0.5 shrink-0 text-caption px-2 py-0.5 rounded-full border ${FOLLOW_UP_COLORS[q.category]}`}>{q.category}</span>
            <span className="text-body-sm text-ink-muted group-hover:text-ink transition-colors">{q.question}</span>
            <ArrowRight size={13} className="shrink-0 mt-0.5 ml-auto text-ink-muted group-hover:text-accent-blue transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

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
        <div className="max-w-7xl mx-auto px-6 py-[42px] space-y-[42px]">
          <div className="max-w-2xl mx-auto space-y-3 text-center">
            <div className="h-8 w-48 bg-surface-2 rounded-xl mx-auto animate-pulse" />
            <div className="h-4 w-80 bg-surface-2 rounded mx-auto animate-pulse" />
          </div>
          <div className="max-w-2xl mx-auto h-12 bg-surface-2 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
            {[1,2,3,4].map((i) => <div key={i} className="h-32 bg-surface-1 border border-hairline rounded-2xl animate-pulse" />)}
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
  const showPersonas = !loading && !result;

  return (
    <AppShell subtitle={electionMode ? "Election Mode" : "Policy Simulator"}>
      <div className="max-w-7xl mx-auto px-6 py-[42px] space-y-[42px]">

        {/* Page header */}
        <div className="max-w-2xl mx-auto text-center space-y-3">
          <h1 className="text-headline font-semibold text-ink">
            {electionMode ? "Civic Planner" : "Policy Simulator"}
          </h1>
          <p className="text-body-sm text-ink-muted">
            {electionMode
              ? "Ask Indian election experts — 4 AI agents give parallel civic perspectives."
              : "4 AI personas debate any topic in parallel, then synthesise, fact-check, and suggest what to explore next."}
          </p>
          <button
            onClick={() => { setElectionMode((v) => !v); setResult(null); setError(null); setTopic(""); }}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-caption font-medium border transition-all ${
              electionMode
                ? "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
                : "bg-surface-1 text-ink-muted border-hairline hover:border-accent-blue hover:text-ink"
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${electionMode ? "bg-orange-500" : "bg-surface-2 border border-hairline"}`} />
            🗳️ Election Mode
          </button>
        </div>

        {/* Input bar */}
        <div className="max-w-2xl mx-auto space-y-sm">
          <div className="flex gap-3">
            <input value={topic} onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleDebate(); }}
              placeholder={electionMode ? "Ask about voting, elections, schemes…" : "Enter a policy topic to debate…"}
              className="flex-1 bg-surface-1 border border-hairline rounded-2xl px-md py-sm text-body text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-accent-blue transition-all" />
            <button onClick={() => void handleDebate()} disabled={loading || !topic.trim()}
              className="px-md py-sm rounded-2xl bg-primary hover:opacity-90 disabled:opacity-40 text-on-primary font-semibold text-body-sm transition-all flex items-center gap-2 whitespace-nowrap">
              {loading ? <><Spinner /> Debating…</> : <><Play size={13} /> Simulate</>}
            </button>
          </div>

          {/* Election mode extras */}
          {electionMode && (
            <div className="flex flex-wrap items-center gap-3">
              <select value={stateVal} onChange={(e) => setStateVal(e.target.value)}
                className="bg-surface-1 border border-hairline rounded-xl px-sm py-1.5 text-caption text-ink focus:outline-none focus:border-accent-blue transition-all">
                <option value="">All India</option>
                {["Maharashtra","Delhi","Uttar Pradesh","Tamil Nadu","West Bengal","Karnataka","Gujarat","Rajasthan","Bihar","Andhra Pradesh"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-caption text-ink-muted cursor-pointer select-none">
                <input type="checkbox" checked={firstTimeVoter} onChange={(e) => setFTV(e.target.checked)}
                  className="w-4 h-4 accent-accent-blue rounded" />
                First-time voter
              </label>
            </div>
          )}

          {/* Example topic chips */}
          <div className="flex flex-wrap gap-2 justify-center">
            {examples.map((t) => (
              <button key={t} onClick={() => void handleDebate(t)}
                disabled={loading}
                className="text-caption px-3 py-1.5 rounded-full bg-surface-1 border border-hairline text-ink-muted hover:text-ink hover:border-accent-blue disabled:opacity-40 transition-all">
                {t.length > 55 ? t.slice(0, 55) + "…" : t}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-2xl p-sm text-body-sm text-red-700 flex items-center gap-2 animate-slide-up">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Agent personas — shown before any debate runs */}
        {showPersonas && (
          <div className="space-y-sm">
            <div className="flex items-center justify-between">
              <p className="text-caption font-semibold text-ink-muted uppercase tracking-widest">Meet the Agents</p>
              <span className="text-caption text-ink-muted">All 4 debate in parallel</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
              {AGENT_ORDER.map((a) => <AgentPersonaCard key={a} agent={a} />)}
            </div>

            {/* How it works */}
            <div className="rounded-2xl border border-hairline bg-surface-1 p-md">
              <p className="text-caption font-semibold text-ink-muted uppercase tracking-widest mb-sm">How it works</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-sm text-caption">
                <div className="flex flex-col gap-1.5">
                  <span className="w-6 h-6 rounded-lg bg-surface-2 border border-hairline flex items-center justify-center text-ink-muted font-mono text-xs">1</span>
                  <p className="font-medium text-ink">Enter a topic</p>
                  <p className="text-ink-muted leading-relaxed">Any policy question, civic issue, or election topic you want explored from multiple angles.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="w-6 h-6 rounded-lg bg-surface-2 border border-hairline flex items-center justify-center text-ink-muted font-mono text-xs">2</span>
                  <p className="font-medium text-ink">4 agents respond</p>
                  <p className="text-ink-muted leading-relaxed">Professor, Activist, Journalist, and Citizen each respond in parallel using different AI models.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="w-6 h-6 rounded-lg bg-surface-2 border border-hairline flex items-center justify-center text-ink-muted font-mono text-xs">3</span>
                  <p className="font-medium text-ink">Synthesis + fact-check</p>
                  <p className="text-ink-muted leading-relaxed">A fifth model synthesises agreements, contradictions, and suggests follow-up questions.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading — agent skeletons */}
        {loading && (
          <div className="space-y-sm">
            <p className="text-caption text-ink-muted">Running 4 agents in parallel…</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
              {AGENT_ORDER.map((a) => <AgentLoadingCard key={a} agent={a} />)}
            </div>
            <div className="rounded-2xl border border-hairline bg-surface-1 p-sm flex items-center gap-3 text-body-sm text-ink-muted">
              <Spinner /> Running synthesis pipeline (Groq · Gemini · Cerebras)…
            </div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-sm animate-slide-up">
            {/* Meta bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-caption text-ink-muted mb-0.5">Topic</p>
                <p className="text-body-sm font-medium text-ink">{result.topic}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-caption text-ink-muted">
                <span className="flex items-center gap-1"><Zap size={11} /> Fastest: <strong className="text-ink">{result.modelPerformance.fastestProvider}</strong></span>
                <span className="flex items-center gap-1"><Timer size={11} /> Avg: <strong className="text-ink">{result.modelPerformance.avgLatencyMs}ms</strong></span>
                <span><strong className="text-semantic-success">{result.modelPerformance.successCount}</strong> / <strong className="text-red-500">{result.modelPerformance.failureCount}</strong> agents</span>
              </div>
            </div>

            {/* Agent response cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
              {AGENT_ORDER.map((agent) => {
                const r = result.agents.find((a) => a.agent === agent);
                return r ? <AgentResultCard key={agent} result={r} /> : null;
              })}
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
