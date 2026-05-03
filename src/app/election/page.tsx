"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AlertTriangle, CheckCircle, Zap, ChevronDown, Users, GraduationCap, Siren, Newspaper, Home } from "lucide-react";
import type { DebateResult, AgentResponse } from "@/lib/election-agents";

const STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana",
  "Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur",
  "Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman & Nicobar","Chandigarh","DNH & DD",
  "Delhi","Jammu & Kashmir","Ladakh","Lakshadweep","Puducherry",
];

const SAMPLE_TOPICS = [
  "How do I check if my name is on the electoral roll?",
  "What is the Model Code of Conduct and when does it apply?",
  "How does NOTA work and does it actually change the result?",
  "Can I vote if I moved to a different city for college or work?",
  "How are EVMs verified for accuracy and security?",
  "What documents do I need to carry on polling day?",
];

const AGENT_ICONS: Record<string, React.ReactNode> = {
  professor:  <GraduationCap size={14} />,
  activist:   <Siren size={14} />,
  journalist: <Newspaper size={14} />,
  citizen:    <Home size={14} />,
};
const AGENT_COLORS: Record<string, { card: string; accent: string }> = {
  professor:  { card: "border-blue-200 bg-blue-50/30",   accent: "text-blue-700" },
  activist:   { card: "border-red-200 bg-red-50/30",     accent: "text-red-700" },
  journalist: { card: "border-amber-200 bg-amber-50/30", accent: "text-amber-700" },
  citizen:    { card: "border-green-200 bg-green-50/30", accent: "text-green-700" },
};

function AgentCard({ r, index }: { r: AgentResponse; index: number }) {
  const [expanded, setExpanded] = useState(index < 2);
  const cfg = AGENT_COLORS[r.agentId] ?? { card: "border-hairline bg-surface-1", accent: "text-ink" };

  return (
    <div className={`rounded-2xl border ${cfg.card} overflow-hidden transition-all`}>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-md py-sm text-left hover:bg-white/60 transition-colors">
        <span className={cfg.accent}>{AGENT_ICONS[r.agentId] ?? <Users size={14} />}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-body-sm font-semibold ${cfg.accent}`}>{r.name}</p>
          <p className="text-caption text-ink-muted">{r.role}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!r.available && <span className="text-caption text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">Offline</span>}
          {r.isFallback  && <span className="text-caption text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Fallback</span>}
          <span className="text-caption text-ink-muted font-mono">{r.latencyMs}ms</span>
          <ChevronDown size={14} className={`text-ink-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>
      {expanded && (
        <div className="px-md pb-md border-t border-hairline">
          <p className="text-body-sm text-ink leading-relaxed whitespace-pre-wrap mt-sm">{r.text}</p>
          <p className="text-caption text-ink-muted mt-2 font-mono">via {r.provider} · {r.latencyMs}ms</p>
        </div>
      )}
    </div>
  );
}

