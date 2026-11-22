// Isolated 2026 historical test using the actual 2027 school field.
// Read ONLY from its dedicated Neon preview branch. Production returns 404.
import { NextRequest, NextResponse } from 'next/server';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { preparedIndex, preparedBoxes } from '@/lib/bracket/preparedIndex';
import { fieldReplayGame, fieldReplayRosters } from '@/lib/bracket/fieldReplayData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const SEASON = '2026-replay-2027-field';

let replayPool: Pool | null = null;
function pool() {
  if (!process.env.REPLAY_2027_FIELD_DATABASE_URL) throw Error('Isolated replay database is not configured');
  return replayPool ||= new Pool({
    connectionString: process.env.REPLAY_2027_FIELD_DATABASE_URL,
    max: 2, idleTimeoutMillis: 10000, ssl: { rejectUnauthorized: false },
  });
}
async function read<T extends QueryResultRow = QueryResultRow>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
  if (!/^\s*SELECT\b/i.test(sql)) throw Error('Replay reader permits SELECT only');
  return pool().query<T>(sql, params);
}
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') return NextResponse.json({ error: 'Preview only' }, { status: 404 });
  if (!process.env.REPLAY_2027_FIELD_DATABASE_URL)
    return NextResponse.json({ error: 'Isolated replay database not configured' }, { status: 503 });
  try {
    const params = request.nextUrl.searchParams;
    const asof = params.get('asof') || '2026-03-25';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asof) || asof < '2026-03-23' || asof > '2026-11-16')
      return NextResponse.json({ error: 'Invalid replay date' }, { status: 400 });
    if (params.has('roster')) {
      const hsid = Number(params.get('roster'));
      if (!Number.isInteger(hsid) || hsid <= 0)
        return NextResponse.json({ error: 'Invalid school' }, { status: 400 });
      const field = await read<{ hsid: number }>(
        "SELECT home_hsid AS hsid FROM public.master_bracket WHERE season_key=$1 AND stage='bracket' AND round=1 AND game_no=1 AND home_hsid=$2 " +
        "UNION ALL SELECT away_hsid AS hsid FROM public.master_bracket WHERE season_key=$1 AND stage='bracket' AND round=1 AND game_no=1 AND away_hsid=$2 LIMIT 1",
        [SEASON, hsid]);
      if (!field.rows.length) return NextResponse.json({error:'School not in replay field'}, {status:404});
      const rosters = await fieldReplayRosters(read,[hsid],asof);
      return NextResponse.json({roster:rosters.public[String(hsid)]||[]}, {headers:{'Cache-Control':'no-store'}});
    }
    const file = params.get('boxes');
    if (file !== null) {
      if (file.length > 32) return NextResponse.json({ error: 'Invalid box lookup' }, { status: 400 });
      return NextResponse.json(await preparedBoxes(SEASON, file, read), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (params.has('game')) {
      const id = Number(params.get('game'));
      if (!Number.isInteger(id) || id < 1 || id > 15368)
        return NextResponse.json({ error: 'Invalid game' }, { status: 400 });
      const result = await fieldReplayGame(read,id,asof);
      if (!result) return NextResponse.json({ error: 'Replay matchup unavailable' }, { status: 404 });
      return NextResponse.json({ ...result, status: result.winner ? 'final' : 'in_progress' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    // 4 AM Arizona = 11:00 UTC, so this date is interpreted as a bracket day.
    const at = Date.parse(asof + 'T11:00:00Z');
    if (!Number.isFinite(at)) return NextResponse.json({ error: 'Invalid replay date' }, { status: 400 });
    const prepared = await preparedIndex(SEASON, at, read);
    if (!prepared) return NextResponse.json({ error: 'Replay field unavailable' }, { status: 404 });
    return NextResponse.json(prepared, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[isolated 2026 replay]', error);
    return NextResponse.json({ error: 'Isolated replay unavailable' }, { status: 500 });
  }
}
