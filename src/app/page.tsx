"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import type { Message, ProviderName } from "@/lib/types";
import { VoiceInput }  from "@/components/VoiceInput";
import { VoiceOutput } from "@/components/VoiceOutput";
import { AppShell } from "@/components/AppShell";
import {
  Zap, Sparkles, Brain, Users, Circle,
  SendHorizonal, AlertTriangle,
} from "lucide-react";

// ── Provider badge config ─────────────────────────────────────
const PROVIDER_CONFIG: Record<ProviderName, { color: string; icon: React.ReactNode; label: string }> = {
  groq:     { color: "bg-orange-50  text-orange-700 border-orange-200",  icon: <Zap size={12} />,      label: "Groq"     },
  gemini:   { color: "bg-blue-50    text-blue-700   border-blue-200",    icon: <Sparkles size={12} />, label: "Gemini"   },
  cerebras: { color: "bg-purple-50  text-purple-700 border-purple-200",  icon: <Brain size={12} />,    label: "Cerebras" },
  together: { color: "bg-green-50   text-green-700  border-green-200",   icon: <Users size={12} />,    label: "Together" },
  nim:      { color: "bg-yellow-50  text-yellow-700 border-yellow-200",  icon: <Circle size={12} />,   label: "NIM"      },
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: ProviderName;
  timestamp: Date;
}

interface HealthData {
  status: string;
  providers: Record<ProviderName, { healthy: boolean; circuitOpen: boolean }>;
}

