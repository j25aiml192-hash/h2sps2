/**
 * POST /api/news/auto-debate
 * ─────────────────────────
 * Enqueue high-relevance articles for debate generation.
 * Called internally by the news pipeline after processing.
 *
 * Body: { articleIds: string[], articles?: ProcessedArticle[] }
 * If `articles` is provided, scores are read from them directly.
 * Otherwise, articles are fetched from Firestore by ID.
 *
 * GET /api/news/auto-debate
 * ─────────────────────────
 * Process the pending queue — runs up to 3 items per invocation.
 * Triggered by Vercel Cron every 30 minutes (see vercel.json).
 * Protected by CRON_SECRET.
 *
 * Also returns queue status snapshot.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enqueueHighRelevanceArticles,
  processPendingQueue,
  getQueueStatus,
  getCachedDebate,
} from "@/lib/auto-debate";
import { firestoreDB } from "@/lib/firebase-admin";
import type { ProcessedArticle } from "@/lib/news-types";

const ARTICLES_COL = "articles";

// ── POST — enqueue articles ───────────────────────────────────
const EnqueueSchema = z.object({
  articleIds: z.array(z.string()).optional(),
  articles:   z.array(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const parsed = EnqueueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { articleIds, articles: articlesPayload } = parsed.data;
  let articles: ProcessedArticle[] = [];

  if (articlesPayload && articlesPayload.length > 0) {
    // Articles passed directly (from pipeline response)
    articles = articlesPayload as ProcessedArticle[];
  } else if (articleIds && articleIds.length > 0) {
    // Fetch from Firestore
    const docs = await Promise.allSettled(
      articleIds.map((id) =>
        firestoreDB.collection(ARTICLES_COL).doc(id).get()
      )
    );
    articles = docs
      .filter((r) => r.status === "fulfilled" && r.value.exists)
      .map((r) => (r as PromiseFulfilledResult<FirebaseFirestore.DocumentSnapshot>).value.data() as ProcessedArticle);
  }

  if (articles.length === 0) {
    return NextResponse.json({ enqueued: 0, message: "No articles to process" });
  }

  const enqueued = await enqueueHighRelevanceArticles(articles);
  return NextResponse.json({ enqueued, total: articles.length });
}

// ── GET — process queue + status ─────────────────────────────
export async function GET(req: NextRequest) {
  // Cron secret check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const [processResult, queueStatus] = await Promise.all([
      processPendingQueue(3),
      getQueueStatus(),
    ]);

    return NextResponse.json({
      processed: processResult.processed,
      failed:    processResult.failed,
      queue:     queueStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Separate: single-article debate check/trigger (used by UI) ─
// Called via GET /api/news/auto-debate?articleId=xxx
// Returns cached debate or triggers a new one synchronously
export async function OPTIONS(req: NextRequest) {
  const articleId = req.nextUrl.searchParams.get("articleId");
  if (!articleId) {
    return NextResponse.json({ error: "articleId required" }, { status: 400 });
  }

  const cached = await getCachedDebate(articleId);
  if (cached) {
    return NextResponse.json({ found: true, ...cached });
  }

  return NextResponse.json({ found: false });
}
