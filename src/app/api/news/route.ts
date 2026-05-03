/**
 * GET  /api/news  — Query processed election news from Firestore
 * POST /api/news  — Manually trigger the election news scraper
 *
 * GET query params:
 *   state     — filter by Indian state (array-contains on regional.regions)
 *   category  — filter by ArticleCategory value
 *   isScheme  — "true" to return only scheme articles
 *   source    — filter by source key (e.g. "eci", "theHindu")
 *   minScore  — minimum relevance score (0-1, default 0)
 *   limit     — number of results (max 50, default 20)
 *   offset    — Firestore pagination cursor (articleId of last doc)
 *
 * POST body (all optional):
 *   { sources?: string[], limit?: number }
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aggregateElectionNews } from "@/lib/news-scraper";
import { firestoreDB } from "@/lib/firebase-admin";
import type { ProcessedArticle } from "@/lib/news-types";

const COLLECTION = "election_news";
const MAX_LIMIT  = 50;

// ── GET query schema ─────────────────────────────────────────
const GetSchema = z.object({
  state:     z.string().optional(),
  category:  z.string().optional(),
  isScheme:  z.string().optional(),           // "true" | "false"
  source:    z.string().optional(),
  minScore:  z.coerce.number().min(0).max(1).default(0),
  limit:     z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
  offset:    z.string().optional(),           // articleId of last doc
});

// ── POST body schema ─────────────────────────────────────────
const PostSchema = z.object({
  sources: z.array(z.string()).optional(),
  limit:   z.number().int().min(1).max(100).default(30),
});

// ── GET ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = GetSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { state, category, isScheme, minScore, limit, offset } = parsed.data;

  try {
    // Build Firestore query
    // Note: Firestore requires composite indexes for multiple where() + orderBy()
    // We apply a single most-specific where() first, then filter in memory for extras
    let q = firestoreDB
      .collection(COLLECTION)
      .orderBy("relevance.score", "desc")
      .orderBy("publishedAt",     "desc")
      .limit(limit * 3);          // over-fetch to allow in-memory filters

    if (state) {
      // array-contains on regional.regions
      q = firestoreDB
        .collection(COLLECTION)
        .where("regional.regions", "array-contains", state)
        .orderBy("relevance.score", "desc")
        .limit(limit * 3);
    }

    // Cursor-based pagination
    if (offset) {
      const cursorDoc = await firestoreDB.collection(COLLECTION).doc(offset).get();
      if (cursorDoc.exists) {
        q = q.startAfter(cursorDoc);
      }
    }

    const snap = await q.get();
    let articles = snap.docs.map((d) => d.data() as ProcessedArticle);

    // In-memory filters for extra conditions
    if (category) {
      articles = articles.filter((a) => a.category.value === category);
    }
    if (isScheme === "true") {
      articles = articles.filter((a) => a.scheme.isScheme === true);
    }
    if (minScore > 0) {
      articles = articles.filter((a) => a.relevance.score >= minScore);
    }

    // Trim to requested limit
    const page = articles.slice(0, limit);
    const nextCursor = page.length === limit ? page[page.length - 1]?.articleId : null;

    // Strip rawText from response to keep payload small
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const lean = page.map(({ rawText: _rawText, ...rest }) => rest);

    return NextResponse.json({
      articles: lean,
      count:      lean.length,
      nextCursor,
      filters:  { state, category, isScheme, minScore },
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error("[GET /api/news]", message);
    // Return empty rather than 500 if Firestore not configured yet
    if (message.includes("NOT_FOUND") || message.includes("no documents")) {
      return NextResponse.json({ articles: [], count: 0, nextCursor: null });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — manual trigger ─────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sources, limit } = parsed.data;

  try {
    const result = await aggregateElectionNews({ sources, limit });
    return NextResponse.json({
      success:        true,
      runId:          result.runId,
      totalFetched:   result.totalFetched,
      totalProcessed: result.totalProcessed,
      triggeredAt:    result.triggeredAt,
      completedAt:    result.completedAt,
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error("[POST /api/news]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
