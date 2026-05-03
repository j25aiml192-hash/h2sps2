/**
 * ============================================================
 * Auto-Debate Core Engine
 * ============================================================
 *
 * Responsibilities:
 *  1. Generate a debate topic from a news headline (Groq, fastest)
 *  2. Check 48-hour debate cache in Firestore
 *  3. Enqueue high-relevance articles into `debate_queue`
 *  4. Process queue items one-at-a-time (rate-limit safe)
 *  5. Store completed debates + link back to article
 *
 * NOTE: True Firestore `onDocumentCreated` triggers require
 * Firebase Cloud Functions (see /firebase-functions/index.ts).
 * This module provides the same logic callable from Next.js
 * API routes and Vercel Cron jobs.
 * ============================================================
 */
import { v4 as uuidv4 } from "uuid";
import { firestoreDB } from "./firebase-admin";
import { GroqProvider } from "./ai-providers";
import { runAllAgents, computePerformance } from "./agent-router";
import { synthesiseDebate, factCheckResponses, generateFollowUps } from "./synthesis";
import { sendDebateReadyNotification } from "./web-push";
import type { ProcessedArticle } from "./news-types";
import type { DebateQueueItem, ArticleDebateLink } from "./auto-debate-types";

// ── Constants ────────────────────────────────────────────────
export const RELEVANCE_THRESHOLD = 0.8;
const CACHE_TTL_MS  = 48 * 60 * 60 * 1_000;   // 48 hours
const MAX_RETRIES   = 2;
const QUEUE_COL     = "debate_queue";
const LINK_COL      = "article_debate_links";
const DEBATES_COL   = "debates";

// ── 1. Topic generation (Groq Llama 3.1 8B — fastest) ───────
// Lazy provider — only instantiated on first call (avoids build-time env check)
let _groq: GroqProvider | null = null;
function getGroq(): GroqProvider {
  return (_groq ??= new GroqProvider());
}

