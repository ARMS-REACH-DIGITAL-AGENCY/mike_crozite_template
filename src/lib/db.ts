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
//   teams             — team_id → team_name lookup; populated via scripts/import-teams.ts
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
  // hsid column is an integer — non-numeric values would cause a Postgres
  // "invalid input syntax for integer" error (e.g. state-only subdomains
  // like "co" or "az" routed here by the middleware). Return null early.
  if (!/^\d+$/.test(hsid)) return null;
  const { rows } = await query(
    'SELECT * FROM school_success WHERE hsid = $1 LIMIT 1',
    [hsid]
  );
  return rows[0] || null;
}

export async function getSchoolByUrl(hostOrUrl: string) {
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
}

// ---------------------------------------------------------------------------
// ACTIVE ROSTER — players with 2025 stats (homepage)
//
// Returns one row per player with their most recent season stats.
// "Active" = has batting OR pitching stats in year 2025.
// Level shown is from the most recent stat row (not historical peak).
// Team name is looked up from the teams table via LEFT JOIN on team_id.
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
  const { rows } = await query(sql, [hsid]);
  return rows;
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
  const { rows } = await query(sql, [hsid]);
  return rows;
}

// ---------------------------------------------------------------------------
// SINGLE PLAYER — full player data for profile page
// ---------------------------------------------------------------------------
export async function getPlayerById(playerId: string): Promise<any | null> {
  const sql = `
    SELECT
      tp.playerid,
      tp.firstname,
      tp.lastname,
      tp.highlevel    AS career_highlevel,
      tp.ht           AS height,
      tp.wt           AS weight,
      tp.bats,
      tp.throws,
      tp.posit        AS position
    FROM tbc_players_raw tp
    WHERE tp.playerid::text = $1
    LIMIT 1
  `;
  const { rows } = await query(sql, [playerId]);
  return rows[0] || null;
}

export interface PlayerSlugMatch {
  playerid: string;
  firstname: string;
  lastname: string;
  hsid: string | null;
}

export async function findPlayersBySlug(slug: string, hsid?: string): Promise<PlayerSlugMatch[]> {
  const sql = `
    SELECT
      tp.playerid::text AS playerid,
      tp.firstname,
      tp.lastname,
      ph.hsid::text AS hsid
    FROM tbc_players_raw tp
    LEFT JOIN player_hsids ph ON ph.playerid::text = tp.playerid::text
    -- Keep slugging logic in sync with toPlayerSlug (src/lib/slug.ts)
    WHERE trim(both '-' from regexp_replace(lower(trim(coalesce(tp.firstname,'') || ' ' || coalesce(tp.lastname,''))), '-+', '-', 'g')) = $1
      ${hsid ? "AND (ph.hsid::text = $2 OR $2 IS NULL)" : ""}
    LIMIT 10
  `;
  const params = hsid ? [slug.toLowerCase(), hsid] : [slug.toLowerCase()];
  const { rows } = await query(sql, params);
  return rows as PlayerSlugMatch[];
}

