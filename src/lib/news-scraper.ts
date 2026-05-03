/**
 * news-scraper.ts
 * ═══════════════
 * Election-specific news aggregation layer.
 *
 * Extends the generic news-fetcher with election-focused RSS
 * sources (ECI, The Hindu Elections, Indian Express, PIB, etc.)
 * and re-uses the existing 5-step AI pipeline to process them.
 *
 * Results are stored in the `election_news` Firestore collection
 * (separate from the generic `articles` collection).
 *
 * Usage:
 *   const articles = await aggregateElectionNews();
 *   const articles = await aggregateElectionNews({ state: "Maharashtra", limit: 15 });
 */

import Parser from "rss-parser";
import { v4 as uuidv4 } from "uuid";
import { firestoreDB } from "./firebase-admin";
import { processBatch } from "./news-pipeline";
import type { RawArticle, ProcessedArticle } from "./news-types";

// ── Election-specific RSS / API sources ───────────────────────
interface ElectionSource {
  name:     string;
  rss?:     string;          // primary RSS endpoint
  fallback?: string;         // alternative RSS if primary fails
  category: "official" | "national_media" | "state" | "legal";
  credibility: number;       // 0-1 for relevance scoring override
}

export const ELECTION_SOURCES: Record<string, ElectionSource> = {
  eci: {
    name: "Election Commission of India",
    rss:  "https://eci.gov.in/rss-feed/",
    fallback: "https://news.google.com/rss/search?q=election+commission+India&hl=en-IN&gl=IN&ceid=IN:en",
    category: "official",
    credibility: 1.0,
  },
  pib: {
    name: "Press Information Bureau — Elections",
    rss:  "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3",
    category: "official",
    credibility: 0.95,
  },
  theHindu: {
    name: "The Hindu — Elections",
    rss:  "https://www.thehindu.com/elections/feeder/default.rss",
    fallback: "https://news.google.com/rss/search?q=election+site:thehindu.com&hl=en-IN&gl=IN&ceid=IN:en",
    category: "national_media",
    credibility: 0.92,
  },
  indianExpress: {
    name: "Indian Express — Elections",
    rss:  "https://indianexpress.com/section/elections/feed/",
    fallback: "https://news.google.com/rss/search?q=election+site:indianexpress.com&hl=en-IN&gl=IN&ceid=IN:en",
    category: "national_media",
    credibility: 0.90,
  },
  ndtvElections: {
    name: "NDTV — Elections",
    rss:  "https://feeds.feedburner.com/ndtvnews-elections",
    fallback: "https://news.google.com/rss/search?q=election+site:ndtv.com&hl=en-IN&gl=IN&ceid=IN:en",
    category: "national_media",
    credibility: 0.85,
  },
  wire: {
    name: "The Wire — Politics",
    rss:  "https://thewire.in/category/politics/feed",
    category: "national_media",
    credibility: 0.82,
  },
  livelaw: {
    name: "LiveLaw — Election Law",
    rss:  "https://www.livelaw.in/rss/feed",
    category: "legal",
    credibility: 0.88,
  },
  googleNewsElections: {
    name: "Google News — India Elections",
    rss:  "https://news.google.com/rss/search?q=India+election+ECI+voter&hl=en-IN&gl=IN&ceid=IN:en",
    category: "national_media",
    credibility: 0.75,
  },
};

// Per-source credibility overrides for the relevance scorer
export const ELECTION_SOURCE_CREDIBILITY: Record<string, number> = Object.fromEntries(
  Object.values(ELECTION_SOURCES).map((s) => [s.name, s.credibility])
);

// ── RSS parser (shared singleton) ─────────────────────────────
const rssParser = new Parser({
  timeout: 12_000,
  customFields: { item: ["media:content", "content:encoded", "description"] },
});

// ── Text helpers ──────────────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g,  "&").replace(/&lt;/g,  "<")
    .replace(/&gt;/g,   ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'").replace(/\s{2,}/g, " ")
    .trim();
}

