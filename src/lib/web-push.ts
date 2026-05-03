/**
 * ============================================================
 * Web Push Notification Service
 * ============================================================
 * Uses the VAPID protocol via the `web-push` npm package.
 *
 * Env vars required:
 *   VAPID_PUBLIC_KEY   — generated once via `npx web-push generate-vapid-keys`
 *   VAPID_PRIVATE_KEY  — keep secret, server-side only
 *   VAPID_SUBJECT      — mailto: or https: URL identifying the sender
 *
 * Subscriptions are stored in Firestore `push_subscriptions` collection.
 * ============================================================
 */
import webpush from "web-push";
import { firestoreDB } from "./firebase-admin";
import type { PushSubscriptionRecord, NotificationPayload } from "./auto-debate-types";

const SUBSCRIPTIONS_COL = "push_subscriptions";

// ── Initialise VAPID details (lazy, once per process) ────────
let _vapidInitialised = false;

function initVapid() {
  if (_vapidInitialised) return;
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    console.warn("[Push] VAPID keys not set — push notifications disabled");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  _vapidInitialised = true;
}

// ── Subscription ID (stable hash from endpoint) ──────────────
function subscriptionId(endpoint: string): string {
  // Simple, deterministic ID — avoids storing full endpoint as doc ID
  let hash = 0;
  for (let i = 0; i < endpoint.length; i++) {
    const char = endpoint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32-bit
  }
  return `sub_${Math.abs(hash).toString(36)}`;
}

// ── Save or update a subscription ────────────────────────────
export async function saveSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  topics: string[] = ["all"]
): Promise<PushSubscriptionRecord> {
  const subId = subscriptionId(subscription.endpoint);
  const record: PushSubscriptionRecord = {
    subscriptionId: subId,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    topics,
    createdAt: new Date().toISOString(),
  };

  await firestoreDB.collection(SUBSCRIPTIONS_COL).doc(subId).set(record, { merge: true });
  return record;
}

// ── Remove a subscription ─────────────────────────────────────
export async function removeSubscription(endpoint: string): Promise<void> {
  const subId = subscriptionId(endpoint);
  await firestoreDB.collection(SUBSCRIPTIONS_COL).doc(subId).delete();
}

// ── Send a notification to all matching subscriptions ─────────
export async function sendNotification(
  payload: NotificationPayload,
  topics: string[] = ["all"]
): Promise<{ sent: number; failed: number }> {
  initVapid();
  if (!_vapidInitialised) return { sent: 0, failed: 0 };

  // Fetch subscriptions interested in any of the topics
  const snap = await firestoreDB
    .collection(SUBSCRIPTIONS_COL)
    .where("topics", "array-contains-any", topics.length > 0 ? topics : ["all"])
    .get();

  if (snap.empty) return { sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    snap.docs.map(async (doc) => {
      const record = doc.data() as PushSubscriptionRecord;
      await webpush.sendNotification(
        { endpoint: record.endpoint, keys: record.keys },
        JSON.stringify(payload)
      );
      // Update last notified timestamp (fire-and-forget)
      doc.ref.update({ lastNotifiedAt: new Date().toISOString() }).catch(() => undefined);
    })
  );

  const sent   = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  return { sent, failed };
}

// ── Convenience: debate-ready notification ───────────────────
export async function sendDebateReadyNotification(params: {
  articleId: string;
  debateId: string;
  topic: string;
}): Promise<void> {
  await sendNotification(
    {
      title: "🔥 Live Debate Ready",
      body: params.topic,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      tag: `debate-${params.debateId}`,
      data: {
        articleId: params.articleId,
        debateId:  params.debateId,
        url:       `/news?articleId=${params.articleId}&debateId=${params.debateId}`,
      },
    },
    ["all"]
  );
}
