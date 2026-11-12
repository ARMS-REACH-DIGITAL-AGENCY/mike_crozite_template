// Reused by the importer and player identity reader so Draft Day never
// selects a different logo TeamID in Stories than on the career timeline.
// Candidate identity must match the historically recorded club name exactly;
// current franchise/organization names are NOT artwork identities.
export function draftTeamLogoLateralSql(alias: 'd' = 'd'): string {
  return `LEFT JOIN LATERAL (
    SELECT candidate.teamid FROM (
      -- The two different Washington Senators clubs need their own IDs.
      SELECT CASE
        WHEN lower(trim(${alias}.draft_team_name)) = 'washington senators' AND ${alias}.draft_year <= 1960 THEN '10020'
        WHEN lower(trim(${alias}.draft_team_name)) = 'washington senators' AND ${alias}.draft_year BETWEEN 1961 AND 1971 THEN '10021'
        ELSE NULL END AS teamid, -1 AS source_priority
      UNION ALL
      SELECT u.teamid::text AS teamid, 0 AS source_priority
        FROM teamid_universe_mapping u
       WHERE u.level_label = 'MLB'
         AND lower(trim(u.current_team_name)) = lower(trim(${alias}.draft_team_name))
      UNION ALL
      SELECT p.teamid::text AS teamid, 1 AS source_priority
        FROM tbc_pro_teams_map_raw p
       WHERE lower(trim(p.teamname)) = lower(trim(${alias}.draft_team_name))
    ) candidate
    WHERE candidate.teamid ~ '^[0-9]+$'
    ORDER BY candidate.source_priority,
      CASE WHEN length(candidate.teamid) <= 2 THEN 0 ELSE 1 END,
      length(candidate.teamid), candidate.teamid
    LIMIT 1
  ) draft_logo ON TRUE`;
}
