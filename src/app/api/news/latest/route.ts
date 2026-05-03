import { NextRequest, NextResponse } from 'next/server';
import { firestoreDB as db } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const state = searchParams.get('state');
  const category = searchParams.get('category');
  const limit = parseInt(searchParams.get('limit') || '10');

  try {
    let query = db.collection('election_news')
      .where('relevanceScore', '>', 0.5)
      .orderBy('relevanceScore', 'desc')
      .orderBy('processedAt', 'desc')
      .limit(limit);

    if (state) {
      query = query.where('regions', 'array-contains', state);
    }

    if (category) {
      query = query.where('classification.category', '==', category);
    }

    const snapshot = await query.get();
    const articles = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      publishedAt: doc.data().publishedAt?.toDate?.()?.toISOString(),
      processedAt: doc.data().processedAt?.toDate?.()?.toISOString()
    }));

    return NextResponse.json({ 
      articles, 
      count: articles.length,
      state,
      category 
    });

  } catch (error: unknown) {
    console.error('News fetch error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Unknown error",
      articles: [],
      count: 0
    }, { status: 500 });
  }
}
