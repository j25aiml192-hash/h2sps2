"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Play, CheckCircle, XCircle, AlertTriangle, ExternalLink,
  GraduationCap, Siren, Newspaper, Home, Bell, ChevronDown, ChevronUp,
} from "lucide-react";
import type { ProcessedArticle, ArticleCategory } from "@/lib/news-types";


interface RunSummary {
  runId: string; totalProcessed: number; totalFailed: number;
  avgPipelineDurationMs?: number; avgLatencyMs?: number; completedAt: string;
  articles?: Omit<ProcessedArticle, "rawText">[];
}
interface DebateLink { found: boolean; debateId?: string; debateTopic?: string; createdAt?: string; }
interface DebateDetail {
  debateId: string; topic: string;
  responses: Record<string, { text: string | null; provider: string; latencyMs: number }>;
  synthesis?: { consensus: string; agreements: string[]; contradictions: string[] };
}

const CAT: Record<ArticleCategory, { badge: string; label: string }> = {
  "Scheme":         { badge: "bg-green-50 text-green-700 border-green-200",   label: "Scheme" },
  "Timeline Event": { badge: "bg-blue-50  text-blue-700  border-blue-200",    label: "Timeline" },
  "Rule Change":    { badge: "bg-amber-50 text-amber-700 border-amber-200",   label: "Rule Change" },
  "Result":         { badge: "bg-purple-50 text-purple-700 border-purple-200",label: "Result" },
  "Analysis":       { badge: "bg-zinc-100 text-zinc-700  border-zinc-200",    label: "Analysis" },
  "Other":          { badge: "bg-zinc-100 text-zinc-600  border-zinc-200",    label: "Other" },
};
const AGENTS = ["professor", "activist", "journalist", "citizen"] as const;
const AGENT_META = {
  professor:  { color: "border-blue-200 bg-blue-50/40" },
  activist:   { color: "border-red-200 bg-red-50/40" },
  journalist: { color: "border-amber-200 bg-amber-50/40" },
  citizen:    { color: "border-green-200 bg-green-50/40" },
};
function AgentIcon({ id, size = 12 }: { id: string; size?: number }) {
  if (id === "professor")  return <GraduationCap size={size} />;
  if (id === "activist")   return <Siren size={size} />;
  if (id === "journalist") return <Newspaper size={size} />;
  return <Home size={size} />;
}
const CATEGORIES: (ArticleCategory | "all")[] = ["all","Scheme","Timeline Event","Rule Change","Result","Analysis"];

function Spinner() { return <span className="inline-block w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin-slow" />; }

function RelevanceMeter({ score }: { score: number }) {
  const pct   = Math.round(score * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-zinc-300";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-caption text-ink-muted w-8 text-right font-mono">{pct}%</span>
    </div>
  );
}

