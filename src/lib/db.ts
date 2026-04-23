// src/lib/db.ts
// YAT?STATS — Database helpers
// Connects to Neon Postgres via DATABASE_URL env var.
// All player data is sourced from TheBaseballCube tables.
//
// Key tables:
//   tbc_players_raw              — player identity, position, bats/throws, height/weight, highlevel
//   tbc_batting_raw              — historical season batting stats archive
//   tbc_pitching_raw             — historical season pitching stats archive
//   tbc_batting_2026_season_raw  — live 2026 batting season stats
//   tbc_pitching_2026_season_raw — live 2026 pitching season stats
//   player_hsids                 — links playerid -> hsid (high school)
//   tbc_schools_raw              — high school info (hsid, hsname, colors, nickname) — NOT pro/college teams
//   school_success               — per-school metadata (rank, counts, staging/microsite URLs, colors)
//   teams                        — team_id → team_name lookup; populated via scripts/import-teams.ts
//
// "Active" = player has batting or pitching stats from 2026
// "All-time" = all players ever tagged to a school in player_hsids

'use server';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import 'server-only';

const pool = new Pool({
  connectionString: process.env.PLAYERS_DATABASE_URL || process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
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
// SINGLE PLAYER — full player identity for profile page
// Falls back to flip_card_front_stage for YAT-only players not in TBC.
// ---------------------------------------------------------------------------
export async function getPlayerById(playerId: string): Promise<any | null> {
  const sql = `
    with tbc_player as (
      select
        tp.playerid::text as playerid,
        tp.firstname as firstname,
        tp.lastname as lastname,
        trim(coalesce(tp.firstname, '') || ' ' || coalesce(tp.lastname, '')) as display_name,
        tp.highlevel as career_highlevel,
        tp.ht as height,
        tp.wt as weight,
        tp.bats,
        tp.throws,
        tp.posit as position,
        null::text as hsid,
        null::text as class_of,
        null::text[] as roster_years,
        null::text as status_label,
        null::text as level_label,
        null::text as current_team_name,
        null::text as current_org_or_conference_name,
        'tbc_players_raw'::text as identity_source
      from tbc_players_raw tp
      where tp.playerid::text = $1
      limit 1
    ),
    stage_player as (
      select
        f.playerid::text as playerid,
        f.first_name as firstname,
        f.last_name as lastname,
        coalesce(
          nullif(f.display_name, ''),
          trim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, ''))
        ) as display_name,
        null::text as career_highlevel,
        null::text as height,
        null::text as weight,
        null::text as bats,
        null::text as throws,
        f.position,
        f.hsid::text as hsid,
        f.class_of::text as class_of,
        f.roster_years,
        f.status_label,
        f.level_label,
        f.current_team_name,
        f.current_org_or_conference_name,
        'flip_card_front_stage'::text as identity_source
      from flip_card_front_stage f
      where f.playerid::text = $1
      limit 1
    )
    select * from tbc_player
    union all
    select * from stage_player
    limit 1
  `;
  const { rows } = await query(sql, [playerId]);
  return rows[0] || null;
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
// ACTIVE ROSTER — players with 2026 stats (homepage)
//
// Returns one row per player with their current 2026 season stats.
// "Active" = has batting OR pitching stats in year 2026.
// ---------------------------------------------------------------------------
export async function getActiveRosterByHsid(hsid: string): Promise<any[]> {
  const sql = `
    WITH school_players AS (
      SELECT
        ph.playerid,
        tp.firstname,
        tp.lastname,
        tp.highlevel AS career_highlevel,
        tp.ht AS height,
        tp.wt AS weight,
        tp.bats,
        tp.throws,
        tp.posit AS tbc_position
      FROM player_hsids ph
      JOIN tbc_players_raw tp
        ON ph.playerid::text = tp.playerid::text
      WHERE ph.hsid = $1
    ),

    stage_rows AS (
      SELECT
        f.playerid::text AS playerid,
        f.hsid,
        f.display_name,
        f.first_name,
        f.last_name,
        f.class_of,
        f.roster_years,
        COALESCE(array_length(f.roster_years, 1), 0) AS roster_years_count,
        f.status_label,
        f.level_label,
        f.current_team_name,
        f.current_org_or_conference_name,
        f.next_game_status_label,
        f.next_game_date,
        f.next_game_home_away,
        f.next_game_opponent,
        f.next_game_time_utc,
        f.next_game_time_local,
        f.school_timezone,
        f.position
      FROM flip_card_front_stage f
      WHERE f.hsid = $1
    ),

    latest_batting AS (
      SELECT DISTINCT ON (playerid)
        playerid::text AS playerid,
        year AS stat_year,
        teamid,
        highlevel AS bat_level,
        g, ab, r, h,
        dbl AS "2b",
        tpl AS "3b",
        hr, rbi, sb, bb, so,
        bavg AS avg,
        obp, slg, ops,
        draft_info,
        playyears
      FROM tbc_batting_2026_season_raw
      ORDER BY playerid, year DESC, teamid DESC
    ),

    latest_pitching AS (
      SELECT DISTINCT ON (playerid)
        playerid::text AS playerid,
        year AS pitch_year,
        teamid AS pit_teamid,
        highlevel AS pit_level,
        g AS pg,
        gs,
        w, l,
        sv AS saves,
        ip,
        bb,
        so AS ko,
        era, whip,
        h9,
        bb9,
        so9,
        so_bb,
        draft_info AS pit_draft_info,
        playyears AS pit_playyears
      FROM tbc_pitching_2026_season_raw
      ORDER BY playerid, year DESC, teamid DESC
    ),

    active_playerids AS (
      SELECT DISTINCT playerid::text AS playerid
      FROM tbc_batting_2026_season_raw
      WHERE year = '2026'
        AND playerid::text IN (SELECT playerid::text FROM school_players)

      UNION

      SELECT DISTINCT playerid::text AS playerid
      FROM tbc_pitching_2026_season_raw
      WHERE year = '2026'
        AND playerid::text IN (SELECT playerid::text FROM school_players)
    )

    SELECT
      sp.playerid::text AS playerid,

      COALESCE(NULLIF(sr.first_name, ''), sp.firstname) AS first_name,
      COALESCE(NULLIF(sr.last_name, ''), sp.lastname) AS last_name,
      sp.firstname,
      sp.lastname,
      COALESCE(
        NULLIF(sr.display_name, ''),
        NULLIF(TRIM(COALESCE(sr.first_name, '') || ' ' || COALESCE(sr.last_name, '')), ''),
        NULLIF(TRIM(COALESCE(sp.firstname, '') || ' ' || COALESCE(sp.lastname, '')), ''),
        sp.playerid::text
      ) AS display_name,

      sr.current_team_name,
      sr.current_org_or_conference_name,
      sr.level_label,
      sr.status_label,
      sr.class_of,
      sr.roster_years,
      sr.roster_years_count,
      sr.next_game_status_label,
      sr.next_game_date,
      sr.next_game_home_away,
      sr.next_game_opponent,
      sr.next_game_time_utc,
      sr.next_game_time_local,
      sr.school_timezone,

      COALESCE(sr.level_label, sp.career_highlevel) AS level,
      COALESCE(NULLIF(sr.position, ''), sp.tbc_position) AS position,
      sp.height,
      sp.weight,
      sp.bats,
      sp.throws,

      lb.stat_year,
      lb.g, lb.ab, lb.r, lb.h,
      lb."2b", lb."3b", lb.hr, lb.rbi, lb.sb, lb.bb, lb.so,
      lb.avg, lb.obp, lb.slg, lb.ops,

      lp.pitch_year,
      lp.pg, lp.gs, lp.w, lp.l, lp.saves,
      lp.ip, lp.bb AS pbb, lp.ko,
      lp.era, lp.whip, lp.h9, lp.bb9, lp.so9, lp.so_bb,

      COALESCE(lb.draft_info, lp.pit_draft_info) AS draft_info,
      COALESCE(lb.playyears, lp.pit_playyears) AS playyears,

      CASE
        WHEN lp.pitch_year IS NOT NULL
         AND (lb.stat_year IS NULL OR lp.pitch_year::int >= lb.stat_year::int)
        THEN true
        ELSE false
      END AS is_pitcher

    FROM school_players sp
    JOIN active_playerids ap
      ON ap.playerid = sp.playerid::text
    LEFT JOIN stage_rows sr
      ON sr.playerid = sp.playerid::text
    LEFT JOIN latest_batting lb
      ON lb.playerid = sp.playerid::text
    LEFT JOIN latest_pitching lp
      ON lp.playerid = sp.playerid::text

    ORDER BY
      CASE COALESCE(sr.level_label, sp.career_highlevel)
        WHEN 'MLB' THEN 1
        WHEN 'TRIPLE-A' THEN 2
        WHEN 'AAA' THEN 2
        WHEN 'DOUBLE-A' THEN 3
        WHEN 'AA' THEN 3
        WHEN 'HIGH-A' THEN 4
        WHEN 'A+' THEN 4
        WHEN 'LOW-A' THEN 5
        WHEN 'A' THEN 5
        WHEN 'ROOKIE' THEN 6
        WHEN 'INTL' THEN 7
        WHEN 'INT''L' THEN 7
        WHEN 'INTERNATIONAL' THEN 7
        WHEN 'INDY' THEN 8
        WHEN 'INDEPENDENT' THEN 8
        WHEN 'NCAA-D1' THEN 9
        WHEN 'D1' THEN 9
        WHEN 'NCAA-D2' THEN 10
        WHEN 'D2' THEN 10
        WHEN 'NCAA-D3' THEN 11
        WHEN 'D3' THEN 11
        WHEN 'NAIA' THEN 12
        WHEN 'JUCO' THEN 13
        WHEN 'JrCollege' THEN 13
        WHEN 'NJCAA' THEN 13
        WHEN 'HIGH SCHOOL' THEN 14
        WHEN 'HS' THEN 14
        ELSE 15
      END,
      CASE
        WHEN sr.class_of ~ '^[0-9]{4}$' THEN sr.class_of::int
        ELSE 0
      END DESC,
      COALESCE(sr.roster_years_count, 0) DESC,
      COALESCE(NULLIF(sr.last_name, ''), sp.lastname),
      COALESCE(NULLIF(sr.first_name, ''), sp.firstname)
  `;
  const { rows } = await query(sql, [hsid]);
  return rows;
}

// ---------------------------------------------------------------------------
// ALL-TIME ROSTER — every alumni ever tagged to a school (all-time page)
// ---------------------------------------------------------------------------
export async function getAllTimeRosterByHsid(hsid: string): Promise<any[]> {
  const n = (col: string) =>
    `NULLIF(regexp_replace(COALESCE(${col}::text,'0'), '[^0-9.]', '', 'g'), '')::numeric`;

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

    latest_batting_level AS (
      SELECT DISTINCT ON (playerid)
        playerid::text AS playerid,
        year           AS stat_year,
        highlevel      AS bat_level,
        draft_info,
        playyears
      FROM public.v_tbc_batting_all_seasons_resolved
      ORDER BY playerid, year DESC, teamid DESC
    ),

    latest_pitching_level AS (
      SELECT DISTINCT ON (playerid)
        playerid::text AS playerid,
        year           AS pitch_year,
        highlevel      AS pit_level,
        draft_info     AS pit_draft_info,
        playyears      AS pit_playyears
      FROM public.v_tbc_pitching_all_seasons_resolved
      ORDER BY playerid, year DESC, teamid DESC
    ),

    career_batting AS (
      SELECT
        playerid::text AS playerid,
        COUNT(DISTINCT year) AS batting_seasons,
        SUM(${n("g")})   AS g,
        SUM(${n("ab")})  AS ab,
        SUM(${n("r")})   AS r,
        SUM(${n("h")})   AS h,
        SUM(${n("dbl")}) AS "2b",
        SUM(${n("tpl")}) AS "3b",
        SUM(${n("hr")})  AS hr,
        SUM(${n("rbi")}) AS rbi,
        SUM(${n("sb")})  AS sb,
        SUM(${n("bb")})  AS bb,
        SUM(${n("so")})  AS so,
        SUM(${n("tb")})  AS tb,
        CASE
          WHEN SUM(${n("ab")}) > 0
          THEN ROUND(SUM(${n("h")}) / SUM(${n("ab")}), 3)
          ELSE NULL
        END AS avg,
        CASE
          WHEN SUM(${n("ab")}) + SUM(${n("bb")}) > 0
          THEN ROUND(
            (SUM(${n("h")}) + SUM(${n("bb")})) /
            (SUM(${n("ab")}) + SUM(${n("bb")})),
            3
          )
          ELSE NULL
        END AS obp,
        CASE
          WHEN SUM(${n("ab")}) > 0
          THEN ROUND(SUM(${n("tb")}) / SUM(${n("ab")}), 3)
          ELSE NULL
        END AS slg,
        CASE
          WHEN SUM(${n("ab")}) > 0 AND SUM(${n("ab")}) + SUM(${n("bb")}) > 0
          THEN ROUND(
            ((SUM(${n("h")}) + SUM(${n("bb")})) /
             (SUM(${n("ab")}) + SUM(${n("bb")}))) +
            (SUM(${n("tb")}) / SUM(${n("ab")})),
            3
          )
          ELSE NULL
        END AS ops
      FROM public.v_tbc_batting_all_seasons_resolved
      GROUP BY playerid::text
    ),

    career_pitching AS (
      SELECT
        playerid::text AS playerid,
        COUNT(DISTINCT year) AS pitching_seasons,
        SUM(${n("g")})   AS pg,
        SUM(${n("gs")})  AS gs,
        SUM(${n("w")})   AS w,
        SUM(${n("l")})   AS l,
        SUM(${n("sv")})  AS saves,
        SUM(${n("ip")})  AS ip,
        SUM(${n("h")})   AS h_allowed,
        SUM(${n("er")})  AS er,
        SUM(${n("bb")})  AS bb,
        SUM(${n("so")})  AS ko,
        CASE
          WHEN SUM(${n("ip")}) > 0
          THEN ROUND(SUM(${n("er")}) * 9 / SUM(${n("ip")}), 2)
          ELSE NULL
        END AS era,
        CASE
          WHEN SUM(${n("ip")}) > 0
          THEN ROUND((SUM(${n("bb")}) + SUM(${n("h")})) / SUM(${n("ip")}), 2)
          ELSE NULL
        END AS whip,
        CASE
          WHEN SUM(${n("ip")}) > 0
          THEN ROUND(SUM(${n("h")}) * 9 / SUM(${n("ip")}), 2)
          ELSE NULL
        END AS h9,
        CASE
          WHEN SUM(${n("ip")}) > 0
          THEN ROUND(SUM(${n("bb")}) * 9 / SUM(${n("ip")}), 2)
          ELSE NULL
        END AS bb9,
        CASE
          WHEN SUM(${n("ip")}) > 0
          THEN ROUND(SUM(${n("so")}) * 9 / SUM(${n("ip")}), 2)
          ELSE NULL
        END AS so9,
        CASE
          WHEN SUM(${n("bb")}) > 0
          THEN ROUND(SUM(${n("so")}) / SUM(${n("bb")}), 2)
          ELSE NULL
        END AS so_bb
      FROM public.v_tbc_pitching_all_seasons_resolved
      GROUP BY playerid::text
    ),

    active_2026 AS (
      SELECT DISTINCT playerid::text AS playerid
      FROM tbc_batting_2026_season_raw
      WHERE year = '2026'
        AND playerid::text IN (SELECT playerid::text FROM school_players)
      UNION
      SELECT DISTINCT playerid::text AS playerid
      FROM tbc_pitching_2026_season_raw
      WHERE year = '2026'
        AND playerid::text IN (SELECT playerid::text FROM school_players)
    )

    SELECT
      sp.playerid,
      sp.firstname,
      sp.lastname,
      COALESCE(NULLIF(TRIM(sp.firstname || ' ' || sp.lastname), ''), sp.playerid::text) AS display_name,
      sp.career_highlevel AS level,
      sp.height,
      sp.weight,
      sp.bats,
      sp.throws,
      sp.position,

      lbl.stat_year,
      lbl.bat_level AS current_level,
      lpl.pitch_year,

      cb.g,
      cb.ab,
      cb.r,
      cb.h,
      cb."2b",
      cb."3b",
      cb.hr,
      cb.rbi,
      cb.sb,
      cb.bb,
      cb.so,
      cb.avg,
      cb.obp,
      cb.slg,
      cb.ops,

      cp.pg,
      cp.gs,
      cp.w,
      cp.l,
      cp.saves,
      cp.ip,
      cp.bb,
      cp.ko,
      cp.era,
      cp.whip,
      cp.h9,
      cp.bb9,
      cp.so9,
      cp.so_bb,

      COALESCE(lbl.draft_info, lpl.pit_draft_info) AS draft_info,
      COALESCE(lbl.playyears, lpl.pit_playyears)   AS playyears,

      CASE WHEN a26.playerid IS NOT NULL THEN true ELSE false END AS is_active_2025,
      CASE
        WHEN cp.playerid IS NOT NULL AND (cb.playerid IS NULL OR lpl.pitch_year::int >= lbl.stat_year::int)
        THEN true
        ELSE false
      END AS is_pitcher

    FROM school_players sp
    LEFT JOIN latest_batting_level  lbl ON sp.playerid::text = lbl.playerid
    LEFT JOIN latest_pitching_level lpl ON sp.playerid::text = lpl.playerid
    LEFT JOIN career_batting        cb  ON sp.playerid::text = cb.playerid
    LEFT JOIN career_pitching       cp  ON sp.playerid::text = cp.playerid
    LEFT JOIN active_2026           a26 ON sp.playerid::text = a26.playerid

    ORDER BY
      CASE sp.career_highlevel
        WHEN 'MLB'           THEN 1
        WHEN 'TRIPLE-A'      THEN 2
        WHEN 'AAA'           THEN 2
        WHEN 'DOUBLE-A'      THEN 3
        WHEN 'AA'            THEN 3
        WHEN 'HIGH-A'        THEN 4
        WHEN 'A+'            THEN 4
        WHEN 'LOW-A'         THEN 5
        WHEN 'A'             THEN 5
        WHEN 'ROOKIE'        THEN 6
        WHEN 'INT''L'        THEN 7
        WHEN 'INTERNATIONAL' THEN 7
        WHEN 'Indy'          THEN 8
        WHEN 'INDEPENDENT'   THEN 8
        WHEN 'NCAA-D1'       THEN 9
        WHEN 'D1'            THEN 9
        WHEN 'NCAA-D2'       THEN 10
        WHEN 'D2'            THEN 10
        WHEN 'NCAA-D3'       THEN 11
        WHEN 'D3'            THEN 11
        WHEN 'NAIA'          THEN 12
        WHEN 'JUCO'          THEN 13
        WHEN 'JrCollege'     THEN 13
        WHEN 'NJCAA'         THEN 13
        WHEN 'HIGH SCHOOL'   THEN 14
        WHEN 'HS'            THEN 14
        ELSE 15
      END,
      sp.lastname,
      sp.firstname
  `;
  const { rows } = await query(sql, [hsid]);
  return rows;
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
      b.year,
      b.teamid,
      COALESCE(t.team_name, b.teamid::text) AS team_name,
      b.highlevel AS level,
      b.g, b.ab, b.r, b.h,
      b.dbl AS "2b", b.tpl AS "3b",
      b.hr, b.rbi, b.sb, b.bb, b.so,
      b.bavg AS avg, b.obp, b.slg, b.ops,
      b.draft_info
    FROM public.v_tbc_batting_all_seasons_resolved b
    LEFT JOIN public.teams t
      ON t.team_id::text = b.teamid::text
    WHERE b.playerid::text = $1
    ORDER BY b.year ASC, b.teamid ASC
  `;
  try {
    const { rows } = await query(sql, [playerId]);
    return rows;
  } catch (error) {
    console.error('getPlayerBattingStats failed:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// SEASON-BY-SEASON PITCHING STATS — all years for a player
// ---------------------------------------------------------------------------
export async function getPlayerPitchingStats(playerId: string): Promise<any[]> {
  const sql = `
    SELECT
      p.year,
      p.teamid,
      COALESCE(t.team_name, p.teamid::text) AS team_name,
      p.highlevel AS level,
      p.g, p.gs, p.w, p.l,
      p.sv AS saves, p.ip,
      p.h AS hits_allowed, p.er,
      p.bb, p.so AS ko,
      p.era, p.whip, p.h9, p.bb9,
      p.so9 AS k9, p.so_bb AS kbb,
      p.draft_info
    FROM public.v_tbc_pitching_all_seasons_resolved p
    LEFT JOIN public.teams t
      ON t.team_id::text = p.teamid::text
    WHERE p.playerid::text = $1
    ORDER BY p.year ASC, p.teamid ASC
  `;
  try {
    const { rows } = await query(sql, [playerId]);
    return rows;
  } catch (error) {
    console.error('getPlayerPitchingStats failed:', error);
    return [];
  }
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
      SUM(${n('tb')}) AS tb,
      CASE WHEN SUM(${n('ab')}) > 0 THEN ROUND(SUM(${n('h')}) / SUM(${n('ab')}), 3) ELSE NULL END AS avg,
      CASE WHEN SUM(${n('ab')}) + SUM(${n('bb')}) > 0
        THEN ROUND((SUM(${n('h')}) + SUM(${n('bb')})) / (SUM(${n('ab')}) + SUM(${n('bb')})), 3)
        ELSE NULL
      END AS obp,
      CASE WHEN SUM(${n('ab')}) > 0
        THEN ROUND(SUM(${n('tb')}) / SUM(${n('ab')}), 3)
        ELSE NULL
      END AS slg,
      CASE WHEN SUM(${n('ab')}) > 0 AND SUM(${n('ab')}) + SUM(${n('bb')}) > 0
        THEN ROUND(
          (SUM(${n('h')}) + SUM(${n('bb')})) / (SUM(${n('ab')}) + SUM(${n('bb')})) +
          SUM(${n('tb')}) / SUM(${n('ab')}),
          3
        )
        ELSE NULL
      END AS ops
    FROM public.v_tbc_batting_all_seasons_resolved
    WHERE playerid::text = $1
  `;
  try {
    const { rows } = await query(sql, [playerId]);
    return rows[0] || null;
  } catch (error) {
    console.error('getPlayerCareerBatting failed:', error);
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
      SUM(${n('h')}) AS h,
      SUM(${n('er')}) AS er,
      SUM(${n('so')}) AS ko, SUM(${n('bb')}) AS bb,
      CASE WHEN SUM(${n('ip')}) > 0 THEN ROUND(SUM(${n('er')}) * 9 / SUM(${n('ip')}), 2) ELSE NULL END AS era,
      CASE WHEN SUM(${n('ip')}) > 0 THEN ROUND((SUM(${n('bb')}) + SUM(${n('h')})) / SUM(${n('ip')}), 2) ELSE NULL END AS whip,
      CASE WHEN SUM(${n('ip')}) > 0 THEN ROUND(SUM(${n('so')}) * 9 / SUM(${n('ip')}), 2) ELSE NULL END AS k9,
      CASE WHEN SUM(${n('bb')}) > 0 THEN ROUND(SUM(${n('so')}) / SUM(${n('bb')}), 2) ELSE NULL END AS kbb
    FROM public.v_tbc_pitching_all_seasons_resolved
    WHERE playerid::text = $1
  `;
  try {
    const { rows } = await query(sql, [playerId]);
    return rows[0] || null;
  } catch (error) {
    console.error('getPlayerCareerPitching failed:', error);
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
// PLAYER GAME LOG — per-game batting stats for a player on a given team.
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
// ---------------------------------------------------------------------------
export async function getNewsByHsid(hsid: string, limit = 50): Promise<any[]> {
  try {
    const { rows } = await query(
      `SELECT
        na.*,
        nd.tease_json,
        nd.gallery_front_json,
        nd.gallery_back_json,
        nd.profile_json,
        nd.share_json,
        nd.story_grade,
        nd.story_scope,
        nd.player_relevance,
        nd.match_confidence,
        nd.generation_status,
        nd.approval_status,
        nd.updated_at AS derivatives_updated_at
       FROM news_articles na
       LEFT JOIN news_article_derivatives nd
         ON nd.news_article_uuid = na.uuid
        AND nd.generation_status IN ('staged','published')
        AND nd.approval_status IN ('approved','published')
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
      `SELECT
        na.*,
        nd.tease_json,
        nd.gallery_front_json,
        nd.gallery_back_json,
        nd.profile_json,
        nd.share_json,
        nd.story_grade,
        nd.story_scope,
        nd.player_relevance,
        nd.match_confidence,
        nd.generation_status,
        nd.approval_status,
        nd.updated_at AS derivatives_updated_at
       FROM news_articles na
       LEFT JOIN news_article_derivatives nd
         ON nd.news_article_uuid = na.uuid
        AND nd.generation_status IN ('staged','published')
        AND nd.approval_status IN ('approved','published')
       WHERE na.playerid = $1
       ORDER BY na.published_at DESC
       LIMIT $2`,
      [playerId, limit]
    );
    return rows;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// PLAYER PHOTOS — uploaded career-progression photos for the filmstrip.
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
      `SELECT DISTINCT ON (playerid::text) playerid, image_url
         FROM player_photos
        WHERE playerid::text = ANY($1::text[])
          AND image_role = $2
          AND approval_status = 'APPROVED'
          AND (is_active IS NULL OR is_active = TRUE)
        ORDER BY playerid::text, is_primary DESC NULLS LAST, date_taken DESC NULLS LAST`,
      [imageIds, role]
    );
    const map = new Map<string, any>();
    for (const row of rows) {
      map.set(String(row.playerid), row);
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
          AND (
            (show_on_pp_timeline = TRUE AND approval_status = 'APPROVED')
          )
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
        WHEN 'AAA'           THEN 'TRIPLE-A'
        WHEN 'TRIPLE-A'      THEN 'TRIPLE-A'
        WHEN 'AA'            THEN 'DOUBLE-A'
        WHEN 'DOUBLE-A'      THEN 'DOUBLE-A'
        WHEN 'High-A'        THEN 'HIGH-A'
        WHEN 'HIGH-A'        THEN 'HIGH-A'
        WHEN 'A+'            THEN 'HIGH-A'
        WHEN 'Single-A'      THEN 'LOW-A'
        WHEN 'LOW-A'         THEN 'LOW-A'
        WHEN 'A'             THEN 'LOW-A'
        WHEN 'A-'            THEN 'LOW-A'
        WHEN 'Rk'            THEN 'ROOKIE'
        WHEN 'RK'            THEN 'ROOKIE'
        WHEN 'Rookie'        THEN 'ROOKIE'
        WHEN 'ROOKIE'        THEN 'ROOKIE'
        WHEN 'INTL'          THEN 'INT''L'
        WHEN 'Intl'          THEN 'INT''L'
        WHEN 'INT''L'        THEN 'INT''L'
        WHEN 'INTERNATIONAL' THEN 'INT''L'
        WHEN 'Indy'          THEN 'INDY'
        WHEN 'INDY'          THEN 'INDY'
        WHEN 'INDEPENDENT'   THEN 'INDY'
        WHEN 'NCAA-D1'       THEN 'NCAA-D1'
        WHEN 'D1'            THEN 'NCAA-D1'
        WHEN 'NCAA'          THEN 'NCAA-D1'
        WHEN 'NCAA-D2'       THEN 'NCAA-D2'
        WHEN 'D2'            THEN 'NCAA-D2'
        WHEN 'NCAA-D3'       THEN 'NCAA-D3'
        WHEN 'D3'            THEN 'NCAA-D3'
        WHEN 'NAIA'          THEN 'NAIA'
        WHEN 'JrCollege'     THEN 'JUCO'
        WHEN 'JUCO'          THEN 'JUCO'
        WHEN 'NJCAA'         THEN 'JUCO'
        WHEN 'HS'            THEN 'HIGH SCHOOL'
        WHEN 'HIGH SCHOOL'   THEN 'HIGH SCHOOL'
        ELSE COALESCE(UPPER(level_label), '')
      END AS level_label
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
  // eslint-disable-next-line no-var
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
  // eslint-disable-next-line no-var
  var __pgPoolShutdownRegistered: any;
}
if (!global.__pgPoolShutdownRegistered) {
  global.__pgPoolShutdownRegistered = true;
  const shutdown = async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });
}
