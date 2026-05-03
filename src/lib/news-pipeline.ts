/**
 * ============================================================
 * News Processing Pipeline — 5-Step Model-Specialized Chain
 * ============================================================
 *
 * Step 1 · Summarization   → Gemini 1.5 Flash  (best summarizer)
 * Step 2 · Classification  → Groq Llama 3.1 8B (fast + accurate)
 * Step 3 · Relevance Score → Groq Llama 3.1 8B (free, replaces Together)
 * Step 4 · Scheme Extract  → NIM Llama 70B     (best reasoning)
 * Step 5 · Regional Tag    → Gemini 1.5 Flash  (multilingual)
 *
 * Execution strategy:
 *  Wave A (parallel, on raw text): Summary, SchemeExtract, Regional
 *  Wave B (parallel, on summary) : Classify, Relevance
 *
 * This cuts total latency by ~40% vs sequential execution.
 * ============================================================
 */
import {
  GeminiProvider,
  GroqProvider,
  NIMProvider,
} from "./ai-providers";
import type { RawArticle, ProcessedArticle } from "./news-types";
import type {
  ArticleCategory,
  SummaryResult,
  CategoryResult,
  RelevanceResult,
  SchemeResult,
  RegionalResult,
} from "./news-types";

// ── Provider singletons (lazy, shared across pipeline steps) ──
let _gemini: GeminiProvider | null = null;
let _groq: GroqProvider | null = null;
let _nim: NIMProvider | null = null;

function gemini() { return (_gemini ??= new GeminiProvider()); }
function groq()   { return (_groq   ??= new GroqProvider()); }
function nim()    { return (_nim    ??= new NIMProvider()); }

// ── JSON parse helper with fallback ──────────────────────────
function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
// STEP 1  ·  SUMMARIZATION  (Gemini 1.5 Flash)
// ─────────────────────────────────────────────────────────────
const SUMMARY_MODEL = "gemini-1.5-flash";

async function summarise(article: RawArticle): Promise<SummaryResult> {
  const prompt = `Summarise the following news article in exactly 3 concise sentences. 
Cover: (1) What happened, (2) Why it matters, (3) Who is affected.
Return ONLY the 3-sentence summary, nothing else.

Title: ${article.title}
Text: ${article.rawText.slice(0, 3000)}`;

  const text = await gemini().chat(
    [{ role: "user", content: prompt }],
    { model: SUMMARY_MODEL, temperature: 0.1, maxTokens: 200 }
  );

  return { model: SUMMARY_MODEL, text: text.trim() };
}

// ─────────────────────────────────────────────────────────────
// STEP 2  ·  CLASSIFICATION  (Groq Llama 3.1 8B)
// ─────────────────────────────────────────────────────────────
const CLASSIFY_MODEL = "llama-3.1-8b-instant";
const VALID_CATEGORIES: ArticleCategory[] = [
  "Timeline Event", "Scheme", "Rule Change", "Result", "Analysis",
];

async function classify(
  summary: string,
  title: string
): Promise<CategoryResult> {
  const prompt = `Classify this news article into exactly ONE of these categories:
Timeline Event | Scheme | Rule Change | Result | Analysis

Definitions:
- Timeline Event: An event that happened on a specific date (election, disaster, launch)
- Scheme: A government welfare/subsidy/benefit programme
- Rule Change: A policy, law, or regulation change
- Result: Election results, exam results, court verdicts
- Analysis: Opinion, editorial, expert commentary

Respond ONLY with a JSON object, no markdown:
{"category": "...", "confidence": 0.XX}

Title: ${title}
Summary: ${summary}`;

  const raw = await groq().chat(
    [{ role: "user", content: prompt }],
    { model: CLASSIFY_MODEL, temperature: 0.0, maxTokens: 60 }
  );

  const parsed = safeParseJSON<{ category?: string; confidence?: number }>(raw, {});
  const value = VALID_CATEGORIES.find((c) => c === parsed.category) ?? "Other" as ArticleCategory;

  return {
    model: CLASSIFY_MODEL,
    value,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
  };
}

