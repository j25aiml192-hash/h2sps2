"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Mic, MicOff, Square, Volume2, RotateCcw,
  GraduationCap, Siren, Newspaper, Home,
  CheckCircle, Globe, Zap,
} from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import type { TranscriptionResult } from "@/lib/voice-types";

interface AgentResponse { agent: string; text: string | null; provider: string; latencyMs: number; }
interface DebateResult {
  debateId: string; topic: string;
  responses: Record<string, AgentResponse>;
  synthesis?: { consensus: string; agreements: string[] };
  followUpQuestions?: string[];
}

const AGENTS = [
  { id: "professor", icon: <GraduationCap size={14} />, label: "Professor",  card: "border-blue-200 bg-blue-50/40",   wave: "bg-blue-400" },
  { id: "activist",  icon: <Siren size={14} />,         label: "Activist",   card: "border-red-200 bg-red-50/40",     wave: "bg-red-400"  },
  { id: "journalist",icon: <Newspaper size={14} />,     label: "Journalist", card: "border-amber-200 bg-amber-50/40", wave: "bg-amber-400" },
  { id: "citizen",   icon: <Home size={14} />,          label: "Citizen",    card: "border-green-200 bg-green-50/40", wave: "bg-green-400" },
] as const;

function WaveformBars({ active, color = "bg-accent-blue" }: { active: boolean; color?: string }) {
  return (
    <div className="flex items-end gap-0.5 h-8">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i}
          className={`w-1 rounded-full transition-all ${color} ${active ? "animate-pulse" : "opacity-20"}`}
          style={{ height: active ? `${Math.max(15, Math.sin((Date.now() / 200 + i) * 0.8) * 30 + 20)}%` : "15%", animationDelay: `${i * 50}ms`, animationDuration: `${600 + (i % 5) * 120}ms` }} />
      ))}
    </div>
  );
}

