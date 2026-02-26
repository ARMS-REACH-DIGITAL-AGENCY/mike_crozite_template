// src/lib/db.ts
// YAT?STATS — Database helpers
// Connects to Neon Postgres via DATABASE_URL env var.
// All player data is sourced from TheBaseballCube tables.
//
// Key tables:
//   tbc_players_raw   — player identity, position, bats/throws, height/weight, highlevel (historical peak)
//   tbc_batting_raw   — season batting stats per player per year (highlevel = level that season)
//   tbc_pitching_raw  — season pitching stats per player per year
//   player_hsids      — links playerid -> hsid (high school)
//   tbc_schools_raw   — high school info (hsid, hsname, colors, nickname) — NOT pro/college teams
//   school_success    — per-school metadata (rank, counts, staging/microsite URLs, colors)
//   teams             — currently empty; team names not yet populated
//
// "Active" = player has batting or pitching stats from 2025 (proxy for 2026 activity)
// "All-time" = all players ever tagged to a school in player_hsids

'use server';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import 'server-only';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: { rejectUnauthorized: false },
});

// Generic query helper
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Normalize host/URL input -> { hostOnly, httpsUrl }
// ---------------------------------------------------------------------------
function normalizeHostOrUrl(input: string) {
  const raw = (input || '').trim();
  if (!raw) return { hostOnly: '', httpsUrl: '' };
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let host = '';
  try {
    const u = new URL(withProto);
    host = (u.hostname || '').toLowerCase();
  } catch {
    host = raw
      .replace(/^https?:\/\//i, '')
      .split('/')[0].split('?')[0].split('#')[0].split(':')[0]
      .toLowerCase();
  }
  const hostOnly = host;
  const httpsUrl = hostOnly ? `https://${hostOnly}` : '';
  return { hostOnly, httpsUrl };
}

// ---------------------------------------------------------------------------
// School lookups (from school_success table)
// ---------------------------------------------------------------------------
export async function getSchoolByHsid(hsid: string) {
  try {
    const { rows } = await query(
      'SELECT * FROM school_success WHERE hsid = $1 LIMIT 1',
      [hsid]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('getSchoolByHsid error:', err);
    return null;
  }
}

export async function getSchoolByUrl(hostOrUrl: string) {
  try {
    const { hostOnly, httpsUrl } = normalizeHostOrUrl(hostOrUrl);
    if (!hostOnly || !httpsUrl) return null;
    const candidates = Array.from(new Set([httpsUrl, hostOnly]));
    const sql = `
      SELECT *
      FROM school_success
      WHERE staging_url = ANY($1::text[])
         OR microsite_url = ANY($1::text[])
      LIMIT 1
    `;
    const { rows } = await query(sql, [candidates]);
    return rows[0] || null;
  } catch (err) {
    console.error('getSchoolByUrl error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// ACTIVE ROSTER — players with 2025 stats (homepage)
//
// Returns one row per player with their most recent season stats.
// "Active" = has batting OR pitching stats in year 2025.
// Level shown is from the most recent stat row (not historical peak).
// Team name is not available (teams table is empty) — level chip used instead.
// ---------------------------------------------------------------------------
export async function getActiveRosterByHsid(hsid: string): Promise<any[]> {
  const sql = `
    WITH school_players AS (
      SELECT
        ph.playerid,
        tp.firstname,
        tp.lastname,
        tp.highlevel    AS career_highlevel,
        tp.ht           AS height,
        tp.wt           AS weight,
        tp.bats,
        tp.throws,
        tp.posit        AS position
      FROM player_hsids ph
      JOIN tbc_players_raw tp ON ph.playerid::text = tp.playerid::text
      WHERE ph.hsid = $1
    ),

    -- Most recent batting season for each player
    latest_batting AS (
      SELECT DISTINCT ON (playerid)
        playerid::text  AS playerid,
        year            AS stat_year,
        teamid,
        highlevel       AS bat_level,
        g, ab, r, h,
        dbl             AS "2b",
        tpl             AS "3b",
        hr, rbi, sb, bb, so,
        bavg            AS avg,
        obp, slg, ops,
        draft_info,
        playyears
      FROM tbc_batting_raw
      ORDER BY playerid, year DESC
    ),

    -- Most recent pitching season for each player
    latest_pitching AS (
      SELECT DISTINCT ON (playerid)
        playerid::text  AS playerid,
        year            AS pitch_year,
        teamid          AS pit_teamid,
        highlevel       AS pit_level,
        g               AS pg,
        gs, w, l,
        sv              AS saves,
        ip,
        bb              AS pbb,
        so              AS ko,
        era, whip,
        h9, bb9,
        so9             AS k9,
        so_bb           AS kbb,
        draft_info      AS pit_draft_info,
        playyears       AS pit_playyears
      FROM tbc_pitching_raw
      ORDER BY playerid, year DESC
    ),

    -- Active players: those with 2025 batting OR pitching stats
    active_playerids AS (
      SELECT DISTINCT playerid::text AS playerid
      FROM tbc_batting_raw
      WHERE year = '2025'
        AND playerid::text IN (SELECT playerid::text FROM school_players)
      UNION
      SELECT DISTINCT playerid::text AS playerid
      FROM tbc_pitching_raw
      WHERE year = '2025'
        AND playerid::text IN (SELECT playerid::text FROM school_players)
    )

    SELECT
      sp.playerid,
      sp.firstname,
      sp.lastname,
      COALESCE(NULLIF(TRIM(sp.firstname || ' ' || sp.lastname), ''), sp.playerid::text) AS display_name,
      -- Use level from most recent stat row (current level), fall back to career peak
      COALESCE(
        CASE
          WHEN lp.pitch_year IS NOT NULL AND (lb.stat_year IS NULL OR lp.pitch_year::int >= lb.stat_year::int)
          THEN lp.pit_level
          ELSE lb.bat_level
        END,
        sp.career_highlevel
      )                                     AS level,
      sp.height,
      sp.weight,
      sp.bats,
      sp.throws,
      sp.position,
      -- Batting stats
      lb.stat_year,
      lb.g, lb.ab, lb.r, lb.h,
      lb."2b", lb."3b", lb.hr, lb.rbi, lb.sb, lb.bb, lb.so,
      lb.avg, lb.obp, lb.slg, lb.ops,
      COALESCE(lb.draft_info, lp.pit_draft_info)  AS draft_info,
      COALESCE(lb.playyears, lp.pit_playyears)     AS playyears,
      -- Pitching stats
      lp.pitch_year,
      lp.pg, lp.gs, lp.w, lp.l, lp.saves,
      lp.ip, lp.pbb, lp.ko,
      lp.era, lp.whip, lp.h9, lp.bb9, lp.k9, lp.kbb,
      -- Pitcher flag: has pitching stats AND (no batting stats OR pitching year >= batting year)
      CASE
        WHEN lp.pitch_year IS NOT NULL AND (
          lb.stat_year IS NULL OR lp.pitch_year::int >= lb.stat_year::int
        ) THEN true
        ELSE false
      END AS is_pitcher
    FROM school_players sp
    JOIN active_playerids ap ON sp.playerid::text = ap.playerid
    LEFT JOIN latest_batting  lb ON sp.playerid::text = lb.playerid
    LEFT JOIN latest_pitching lp ON sp.playerid::text = lp.playerid
    ORDER BY
      CASE COALESCE(
        CASE
          WHEN lp.pitch_year IS NOT NULL AND (lb.stat_year IS NULL OR lp.pitch_year::int >= lb.stat_year::int)
          THEN lp.pit_level ELSE lb.bat_level
        END, sp.career_highlevel)
        WHEN 'MLB'        THEN 1
        WHEN 'TRIPLE-A'   THEN 2
        WHEN 'AAA'        THEN 2
        WHEN 'DOUBLE-A'   THEN 3
        WHEN 'AA'         THEN 3
        WHEN 'HIGH-A'     THEN 4
        WHEN 'A+'         THEN 4
        WHEN 'LOW-A'      THEN 5
        WHEN 'A'          THEN 5
        WHEN 'Indy'       THEN 6
        WHEN 'NCAA'       THEN 7
        WHEN 'JrCollege'  THEN 8
        WHEN 'NAIA'       THEN 9
        ELSE 10
      END,
      sp.lastname,
      sp.firstname
  `;
  try {
    const { rows } = await query(sql, [hsid]);
    return rows;
  } catch (err) {
    console.error('getActiveRosterByHsid error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// ALL-TIME ROSTER — every alumni ever tagged to a school (all-time page)
//
// Returns all players regardless of activity, with their career best stats.
// Used for the "All-Time Next Level List" page.
// ---------------------------------------------------------------------------
export async function getAllTimeRosterByHsid(hsid: string): Promise<any[]> {
  const sql = `
    WITH school_players AS (
      SELECT
        ph.playerid,
        tp.firstname,
        tp.lastname,
        tp.highlevel    AS career_highlevel,
        tp.ht           AS height,
        tp.wt           AS weight,
        tp.bats,
        tp.throws,
        tp.posit        AS position
      FROM player_hsids ph
      JOIN tbc_players_raw tp ON ph.playerid::text = tp.playerid::text
      WHERE ph.hsid = $1
    ),

    -- Career batting totals (all years combined via most recent year for display)
    latest_batting AS (
      SELECT DISTINCT ON (playerid)
        playerid::text  AS playerid,
        year            AS stat_year,
        highlevel       AS bat_level,
        g, ab, r, h,
        dbl             AS "2b",
        hr, rbi, sb, bb,
        bavg            AS avg,
        obp, slg, ops,
        draft_info,
        playyears
      FROM tbc_batting_raw
      ORDER BY playerid, year DESC
    ),

    latest_pitching AS (
      SELECT DISTINCT ON (playerid)
        playerid::text  AS playerid,
        year            AS pitch_year,
        highlevel       AS pit_level,
        g               AS pg,
        w, l,
        sv              AS saves,
        ip,
        so              AS ko,
        era, whip,
        draft_info      AS pit_draft_info,
        playyears       AS pit_playyears
      FROM tbc_pitching_raw
      ORDER BY playerid, year DESC
    ),

    -- Was player active in 2025?
    active_2025 AS (
      SELECT DISTINCT playerid::text AS playerid
      FROM tbc_batting_raw WHERE year = '2025'
        AND playerid::text IN (SELECT playerid::text FROM school_players)
      UNION
      SELECT DISTINCT playerid::text AS playerid
      FROM tbc_pitching_raw WHERE year = '2025'
        AND playerid::text IN (SELECT playerid::text FROM school_players)
    )

    SELECT
      sp.playerid,
      sp.firstname,
      sp.lastname,
      COALESCE(NULLIF(TRIM(sp.firstname || ' ' || sp.lastname), ''), sp.playerid::text) AS display_name,
      sp.career_highlevel                   AS level,
      sp.height,
      sp.weight,
      sp.bats,
      sp.throws,
      sp.position,
      lb.stat_year,
      lb.bat_level                          AS current_level,
      lb.g, lb.ab, lb.r, lb.h,
      lb."2b", lb.hr, lb.rbi, lb.sb, lb.bb,
      lb.avg, lb.obp, lb.slg, lb.ops,
      COALESCE(lb.draft_info, lp.pit_draft_info) AS draft_info,
      COALESCE(lb.playyears, lp.pit_playyears)   AS playyears,
      lp.pitch_year,
      lp.pg, lp.w, lp.l, lp.saves,
      lp.ip, lp.ko, lp.era, lp.whip,
      CASE WHEN a25.playerid IS NOT NULL THEN true ELSE false END AS is_active_2025,
      CASE
        WHEN lp.pitch_year IS NOT NULL AND (
          lb.stat_year IS NULL OR lp.pitch_year::int >= lb.stat_year::int
        ) THEN true
        ELSE false
      END AS is_pitcher
    FROM school_players sp
    LEFT JOIN latest_batting  lb ON sp.playerid::text = lb.playerid
    LEFT JOIN latest_pitching lp ON sp.playerid::text = lp.playerid
    LEFT JOIN active_2025     a25 ON sp.playerid::text = a25.playerid
    ORDER BY
      CASE sp.career_highlevel
        WHEN 'MLB'        THEN 1
        WHEN 'TRIPLE-A'   THEN 2
        WHEN 'AAA'        THEN 2
        WHEN 'DOUBLE-A'   THEN 3
        WHEN 'AA'         THEN 3
        WHEN 'HIGH-A'     THEN 4
        WHEN 'A+'         THEN 4
        WHEN 'LOW-A'      THEN 5
        WHEN 'A'          THEN 5
        WHEN 'Indy'       THEN 6
        WHEN 'NCAA'       THEN 7
        WHEN 'JrCollege'  THEN 8
        WHEN 'NAIA'       THEN 9
        ELSE 10
      END,
      sp.lastname,
      sp.firstname
  `;
  try {
    const { rows } = await query(sql, [hsid]);
    return rows;
  } catch (err) {
    console.error('getAllTimeRosterByHsid error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// NEWS ARTICLES — from news_articles table (populated by Webz.io cron job)
// Returns null if table doesn't exist yet (graceful degradation)
// ---------------------------------------------------------------------------
export async function getNewsByHsid(hsid: string, limit = 50): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT * FROM news_articles WHERE hsid = $1 ORDER BY published_at DESC LIMIT $2`,
      [hsid, limit]
    );
    return rows;
  } catch {
    // Table doesn't exist yet — return empty array gracefully
    return [];
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
declare global {
  var __pgPoolShutdownRegistered: any;
}
if (!global.__pgPoolShutdownRegistered) {
  global.__pgPoolShutdownRegistered = true;
  const shutdown = async () => {
    try { await pool.end(); } catch { /* ignore */ }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
}