// ─────────────────────────────────────────────────────────────
// STEP 3  ·  RELEVANCE SCORING  (Groq Llama 3.1 8B — free tier)
// ─────────────────────────────────────────────────────────────
const RELEVANCE_MODEL = "llama-3.1-8b-instant";

function recencyScore(publishedAt: string): number {
  const ageHours = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000;
  if (ageHours <= 6)  return 1.0;
  if (ageHours <= 24) return 0.8;
  if (ageHours <= 72) return 0.5;
  return 0.2;
}

const SOURCE_CREDIBILITY: Record<string, number> = {
  // Generic NewsAPI / RSS sources
  "NewsAPI:Reuters":           1.0,
  "NewsAPI:Times of India":    0.85,
  "NewsAPI:The Hindu":         0.9,
  "RSS:Google News India":     0.8,
  "RSS:Times of India":        0.85,
  "RSS:Hindu Business Line":   0.9,
  "RSS:NDTV India":            0.8,
  // Election-specific RSS sources (from news-scraper.ts)
  "ElectionRSS:Election Commission of India": 1.0,
  "ElectionRSS:Press Information Bureau — Elections": 0.95,
  "ElectionRSS:The Hindu — Elections":        0.92,
  "ElectionRSS:Indian Express — Elections":   0.90,
  "ElectionRSS:NDTV — Elections":             0.85,
  "ElectionRSS:The Wire — Politics":          0.82,
  "ElectionRSS:LiveLaw — Election Law":       0.88,
  "ElectionRSS:Google News — India Elections":0.75,
};

async function scoreRelevance(
  article: RawArticle,
  summary: string
): Promise<RelevanceResult> {
  const prompt = `Rate the societal impact of this news article for Indian citizens on a scale of 0.0 to 1.0.
Consider: policy impact, number of people affected, urgency, economic significance.

Respond ONLY with JSON, no markdown:
{"impact": 0.XX}

Title: ${article.title}
Summary: ${summary}`;

  const raw = await groq().chat(
    [{ role: "user", content: prompt }],
    { model: RELEVANCE_MODEL, temperature: 0.0, maxTokens: 30 }
  );

  const parsed = safeParseJSON<{ impact?: number }>(raw, {});
  const impact = Math.max(0, Math.min(1, parsed.impact ?? 0.5));
  const recency = recencyScore(article.publishedAt);
  const credibility = SOURCE_CREDIBILITY[article.source] ?? 0.6;
  const score = Math.round((recency * 0.35 + credibility * 0.25 + impact * 0.40) * 100) / 100;

  return {
    model: RELEVANCE_MODEL,
    score,
    breakdown: { recency, sourceCredibility: credibility, impact },
  };
}

// ─────────────────────────────────────────────────────────────
// STEP 4  ·  SCHEME EXTRACTION  (NIM Llama 70B)
// ─────────────────────────────────────────────────────────────
const SCHEME_MODEL = "meta/llama-3.1-70b-instruct";

