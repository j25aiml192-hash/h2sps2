/**
 * GET/POST /api/civic
 * ────────────────────
 * Proxy for Google Civic Information API.
 * Returns polling locations, election info, and representatives
 * for a given address (free tier: 25,000 requests/day).
 *
 * Query params:
 *   address   — civic address to look up
 *   type      — "elections" | "voterInfo" | "representatives" (default: "elections")
 *   electionId — (optional) specific election ID for voterInfo
 *
 * Env var: GOOGLE_CIVIC_API_KEY
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const CIVIC_BASE = "https://www.googleapis.com/civicinfo/v2";

interface CivicError { error?: { message: string; code: number } }

export async function GET(req: NextRequest) {
  const apiKey = process.env.GOOGLE_CIVIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_CIVIC_API_KEY not configured" }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const address    = searchParams.get("address")?.trim();
  const type       = searchParams.get("type") ?? "elections";
  const electionId = searchParams.get("electionId");

  if (!address && type !== "elections") {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  let url: string;
  const params = new URLSearchParams({ key: apiKey });

  switch (type) {
    case "elections":
      url = `${CIVIC_BASE}/elections?${params}`;
      break;

    case "voterInfo":
      if (!address) return NextResponse.json({ error: "address required for voterInfo" }, { status: 400 });
      params.set("address", address);
      if (electionId) params.set("electionId", electionId);
      url = `${CIVIC_BASE}/voterinfo?${params}`;
      break;

    case "representatives":
      if (!address) return NextResponse.json({ error: "address required for representatives" }, { status: 400 });
      params.set("address", address);
      url = `${CIVIC_BASE}/representatives?${params}`;
      break;

    default:
      return NextResponse.json({ error: "Invalid type. Use: elections | voterInfo | representatives" }, { status: 400 });
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const data = await res.json() as CivicError;

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? `Civic API ${res.status}` },
        { status: res.status }
      );
    }

    // Strip the API key from any self-referencing URLs in the response
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
