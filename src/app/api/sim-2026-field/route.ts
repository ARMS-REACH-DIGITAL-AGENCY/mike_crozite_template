// Isolated 2026 historical test using the actual 2027 school field.
// Read ONLY from its dedicated Neon preview branch. Production returns 404.
import { NextRequest, NextResponse } from 'next/server';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { preparedIndex, preparedBoxes } from '@/lib/bracket/preparedIndex';

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
  if (!/^\\s*SELECT\\b/i.test(sql)) throw Error('Replay reader permits SELECT only');
  return pool().query<T>(sql, params);
}
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') return NextResponse.json({ error: 'Preview only' }, { status: 404 });
  if (!process.env.REPLAY_2027_FIELD_DATABASE_URL)
    return NextResponse.json({ error: 'Isolated replay database not configured' }, { status: 503 });
  try {
    const params = request.nextUrl.searchParams;
    const file = params.get('boxes');
    if (file !== null) {
      if (file.length > 32) return NextResponse.json({ error: 'Invalid box lookup' }, { status: 400 });
      return NextResponse.json(await preparedBoxes(SEASON, file, read), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (params.has('game')) {
      const id = Number(params.get('game'));
      if (!Number.isInteger(id) || id < 1 || id > 15368)
        return NextResponse.json({ error: 'Invalid game' }, { status: 400 });
      const { rows } = await read<{ box: unknown, status: string }>(
        'SELECT box,status FROM public.master_bracket WHERE season_key=$1 AND game_id=$2 LIMIT 1',
        [SEASON, id],
      );
      if (!rows.length) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
      return NextResponse.json({ box: rows[0].box ?? null, status: rows[0].status }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const asof = params.get('asof') || '2026-03-25';
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(asof) || asof < '2026-03-23' || asof > '2026-11-16')
      return NextResponse.json({ error: 'Invalid replay date' }, { status: 400 });
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