// ── Spinner ───────────────────────────────────────────────────
function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin-slow" />
  );
}

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [health, setHealth]     = useState<HealthData | null>(null);
  const [selectedChain, setSelectedChain] = useState<ProviderName[]>(["groq", "cerebras", "together", "nim", "gemini"]);
  const [voiceListening, setVoiceListening] = useState(false);
  const [mounted, setMounted]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<(text: string) => void>(() => {});

  const handleVoiceTranscript = useCallback((text: string) => {
    setVoiceListening(false);
    submitRef.current(text);
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchHealth() {
    try {
      const res  = await fetch("/api/health");
      const data = await res.json() as HealthData;
      setHealth(data);
    } catch { /* silent */ }
  }

  async function handleSubmit(e: FormEvent | null, overrideText?: string) {
    e?.preventDefault();
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    submitRef.current = (t: string) => void handleSubmit(null, t);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);

    try {
      const res  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })) as Message[],
          options:  { chain: selectedChain },
        }),
      });

      const data = await res.json() as { result: string; usedProvider: ProviderName; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Unknown error");

      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.result,
        provider: data.usedProvider,
        timestamp: new Date(),
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${(err as Error).message}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  function toggleProvider(name: ProviderName) {
    setSelectedChain((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  }

  const allProviders: ProviderName[] = ["groq", "gemini", "cerebras", "together", "nim"];

  // Pre-mount skeleton — avoids hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-canvas">
        <header className="border-b border-hairline h-[60px] bg-canvas" />
        <div className="max-w-6xl mx-auto px-6 py-6 flex gap-6">
          <aside className="w-64 shrink-0 hidden lg:flex flex-col gap-4">
            <div className="h-48 bg-surface-1 rounded-2xl animate-pulse border border-hairline" />
            <div className="h-36 bg-surface-1 rounded-2xl animate-pulse border border-hairline" />
          </aside>
          <div className="flex-1 h-[70vh] bg-surface-1 rounded-2xl animate-pulse border border-hairline" />
        </div>
      </div>
    );
  }

  const healthRight = (
    <div className="hidden md:flex items-center gap-1.5 flex-wrap">
      {health
        ? allProviders.map((name) => {
            const cfg  = PROVIDER_CONFIG[name];
            const open = health.providers[name]?.circuitOpen ?? false;
            const ok   = health.providers[name]?.healthy ?? false;
            const dot  = open ? "bg-red-400" : ok ? "bg-green-500" : "bg-zinc-400";
            return (
              <span key={name} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-caption font-medium ${cfg.color}`}>
                {cfg.icon}<span>{cfg.label}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              </span>
            );
          })
        : <span className="text-caption text-ink-muted">Checking providers…</span>}
    </div>
  );

  return (
    <AppShell subtitle="AI Assistant" headerRight={healthRight}>

      {/* ── Main ─────────────────────────────────────────────── */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-sm flex gap-sm">

        {/* ── Sidebar ── */}
        <aside className="w-64 shrink-0 hidden lg:block">
          <div className="sticky top-[76px] space-y-sm">

            {/* Fallback chain */}
            <div className="bg-surface-1 border border-hairline rounded-2xl p-sm">
              <h2 className="text-caption font-semibold text-ink-muted uppercase tracking-widest mb-sm">
                Fallback Chain
              </h2>
              <p className="text-caption text-ink-muted mb-sm leading-relaxed">
                Enabled providers are tried in order. Drag to reorder (future).
              </p>
              <div className="space-y-2">
                {allProviders.map((name) => {
                  const cfg    = PROVIDER_CONFIG[name];
                  const active = selectedChain.includes(name);
                  return (
                    <button key={name} onClick={() => toggleProvider(name)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-body-sm font-medium transition-all border ${
                        active
                          ? "bg-surface-2 text-ink border-hairline"
                          : "bg-canvas text-ink-muted border-transparent hover:border-hairline"
                      }`}>
                      <span className="text-ink-muted">{cfg.icon}</span>
                      <span>{cfg.label}</span>
                      {active && (
                        <span className="ml-auto text-caption text-ink-muted font-mono">
                          #{selectedChain.indexOf(name) + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Circuit breaker */}
            <div className="bg-surface-1 border border-hairline rounded-2xl p-sm">
              <h2 className="text-caption font-semibold text-ink-muted uppercase tracking-widest mb-sm">
                Circuit Breaker
              </h2>
              <div className="space-y-1.5">
                {allProviders.map((name) => {
                  const open = health?.providers[name]?.circuitOpen ?? false;
                  return (
                    <div key={name} className="flex items-center justify-between text-caption">
                      <span className="text-ink-muted capitalize">{PROVIDER_CONFIG[name].label}</span>
                      <span className={`px-2 py-0.5 rounded-full font-mono font-semibold ${
                        open
                          ? "bg-red-50 text-red-600 border border-red-200"
                          : "bg-green-50 text-green-700 border border-green-200"
                      }`}>
                        {open ? "OPEN" : "CLOSED"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-caption text-ink-muted mt-sm">3 failures → 5 min cooldown</p>
            </div>
          </div>
        </aside>

        {/* ── Chat Panel ── */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-sm pb-sm pr-1 min-h-[60vh]">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-20 text-center animate-slide-up">
                <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-md">
                  <Brain className="text-on-primary" size={32} />
                </div>
                <h2 className="text-headline font-semibold text-ink mb-2">
                  AI Assistant
                </h2>
                <p className="text-body-sm text-ink-muted max-w-sm leading-relaxed">
                  Messages are routed through your fallback chain. If a provider
                  fails or rate-limits, the next one is tried automatically.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id}
                className={`flex gap-3 animate-slide-up ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-body-sm font-bold ${
                  msg.role === "user"
                    ? "bg-primary text-on-primary"
                    : "bg-surface-2 text-ink border border-hairline"
                }`}>
                  {msg.role === "user" ? "U" : "AI"}
                </div>

                {/* Bubble */}
                <div className={`max-w-[75%] group`}>
                  <div className={`px-md py-sm rounded-2xl text-body-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-on-primary rounded-tr-sm"
                      : "bg-surface-1 text-ink border border-hairline rounded-tl-sm"
                  }`}>
                    {msg.content}
                  </div>
                  {/* Meta row */}
                  <div className={`flex items-center gap-2 mt-1 px-1 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <span className="text-caption text-ink-muted">
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                    {msg.provider && (
                      <span className={`text-caption px-2 py-0.5 rounded-full border flex items-center gap-1 ${PROVIDER_CONFIG[msg.provider].color}`}>
                        {PROVIDER_CONFIG[msg.provider].icon}
                        {PROVIDER_CONFIG[msg.provider].label}
                      </span>
                    )}
                    {msg.role === "assistant" && (
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <VoiceOutput text={msg.content} agentName="journalist" size="sm" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 animate-slide-up">
                <div className="w-8 h-8 rounded-xl bg-surface-2 border border-hairline shrink-0 flex items-center justify-center text-body-sm text-ink">AI</div>
                <div className="bg-surface-1 border border-hairline rounded-2xl rounded-tl-sm px-md py-sm flex items-center gap-2">
                  <Spinner />
                  <span className="text-body-sm text-ink-muted">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input form */}
          <form onSubmit={handleSubmit} className="mt-sm flex gap-3 items-end">
            <div className="shrink-0 pb-1">
              <VoiceInput
                onTranscript={handleVoiceTranscript}
                disabled={loading}
                size="md"
                lang="en-IN"
              />
            </div>

            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); setVoiceListening(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit(e as unknown as FormEvent);
                }
              }}
              placeholder={voiceListening ? "Listening… speak your question" : "Ask anything… or tap mic to speak"}
              rows={2}
              className={[
                "flex-1 resize-none bg-surface-1 border rounded-2xl px-md py-sm text-body text-ink placeholder-ink-muted",
                "focus:outline-none focus:ring-2 transition-all",
                voiceListening
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-hairline focus:border-accent-blue focus:ring-blue-100",
              ].join(" ")}
            />

            <button
              type="submit"
              disabled={loading || !input.trim() || selectedChain.length === 0}
              className="h-[72px] px-md rounded-2xl bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-on-primary font-semibold text-body-sm transition-all flex items-center gap-2">
              {loading ? <Spinner /> : <><SendHorizonal size={16} /> Send</>}
            </button>
          </form>

          {selectedChain.length === 0 && (
            <p className="text-caption text-red-500 mt-2 text-center flex items-center justify-center gap-1">
              <AlertTriangle size={12} />
              No providers selected — enable at least one in the sidebar.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