function truncate(text: string, max = 4000): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// ── Fetch a single RSS feed ───────────────────────────────────
async function fetchElectionFeed(
  key: string,
  source: ElectionSource
): Promise<RawArticle[]> {
  const urls = [source.rss, source.fallback].filter(Boolean) as string[];

  for (const url of urls) {
    try {
      const parsed = await rssParser.parseURL(url);
      const fetchedAt = new Date().toISOString();

      return (parsed.items ?? [])
        .filter((item) => item.title)
        .slice(0, 12)
        .map((item) => {
          const body =
            (item["content:encoded"] as string | undefined) ??
            item.content ??
            item.contentSnippet ??
            item.summary ??
            "";
          return {
            articleId:   uuidv4(),
            title:       item.title ?? "Untitled",
            rawText:     truncate(stripHtml((body || (item.title ?? "")))),
            url:         item.link ?? item.guid ?? "",
            source:      `ElectionRSS:${source.name}`,
            publishedAt: item.pubDate ?? item.isoDate ?? fetchedAt,
            fetchedAt,
            imageUrl:    undefined,
          };
        });
    } catch (err) {
      console.warn(`[ElectionScraper:${key}] ${url} failed:`, (err as Error).message);
    }
  }
  return [];
}

// ── Main aggregator ───────────────────────────────────────────
export interface AggregateOptions {
  /** Firestore collection to write to (default: election_news) */
  collection?: string;
  /** Max articles to process after dedup (default: 30) */
  limit?: number;
  /** Only fetch from specific source keys */
  sources?: string[];
  /** Progress callback */
  onProgress?: (done: number, total: number) => void;
}

export interface AggregateResult {
  runId:       string;
  totalFetched: number;
  totalProcessed: number;
  articles:    ProcessedArticle[];
  triggeredAt: string;
  completedAt: string;
}

export async function aggregateElectionNews(
  opts: AggregateOptions = {}
): Promise<AggregateResult> {
  const {
    collection = "election_news",
    limit      = 30,
    sources    = Object.keys(ELECTION_SOURCES),
    onProgress,
  } = opts;

  const runId      = uuidv4();
  const triggeredAt = new Date().toISOString();

  // ── Fetch from all election sources in parallel ───────────
  const fetchResults = await Promise.allSettled(
    sources
      .filter((k) => ELECTION_SOURCES[k])
      .map((k) => fetchElectionFeed(k, ELECTION_SOURCES[k]!))
  );

  const rawArticles = fetchResults.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = rawArticles.filter((a) => {
    if (!a.url || seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  const toProcess = unique.slice(0, limit);

  console.log(
    `[ElectionScraper:${runId}] Fetched ${rawArticles.length} → ${unique.length} unique → processing ${toProcess.length}`
  );

  // ── Run 5-step AI pipeline ────────────────────────────────
  const processed = await processBatch(toProcess, onProgress);

  // ── Persist to Firestore (batch write) ───────────────────
  const FIRESTORE_MAX_BATCH = 450; // Firestore limit is 500
  for (let i = 0; i < processed.length; i += FIRESTORE_MAX_BATCH) {
    const chunk = processed.slice(i, i + FIRESTORE_MAX_BATCH);
    const batch = firestoreDB.batch();
    for (const article of chunk) {
      const ref = firestoreDB.collection(collection).doc(article.articleId);
      batch.set(ref, {
        ...article,
        scheme:   { ...article.scheme,   data: article.scheme.data   ?? null },
        regional: { ...article.regional },
      }, { merge: true });   // merge prevents overwriting existing debates linked to this article
    }
    await batch.commit().catch((err: unknown) =>
      console.error(`[ElectionScraper:${runId}] Batch commit failed:`, err)
    );
  }

  const completedAt = new Date().toISOString();
  console.log(`[ElectionScraper:${runId}] Done — ${processed.length} articles persisted to '${collection}'`);

  return { runId, totalFetched: toProcess.length, totalProcessed: processed.length, articles: processed, triggeredAt, completedAt };
}
