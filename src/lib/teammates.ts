// src/lib/teammates.ts
// Everyone a player shared a roster with, as far as our data knows:
//   High school: players from the same school whose varsity years
//                (flip_card_front_stage.roster_years) overlap his.
//   College/pro: players with a stat line for the same team in the same
//                season (complete TBC history plus 2026 updates).
//   MLB game logs and verified active AFL rosters: additional team/season
//                history, without replacing other teams in the same year.
// List only teammates with a published platform flip-card; the complete
// historical archive includes additional players not yet assigned profiles.
import 'server-only';
import { query, resolveHistoricalTbcIds } from './db';
import { toPlayerSlug } from './slug';

// One row per teammate per season: someone who was a teammate for three
// years is listed three times, each with that season's year and team.
export type TeammateSeason = { playerId: string; name: string; sortName: string; href: string | null; year: number; team: string };

type MateRow = {
  teamid: string;
  team_name: string | null;
  year: string;
  playerid: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  hsid: string | null;
};

type HsRow = {
  playerid: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  hsid: string;
  hsname: string | null;
  shared: string[] | null;
};

// The player Stats tab reads the complete TBC history; teammate matching must
// use the same career universe, plus the live 2026 feed for newer additions.
// Do not depend on high-school graduation or roster_years for college/pro mates.
const SEASON_TABLES = ['tbc_complete_batting_history', 'tbc_complete_pitching_history', 'tbc_batting_2026_season_raw', 'tbc_pitching_2026_season_raw'];

function season(playerId: string, first: string | null, last: string | null, display: string | null, hsid: string | null, year: number, team: string): TeammateSeason {
  const name = (display || `${first || ''} ${last || ''}`).trim() || 'Unknown';
  const [f, ...rest] = name.split(/\s+/);
  const href = hsid
    ? `/${encodeURIComponent(hsid)}/player/${encodeURIComponent(playerId)}/${toPlayerSlug(first || f, last || rest.join(' '))}`
    : null;
  // Last name first, for the A-Z order.
  const sortName = `${(last || rest.join(' ')).trim()} ${(first || f).trim()}`.toLowerCase();
  return { playerId, name, sortName, href, year, team };
}

export async function getTeammates(playerId: string): Promise<TeammateSeason[]> {
  const historicalSourceIds = await resolveHistoricalTbcIds(playerId);
  // Use all verified TBC IDs for the queried player. A split career must
  // contribute teammates from every season, while remaining one public card.
  const seasons = SEASON_TABLES.map((t) => `SELECT teamid, year FROM ${t} WHERE playerid = ANY(string_to_array($1, ','))`).join(' UNION ');
  const mates = SEASON_TABLES.map((t) => `SELECT r.playerid, r.teamid, r.year FROM ${t} r JOIN seasons s USING (teamid, year)`).join(' UNION ');

  const [seasonRows, hsRows, mlbRows] = await Promise.all([
    query<MateRow>(
      `WITH seasons AS MATERIALIZED (${seasons}), mates AS MATERIALIZED (${mates})
       SELECT m.teamid, u.current_team_name AS team_name, m.year, m.playerid,
              coalesce(f.first_name, p.firstname) AS first_name,
              coalesce(f.last_name, p.lastname) AS last_name,
              f.display_name, f.hsid
         FROM mates m
         LEFT JOIN teamid_universe_mapping u ON u.teamid = m.teamid
         LEFT JOIN tbc_players_raw p ON p.playerid = m.playerid
         JOIN flip_card_front_stage f ON f.playerid = m.playerid
        WHERE m.playerid <> ALL(string_to_array($1, ','))`,
      [historicalSourceIds]
    ),
    query<HsRow>(
      `SELECT f.playerid, f.display_name, f.first_name, f.last_name, f.hsid, ss.hsname,
              ARRAY(SELECT unnest(f.roster_years) INTERSECT SELECT unnest(me.roster_years)) AS shared
         FROM flip_card_front_stage me
         JOIN flip_card_front_stage f
           ON f.hsid = me.hsid AND f.roster_years && me.roster_years AND f.playerid <> me.playerid
         LEFT JOIN school_success ss ON ss.hsid::text = f.hsid
        WHERE me.playerid = $1`,
      [playerId]
    ),
    // TBC history does not include all MLB-sourced league games. Include
    // every team and year from actual MLB game logs plus verified current
    // Arizona Fall League rosters, while preserving the TBC season archive.
    query<MateRow>(
      `WITH my_teams AS MATERIALIZED (
          SELECT DISTINCT gl.source_team_id AS mlb_teamid,
                  EXTRACT(YEAR FROM gl.game_date)::int AS year
            FROM player_game_logs gl
           WHERE gl.playerid=$1 AND gl.source_team_id ~ '^[0-9]+$'
          UNION
          SELECT a.afl_mlb_team_id::text, a.season
            FROM afl_current_roster_overlays a
           WHERE a.playerid=$1 AND a.active=true
       ), mlb_mates AS MATERIALIZED (
          SELECT DISTINCT g.playerid, g.source_team_id AS mlb_teamid,
                  EXTRACT(YEAR FROM g.game_date)::int AS year
            FROM my_teams my
            JOIN player_game_logs g
              ON g.source_team_id=my.mlb_teamid
             AND g.game_date>=make_date(my.year,1,1)
             AND g.game_date<make_date(my.year+1,1,1)
           WHERE g.playerid<>$1
          UNION
          SELECT a.playerid, a.afl_mlb_team_id::text, a.season
            FROM my_teams my
            JOIN afl_current_roster_overlays a
              ON a.afl_mlb_team_id::text=my.mlb_teamid
             AND a.season=my.year
           WHERE a.active=true AND a.playerid<>$1
       )
       SELECT DISTINCT tim.tbc_teamid AS teamid,
              COALESCE(NULLIF(TRIM(u.current_team_name), ''),
                       NULLIF(TRIM(tim.team_name), ''), 'Team') AS team_name,
              mm.year::text AS year, mm.playerid,
              f.first_name, f.last_name, f.display_name, f.hsid
         FROM mlb_mates mm
         JOIN flip_card_front_stage f ON f.playerid=mm.playerid
         LEFT JOIN team_id_map tim ON tim.mlb_stats_api_id=mm.mlb_teamid::int
         LEFT JOIN teamid_universe_mapping u ON u.teamid=tim.tbc_teamid`,
      [playerId]
    ),
  ]);

  const rows: TeammateSeason[] = [];
  const hsName = String(hsRows.rows[0]?.hsname || '').trim();
  const hsTeam = hsName ? (/high school|\bhs\b|academy|prep/i.test(hsName) ? hsName : `${hsName} HS`) : 'High School';
  for (const r of hsRows.rows) {
    for (const y of r.shared || []) {
      const year = Number(y);
      if (year) rows.push(season(r.playerid, r.first_name, r.last_name, r.display_name, r.hsid, year, hsTeam));
    }
  }
  // Dedupe only within the same teammate, team AND year. Multiple clubs
  // in 2026 (e.g., MiLB and Arizona Fall League) remain distinct groups.
  const seen = new Set(rows.map(r => `${r.playerId}|${r.year}|${r.team.trim().toLowerCase()}`));
  for (const r of [...seasonRows.rows, ...mlbRows.rows]) {
    const year = Number(r.year);
    if (!year) continue;
    const team = String(r.team_name || '').trim() || 'Team';
    const key = `${r.playerid}|${year}|${team.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(season(r.playerid,r.first_name,r.last_name,r.display_name,r.hsid,year,team));
  }
  return rows;
}