// ---------------------------------------------------------------------------
// PLAYER SCHOOL — which school(s) a player is linked to
// ---------------------------------------------------------------------------
export async function getPlayerSchool(playerId: string): Promise<any | null> {
  const sql = `
    SELECT ph.hsid, ss.hsname, ss.hslocation, ss.nickname
    FROM player_hsids ph
    JOIN school_success ss ON ph.hsid::text = ss.hsid::text
    WHERE ph.playerid::text = $1
    LIMIT 1
  `;
  const { rows } = await query(sql, [playerId]);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// SEASON-BY-SEASON BATTING STATS — all years for a player
//
// Reads from public.vw_player_batting_seasons which resolves team names and
// level abbreviations via a join to public.teams.  This means the TEAM column
// shows the human-readable team_display value and the LVL column shows the
// per-season team_level (e.g. JUCO, NCAA-D1, Rookie, A, A+, AA, AAA, MLB)
// instead of a raw numeric teamid or a player-level highlevel field.
// Falls back to teamid::text when team_display is NULL (unresolved team).
// Falls back to '--' at render time when team_level is NULL (unknown level).
// Rows are sorted year ASC, then teamid ASC for stable ordering.
// ---------------------------------------------------------------------------
export async function getPlayerBattingStats(playerId: string): Promise<any[]> {
  const sql = `
    SELECT
      v.year,
      v.teamid,
      COALESCE(v.team_display, v.teamid::text) AS team_name,
      v.team_level AS level,
      v.g, v.ab, v.r, v.h,
      v.dbl AS "2b", v.tpl AS "3b",
      v.hr, v.rbi, v.sb, v.bb, v.so,
      v.bavg AS avg, v.obp, v.slg, v.ops,
      v.draft_info
    FROM public.vw_player_batting_seasons v
    WHERE v.playerid::text = $1
    ORDER BY v.year ASC, v.teamid ASC
  `;
  const { rows } = await query(sql, [playerId]);
  return rows;
}

// ---------------------------------------------------------------------------
// SEASON-BY-SEASON PITCHING STATS — all years for a player
//
// Reads from public.vw_player_pitching_seasons which resolves team names and
// level abbreviations via a join to public.teams.  This means the TEAM column
// shows the human-readable team_display value and the LVL column shows the
// per-season team_level (e.g. JUCO, NCAA-D1, Rookie, A, A+, AA, AAA, MLB)
// instead of a raw numeric teamid or a player-level highlevel field.
// Falls back to teamid::text when team_display is NULL (unresolved team).
// Falls back to '--' at render time when team_level is NULL (unknown level).
// Rows are sorted year ASC, then teamid ASC for stable ordering.
// ---------------------------------------------------------------------------
export async function getPlayerPitchingStats(playerId: string): Promise<any[]> {
  const sql = `
    SELECT
      v.year,
      v.teamid,
      COALESCE(v.team_display, v.teamid::text) AS team_name,
      v.team_level AS level,
      v.g, v.gs, v.w, v.l,
      v.sv AS saves, v.ip,
      v.h AS hits_allowed, v.er,
      v.bb, v.so AS ko,
      v.era, v.whip, v.h9, v.bb9,
      v.so9 AS k9, v.so_bb AS kbb,
      v.draft_info
    FROM public.vw_player_pitching_seasons v
    WHERE v.playerid::text = $1
    ORDER BY v.year ASC, v.teamid ASC
  `;
  const { rows } = await query(sql, [playerId]);
  return rows;
}

// ---------------------------------------------------------------------------
// CAREER AGGREGATE STATS — totals across all seasons
// ---------------------------------------------------------------------------
export async function getPlayerCareerBatting(playerId: string): Promise<any | null> {
  const sql = `
    SELECT
      COUNT(DISTINCT year) AS seasons,
      SUM(g::int) AS g, SUM(ab::int) AS ab, SUM(r::int) AS r, SUM(h::int) AS h,
      SUM(dbl::int) AS "2b", SUM(tpl::int) AS "3b",
      SUM(hr::int) AS hr, SUM(rbi::int) AS rbi, SUM(sb::int) AS sb,
      SUM(bb::int) AS bb, SUM(so::int) AS so,
      CASE WHEN SUM(ab::int) > 0 THEN ROUND(SUM(h::int)::numeric / SUM(ab::int), 3) ELSE NULL END AS avg,
      CASE WHEN SUM(ab::int) + SUM(bb::int) > 0 THEN ROUND((SUM(h::int) + SUM(bb::int))::numeric / (SUM(ab::int) + SUM(bb::int)), 3) ELSE NULL END AS obp
    FROM tbc_batting_raw
    WHERE playerid::text = $1
  `;
  const { rows } = await query(sql, [playerId]);
  return rows[0] || null;
}

export async function getPlayerCareerPitching(playerId: string): Promise<any | null> {
  const sql = `
    SELECT
      COUNT(DISTINCT year) AS seasons,
      SUM(g::int) AS g, SUM(gs::int) AS gs,
      SUM(w::int) AS w, SUM(l::int) AS l,
      SUM(sv::int) AS saves,
      SUM(ip::numeric) AS ip,
      SUM(er::int) AS er,
      SUM(so::int) AS ko, SUM(bb::int) AS bb,
      CASE WHEN SUM(ip::numeric) > 0 THEN ROUND(SUM(er::int)::numeric * 9 / SUM(ip::numeric), 2) ELSE NULL END AS era,
      CASE WHEN SUM(ip::numeric) > 0 THEN ROUND((SUM(bb::int) + SUM(h::int))::numeric / SUM(ip::numeric), 2) ELSE NULL END AS whip,
      CASE WHEN SUM(ip::numeric) > 0 THEN ROUND(SUM(so::int)::numeric * 9 / SUM(ip::numeric), 2) ELSE NULL END AS k9,
      CASE WHEN SUM(bb::int) > 0 THEN ROUND(SUM(so::int)::numeric / SUM(bb::int), 2) ELSE NULL END AS kbb
    FROM tbc_pitching_raw
    WHERE playerid::text = $1
  `;
  const { rows } = await query(sql, [playerId]);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// TEAM CONTEXT — optional organization / conference metadata for a team.
// Tries to read `organization` and `conference` columns from the teams table.
// These columns are optional — if they don't exist, returns null gracefully.
// When present: professional teams expose `organization` (e.g. "ATHLETICS"),
// college teams expose `conference` (e.g. "PAC-12" / "BIG 12").
// ---------------------------------------------------------------------------
export async function getTeamContext(teamId: string): Promise<{ organization?: string; conference?: string } | null> {
  try {
    const { rows } = await query(
      `SELECT
         COALESCE(organization, mlb_org, org)      AS organization,
         COALESCE(conference, league, association)  AS conference
       FROM teams
       WHERE team_id::text = $1
       LIMIT 1`,
      [teamId]
    );
    return rows[0] ?? null;
  } catch {
    // Columns may not exist yet — degrade gracefully
    return null;
  }
}

// ---------------------------------------------------------------------------
// TEAM SCHEDULE — chronological game feed for a given team_id.
// Reads from the `team_schedule` table which is populated externally.
// Returns rows ordered by game_date ASC.
// Degrades gracefully (returns []) if the table doesn't exist yet.
//
// Expected columns (flexible — only those present are used):
//   team_id        TEXT / INT  — matches teamid from tbc_batting_raw / tbc_pitching_raw
//   game_date      DATE        — date of game
//   home_away      TEXT        — 'H' or 'A' (or 'home'/'away')
//   opponent       TEXT        — opponent team name / abbreviation
//   result         TEXT        — 'W', 'L', 'T', or NULL for upcoming
//   home_score     INT / TEXT  — score for home team (optional)
//   away_score     INT / TEXT  — score for away team (optional)
//   status         TEXT        — 'SCHEDULED', 'FINAL', 'IN PROGRESS', etc.
// ---------------------------------------------------------------------------
export async function getTeamSchedule(teamId: string, limit = 200): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT * FROM v_team_schedule_feed WHERE tbc_teamid::text = $1 ORDER BY game_date ASC LIMIT $2`,
      [teamId, limit]
    );
    return rows;
  } catch {
    // Table doesn't exist yet — return empty array gracefully
    return [];
  }
}

// ---------------------------------------------------------------------------
// PLAYER GAME LOG — per-game batting stats for a player on a given team.
// Reads from `batting_game_log` / `pitching_game_log` tables if present.
// Returns rows keyed by game_date so the schedule renderer can look them up.
// Degrades gracefully (returns []) if the table doesn't exist yet.
//
// Expected batting_game_log columns:
//   playerid, team_id, game_date, h, ab, dbl, tpl, hr, rbi, r, so, bb, sf, sb
//
// Expected pitching_game_log columns:
//   playerid, team_id, game_date, ip, h, r, er, ko (or so), bb, decision
// ---------------------------------------------------------------------------
export async function getPlayerBattingGameLog(playerId: string, teamId: string): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT * FROM batting_game_log WHERE playerid::text = $1 AND team_id::text = $2 ORDER BY game_date ASC`,
      [playerId, teamId]
    );
    return rows;
  } catch {
    return [];
  }
}

