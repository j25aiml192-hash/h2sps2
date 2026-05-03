/**
 * ============================================================
 * Firebase Cloud Functions — Firestore Triggers
 * ============================================================
 * Deploy this file separately:
 *   cd firebase-functions && npm install && firebase deploy --only functions
 *
 * This provides TRUE real-time triggers. The Next.js API routes
 * provide the same capability via polling/webhooks for Vercel.
 * ============================================================
 */

// NOTE: Install these in firebase-functions/package.json:
// "firebase-admin": "^12.0.0"
// "firebase-functions": "^6.0.0"

/*
import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const RELEVANCE_THRESHOLD = 0.8;
const AUTO_DEBATE_ENDPOINT = process.env.NEXT_PUBLIC_APP_URL + "/api/news/auto-debate";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

// ── Trigger: when a new article is written to Firestore ──────
export const onArticleCreated = functions.firestore.onDocumentCreated(
  "articles/{articleId}",
  async (event) => {
    const article = event.data?.data();
    if (!article) return;

    const relevanceScore: number = article?.relevance?.score ?? 0;

    if (relevanceScore < RELEVANCE_THRESHOLD) {
      functions.logger.info(
        `[Trigger] Article ${event.params.articleId} relevance ${relevanceScore} below threshold — skipping`
      );
      return;
    }

    functions.logger.info(
      `[Trigger] High-relevance article detected (${relevanceScore}) — enqueueing debate`
    );

    // POST to Next.js to enqueue (keeps business logic in one place)
    try {
      const res = await fetch(AUTO_DEBATE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CRON_SECRET}`,
        },
        body: JSON.stringify({ articles: [article] }),
      });

      if (!res.ok) {
        const text = await res.text();
        functions.logger.error(`[Trigger] Enqueue failed: ${text}`);
      } else {
        const data = await res.json();
        functions.logger.info(`[Trigger] Enqueued: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      functions.logger.error("[Trigger] Request failed:", err);
    }
  }
);

// ── Scheduled: process queue every 30 minutes ───────────────
export const processDebateQueue = functions.scheduler.onSchedule(
  "every 30 minutes",
  async () => {
    try {
      const res = await fetch(`${AUTO_DEBATE_ENDPOINT}`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      const data = await res.json();
      functions.logger.info(`[Cron] Queue processed: ${JSON.stringify(data)}`);
    } catch (err) {
      functions.logger.error("[Cron] Queue processing failed:", err);
    }
  }
);
*/

// Export placeholder so TypeScript doesn't complain about empty file
export const FIREBASE_FUNCTIONS_NOTE =
  "Uncomment the code above after installing firebase-functions in this directory. " +
  "Run: firebase init functions && firebase deploy --only functions";
