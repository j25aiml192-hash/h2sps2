"use client";
export const dynamic = "force-dynamic";

import Image from "next/image";
import { useState, useEffect, lazy, Suspense } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Globe, Download, Map as MapIcon, Zap, Database, Lock, TrendingUp, Vote, Table } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { exportToCSV, debateToRows, articlesToRows } from "@/lib/export";
import { gaEvents } from "@/components/GoogleAnalytics";
import { PollingLocationFinder } from "@/components/PollingLocationFinder";

// Lazy-load map to avoid SSR
const MapWidget = lazy(() => import("@/components/MapWidget").then((m) => ({ default: m.MapWidget })));

// ── Types ─────────────────────────────────────────────────────
interface TranslateResult { translatedText: string; provider: string }

// ── Demo data (replaced by Firestore queries in production) ───
const DEBATE_TREND = [
  { day: "Mon", debates: 3, voice: 1 },
  { day: "Tue", debates: 7, voice: 2 },
  { day: "Wed", debates: 4, voice: 3 },
  { day: "Thu", debates: 9, voice: 4 },
  { day: "Fri", debates: 12, voice: 6 },
  { day: "Sat", debates: 8, voice: 3 },
  { day: "Sun", debates: 15, voice: 8 },
];
const PROVIDER_USAGE = [
  { name: "Groq",     value: 42, color: "#f97316" },
  { name: "Gemini",   value: 28, color: "#3b82f6" },
  { name: "Cerebras", value: 14, color: "#a855f7" },
  { name: "Together", value: 10, color: "#22c55e" },
  { name: "NIM",      value: 6,  color: "#eab308" },
];
const NEWS_SCORES = [
  { category: "Scheme",        avg: 0.82 },
  { category: "Rule Change",   avg: 0.76 },
  { category: "Analysis",      avg: 0.61 },
  { category: "Timeline",      avg: 0.54 },
  { category: "Result",        avg: 0.48 },
];

const DEMO_DEBATES = [
  { debateId: "d1", topic: "EVM security concerns", createdAt: "2026-05-01", professor: "Data shows...", activist: "Citizens demand...", journalist: "Sources confirm...", citizen: "I believe...", consensus: "Transparency needed" },
  { debateId: "d2", topic: "Voter ID deadline changes", createdAt: "2026-05-02", professor: "Legally...", activist: "Rights matter...", journalist: "ECI stated...", citizen: "Confusing...", consensus: "Clarity required" },
];

// ── Indian languages for translation demo ─────────────────────
const LANGUAGES = [
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "ta", label: "தமிழ் (Tamil)" },
  { code: "te", label: "తెలుగు (Telugu)" },
  { code: "mr", label: "मराठी (Marathi)" },
  { code: "bn", label: "বাংলা (Bengali)" },
  { code: "gu", label: "ગુજરાતી (Gujarati)" },
];

// ── Civic search component ────────────────────────────────────
function CivicSearch() {
  return <PollingLocationFinder />;
}

// ── Translation panel ─────────────────────────────────────────
function MultilingualEngine() {
  const [text, setText]         = useState("Democracy requires informed citizens who actively participate in governance.");
  const [target, setTarget]     = useState("hi");
  const [result, setResult]     = useState<TranslateResult | null>(null);
  const [loading, setLoading]   = useState(false);

  async function translate() {
    if (!text.trim()) return;
    setLoading(true);
    gaEvents.translationUsed(`en-${target}`);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: "en", target }),
      });
      const data = await res.json() as TranslateResult;
      setResult(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-md space-y-sm">
      <div className="flex items-center gap-2">
        <Globe className="text-accent-blue" size={24} />
        <h3 className="text-body font-semibold text-ink">Multilingual Engine</h3>
        <span className="ml-auto text-micro text-ink bg-surface-2 px-2 py-0.5 rounded-pill">100% Free</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
        className="w-full bg-surface-2 border border-hairline rounded-md px-[14px] py-[10px] text-body text-ink resize-none focus:outline-none focus:ring-1 focus:ring-accent-blue" />
      <div className="flex gap-2">
        <select value={target} onChange={(e) => setTarget(e.target.value)}
          className="flex-1 bg-surface-2 border border-hairline rounded-md px-[14px] py-[10px] text-body text-ink focus:outline-none focus:ring-1 focus:ring-accent-blue">
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        <button onClick={() => void translate()} disabled={loading}
          className="px-[15px] py-[10px] rounded-pill bg-primary text-on-primary text-button disabled:opacity-40 transition-all">
          {loading ? "…" : "Translate"}
        </button>
      </div>
      {result && (
        <div className="bg-surface-2 rounded-xl p-[15px] space-y-2">
          <p className="text-body text-ink leading-relaxed">{result.translatedText}</p>
          <p className="text-micro text-ink-muted">via {result.provider}</p>
        </div>
      )}
    </div>
  );
}

