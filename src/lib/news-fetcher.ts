/**
 * ============================================================
 * News Fetcher
 * ============================================================
 * Sources:
 *  1. NewsAPI   – top headlines (country configurable)
 *  2. Google News RSS – free, no auth, good coverage
 *  3. Custom RSS feeds – configurable list
 *
 * Returns normalised RawArticle[] regardless of source.
 * Each article gets a UUID at fetch time.
 * ============================================================
 */
import Parser from "rss-parser";
import { v4 as uuidv4 } from "uuid";
import type { RawArticle } from "./news-types";

const rssParser = new Parser({
  timeout: 10_000,
  customFields: {
    item: ["media:content", "content:encoded", "description"],
  },
});

// ── Source configs ────────────────────────────────────────────
const RSS_FEEDS: { label: string; url: string }[] = [
  { label: "Google News India",  url: "https://news.google.com/rss?topic=h&hl=en-IN&gl=IN&ceid=IN:en" },
  { label: "Times of India",     url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms" },
  { label: "Hindu Business Line",url: "https://www.thehindubusinessline.com/feeder/default.rss" },
  { label: "NDTV India",         url: "https://feeds.feedburner.com/ndtvnews-india-news" },
];

const NEWS_API_URL = "https://newsapi.org/v2/top-headlines";
const NEWS_API_PARAMS = { country: "in", pageSize: "20", language: "en" };

// ── Text cleaning helper ──────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function truncate(text: string, chars = 4000): string {
  return text.length > chars ? text.slice(0, chars) + "…" : text;
}

// ─────────────────────────────────────────────────────────────
// Source 1: NewsAPI
// ─────────────────────────────────────────────────────────────
export async function fetchFromNewsAPI(query?: string): Promise<RawArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    console.warn("[NewsAPI] NEWS_API_KEY not set — skipping");
    return [];
  }

  const params = new URLSearchParams({
    ...NEWS_API_PARAMS,
    apiKey,
    ...(query ? { q: query } : {}),
  });

  try {
    const res = await fetch(`${NEWS_API_URL}?${params}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`NewsAPI ${res.status}`);

    const data = await res.json() as {
      articles?: {
        title?: string;
        description?: string;
        content?: string;
        url?: string;
        source?: { name?: string };
        publishedAt?: string;
        urlToImage?: string;
      }[];
    };

    const fetchedAt = new Date().toISOString();

    return (data.articles ?? [])
      .filter((a) => a.title && a.url)
      .map((a) => ({
        articleId: uuidv4(),
        title: a.title ?? "Untitled",
        rawText: truncate(
          stripHtml([a.description, a.content].filter(Boolean).join("\n"))
        ),
        url: a.url ?? "",
        source: `NewsAPI:${a.source?.name ?? "unknown"}`,
        publishedAt: a.publishedAt ?? fetchedAt,
        fetchedAt,
        imageUrl: a.urlToImage,
      }));
  } catch (err) {
    console.error("[NewsAPI] Fetch failed:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Source 2 + 3: RSS feeds
// ─────────────────────────────────────────────────────────────
async function fetchSingleRSS(
  feed: { label: string; url: string }
): Promise<RawArticle[]> {
  try {
    const parsed = await rssParser.parseURL(feed.url);
    const fetchedAt = new Date().toISOString();

    return (parsed.items ?? [])
      .filter((item) => item.title)
      .slice(0, 15)                     // cap per feed
      .map((item) => {
        const body =
          (item["content:encoded"] as string | undefined) ??
          item.content ??
          item.contentSnippet ??
          item.summary ??
          "";

        return {
          articleId: uuidv4(),
          title: item.title ?? "Untitled",
          rawText: truncate(stripHtml((body || item.title) ?? "")),
          url: item.link ?? item.guid ?? "",
          source: `RSS:${feed.label}`,
          publishedAt: item.pubDate ?? item.isoDate ?? fetchedAt,
          fetchedAt,
          imageUrl: undefined,
        };
      });
  } catch (err) {
    console.error(`[RSS:${feed.label}] Failed:`, err);
    return [];
  }
}

export async function fetchFromRSS(
  feeds: { label: string; url: string }[] = RSS_FEEDS
): Promise<RawArticle[]> {
  const results = await Promise.allSettled(feeds.map(fetchSingleRSS));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

// ─────────────────────────────────────────────────────────────
// Combined fetcher
// ─────────────────────────────────────────────────────────────
export type FetchSource = "newsapi" | "rss" | "all";

export async function fetchAllNews(
  source: FetchSource = "all",
  query?: string
): Promise<RawArticle[]> {
  const tasks: Promise<RawArticle[]>[] = [];

  if (source === "newsapi" || source === "all") {
    tasks.push(fetchFromNewsAPI(query));
  }
  if (source === "rss" || source === "all") {
    tasks.push(fetchFromRSS());
  }

  const results = await Promise.allSettled(tasks);
  const articles = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Deduplicate by URL
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (!a.url || seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}
