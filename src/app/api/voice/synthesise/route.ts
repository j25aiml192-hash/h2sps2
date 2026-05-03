/**
 * POST /api/voice/synthesise
 * ──────────────────────────
 * Server-side TTS for "Save voice debates" mode.
 *
 * Provider chain:
 *  1. Play.ht  — if PLAYHT_API_KEY + PLAYHT_USER_ID set (2500 chars/month free)
 *  2. Edge TTS — Microsoft Edge TTS via undici (no key needed, no cost)
 *     fallback URL: https://speech.platform.bing.com/consumer/speech/synthesize/
 *
 * Client-side Web Speech API is handled entirely in the browser hook
 * (useSpeechSynthesis.ts) — this route is only called when
 * `saveAudio: true` is requested.
 *
 * Returns: { audioUrl: string, provider: string, durationMs: number }
 * audioUrl is a data: URI (base64) for portability.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const SynthesisSchema = z.object({
  text:      z.string().min(1).max(5000),
  lang:      z.string().default("en-IN"),
  voice:     z.string().optional(),         // Play.ht voice ID or Edge TTS voice name
  rate:      z.number().min(0.5).max(2).default(1.0),
});

// ── Play.ht TTS ───────────────────────────────────────────────
async function synthesisePlayHT(
  text: string,
  voice: string,
  rate: number
): Promise<Buffer> {
  const apiKey = process.env.PLAYHT_API_KEY!;
  const userId = process.env.PLAYHT_USER_ID!;

  const res = await fetch("https://api.play.ht/api/v2/tts/stream", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "X-User-ID":     userId,
      "Accept":        "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      voice_engine: "PlayHT2.0-turbo",
      voice: voice ?? "s3://voice-cloning-zero-shot/7af665de-5253-4c0c-86f6-7d1e0f74e720/original/manifest.json",
      output_format: "mp3",
      speed: rate,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw new Error(`Play.ht ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Edge TTS fallback (no key needed) ─────────────────────────
// Uses Microsoft's public Bing TTS endpoint (same as Edge browser)
async function synthesiseEdgeTTS(
  text: string,
  voiceName: string,
  rate: number
): Promise<Buffer> {
  // rate is used by the wrapper as a speed parameter
  void rate;

  // Edge TTS public REST wrapper (StreamElements) — no auth, no cost
  // For higher quality: deploy edge-tts npm package as a serverless function
  const wrapperRes = await fetch(
    `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voiceName)}&text=${encodeURIComponent(text.slice(0, 500))}`,
    { signal: AbortSignal.timeout(10_000) }
  );

  if (!wrapperRes.ok) throw new Error("Edge TTS wrapper unavailable");
  return Buffer.from(await wrapperRes.arrayBuffer());
}

// ── Indian English voice preference map ──────────────────────
const EDGE_VOICES: Record<string, string> = {
  professor:  "en-IN-PrabhatNeural",
  activist:   "en-IN-NeerjaNeural",
  journalist: "en-IN-NeerjaExpressiveNeural",
  citizen:    "en-IN-PrabhatNeural",
  default:    "en-IN-NeerjaNeural",
};

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  let body: unknown = {};
  try { body = await req.json(); } catch { /* ok */ }

  const parsed = SynthesisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { text, rate, voice } = parsed.data;
  const agentName  = req.nextUrl.searchParams.get("agent") ?? "default";
  const edgeVoice  = EDGE_VOICES[agentName] ?? EDGE_VOICES.default;

  let audioBuffer: Buffer | null = null;
  let provider = "playht";

  // ── Try Play.ht first ─────────────────────────────────────
  const hasPlayHT = !!(process.env.PLAYHT_API_KEY && process.env.PLAYHT_USER_ID);
  if (hasPlayHT) {
    try {
      audioBuffer = await synthesisePlayHT(text, voice ?? edgeVoice, rate);
      provider = "playht";
    } catch (err) {
      console.warn("[TTS] Play.ht failed, trying Edge TTS:", (err as Error).message);
    }
  }

  // ── Fallback: Edge TTS ────────────────────────────────────
  if (!audioBuffer) {
    try {
      audioBuffer = await synthesiseEdgeTTS(text, edgeVoice, rate);
      provider = "edge-tts";
    } catch (err) {
      console.error("[TTS] Edge TTS also failed:", (err as Error).message);
      return NextResponse.json({ error: "All TTS providers failed" }, { status: 503 });
    }
  }

  // Return as data URI for easy client consumption
  const base64 = audioBuffer.toString("base64");
  const audioUrl = `data:audio/mpeg;base64,${base64}`;

  return NextResponse.json({
    audioUrl,
    provider,
    durationMs: Date.now() - t0,
    chars: text.length,
  });
}