// ── Export panel ──────────────────────────────────────────────
function DataExport({ user }: { user: { getIdToken?: () => Promise<string> } | null }) {
  const [exporting, setExporting] = useState<string | null>(null);

  async function handleCSV(type: "debates" | "articles") {
    setExporting(type);
    gaEvents.exportUsed("csv");
    const { headers, rows } = type === "debates"
      ? debateToRows(DEMO_DEBATES)
      : articlesToRows([]);
    exportToCSV(rows, headers, `${type}-${Date.now()}.csv`);
    setTimeout(() => setExporting(null), 1000);
  }

  async function handleSheets(type: "debates" | "articles") {
    if (!user) { alert("Please sign in to export to Google Sheets"); return; }
    setExporting(`sheets-${type}`);
    gaEvents.exportUsed("google_sheets");
    try {
      // Requires Sheets scope — prompt re-auth if needed
      const { exportToSheets, debateToRows: d2r } = await import("@/lib/export");
      const token = await (user as { getIdToken: () => Promise<string> }).getIdToken?.();
      if (!token) throw new Error("No auth token");
      const { headers, rows } = d2r(DEMO_DEBATES);
      const today = new Date().toISOString().split('T')[0];
      const result = await exportToSheets(rows, headers, `Debates Export ${today}`, token);
      window.open(result.spreadsheetUrl, "_blank");
    } catch (e) { alert((e as Error).message); }
    finally { setExporting(null); }
  }

  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-md space-y-sm">
      <div className="flex items-center gap-2">
        <Download className="text-gradient-orange" size={24} />
        <h3 className="text-body font-semibold text-ink">Data & Reporting</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(["debates", "articles"] as const).map((type) => (
          <div key={type} className="space-y-2">
            <p className="text-body-sm text-ink-muted capitalize font-medium">{type}</p>
            <button onClick={() => void handleCSV(type)} disabled={!!exporting}
              className="w-full flex items-center justify-center gap-2 py-[10px] rounded-pill bg-surface-2 hover:bg-hairline text-ink border border-hairline text-button transition-all disabled:opacity-40">
              {exporting === type ? <span className="animate-spin-slow">⏳</span> : <Download size={16} />} CSV (free)
            </button>
            <button onClick={() => void handleSheets(type)} disabled={!!exporting}
              className="w-full flex items-center justify-center gap-2 py-[10px] rounded-pill bg-gradient-orange hover:opacity-90 text-ink text-button transition-all disabled:opacity-40">
              {exporting === `sheets-${type}` ? <span className="animate-spin-slow">⏳</span> : <Table size={16} />} Google Sheets
            </button>
          </div>
        ))}
      </div>
      {!user && <p className="text-micro text-ink-muted">Sign in to enable Google Sheets export</p>}
    </div>
  );
}

// ── Auth button ───────────────────────────────────────────────
function AuthButton() {
  const { user, loading, login, logout } = useAuth();

  if (loading) return <div className="w-8 h-8 rounded-full bg-surface-2 animate-pulse" />;

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {user.photoURL && <Image src={user.photoURL} alt="avatar" width={28} height={28} className="rounded-full" />}
        <span className="text-body-sm text-ink-muted hidden sm:block">{user.displayName}</span>
        <button onClick={() => void logout()}
          className="px-[15px] py-[10px] rounded-pill bg-surface-1 text-ink hover:bg-surface-2 transition-all text-button border border-hairline">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => void login()}
      className="flex items-center gap-2 px-[15px] py-[10px] rounded-pill bg-primary hover:opacity-90 text-on-primary transition-all text-button">
      <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Sign in with Google
    </button>
  );
}

