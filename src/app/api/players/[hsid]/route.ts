import { NextResponse, type NextRequest } from 'next/server';
import { getRosterByHsid } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ hsid: string }> }
) {
  const { hsid } = await context.params;

  try {
    const roster = await getRosterByHsid(hsid);
    return NextResponse.json(roster);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
