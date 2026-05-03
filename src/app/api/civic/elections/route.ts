import { NextResponse } from 'next/server';
import { getElections } from '@/lib/civic-info';

export async function GET() {
  try {
    const elections = await getElections();
    return NextResponse.json({ elections });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
