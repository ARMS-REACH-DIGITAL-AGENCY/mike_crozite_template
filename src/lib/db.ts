// src/lib/db.ts
// YAT?STATS - Database helpers
// Connects to Neon Postgres via DATABASE_URL env var.
// All player data is sourced from TheBaseballCube tables.
//
// Key tables:
//   tbc_players_raw              - player identity, position, bats/throws, height/weight, highlevel
//   tbc_batting_raw              - historical season batting stats archive
//   tbc_pitching_raw             - historical season pitching stats archive
//   tbc_batting_2026_season_raw  - live 2026 batting season stats
//   tbc_pitching_2026_season_raw - live 2026 pitching season stats
//   player_hsids                 - links playerid -> hsid (high school)
//   tbc_schools_raw              - high school info (hsid, hsname, colors, nickname) - NOT pro/college teams
//   school_success               - per-school metadata (rank, counts, staging/microsite URLs, colors)
//   teams                        - team_id -> team_name lookup; populated via scripts/import-teams.ts
//
// "Active" = player has batting or pitching stats from 2026
// "All-time" = all players ever tagged to a school in player_hsids

'use server';
import { cache } from 'react';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import 'server-only';

const pool = new Pool({
  connectionString: process.env.PLAYERS_DATABASE_URL || process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 10000,
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
// SINGLE PLAYER - full player identity for profile page
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
export const getSchoolByHsid = cache(async function getSchoolByHsid(hsid: string) {
  if (!/^\d+$/.test(hsid)) return null;
  const { rows } = await query(
    'SELECT * FROM school_success WHERE hsid = $1 LIMIT 1',
    [hsid]
  );
  return rows[0] || null;
});

export const getSchoolByUrl = cache(async function getSchoolByUrl(hostOrUrl: string) {
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
});

// ---------------------------------------------------------------------------
// ACTIVE ROSTER - players with 2026 stats (homepage)
//
// Returns one row per player with their current 2026 season stats.
// "Active" = has batting OR pitching stats in year 2026.
// ---------------------------------------------------------------------------
export const getActiveRosterByHsid = cache(async function getActiveRosterByHsid(hsid: string): Promise<any[]> {
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

    batting_2026_by_level AS (
      SELECT
        playerid::text AS playerid,
        MAX(year)      AS stat_year,
        highlevel      AS bat_level,
        MAX(teamid)    AS teamid,

        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(g::text,   '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS g,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(ab::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS ab,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(r::text,   '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS r,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(h::text,   '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS h,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(dbl::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS "2b",
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(tpl::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS "3b",
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(hr::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS hr,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(rbi::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS rbi,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(sb::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS sb,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(bb::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS bb,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(so::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS so,

        MAX(draft_info) AS draft_info,
        MAX(playyears)  AS playyears
      FROM tbc_batting_2026_season_raw
      WHERE year = '2026'
      GROUP BY playerid::text, highlevel
    ),

    latest_batting AS (
      SELECT DISTINCT ON (playerid)
        playerid,
        stat_year,
        teamid,
        bat_level,
        g, ab, r, h, "2b", "3b", hr, rbi, sb, bb, so,

        CASE
          WHEN ab > 0 THEN ROUND(h / ab, 3)
          ELSE NULL
        END AS avg,

        CASE
          WHEN (ab + bb) > 0 THEN ROUND((h + bb) / (ab + bb), 3)
          ELSE NULL
        END AS obp,

        CASE
          WHEN ab > 0 THEN ROUND((h + "2b" + ("3b" * 2) + (hr * 3)) / ab, 3)
          ELSE NULL
        END AS slg,

        CASE
          WHEN ab > 0 AND (ab + bb) > 0 THEN
            ROUND(
              ((h + bb) / (ab + bb)) +
              ((h + "2b" + ("3b" * 2) + (hr * 3)) / ab),
              3
            )
          ELSE NULL
        END AS ops,

        draft_info,
        playyears
      FROM batting_2026_by_level
      ORDER BY
        playerid,
        CASE UPPER(COALESCE(bat_level, ''))
          WHEN 'MLB'           THEN 1
          WHEN 'TRIPLE-A'      THEN 2
          WHEN 'AAA'           THEN 2
          WHEN 'DOUBLE-A'      THEN 3
          WHEN 'AA'            THEN 3
          WHEN 'HIGH-A'        THEN 4
          WHEN 'A+'            THEN 4
          WHEN 'LOW-A'         THEN 5
          WHEN 'SINGLE-A'      THEN 5
          WHEN 'A'             THEN 5
          WHEN 'ROOKIE'        THEN 6
          WHEN 'INT''L'        THEN 7
          WHEN 'INTERNATIONAL' THEN 7
          WHEN 'INDY'          THEN 8
          WHEN 'INDEPENDENT'   THEN 8
          WHEN 'NCAA-D1'       THEN 9
          WHEN 'D1'            THEN 9
          WHEN 'NCAA-D2'       THEN 10
          WHEN 'D2'            THEN 10
          WHEN 'NCAA-D3'       THEN 11
          WHEN 'D3'            THEN 11
          WHEN 'NAIA'          THEN 12
          WHEN 'JUCO'          THEN 13
          ELSE 99
        END
    ),

    pitching_2026_rows AS (
      SELECT
        playerid::text AS playerid,
        year,
        highlevel,
        teamid,
        g,
        gs,
        w,
        l,
        sv,
        ip,
        h,
        er,
        bb,
        so,
        draft_info,
        playyears,
        NULLIF(regexp_replace(COALESCE(ip::text, '0'), '[^0-9.]', '', 'g'), '') AS ip_clean
      FROM tbc_pitching_2026_season_raw
      WHERE year = '2026'
    ),

    pitching_2026_by_level AS (
      SELECT
        playerid,
        MAX(year)   AS pitch_year,
        highlevel   AS pit_level,
        MAX(teamid) AS pit_teamid,

        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(g::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS pg,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(gs::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS gs,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(w::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS w,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(l::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS l,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(sv::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS saves,

        /* Baseball IP is not decimal math: 1.1 = 1 inning + 1 out, 1.2 = 1 inning + 2 outs. */
        COALESCE(
          SUM(
            (FLOOR(COALESCE(ip_clean::numeric, 0))::int * 3) +
            CASE split_part(COALESCE(ip_clean, '0'), '.', 2)
              WHEN '1' THEN 1
              WHEN '2' THEN 2
              ELSE 0
            END
          ),
          0
        ) AS outs,

        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(h::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS hits_allowed,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(er::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS er,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(bb::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS bb,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(so::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS ko,

        MAX(draft_info) AS pit_draft_info,
        MAX(playyears)  AS pit_playyears
      FROM pitching_2026_rows
      GROUP BY playerid, highlevel
    ),

    latest_pitching AS (
      SELECT DISTINCT ON (playerid)
        playerid,
        pitch_year,
        pit_teamid,
        pit_level,
        pg,
        gs,
        w,
        l,
        saves,

        (FLOOR(outs / 3)::numeric + ((outs % 3)::numeric / 10)) AS ip,
        er,
        bb,
        ko,

        CASE
          WHEN outs > 0 THEN ROUND((er * 9) / (outs::numeric / 3), 2)
          ELSE NULL
        END AS era,

        CASE
          WHEN outs > 0 THEN ROUND((hits_allowed + bb) / (outs::numeric / 3), 2)
          ELSE NULL
        END AS whip,

        CASE
          WHEN outs > 0 THEN ROUND((hits_allowed * 9) / (outs::numeric / 3), 2)
          ELSE NULL
        END AS h9,

        CASE
          WHEN outs > 0 THEN ROUND((bb * 9) / (outs::numeric / 3), 2)
          ELSE NULL
        END AS bb9,

        CASE
          WHEN outs > 0 THEN ROUND((ko * 9) / (outs::numeric / 3), 2)
          ELSE NULL
        END AS so9,

        CASE
          WHEN bb > 0 THEN ROUND(ko / bb, 2)
          ELSE NULL
        END AS so_bb,

        pit_draft_info,
        pit_playyears
      FROM pitching_2026_by_level
      ORDER BY
        playerid,
        CASE UPPER(COALESCE(pit_level, ''))
          WHEN 'MLB'           THEN 1
          WHEN 'TRIPLE-A'      THEN 2
          WHEN 'AAA'           THEN 2
          WHEN 'DOUBLE-A'      THEN 3
          WHEN 'AA'            THEN 3
          WHEN 'HIGH-A'        THEN 4
          WHEN 'A+'            THEN 4
          WHEN 'LOW-A'         THEN 5
          WHEN 'SINGLE-A'      THEN 5
          WHEN 'A'             THEN 5
          WHEN 'ROOKIE'        THEN 6
          WHEN 'INT''L'        THEN 7
          WHEN 'INTERNATIONAL' THEN 7
          WHEN 'INDY'          THEN 8
          WHEN 'INDEPENDENT'   THEN 8
          WHEN 'NCAA-D1'       THEN 9
          WHEN 'D1'            THEN 9
          WHEN 'NCAA-D2'       THEN 10
          WHEN 'D2'            THEN 10
          WHEN 'NCAA-D3'       THEN 11
          WHEN 'D3'            THEN 11
          WHEN 'NAIA'          THEN 12
          WHEN 'JUCO'          THEN 13
          ELSE 99
        END
    ),


    batting_2026_bucket_rows AS (
      SELECT
        playerid::text AS playerid,
        CASE
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int < 100 THEN 'mlb'
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int >= 10000
            AND NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int < 20000 THEN 'minors'
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int >= 20000 THEN 'college'
          ELSE 'other'
        END AS bucket,
        year,
        g, ab, r, h, dbl, tpl, hr, rbi, sb, bb, so
      FROM tbc_batting_2026_season_raw
      WHERE year = '2026'
    ),

    batting_2026_by_bucket AS (
      SELECT
        playerid,
        bucket,
        MAX(year) AS stat_year,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(g::text,   '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS g,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(ab::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS ab,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(r::text,   '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS r,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(h::text,   '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS h,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(dbl::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS "2b",
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(tpl::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS "3b",
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(hr::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS hr,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(rbi::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS rbi,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(sb::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS sb,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(bb::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS bb,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(so::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS so
      FROM batting_2026_bucket_rows
      WHERE bucket <> 'other'
      GROUP BY playerid, bucket
    ),

    season_batting_buckets AS (
      SELECT
        playerid,
        jsonb_agg(
          jsonb_build_object(
            'bucket', bucket,
            'label', CASE bucket
              WHEN 'mlb' THEN '2026 MLB BATTING'
              WHEN 'minors' THEN '2026 MINOR LEAGUE BATTING'
              WHEN 'college' THEN '2026 COLLEGE BATTING'
              ELSE '2026 BATTING'
            END,
            'type', 'batting',
            'stats', jsonb_build_object(
              'avg', CASE WHEN ab > 0 THEN ROUND(h / ab, 3) ELSE NULL END,
              'ab', ab,
              'h', h,
              'obp', CASE WHEN (ab + bb) > 0 THEN ROUND((h + bb) / (ab + bb), 3) ELSE NULL END,
              'r', r,
              'bb', bb,
              'slg', CASE WHEN ab > 0 THEN ROUND((h + "2b" + ("3b" * 2) + (hr * 3)) / ab, 3) ELSE NULL END,
              'hr', hr,
              'rbi', rbi,
              'ops', CASE
                WHEN ab > 0 AND (ab + bb) > 0 THEN ROUND(((h + bb) / (ab + bb)) + ((h + "2b" + ("3b" * 2) + (hr * 3)) / ab), 3)
                ELSE NULL
              END,
              'sb', sb,
              'g', g
            )
          )
          ORDER BY CASE bucket WHEN 'mlb' THEN 1 WHEN 'minors' THEN 2 WHEN 'college' THEN 3 ELSE 4 END
        ) AS season_batting_buckets
      FROM batting_2026_by_bucket
      GROUP BY playerid
    ),

    pitching_2026_bucket_rows AS (
      SELECT
        playerid,
        CASE
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int < 100 THEN 'mlb'
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int >= 10000
            AND NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int < 20000 THEN 'minors'
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int >= 20000 THEN 'college'
          ELSE 'other'
        END AS bucket,
        year,
        g, gs, w, l, sv, ip, h, er, bb, so, ip_clean
      FROM pitching_2026_rows
    ),

    pitching_2026_by_bucket AS (
      SELECT
        playerid,
        bucket,
        MAX(year) AS pitch_year,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(g::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS pg,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(gs::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS gs,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(w::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS w,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(l::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS l,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(sv::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS saves,
        COALESCE(
          SUM(
            (FLOOR(COALESCE(ip_clean::numeric, 0))::int * 3) +
            CASE split_part(COALESCE(ip_clean, '0'), '.', 2)
              WHEN '1' THEN 1
              WHEN '2' THEN 2
              ELSE 0
            END
          ),
          0
        ) AS outs,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(h::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS hits_allowed,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(er::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS er,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(bb::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS bb,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(so::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS ko
      FROM pitching_2026_bucket_rows
      WHERE bucket <> 'other'
      GROUP BY playerid, bucket
    ),

    season_pitching_buckets AS (
      SELECT
        playerid,
        jsonb_agg(
          jsonb_build_object(
            'bucket', bucket,
            'label', CASE bucket
              WHEN 'mlb' THEN '2026 MLB PITCHING'
              WHEN 'minors' THEN '2026 MINOR LEAGUE PITCHING'
              WHEN 'college' THEN '2026 COLLEGE PITCHING'
              ELSE '2026 PITCHING'
            END,
            'type', 'pitching',
            'stats', jsonb_build_object(
              'ip', (FLOOR(outs / 3)::numeric + ((outs % 3)::numeric / 10)),
              'er', er,
              'era', CASE WHEN outs > 0 THEN ROUND((er * 9) / (outs::numeric / 3), 2) ELSE NULL END,
              'ko', ko,
              'bb', bb,
              'whip', CASE WHEN outs > 0 THEN ROUND((hits_allowed + bb) / (outs::numeric / 3), 2) ELSE NULL END,
              'so9', CASE WHEN outs > 0 THEN ROUND((ko * 9) / (outs::numeric / 3), 2) ELSE NULL END,
              'bb9', CASE WHEN outs > 0 THEN ROUND((bb * 9) / (outs::numeric / 3), 2) ELSE NULL END,
              'so_bb', CASE WHEN bb > 0 THEN ROUND(ko / bb, 2) ELSE NULL END,
              'w', w,
              'l', l,
              'saves', saves,
              'pg', pg
            )
          )
          ORDER BY CASE bucket WHEN 'mlb' THEN 1 WHEN 'minors' THEN 2 WHEN 'college' THEN 3 ELSE 4 END
        ) AS season_pitching_buckets
      FROM pitching_2026_by_bucket
      GROUP BY playerid
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
      lb."2b", lb."3b", lb.hr, lb.rbi, lb.sb,
      CASE
        WHEN lp.pitch_year IS NOT NULL AND (
          lb.stat_year IS NULL OR lp.pitch_year::int >= lb.stat_year::int
        ) THEN lp.bb
        ELSE lb.bb
      END AS bb,
      lb.so,
      lb.avg, lb.obp, lb.slg, lb.ops,
      COALESCE(lb.draft_info, lp.pit_draft_info)  AS draft_info,
      COALESCE(lb.playyears, lp.pit_playyears)    AS playyears,
      lp.pitch_year,
      lp.pg, lp.gs, lp.w, lp.l, lp.saves,
      lp.ip, lp.er, lp.ko,
      lp.era, lp.whip, lp.h9, lp.bb9, lp.so9, lp.so_bb,
      COALESCE(sbb.season_batting_buckets, '[]'::jsonb) AS season_batting_buckets,
      COALESCE(spb.season_pitching_buckets, '[]'::jsonb) AS season_pitching_buckets,
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
    LEFT JOIN season_batting_buckets sbb ON sp.playerid::text = sbb.playerid
    LEFT JOIN season_pitching_buckets spb ON sp.playerid::text = spb.playerid
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
});

// ---------------------------------------------------------------------------
// ALL-TIME ROSTER - every alumni ever tagged to a school (all-time page)
// ---------------------------------------------------------------------------
export const getAllTimeRosterByHsid = cache(async function getAllTimeRosterByHsid(hsid: string): Promise<any[]> {
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

    career_batting_by_bucket AS (
      SELECT
        playerid::text AS playerid,
        CASE
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int < 100 THEN 'mlb'
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int >= 10000
            AND NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int < 20000 THEN 'minors'
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int >= 20000 THEN 'college'
          ELSE 'other'
        END AS bucket,
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
      GROUP BY playerid::text, bucket
    ),

    career_batting AS (
      SELECT DISTINCT ON (playerid)
        *,
        CASE bucket
          WHEN 'mlb' THEN 'MLB CAREER'
          WHEN 'minors' THEN 'MINOR LEAGUE CAREER'
          WHEN 'college' THEN 'COLLEGE CAREER'
          ELSE 'CAREER'
        END AS career_bucket_label
      FROM career_batting_by_bucket
      WHERE bucket <> 'other'
      ORDER BY
        playerid,
        CASE bucket
          WHEN 'mlb' THEN 1
          WHEN 'minors' THEN 2
          WHEN 'college' THEN 3
          ELSE 4
        END
    ),

    career_batting_buckets AS (
      SELECT
        playerid,
        jsonb_agg(
          jsonb_build_object(
            'bucket', bucket,
            'type', 'batting',
            'label', CASE bucket
              WHEN 'mlb' THEN 'MLB CAREER BATTING'
              WHEN 'minors' THEN 'MINOR LEAGUE CAREER BATTING'
              WHEN 'college' THEN 'COLLEGE CAREER BATTING'
              ELSE 'CAREER BATTING'
            END,
            'stats', jsonb_build_object(
              'g', g,
              'ab', ab,
              'r', r,
              'h', h,
              '2b', "2b",
              '3b', "3b",
              'hr', hr,
              'rbi', rbi,
              'sb', sb,
              'bb', bb,
              'so', so,
              'tb', tb,
              'avg', avg,
              'obp', obp,
              'slg', slg,
              'ops', ops
            )
          )
          ORDER BY CASE bucket WHEN 'mlb' THEN 1 WHEN 'minors' THEN 2 WHEN 'college' THEN 3 ELSE 4 END
        ) AS career_batting_buckets
      FROM career_batting_by_bucket
      WHERE bucket <> 'other'
      GROUP BY playerid
    ),

    career_pitching_by_bucket AS (
      SELECT
        playerid::text AS playerid,
        CASE
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int < 100 THEN 'mlb'
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int >= 10000
            AND NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int < 20000 THEN 'minors'
          WHEN NULLIF(regexp_replace(COALESCE(teamid::text, ''), '[^0-9]', '', 'g'), '')::int >= 20000 THEN 'college'
          ELSE 'other'
        END AS bucket,
        COUNT(DISTINCT year) AS pitching_seasons,
        SUM(${n("g")})   AS pg,
        SUM(${n("gs")})  AS gs,
        SUM(${n("w")})   AS w,
        SUM(${n("l")})   AS l,
        SUM(${n("sv")})  AS saves,
        /* Baseball IP is not decimal math: 1.1 = 1 inning + 1 out, 1.2 = 1 inning + 2 outs. */
        COALESCE(
          SUM(
            (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
            CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
              WHEN '1' THEN 1
              WHEN '2' THEN 2
              ELSE 0
            END
          ),
          0
        ) AS outs,
        SUM(${n("h")})   AS h_allowed,
        SUM(${n("er")})  AS er,
        SUM(${n("bb")})  AS bb,
        SUM(${n("so")})  AS ko,
        (FLOOR(
          COALESCE(
            SUM(
              (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
              CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
                WHEN '1' THEN 1
                WHEN '2' THEN 2
                ELSE 0
              END
            ),
            0
          ) / 3
        )::numeric + (
          COALESCE(
            SUM(
              (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
              CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
                WHEN '1' THEN 1
                WHEN '2' THEN 2
                ELSE 0
              END
            ),
            0
          ) % 3
        )::numeric / 10) AS ip,
        CASE
          WHEN COALESCE(
            SUM(
              (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
              CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
                WHEN '1' THEN 1
                WHEN '2' THEN 2
                ELSE 0
              END
            ),
            0
          ) > 0
          THEN ROUND(
            SUM(${n("er")}) * 9 /
            (COALESCE(SUM(
              (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
              CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
                WHEN '1' THEN 1
                WHEN '2' THEN 2
                ELSE 0
              END
            ), 0)::numeric / 3),
            2
          )
          ELSE NULL
        END AS era,
        CASE
          WHEN COALESCE(SUM(
            (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
            CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
              WHEN '1' THEN 1
              WHEN '2' THEN 2
              ELSE 0
            END
          ), 0) > 0
          THEN ROUND(
            (SUM(${n("bb")}) + SUM(${n("h")})) /
            (COALESCE(SUM(
              (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
              CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
                WHEN '1' THEN 1
                WHEN '2' THEN 2
                ELSE 0
              END
            ), 0)::numeric / 3),
            2
          )
          ELSE NULL
        END AS whip,
        CASE
          WHEN COALESCE(SUM(
            (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
            CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
              WHEN '1' THEN 1
              WHEN '2' THEN 2
              ELSE 0
            END
          ), 0) > 0
          THEN ROUND(
            SUM(${n("h")}) * 9 /
            (COALESCE(SUM(
              (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
              CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
                WHEN '1' THEN 1
                WHEN '2' THEN 2
                ELSE 0
              END
            ), 0)::numeric / 3),
            2
          )
          ELSE NULL
        END AS h9,
        CASE
          WHEN COALESCE(SUM(
            (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
            CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
              WHEN '1' THEN 1
              WHEN '2' THEN 2
              ELSE 0
            END
          ), 0) > 0
          THEN ROUND(
            SUM(${n("bb")}) * 9 /
            (COALESCE(SUM(
              (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
              CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
                WHEN '1' THEN 1
                WHEN '2' THEN 2
                ELSE 0
              END
            ), 0)::numeric / 3),
            2
          )
          ELSE NULL
        END AS bb9,
        CASE
          WHEN COALESCE(SUM(
            (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
            CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
              WHEN '1' THEN 1
              WHEN '2' THEN 2
              ELSE 0
            END
          ), 0) > 0
          THEN ROUND(
            SUM(${n("so")}) * 9 /
            (COALESCE(SUM(
              (FLOOR(COALESCE(${n("ip")}, 0))::int * 3) +
              CASE split_part(COALESCE(${n("ip")}::text, '0'), '.', 2)
                WHEN '1' THEN 1
                WHEN '2' THEN 2
                ELSE 0
              END
            ), 0)::numeric / 3),
            2
          )
          ELSE NULL
        END AS so9,
        CASE
          WHEN SUM(${n("bb")}) > 0
          THEN ROUND(SUM(${n("so")}) / SUM(${n("bb")}), 2)
          ELSE NULL
        END AS so_bb
      FROM public.v_tbc_pitching_all_seasons_resolved
      GROUP BY playerid::text, bucket
    ),

    career_pitching AS (
      SELECT DISTINCT ON (playerid)
        *,
        CASE bucket
          WHEN 'mlb' THEN 'MLB CAREER'
          WHEN 'minors' THEN 'MINOR LEAGUE CAREER'
          WHEN 'college' THEN 'COLLEGE CAREER'
          ELSE 'CAREER'
        END AS career_bucket_label
      FROM career_pitching_by_bucket
      WHERE bucket <> 'other'
      ORDER BY
        playerid,
        CASE bucket
          WHEN 'mlb' THEN 1
          WHEN 'minors' THEN 2
          WHEN 'college' THEN 3
          ELSE 4
        END
    ),

    career_pitching_buckets AS (
      SELECT
        playerid,
        jsonb_agg(
          jsonb_build_object(
            'bucket', bucket,
            'type', 'pitching',
            'label', CASE bucket
              WHEN 'mlb' THEN 'MLB CAREER PITCHING'
              WHEN 'minors' THEN 'MINOR LEAGUE CAREER PITCHING'
              WHEN 'college' THEN 'COLLEGE CAREER PITCHING'
              ELSE 'CAREER PITCHING'
            END,
            'stats', jsonb_build_object(
              'pg', pg,
              'g', pg,
              'gs', gs,
              'w', w,
              'l', l,
              'saves', saves,
              'outs', outs,
              'ip', ip,
              'h_allowed', h_allowed,
              'er', er,
              'bb', bb,
              'ko', ko,
              'era', era,
              'whip', whip,
              'h9', h9,
              'bb9', bb9,
              'so9', so9,
              'so_bb', so_bb
            )
          )
          ORDER BY CASE bucket WHEN 'mlb' THEN 1 WHEN 'minors' THEN 2 WHEN 'college' THEN 3 ELSE 4 END
        ) AS career_pitching_buckets
      FROM career_pitching_by_bucket
      WHERE bucket <> 'other'
      GROUP BY playerid
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
      COALESCE(cp.career_bucket_label, cb.career_bucket_label, 'CAREER') AS career_bucket_label,
      cbb.career_batting_buckets,
      cpb.career_pitching_buckets,

      cb.g,
      cb.ab,
      cb.r,
      cb.h,
      cb."2b",
      cb."3b",
      cb.hr,
      cb.rbi,
      cb.sb,
      CASE
        WHEN cp.playerid IS NOT NULL AND (cb.playerid IS NULL OR lpl.pitch_year::int >= lbl.stat_year::int)
        THEN cp.bb
        ELSE cb.bb
      END AS bb,
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
      cp.er,
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
    LEFT JOIN career_batting_buckets  cbb ON sp.playerid::text = cbb.playerid
    LEFT JOIN career_pitching_buckets cpb ON sp.playerid::text = cpb.playerid
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
});

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
// PLAYER SCHOOL - which school(s) a player is linked to
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
// SEASON-BY-SEASON BATTING STATS - all years for a player
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
// SEASON-BY-SEASON PITCHING STATS - all years for a player
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
// CAREER AGGREGATE STATS - totals across all seasons
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
      COALESCE(
        SUM(
          (FLOOR(COALESCE(${n('ip')}, 0))::int * 3) +
          CASE split_part(COALESCE(${n('ip')}::text, '0'), '.', 2)
            WHEN '1' THEN 1
            WHEN '2' THEN 2
            ELSE 0
          END
        ),
        0
      ) AS outs,
      (
        FLOOR(
          COALESCE(
            SUM(
              (FLOOR(COALESCE(${n('ip')}, 0))::int * 3) +
              CASE split_part(COALESCE(${n('ip')}::text, '0'), '.', 2)
                WHEN '1' THEN 1
                WHEN '2' THEN 2
                ELSE 0
              END
            ),
            0
          ) / 3
        )::numeric
        +
        (
          COALESCE(
            SUM(
              (FLOOR(COALESCE(${n('ip')}, 0))::int * 3) +
              CASE split_part(COALESCE(${n('ip')}::text, '0'), '.', 2)
                WHEN '1' THEN 1
                WHEN '2' THEN 2
                ELSE 0
              END
            ),
            0
          ) % 3
        )::numeric / 10
      ) AS ip,
      SUM(${n('h')}) AS h,
      SUM(${n('er')}) AS er,
      SUM(${n('so')}) AS ko, SUM(${n('bb')}) AS bb,
      CASE
        WHEN COALESCE(SUM(
          (FLOOR(COALESCE(${n('ip')}, 0))::int * 3) +
          CASE split_part(COALESCE(${n('ip')}::text, '0'), '.', 2)
            WHEN '1' THEN 1
            WHEN '2' THEN 2
            ELSE 0
          END
        ), 0) > 0
        THEN ROUND(
          SUM(${n('er')}) * 9 /
          (COALESCE(SUM(
            (FLOOR(COALESCE(${n('ip')}, 0))::int * 3) +
            CASE split_part(COALESCE(${n('ip')}::text, '0'), '.', 2)
              WHEN '1' THEN 1
              WHEN '2' THEN 2
              ELSE 0
            END
          ), 0)::numeric / 3),
          2
        )
        ELSE NULL
      END AS era,
      CASE
        WHEN COALESCE(SUM(
          (FLOOR(COALESCE(${n('ip')}, 0))::int * 3) +
          CASE split_part(COALESCE(${n('ip')}::text, '0'), '.', 2)
            WHEN '1' THEN 1
            WHEN '2' THEN 2
            ELSE 0
          END
        ), 0) > 0
        THEN ROUND(
          (SUM(${n('bb')}) + SUM(${n('h')})) /
          (COALESCE(SUM(
            (FLOOR(COALESCE(${n('ip')}, 0))::int * 3) +
            CASE split_part(COALESCE(${n('ip')}::text, '0'), '.', 2)
              WHEN '1' THEN 1
              WHEN '2' THEN 2
              ELSE 0
            END
          ), 0)::numeric / 3),
          2
        )
        ELSE NULL
      END AS whip,
      CASE
        WHEN COALESCE(SUM(
          (FLOOR(COALESCE(${n('ip')}, 0))::int * 3) +
          CASE split_part(COALESCE(${n('ip')}::text, '0'), '.', 2)
            WHEN '1' THEN 1
            WHEN '2' THEN 2
            ELSE 0
          END
        ), 0) > 0
        THEN ROUND(
          SUM(${n('so')}) * 9 /
          (COALESCE(SUM(
            (FLOOR(COALESCE(${n('ip')}, 0))::int * 3) +
            CASE split_part(COALESCE(${n('ip')}::text, '0'), '.', 2)
              WHEN '1' THEN 1
              WHEN '2' THEN 2
              ELSE 0
            END
          ), 0)::numeric / 3),
          2
        )
        ELSE NULL
      END AS k9,
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
// TEAM CONTEXT - optional organization / conference metadata for a team.
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
// TEAM SCHEDULE - chronological game feed for a given team_id.
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
// PLAYER GAME LOG - per-game batting stats for a player on a given team.
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
// NEWS ARTICLES - from news_articles table (populated by Webz.io cron job)
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
// PLAYER PHOTOS - uploaded career-progression photos for the filmstrip.
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

export const getBatchDesignatedPlayerImages = cache(async function getBatchDesignatedPlayerImages(
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
});

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
// FLIP CARD FRONT STAGE - staging table for UI rendering
// ---------------------------------------------------------------------------
export const getFlipCardFrontStageByHsid = cache(async function getFlipCardFrontStageByHsid(hsid: string): Promise<any[]> {
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
});

// ---------------------------------------------------------------------------
// ROSTER TRUTH - resolved current team + transactions
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
// Schema changes belong in migrations and ingest scripts, not at module import time.
// Avoiding import-time database writes prevents build/static-generation workers from
// opening PostgreSQL connections before a request actually needs data.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
declare global {
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
