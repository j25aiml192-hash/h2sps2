"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import type { AgentMetrics, DailyRollup, CostSavingsReport, ABExperiment } from "@/lib/model-analytics-types";
import type { ProviderName } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────
interface ProviderHealth { healthy: boolean; circuitOpen: boolean; latencyMs?: number }
interface HealthData { providers: Record<ProviderName, ProviderHealth> }
interface MetricsData {
  agents: AgentMetrics[];
  trend: DailyRollup[];
  costSavings: CostSavingsReport;
  abExperiments: ABExperiment[];
  usingDemoData: boolean;
}

// ── Constants ─────────────────────────────────────────────────
const PROVIDER_COLORS: Record<string, string> = {
  groq:"#f97316", gemini:"#3b82f6", cerebras:"#a855f7", together:"#22c55e", nim:"#eab308",
};
const AGENT_COLORS: Record<string, string> = {
  professor:"#6366f1", activist:"#ef4444", journalist:"#f59e0b", citizen:"#10b981",
};
const AGENT_ICONS: Record<string, string> = {
  professor:"🎓", activist:"✊", journalist:"📰", citizen:"🏘️",
};
const PROVIDERS: ProviderName[] = ["groq","gemini","cerebras","together","nim"];

// ── Small helpers ─────────────────────────────────────────────
function Chip({ label, color="bg-slate-800 text-slate-400" }: { label:string; color?:string }) {
  return <span className={`text-[10px] px-2 py-0.5 rounded-full ${color}`}>{label}</span>;
}

function StatCard({ label, value, sub, accent="text-white" }: { label:string; value:string; sub?:string; accent?:string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  );
}

// ── Provider health row ───────────────────────────────────────
function ProviderRow({ name, health }: { name: ProviderName; health?: ProviderHealth }) {
  const dot = health?.circuitOpen ? "bg-red-400" : health?.healthy ? "bg-emerald-400" : "bg-slate-600";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-800/60 last:border-0">
      <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
      <span className="text-sm text-slate-300 capitalize w-24">{name}</span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: health?.healthy ? "100%" : "0%" }} />
      </div>
      <span className="text-xs text-slate-600 w-20 text-right font-mono">
        {health?.latencyMs ? `${health.latencyMs}ms` : health?.healthy ? "healthy" : "offline"}
      </span>
      <Chip label={health?.circuitOpen ? "OPEN" : "CLOSED"} color={health?.circuitOpen ? "bg-red-900/40 text-red-400" : "bg-emerald-900/30 text-emerald-400"} />
    </div>
  );
}

// ── Agent perf card ───────────────────────────────────────────
function AgentCard({ m, onRate }: { m: AgentMetrics; onRate: (id:string, r:number) => void }) {
  const color = AGENT_COLORS[m.agentId] ?? "#6366f1";
  const topModel = Object.entries(m.modelUsage).sort((a,b)=>b[1]-a[1])[0];
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">{AGENT_ICONS[m.agentId]}</span>
        <span className="text-sm font-semibold text-white capitalize">{m.agentId}</span>
        <span className="ml-auto text-xs text-slate-500 font-mono">{m.totalDebates.toLocaleString()} debates</span>
      </div>
      {/* Metric pills */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label:"Avg Latency", value:`${m.avgLatencyMs}ms` },
          { label:"Success",     value:`${Math.round(m.successRate*100)}%` },
          { label:"Fallback",    value:`${Math.round(m.fallbackRate*100)}%` },
        ].map(({label,value}) => (
          <div key={label} className="bg-slate-800/60 rounded-xl py-2">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-sm font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
      {/* Primary model */}
      <div className="text-xs text-slate-500">
        Primary: <span className="text-slate-300 font-mono">{topModel?.[0] ?? "–"}</span>
        <span className="ml-1 text-slate-600">({topModel?.[1] ?? 0}%)</span>
      </div>
      {/* Model usage bar */}
      <div className="space-y-1">
        {Object.entries(m.modelUsage).map(([model, pct]) => (
          <div key={model} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 w-40 truncate">{model}</span>
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width:`${pct}%`, background: color }} />
            </div>
            <span className="text-[10px] text-slate-600 w-8 text-right">{pct}%</span>
          </div>
        ))}
      </div>
      {/* Star rating */}
      <div className="flex items-center gap-1">
        {[1,2,3,4,5].map((s) => (
          <button key={s} onClick={() => onRate(m.agentId, s)}
            className={`text-lg leading-none transition-transform hover:scale-125 ${s<=Math.round(m.userRating)?"text-yellow-400":"text-slate-700"}`}>
            ★
          </button>
        ))}
        <span className="ml-1 text-xs text-slate-500">{m.userRating > 0 ? m.userRating.toFixed(1) : "–"}/5</span>
      </div>
    </div>
  );
}