export async function getPlayerPitchingGameLog(playerId: string, teamId: string): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT * FROM pitching_game_log WHERE playerid::text = $1 AND team_id::text = $2 ORDER BY game_date ASC`,
      [playerId, teamId]
    );
    return rows;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// NEWS ARTICLES — from news_articles table (populated by Webz.io cron job)
// Returns empty array if table doesn't exist yet (graceful degradation).
//
// Three query patterns matching the three news surfaces:
//   1. getNewsByHsid()   — Alumni News page (all articles for a school)
//   2. getNewsByPlayer() — Player profile + flip card teaser (player-scoped)
//
// getNewsByHsid now joins player identity rows so the API can:
//   • normalize level labels
//   • derive grad class from draft_info / playyears
//   • detect active-2025 status
//   • compute a confidence score to suppress false-positive name matches
// ---------------------------------------------------------------------------
export async function getNewsByHsid(hsid: string, limit = 50): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT
         na.*,
         tp.firstname        AS player_firstname,
         tp.lastname         AS player_lastname,
         tp.highlevel        AS player_highlevel,
         COALESCE(lb.draft_info,  lp.pit_draft_info)  AS player_draft_info,
         COALESCE(lb.playyears,   lp.pit_playyears)   AS player_playyears,
         CASE WHEN a25.playerid IS NOT NULL THEN true ELSE false END AS player_active
       FROM news_articles na
       LEFT JOIN tbc_players_raw tp
         ON na.playerid::text = tp.playerid::text
       LEFT JOIN LATERAL (
         SELECT draft_info, playyears
         FROM   tbc_batting_raw
         WHERE  playerid::text = na.playerid::text
         ORDER  BY year DESC
         LIMIT  1
       ) lb ON true
       LEFT JOIN LATERAL (
         SELECT draft_info AS pit_draft_info, playyears AS pit_playyears
         FROM   tbc_pitching_raw
         WHERE  playerid::text = na.playerid::text
         ORDER  BY year DESC
         LIMIT  1
       ) lp ON true
       LEFT JOIN LATERAL (
         SELECT DISTINCT playerid::text AS playerid
         FROM   tbc_batting_raw
         WHERE  year = '2025'
           AND  playerid::text = na.playerid::text
         LIMIT  1
       ) a25 ON true
       WHERE na.hsid = $1
       ORDER BY na.published_at DESC
       LIMIT $2`,
      [hsid, limit]
    );
    return rows;
  } catch {
    // Table doesn't exist yet — return empty array gracefully
    return [];
  }
}

