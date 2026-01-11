// src/lib/db.ts
import { Pool, QueryResult } from 'pg';

declare global {
  // Prevent multiple pools in dev / HMR
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

function createPool(): Pool {
  return new Pool({
    connectionString,
    max: Number(process.env.PG_MAX_POOL ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  });
}

const pool: Pool = global.__pgPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  global.__pgPool = pool;
}

/**
 * Generic query helper
 * IMPORTANT: do NOT pass the generic to pool.query()
 */
export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  return pool.query(text, params) as Promise<QueryResult<T>>;
}

/* =========================
   High-level DB helpers
   ========================= */

export async function getSchoolByHsid(hsid: string) {
  const sql = `
    SELECT *
    FROM public.school_success
    WHERE hsid = $1
    LIMIT 1
  `;

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
  if (!playerIds.length) return {};

  const battingSql = `
    SELECT
      playerid,
      json_agg(
        json_build_object(
          'season', season,
          'team', team,
          'ab', ab,
          'r', r,
          'h', h,
          'hr', hr,
          'rbi', rbi,
          'avg', avg
        )
        ORDER BY season DESC
      ) AS batting_stats
    FROM public.tbc_batting_raw
    WHERE playerid = ANY($1)
    GROUP BY playerid
  `;

  const pitchingSql = `
    SELECT
      playerid,
      json_agg(
        json_build_object(
          'season', season,
          'team', team,
          'ip', ip,
          'er', er,
          'so', so,
          'era', era
        )
        ORDER BY season DESC
      ) AS pitching_stats
    FROM public.tbc_pitching_raw
    WHERE playerid = ANY($1)
    GROUP BY playerid
  `;

  const [batRes, pitRes] = await Promise.all([
    query(battingSql, [playerIds]),
    query(pitchingSql, [playerIds]),
  ]);

  const map: Record<
    string,
    { batting: any[]; pitching: any[] }
  > = {};

  for (const row of batRes.rows) {
    map[row.playerid] = {
      batting: row.batting_stats ?? [],
      pitching: [],
    };
  }

  for (const row of pitRes.rows) {
    map[row.playerid] ??= { batting: [], pitching: [] };
    map[row.playerid].pitching = row.pitching_stats ?? [];
  }

  return map;
}