/**
 * Active alumni have their own batting or pitching row in the 2026 season.
 * A roster status (including UNKNOWN, injured, retired or free agent) is not
 * evidence for or against that membership. Fantasy uses its separate rules.
 */
export const ACTIVE_ALUMNI_SEASON = 2026;

// These are the same four feeds used by getActiveRosterByHsid. UNION keeps
// a two-way player, a traded player and repeated source rows to one member.
export const ACTIVE_STAT_PLAYER_IDS_SQL = `
  SELECT playerid::text AS playerid
  FROM public.tbc_batting_2026_season_raw WHERE year = '2026'
  UNION
  SELECT playerid::text AS playerid
  FROM public.tbc_pitching_2026_season_raw WHERE year = '2026'
  UNION
  SELECT yatstats_playerid::text AS playerid
  FROM public.indy_iscore_batting_2026_season_raw
  WHERE season_year = 2026 AND yatstats_playerid IS NOT NULL
  UNION
  SELECT yatstats_playerid::text AS playerid
  FROM public.indy_iscore_pitching_2026_season_raw
  WHERE season_year = 2026 AND yatstats_playerid IS NOT NULL
`;

/** Verified game participation is valid evidence even when a school's TBC
 * season feed is absent. These logs can be partial, so they establish roster
 * membership only; they must never be summed and called full-season totals.
 */
export function confirmed2026GameLogPlayersSql(playerIdsSql: string): string {
  return `SELECT g.playerid, BOOL_OR(g.stat_type = 'pitching') AS has_pitching
    FROM public.player_game_logs g
    JOIN (
      SELECT playerid, MIN(source_player_id) AS source_player_id FROM public.player_source_map
      WHERE playerid IN (${playerIdsSql}) AND source = 'mlb_api'
        AND match_method IS DISTINCT FROM 'rejected_bad_identity_match'
      GROUP BY playerid
      HAVING COUNT(DISTINCT source_player_id) = 1
        AND BOOL_OR(is_verified IS TRUE)
        AND MIN(source_player_id) ~ '^[0-9]+$'
    ) verified ON verified.playerid = g.playerid
    WHERE g.source = 'mlb_api'
      AND g.game_date >= DATE '2026-01-01' AND g.game_date < DATE '2027-01-01'
      AND g.raw_payload->>'season' = '2026'
      AND g.raw_payload#>>'{player,id}' = verified.source_player_id
      AND g.stat_type IN ('batting', 'pitching')
      AND g.raw_payload->>'gameType' IN ('R', 'F', 'D', 'L', 'W', 'C', 'P')
      AND (g.stats->>'gamesPlayed' ~ '^[1-9][0-9]*$' OR g.stats->>'gamesPitched' ~ '^[1-9][0-9]*$')
    GROUP BY g.playerid`;
}

/**
 * scopeSql is application-owned SQL selecting integer HSIDs, never user text.
 * Batch canonical school links once instead of expanding the player_hsids
 * view separately for every school in a statewide, per-keystroke search.
 */
export function activeAlumniCtes(scopeSql: string): string {
  return `linked_alumni AS MATERIALIZED (
      SELECT DISTINCT ph.hsid, ph.playerid::text AS playerid
      FROM public.player_hsids ph WHERE ph.hsid IN (${scopeSql})
    ), active_stat_playerids AS MATERIALIZED (${ACTIVE_STAT_PLAYER_IDS_SQL}),
    confirmed_game_log_players AS MATERIALIZED (${confirmed2026GameLogPlayersSql('SELECT playerid FROM linked_alumni')}),
    active_alumni AS MATERIALIZED (
      SELECT l.hsid, l.playerid FROM linked_alumni l
      WHERE l.playerid IN (SELECT playerid FROM active_stat_playerids)
         OR l.playerid IN (SELECT playerid FROM confirmed_game_log_players)
    )`;
}

/**
 * A linked historical roster with no stats in any available TBC archive or
 * current feed has missing coverage, not a verified zero active population.
 * Scan each unindexed archive once and batch its school links; never run a
 * correlated archive scan for each player or each search result.
 */
export function activeAlumniSummaryCtes(scopeSql: string): string {
  return `${activeAlumniCtes(scopeSql)},
    recorded_stat_schools AS MATERIALIZED (
      SELECT DISTINCT l.hsid FROM linked_alumni l
      WHERE l.playerid IN (
        SELECT playerid::text AS playerid FROM public.tbc_batting_raw
        UNION ALL SELECT playerid::text FROM public.tbc_pitching_raw
        UNION ALL SELECT playerid::text FROM public.tbc_batting_2026_season_raw
        UNION ALL SELECT playerid::text FROM public.tbc_pitching_2026_season_raw
      )
    ), active_alumni_summary AS (
      SELECT s.hsid, COALESCE(a.current_aa, 0)::int AS current_aa,
        h.hsid IS NULL AS active_stats_pending
      FROM (SELECT DISTINCT hsid FROM linked_alumni) s
      LEFT JOIN (SELECT hsid, COUNT(*)::int AS current_aa FROM active_alumni GROUP BY hsid) a ON a.hsid = s.hsid
      LEFT JOIN recorded_stat_schools h ON h.hsid = s.hsid
    )`;
}
