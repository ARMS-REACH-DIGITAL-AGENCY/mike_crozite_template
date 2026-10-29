// Shared Arizona Fall League season totals for every mapped player and school.
// MLB game lines are authoritative for AFL because The Baseball Cube's season
// tables do not contain the six MLB API AFL clubs (team IDs 900xxx).
// This is read-only; no changes to source stats, teams, or player assignments.
import { query } from '@/lib/db';

type StatRow = Record<string, unknown>;

type Aggregate = {
  year: number | string;
  teamid: string;
  team: string;
  league: string;
  level: string;
  stat_type: 'batting' | 'pitching';
  g: number | string;
} & Record<string, unknown>;

const n = (value: unknown): number => {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
};
const rate = (numerator: number, denominator: number, digits = 3): string =>
  denominator > 0 ? (numerator / denominator).toFixed(digits).replace(/^0/, '') : '';

function battingRow(r: Aggregate): StatRow {
  const val = (key: string) => n(r[key]);
  const ab = val('bat_ab');
  const h = val('bat_h');
  const doubles = val('bat_2b');
  const triples = val('bat_3b');
  const hr = val('bat_hr');
  const bb = val('bat_bb');
  const hbp = val('bat_hbp');
  const sf = val('bat_sf');
  const tb = val('bat_tb');
  const sb = val('bat_sb');
  const cs = val('bat_cs');
  const so = val('bat_so');
  const avg = rate(h, ab);
  const obp = rate(h + bb + hbp, ab + bb + hbp + sf);
  const slg = rate(tb, ab);
  const ops = obp && slg ? (Number(obp) + Number(slg)).toFixed(3).replace(/^0/, '') : '';
  const xbh = doubles + triples + hr;
  return {
    source: 'mlb_api', year: n(r.year), teamid: r.teamid, team_id: r.teamid,
    team: r.team, league: r.league, org_conf: r.league,
    level: r.level, is_exhibition: true, age: '', posit: '',
    g: val('g'), ab, r: val('bat_r'), h, dbl: doubles, tpl: triples,
    hr, rbi: val('bat_rbi'), sb, cs, bb, so, hbp,
    sh: val('bat_sh'), sf, ibb: val('bat_ibb'),
    gdp: val('bat_gidp'), tb, pa: val('bat_pa'),
    xbh, sgl: Math.max(0, h - xbh), avg, bavg: avg, obp, slg, ops,
    seca: rate(bb + tb - h + sb - cs, ab),
    iso: avg && slg ? (Number(slg) - Number(avg)).toFixed(3).replace(/^0/, '') : '',
    babip: rate(h - hr, ab - so - hr + sf),
  };
}

function pitchingRow(r: Aggregate): StatRow {
  const val = (key: string) => n(r[key]);
  const outs = val('pit_outs');
  const innings = outs / 3;
  const bb = val('pit_bb');
  const h = val('pit_h');
  const er = val('pit_er');
  const runs = val('pit_r');
  const hr = val('pit_hr');
  const so = val('pit_so');
  const g = val('g');
  const gs = val('pit_gs');
  return {
    source: 'mlb_api', year: n(r.year), teamid: r.teamid, team_id: r.teamid,
    team: r.team, league: r.league, org_conf: r.league,
    level: r.level, is_exhibition: true, age: '',
    w: val('pit_w'), l: val('pit_l'), g, gs,
    cg: val('pit_cg'), sho: val('pit_sho'),
    gr: Math.max(0, g - gs), gf: val('games_finished'),
    sv: val('pit_sv'), ip: String(Math.floor(outs / 3)) + '.' + String(outs % 3),
    h, r: runs, er, hr, bb, so, wp: val('wild_pitches'),
    bk: val('balks'), hb: val('pit_hbp'),
    era: rate(er * 9, innings, 2),
    whip: rate(h + bb, innings, 2),
    h9: rate(h * 9, innings, 2), hr9: rate(hr * 9, innings, 2),
    bb9: rate(bb * 9, innings, 2), so9: rate(so * 9, innings, 2),
    ra9: rate(runs * 9, innings, 2), so_bb: rate(so, bb, 2),
  };
}