function SynthesisPanel({ synthesis, followUpQuestions, onFollowUp }: {
  synthesis: DebateResult["synthesis"];
  followUpQuestions: DebateResult["followUpQuestions"];
  onFollowUp: (q: string) => void;
}) {
  return (
    <div className="space-y-sm">
      <div className="rounded-2xl border border-hairline bg-surface-1 p-md space-y-sm">
        <h3 className="text-body-sm font-semibold text-ink flex items-center gap-2">
          <CheckCircle size={14} className="text-green-600" /> AI Synthesis
        </h3>
        {synthesis.agreements.length > 0 && (
          <div>
            <p className="text-caption text-green-700 mb-1 font-medium">Points of agreement</p>
            <ul className="space-y-1">{synthesis.agreements.map((a, i) => <li key={i} className="flex gap-2 text-caption text-ink-muted"><CheckCircle size={10} className="text-green-500 mt-0.5 shrink-0" />{a}</li>)}</ul>
          </div>
        )}
        {synthesis.contradictions.length > 0 && (
          <div>
            <p className="text-caption text-amber-700 mb-1 font-medium">Points of debate</p>
            <ul className="space-y-1">{synthesis.contradictions.map((c, i) => <li key={i} className="flex gap-2 text-caption text-ink-muted"><Zap size={10} className="text-amber-500 mt-0.5 shrink-0" />{c}</li>)}</ul>
          </div>
        )}
        {synthesis.consensus && (
          <div className="bg-surface-2 rounded-xl p-sm">
            <p className="text-caption text-ink-muted mb-1">Consensus</p>
            <p className="text-body-sm text-ink leading-relaxed">{synthesis.consensus}</p>
          </div>
        )}
      </div>

      {followUpQuestions.length > 0 && (
        <div className="rounded-2xl border border-hairline bg-surface-1 p-md space-y-2">
          <h3 className="text-body-sm font-semibold text-ink">Explore Further</h3>
          {followUpQuestions.map((fq, i) => (
            <button key={i} onClick={() => onFollowUp(fq.question)}
              className="w-full flex items-start gap-2 text-left text-caption text-ink-muted hover:text-ink bg-surface-2 hover:bg-canvas rounded-xl px-sm py-2 transition-all border border-transparent hover:border-hairline">
              <span className="shrink-0 mt-0.5 text-accent-blue">→</span>
              <span>{fq.question}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ElectionDebatePage() {
  const [topic, setTopic]            = useState("");
  const [state, setState]            = useState("");
  const [firstTimeVoter, setFTVoter] = useState(false);
  const [loading, setLoading]        = useState(false);
  const [result, setResult]          = useState<DebateResult | null>(null);
  const [error, setError]            = useState<string | null>(null);

  async function runDebate(t = topic) {
    if (!t.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res  = await fetch("/api/election/debate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: t, state: state || undefined, isFirstTimeVoter: firstTimeVoter }) });
      const data = await res.json() as DebateResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "API error");
      setResult(data); setTopic(t);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <AppShell subtitle="Civic Planner">
      <div className="max-w-5xl mx-auto px-6 py-[42px] space-y-[42px]">
        <div className="text-center space-y-2">
          <h1 className="text-display font-semibold text-ink">Civic Planner</h1>
          <p className="text-body-sm text-ink-muted">Ask our 4 election experts — get parallel AI perspectives on Indian elections.</p>
        </div>

        {/* Input panel */}
        <div className="rounded-2xl border border-hairline bg-surface-1 p-md space-y-sm">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-caption text-ink-muted">Ask our experts:</span>
            {["Prof. Sharma", "Priya Menon", "Rajesh Kumar", "Amit Patil"].map((n) => (
              <span key={n} className="text-caption text-ink-muted bg-surface-2 px-2 py-0.5 rounded-full border border-hairline">{n}</span>
            ))}
          </div>
          <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void runDebate(); }}
            placeholder="e.g. How do I register as a voter if I moved to a new city?"
            className="w-full bg-surface-2 border border-hairline rounded-xl px-md py-sm text-body text-ink placeholder-ink-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent-blue transition-colors" />
          <div className="flex flex-wrap gap-3 items-center">
            <select value={state} onChange={(e) => setState(e.target.value)}
              className="bg-surface-2 border border-hairline rounded-xl px-sm py-1.5 text-caption text-ink focus:outline-none focus:border-accent-blue">
              <option value="">All India</option>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="flex items-center gap-2 text-caption text-ink-muted cursor-pointer">
              <input type="checkbox" checked={firstTimeVoter} onChange={(e) => setFTVoter(e.target.checked)} className="accent-accent-blue w-3.5 h-3.5" />
              First-time voter
            </label>
            <button onClick={() => void runDebate()} disabled={loading || !topic.trim()}
              className="ml-auto flex items-center gap-2 px-md py-sm rounded-xl bg-primary hover:opacity-90 disabled:opacity-40 text-on-primary text-body-sm font-semibold transition-all">
              {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analysing…</> : "Analyse →"}
            </button>
          </div>
          <div className="space-y-1.5">
            <p className="text-caption text-ink-muted uppercase tracking-widest">Sample questions</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_TOPICS.slice(0, 4).map((q) => (
                <button key={q} onClick={() => { setTopic(q); void runDebate(q); }}
                  className="text-caption text-ink-muted hover:text-ink bg-surface-2 hover:bg-canvas px-2.5 py-1 rounded-lg border border-hairline hover:border-accent-blue transition-all text-left">
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-md py-sm text-body-sm text-red-700 flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {loading && (
          <div className="space-y-sm">
            <div className="rounded-2xl border border-hairline bg-surface-1 p-md space-y-2 animate-pulse">
              <div className="h-3 bg-surface-2 rounded w-1/3" />
              <div className="h-2 bg-surface-2 rounded w-full" />
              <div className="h-2 bg-surface-2 rounded w-4/5" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-hairline bg-surface-1 p-sm animate-pulse">
                <div className="flex gap-3 items-center">
                  <div className="w-10 h-10 bg-surface-2 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 bg-surface-2 rounded w-1/4" />
                    <div className="h-2 bg-surface-2 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {result && !loading && (
          <div className="space-y-md">
            <div className="rounded-2xl border border-hairline bg-surface-1 px-md py-sm flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-caption text-ink-muted">Debate topic</p>
                <p className="text-body-sm text-ink font-medium mt-0.5">{result.topic}</p>
              </div>
              <div className="flex gap-4 text-center shrink-0">
                {[
                  { label: "Agents",      val: `${result.responses.filter((r) => r.available).length}/4` },
                  { label: "Avg latency", val: `${result.modelPerformance.avgLatencyMs}ms` },
                  { label: "Fastest",     val: result.modelPerformance.fastestAgent },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <p className="text-caption text-ink-muted">{label}</p>
                    <p className="text-body-sm font-bold text-ink capitalize">{val}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-sm">
              <div className="space-y-sm">{result.responses.slice(0, 2).map((r, i) => <AgentCard key={r.agentId} r={r} index={i} />)}</div>
              <div className="space-y-sm">{result.responses.slice(2).map((r, i) => <AgentCard key={r.agentId} r={r} index={i + 2} />)}</div>
            </div>
            <SynthesisPanel synthesis={result.synthesis} followUpQuestions={result.followUpQuestions} onFollowUp={(q) => { setTopic(q); void runDebate(q); }} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