// ── A/B experiment row ────────────────────────────────────────
function ABRow({ exp }: { exp: ABExperiment }) {
  const variants = (["control","variantA","variantB"] as const).filter(v => exp.metrics[v].requests > 0);
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-white">{exp.name}</span>
        <Chip label={exp.status} color={exp.status==="running"?"bg-emerald-900/40 text-emerald-300":"bg-slate-800 text-slate-400"} />
        {exp.winner && <Chip label={`Winner: ${exp.winner}`} color="bg-indigo-900/40 text-indigo-300" />}
      </div>
      <p className="text-xs text-slate-500">{exp.description}</p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {variants.map(v => {
          const m = exp.metrics[v];
          return (
            <div key={v} className="bg-slate-800/60 rounded-xl p-2 space-y-1">
              <p className="font-semibold text-slate-300 capitalize">{v}</p>
              <p className="text-slate-500">n={m.requests}</p>
              <p className="text-slate-500">{m.avgLatencyMs.toFixed(0)}ms</p>
              <p className="text-slate-500">Q:{(m.avgQualityScore*100).toFixed(0)}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function AdminModelsPage() {
  const [metrics, setMetrics]   = useState<MetricsData | null>(null);
  const [health, setHealth]     = useState<HealthData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"overview"|"agents"|"abtests"|"costs">("overview");

  const fetchAll = useCallback(async () => {
    const [mRes, hRes] = await Promise.allSettled([
      fetch("/api/admin/metrics").then(r=>r.json()) as Promise<MetricsData>,
      fetch("/api/health").then(r=>r.json()) as Promise<HealthData>,
    ]);
    if (mRes.status==="fulfilled") setMetrics(mRes.value);
    if (hRes.status==="fulfilled") setHealth(hRes.value);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchAll(); const t = setInterval(fetchAll, 30_000); return ()=>clearInterval(t); }, [fetchAll]);

  async function submitRating(agentId: string, rating: number) {
    await fetch("/api/admin/metrics", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ agentId, rating }),
    }).catch(()=>{});
    setMetrics(prev => prev ? {
      ...prev,
      agents: prev.agents.map(a => a.agentId===agentId ? {...a, userRating: rating, ratingCount: a.ratingCount+1} : a)
    } : prev);
  }

  const cs = metrics?.costSavings;

  // Radar data
  const radarData = (metrics?.agents ?? []).map(a => ({
    agent: a.agentId,
    speed:    Math.round((1 - Math.min(a.avgLatencyMs, 3000)/3000)*100),
    success:  Math.round(a.successRate*100),
    debates:  Math.min(Math.round(a.totalDebates/15), 100),
    rating:   Math.round(a.userRating*20),
  }));

  const TABS = ["overview","agents","abtests","costs"] as const;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="border-b border-slate-800/60 bg-[#0d0d18]/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm">AI</a>
            <div>
              <h1 className="text-base font-semibold text-white">Model Analytics</h1>
              <p className="text-xs text-slate-500">Real-time provider health · Agent metrics · A/B testing</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {metrics?.usingDemoData && <Chip label="Demo data" color="bg-amber-900/40 text-amber-400" />}
            <a href="/dashboard" className="text-xs text-slate-500 hover:text-white transition-colors">← Dashboard</a>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1 pb-3">
          {TABS.map(t => (
            <button key={t} onClick={()=>setTab(t)}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-all capitalize ${tab===t?"bg-indigo-600 text-white":"text-slate-500 hover:text-white hover:bg-slate-800"}`}>
              {t === "abtests" ? "A/B Tests" : t}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── OVERVIEW ─────────────────────────────────────── */}
        {!loading && tab==="overview" && (
          <div className="space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Debates"      value={(metrics?.agents.reduce((s,a)=>s+a.totalDebates,0)??0).toLocaleString()} sub="All agents combined" />
              <StatCard label="Avg Success Rate"   value={`${Math.round((metrics?.agents.reduce((s,a)=>s+a.successRate,0)??0)/(metrics?.agents.length||1)*100)}%`} sub="Across all providers" accent="text-emerald-400" />
              <StatCard label="Saved vs Paid APIs" value={`$${cs?.savedUSD.toLocaleString()??0}`} sub="vs GPT-4o equivalent" accent="text-yellow-400" />
              <StatCard label="Active Providers"   value={`${PROVIDERS.filter(p=>health?.providers[p]?.healthy).length}/5`} sub="All circuit-breakers checked" accent="text-indigo-400" />
            </div>

            {/* Provider health */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Provider Health (live)</h2>
              {PROVIDERS.map(p => <ProviderRow key={p} name={p} health={health?.providers[p]} />)}
            </div>

            {/* Daily trend */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Request Trend (7 days)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={metrics?.trend ?? []}>
                  <defs>
                    <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                  <XAxis dataKey="date" tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v.slice(5)}/>
                  <YAxis tick={{fill:"#64748b",fontSize:11}}/>
                  <Tooltip contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,fontSize:12}}/>
                  <Area type="monotone" dataKey="totalRequests" stroke="#6366f1" fill="url(#tg)" strokeWidth={2} name="Requests"/>
                  <Area type="monotone" dataKey="totalDebates"  stroke="#a855f7" fill="none"        strokeWidth={2} name="Debates" strokeDasharray="4 2"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Agent radar */}
            {radarData.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Agent Comparison Radar</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e293b"/>
                    <PolarAngleAxis dataKey="agent" tick={{fill:"#94a3b8",fontSize:12}}/>
                    <Radar name="Speed"   dataKey="speed"   stroke="#6366f1" fill="#6366f1" fillOpacity={0.15}/>
                    <Radar name="Success" dataKey="success" stroke="#10b981" fill="#10b981" fillOpacity={0.15}/>
                    <Radar name="Rating"  dataKey="rating"  stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15}/>
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── AGENTS ───────────────────────────────────────── */}
        {!loading && tab==="agents" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(metrics?.agents??[]).map(a=>(
                <AgentCard key={a.agentId} m={a} onRate={submitRating}/>
              ))}
            </div>
            {/* Latency bar chart */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Avg vs P95 Latency (ms)</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={(metrics?.agents??[]).map(a=>({name:a.agentId,avg:a.avgLatencyMs,p95:a.p95LatencyMs}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                  <XAxis dataKey="name" tick={{fill:"#64748b",fontSize:11}}/>
                  <YAxis tick={{fill:"#64748b",fontSize:11}}/>
                  <Tooltip contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,fontSize:12}}/>
                  <Bar dataKey="avg" fill="#6366f1" name="Avg" radius={[4,4,0,0]}/>
                  <Bar dataKey="p95" fill="#ef4444" name="P95" radius={[4,4,0,0]} fillOpacity={0.5}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── A/B TESTS ─────────────────────────────────────── */}
        {!loading && tab==="abtests" && (
          <div className="space-y-4">
            {(metrics?.abExperiments??[]).length===0 ? (
              <div className="text-center py-16 text-slate-600">
                <p className="text-4xl mb-4">🧪</p>
                <p className="text-sm">No experiments yet.</p>
                <p className="text-xs mt-1">POST to /api/admin/ab-test to create one.</p>
              </div>
            ) : (
              (metrics?.abExperiments??[]).map(e=><ABRow key={e.experimentId} exp={e}/>)
            )}
            {/* Allocation example card */}
            <div className="bg-slate-900/60 border border-indigo-800/40 rounded-2xl p-5 space-y-2">
              <h3 className="text-xs font-semibold text-indigo-300">Create an experiment (API example)</h3>
              <pre className="text-[11px] text-slate-400 overflow-x-auto bg-slate-800/60 rounded-xl p-3">{`POST /api/admin/ab-test
{
  "experimentId": "speed_test_v1",
  "name": "Fastest Models for Citizen Agent",
  "allocation": { "control": 80, "variantA": 10, "variantB": 10 },
  "agentOverrides": {
    "variantA": { "citizen": { "provider":"cerebras","model":"llama3.1-70b" } }
  }
}`}</pre>
            </div>
          </div>
        )}

        {/* ── COST SAVINGS ──────────────────────────────────── */}
        {!loading && tab==="costs" && cs && (
          <div className="space-y-6">
            {/* Hero */}
            <div className="rounded-2xl bg-gradient-to-br from-yellow-900/30 to-amber-900/20 border border-yellow-800/40 p-8 text-center space-y-3">
              <p className="text-slate-400 text-sm">Estimated savings vs equivalent paid APIs</p>
              <p className="text-6xl font-black text-yellow-400">${cs.savedUSD.toLocaleString()}</p>
              <p className="text-slate-500 text-xs">across {cs.totalDebates.toLocaleString()} debates · {cs.totalAgentCalls.toLocaleString()} agent calls</p>
              <div className="flex justify-center gap-4 text-xs text-slate-500 mt-2">
                <span>{(cs.estimatedInputTokens/1_000_000).toFixed(1)}M input tokens</span>
                <span>{(cs.estimatedOutputTokens/1_000_000).toFixed(1)}M output tokens</span>
              </div>
            </div>

            {/* Per-agent breakdown */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Savings by Agent</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={Object.entries(cs.breakdown).map(([k,v])=>({agent:k,saved:parseFloat(v.toFixed(2))}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                  <XAxis dataKey="agent" tick={{fill:"#64748b",fontSize:11}}/>
                  <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>`$${v}`}/>
                  <Tooltip contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,fontSize:12}} formatter={v=>[`$${v}`,"Saved"]}/>
                  <Bar dataKey="saved" radius={[6,6,0,0]}>
                    {Object.keys(cs.breakdown).map((k,i)=>(
                      <Cell key={i} fill={AGENT_COLORS[k]??"#6366f1"}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Comparison table */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/60">
                  <tr>{["Agent","Our Model (Free)","Equivalent Paid","Saved"].map(h=>(
                    <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {Object.entries(cs.breakdown).map(([agent, saved])=>{
                    const equivMap: Record<string,string> = {professor:"GPT-4o ($2.50/1M)",activist:"Claude 3.5 ($3/1M)",journalist:"GPT-4o ($2.50/1M)",citizen:"GPT-3.5 ($0.50/1M)"};
                    const modelMap: Record<string,string> = {professor:"Groq Llama 70B",activist:"Gemini Flash",journalist:"Cerebras Llama 70B",citizen:"Together Mistral 7B"};
                    return (
                      <tr key={agent} className="border-t border-slate-800/60">
                        <td className="px-4 py-3 text-slate-300 capitalize font-medium">{AGENT_ICONS[agent]} {agent}</td>
                        <td className="px-4 py-3 text-emerald-400">{modelMap[agent]??agent} <span className="text-slate-600">(free)</span></td>
                        <td className="px-4 py-3 text-slate-500">{equivMap[agent]??"-"}</td>
                        <td className="px-4 py-3 text-yellow-400 font-bold">${parseFloat(saved.toFixed(2)).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Provider usage pie */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Provider Distribution</h2>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={PROVIDERS.map(p=>({name:p,value:metrics?.trend.reduce((s,d)=>s+(d.providerBreakdown[p]??0),0)??0}))} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {PROVIDERS.map((p,i)=><Cell key={i} fill={PROVIDER_COLORS[p]??"#64748b"}/>)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {PROVIDERS.map(p=>(
                    <div key={p} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{background:PROVIDER_COLORS[p]}}/>
                      <span className="text-slate-400 capitalize w-20">{p}</span>
                      <span className="text-slate-600 font-mono">{metrics?.trend.reduce((s,d)=>s+(d.providerBreakdown[p]??0),0)??0} req</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
