// src/lib/db.ts
// YAT?STATS — Database helpers
// Connects to Neon Postgres via DATABASE_URL env var.
// Core player/stat identity data is sourced from TheBaseballCube tables.
// flip_card_front_stage is the presentation-layer source for
// front-card display overrides such as current_team_name.
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
// Homepage roster inclusion currently uses presence of batting or pitching
// rows in 2025 as a temporary activity proxy. This is not a status label.

'use server';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import 'server-only';

const pool = new Pool({
  connectionString: process.env.PLAYERS_DATABASE_URL || process.env.DATABASE_URL,
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
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .split(':')[0]
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
// ACTIVE ROSTER — homepage roster slice
//
// Returns one row per player with their most recent season stats.
// Inclusion currently uses presence of batting OR pitching stats in year 2025.
// current_team_name is read from flip_card_front_stage.
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
      JOIN tbc_players_raw tp
        ON ph.playerid::text = tp.playerid::text
      WHERE ph.hsid = $1
    ),

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

    current_roster_candidates AS (
      SELECT DISTINCT playerid::text AS playerid
      FROM tbc_batting_raw
      WHERE year = '2025'
        AND playerid::text IN (SELECT playerid::text FROM school_players)

      UNION

      SELECT DISTINCT playerid::text AS playerid
      FROM tbc_pitching_raw
      WHERE year = '2025'
        AND playerid::text IN (SELECT playerid::text FROM school_players)
    ),

    stage AS (
      SELECT
        f.playerid::text AS playerid,
        f.display_name,
        f.first_name,
        f.last_name,
        f.class_of,
        f.roster_years,
        f.status_label,
        f.level_label,
        f.current_team_name
      FROM public.flip_card_front_stage f
      WHERE f.hsid::text = $1
    )

    SELECT
      sp.playerid,

      COALESCE(
        st.display_name,
        NULLIF(TRIM(sp.firstname || ' ' || sp.lastname), ''),
        sp.playerid::text
      ) AS display_name,

      COALESCE(st.first_name, sp.firstname) AS firstname,
      COALESCE(st.last_name, sp.lastname)   AS lastname,

      st.class_of,
      st.roster_years,
      st.status_label,

      COALESCE(
        st.level_label,
        CASE
          WHEN lp.pitch_year IS NOT NULL
           AND (lb.stat_year IS NULL OR lp.pitch_year::int >= lb.stat_year::int)
          THEN lp.pit_level
          ELSE lb.bat_level
        END,
        sp.career_highlevel
      ) AS level,

      sp.height,
      sp.weight,
      sp.bats,
      sp.throws,
      sp.position,

      st.current_team_name,

      lb.stat_year,
      lb.g, lb.ab, lb.r, lb.h,
      lb."2b", lb."3b", lb.hr, lb.rbi, lb.sb, lb.bb, lb.so,
      lb.avg, lb.obp, lb.slg, lb.ops,
      COALESCE(lb.draft_info, lp.pit_draft_info) AS draft_info,
      COALESCE(lb.playyears, lp.pit_playyears)   AS playyears,

      lp.pitch_year,
      lp.pg, lp.gs, lp.w, lp.l, lp.saves,
      lp.ip, lp.pbb, lp.ko,
      lp.era, lp.whip, lp.h9, lp.bb9, lp.k9, lp.kbb,

      CASE
        WHEN lp.pitch_year IS NOT NULL AND (
          lb.stat_year IS NULL OR lp.pitch_year::int >= lb.stat_year::int
        ) THEN true
        ELSE false
      END AS is_pitcher

    FROM school_players sp
    JOIN current_roster_candidates crc
      ON sp.playerid::text = crc.playerid
    LEFT JOIN latest_batting  lb
      ON sp.playerid::text = lb.playerid
    LEFT JOIN latest_pitching lp
      ON sp.playerid::text = lp.playerid
    LEFT JOIN stage st
      ON sp.playerid::text = st.playerid

    ORDER BY
      CASE sp.career_highlevel
        WHEN 'MLB' THEN 1
        WHEN 'TRIPLE-A' THEN 2
        WHEN 'AAA' THEN 2
        WHEN 'DOUBLE-A' THEN 3
        WHEN 'AA' THEN 3
        WHEN 'HIGH-A' THEN 4
        WHEN 'A+' THEN 4
        WHEN 'LOW-A' THEN 5
        WHEN 'A' THEN 5
        WHEN 'INTERNATIONAL' THEN 6
        WHEN 'INTL' THEN 6
        WHEN 'Indy' THEN 7
        WHEN 'INDY' THEN 7
        WHEN 'INDEPENDENT' THEN 7
        WHEN 'NCAA-D1' THEN 8
        WHEN 'D1' THEN 8
        WHEN 'NCAA-D2' THEN 9
        WHEN 'D2' THEN 9
        WHEN 'NCAA-D3' THEN 10
        WHEN 'D3' THEN 10
        WHEN 'NAIA' THEN 11
        WHEN 'JrCollege' THEN 12
        WHEN 'JUCO' THEN 12
        WHEN 'NJCAA' THEN 12
        WHEN 'HS' THEN 13
        WHEN 'HIGH SCHOOL' THEN 13
        WHEN 'High School' THEN 13
        ELSE 14
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
// Returns all players regardless of current roster inclusion.
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

    current_roster_candidates AS (
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
      CASE WHEN crc.playerid IS NOT NULL THEN true ELSE false END AS is_current_roster_candidate,
      CASE
        WHEN lp.pitch_year IS NOT NULL AND (
          lb.stat_year IS NULL OR lp.pitch_year::int >= lb.stat_year::int
        ) THEN true
        ELSE false
      END AS is_pitcher
    FROM school_players sp
    LEFT JOIN latest_batting  lb ON sp.playerid::text = lb.playerid
    LEFT JOIN latest_pitching lp ON sp.playerid::text = lp.playerid
    LEFT JOIN current_roster_candidates crc ON sp.playerid::text = crc.playerid
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
        WHEN 'INTERNATIONAL' THEN 6
        WHEN 'INTL'       THEN 6
        WHEN 'Indy'       THEN 7
        WHEN 'INDY'       THEN 7
        WHEN 'INDEPENDENT' THEN 7
        WHEN 'NCAA-D1'    THEN 8
        WHEN 'D1'         THEN 8
        WHEN 'NCAA-D2'    THEN 9
        WHEN 'D2'         THEN 9
        WHEN 'NCAA-D3'    THEN 10
        WHEN 'D3'         THEN 10
        WHEN 'NAIA'       THEN 11
        WHEN 'JrCollege'  THEN 12
        WHEN 'JUCO'       THEN 12
        WHEN 'NJCAA'      THEN 12
        WHEN 'HS'         THEN 13
        WHEN 'HIGH SCHOOL' THEN 13
        WHEN 'High School' THEN 13
        ELSE 14
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
    WHERE trim(both '-' from regexp_replace(lower(trim(coalesce(tp.firstname,'') || ' ' || coalesce(tp.lastname,''))), '-+', '-', 'g')) = $1
      ${hsid ? "AND (ph.hsid::text = $2 OR ph.hsid IS NULL)" : ""}
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
  const n = (col: string) =>
    `NULLIF(regexp_replace(COALESCE(${col}::text,'0'), '[^0-9.]', '', 'g'), '')::numeric`;
  const sql = `
    SELECT
      COUNT(DISTINCT year) AS seasons,
      SUM(${n('g')}) AS g, SUM(${n('ab')}) AS ab, SUM(${n('r')}) AS r, SUM(${n('h')}) AS h,
      SUM(${n('dbl')}) AS "2b", SUM(${n('tpl')}) AS "3b",
      SUM(${n('hr')}) AS hr, SUM(${n('rbi')}) AS rbi, SUM(${n('sb')}) AS sb,
      SUM(${n('bb')}) AS bb, SUM(${n('so')}) AS so,
      CASE WHEN SUM(${n('ab')}) > 0 THEN ROUND(SUM(${n('h')}) / SUM(${n('ab')}), 3) ELSE NULL END AS avg,
      CASE WHEN SUM(${n('ab')}) + SUM(${n('bb')}) > 0 THEN ROUND((SUM(${n('h')}) + SUM(${n('bb')})) / (SUM(${n('ab')}) + SUM(${n('bb')})), 3) ELSE NULL END AS obp
    FROM tbc_batting_raw
    WHERE playerid::text = $1
  `;
  try {
    const { rows } = await query(sql, [playerId]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

export async function getPlayerCareerPitching(playerId: string): Promise<any | null> {
  const n = (col: string) =>
    `NULLIF(regexp_replace(COALESCE(${col}::text,'0'), '[^0-9.]', '', 'g'), '')::numeric`;
  const sql = `
    SELECT
      COUNT(DISTINCT year) AS seasons,
      SUM(${n('g')}) AS g, SUM(${n('gs')}) AS gs,
      SUM(${n('w')}) AS w, SUM(${n('l')}) AS l,
      SUM(${n('sv')}) AS saves,
      SUM(${n('ip')}) AS ip,
      SUM(${n('er')}) AS er,
      SUM(${n('so')}) AS ko, SUM(${n('bb')}) AS bb,
      CASE WHEN SUM(${n('ip')}) > 0 THEN ROUND(SUM(${n('er')}) * 9 / SUM(${n('ip')}), 2) ELSE NULL END AS era,
      CASE WHEN SUM(${n('ip')}) > 0 THEN ROUND((SUM(${n('bb')}) + SUM(${n('h')})) / SUM(${n('ip')}), 2) ELSE NULL END AS whip,
      CASE WHEN SUM(${n('ip')}) > 0 THEN ROUND(SUM(${n('so')}) * 9 / SUM(${n('ip')}), 2) ELSE NULL END AS k9,
      CASE WHEN SUM(${n('bb')}) > 0 THEN ROUND(SUM(${n('so')}) / SUM(${n('bb')}), 2) ELSE NULL END AS kbb
    FROM tbc_pitching_raw
    WHERE playerid::text = $1
  `;
  try {
    const { rows } = await query(sql, [playerId]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// TEAM CONTEXT — optional organization / conference metadata for a team.
// ---------------------------------------------------------------------------
export async function getTeamContext(teamId: string): Promise<{ organization?: string; conference?: string } | null> {
  try {
    const { rows } = await query(
      `SELECT
         COALESCE(organization, mlb_org, org)      AS organization,
         COALESCE(conference, league, association) AS conference
       FROM teams
       WHERE team_id::text = $1
       LIMIT 1`,
      [teamId]
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// TEAM SCHEDULE — chronological game feed for a given team_id.
// ---------------------------------------------------------------------------
export async function getTeamSchedule(teamId: string, limit = 200): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT * FROM v_team_schedule_feed WHERE tbc_teamid::text = $1 ORDER BY game_date ASC LIMIT $2`,
      [teamId, limit]
    );
    return rows;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// PLAYER GAME LOG — per-game stats if present.
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
// NEWS ARTICLES — from news_articles table
// ---------------------------------------------------------------------------
export async function getNewsByHsid(hsid: string, limit = 50): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT
         na.*,
         tp.firstname        AS player_firstname,
         tp.lastname         AS player_lastname,
         tp.highlevel        AS player_highlevel,
         COALESCE(lb.draft_info, lp.pit_draft_info) AS player_draft_info,
         COALESCE(lb.playyears, lp.pit_playyears)   AS player_playyears,
         CASE WHEN crc.playerid IS NOT NULL THEN true ELSE false END AS player_is_current_roster_candidate
       FROM news_articles na
       LEFT JOIN tbc_players_raw tp
         ON na.playerid::text = tp.playerid::text
       LEFT JOIN LATERAL (
         SELECT draft_info, playyears
         FROM tbc_batting_raw
         WHERE playerid::text = na.playerid::text
         ORDER BY year DESC
         LIMIT 1
       ) lb ON true
       LEFT JOIN LATERAL (
         SELECT draft_info AS pit_draft_info, playyears AS pit_playyears
         FROM tbc_pitching_raw
         WHERE playerid::text = na.playerid::text
         ORDER BY year DESC
         LIMIT 1
       ) lp ON true
       LEFT JOIN LATERAL (
         SELECT DISTINCT playerid::text AS playerid
         FROM tbc_batting_raw
         WHERE year = '2025'
           AND playerid::text = na.playerid::text
         LIMIT 1
       ) crc ON true
       WHERE na.hsid = $1
       ORDER BY na.published_at DESC
       LIMIT $2`,
      [hsid, limit]
    );
    return rows;
  } catch {
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
    return [];
  }
}

// ---------------------------------------------------------------------------
// PLAYER PHOTOS
// ---------------------------------------------------------------------------
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
    return null;
  }
}

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
    return new Map();
  }
}

export async function getPlayerPhotos(imageId: string): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT *
         FROM player_photos
        WHERE player_id::text = $1
          AND show_on_pp_timeline = TRUE
          AND approval_status = 'APPROVED'
          AND (image_role IS NULL OR image_role = 'TIMELINE')
          AND (is_active IS NULL OR is_active = TRUE)
        ORDER BY date_taken ASC NULLS LAST, season_year ASC NULLS LAST`,
      [imageId]
    );
    return rows;
  } catch {
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
    SELECT *,
      UPPER(status_label) AS status_label,
      CASE level_label
        WHEN 'AAA'          THEN 'TRIPLE-A'
        WHEN 'TRIPLE-A'     THEN 'TRIPLE-A'
        WHEN 'AA'           THEN 'DOUBLE-A'
        WHEN 'DOUBLE-A'     THEN 'DOUBLE-A'
        WHEN 'High-A'       THEN 'HIGH-A'
        WHEN 'HIGH-A'       THEN 'HIGH-A'
        WHEN 'A+'           THEN 'HIGH-A'
        WHEN 'Single-A'     THEN 'LOW-A'
        WHEN 'LOW-A'        THEN 'LOW-A'
        WHEN 'A'            THEN 'LOW-A'
        WHEN 'A-'           THEN 'LOW-A'
        WHEN 'Rk'           THEN 'ROOKIE'
        WHEN 'RK'           THEN 'ROOKIE'
        WHEN 'Rookie'       THEN 'ROOKIE'
        WHEN 'ROOKIE'       THEN 'ROOKIE'
        WHEN 'Indy'         THEN 'INDY'
        WHEN 'INDY'         THEN 'INDY'
        WHEN 'INTL'         THEN 'INT''L'
        WHEN 'Intl'         THEN 'INT''L'
        WHEN 'INT''L'       THEN 'INT''L'
        WHEN 'NCAA-D1'      THEN 'NCAA-D1'
        WHEN 'D1'           THEN 'NCAA-D1'
        WHEN 'NCAA'         THEN 'NCAA-D1'
        WHEN 'NCAA-D2'      THEN 'NCAA-D2'
        WHEN 'D2'           THEN 'NCAA-D2'
        WHEN 'NCAA-D3'      THEN 'NCAA-D3'
        WHEN 'D3'           THEN 'NCAA-D3'
        WHEN 'NAIA'         THEN 'NAIA'
        WHEN 'JrCollege'    THEN 'JUCO'
        WHEN 'JUCO'         THEN 'JUCO'
        WHEN 'HS'           THEN 'HIGH SCHOOL'
        WHEN 'HIGH SCHOOL'  THEN 'HIGH SCHOOL'
        ELSE COALESCE(UPPER(level_label), '')
      END AS normalized_level_label
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
    return [];
  }
}

// ---------------------------------------------------------------------------
// Schema bootstrap — ensure auxiliary tables exist so JOINs never crash.
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
