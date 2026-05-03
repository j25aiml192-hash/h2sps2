/**
 * ============================================================
 * POST /api/news/process  — Manual trigger
 * GET  /api/news/process  — Vercel Cron trigger (every 6h)
 * ============================================================
 *
 * GET: Called by Vercel Cron on the schedule in vercel.json.
 *      Protected by CRON_SECRET header check.
 *
 * POST: Manual trigger with optional body:
 *   { source?: "newsapi"|"rss"|"all", query?: string, limit?: number }
 *
 * Both handlers:
 *   1. Fetch articles from configured sources
 *   2. Run the 5-step pipeline
 *   3. Persist each ProcessedArticle to Firestore (articles collection)
 *   4. Write a ProcessingRun summary doc to Firestore (processing_runs)
 *   5. Return the run summary
 * ============================================================
 */
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { fetchAllNews, type FetchSource } from "@/lib/news-fetcher";
import { processBatch } from "@/lib/news-pipeline";
import { firestoreDB } from "@/lib/firebase-admin";
import { enqueueHighRelevanceArticles } from "@/lib/auto-debate";
import type { ProcessingRun } from "@/lib/news-types";

const ARTICLES_COLLECTION    = "articles";
const PROCESSING_RUN_COLLECTION = "processing_runs";

// ── Request body schema (POST only) ──────────────────────────
const ProcessRequestSchema = z.object({
  source: z.enum(["newsapi", "rss", "all"]).default("all"),
  query:  z.string().max(200).optional(),
  limit:  z.number().int().min(1).max(50).default(20),
});

// ── Core handler (shared by GET + POST) ──────────────────────
async function runPipeline(
  source: FetchSource,
  query: string | undefined,
  limit: number
): Promise<ProcessingRun> {
  const runId    = uuidv4();
  const startedAt = new Date().toISOString();

  console.log(`[Pipeline run ${runId}] Fetching from "${source}"…`);

  // ── 1. Fetch ─────────────────────────────────────────────
  const allArticles = await fetchAllNews(source, query);
  const articles    = allArticles.slice(0, limit);

  console.log(`[Pipeline run ${runId}] Fetched ${allArticles.length}, processing ${articles.length}`);

  // ── 2. Process ───────────────────────────────────────────
  const processed = await processBatch(articles, (done, total) => {
    console.log(`[Pipeline run ${runId}] Progress: ${done}/${total}`);
  });

  const completedAt = new Date().toISOString();
  const failed      = articles.length - processed.length;
  const avgMs       = processed.length > 0
    ? Math.round(processed.reduce((s, a) => s + a.pipelineDurationMs, 0) / processed.length)
    : 0;

  // ── 3. Persist articles to Firestore (fire-and-forget) ───
  const batch = firestoreDB.batch();
  for (const article of processed) {
    const ref = firestoreDB
      .collection(ARTICLES_COLLECTION)
      .doc(article.articleId);
    batch.set(ref, {
      ...article,
      // Ensure nested objects are plain JSON for Firestore
      scheme:   { ...article.scheme, data: article.scheme.data ?? null },
      regional: { ...article.regional },
    });
  }

  // ── 4. Persist run summary ────────────────────────────────
  const run: ProcessingRun = {
    runId,
    startedAt,
    completedAt,
    source,
    totalFetched:          articles.length,
    totalProcessed:        processed.length,
    totalFailed:           failed,
    avgPipelineDurationMs: avgMs,
    articles:              processed,
  };

  const runRef = firestoreDB
    .collection(PROCESSING_RUN_COLLECTION)
    .doc(runId);
  batch.set(runRef, {
    runId,
    startedAt,
    completedAt,
    source,
    totalFetched:          run.totalFetched,
    totalProcessed:        run.totalProcessed,
    totalFailed:           run.totalFailed,
    avgPipelineDurationMs: run.avgPipelineDurationMs,
    articleIds:            processed.map((a) => a.articleId),
  });

  await batch.commit().catch((err: unknown) => {
    console.error(`[Pipeline run ${runId}] Firestore batch commit failed:`, err);
  });

  console.log(
    `[Pipeline run ${runId}] Done — ${processed.length} articles in ${avgMs}ms avg`
  );

  // ── 5. Auto-enqueue high-relevance articles for debate ────
  // Fire-and-forget — never blocks pipeline response
  enqueueHighRelevanceArticles(processed).catch((err: unknown) => {
    console.error(`[Pipeline run ${runId}] Auto-debate enqueue failed:`, err);
  });

  return run;
}

// ── GET  (Vercel Cron, every 6 hours) ────────────────────────
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorised triggers
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const run = await runPipeline("all", undefined, 20);
    return NextResponse.json({
      runId:          run.runId,
      totalProcessed: run.totalProcessed,
      totalFailed:    run.totalFailed,
      avgLatencyMs:   run.avgPipelineDurationMs,
      completedAt:    run.completedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/news/process]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST  (Manual trigger) ───────────────────────────────────
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — schema has defaults
  }

  const parsed = ProcessRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { source, query, limit } = parsed.data;

  try {
    const run = await runPipeline(source, query, limit);

    // Return full run, but strip rawText from articles to keep response lean
    return NextResponse.json({
      ...run,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      articles: run.articles.map(({ rawText: _rawText, ...rest }) => rest),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/news/process]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