function AgentCard({ agent, response, isPlaying }: { agent: typeof AGENTS[number]; response?: AgentResponse; isPlaying: boolean }) {
  return (
    <div className={`relative rounded-2xl border ${agent.card} overflow-hidden transition-all ${isPlaying ? "ring-2 ring-accent-blue shadow-sm" : ""}`}>
      {isPlaying && <div className="absolute inset-x-0 top-0 h-0.5 bg-accent-blue animate-pulse" />}
      <div className="p-sm space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-ink-muted">{agent.icon}</span>
          <span className="text-caption font-semibold text-ink">{agent.label}</span>
          {isPlaying && <div className="ml-auto"><WaveformBars active color={agent.wave} /></div>}
          {response && !isPlaying && <span className="ml-auto text-caption text-ink-muted font-mono">{response.latencyMs}ms</span>}
        </div>
        {response?.text ? (
          <p className="text-caption text-ink leading-relaxed">{response.text}</p>
        ) : (
          <div className="space-y-1.5">
            <div className="h-2 bg-surface-2 rounded-full w-full animate-pulse" />
            <div className="h-2 bg-surface-2 rounded-full w-4/5 animate-pulse" />
            <div className="h-2 bg-surface-2 rounded-full w-3/5 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}

type PagePhase = "idle" | "listening" | "confirming" | "debating" | "reading" | "done";

export default function VoicePage() {
  const [phase, setPhase]             = useState<PagePhase>("idle");
  const [topic, setTopic]             = useState("");
  const [saveAudio, setSaveAudio]     = useState(false);
  const [debate, setDebate]           = useState<DebateResult | null>(null);
  const [playingAgent, setPlayingAgent] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [sttProvider, setSttProvider] = useState<string | null>(null);
  const [ttsProvider, setTtsProvider] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onFinalTranscript = useCallback((result: TranscriptionResult) => {
    setTopic(result.text); setSttProvider(result.provider); setPhase("confirming");
  }, []);

  const stt = useSpeechRecognition({ lang: "en-IN", onFinalTranscript });
  const tts = useTextToSpeech({ rate: 0.95, onEnd: () => setPlayingAgent(null) });

  function startListening() { setPhase("listening"); setTopic(""); setDebate(null); setError(null); stt.start(); }
  function cancelListening() { stt.stop(); stt.reset(); setPhase("idle"); }

  async function runDebate() {
    if (!topic.trim()) return;
    setPhase("debating"); setError(null);
    abortRef.current = new AbortController();
    try {
      const res  = await fetch("/api/agents/debate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }), signal: abortRef.current.signal });
      if (!res.ok) throw new Error(`Debate API ${res.status}`);
      const data = await res.json() as DebateResult;
      setDebate(data); setPhase("reading");
      for (const agent of AGENTS) {
        const resp = data.responses[agent.id]; if (!resp?.text) continue;
        setPlayingAgent(agent.id);
        const r = await tts.speak(resp.text, { agentName: agent.id, saveAudio, lang: "en-IN" });
        if (r?.provider) setTtsProvider(r.provider);
      }
      if (data.synthesis?.consensus) { setPlayingAgent("consensus"); await tts.speak(`The consensus is: ${data.synthesis.consensus}`, { agentName: "professor" }); }
      setPlayingAgent(null); setPhase("done");
    } catch (err) { if ((err as Error).name === "AbortError") return; setError((err as Error).message); setPhase("done"); }
  }

  function stopPlayback() { tts.stop(); setPlayingAgent(null); setPhase("done"); }
  function restart() { tts.stop(); abortRef.current?.abort(); setPhase("idle"); setTopic(""); setDebate(null); setError(null); setSttProvider(null); setTtsProvider(null); stt.reset(); }

  useEffect(() => () => { abortRef.current?.abort(); tts.stop(); }, [tts]);

  const phaseLabel: Record<PagePhase, string> = {
    idle: "Tap the mic to start a voice debate", listening: "Listening… speak your debate topic",
    confirming: "Is this your topic?", debating: "Agents are debating…",
    reading: "Reading responses aloud", done: "Debate complete",
  };
  const phaseBadge: Record<PagePhase, string> = {
    idle: "bg-surface-2 text-ink-muted border-hairline", listening: "bg-red-50 text-red-600 border-red-200",
    confirming: "bg-blue-50 text-blue-700 border-blue-200", debating: "bg-amber-50 text-amber-700 border-amber-200",
    reading: "bg-purple-50 text-purple-700 border-purple-200", done: "bg-green-50 text-green-700 border-green-200",
  };

  const headerRight = (sttProvider || ttsProvider) ? (
    <div className="flex gap-2">
      {sttProvider && <span className="text-caption px-2 py-0.5 rounded-full bg-surface-2 border border-hairline text-ink-muted font-mono">STT: {sttProvider}</span>}
      {ttsProvider && <span className="text-caption px-2 py-0.5 rounded-full bg-surface-2 border border-hairline text-ink-muted font-mono">TTS: {ttsProvider}</span>}
    </div>
  ) : undefined;

  return (
    <AppShell subtitle="Voice Commands" headerRight={headerRight}>
      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-[42px] flex flex-col gap-md">

        {/* Phase banner */}
        <div className="flex justify-center">
          <div className={`px-md py-2 rounded-full text-body-sm border transition-all ${phaseBadge[phase]}`}>
            {phaseLabel[phase]}
          </div>
        </div>

        {/* Waveform + controls */}
        <div className="flex flex-col items-center gap-sm">
          <div className="h-10 flex items-center justify-center w-full max-w-md">
            <WaveformBars active={phase === "listening" || phase === "reading"} color="bg-accent-blue" />
          </div>

          {(phase === "idle" || phase === "done") && (
            <button onClick={startListening}
              className="w-20 h-20 rounded-full bg-primary hover:opacity-90 flex items-center justify-center shadow-sm transition-all active:scale-95"
              aria-label="Start voice input">
              <Mic className="text-on-primary" size={32} />
            </button>
          )}
          {phase === "listening" && (
            <button onClick={cancelListening}
              className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-sm transition-all animate-pulse active:scale-95"
              aria-label="Stop listening">
              <MicOff className="text-white" size={32} />
            </button>
          )}
          {phase === "reading" && (
            <button onClick={stopPlayback}
              className="px-md py-sm rounded-2xl bg-surface-1 hover:bg-surface-2 text-ink border border-hairline text-body-sm transition-all flex items-center gap-2">
              <Square size={14} /> Stop Reading
            </button>
          )}
          {stt.interim && <p className="text-ink-muted text-body-sm italic max-w-sm text-center">{stt.interim}</p>}
        </div>

        {/* Confirm card */}
        {phase === "confirming" && topic && (
          <div className="bg-surface-1 border border-hairline rounded-2xl p-md space-y-sm">
            <p className="text-caption text-ink-muted uppercase tracking-widest">Debate topic</p>
            <p className="text-headline font-semibold text-ink">&ldquo;{topic}&rdquo;</p>
            <div className="flex items-center gap-3">
              <button onClick={() => void runDebate()} className="flex-1 py-sm rounded-xl bg-primary hover:opacity-90 text-on-primary font-semibold text-body-sm transition-all flex items-center justify-center gap-2"><CheckCircle size={14} /> Start Debate</button>
              <button onClick={startListening} className="flex-1 py-sm rounded-xl bg-surface-2 hover:bg-surface-1 text-ink border border-hairline text-body-sm transition-all flex items-center justify-center gap-2"><Mic size={14} /> Re-record</button>
            </div>
            <label className="flex items-center gap-2 text-caption text-ink-muted cursor-pointer">
              <input type="checkbox" id="saveAudio" checked={saveAudio} onChange={(e) => setSaveAudio(e.target.checked)} className="accent-accent-blue w-4 h-4" />
              Save voice responses (uses server TTS — Play.ht / Edge TTS)
            </label>
            <div>
              <p className="text-caption text-ink-muted mb-1">Or edit topic:</p>
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                className="w-full bg-surface-2 border border-hairline rounded-xl px-sm py-2 text-body-sm text-ink outline-none focus:border-accent-blue transition-colors" />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-sm text-body-sm text-red-700 flex items-center gap-2">⚠ {error}</div>
        )}

        {(phase === "debating" || phase === "reading" || phase === "done") && (
          <div className="space-y-sm">
            {debate?.topic && (
              <div className="text-center">
                <p className="text-caption text-ink-muted mb-1">Debate topic</p>
                <p className="text-headline font-semibold text-ink">&ldquo;{debate.topic}&rdquo;</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
              {AGENTS.map((agent) => (
                <AgentCard key={agent.id} agent={agent} response={debate?.responses[agent.id]} isPlaying={playingAgent === agent.id} />
              ))}
            </div>
            {debate?.synthesis?.consensus && (
              <div className={`rounded-2xl border border-hairline bg-surface-1 p-sm transition-all ${playingAgent === "consensus" ? "ring-2 ring-accent-blue" : ""}`}>
                <p className="text-caption font-semibold text-ink mb-2 flex items-center gap-1"><CheckCircle size={12} className="text-green-600" /> Consensus</p>
                <p className="text-body-sm text-ink italic">&ldquo;{debate.synthesis.consensus}&rdquo;</p>
              </div>
            )}
            {phase === "done" && debate?.followUpQuestions && debate.followUpQuestions.length > 0 && (
              <div className="rounded-2xl border border-hairline bg-surface-1 p-sm space-y-2">
                <p className="text-caption font-semibold text-ink">Follow-up questions</p>
                {debate.followUpQuestions.map((q, i) => (
                  <button key={i} onClick={() => { setTopic(q); setPhase("confirming"); setDebate(null); stt.reset(); }}
                    className="w-full text-left text-caption text-ink-muted hover:text-accent-blue py-1.5 px-sm rounded-xl hover:bg-surface-2 transition-colors">
                    → {q}
                  </button>
                ))}
              </div>
            )}
            {phase === "done" && (
              <div className="flex gap-3">
                <button onClick={restart}
                  className="flex-1 py-sm rounded-2xl bg-primary hover:opacity-90 text-on-primary text-body-sm font-semibold transition-all flex items-center justify-center gap-2">
                  <RotateCcw size={14} /> New Debate
                </button>
                {debate?.responses && (
                  <button
                    onClick={() => void tts.speakQueue(AGENTS.map((a) => ({ text: debate!.responses[a.id]?.text ?? "", opts: { agentName: a.id, saveAudio } })).filter((x) => !!x.text))}
                    className="px-md py-sm rounded-2xl bg-surface-1 hover:bg-surface-2 text-ink border border-hairline text-body-sm transition-all flex items-center gap-2">
                    <Volume2 size={14} /> Replay
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {phase === "idle" && (
          <div className="mt-auto grid grid-cols-1 sm:grid-cols-3 gap-sm">
            {[
              { icon: <Globe size={16} />,  label: "Web Speech API",  desc: "Browser-native · Free · Works offline", active: stt.hasWebSpeech },
              { icon: <Zap size={16} />,    label: "Groq Whisper",    desc: "100 min/day free · Server STT",         active: true },
              { icon: <Volume2 size={16} />, label: "Edge TTS",       desc: "Server TTS · Indian voices · No cost",  active: true },
            ].map(({ icon, label, desc, active }) => (
              <div key={label} className={`rounded-2xl border p-sm ${active ? "border-hairline bg-surface-1" : "border-hairline bg-surface-2 opacity-50"}`}>
                <div className="flex items-center gap-2 mb-1 text-ink-muted">{icon}<span className="text-body-sm font-semibold text-ink">{label}</span></div>
                <p className="text-caption text-ink-muted">{desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
