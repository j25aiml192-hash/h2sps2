/**
 * useTextToSpeech — Multi-provider TTS hook
 * ══════════════════════════════════════════
 *
 * Provider chain:
 *  Primary   : Web Speech Synthesis API (browser-native, free, offline)
 *  Fallback 1: Server TTS via /api/voice/synthesise → Play.ht / Edge TTS
 *              Only used when saveAudio=true or Web Speech unavailable.
 *
 * Usage:
 *   const { speak, stop, isSpeaking, provider } = useTextToSpeech();
 */
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { TTSProvider, SynthesisOptions, SynthesisResult } from "@/lib/voice-types";

// ── Agent → voice preference (for Web Speech API) ────────────
const AGENT_VOICE_KEYWORDS: Record<string, string[]> = {
  professor:   ["Male",   "Google हिन्दी", "Google UK English Male", "Daniel"],
  activist:    ["Female", "Veena", "Google हिन्दी", "Google UK English Female"],
  journalist:  ["Female", "Google UK English Female", "Samantha"],
  citizen:     ["Male",   "Google हिन्दी", "Rishi"],
};

function pickVoice(agentName: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const keywords = AGENT_VOICE_KEYWORDS[agentName] ?? [];

  // Try keywords in order
  for (const kw of keywords) {
    const match = voices.find((v) => v.name.includes(kw));
    if (match) return match;
  }
  // Fallback: first en-IN voice
  return voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
}

// ── Hook ──────────────────────────────────────────────────────
interface UseTextToSpeechOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

export function useTextToSpeech(options: UseTextToSpeechOptions = {}) {
  const { lang = "en-IN", rate = 1.0, pitch = 1.0, volume = 1.0, onEnd, onError } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [provider, setProvider]     = useState<TTSProvider | null>(null);
  const [queue, setQueue]           = useState<string[]>([]);

  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const utteranceRef    = useRef<SpeechSynthesisUtterance | null>(null);
  const hasWebTTS       = typeof window !== "undefined" && "speechSynthesis" in window;

  // ── Web Speech Synthesis ────────────────────────────────────
  const speakWebSpeech = useCallback((
    text: string,
    opts?: SynthesisOptions
  ): Promise<SynthesisResult> => {
    return new Promise((resolve, reject) => {
      const synth = window.speechSynthesis;
      synth.cancel(); // stop any ongoing speech

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang   = opts?.lang   ?? lang;
      utterance.rate   = opts?.rate   ?? rate;
      utterance.pitch  = opts?.pitch  ?? pitch;
      utterance.volume = opts?.volume ?? volume;

      const voice = pickVoice(opts?.agentName ?? "default");
      if (voice) utterance.voice = voice;

      const t0 = Date.now();
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend   = () => { setIsSpeaking(false); resolve({ provider: "web-speech", durationMs: Date.now() - t0 }); onEnd?.(); };
      utterance.onerror = (e) => { setIsSpeaking(false); reject(new Error(e.error)); onError?.(e.error); };

      utteranceRef.current = utterance;
      setProvider("web-speech");
      synth.speak(utterance);
    });
  }, [lang, rate, pitch, volume, onEnd, onError]);

  // ── Server TTS (Play.ht / Edge) ──────────────────────────────
  const speakServer = useCallback(async (
    text: string,
    opts?: SynthesisOptions
  ): Promise<SynthesisResult> => {
    const t0 = Date.now();
    const agent = opts?.agentName ?? "default";

    const res = await fetch(`/api/voice/synthesise?agent=${agent}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: opts?.lang ?? lang, rate: opts?.rate ?? rate }),
    });

    if (!res.ok) throw new Error(`Server TTS ${res.status}`);
    const data = await res.json() as { audioUrl: string; provider: string };

    const audio = new Audio(data.audioUrl);
    audioRef.current = audio;
    setProvider(data.provider as TTSProvider);
    setIsSpeaking(true);

    return new Promise((resolve, reject) => {
      audio.onended = () => {
        setIsSpeaking(false);
        resolve({ provider: data.provider as TTSProvider, audioUrl: data.audioUrl, durationMs: Date.now() - t0 });
        onEnd?.();
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        reject(new Error("Audio playback failed"));
        onError?.("Audio playback failed");
      };
      audio.play().catch(reject);
    });
  }, [lang, rate, onEnd, onError]);

  // ── Public speak() — tries Web Speech then server ──────────
  const speak = useCallback(async (
    text: string,
    opts?: SynthesisOptions
  ): Promise<SynthesisResult | null> => {
    if (!text.trim()) return null;

    // If saveAudio requested, always use server
    if (opts?.saveAudio) {
      try { return await speakServer(text, opts); }
      catch (e) { console.warn("[TTS] Server failed:", e); }
    }

    // Web Speech primary
    if (hasWebTTS && !opts?.saveAudio) {
      try { return await speakWebSpeech(text, opts); }
      catch (e) { console.warn("[TTS] Web Speech failed, trying server:", e); }
    }

    // Server fallback
    try { return await speakServer(text, opts); }
    catch (e) {
      const msg = (e as Error).message;
      onError?.(msg);
      setIsSpeaking(false);
      return null;
    }
  }, [hasWebTTS, speakWebSpeech, speakServer, onError]);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    audioRef.current?.pause();
    audioRef.current = null;
    setIsSpeaking(false);
    setQueue([]);
  }, []);

  // ── Queue: speak multiple texts sequentially ─────────────────
  const speakQueue = useCallback(async (
    texts: { text: string; opts?: SynthesisOptions }[]
  ) => {
    setQueue(texts.map((t) => t.text));
    for (const { text, opts } of texts) {
      setQueue((q) => q.slice(1));
      await speak(text, opts);
    }
  }, [speak]);

  // Cleanup
  useEffect(() => () => stop(), [stop]);

  return {
    speak,
    speakQueue,
    stop,
    isSpeaking,
    provider,
    queue,
    hasWebTTS,
  };
}
