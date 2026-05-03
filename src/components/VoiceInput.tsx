"use client";

/**
 * VoiceInput
 * ──────────
 * Mic button that triggers speech-to-text via the useSpeechRecognition hook.
 * Primary: Web Speech API (browser-native, 100% free, works offline)
 * Fallback: Groq Whisper (server, 100 min/day free) — handled inside the hook
 *
 * Props:
 *   onTranscript(text) — called when final speech is recognised
 *   size               — button size variant ("sm" | "md" | "lg")
 *   disabled           — disable while chat is loading
 */
import { useCallback, useEffect } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { TranscriptionResult } from "@/lib/voice-types";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  size?:        "sm" | "md" | "lg";
  disabled?:    boolean;
  lang?:        string;
}

const SIZE_MAP = {
  sm: { btn: "w-8  h-8  text-base", icon: "text-sm"  },
  md: { btn: "w-10 h-10 text-lg",   icon: "text-base" },
  lg: { btn: "w-14 h-14 text-2xl",  icon: "text-xl"   },
};

export function VoiceInput({
  onTranscript,
  size     = "md",
  disabled = false,
  lang     = "en-IN",
}: VoiceInputProps) {
  const s = SIZE_MAP[size];

  const onFinal = useCallback(
    (result: TranscriptionResult) => onTranscript(result.text),
    [onTranscript]
  );

  const stt = useSpeechRecognition({ lang, onFinalTranscript: onFinal });

  // Clean up on unmount
  useEffect(() => () => { stt.stop(); }, [stt]);

  function toggle() {
    if (disabled) return;
    if (stt.isListening) { stt.stop(); } else { stt.start(); }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={stt.isListening ? "Stop listening" : stt.hasWebSpeech ? "Speak (en-IN)" : "Voice (server fallback)"}
        aria-label={stt.isListening ? "Stop voice input" : "Start voice input"}
        className={[
          s.btn,
          "rounded-full flex items-center justify-center shrink-0 transition-all",
          stt.isListening
            ? "bg-red-600 hover:bg-red-500 animate-pulse shadow-lg shadow-red-900/40"
            : "bg-slate-700/80 hover:bg-indigo-600/70 border border-slate-600/60 hover:border-indigo-500/40",
          disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-95",
        ].join(" ")}
      >
        <span className={s.icon} aria-hidden>
          {stt.isListening ? "⏹" : "🎙️"}
        </span>
      </button>

      {/* Interim transcript preview */}
      {stt.interim && (
        <p className="text-[11px] text-slate-500 italic max-w-[180px] text-center truncate" aria-live="polite">
          {stt.interim}
        </p>
      )}

      {/* Provider badge (shows on first interaction) */}
      {!stt.hasWebSpeech && !disabled && (
        <span className="text-[10px] text-amber-500/70">using server STT</span>
      )}
    </div>
  );
}
