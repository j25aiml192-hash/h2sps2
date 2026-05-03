/**
 * POST /api/translate
 * ────────────────────
 * Free translation via LibreTranslate (self-hosted) with
 * MyMemory public API fallback (no key, 1000 words/day free).
 *
 * Body: { text: string, source?: string, target: string }
 * Returns: { translatedText, source, target, provider }
 *
 * Provider chain:
 *  1. LibreTranslate — set LIBRETRANSLATE_URL + LIBRETRANSLATE_KEY
 *     (deploy free at libretranslate.com or self-host)
 *  2. MyMemory API   — https://mymemory.translated.net (no auth needed)
 *     Supports 60+ languages including Hindi, Tamil, Telugu, etc.
 *
 * Env vars (optional):
 *   LIBRETRANSLATE_URL  — default: https://libretranslate.com
 *   LIBRETRANSLATE_KEY  — API key if using hosted version
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const TranslateSchema = z.object({
  text:   z.string().min(1).max(5000),
  source: z.string().default("auto"),
  target: z.string().min(2).max(5),
});

// ── LibreTranslate ────────────────────────────────────────────
async function translateLibre(text: string, source: string, target: string): Promise<string> {
  const baseUrl = process.env.LIBRETRANSLATE_URL ?? "https://libretranslate.com";
  const apiKey  = process.env.LIBRETRANSLATE_KEY ?? "";

  const res = await fetch(`${baseUrl}/translate`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ q: text, source, target, api_key: apiKey }),
    signal:  AbortSignal.timeout(8_000),
  });

  if (!res.ok) throw new Error(`LibreTranslate ${res.status}`);
  const data = await res.json() as { translatedText?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return data.translatedText ?? "";
}

// ── MyMemory fallback (free, no key) ──────────────────────────
async function translateMyMemory(text: string, source: string, target: string): Promise<string> {
  const langPair = source === "auto" ? `|${target}` : `${source}|${target}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${encodeURIComponent(langPair)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`MyMemory ${res.status}`);

  const data = await res.json() as {
    responseStatus: number;
    responseData: { translatedText: string };
    matches?: { translation: string }[];
  };

  if (data.responseStatus !== 200) throw new Error("MyMemory translation failed");
  return data.responseData.translatedText;
}

// ── Handler ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try { body = await req.json(); } catch { /* ok */ }

  const parsed = TranslateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { text, source, target } = parsed.data;
  let translatedText = "";
  let provider = "libretranslate";

  // Try LibreTranslate first
  const hasLibre = !!(process.env.LIBRETRANSLATE_URL || process.env.LIBRETRANSLATE_KEY);
  if (hasLibre) {
    try {
      translatedText = await translateLibre(text, source, target);
      provider = "libretranslate";
    } catch (err) {
      console.warn("[Translate] LibreTranslate failed:", (err as Error).message);
    }
  }

  // MyMemory fallback
  if (!translatedText) {
    try {
      translatedText = await translateMyMemory(text, source, target);
      provider = "mymemory";
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 503 });
    }
  }

  return NextResponse.json({ translatedText, source, target, provider });
}
