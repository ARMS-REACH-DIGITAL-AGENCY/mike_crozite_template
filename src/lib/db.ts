// src/lib/db.ts
// YAT?STATS — Database helpers
// Connects to Neon Postgres via DATABASE_URL env var.
// All player data is sourced from TheBaseballCube tables.
//
// Key tables:
//   tbc_players_raw              — player identity, position, bats/throws, height/weight, highlevel
//   tbc_batting_raw             — historical season batting stats archive
//   tbc_pitching_raw            — historical season pitching stats archive
//   tbc_batting_2026_season_raw — live 2026 batting season stats
//   tbc_pitching_2026_season_raw— live 2026 pitching season stats
//   player_hsids                — links playerid -> hsid (high school)
//   tbc_schools_raw             — high school info (hsid, hsname, colors, nickname) — NOT pro/college teams
//   school_success              — per-school metadata (rank, counts, staging/microsite URLs, colors)
//   teams                       — team_id → team_name lookup; populated via scripts/import-teams.ts
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
      FROM tbc_batting_2026_season_raw
      ORDER BY playerid, year DESC, teamid DESC
    ),

    latest_pitching AS (
      SELECT DISTINCT ON (playerid)
        playerid::text  AS playerid,
        year            AS pitch_year,
        teamid          AS pit_teamid,
        highlevel       AS pit_level,
        g               AS pg,
        gs,
        w, l,
        sv              AS saves,
        ip,
        bb,
        so              AS ko,
        era, whip,
        h9,
        bb9,
        so9,
        so_bb,
        draft_info      AS pit_draft_info,
        playyears       AS pit_playyears
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
      sp.playerid,
      sp.firstname,
      sp.lastname,
      COALESCE(NULLIF(TRIM(sp.firstname || ' ' || sp.lastname), ''), sp.playerid::text) AS display_name,
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
      lb.stat_year,
      lb.g, lb.ab, lb.r, lb.h,
      lb."2b", lb."3b", lb.hr, lb.rbi, lb.sb, lb.bb, lb.so,
      lb.avg, lb.obp, lb.slg, lb.ops,
      COALESCE(lb.draft_info, lp.pit_draft_info)  AS draft_info,
      COALESCE(lb.playyears, lp.pit_playyears)    AS playyears,
      lp.pitch_year,
      lp.pg, lp.gs, lp.w, lp.l, lp.saves,
      lp.ip, lp.bb, lp.ko,
      lp.era, lp.whip, lp.h9, lp.bb9, lp.so9, lp.so_bb,
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
        tp.highlevel AS career_highlevel,
        tp.ht AS height,
        tp.wt AS weight,
        tp.bats,
        tp.throws,
        tp.posit AS position
      FROM player_hsids ph
      JOIN tbc_players_raw tp
        ON ph.playerid::text = tp.playerid::text
      WHERE ph.hsid = $1
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
    ),

    season_batting_2026 AS (
      SELECT DISTINCT ON (playerid)
        playerid::text AS playerid,
        year AS stat_year,
        teamid,
        highlevel AS bat_level,
        g,
        ab,
        r,
        h,
        dbl AS "2b",
        tpl AS "3b",
        hr,
        rbi,
        sb,
        bb AS bat_bb,
        so,
        bavg AS avg,
        obp,
        slg,
        ops,
        draft_info,
        playyears
      FROM tbc_batting_2026_season_raw
      ORDER BY playerid, year DESC, teamid DESC
    ),

    season_pitching_2026 AS (
      SELECT DISTINCT ON (playerid)
        playerid::text AS playerid,
        year AS pitch_year,
        teamid AS pit_teamid,
        highlevel AS pit_level,
        g AS pg,
        gs,
        w,
        l,
        sv AS saves,
        ip,
        bb AS pit_bb,
        so AS ko,
        era,
        whip,
        h9,
        bb9,
        so9,
        so_bb,
        draft_info AS pit_draft_info,
        playyears AS pit_playyears
      FROM tbc_pitching_2026_season_raw
      ORDER BY playerid, year DESC, teamid DESC
    ),

    latest_batting_context AS (
      SELECT DISTINCT ON (playerid)
        playerid::text AS playerid,
        year AS latest_bat_year,
        highlevel AS latest_bat_level,
        draft_info,
        playyears
      FROM public.v_tbc_batting_all_seasons_resolved
      ORDER BY playerid, year DESC, teamid DESC
    ),

    latest_pitching_context AS (
      SELECT DISTINCT ON (playerid)
        playerid::text AS playerid,
        year AS latest_pitch_year,
        highlevel AS latest_pitch_level,
        draft_info AS latest_pitch_draft_info,
        playyears AS latest_pitch_playyears
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
        SUM(${n("bb")})  AS bat_bb,
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
        SUM(${n("g")})  AS pg,
        SUM(${n("gs")}) AS gs,
        SUM(${n("w")})  AS w,
        SUM(${n("l")})  AS l,
        SUM(${n("sv")}) AS saves,
        SUM(${n("ip")}) AS ip,
        SUM(${n("h")})  AS h_allowed,
        SUM(${n("er")}) AS er,
        SUM(${n("bb")}) AS pit_bb,
        SUM(${n("so")}) AS ko,
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

    merged AS (
      SELECT
        sp.playerid,
        sp.firstname,
        sp.lastname,
        sp.career_highlevel,
        sp.height,
        sp.weight,
        sp.bats,
        sp.throws,
        sp.position,

        CASE WHEN a26.playerid IS NOT NULL THEN 'ACTIVE' ELSE 'RETIRED' END AS status_label,

        CASE
          WHEN a26.playerid IS NOT NULL THEN
            CASE
              WHEN sp26.playerid IS NOT NULL
                   AND (sb26.playerid IS NULL OR sp26.pitch_year::int >= sb26.stat_year::int)
              THEN true ELSE false
            END
          ELSE
            CASE
              WHEN cp.playerid IS NOT NULL
                   AND (cb.playerid IS NULL OR COALESCE(lpc.latest_pitch_year,'0')::int >= COALESCE(lbc.latest_bat_year,'0')::int)
              THEN true ELSE false
            END
        END AS is_pitcher,

        sb26.stat_year AS active_stat_year,
        sp26.pitch_year AS active_pitch_year,
        lbc.latest_bat_year AS retired_stat_year,
        lpc.latest_pitch_year AS retired_pitch_year,

        sb26.g AS active_bat_g,
        sb26.ab AS active_bat_ab,
        sb26.r AS active_bat_r,
        sb26.h AS active_bat_h,
        sb26."2b" AS active_bat_2b,
        sb26."3b" AS active_bat_3b,
        sb26.hr AS active_bat_hr,
        sb26.rbi AS active_bat_rbi,
        sb26.sb AS active_bat_sb,
        sb26.bat_bb AS active_bat_bb,
        sb26.so AS active_bat_so,
        sb26.avg AS active_bat_avg,
        sb26.obp AS active_bat_obp,
        sb26.slg AS active_bat_slg,
        sb26.ops AS active_bat_ops,

        cb.g AS career_bat_g,
        cb.ab AS career_bat_ab,
        cb.r AS career_bat_r,
        cb.h AS career_bat_h,
        cb."2b" AS career_bat_2b,
        cb."3b" AS career_bat_3b,
        cb.hr AS career_bat_hr,
        cb.rbi AS career_bat_rbi,
        cb.sb AS career_bat_sb,
        cb.bat_bb AS career_bat_bb,
        cb.so AS career_bat_so,
        cb.avg AS career_bat_avg,
        cb.obp AS career_bat_obp,
        cb.slg AS career_bat_slg,
        cb.ops AS career_bat_ops,

        sp26.pg AS active_pit_g,
        sp26.gs AS active_pit_gs,
        sp26.w AS active_pit_w,
        sp26.l AS active_pit_l,
        sp26.saves AS active_pit_saves,
        sp26.ip AS active_pit_ip,
        sp26.pit_bb AS active_pit_bb,
        sp26.ko AS active_pit_ko,
        sp26.era AS active_pit_era,
        sp26.whip AS active_pit_whip,
        sp26.h9 AS active_pit_h9,
        sp26.bb9 AS active_pit_bb9,
        sp26.so9 AS active_pit_so9,
        sp26.so_bb AS active_pit_so_bb,

        cp.pg AS career_pit_g,
        cp.gs AS career_pit_gs,
        cp.w AS career_pit_w,
        cp.l AS career_pit_l,
        cp.saves AS career_pit_saves,
        cp.ip AS career_pit_ip,
        cp.pit_bb AS career_pit_bb,
        cp.ko AS career_pit_ko,
        cp.era AS career_pit_era,
        cp.whip AS career_pit_whip,
        cp.h9 AS career_pit_h9,
        cp.bb9 AS career_pit_bb9,
        cp.so9 AS career_pit_so9,
        cp.so_bb AS career_pit_so_bb,

        COALESCE(sb26.draft_info, sp26.pit_draft_info, lbc.draft_info, lpc.latest_pitch_draft_info) AS draft_info,
        COALESCE(sb26.playyears, sp26.pit_playyears, lbc.playyears, lpc.latest_pitch_playyears) AS playyears
      FROM school_players sp
      LEFT JOIN active_2026 a26 ON sp.playerid::text = a26.playerid
      LEFT JOIN season_batting_2026 sb26 ON sp.playerid::text = sb26.playerid
      LEFT JOIN season_pitching_2026 sp26 ON sp.playerid::text = sp26.playerid
      LEFT JOIN latest_batting_context lbc ON sp.playerid::text = lbc.playerid
      LEFT JOIN latest_pitching_context lpc ON sp.playerid::text = lpc.playerid
      LEFT JOIN career_batting cb ON sp.playerid::text = cb.playerid
      LEFT JOIN career_pitching cp ON sp.playerid::text = cp.playerid
    )

    SELECT
      m.playerid,
      m.firstname,
      m.lastname,
      COALESCE(NULLIF(TRIM(m.firstname || ' ' || m.lastname), ''), m.playerid::text) AS display_name,
      m.career_highlevel AS level,
      m.height,
      m.weight,
      m.bats,
      m.throws,
      m.position,
      m.status_label,
      m.is_pitcher,

      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_stat_year
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.retired_stat_year
           ELSE NULL END AS stat_year,

      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pitch_year
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.retired_pitch_year
           ELSE NULL END AS pitch_year,

      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_g
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_g END AS g,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_ab
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_ab END AS ab,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_r
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_r END AS r,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_h
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_h END AS h,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_2b
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_2b END AS "2b",
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_3b
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_3b END AS "3b",
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_hr
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_hr END AS hr,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_rbi
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_rbi END AS rbi,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_sb
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_sb END AS sb,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_bb
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_bb
           WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_bb
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_bb
           ELSE NULL END AS bb,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_so
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_so END AS so,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_avg
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_avg END AS avg,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_obp
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_obp END AS obp,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_slg
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_slg END AS slg,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = false THEN m.active_bat_ops
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = false THEN m.career_bat_ops END AS ops,

      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_g
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_g END AS pg,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_gs
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_gs END AS gs,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_w
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_w END AS w,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_l
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_l END AS l,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_saves
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_saves END AS saves,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_ip
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_ip END AS ip,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_ko
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_ko END AS ko,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_era
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_era END AS era,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_whip
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_whip END AS whip,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_h9
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_h9 END AS h9,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_bb9
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_bb9 END AS bb9,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_so9
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_so9 END AS so9,
      CASE WHEN m.status_label = 'ACTIVE' AND m.is_pitcher = true THEN m.active_pit_so_bb
           WHEN m.status_label = 'RETIRED' AND m.is_pitcher = true THEN m.career_pit_so_bb END AS so_bb,

      m.draft_info,
      m.playyears,
      CASE WHEN m.status_label = 'ACTIVE' THEN true ELSE false END AS is_active_2025

    FROM merged m
    ORDER BY
      CASE m.career_highlevel
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
      m.lastname,
      m.firstname
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
         COALESCE(conference, league, association)  AS conference
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
        WHEN 'INTL'         THEN 'INT''L'
        WHEN 'Intl'         THEN 'INT''L'
        WHEN 'INT''L'       THEN 'INT''L'
        WHEN 'INTERNATIONAL' THEN 'INT''L'
        WHEN 'Indy'         THEN 'INDY'
        WHEN 'INDY'         THEN 'INDY'
        WHEN 'INDEPENDENT'  THEN 'INDY'
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
        WHEN 'NJCAA'        THEN 'JUCO'
        WHEN 'HS'           THEN 'HIGH SCHOOL'
        WHEN 'HIGH SCHOOL'  THEN 'HIGH SCHOOL'
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