async function extractScheme(article: RawArticle): Promise<SchemeResult> {
  const prompt = `Analyse this article. If it describes a government scheme, welfare programme, or subsidy, extract structured data.
If it is NOT about a scheme, return {"isScheme": false, "data": null}.

If it IS a scheme, return:
{
  "isScheme": true,
  "data": {
    "eligibility": ["criterion1", ...],
    "deadlines": ["deadline text", ...],
    "documentsRequired": ["doc1", ...],
    "officialLinks": ["url1", ...],
    "benefitAmount": "amount or null",
    "applicationProcess": "brief description or null"
  }
}

Return ONLY valid JSON, no markdown.

Title: ${article.title}
Text: ${article.rawText.slice(0, 2500)}`;

  const raw = await nim().chat(
    [{ role: "user", content: prompt }],
    { model: SCHEME_MODEL, temperature: 0.1, maxTokens: 500 }
  );

  const parsed = safeParseJSON<{ isScheme?: boolean; data?: SchemeResult["data"] }>(raw, {
    isScheme: false, data: null,
  });

  return {
    model: SCHEME_MODEL,
    isScheme: parsed.isScheme === true,
    data: parsed.data ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// STEP 5  ·  REGIONAL TAGGING  (Gemini — multilingual)
// ─────────────────────────────────────────────────────────────
const REGIONAL_MODEL = "gemini-1.5-flash";

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Delhi","Jammu and Kashmir","Ladakh","Puducherry","Chandigarh",
  "National",  // applies to all of India
];

async function tagRegions(article: RawArticle): Promise<RegionalResult> {
  const prompt = `Identify which Indian states or regions are mentioned in this article.
Also detect the primary language of the text.

Respond ONLY with JSON, no markdown:
{"regions": ["State1", "State2", ...], "language": "English"}

Rules:
- Only include states from this list: ${INDIAN_STATES.join(", ")}
- Add "National" if the article applies to all of India
- Return empty array if no specific region is mentioned
- regions must be an array of strings

Title: ${article.title}
Text: ${article.rawText.slice(0, 1500)}`;

  const raw = await gemini().chat(
    [{ role: "user", content: prompt }],
    { model: REGIONAL_MODEL, temperature: 0.0, maxTokens: 100 }
  );

  const parsed = safeParseJSON<{ regions?: unknown; language?: string }>(raw, {});

  const rawRegions = parsed.regions;
  const regions: string[] = Array.isArray(rawRegions)
    ? (rawRegions as unknown[]).filter((r): r is string => typeof r === "string" && INDIAN_STATES.includes(r))
    : [];

  return {
    model: REGIONAL_MODEL,
    regions: regions.length > 0 ? regions : ["National"],
    language: parsed.language ?? "English",
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN PIPELINE  ·  Process a single article
// ─────────────────────────────────────────────────────────────
async function pipelineStep<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<{ value: T; hadError: boolean }> {
  try {
    return { value: await fn(), hadError: false };
  } catch (err) {
    console.error(`[Pipeline:${name}] Failed:`, (err as Error).message);
    return { value: fallback, hadError: true };
  }
}

export async function processArticle(
  article: RawArticle
): Promise<ProcessedArticle> {
  const pipelineStart = Date.now();
  let hadPipelineError = false;

  // ── Wave A: parallel on raw text ───────────────────────────
  const [summaryOut, schemeOut, regionalOut] = await Promise.all([
    pipelineStep("summary",  () => summarise(article),       {
      model: SUMMARY_MODEL, text: article.title,
    }),
    pipelineStep("scheme",   () => extractScheme(article),   {
      model: SCHEME_MODEL, isScheme: false, data: null,
    }),
    pipelineStep("regional", () => tagRegions(article),      {
      model: REGIONAL_MODEL, regions: ["National"], language: "English",
    }),
  ]);

  hadPipelineError ||= summaryOut.hadError || schemeOut.hadError || regionalOut.hadError;
  const summary = summaryOut.value;

  // ── Wave B: parallel on summary ────────────────────────────
  const [categoryOut, relevanceOut] = await Promise.all([
    pipelineStep("category",  () => classify(summary.text, article.title), {
      model: CLASSIFY_MODEL, value: "Other" as ArticleCategory,
    }),
    pipelineStep("relevance", () => scoreRelevance(article, summary.text), {
      model: RELEVANCE_MODEL,
      score: 0.5,
      breakdown: { recency: 0.5, sourceCredibility: 0.6, impact: 0.5 },
    }),
  ]);

  hadPipelineError ||= categoryOut.hadError || relevanceOut.hadError;

  return {
    ...article,
    summary,
    category:  categoryOut.value,
    relevance: relevanceOut.value,
    scheme:    schemeOut.value,
    regional:  regionalOut.value,
    processedAt: new Date().toISOString(),
    pipelineDurationMs: Date.now() - pipelineStart,
    hadPipelineError,
  };
}

// ── Batch processor with concurrency control ─────────────────
const BATCH_CONCURRENCY = 3; // max simultaneous articles

export async function processBatch(
  articles: RawArticle[],
  onProgress?: (done: number, total: number) => void
): Promise<ProcessedArticle[]> {
  const results: ProcessedArticle[] = [];
  let done = 0;

  for (let i = 0; i < articles.length; i += BATCH_CONCURRENCY) {
    const batch = articles.slice(i, i + BATCH_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(processArticle));

    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error("[Batch] Article failed:", result.reason);
      }
      done++;
    }

    onProgress?.(done, articles.length);
  }

  return results;
}