export async function generateDebateTopic(title: string): Promise<string> {
  const prompt = `Convert this news headline into a thought-provoking debate question for public discourse.
The question should invite multiple perspectives and be open-ended.

Headline: "${title}"

Rules:
- Return ONLY the question, no explanation
- Start with "Why", "Should", "How", "Is", "Can", or "What"
- Make it specific enough to debate meaningfully
- Maximum 15 words`;

  const result = await getGroq().chat(
    [{ role: "user", content: prompt }],
    { model: "llama-3.1-8b-instant", temperature: 0.4, maxTokens: 50 }
  );

  return result.trim().replace(/^["']|["']$/g, "");
}

// ── 2. Cache check (Firestore lookup) ────────────────────────
export async function getCachedDebate(
  articleId: string
): Promise<ArticleDebateLink | null> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

  const snap = await firestoreDB
    .collection(LINK_COL)
    .where("articleId", "==", articleId)
    .where("createdAt", ">=", cutoff)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data() as ArticleDebateLink;
}

// ── 3. Enqueue ───────────────────────────────────────────────
export async function enqueueDebate(
  article: Pick<ProcessedArticle, "articleId" | "title" | "relevance">
): Promise<DebateQueueItem | null> {
  // Skip if below threshold
  if (article.relevance.score < RELEVANCE_THRESHOLD) return null;

  // Skip if already cached
  const cached = await getCachedDebate(article.articleId);
  if (cached) {
    console.log(`[Queue] Article ${article.articleId} has cached debate ${cached.debateId}`);
    return null;
  }

  // Skip if already queued
  const existing = await firestoreDB
    .collection(QUEUE_COL)
    .where("articleId", "==", article.articleId)
    .where("status", "in", ["pending", "processing"])
    .limit(1)
    .get();
  if (!existing.empty) return null;

  let debateTopic: string;
  try {
    debateTopic = await generateDebateTopic(article.title);
  } catch {
    debateTopic = `What are the implications of: "${article.title}"?`;
  }

  const item: DebateQueueItem = {
    queueId:        uuidv4(),
    articleId:      article.articleId,
    articleTitle:   article.title,
    debateTopic,
    relevanceScore: article.relevance.score,
    status:         "pending",
    createdAt:      new Date().toISOString(),
    retryCount:     0,
  };

  await firestoreDB.collection(QUEUE_COL).doc(item.queueId).set(item);
  console.log(`[Queue] Enqueued debate for "${article.title}" → "${debateTopic}"`);
  return item;
}

// ── 4. Batch enqueue (from news pipeline output) ─────────────
export async function enqueueHighRelevanceArticles(
  articles: ProcessedArticle[]
): Promise<number> {
  const highRelevance = articles.filter(
    (a) => a.relevance.score >= RELEVANCE_THRESHOLD
  );

  let enqueued = 0;
  for (const article of highRelevance) {
    const item = await enqueueDebate(article).catch(() => null);
    if (item) enqueued++;
    // Small delay between enqueues to avoid Firestore write bursts
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[Queue] Enqueued ${enqueued}/${highRelevance.length} high-relevance articles`);
  return enqueued;
}

// ── 5. Process one queue item ─────────────────────────────────
export async function processQueueItem(item: DebateQueueItem): Promise<void> {
  const ref = firestoreDB.collection(QUEUE_COL).doc(item.queueId);

  // Mark as processing
  await ref.update({ status: "processing", startedAt: new Date().toISOString() });

  try {
    // Run the full debate pipeline
    const agentResponses = await runAllAgents(item.debateTopic);

    const [synthesisResult, factCheckResult] = await Promise.allSettled([
      synthesiseDebate(item.debateTopic, agentResponses),
      factCheckResponses(agentResponses),
    ]);

    const synthesis = synthesisResult.status === "fulfilled"
      ? synthesisResult.value
      : { agreements: [], contradictions: [], missingPerspectives: [], consensus: "" };
    const factChecks = factCheckResult.status === "fulfilled" ? factCheckResult.value : [];
    const followUpQuestions = await generateFollowUps(item.debateTopic, synthesis).catch(() => []);
    const modelPerformance = computePerformance(agentResponses);

    const debateId = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();

    // Persist debate
    const debateDoc = {
      debateId,
      topic: item.debateTopic,
      articleId: item.articleId,      // backlink to source article
      responses: Object.fromEntries(agentResponses.map((r) => [r.agent, r])),
      synthesis,
      factChecks,
      followUpQuestions,
      modelPerformance,
      createdAt: now,
      expiresAt,                      // Firestore TTL field
      autoGenerated: true,
    };

    const batch = firestoreDB.batch();

    batch.set(firestoreDB.collection(DEBATES_COL).doc(debateId), debateDoc);

    // Cache link
    const link: ArticleDebateLink = {
      articleId: item.articleId,
      debateId,
      debateTopic: item.debateTopic,
      createdAt: now,
      expiresAt,
    };
    batch.set(firestoreDB.collection(LINK_COL).doc(item.articleId), link);

    // Mark queue item done
    batch.update(ref, {
      status: "done",
      completedAt: now,
      debateId,
    });

    await batch.commit();
    console.log(`[Queue] ✓ Debate ${debateId} completed for article ${item.articleId}`);

    // Send push notification (fire-and-forget)
    sendDebateReadyNotification({
      articleId: item.articleId,
      debateId,
      topic: item.debateTopic,
    }).catch((err: unknown) => {
      console.error("[Push] Notification failed:", err);
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryCount = item.retryCount + 1;
    const failed = retryCount > MAX_RETRIES;

    await ref.update({
      status: failed ? "failed" : "pending",
      errorMessage: message,
      retryCount,
      startedAt: null,
    });

    console.error(`[Queue] ✗ Item ${item.queueId} failed (attempt ${retryCount}): ${message}`);
    if (failed) throw new Error(`Max retries exceeded: ${message}`);
  }
}

// ── 6. Process N items from the queue (rate-limit safe) ──────
export async function processPendingQueue(maxItems = 3): Promise<{
  processed: number;
  failed: number;
}> {
  const snap = await firestoreDB
    .collection(QUEUE_COL)
    .where("status", "==", "pending")
    .orderBy("createdAt", "asc")
    .limit(maxItems)
    .get();

  if (snap.empty) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    const item = doc.data() as DebateQueueItem;
    try {
      await processQueueItem(item);
      processed++;
    } catch {
      failed++;
    }
    // 2-second gap between debates to protect provider rate limits
    await new Promise((r) => setTimeout(r, 2_000));
  }

  return { processed, failed };
}

// ── 7. Get queue status snapshot ─────────────────────────────
export async function getQueueStatus(): Promise<{
  pending: number;
  processing: number;
  done: number;
  failed: number;
}> {
  const snap = await firestoreDB.collection(QUEUE_COL).get();
  const counts = { pending: 0, processing: 0, done: 0, failed: 0 };
  for (const doc of snap.docs) {
    const status = (doc.data() as DebateQueueItem).status;
    if (status in counts) counts[status as keyof typeof counts]++;
  }
  return counts;
}
