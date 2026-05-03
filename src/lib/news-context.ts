import { firestoreDB as db } from './firebase-admin';
import { chat } from './ai-providers';

export interface NewsContext {
  recentArticles: NewsArticle[];
  relevantSchemes: Scheme[];
  officialUpdates: OfficialUpdate[];
}

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  summary: string;
  link: string;
  relevanceScore: number;
  publishedAt: Date;
}

export interface Scheme {
  name: string;
  eligibility: string[];
  documents: string[];
  deadline?: string;
  officialLink?: string;
  states: string[];
}

export interface OfficialUpdate {
  title: string;
  source: 'ECI' | 'Supreme Court' | 'State CEO';
  date: Date;
  summary: string;
  impact: string;
}

/**
 * Fetch contextual news for a debate topic
 */
export async function fetchNewsContext(
  topic: string, 
  userState?: string
): Promise<NewsContext> {
  
  // Step 1: Generate search keywords from topic using AI
  // const keywords = await extractKeywords(topic);
  
  // Step 2: Query Firestore for relevant news
  const articlesQuery = db.collection('election_news')
    .where('relevanceScore', '>', 0.6)
    .orderBy('relevanceScore', 'desc')
    .orderBy('processedAt', 'desc')
    .limit(5);
  
  // Add state filter if provided
  let query = articlesQuery;
  if (userState) {
    query = articlesQuery.where('regions', 'array-contains', userState);
  }

  const snapshot = await query.get();
  // Firestore timestamps need to be mapped properly if required, but casting as Date for the interface
  const recentArticles = snapshot.docs.map(doc => ({
    id: doc.id,
    title: doc.data().title,
    source: doc.data().source,
    summary: doc.data().summary,
    link: doc.data().link,
    relevanceScore: doc.data().relevanceScore,
    publishedAt: doc.data().publishedAt?.toDate?.() || new Date()
  })) as NewsArticle[];

  // Step 3: Find related schemes
  const schemesQuery = db.collection('election_news')
    .where('classification.category', '==', 'scheme')
    .orderBy('processedAt', 'desc')
    .limit(3);
  
  const schemesSnapshot = await schemesQuery.get();
  const relevantSchemes = schemesSnapshot.docs
    .map(doc => doc.data().schemeData)
    .filter(Boolean) as Scheme[];

  // Step 4: Get official ECI updates
  const eciQuery = db.collection('election_news')
    .where('source', '==', 'Election Commission of India')
    .orderBy('processedAt', 'desc')
    .limit(3);
  
  const eciSnapshot = await eciQuery.get();
  const officialUpdates = eciSnapshot.docs.map(doc => ({
    title: doc.data().title,
    source: 'ECI' as const,
    date: doc.data().publishedAt?.toDate?.() || new Date(),
    summary: doc.data().summary,
    impact: doc.data().classification.category
  }));

  return {
    recentArticles,
    relevantSchemes,
    officialUpdates
  };
}

export async function extractKeywords(topic: string): Promise<string[]> {
  const prompt = `Extract 3-5 search keywords from this election question.
Return ONLY a JSON array of keywords.

Question: ${topic}

Example output: ["voter registration", "deadline", "documents"]`;

  try {
    const response = await chat([{ role: 'user', content: prompt }], {
      temperature: 0.2,
      maxTokens: 100,
      chain: ['gemini', 'groq', 'together']
    });

    return JSON.parse(response.result.replace(/```json|```/g, '').trim());
  } catch (error) {
    console.error('[extractKeywords] failed:', error);
    return [];
  }
}

/**
 * Enhance agent prompts with news context
 */
export function enrichPromptWithContext(
  basePrompt: string,
  context: NewsContext,
  agentRole: string
): string {
  
  let enrichedPrompt = basePrompt;

  // Add recent news
  if (context.recentArticles.length > 0) {
    enrichedPrompt += `\n\n📰 RECENT NEWS CONTEXT:\n`;
    context.recentArticles.forEach((article, idx) => {
      enrichedPrompt += `${idx + 1}. ${article.title} (${article.source}, ${article.publishedAt.toLocaleDateString()})\n   ${article.summary}\n`;
    });
  }

  // Add schemes for Activist agent
  if (agentRole === 'activist' && context.relevantSchemes.length > 0) {
    enrichedPrompt += `\n\n📋 ACTIVE SCHEMES:\n`;
    context.relevantSchemes.forEach((scheme, idx) => {
      enrichedPrompt += `${idx + 1}. ${scheme.name}\n`;
      if (scheme.deadline) enrichedPrompt += `   Deadline: ${scheme.deadline}\n`;
      enrichedPrompt += `   States: ${scheme.states.join(', ')}\n`;
    });
  }

  // Add official updates for Professor/Journalist
  if (['professor', 'journalist'].includes(agentRole) && context.officialUpdates.length > 0) {
    enrichedPrompt += `\n\n🏛️ OFFICIAL UPDATES:\n`;
    context.officialUpdates.forEach((update, idx) => {
      enrichedPrompt += `${idx + 1}. ${update.title} (${update.source}, ${update.date.toLocaleDateString()})\n`;
    });
  }

  enrichedPrompt += `\n\nNow answer the user's question using this context where relevant. Cite specific news/schemes when applicable.`;

  return enrichedPrompt;
}
