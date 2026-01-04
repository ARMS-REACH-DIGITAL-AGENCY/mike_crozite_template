// src/lib/db.ts
import { Pool, QueryResult } from 'pg';

declare global {
  // Avoid creating multiple pools during HMR in dev
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __pgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set in environment');
}

function createPool(): Pool {
  return new Pool({
    connectionString,
    // keep using PG_MAX_POOL (matches your existing env var); fallback to 10
    max: parseInt(process.env.PG_MAX_POOL ?? '10', 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000,
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS) || 2000,
  });
}

// prefer globalThis to avoid TS complaints about `global`
const globalAny: any = globalThis as any;
const pool: Pool = globalAny.__pgPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalAny.__pgPool = pool;
}

// Export the pool itself so files that import `pool` work.
export { pool };

/** Basic query helper kept for existing code paths */
export async function query<T = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/* High-level helpers (used by API routes) */
export async function getSchoolByHsid(hsid: string) {
  const sql = `SELECT * FROM public.school_success WHERE hsid = $1 LIMIT 1`;
  const res = await query(sql, [hsid]);
  return res.rows[0] ?? null;
}

export async function getRosterByHsid(hsid: string) {
  const sql = `
    SELECT
      playerid,
      firstname,
      lastname,
      highlevel,
      position,
      number,
      team
    FROM public.hs_rosters_simple
    WHERE hsid = $1
    ORDER BY lastname NULLS LAST, firstname NULLS LAST
  `;
  const res = await query(sql, [hsid]);
  return res.rows;
}

export async function getStatsForPlayers(playerIds: string[]) {
  if (!playerIds || playerIds.length === 0) return {};

  const battingSql = `
    SELECT playerid,
           json_agg(json_build_object(
             'season', season, 'team', team, 'ab', ab, 'r', r,
             'h', h, 'hr', hr, 'rbi', rbi, 'avg', avg
           ) ORDER BY season DESC) AS batting_stats
    FROM public.tbc_batting_raw
    WHERE playerid = ANY($1)
    GROUP BY playerid
  `;
  const pitchingSql = `
    SELECT playerid,
           json_agg(json_build_object(
             'season', season, 'team', team, 'ip', ip, 'er', er,
             'so', so, 'era', era
           ) ORDER BY season DESC) AS pitching_stats
    FROM public.tbc_pitching_raw
    WHERE playerid = ANY($1)
    GROUP BY playerid
  `;

  const [batRes, pitRes] = await Promise.all([query(battingSql, [playerIds]), query(pitchingSql, [playerIds])]);

  const map: Record<string, { batting: any[]; pitching: any[] }> = {};
  for (const r of batRes.rows) {
    map[r.playerid] = map[r.playerid] ?? { batting: [], pitching: [] };
    map[r.playerid].batting = r.batting_stats ?? [];
  }
  for (const r of pitRes.rows) {
    map[r.playerid] = map[r.playerid] ?? { batting: [], pitching: [] };
    map[r.playerid].pitching = r.pitching_stats ?? [];
  }
  return map;
}
