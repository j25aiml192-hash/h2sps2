import { NextResponse } from 'next/server';
import { firestoreDB as db } from '@/lib/firebase-admin';

export async function GET() {
  try {
    // Aggregate analytics from Firestore
    const analyticsRef = db.collection('ai_analytics');
    const snapshot = await analyticsRef
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();

    const events = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data());

    // Calculate agent stats
    const agentStats = calculateAgentStats(events);

    return NextResponse.json({
      agents: agentStats,
      totalEvents: events.length
    });

  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateAgentStats(events: Record<string, any>[]) {
  const agents = ['professor', 'activist', 'journalist', 'citizen'];
  
  return agents.map(agentName => {
    const agentEvents = events.filter(e => e.agent === agentName);
    const successEvents = agentEvents.filter(e => e.event === 'success');

    const totalDebates = successEvents.length;
    const avgResponseTime = successEvents.length > 0
      ? successEvents.reduce((sum, e) => sum + (e.latency || 0), 0) / successEvents.length
      : 0;

    // Model usage distribution
    const modelUsage: Record<string, number> = {};
    successEvents.forEach(e => {
      const model = e.model || 'unknown';
      modelUsage[model] = (modelUsage[model] || 0) + 1;
    });

    // Convert to percentages
    const modelPercentages = Object.entries(modelUsage).reduce((acc, [model, count]) => {
      acc[model] = (count / totalDebates) * 100;
      return acc;
    }, {} as Record<string, number>);

    return {
      name: agentName,
      totalDebates,
      avgResponseTime,
      modelUsage: modelPercentages,
      userRating: 4.2 + Math.random() * 0.8, // Placeholder - integrate real ratings
      primaryModel: Object.keys(modelUsage)[0] || 'unknown'
    };
  });
}
