/**
 * ============================================================
 * Auto-Debate Types
 * ============================================================
 */
import type { DebateRecord } from "./debate-types";

export type QueueItemStatus = "pending" | "processing" | "done" | "failed";

/** One entry in the Firestore `debate_queue` collection */
export interface DebateQueueItem {
  queueId: string;
  articleId: string;
  articleTitle: string;
  debateTopic: string;          // AI-generated from headline
  relevanceScore: number;
  status: QueueItemStatus;
  createdAt: string;            // ISO
  startedAt?: string;
  completedAt?: string;
  debateId?: string;            // populated when done
  errorMessage?: string;
  retryCount: number;
}

/** Firestore cache entry linking an article to its debate */
export interface ArticleDebateLink {
  articleId: string;
  debateId: string;
  debateTopic: string;
  createdAt: string;
  expiresAt: string;            // createdAt + 48h → Firestore TTL field
}

/** Push subscription stored in Firestore */
export interface PushSubscriptionRecord {
  subscriptionId: string;       // hash of endpoint
  endpoint: string;
  keys: { p256dh: string; auth: string };
  topics: string[];             // e.g. ["schemes", "elections", "all"]
  createdAt: string;
  lastNotifiedAt?: string;
}

/** Notification payload */
export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    articleId?: string;
    debateId?: string;
    url?: string;
  };
}

/** Enriched article card data (article + linked debate status) */
export interface ArticleWithDebate {
  articleId: string;
  hasDebate: boolean;
  debateId?: string;
  debateTopic?: string;
  debateStatus?: QueueItemStatus;
  debate?: Partial<DebateRecord>;
}
