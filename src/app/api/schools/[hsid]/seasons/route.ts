// GET /api/schools/{hsid}/seasons - the school's approved varsity season
// results (record, achievement, the year badges' two lines), newest first.
// The coach timeline writes each season's headline from these.
import { NextRequest, NextResponse } from 'next/server';
import { getSchoolTeamSeasonResults } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  if (!/^\d+$/.test(hsid)) return NextResponse.json({ seasons: [] }, { status: 400 });
  try {
    const seasons = await getSchoolTeamSeasonResults(hsid);
    return NextResponse.json({ seasons }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
  } catch {
    return NextResponse.json({ seasons: [] }, { status: 503 });
  }
}
