/**
 * GET /api/news/cron
 * ───────────────────
 * Vercel Cron job handler — runs every 6 hours (see vercel.json).
 *
 * Authentication:
 *   Vercel automatically adds an Authorization header when invoking
 *   cron jobs in production. We verify it matches CRON_SECRET.
 *   For local testing: GET /api/news/cron?secret=<CRON_SECRET>
 *
 * Strategy per run:
 *   - Election-specific sources (news-scraper.ts) — up to 30 articles
 *   - Generic news pipeline (news-fetcher.ts)     — up to 20 articles
 *   Both write to their respective Firestore collections.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min Vercel limit for cron

import { NextRequest, NextResponse } from "next/server";
import { aggregateElectionNews } from "@/lib/news-scraper";
import { fetchAllNews }          from "@/lib/news-fetcher";
import { processBatch }          from "@/lib/news-pipeline";
import { firestoreDB }           from "@/lib/firebase-admin";
import { enqueueHighRelevanceArticles } from "@/lib/auto-debate";
import type { ProcessedArticle } from "@/lib/news-types";

export async function GET(req: NextRequest) {
  // ── Auth check ─────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const querySecret = req.nextUrl.searchParams.get("secret");
    const isValid =
      authHeader === `Bearer ${cronSecret}` ||
      querySecret === cronSecret;
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = new Date().toISOString();
  console.log(`[Cron] Election news pipeline started at ${startedAt}`);

  try {
    // ── Run election scraper + generic pipeline in parallel ──
    const [electionResult, genericArticles] = await Promise.allSettled([
      aggregateElectionNews({ limit: 30 }),
      fetchAllNews("all").then((raw) => processBatch(raw.slice(0, 20))),
    ]);

    // Persist generic articles to the main articles collection
    if (genericArticles.status === "fulfilled") {
      const articles: ProcessedArticle[] = genericArticles.value;
      const batch = firestoreDB.batch();
      for (const a of articles) {
        batch.set(
          firestoreDB.collection("articles").doc(a.articleId),
          { ...a, scheme: { ...a.scheme, data: a.scheme.data ?? null } },
          { merge: true }
        );
      }
      await batch.commit().catch((e: unknown) =>
        console.error("[Cron] Generic articles batch failed:", e)
      );

      // Auto-enqueue high-relevance articles for debates
      void enqueueHighRelevanceArticles(articles).catch((e: unknown) =>
        console.error("[Cron] Auto-debate enqueue failed:", e)
      );
    }

    const completedAt = new Date().toISOString();

    return NextResponse.json({
      success:     true,
      startedAt,
      completedAt,
      election: electionResult.status === "fulfilled"
        ? {
            runId:          electionResult.value.runId,
            totalFetched:   electionResult.value.totalFetched,
            totalProcessed: electionResult.value.totalProcessed,
          }
        : { error: (electionResult.reason as Error).message },
      generic: genericArticles.status === "fulfilled"
        ? { totalProcessed: genericArticles.value.length }
        : { error: (genericArticles.reason as Error).message },
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error("[Cron] Pipeline error:", message);
    return NextResponse.json({ error: message, startedAt }, { status: 500 });
  }
}