// ── Dashboard page ────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([78.9629, 20.5937]);

  useEffect(() => {
    setMounted(true);
    // Detect user location for map (browser-only, after mount)
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setMapCenter([pos.coords.longitude, pos.coords.latitude]),
        () => { /* use default India center */ }
      );
    }
  }, []);

  // ── Before hydration: render a static skeleton that matches server output exactly
  if (!mounted) {
    return (
      <div className="min-h-screen bg-canvas text-ink">
        <header className="bg-canvas sticky top-0 z-40 h-[56px] flex items-center border-b border-hairline">
          <div className="w-full max-w-[1200px] mx-auto px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-1 border border-hairline" />
              <div className="h-4 w-40 bg-surface-2 rounded animate-pulse" />
            </div>
            <div className="w-8 h-8 rounded-full bg-surface-2 animate-pulse" />
          </div>
        </header>
        <main className="max-w-[1200px] mx-auto px-6 py-[96px]">
          <div className="h-16 w-64 bg-surface-2 rounded-xl animate-pulse mb-[68px]" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 h-72 bg-surface-1 rounded-xl animate-pulse border border-hairline" />
            <div className="h-72 bg-surface-1 rounded-xl animate-pulse border border-hairline" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Header */}
      <header className="bg-canvas sticky top-0 z-40 h-[56px] flex items-center border-b border-hairline">
        <div className="w-full max-w-[1200px] mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="w-8 h-8 rounded-full bg-surface-1 flex items-center justify-center text-body-sm font-bold border border-hairline">AI</a>
            <div>
              <h1 className="text-body-sm font-semibold">Analytics Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex gap-2">
              {[{href:"/",label:"AI Assistant"},{href:"/debate",label:"Policy Simulator"},{href:"/news",label:"Intelligence Feed"},{href:"/voice",label:"Voice Commands"}].map(({href,label})=>(
                <a key={href} href={href} className="px-3 py-1.5 rounded-pill text-body-sm text-ink-muted hover:text-ink hover:bg-surface-1 transition-all">{label}</a>
              ))}
            </nav>
            {/* Gate auth button: server renders placeholder, client renders real auth state */}
            {mounted ? <AuthButton /> : <div className="w-8 h-8 rounded-full bg-surface-2 animate-pulse" />}
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-[96px] space-y-[68px]">
        <h2 className="text-display-xl mb-[40px]">Dashboard.</h2>
        {/* Google services badge row */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Gemini 2.0 Flash", icon: <Zap size={14} /> },
            { label: "Firebase Firestore", icon: <Database size={14} /> },
            { label: "Firebase Auth", icon: <Lock size={14} /> },
            { label: "Google Analytics 4", icon: <TrendingUp size={14} /> },
            { label: "Civic Information API", icon: <Vote size={14} /> },
          ].map(({ label, icon }) => (
            <span key={label} className="flex items-center gap-1.5 text-body-sm px-3 py-1.5 rounded-pill border border-hairline bg-surface-1 text-ink-muted">
              <span>{icon}</span> {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-body-sm px-3 py-1.5 rounded-pill border border-hairline bg-surface-2 text-ink">Free-tier optimized</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[20px]">
          {/* Debate trend */}
          <div className="lg:col-span-2 rounded-xl border border-hairline bg-surface-1 p-[24px]">
            <p className="text-body-sm font-semibold text-ink-muted mb-[24px]">Debate Activity (7 days) — Recharts</p>
            <div className="h-[240px]">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={DEBATE_TREND}>
                    <defs>
                      <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 13, fontFamily: "var(--font-plus-jakarta)" }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 13, fontFamily: "var(--font-plus-jakarta)" }} />
                    <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 10, fontSize: 14 }} />
                    <Legend wrapperStyle={{ fontSize: 13, color: "#71717a", paddingTop: 10 }} />
                    <Area type="monotone" dataKey="debates" stroke="#2563eb" fill="url(#dg)" strokeWidth={2} />
                    <Area type="monotone" dataKey="voice"   stroke="#c026d3" fill="url(#vg)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-hairline bg-surface-1 p-[24px]">
            <p className="text-body-sm font-semibold text-ink-muted mb-[24px]">AI Provider Usage</p>
            <div className="h-[200px]">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={PROVIDER_USAGE} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                      dataKey="value" paddingAngle={3}>
                      {PROVIDER_USAGE.map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 10, fontSize: 14 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="space-y-[8px] mt-4">
              {PROVIDER_USAGE.map((p) => (
                <div key={p.name} className="flex items-center gap-3 text-body-sm">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="text-ink">{p.name}</span>
                  <span className="ml-auto text-ink-muted">{p.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* News relevance bar chart spotlight */}
        <div className="rounded-xxl bg-gradient-magenta p-[32px]">
          <p className="text-subhead font-medium text-ink mb-[24px]">Avg Relevance Score by Category</p>
          <div className="h-[160px]">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={NEWS_SCORES} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                  <XAxis type="number" domain={[0, 1]} tick={{ fill: "#09090b", fontSize: 13, fontFamily: "var(--font-plus-jakarta)" }} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                  <YAxis dataKey="category" type="category" tick={{ fill: "#09090b", fontSize: 13, fontFamily: "var(--font-plus-jakarta)" }} width={90} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 10, fontSize: 14 }} formatter={(v) => [`${Math.round(Number(v ?? 0) * 100)}%`, "Avg Relevance"]} />
                  <Bar dataKey="avg" fill="#09090b" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Services grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
          <CivicSearch />
          <MultilingualEngine />
        </div>

        {/* Map + Export */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-md">
          <div className="rounded-xl border border-hairline bg-surface-1 p-md space-y-sm">
            <div className="flex items-center gap-2">
              <MapIcon className="text-semantic-success" size={24} />
              <h3 className="text-body font-semibold text-ink">Civic Infrastructure Map</h3>
              <span className="ml-auto text-micro text-ink bg-surface-2 px-2 py-0.5 rounded-pill">No API key</span>
            </div>
            <p className="text-body-sm text-ink-muted">Open-source map with no cost. Click &ldquo;Civic Search&rdquo; to drop polling location pins.</p>
            <Suspense fallback={<div className="h-52 bg-surface-2 rounded-xl animate-pulse" />}>
              <MapWidget center={mapCenter} zoom={5} height="220px"
                markers={[{ lng: mapCenter[0], lat: mapCenter[1], label: "Your location", color: "#2563eb" }]} />
            </Suspense>
          </div>

          <DataExport user={mounted && user ? { getIdToken: () => user.getIdToken() } : null} />
        </div>
      </main>
    </div>
  );
}
