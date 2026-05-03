/**
 * ============================================================
 * News Processing Pipeline – Type Definitions
 * ============================================================
 */

// ── Category values the classifier can emit ──────────────────
export type ArticleCategory =
  | "Timeline Event"
  | "Scheme"
  | "Rule Change"
  | "Result"
  | "Analysis"
  | "Other";

// ── Raw article as fetched from a source ─────────────────────
export interface RawArticle {
  articleId: string;           // uuid generated at fetch time
  title: string;
  rawText: string;             // full body text or description
  url: string;
  source: string;              // e.g. "NewsAPI", "Google News", "RSS:hindu"
  publishedAt: string;         // ISO timestamp from source
  fetchedAt: string;           // ISO timestamp when we retrieved it
  imageUrl?: string;
}

// ── Per-step pipeline outputs ─────────────────────────────────
export interface SummaryResult {
  model: string;   // "gemini-1.5-flash"
  text: string;    // 3-sentence summary
}

export interface CategoryResult {
  model: string;   // "llama-3.1-8b-instant"
  value: ArticleCategory;
  confidence?: number;
}

export interface RelevanceResult {
  model: string;   // "mistral-7b"
  score: number;   // 0.0 – 1.0
  breakdown: {
    recency: number;
    sourceCredibility: number;
    impact: number;
  };
}

export interface SchemeData {
  eligibility: string[];
  deadlines: string[];
  documentsRequired: string[];
  officialLinks: string[];
  benefitAmount?: string;
  applicationProcess?: string;
}

export interface SchemeResult {
  model: string;   // "meta/llama-3.1-70b-instruct"
  data: SchemeData | null;     // null if article is not scheme-related
  isScheme: boolean;
}

export interface RegionalResult {
  model: string;   // "gemini-1.5-flash"
  regions: string[];           // ["Maharashtra", "Karnataka", "National"]
  language?: string;           // detected language of source
}

// ── The complete Firestore document (ProcessedArticle) ────────
export interface ProcessedArticle extends RawArticle {
  summary: SummaryResult;
  category: CategoryResult;
  relevance: RelevanceResult;
  scheme: SchemeResult;
  regional: RegionalResult;
  processedAt: string;         // ISO timestamp
  pipelineDurationMs: number;
  /** true if any pipeline step failed and used a fallback value */
  hadPipelineError: boolean;
}

// ── Batch processing summary (returned by the endpoint) ──────
export interface ProcessingRun {
  runId: string;
  startedAt: string;
  completedAt: string;
  source: string;
  totalFetched: number;
  totalProcessed: number;
  totalFailed: number;
  avgPipelineDurationMs: number;
  articles: ProcessedArticle[];
}