function DebateModal({ debate, onClose }: { debate: DebateDetail; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-hairline bg-canvas shadow-2xl">
        <div className="sticky top-0 bg-canvas/95 backdrop-blur border-b border-hairline px-md py-sm flex items-center justify-between">
          <div>
            <span className="text-caption px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">Live Debate</span>
            <h2 className="text-body-sm font-semibold text-ink mt-1">{debate.topic}</h2>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl transition-colors">✕</button>
        </div>
        <div className="p-md space-y-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
            {AGENTS.map((agent) => {
              const r = debate.responses[agent]; if (!r) return null;
              const m = AGENT_META[agent];
              return (
                <div key={agent} className={`rounded-xl border ${m.color} p-sm`}>
                  <div className="flex items-center gap-2 mb-2"><AgentIcon id={agent} /><span className="text-caption font-semibold text-ink capitalize">{agent}</span><span className="ml-auto text-caption text-ink-muted font-mono">{r.latencyMs}ms</span></div>
                  <p className="text-caption text-ink leading-relaxed">{r.text ?? "No response"}</p>
                </div>
              );
            })}
          </div>
          {debate.synthesis && (
            <div className="rounded-xl border border-hairline bg-surface-1 p-sm">
              <p className="text-caption font-semibold text-ink mb-2 flex items-center gap-1"><CheckCircle size={12} className="text-green-600" /> Consensus</p>
              <p className="text-body-sm text-ink italic">&ldquo;{debate.synthesis.consensus}&rdquo;</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ArticleCard({ article, debateLink, onViewDebate, onTriggerDebate }: {
  article: Omit<ProcessedArticle, "rawText">; debateLink?: DebateLink;
  onViewDebate: (id: string) => void; onTriggerDebate: (articleId: string, title: string) => void;
}) {
  const catStyle = CAT[article.category.value] ?? CAT.Other;
  const [expanded, setExpanded] = useState(false);
  const hasDebate = debateLink?.found;
  const isHighRel = article.relevance.score >= 0.8;
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 overflow-hidden hover:border-accent-blue transition-all">
      <div className="p-md space-y-2">
        <div className="flex items-start gap-2 flex-wrap">
          <span className={`text-caption px-2 py-0.5 rounded-full border ${catStyle.badge}`}>{catStyle.label}</span>
          {hasDebate && <span className="text-caption px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">Live Debate</span>}
          {!hasDebate && isHighRel && <span className="text-caption px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Debate Queued</span>}
          <span className="ml-auto text-caption text-ink-muted">{new Date(article.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
        </div>
        <a href={article.url} target="_blank" rel="noopener noreferrer"
          className="text-body-sm font-medium text-ink hover:text-accent-blue transition-colors line-clamp-2 block flex items-start gap-1">
          {article.title} <ExternalLink size={12} className="shrink-0 mt-0.5 text-ink-muted" />
        </a>
        <p className="text-caption text-ink-muted leading-relaxed">{article.summary.text}</p>
        <div className="flex items-center gap-2 text-caption text-ink-muted flex-wrap">
          <span className="truncate max-w-[140px]">{article.source}</span>
          {article.regional.regions.slice(0, 2).map((r) => <span key={r} className="px-1.5 py-0.5 rounded bg-surface-2 text-ink-muted border border-hairline">{r}</span>)}
          <span className="ml-auto font-mono">{article.pipelineDurationMs}ms</span>
        </div>
        <RelevanceMeter score={article.relevance.score} />
        {article.scheme.isScheme && article.scheme.data && (
          <button onClick={() => setExpanded(!expanded)}
            className="w-full text-caption text-green-700 bg-green-50 border border-green-200 rounded-xl py-1.5 hover:bg-green-100 transition-colors flex items-center justify-center gap-1">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {expanded ? "Hide" : "View"} scheme details
          </button>
        )}
        {expanded && article.scheme.data && (
          <div className="text-caption space-y-1 text-ink-muted bg-green-50 rounded-xl p-sm">
            {article.scheme.data.eligibility.slice(0, 3).map((e, i) => <p key={i}>• {e}</p>)}
            {article.scheme.data.benefitAmount && <p className="text-green-700">Benefit: {article.scheme.data.benefitAmount}</p>}
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          {hasDebate ? (
            <button onClick={() => onViewDebate(debateLink!.debateId!)}
              className="flex-1 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-caption font-medium transition-all">View Live Debate</button>
          ) : isHighRel ? (
            <button onClick={() => onTriggerDebate(article.articleId, article.title)}
              className="flex-1 py-2 rounded-xl bg-surface-2 hover:bg-surface-1 text-ink border border-hairline text-caption font-medium transition-all">Trigger Debate</button>
          ) : null}
          <a href={article.url} target="_blank" rel="noopener noreferrer"
            className="px-3 py-2 rounded-xl bg-surface-2 text-ink-muted hover:text-ink border border-hairline text-caption transition-all flex items-center gap-1">Read <ExternalLink size={10} /></a>
        </div>
      </div>
    </div>
  );
}

export default function NewsPage() {
  const [mounted, setMounted]    = useState(false);
  const [loading, setLoading]    = useState(false);
  const [runResult, setRunResult] = useState<RunSummary | null>(null);
  const [error, setError]        = useState<string | null>(null);
  const [source, setSource]      = useState<"all"|"newsapi"|"rss">("all");
  const [limit, setLimit]        = useState(10);
  const [filterCat, setFilterCat] = useState<ArticleCategory | "all">("all");
  const [filterScheme, setFilterScheme] = useState(false);
  const [sortBy, setSortBy]      = useState<"relevance"|"recency">("relevance");
  const [debateLinks, setDebateLinks] = useState<Record<string, DebateLink>>({});
  const [openDebate, setOpenDebate]   = useState<DebateDetail | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const articles = useMemo(() => runResult?.articles ?? [], [runResult]);

  const checkDebateLinks = useCallback(async (arts: typeof articles) => {
    const highRel = arts.filter((a) => a.relevance.score >= 0.8);
    const checks  = await Promise.allSettled(highRel.map((a) =>
      fetch(`/api/news/auto-debate?articleId=${a.articleId}`, { method: "OPTIONS" })
        .then((r) => r.json() as Promise<DebateLink>).then((link) => ({ id: a.articleId, link }))));
    const map: Record<string, DebateLink> = {};
    for (const r of checks) { if (r.status === "fulfilled") map[r.value.id] = r.value.link; }
    setDebateLinks(map);
  }, []);

  useEffect(() => { if (articles.length > 0) void checkDebateLinks(articles); }, [articles, checkDebateLinks]);

  async function handleRun() {
    if (loading) return;
    setLoading(true); setError(null); setRunResult(null);
    try {
      const res  = await fetch("/api/news/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, limit }) });
      const data = await res.json() as RunSummary & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRunResult(data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function handleTriggerDebate(articleId: string, title: string) {
    setTriggeringId(articleId);
    try {
      await fetch("/api/news/auto-debate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articles: [{ articleId, title, relevance: { score: 0.9 } }] }) });
      setDebateLinks((prev) => ({ ...prev, [articleId]: { found: false } }));
      setTimeout(() => void checkDebateLinks(articles), 3000);
    } catch { /**/ } finally { setTriggeringId(null); }
  }

  async function handleViewDebate(debateId: string) {
    try {
      const res  = await fetch("/api/agents/debate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debateId }) });
      setOpenDebate(await res.json() as DebateDetail);
    } catch { /**/ }
  }

  if (!mounted) {
    return (
      <AppShell subtitle="Intelligence Feed">
        <div className="max-w-7xl mx-auto px-6 py-[42px] space-y-[42px]">
          <div className="h-12 w-72 bg-surface-2 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-sm">
            {[1,2,3,4,5,6].map((i) => <div key={i} className="h-48 bg-surface-2 rounded-2xl animate-pulse" />)}
          </div>
        </div>
      </AppShell>
    );
  }

  const filtered = articles
    .filter((a) => filterCat === "all" || a.category.value === filterCat)
    .filter((a) => !filterScheme || a.scheme.isScheme)
    .sort((a, b) => sortBy === "relevance" ? b.relevance.score - a.relevance.score : new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const schemeCount  = articles.filter((a) => a.scheme.isScheme).length;
  const debatedCount = Object.values(debateLinks).filter((d) => d.found).length;

  const headerRight = debatedCount > 0 ? (
    <span className="text-caption text-red-600 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
      {debatedCount} debates live
    </span>
  ) : undefined;

  return (
    <AppShell subtitle="Intelligence Feed" headerRight={headerRight}>
      {openDebate && <DebateModal debate={openDebate} onClose={() => setOpenDebate(null)} />}

      <div className="max-w-7xl mx-auto px-6 py-[42px] flex gap-md">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 hidden lg:block">
          <div className="sticky top-[76px] space-y-sm">
            <div className="bg-surface-1 border border-hairline rounded-2xl p-sm space-y-2">
              <p className="text-caption font-semibold text-ink-muted uppercase tracking-widest mb-sm">Source</p>
              {(["all","newsapi","rss"] as const).map((s) => (
                <button key={s} onClick={() => setSource(s)}
                  className={`w-full text-left px-sm py-2 rounded-xl text-body-sm transition-all border ${source === s ? "bg-surface-2 text-ink border-hairline" : "text-ink-muted border-transparent hover:border-hairline"}`}>
                  {s === "all" ? "All Sources" : s === "newsapi" ? "NewsAPI" : "RSS Feeds"}
                </button>
              ))}
            </div>
            <div className="bg-surface-1 border border-hairline rounded-2xl p-sm space-y-sm">
              <p className="text-caption font-semibold text-ink-muted uppercase tracking-widest">Limit: {limit}</p>
              <input type="range" min={5} max={50} step={5} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-full accent-accent-blue" />
            </div>
            <div className="bg-surface-1 border border-hairline rounded-2xl p-sm space-y-2">
              <p className="text-caption font-semibold text-ink-muted uppercase tracking-widest mb-sm">Pipeline</p>
              {[["①","gemini-flash","Summary"],["②","llama-8b","Classify"],["③","mistral-7b","Relevance"],["④","llama-70b","Scheme"],["⑤","gemini-flash","Regional"]].map(([n,m,s]) => (
                <div key={n} className="flex items-center justify-between text-caption">
                  <span className="text-ink-muted">{n} {s}</span>
                  <span className="font-mono text-ink-muted bg-surface-2 px-1.5 py-0.5 rounded border border-hairline">{m}</span>
                </div>
              ))}
            </div>
            <div className="bg-red-50 border border-red-200 rounded-2xl p-sm">
              <p className="text-caption font-semibold text-red-700 mb-1">Auto-Debate</p>
              <p className="text-caption text-red-600 leading-relaxed">Articles scoring &gt;0.8 relevance automatically trigger 4-agent debates and push notifications.</p>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 space-y-md">
          <div className="flex items-center gap-md flex-wrap">
            <button onClick={() => void handleRun()} disabled={loading}
              className="px-md py-sm rounded-2xl bg-primary hover:opacity-90 disabled:opacity-40 text-on-primary font-semibold text-body-sm transition-all flex items-center gap-2">
              {loading ? <><Spinner /> Processing…</> : <><Play size={14} /> Run Pipeline</>}
            </button>
            {runResult && (
              <div className="flex items-center gap-3 text-caption text-ink-muted">
                <span className="flex items-center gap-1"><CheckCircle size={12} className="text-green-600" /> <strong className="text-ink">{runResult.totalProcessed}</strong></span>
                {runResult.totalFailed > 0 && <span className="flex items-center gap-1"><XCircle size={12} className="text-red-500" /> <strong className="text-red-600">{runResult.totalFailed}</strong></span>}
                <span>avg <strong className="text-ink">{runResult.avgPipelineDurationMs ?? runResult.avgLatencyMs}ms</strong></span>
              </div>
            )}
            {(typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) && (
              <button className="ml-auto text-caption px-3 py-1.5 rounded-lg border border-hairline bg-surface-1 hover:bg-surface-2 text-ink-muted transition-all flex items-center gap-1">
                <Bell size={12} /> Notify me
              </button>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-sm text-body-sm text-red-700 flex items-center gap-2"><AlertTriangle size={14} /> {error}</div>
          )}

          {articles.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setFilterCat(c)}
                  className={`text-caption px-3 py-1.5 rounded-full border transition-all ${filterCat === c ? "bg-primary text-on-primary border-primary" : "bg-surface-1 text-ink-muted border-hairline hover:text-ink"}`}>
                  {c === "all" ? `All (${articles.length})` : c}
                </button>
              ))}
              <button onClick={() => setFilterScheme(!filterScheme)}
                className={`text-caption px-3 py-1.5 rounded-full border transition-all ${filterScheme ? "bg-green-50 text-green-700 border-green-200" : "bg-surface-1 text-ink-muted border-hairline hover:text-ink"}`}>
                Schemes ({schemeCount})
              </button>
              <div className="ml-auto flex items-center gap-1">
                {(["relevance","recency"] as const).map((s) => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className={`text-caption px-2 py-1 rounded-lg transition-colors capitalize ${sortBy === s ? "text-ink font-semibold" : "text-ink-muted hover:text-ink"}`}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {!loading && articles.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-1 border border-hairline flex items-center justify-center mb-md"><Newspaper size={32} className="text-ink-muted" /></div>
              <h2 className="text-headline font-semibold text-ink mb-2">Ready to process</h2>
              <p className="text-body-sm text-ink-muted max-w-sm">Click &ldquo;Run Pipeline&rdquo; to fetch and process news through 5 AI models. Articles scoring &gt;0.8 relevance will automatically queue a Live Debate.</p>
            </div>
          )}

          <div className="space-y-sm">
            {filtered.map((article) => (
              <ArticleCard key={article.articleId} article={article} debateLink={debateLinks[article.articleId]}
                onViewDebate={handleViewDebate}
                onTriggerDebate={triggeringId === article.articleId ? () => {} : handleTriggerDebate} />
            ))}
          </div>
          {filtered.length === 0 && articles.length > 0 && (
            <div className="text-center py-12 text-ink-muted text-body-sm">No articles match the current filters.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
