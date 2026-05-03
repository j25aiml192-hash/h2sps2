"use client";

/**
 * VoiceOutput
 * ───────────
 * Play/pause/stop button for reading AI text aloud.
 * Primary: Web Speech API (browser SpeechSynthesis, 100% free)
 * Fallback: Edge TTS / Play.ht (server, handled inside useTextToSpeech hook)
 *
 * Props:
 *   text       — text to speak
 *   agentName  — selects voice personality (professor/activist/journalist/citizen)
 *   autoPlay   — speak immediately when text changes
 *   size       — "sm" | "md"
 */
import { useCallback, useEffect } from "react";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";

interface VoiceOutputProps {
  text:       string;
  agentName?: string;
  autoPlay?:  boolean;
  size?:      "sm" | "md";
}

// Per-agent speech tuning (rate / pitch)
const VOICE_CONFIG: Record<string, { rate: number; pitch: number }> = {
  professor: { rate: 0.88, pitch: 0.85 },   // deliberate, deep
  activist:  { rate: 1.10, pitch: 1.10 },   // energetic
  journalist:{ rate: 1.00, pitch: 0.95 },   // neutral, clear
  citizen:   { rate: 1.00, pitch: 1.10 },   // friendly
};

export function VoiceOutput({
  text,
  agentName = "citizen",
  autoPlay  = false,
  size      = "sm",
}: VoiceOutputProps) {
  const cfg  = VOICE_CONFIG[agentName] ?? VOICE_CONFIG.citizen!;
  const btnSz = size === "sm" ? "w-7 h-7 text-sm" : "w-9 h-9 text-base";

  const tts = useTextToSpeech({ rate: cfg.rate });

  // Auto-play when text first arrives
  useEffect(() => {
    if (autoPlay && text) {
      const t = setTimeout(() => {
        void tts.speak(text, { agentName, lang: "en-IN" });
      }, 120);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, autoPlay]);

  // Clean up on unmount
  useEffect(() => () => { tts.stop(); }, [tts]);

  const handlePlay = useCallback(() => {
    if (tts.isSpeaking) {
      tts.stop();
    } else {
      void tts.speak(text, { agentName, lang: "en-IN" });
    }
  }, [tts, text, agentName]);

  const handlePause = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else {
      window.speechSynthesis.pause();
    }
  }, []);

  if (!text) return null;

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Voice controls">
      {/* Play / Stop */}
      <button
        type="button"
        onClick={handlePlay}
        title={tts.isSpeaking ? "Stop" : "Read aloud"}
        aria-label={tts.isSpeaking ? "Stop playback" : "Read response aloud"}
        className={[
          btnSz,
          "rounded-full flex items-center justify-center transition-all",
          tts.isSpeaking
            ? "bg-red-900/50 hover:bg-red-700/60 text-red-300 border border-red-700/40"
            : "bg-slate-700/60 hover:bg-indigo-700/60 text-slate-400 hover:text-indigo-300 border border-slate-600/40",
          "active:scale-90",
        ].join(" ")}
      >
        <span aria-hidden>{tts.isSpeaking ? "⏹" : "🔊"}</span>
      </button>

      {/* Pause / Resume — only while speaking */}
      {tts.isSpeaking && (
        <button
          type="button"
          onClick={handlePause}
          title="Pause / Resume"
          aria-label="Pause or resume playback"
          className={[
            btnSz,
            "rounded-full flex items-center justify-center transition-all",
            "bg-amber-900/40 hover:bg-amber-700/50 text-amber-300 border border-amber-700/40",
            "active:scale-90",
          ].join(" ")}
        >
          <span aria-hidden>⏸</span>
        </button>
      )}
    </div>
  );
}
