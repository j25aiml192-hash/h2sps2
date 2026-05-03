/**
 * POST /api/voice/transcribe
 * ─────────────────────────
 * Groq Whisper transcription (free tier: 100 min/day).
 * Accepts multipart/form-data with an `audio` file field.
 *
 * Used as STT Fallback 1 when Web Speech API is unavailable
 * (Firefox, server-side archival, offline analysis).
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY not set");
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const audioFile = formData.get("audio") as File | null;
  const lang = (formData.get("lang") as string | null) ?? "en";

  if (!audioFile || audioFile.size === 0) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
  }

  // Cap at 25MB (Groq limit)
  if (audioFile.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "Audio file exceeds 25MB limit" }, { status: 413 });
  }

  try {
    const groq = getGroq();

    // Groq SDK accepts a File object directly
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      language: lang,
      response_format: "verbose_json",
    });

    return NextResponse.json({
      text:       transcription.text,
      provider:   "groq-whisper",
      language:   (transcription as unknown as Record<string, unknown>).language as string | undefined,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    console.error("[Transcribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