export async function getNewsByPlayer(playerId: string, limit = 10): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT * FROM news_articles WHERE playerid = $1 ORDER BY published_at DESC LIMIT $2`,
      [playerId, limit]
    );
    return rows;
  } catch {
    // Table doesn't exist yet — return empty array gracefully
    return [];
  }
}

// ---------------------------------------------------------------------------
// PLAYER PHOTOS — uploaded career-progression photos for the filmstrip.
//
// Table columns (after migration 006):
//   player_id         TEXT / INT  — matches player imageId
//   image_url         TEXT        — full URL or S3 key for the photo
//   image_role        TEXT NULL   — display slot: YATSTATS_FRONT | LEFT_ANCHOR | RIGHT_ANCHOR
//                                   | HEADSHOT | TIMELINE
//   image_source      TEXT NULL   — supplier: FAN | PLAYER | MLB | LICENSED | STAFF
//                                   | SCHOOL | BOOSTER | IMPORT
//   approval_status   TEXT        — PENDING (default) | APPROVED | REJECTED
//   show_on_pp_timeline BOOLEAN   — true = include as a TIMELINE middle frame
//   team_name         TEXT        — label line 1
//   season_year       TEXT / INT  — label line 2
//   date_taken        DATE        — primary sort key
//   level             TEXT        — optional level tag (HS, College, AA, etc.)
//   caption           TEXT        — optional caption override
//
// RUNTIME RULES (mirror of src/lib/playerImage.ts slot table):
//   Designated slot images:  queried by image_role + approval_status='APPROVED'
//   Timeline middle frames:  queried by show_on_pp_timeline=true + approval_status='APPROVED'
//   image_role='TIMELINE' images are ONLY eligible as middle frames, never as anchors.
//
// All functions degrade gracefully (empty / null) if the table / columns don't exist.
// ---------------------------------------------------------------------------

/**
 * Returns the single designated player_photos row for a given role (APPROVED only).
 *
 * Supported roles: YATSTATS_FRONT | LEFT_ANCHOR | RIGHT_ANCHOR | HEADSHOT
 *
 * Returns null if:
 *   - no row exists for the given player + role
 *   - the table / new columns are not yet present (graceful degradation)
 */
export async function getDesignatedPlayerImage(
  imageId: string,
  role: string
): Promise<any | null> {
  try {
    const { rows } = await query(
      `SELECT *
         FROM player_photos
        WHERE player_id::text = $1
          AND image_role = $2
          AND approval_status = 'APPROVED'
          AND (is_active IS NULL OR is_active = TRUE)
        ORDER BY is_primary DESC NULLS LAST, date_taken DESC NULLS LAST, id DESC
        LIMIT 1`,
      [imageId, role]
    );
    return rows[0] || null;
  } catch {
    // Table or columns don't exist yet — degrade gracefully
    return null;
  }
}

/**
 * Batch version of getDesignatedPlayerImage.
 *
 * Given a list of imageIds and a single role, returns a Map of imageId → row (APPROVED only).
 * Players with no designated row for the role are absent from the Map (not in results).
 *
 * Use this to avoid N+1 queries when rendering many PlayerCard components on the roster page.
 *
 * Supported roles: YATSTATS_FRONT | LEFT_ANCHOR | RIGHT_ANCHOR | HEADSHOT
 */
export async function getBatchDesignatedPlayerImages(
  imageIds: string[],
  role: string
): Promise<Map<string, any>> {
  if (imageIds.length === 0) return new Map();
  try {
    const { rows } = await query(
      `SELECT DISTINCT ON (player_id::text) player_id, image_url
         FROM player_photos
        WHERE player_id::text = ANY($1::text[])
          AND image_role = $2
          AND approval_status = 'APPROVED'
          AND (is_active IS NULL OR is_active = TRUE)
        ORDER BY player_id::text, is_primary DESC NULLS LAST, date_taken DESC NULLS LAST, id DESC`,
      [imageIds, role]
    );
    const map = new Map<string, any>();
    for (const row of rows) {
      map.set(String(row.player_id), row);
    }
    return map;
  } catch {
    // Table or columns don't exist yet — degrade gracefully
    return new Map();
  }
}

/**
 * Returns TIMELINE middle-frame photos for the career strip.
 *
 * Only rows where:
 *   show_on_pp_timeline = true
 *   approval_status = 'APPROVED'
 *   image_role = 'TIMELINE' (or NULL for legacy rows pre-migration)
 *
 * NOTE on legacy rows (rows that existed before migration 006):
 *   After migration 006 runs, existing rows get approval_status='PENDING' (default) and
 *   show_on_pp_timeline=FALSE (default). Those rows will NOT appear in the timeline.
 *   To include a legacy row, an admin must explicitly set:
 *     approval_status='APPROVED' AND show_on_pp_timeline=TRUE AND image_role='TIMELINE'.
 *   This is intentional — images must be explicitly approved to appear.
 *
 * The outer try/catch handles the case where migration 006 has NOT yet run
 * (columns don't exist). In that case, the inner fallback query returns all rows
 * for the player as a graceful degradation until the migration is applied.
 *
 * Sorted by date_taken ASC then season_year ASC.
 */
export async function getPlayerPhotos(imageId: string): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT *
         FROM player_photos
        WHERE player_id::text = $1
          AND (
            -- Post-migration: explicit timeline role + approved + timeline flag
            (show_on_pp_timeline = TRUE AND approval_status = 'APPROVED')
            -- Pre-migration legacy rows: no columns yet → show all (column missing handled by catch)
          )
          AND (image_role IS NULL OR image_role = 'TIMELINE')
          AND (is_active IS NULL OR is_active = TRUE)
        ORDER BY date_taken ASC NULLS LAST, season_year ASC NULLS LAST`,
      [imageId]
    );
    return rows;
  } catch {
    // Table or new columns don't exist yet — try simpler fallback query
    try {
      const { rows } = await query(
        `SELECT * FROM player_photos WHERE player_id::text = $1
         ORDER BY date_taken ASC NULLS LAST, season_year ASC NULLS LAST`,
        [imageId]
      );
      return rows;
    } catch {
      return [];
    }
  }
}
// ---------------------------------------------------------------------------
// FLIP CARD FRONT STAGE — staging table for UI rendering
// ---------------------------------------------------------------------------
export async function getFlipCardFrontStageByHsid(hsid: string): Promise<any[]> {
  const sql = `
    SELECT *
    FROM flip_card_front_stage
    WHERE hsid = $1
  `;
  const { rows } = await query(sql, [hsid]);
  return rows;
}
// ---------------------------------------------------------------------------
// ROSTER TRUTH — resolved current team + transactions
// ---------------------------------------------------------------------------