export async function getAflSeasonStatsForPlayer(playerId: string): Promise<{
  batting: StatRow[];
  pitching: StatRow[];
}> {
  // The existing (playerid, game_date) index bounds this to one player.
  // Only official final game lines with a mapped AFL team and level qualify.
  // Grouping by player, season, team and stat type keeps exhibition numbers
  // separate from regular-season MLB/MiLB totals and from other teams.
  const { rows } = await query(
    `SELECT
       EXTRACT(YEAR FROM s.game_date)::int AS year,
       s.teamid::text AS teamid,
       u.current_team_name AS team,
       u.current_org_or_conference_name AS league,
       u.level_label AS level,
       s.stat_type,
       COUNT(DISTINCT s.source_game_id)::int AS g,
       SUM(COALESCE(s.bat_pa,0))::int AS bat_pa,
       SUM(COALESCE(s.bat_ab,0))::int AS bat_ab,
       SUM(COALESCE(s.bat_r,0))::int AS bat_r,
       SUM(COALESCE(s.bat_h,0))::int AS bat_h,
       SUM(COALESCE(s.bat_2b,0))::int AS bat_2b,
       SUM(COALESCE(s.bat_3b,0))::int AS bat_3b,
       SUM(COALESCE(s.bat_hr,0))::int AS bat_hr,
       SUM(COALESCE(s.bat_rbi,0))::int AS bat_rbi,
       SUM(COALESCE(s.bat_bb,0))::int AS bat_bb,
       SUM(COALESCE(s.bat_ibb,0))::int AS bat_ibb,
       SUM(COALESCE(s.bat_hbp,0))::int AS bat_hbp,
       SUM(COALESCE(s.bat_so,0))::int AS bat_so,
       SUM(COALESCE(s.bat_sb,0))::int AS bat_sb,
       SUM(COALESCE(s.bat_cs,0))::int AS bat_cs,
       SUM(COALESCE(s.bat_sf,0))::int AS bat_sf,
       SUM(COALESCE(s.bat_sh,0))::int AS bat_sh,
       SUM(COALESCE(s.bat_gidp,0))::int AS bat_gidp,
       SUM(COALESCE(s.bat_tb,0))::int AS bat_tb,
       SUM(COALESCE(s.pit_outs,0))::int AS pit_outs,
       SUM(COALESCE(s.pit_h,0))::int AS pit_h,
       SUM(COALESCE(s.pit_r,0))::int AS pit_r,
       SUM(COALESCE(s.pit_er,0))::int AS pit_er,
       SUM(COALESCE(s.pit_bb,0))::int AS pit_bb,
       SUM(COALESCE(s.pit_so,0))::int AS pit_so,
       SUM(COALESCE(s.pit_hr,0))::int AS pit_hr,
       SUM(COALESCE(s.pit_hbp,0))::int AS pit_hbp,
       SUM(COALESCE(s.pit_w,0))::int AS pit_w,
       SUM(COALESCE(s.pit_l,0))::int AS pit_l,
       SUM(COALESCE(s.pit_sv,0))::int AS pit_sv,
       SUM(COALESCE(s.pit_gs,0))::int AS pit_gs,
       SUM(COALESCE(s.pit_cg,0))::int AS pit_cg,
       SUM(COALESCE(s.pit_sho,0))::int AS pit_sho,
       SUM(COALESCE(NULLIF(s.stats->>'gamesFinished','')::int,0))::int AS games_finished,
       SUM(COALESCE(NULLIF(s.stats->>'wildPitches','')::int,0))::int AS wild_pitches,
       SUM(COALESCE(NULLIF(s.stats->>'balks','')::int,0))::int AS balks
     FROM public.stat_lines_ready s
     JOIN public.teamid_universe_mapping u ON u.teamid::text = s.teamid::text
     WHERE s.playerid = $1
       AND s.source = 'mlb_api'
       AND s.league_name = 'Arizona Fall League'
       AND u.current_org_or_conference_name = 'Arizona Fall League'
       AND u.level_label = 'MLB'
       AND s.stat_type IN ('batting', 'pitching')
       AND s.is_final IS TRUE
     GROUP BY EXTRACT(YEAR FROM s.game_date), s.teamid, u.current_team_name,
              u.current_org_or_conference_name, u.level_label, s.stat_type
     ORDER BY year, team, s.stat_type`,
    [playerId]
  );
  const batting: StatRow[] = [];
  const pitching: StatRow[] = [];
  for (const r of rows as Aggregate[]) {
    if (r.stat_type === 'batting') batting.push(battingRow(r));
    if (r.stat_type === 'pitching') pitching.push(pitchingRow(r));
  }
  return { batting, pitching };
}
