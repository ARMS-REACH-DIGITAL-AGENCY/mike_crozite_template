// The season-stats query behind every card (Active roster, cross-school
// favorites, season usage) and the Daily Digest's season line, so both
// always show the same numbers (Pete, Nov 23 2026). Pure SQL text; no database
// access here. Moved from src/lib/db.ts.
// OBP is the official (H + BB + HBP) / (AB + BB + HBP + SF) (Pete, Nov 24 2026).
import { confirmed2026GameLogPlayersSql } from '@/lib/activeAlumni';

export function buildActiveRosterSql(schoolPlayersFilter: string, statsRowsFilter: string): string {
  // Verified source IDs are resolved to the canonical school card without
  // rewriting or attaching the duplicate TBC record to the high school.
  const canonicalSourceFilter = statsRowsFilter.replace('playerid::text', 'canonical_playerid::text');
  const canonicalSchoolFilter = schoolPlayersFilter
    .replaceAll('ph.playerid', 'f.playerid')
    .replaceAll('ph.hsid', 'f.hsid')
    // player_hsids.hsid is integer; flip_card_front_stage.hsid is text.
    // $1 is inferred as integer in the original school roster predicate.
    .replace(/f\.hsid\s*=\s*\$1\b/g, 'f.hsid = $1::text');
  return `
    WITH school_players AS (
      SELECT
        ph.playerid, tp.firstname, tp.lastname,
        tp.highlevel AS career_highlevel,
        tp.ht AS height, tp.wt AS weight,
        tp.bats, tp.throws, tp.posit AS position
      FROM player_hsids ph
      JOIN tbc_players_raw tp ON ph.playerid::text = tp.playerid::text
      WHERE ${schoolPlayersFilter}

      UNION ALL

      -- Generic verified aliases only; never infer identities by name alone.
      SELECT f.playerid, tp.firstname, tp.lastname,
        tp.highlevel, tp.ht, tp.wt, tp.bats, tp.throws, tp.posit
      FROM public.flip_card_front_stage f
      JOIN public.player_source_map m
        ON m.playerid=f.playerid AND m.source='tbc'
       AND m.is_verified IS TRUE AND m.match_method='duplicate_tbc_record'
      JOIN public.tbc_players_raw tp ON tp.playerid=m.source_player_id
      WHERE f.hsid IS NOT NULL AND ${canonicalSchoolFilter}
        AND NOT EXISTS (
          SELECT 1 FROM public.player_hsids ph2
          WHERE ph2.playerid=f.playerid AND ph2.hsid::text=f.hsid
        )
    ),

    -- Restrict source IDs before reading the million-row archive.
    school_stat_sources AS MATERIALIZED (
      SELECT sp.playerid::text AS source_playerid,
             sp.playerid::text AS canonical_playerid
      FROM school_players sp
      WHERE sp.playerid::text ~ '^[0-9]+$'
      UNION
      SELECT m.source_player_id AS source_playerid,
             sp.playerid::text AS canonical_playerid
      FROM school_players sp
      JOIN public.player_source_map m ON m.playerid=sp.playerid
       AND m.source='tbc' AND m.is_verified IS TRUE
       AND m.match_method='duplicate_tbc_record'
    ),

    confirmed_game_log_players AS MATERIALIZED (
      ${confirmed2026GameLogPlayersSql('SELECT playerid::text FROM school_players')}
    ),

    batting_2026_rows AS (
      SELECT
        canonical_playerid::text AS playerid,
        year::text AS year,
        canonical_level::text AS season_level,
        teamid::text AS teamid,
        g, ab, r, h, dbl, tpl, hr, rbi, sb, bb, so, hbp, sf,
        draft_info,
        playyears
      FROM (
        SELECT raw_b.*, source_map.canonical_playerid,
          canonical.level_label AS canonical_level
        FROM (
          SELECT * FROM public.v_tbc_batting_all_seasons_resolved
          WHERE year='2026'
            AND playerid::text = ANY(ARRAY(SELECT source_playerid FROM school_stat_sources))
        ) raw_b
        JOIN school_stat_sources source_map
          ON raw_b.playerid=source_map.source_playerid
        LEFT JOIN public.teamid_universe_mapping canonical
          ON canonical.teamid = raw_b.teamid::text
      ) tbc_bat
      WHERE year = '2026' AND ${canonicalSourceFilter}

      UNION ALL

      SELECT
        yatstats_playerid::text AS playerid,
        season_year::text AS year,
        indy_map.level_label::text AS season_level,
        indy_bat.teamid::text AS teamid,
        COALESCE(
          raw_stats #>> '{stats,GP}',
          raw_stats #>> '{stats,G}',
          raw_stats #>> '{GP}',
          raw_stats #>> '{G}'
        )::text AS g,
        ab::text, r::text, h::text, dbl::text, tpl::text, hr::text, rbi::text,
        sb::text, bb::text, so::text,
        COALESCE(raw_stats #>> '{stats,HBP}', raw_stats #>> '{HBP}')::text AS hbp,
        COALESCE(raw_stats #>> '{stats,SF}', raw_stats #>> '{SF}')::text AS sf,
        NULL::text AS draft_info,
        NULL::text AS playyears
      FROM (
        SELECT DISTINCT ON (yatstats_playerid, season_year, teamid)
          *
        FROM public.indy_iscore_batting_2026_season_raw
        WHERE season_year = 2026
          AND yatstats_playerid IS NOT NULL
          AND yatstats_playerid::text = ANY(ARRAY(SELECT playerid::text FROM school_players))
        ORDER BY
          yatstats_playerid,
          season_year,
          teamid,
          CASE WHEN source_system = 'iscore_central' THEN 0 ELSE 1 END,
          updated_at DESC
      ) indy_bat
      LEFT JOIN public.teamid_universe_mapping indy_map
        ON indy_map.teamid = indy_bat.teamid::text
    ),

    batting_2026_by_level AS (
      SELECT
        playerid::text AS playerid,
        MAX(year)      AS stat_year,
        season_level      AS bat_level,
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
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(hbp::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS hbp,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(sf::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS sf,

        MAX(draft_info) AS draft_info,
        MAX(playyears)  AS playyears
      FROM batting_2026_rows
      GROUP BY playerid::text, season_level
    ),

    latest_batting AS (
      SELECT DISTINCT ON (playerid)
        playerid,
        stat_year,
        teamid,
        bat_level,
        g, ab, r, h, "2b", "3b", hr, rbi, sb, bb, so, hbp, sf,

        CASE
          WHEN ab > 0 THEN ROUND(h / ab, 3)
          ELSE NULL
        END AS avg,

        CASE
          WHEN (ab + bb + hbp + sf) > 0 THEN ROUND((h + bb + hbp) / (ab + bb + hbp + sf), 3)
          ELSE NULL
        END AS obp,

        CASE
          WHEN ab > 0 THEN ROUND((h + "2b" + ("3b" * 2) + (hr * 3)) / ab, 3)
          ELSE NULL
        END AS slg,

        CASE
          WHEN ab > 0 AND (ab + bb + hbp + sf) > 0 THEN
            ROUND(
              ((h + bb + hbp) / (ab + bb + hbp + sf)) +
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
          WHEN 'NJCAA'         THEN 13
          WHEN 'CCCAA'         THEN 13
          WHEN 'NWAC'          THEN 13
          ELSE 99
        END
    ),

    pitching_2026_rows AS (
      SELECT
        canonical_playerid::text AS playerid,
        year::text AS year,
        canonical_level::text AS season_level,
        teamid::text AS teamid,
        g::text AS g,
        gs::text AS gs,
        w::text AS w,
        l::text AS l,
        sv::text AS sv,
        ip::text AS ip,
        h::text AS h,
        er::text AS er,
        bb::text AS bb,
        so::text AS so,
        hr::text AS hr,
        hb::text AS hbp,
        draft_info,
        playyears,
        NULLIF(regexp_replace(COALESCE(ip::text, '0'), '[^0-9.]', '', 'g'), '') AS ip_clean
      FROM (
        SELECT raw_p.*, source_map.canonical_playerid,
          canonical.level_label AS canonical_level
        FROM (
          SELECT * FROM public.v_tbc_pitching_all_seasons_resolved
          WHERE year='2026'
            AND playerid::text = ANY(ARRAY(SELECT source_playerid FROM school_stat_sources))
        ) raw_p
        JOIN school_stat_sources source_map
          ON raw_p.playerid=source_map.source_playerid
        LEFT JOIN public.teamid_universe_mapping canonical
          ON canonical.teamid = raw_p.teamid::text
      ) tbc_pitch
      WHERE year = '2026' AND ${canonicalSourceFilter}

      UNION ALL

      SELECT
        yatstats_playerid::text AS playerid,
        season_year::text AS year,
        indy_map.level_label::text AS season_level,
        indy_pitch.teamid::text AS teamid,
        g::text,
        gs::text,
        w::text,
        l::text,
        sv::text,
        ip::text,
        h::text,
        er::text,
        bb::text,
        so::text,
        hr::text,
        COALESCE(raw_stats #>> '{stats,HBP}', raw_stats #>> '{HBP}')::text,
        NULL::text AS draft_info,
        NULL::text AS playyears,
        NULLIF(regexp_replace(COALESCE(ip::text, '0'), '[^0-9.]', '', 'g'), '') AS ip_clean
      FROM (
        SELECT DISTINCT ON (yatstats_playerid, season_year, teamid)
          *
        FROM public.indy_iscore_pitching_2026_season_raw
        WHERE season_year = 2026
          AND yatstats_playerid IS NOT NULL
          AND yatstats_playerid::text = ANY(ARRAY(SELECT playerid::text FROM school_players))
        ORDER BY
          yatstats_playerid,
          season_year,
          teamid,
          CASE WHEN source_system = 'iscore_central' THEN 0 ELSE 1 END,
          updated_at DESC
      ) indy_pitch
      LEFT JOIN public.teamid_universe_mapping indy_map
        ON indy_map.teamid = indy_pitch.teamid::text
    ),

    pitching_2026_by_level AS (
      SELECT
        playerid,
        MAX(year)   AS pitch_year,
        season_level   AS pit_level,
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
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(hr::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS hr_allowed,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(hbp::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS hbp_allowed,

        MAX(draft_info) AS pit_draft_info,
        MAX(playyears)  AS pit_playyears
      FROM pitching_2026_rows
      GROUP BY playerid, season_level
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

        /* FIP: (13 HR + 3 (BB + HBP) - 2 K) / IP + 3.10, the bracket's raw FIP constant. */
        CASE
          WHEN outs > 0 THEN ROUND((13 * hr_allowed + 3 * (bb + hbp_allowed) - 2 * ko) / (outs::numeric / 3) + 3.10, 2)
          ELSE NULL
        END AS fip,

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
          WHEN 'NJCAA'         THEN 13
          WHEN 'CCCAA'         THEN 13
          WHEN 'NWAC'          THEN 13
          ELSE 99
        END
    ),


    batting_2026_bucket_rows AS (
      SELECT
        playerid::text AS playerid,
        CASE
          WHEN season_level = 'MLB' THEN 'mlb'
          WHEN season_level IN ('TRIPLE-A','DOUBLE-A','HIGH-A','SINGLE-A','ROOKIE') THEN 'minors'
          WHEN season_level = 'INDY' THEN 'indy'
          WHEN season_level = 'INTERNATIONAL' THEN 'international'
          WHEN season_level IN ('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC') THEN 'college'
          ELSE 'other'
        END AS bucket,
        year,
        g, ab, r, h, dbl, tpl, hr, rbi, sb, bb, so, hbp, sf
      FROM batting_2026_rows
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
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(so::text,  '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS so,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(hbp::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS hbp,
        COALESCE(SUM(NULLIF(regexp_replace(COALESCE(sf::text, '0'), '[^0-9.]', '', 'g'), '')::numeric), 0) AS sf
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
              WHEN 'indy' THEN '2026 INDY BATTING'
              WHEN 'international' THEN '2026 INTERNATIONAL BATTING'
              WHEN 'college' THEN '2026 COLLEGE BATTING'
              ELSE '2026 BATTING'
            END,
            'type', 'batting',
            'stats', jsonb_build_object(
              'avg', CASE WHEN ab > 0 THEN ROUND(h / ab, 3) ELSE NULL END,
              'ab', ab,
              'h', h,
              'obp', CASE WHEN (ab + bb + hbp + sf) > 0 THEN ROUND((h + bb + hbp) / (ab + bb + hbp + sf), 3) ELSE NULL END,
              'r', r,
              'bb', bb,
              'slg', CASE WHEN ab > 0 THEN ROUND((h + "2b" + ("3b" * 2) + (hr * 3)) / ab, 3) ELSE NULL END,
              'hr', hr,
              'rbi', rbi,
              'ops', CASE
                WHEN ab > 0 AND (ab + bb + hbp + sf) > 0 THEN ROUND(((h + bb + hbp) / (ab + bb + hbp + sf)) + ((h + "2b" + ("3b" * 2) + (hr * 3)) / ab), 3)
                ELSE NULL
              END,
              'sb', sb,
              'g', g
            )
          )
          ORDER BY CASE bucket WHEN 'mlb' THEN 1 WHEN 'minors' THEN 2 WHEN 'indy' THEN 3 WHEN 'international' THEN 4 WHEN 'college' THEN 5 ELSE 6 END
        ) AS season_batting_buckets
      FROM batting_2026_by_bucket
      GROUP BY playerid
    ),

    pitching_2026_bucket_rows AS (
      SELECT
        playerid,
        CASE
          WHEN season_level = 'MLB' THEN 'mlb'
          WHEN season_level IN ('TRIPLE-A','DOUBLE-A','HIGH-A','SINGLE-A','ROOKIE') THEN 'minors'
          WHEN season_level = 'INDY' THEN 'indy'
          WHEN season_level = 'INTERNATIONAL' THEN 'international'
          WHEN season_level IN ('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC') THEN 'college'
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
              WHEN 'indy' THEN '2026 INDY PITCHING'
              WHEN 'international' THEN '2026 INTERNATIONAL PITCHING'
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
          ORDER BY CASE bucket WHEN 'mlb' THEN 1 WHEN 'minors' THEN 2 WHEN 'indy' THEN 3 WHEN 'international' THEN 4 WHEN 'college' THEN 5 ELSE 6 END
        ) AS season_pitching_buckets
      FROM pitching_2026_by_bucket
      GROUP BY playerid
    ),

    active_playerids AS (
      SELECT DISTINCT playerid::text AS playerid
      FROM batting_2026_rows
      WHERE playerid::text = ANY(ARRAY(SELECT playerid::text FROM school_players))
      UNION
      SELECT DISTINCT playerid::text AS playerid
      FROM pitching_2026_rows
      WHERE playerid::text = ANY(ARRAY(SELECT playerid::text FROM school_players))
      UNION
      SELECT playerid FROM confirmed_game_log_players
    )

    SELECT
      sp.playerid,
      sp.firstname,
      sp.lastname,
      COALESCE(NULLIF(TRIM(sp.firstname || ' ' || sp.lastname), ''), sp.playerid::text) AS display_name,
      -- Years compare as numeric: TBC labels the Mexican League's 2018
      -- spring and fall seasons "2018.1" and "2018.2".
      COALESCE(
        CASE
          WHEN lp.pitch_year IS NOT NULL AND (lb.stat_year IS NULL OR lp.pitch_year::numeric >= lb.stat_year::numeric)
          THEN lp.pit_level
          ELSE lb.bat_level
        END,
        NULL::text
      )                                     AS level,
      sp.height,
      sp.weight,
      sp.bats,
      sp.throws,
      sp.position,
      TRUE AS has_2026_stats,
      (lb.stat_year IS NULL AND lp.pitch_year IS NULL) AS season_stats_pending,
      lb.stat_year,
      lb.g, lb.ab, lb.r, lb.h,
      lb."2b", lb."3b", lb.hr, lb.rbi, lb.sb,
      CASE
        WHEN lp.pitch_year IS NOT NULL AND (
          lb.stat_year IS NULL OR lp.pitch_year::numeric >= lb.stat_year::numeric
        ) THEN lp.bb
        ELSE lb.bb
      END AS bb,
      -- bb above is one column shared by both feeds (pitching walks allowed
      -- for a pitcher, batting walks otherwise). The sort drawer needs each
      -- one on its own, so they're also exposed separately.
      lb.bb AS bat_bb,
      lp.bb AS pit_bb,
      lb.so,
      lb.avg, lb.obp, lb.slg, lb.ops,
      COALESCE(lb.draft_info, lp.pit_draft_info)  AS draft_info,
      COALESCE(lb.playyears, lp.pit_playyears)    AS playyears,
      lp.pitch_year,
      lp.pg, lp.gs, lp.w, lp.l, lp.saves,
      lp.ip, lp.er, lp.ko,
      lp.era, lp.whip, lp.fip, lp.h9, lp.bb9, lp.so9, lp.so_bb,
      COALESCE(sbb.season_batting_buckets, '[]'::jsonb) AS season_batting_buckets,
      COALESCE(spb.season_pitching_buckets, '[]'::jsonb) AS season_pitching_buckets,
      CASE
        WHEN lp.pitch_year IS NOT NULL AND (
          lb.stat_year IS NULL OR lp.pitch_year::numeric >= lb.stat_year::numeric
        ) THEN true
        WHEN lb.stat_year IS NULL THEN COALESCE(cg.has_pitching, false)
        ELSE false
      END AS is_pitcher
    FROM school_players sp
    JOIN active_playerids ap ON sp.playerid::text = ap.playerid
    LEFT JOIN latest_batting  lb ON sp.playerid::text = lb.playerid
    LEFT JOIN latest_pitching lp ON sp.playerid::text = lp.playerid
    LEFT JOIN confirmed_game_log_players cg ON cg.playerid = sp.playerid::text
    LEFT JOIN season_batting_buckets sbb ON sp.playerid::text = sbb.playerid
    LEFT JOIN season_pitching_buckets spb ON sp.playerid::text = spb.playerid
    ORDER BY
      CASE COALESCE(
        CASE
          WHEN lp.pitch_year IS NOT NULL AND (lb.stat_year IS NULL OR lp.pitch_year::numeric >= lb.stat_year::numeric)
          THEN lp.pit_level ELSE lb.bat_level
        END, NULL::text)
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
        WHEN 'NCAA'          THEN 9
        WHEN 'D1'            THEN 9
        WHEN 'NCAA-D2'       THEN 10
        WHEN 'D2'            THEN 10
        WHEN 'NCAA-D3'       THEN 11
        WHEN 'D3'            THEN 11
        WHEN 'NAIA'          THEN 12
        WHEN 'JUCO'          THEN 13
          WHEN 'NJCAA'         THEN 13
          WHEN 'CCCAA'         THEN 13
          WHEN 'NWAC'          THEN 13
        WHEN 'JrCollege'     THEN 13
        WHEN 'NJCAA'         THEN 13
        WHEN 'HIGH SCHOOL'   THEN 14
        WHEN 'HS'            THEN 14
        ELSE 15
      END,
      sp.lastname,
      sp.firstname
  `;
}
