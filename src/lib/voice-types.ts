/**
 * ============================================================
 * Voice System Types
 * ============================================================
 */

// ── Provider tiers ────────────────────────────────────────────
export type STTProvider = "web-speech" | "groq-whisper" | "hf-whisper";
export type TTSProvider = "web-speech" | "playht" | "edge-tts";

export type VoiceStatus =
  | "idle"
  | "listening"       // mic is open
  | "processing"      // STT converting
  | "speaking"        // TTS playing
  | "debating"        // debate API in-flight
  | "error";

// ── STT ───────────────────────────────────────────────────────
export interface TranscriptionResult {
  text: string;
  provider: STTProvider;
  confidence?: number;
  language?: string;
  durationMs: number;
}

export interface STTOptions {
  lang?: string;           // default: "en-IN"
  continuous?: boolean;
  preferServer?: boolean;  // skip Web Speech, go straight to Groq
}

// ── TTS ───────────────────────────────────────────────────────
export interface SynthesisOptions {
  lang?: string;           // default: "en-IN"
  rate?: number;           // 0.5–2.0
  pitch?: number;          // 0–2.0
  volume?: number;         // 0–1
  saveAudio?: boolean;     // true → use server TTS so audio can be stored
  agentName?: string;      // used to pick a voice character
}

export interface SynthesisResult {
  provider: TTSProvider;
  audioUrl?: string;       // set when server TTS is used
  durationMs: number;
}

// ── Voice debate record ────────────────────────────────────────
export interface VoiceDebateRecord {
  sessionId: string;
  topic: string;
  transcription: TranscriptionResult;
  agentAudioUrls?: Record<string, string>;  // agent → Play.ht audio URL
  createdAt: string;
}

// ── Provider capability matrix (runtime detection) ────────────
export interface VoiceCapabilities {
  webSpeechSTT: boolean;
  webSpeechTTS: boolean;
  groqWhisper: boolean;
  playht: boolean;
}
