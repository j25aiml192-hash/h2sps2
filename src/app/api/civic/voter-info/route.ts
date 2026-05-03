import { NextRequest, NextResponse } from 'next/server';
import { getVoterInfo } from '@/lib/civic-info';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json(
      { error: 'Address parameter required' },
      { status: 400 }
    );
  }

  try {
    const voterInfo = await getVoterInfo(address);
    
    if (!voterInfo) {
      return NextResponse.json(
        { error: 'No voter information found for this address' },
        { status: 404 }
      );
    }

    return NextResponse.json(voterInfo);

  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
