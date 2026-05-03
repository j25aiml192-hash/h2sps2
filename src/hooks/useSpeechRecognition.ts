/**
 * useSpeechRecognition — Multi-provider STT hook
 * ═══════════════════════════════════════════════
 *
 * Provider chain:
 *  Primary   : Web Speech API (browser-native, instant, en-IN)
 *  Fallback 1: Groq Whisper  (server, 100 min/day free)
 *
 * Usage:
 *   const { start, stop, transcript, interim, status, provider } = useSpeechRecognition();
 */
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { STTProvider, TranscriptionResult } from "@/lib/voice-types";

export type STTStatus = "idle" | "listening" | "processing" | "done" | "error";

// ── Web Speech API type shims ──────────────────────────────────
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionError extends Event {
  error: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionError) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

function getWebSpeechAPI(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// ── Groq Whisper fallback via server ─────────────────────────
async function transcribeWithGroq(
  blob: Blob,
  lang = "en"
): Promise<TranscriptionResult> {
  const t0 = Date.now();
  const form = new FormData();
  form.append("audio", blob, "recording.webm");
  form.append("lang", lang.split("-")[0]); // "en-IN" → "en"

  const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Whisper API ${res.status}`);

  const data = await res.json() as TranscriptionResult;
  return { ...data, durationMs: Date.now() - t0 };
}

// ── Hook ──────────────────────────────────────────────────────
interface UseSpeechRecognitionOptions {
  lang?: string;
  preferServer?: boolean;
  onFinalTranscript?: (result: TranscriptionResult) => void;
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const { lang = "en-IN", preferServer = false, onFinalTranscript } = options;

  const [status, setStatus]       = useState<STTStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim]     = useState("");
  const [provider, setProvider]   = useState<STTProvider | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);

  const hasWebSpeech = !preferServer && !!getWebSpeechAPI();

  // ── Web Speech path ─────────────────────────────────────────
  const startWebSpeech = useCallback(() => {
    const API = getWebSpeechAPI()!;
    const rec = new API();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setStatus("listening");
      setProvider("web-speech");
      setError(null);
      setInterim("");
      startTimeRef.current = Date.now();
    };

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let fin = "";
      let tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += text;
        else tmp += text;
      }
      if (fin) setTranscript((prev) => prev + fin);
      setInterim(tmp);
    };

    rec.onerror = (e: SpeechRecognitionError) => {
      if (e.error === "no-speech") return; // benign
      setError(e.error);
      setStatus("error");
    };

    rec.onend = () => {
      setInterim("");
      setStatus((prev) => {
        if (prev === "listening") {
          const result: TranscriptionResult = {
            text: transcript + interim,
            provider: "web-speech",
            durationMs: Date.now() - startTimeRef.current,
          };
          onFinalTranscript?.(result);
          return "done";
        }
        return prev;
      });
    };

    recognitionRef.current = rec;
    rec.start();
  }, [lang, transcript, interim, onFinalTranscript]);

  // ── Groq Whisper path (MediaRecorder → blob → server) ──────
  const startWhisper = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission denied");
      setStatus("error");
      return;
    }

    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setStatus("processing");
      try {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const result = await transcribeWithGroq(blob, lang);
        setTranscript(result.text);
        setProvider("groq-whisper");
        onFinalTranscript?.(result);
        setStatus("done");
      } catch (err) {
        setError((err as Error).message);
        setStatus("error");
      }
    };

    mediaRecorderRef.current = mr;
    mr.start(250); // collect chunks every 250ms
    setStatus("listening");
    setProvider("groq-whisper");
    startTimeRef.current = Date.now();
  }, [lang, onFinalTranscript]);

  const start = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
    if (hasWebSpeech) startWebSpeech();
    else void startWhisper();
  }, [hasWebSpeech, startWebSpeech, startWhisper]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    recognitionRef.current?.abort();
    mediaRecorderRef.current?.stop();
  }, []);

  return {
    start,
    stop,
    transcript,
    interim,
    status,
    provider,
    error,
    isListening: status === "listening",
    isProcessing: status === "processing",
    hasWebSpeech,
    reset: () => { setTranscript(""); setInterim(""); setStatus("idle"); setError(null); },
  };
}
