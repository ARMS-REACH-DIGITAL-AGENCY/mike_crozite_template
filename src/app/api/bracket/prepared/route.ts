import { NextResponse, type NextRequest } from 'next/server';
import { preparedIndex, preparedBoxes } from '@/lib/bracket/preparedIndex';

// Port of the tested 1A-6A prepared endpoint. Read-only in all environments:
// Production's existing hourly cron remains the sole scoring/results writer.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const season = req.nextUrl.searchParams.get('season') || '2027';
  const boxes = req.nextUrl.searchParams.get('boxes');
  if (season !== '2027') return NextResponse.json({ error: 'Unknown tournament season' }, { status: 400 });
  try {
    if (boxes !== null) {
      if (boxes.length > 32) return NextResponse.json({ error: 'Invalid Stat Ledger file' }, { status: 400 });
      const result = await preparedBoxes(season, boxes);
      return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } });
    }
    const result = await preparedIndex(season);
    if (!result) return NextResponse.json({ error: 'Prepared 2027 season unavailable' }, { status: 404 });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } });
  } catch (error) {
    console.error('[bracket/prepared]', error);
    return NextResponse.json({ error: 'Prepared bracket results unavailable' }, { status: 500 });
  }
}
