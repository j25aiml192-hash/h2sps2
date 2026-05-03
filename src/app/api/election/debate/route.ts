/**
 * POST /api/election/debate
 * ──────────────────────────
 * Triggers a 4-agent election-expert debate in parallel.
 *
 * Body: {
 *   topic: string,
 *   state?: string,          // Indian state/UT for localised context
 *   isFirstTimeVoter?: boolean,
 *   sessionId?: string
 * }
 *
 * GET /api/election/debate?debateId=...
 *   Retrieve a stored debate from Firestore.
 *
 * GET /api/election/debate?limit=5
 *   List recent debates (up to 20).
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { conductElectionDebate } from "@/lib/election-agents";
import { firestoreDB } from "@/lib/firebase-admin";
import type { DebateResult } from "@/lib/election-agents";

const RequestSchema = z.object({
  topic:            z.string().min(3).max(500),
  state:            z.string().optional(),
  isFirstTimeVoter: z.boolean().optional(),
  sessionId:        z.string().optional(),
});

// ── POST — run a new debate ───────────────────────────────────
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { topic, state, isFirstTimeVoter, sessionId } = parsed.data;

  try {
    const result = await conductElectionDebate(topic, { state, isFirstTimeVoter, sessionId });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/election/debate]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET — retrieve or list debates ───────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const debateId = searchParams.get("debateId");
  const limit    = Math.min(parseInt(searchParams.get("limit") ?? "5"), 20);

  try {
    if (debateId) {
      const doc = await firestoreDB.collection("election_debates").doc(debateId).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Debate not found" }, { status: 404 });
      }
      return NextResponse.json(doc.data() as DebateResult);
    }

    // List recent debates
    const snap = await firestoreDB
      .collection("election_debates")
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    const debates = snap.docs.map((d) => {
      const data = d.data() as DebateResult & { topic: string; timestamp: string };
      return {
        debateId:  d.id,
        topic:     data.topic,
        timestamp: data.timestamp,
        agentCount: (data.responses ?? []).filter((r: { available: boolean }) => r.available).length,
      };
    });

    return NextResponse.json({ debates });
  } catch (err) {
    console.error("[GET /api/election/debate]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
