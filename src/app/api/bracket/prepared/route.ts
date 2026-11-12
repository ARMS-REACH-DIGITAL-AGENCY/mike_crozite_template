import { NextResponse, type NextRequest } from 'next/server';
import { preparedIndex, preparedBoxes } from '@/lib/bracket/preparedIndex';

// Port of the tested 1A-6A prepared endpoint. Read-only in all environments:
// Production's existing hourly cron remains the sole scoring/results writer.
export const dynamic = 'force-dynamic';

// 2026 simulation preview: every request reads the isolated preview database's
// 2026bracketsim season (real 2026 pro stats, Round 1 played), with the clock
// frozen at 5 a.m. Arizona on Monday Apr 13, 2026 (after Round 1, before Round 2).
const SIM_SEASON = '2026bracketsim';
const SIM_NOW = Date.parse('2026-04-13T12:00:00Z');

export async function GET(req: NextRequest) {
  const season = SIM_SEASON;
  const boxes = req.nextUrl.searchParams.get('boxes');
  try {
    if (boxes !== null) {
      if (boxes.length > 32) return NextResponse.json({ error: 'Invalid Stat Ledger file' }, { status: 400 });
      const result = await preparedBoxes(season, boxes);
      return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } });
    }
    const result = await preparedIndex(season, SIM_NOW);
    if (!result) return NextResponse.json({ error: 'Prepared 2027 season unavailable' }, { status: 404 });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } });
  } catch (error) {
    console.error('[bracket/prepared]', error);
    return NextResponse.json({ error: 'Prepared bracket results unavailable' }, { status: 500 });
  }
}