export async function getResolvedCurrentTeam(playerid: string): Promise<any | null> {
  try {
    const { rows } = await query(
      `SELECT
         playerid,
         teamid,
         team_name,
         level,
         source,
         last_verified
       FROM public.v_player_current_team_resolved
       WHERE playerid::text = $1
       LIMIT 1`,
      [playerid]
    );
    return rows[0] || null;
  } catch {
    // View may not exist yet — degrade gracefully
    return null;
  }
}

export async function getPlayerTransactions(playerid: string, limit = 20): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT *
       FROM player_transactions
       WHERE playerid::text = $1
       ORDER BY effective_date DESC NULLS LAST, created_at DESC
       LIMIT $2`,
      [playerid, limit]
    );
    return rows;
  } catch {
    // Table may not exist yet — degrade gracefully
    return [];
  }
}

// ---------------------------------------------------------------------------
// Schema bootstrap — ensure auxiliary tables exist so JOINs never crash.
// The teams table is populated externally (scripts/import-teams.ts); if it
// hasn't been loaded yet the LEFT JOIN simply falls back to showing teamid
// via COALESCE, which is acceptable.
// ---------------------------------------------------------------------------
declare global {
  var __pgSchemaBootstrapped: boolean | undefined;
}
if (!global.__pgSchemaBootstrapped) {
  global.__pgSchemaBootstrapped = true;
  void (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS teams (
          team_id   TEXT PRIMARY KEY,
          team_name TEXT NOT NULL
        )
      `);
    } catch (err) {
      // Non-fatal — queries will still run; team names will fall back to teamid.
      console.error('Failed to bootstrap teams table:', err);
    }
  })();
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
