// The newsletter publication pipeline: one Daily edition (a stats day) and
// one Weekly edition (a bracket week) as finished rows in the publication
// tables (docs/newsletter-handoff-take-two.md, section 4). The newsletter
// only reads and prints them; every number and sentence is made here.
//
//   - daily_game_scores and daily_game_stories: the scoreboard's own scoring
//     (liveSeason.ts scoreLive) and story writer (dayStory.ts inningStory) on
//     the stat lines that were in by the day's 4 a.m. Arizona cutoff.
//   - weekly_box_scores: the locked result from master_bracket (line score,
//     decision) and each school's batting and pitching tables, with OPS+ and
//     FIP- from the same scoring on the week's lines (in by Monday 4 a.m.).
//     Rescored innings 1-8 must match the locked result, or nothing is
//     written.
//   - daily_stat_lines and weekly_player_lines are written by the SQL in this
//     file, inside the same transaction (they need every player, so they are
//     made where the rows are).
//   - edition_ready goes in last, in the same transaction, after every count
//     is checked. An edition already ready is never written again.
//
// Manual, one-shot (no schedule yet). Without a database connection here, it
// works from files and prints the transaction to apply:
//
//   npx --yes tsx scripts/newsletter-publish.ts --dir <dir> --daily 2026-10-26 --week 3
//
// <dir> holds season.json, rows.json and rulings.json (master_bracket as the
// results job reads it) and lines.json: the test field's active alumni's
// stat lines for the days scored, each in by its cutoff -
// [hsid, playerid, name, game_date, 'b'|'p', engine stats, game, team, MLB's
// level label, official level, opponent, [R RBI SO SB] | [W L SV HLD], final].
// It writes daily.json and weekly.json (the statements, in order) and
// report.json (counts and checks).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
import { COMMISSIONER_DECISIONS } from '@/lib/bracket/commissioner';
import { scoreLive, type Live } from '@/components/bracket/liveSeason';
import { shortName, type GameBox, type GameRow, type Index, type PlayerRow, type SeriesRow } from '@/components/bracket/gallery';
import { inningStory } from '@/components/bracket/dayStory';

type Season = { season_key: string; is_test: boolean; opening_day: string; last_day: string; weeks: number; regions: number; schools_per_region: number };
type Row = {
  stage: string; region: number; round: number; round_name?: string; series_no: number; game_no: number; game_id: number; week: number;
  home_hsid: number | null; away_hsid: number | null; home_seed: number | null; away_seed: number | null;
  home_school_name: string | null; away_school_name: string | null; status: string;
  innings: number[] | string | null; winner_hsid: number | null; decided_by: string | null; decided_note?: string | null; locked_at: string | null;
};
type Ruling = { region: number; week: number; home_hsid: number; away_hsid: number; winner_hsid: number };
type InLine = [string, string, string, string, 'b' | 'p', number[], string, string, string, string, string, number[], boolean];

const DAY = 86400000;
const dayOf = (iso: string, start: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
// A day's cutoff: 4 a.m. Arizona (UTC-7, no daylight time) the next morning.
const cutoffOf = (day: string) => `${addDays(day, 1)} 11:00+00`;

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

// MLB's clubs by their short names, for "Jake Smith (Rays, MLB)". Any other
// club is printed by its full name.
const MLB_SHORT: [string, string][] = [
  ['Arizona Diamondbacks', 'Diamondbacks'], ['Athletics', 'Athletics'], ['Oakland Athletics', 'Athletics'],
  ['Atlanta Braves', 'Braves'], ['Baltimore Orioles', 'Orioles'], ['Boston Red Sox', 'Red Sox'], ['Chicago Cubs', 'Cubs'],
  ['Chicago White Sox', 'White Sox'], ['Cincinnati Reds', 'Reds'], ['Cleveland Guardians', 'Guardians'],
  ['Colorado Rockies', 'Rockies'], ['Detroit Tigers', 'Tigers'], ['Houston Astros', 'Astros'], ['Kansas City Royals', 'Royals'],
  ['Los Angeles Angels', 'Angels'], ['Los Angeles Dodgers', 'Dodgers'], ['Miami Marlins', 'Marlins'],
  ['Milwaukee Brewers', 'Brewers'], ['Minnesota Twins', 'Twins'], ['New York Mets', 'Mets'], ['New York Yankees', 'Yankees'],
  ['Philadelphia Phillies', 'Phillies'], ['Pittsburgh Pirates', 'Pirates'], ['San Diego Padres', 'Padres'],
  ['San Francisco Giants', 'Giants'], ['Seattle Mariners', 'Mariners'], ['St. Louis Cardinals', 'Cardinals'],
  ['Tampa Bay Rays', 'Rays'], ['Texas Rangers', 'Rangers'], ['Toronto Blue Jays', 'Blue Jays'], ['Washington Nationals', 'Nationals'],
];
const shortClub = (team: string) => new Map(MLB_SHORT).get(team) || team;
const OFFICIAL = ['MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'SINGLE-A', 'ROOKIE', 'INDY', 'INTERNATIONAL',
  'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'CCCAA', 'NWAC', 'HIGH SCHOOL'];
const ACTIVE = ['ACTIVE', 'INJURED 7-DAY', 'INJURED 10-DAY', 'INJURED 15-DAY', 'INJURED 30-DAY', 'INJURED 60-DAY',
  'INJURED - FULL SEASON', 'ADMINISTRATIVE LEAVE', 'BEREAVEMENT LIST', 'DEVELOPMENT LIST', 'INELIGIBLE LIST', 'MILITARY LEAVE',
  'NOT YET REPORTED', 'OPTIONED', 'PATERNITY LIST', 'REASSIGNED TO MINORS', 'REHAB ASSIGNMENT', 'RESERVE LIST (MINORS)',
  'RESTRICTED LIST', 'SUSPENDED', 'TEMPORARILY INACTIVE LIST', 'FREE AGENT', 'RED SHIRT', 'REDSHIRT-MEDICAL'];

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const list = (xs: string[]) => xs.map(lit).join(', ');
const dollar = (s: string) => `$j$${s}$j$`;
const inningsOf = (v: Row['innings']) => (Array.isArray(v) ? v : String(v || '').replace(/[{}]/g, '').split(',').filter(Boolean)).map(Number);
const ip = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;

// The scoreboard's index for one test bracket (the same as the results job's,
// scripts/master-bracket-results.ts buildIndex).
function buildIndex(season: Season, rows: Row[]): Index {
  const weeks = tournamentWeeks(season.opening_day, season.weeks);
  const schools: Index['schools'] = {};
  const rounds = new Map<number, SeriesRow[]>();
  const series = new Map<string, SeriesRow>();
  const sorted = [...rows].sort((a, b) => a.round - b.round || a.region - b.region || a.series_no - b.series_no || a.game_no - b.game_no);
  for (const r of sorted) {
    if (r.stage !== 'bracket' || r.home_hsid == null || r.away_hsid == null) continue;
    schools[r.home_hsid] ||= [r.home_school_name || String(r.home_hsid), r.region, r.home_seed ?? 0];
    schools[r.away_hsid] ||= [r.away_school_name || String(r.away_hsid), r.region, r.away_seed ?? 0];
    const key = `${r.round}:${r.region}:${r.series_no}`;
    let s = series.get(key);
    if (!s) {
      s = [r.region, r.home_hsid, r.away_hsid, r.home_seed ?? 0, r.away_seed ?? 0, 0, [0, 0], []];
      series.set(key, s);
      (rounds.get(r.round) || rounds.set(r.round, []).get(r.round)!).push(s);
    }
    s[7].push([r.game_id, r.week, r.home_hsid, r.away_hsid, '', [], null] as GameRow);
  }
  return {
    season: Number(season.opening_day.slice(0, 4)), weeks, schools,
    rounds: [...rounds.entries()].sort(([a], [b]) => a - b).map(([r, list]) => ({
      r, name: `Round ${r}`, start: weeks[(r - 1) * 3]?.[0] || '', end: weeks[r * 3 - 1]?.[1] || '', series: list,
    })),
    lbt: [], gf: [], champion: 0, lbLeaders: [], lbChampion: 0,
  } as unknown as Index;
}

// The live answer the scoreboard would get, from the frozen lines: each
// school's alumni with a line, and those lines. (Alumni without a line add
// nothing to innings 1-8 or to a story; the W-L inning isn't rescored here -
// the locked result is used.)
function liveOf(lines: InLine[], start: string): Live {
  const roster: Live['roster'] = {};
  const kinds = new Map<string, Set<string>>();
  for (const l of lines) (kinds.get(`${l[0]}:${l[1]}`) || kinds.set(`${l[0]}:${l[1]}`, new Set()).get(`${l[0]}:${l[1]}`)!).add(l[4]);
  for (const l of lines) {
    const k = kinds.get(`${l[0]}:${l[1]}`)!;
    if (!(roster[l[0]] ||= []).some((p) => p[0] === l[1])) roster[l[0]].push([l[1], l[2], l[9], k.has('p') && !k.has('b') ? 1 : 0, l[7]]);
  }
  return {
    asOf: '', roster, clubs: {}, games: {}, fans: {},
    lines: lines.map((l) => [l[0], l[1], dayOf(l[3], start), l[4], l[5], l[6], l[7], l[12] ? 1 : 0, l[8]]),
  } as unknown as Live;
}

// --- The SQL half: every player's finished line. -----------------------------

const SQL_MLB = `mlb(full_name, short) AS (VALUES ${MLB_SHORT.map(([a, b]) => `(${lit(a)}, ${lit(b)})`).join(', ')})`;
// A batting line: "2-for-4, HR, 2 RBI, BB"; a pitching line:
// "6.0 IP, 3 H, 1 ER, 2 BB, 8 K, W". n: the count, label: what it counts.
const many = (n: string, label: string) => `CASE WHEN ${n} > 1 THEN ${n} || ' ${label}' WHEN ${n} = 1 THEN '${label}' END`;
const SQL_BAT = (x: string) => `concat_ws(', ', ${x}h || '-for-' || ${x}ab, ${many(`${x}d2`, '2B')}, ${many(`${x}d3`, '3B')}, ${many(`${x}hr`, 'HR')},
      ${many(`${x}rbi`, 'RBI')}, ${many(`${x}bb`, 'BB')}, ${many(`${x}sb`, 'SB')})`;
const SQL_CARDS = `card AS (
  SELECT f.playerid::text AS pid, f.hsid::text AS hsid,
         coalesce(nullif(btrim(f.display_name), ''), btrim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, ''))) AS nm,
         lower(coalesce(f.last_name, '')) AS last, lower(coalesce(f.first_name, '')) AS first,
         upper(btrim(coalesce(f.status_label, ''))) AS st,
         CASE WHEN upper(btrim(coalesce(f.level_label, ''))) IN (${list(OFFICIAL)}) THEN upper(btrim(f.level_label)) ELSE '' END AS lvl,
         btrim(coalesce(f.current_team_name, '')) AS team,
         (upper(btrim(coalesce(f.level_label, ''))) IN ('HIGH SCHOOL', 'HS') OR upper(btrim(coalesce(f.display_level_label, ''))) IN ('HIGH SCHOOL', 'HS')) AS hs
    FROM public.flip_card_front_stage f)`;
// The lines in by a cutoff: the newest copy of each player, game and stat
// type that had arrived (player_game_logs.created_at) by then.
const SQL_FROZEN = (from: string, to: string, cutoff: string) => `src AS (
  SELECT DISTINCT ON (s.playerid, s.source_game_id, s.stat_type) s.*
    FROM public.stat_lines s
    JOIN public.player_game_logs g ON s.source = 'mlb_api' AND g.id::text = s.source_line_id
   WHERE s.game_date BETWEEN DATE ${lit(from)} AND DATE ${lit(to)}
     AND s.removed_at IS NULL AND s.hold_reason IS NULL AND s.is_final
     AND g.created_at <= TIMESTAMPTZ ${lit(cutoff)}
   ORDER BY s.playerid, s.source_game_id, s.stat_type, g.updated_at DESC)`;

function sqlDailyStatLines(day: string) {
  return `WITH ${SQL_MLB}, ${SQL_CARDS}, ${SQL_FROZEN(day, day, cutoffOf(day))},
x AS (
  SELECT s.*, c.nm, c.last, c.first, c.hsid AS card_hsid,
         coalesce(m1.short, s.team_name) AS team_short, coalesce(m2.short, s.opponent_name) AS opp_short,
         count(*) OVER (PARTITION BY s.playerid, s.stat_type) AS games,
         row_number() OVER (PARTITION BY s.playerid, s.stat_type ORDER BY s.source_game_id) AS game_no,
         EXISTS (SELECT 1 FROM src p WHERE p.playerid = s.playerid AND p.source_game_id = s.source_game_id AND p.stat_type = 'pitching') AS pitched
    FROM src s
    JOIN card c ON c.pid = s.playerid
    LEFT JOIN mlb m1 ON m1.full_name = s.team_name
    LEFT JOIN mlb m2 ON m2.full_name = s.opponent_name),
y AS (
  SELECT x.*,
         coalesce(bat_h, 0) AS h, coalesce(bat_ab, 0) AS ab, coalesce(bat_2b, 0) AS d2, coalesce(bat_3b, 0) AS d3,
         coalesce(bat_hr, 0) AS hr, coalesce(bat_rbi, 0) AS rbi, coalesce(bat_bb, 0) AS bb, coalesce(bat_sb, 0) AS sb
    FROM x
   -- A pitcher's empty batting line (no plate appearance) isn't news.
   WHERE NOT (stat_type = 'batting' AND coalesce(bat_pa, 0) = 0 AND pitched))
INSERT INTO public.daily_stat_lines (stats_date, stat_line_id, playerid, player_name, hsid, team_name, team_short, level,
                                     opponent_name, opponent_short, stat_type, line, sort_key)
SELECT game_date, id, playerid, nm, CASE WHEN card_hsid ~ '^\\d{1,9}$' THEN card_hsid::integer END,
       team_name, team_short, level, opponent_name, opp_short, stat_type,
       nm || ' (' || team_short || ', ' || level || ') vs. ' || opp_short
          || CASE WHEN games > 1 THEN ' (Game ' || game_no || ')' ELSE '' END || ': '
          || CASE WHEN stat_type = 'batting' THEN ${SQL_BAT('')}
                  ELSE concat_ws(', ', (coalesce(pit_outs, 0) / 3) || '.' || (coalesce(pit_outs, 0) % 3) || ' IP',
                         coalesce(pit_h, 0) || ' H', coalesce(pit_er, 0) || ' ER', coalesce(pit_bb, 0) || ' BB', coalesce(pit_so, 0) || ' K',
                         CASE WHEN pit_w > 0 THEN 'W' END, CASE WHEN pit_l > 0 THEN 'L' END,
                         CASE WHEN pit_sv > 0 THEN 'SV' END, CASE WHEN pit_hld > 0 THEN 'HLD' END) END,
       last || '|' || first || '|' || playerid || '|' || source_game_id || '|' || CASE stat_type WHEN 'batting' THEN '1' ELSE '2' END
  FROM y`;
}

function sqlWeeklyPlayerLines(season: string, week: number, monday: string, sunday: string, hsids: number[]) {
  return `WITH ${SQL_MLB}, ${SQL_CARDS}, ${SQL_FROZEN(monday, sunday, cutoffOf(sunday))},
roster AS (
  SELECT c.* FROM card c
   WHERE c.hsid IN (${list(hsids.map(String))}) AND c.st IN (${list(ACTIVE)}) AND NOT c.hs),
wk AS (
  SELECT playerid, count(DISTINCT source_game_id) AS games,
         sum(coalesce(bat_pa, 0)) AS pa, sum(coalesce(bat_ab, 0)) AS ab, sum(coalesce(bat_h, 0)) AS h,
         sum(coalesce(bat_2b, 0)) AS d2, sum(coalesce(bat_3b, 0)) AS d3, sum(coalesce(bat_hr, 0)) AS hr,
         sum(coalesce(bat_rbi, 0)) AS rbi, sum(coalesce(bat_bb, 0)) AS bb, sum(coalesce(bat_sb, 0)) AS sb,
         sum(coalesce(pit_outs, 0)) AS outs, sum(coalesce(pit_bf, 0)) AS bf, sum(coalesce(pit_h, 0)) AS p_h,
         sum(coalesce(pit_er, 0)) AS p_er, sum(coalesce(pit_bb, 0)) AS p_bb, sum(coalesce(pit_so, 0)) AS p_so,
         sum(coalesce(pit_w, 0)) AS w, sum(coalesce(pit_l, 0)) AS l, sum(coalesce(pit_sv, 0)) AS sv,
         bool_or(stat_type = 'pitching') AS pitched,
         (array_agg(team_name ORDER BY game_date DESC, source_game_id DESC))[1] AS team_name,
         (array_agg(level ORDER BY game_date DESC, source_game_id DESC))[1] AS level
    FROM src GROUP BY playerid),
x AS (
  SELECT r.hsid, r.pid, r.nm, r.last, r.first, coalesce(wk.games, 0) AS games,
         coalesce(wk.team_name, r.team) AS team_name, coalesce(m.short, wk.team_name, r.team) AS team_short,
         coalesce(wk.level, r.lvl) AS level, wk.pa, wk.ab, wk.h, wk.d2, wk.d3, wk.hr, wk.rbi, wk.bb, wk.sb,
         wk.outs, wk.bf, wk.p_h, wk.p_er, wk.p_bb, wk.p_so, wk.w, wk.l, wk.sv, coalesce(wk.pitched, false) AS pitched
    FROM roster r
    LEFT JOIN wk ON wk.playerid = r.pid
    LEFT JOIN mlb m ON m.full_name = coalesce(wk.team_name, r.team))
INSERT INTO public.weekly_player_lines (period_start, hsid, playerid, period_end, season_key, week, player_name,
                                        team_name, team_short, level, games, line, sort_key)
SELECT DATE ${lit(monday)}, hsid::integer, pid, DATE ${lit(sunday)}, ${lit(season)}, ${week}, nm, team_name, team_short, level, games,
       nm || coalesce(' (' || nullif(concat_ws(', ', nullif(team_short, ''), nullif(level, '')), '') || ')', '') || ': '
          || CASE WHEN games = 0 THEN 'Did not play'
                  ELSE concat_ws('; ',
                         CASE WHEN pa > 0 OR NOT pitched THEN ${SQL_BAT('')} END,
                         CASE WHEN pitched AND (outs > 0 OR bf > 0) THEN concat_ws(', ', (outs / 3) || '.' || (outs % 3) || ' IP',
                           p_h || ' H', p_er || ' ER', p_bb || ' BB', p_so || ' K',
                           CASE WHEN w + l > 0 THEN w || '-' || l END, ${many('sv', 'SV')}) END) END,
       CASE WHEN games > 0 THEN '0' ELSE '1' END || '|' || last || '|' || first || '|' || pid
  FROM x
 WHERE hsid ~ '^\\d{1,9}$'`;
}

// --- The engine half: scores, stories, box scores. ----------------------------

type ScoreRow = {
  stats_date: string; season_key: string; region: number; game_id: number; week: number; home_hsid: number; away_hsid: number;
  home_label: string; away_label: string; home_innings: string[]; away_innings: string[]; home_runs: number; away_runs: number;
  through_inning: number; is_final: boolean;
};
type StoryRow = {
  stats_date: string; hsid: number; season_key: string; week: number; region: number; game_id: number; opponent_hsid: number;
  school_name: string; opponent_name: string; series_note: string; through_inning: number; is_final: boolean;
  school_runs: number; opponent_runs: number; title: string; story: string; shout_outs: { playerid: string; name: string; line: string }[];
};
type Table = { columns: string[]; rows: string[][]; totals: string[] };
type BoxRow = {
  season_key: string; region: number; game_id: number; week: number; period_start: string; period_end: string; round_name: string;
  game_no: number; home_hsid: number; away_hsid: number; home_name: string; away_name: string; home_runs: number; away_runs: number;
  winner_hsid: number; decision: string; line_score: { columns: string[]; away: string[]; home: string[] };
  home_batting: Table; away_batting: Table; home_pitching: Table; away_pitching: Table;
  extra_base_hits: { home: string[]; away: string[] };
};

function main() {
  const dir = arg('dir');
  const day = arg('daily');
  const week = Number(arg('week'));
  if (!dir || !day || !week) throw new Error('usage: --dir <dir> --daily YYYY-MM-DD --week N');
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const season: Season = read('season.json');
  const rows: Row[] = read('rows.json');
  const rulings: Ruling[] = read('rulings.json');
  const lines: InLine[] = read('lines.json');

  const weeks = tournamentWeeks(season.opening_day, season.weeks);
  const start = weeks[0][0];
  const dailyWeek = weeks.findIndex(([a, b]) => a <= day && day <= b) + 1;
  if (!dailyWeek) throw new Error(`${day} is not in a week of ${season.season_key}`);
  const k = dayOf(day, weeks[dailyWeek - 1][0]); // the day's inning (0 = Monday)
  const [monday, sunday] = weeks[week - 1];
  // Scored as of the bracket's day after the daily cutoff: the day's inning
  // has posted, and the week is final.
  const asof = addDays(day, 1);
  if (asof <= sunday) throw new Error(`week ${week} isn't over by ${asof}`);

  // Each line once, in the window its edition freezes.
  const inDaily = (l: InLine) => l[3] === day;
  const inWeek = (l: InLine) => monday <= l[3] && l[3] <= sunday;
  const live = liveOf(lines.filter((l) => inDaily(l) || inWeek(l)), start);

  const scores: ScoreRow[] = [];
  const stories: StoryRow[] = [];
  const boxes: BoxRow[] = [];
  const problems: string[] = [];
  const regions = [...new Set(rows.map((r) => r.region))].sort((a, b) => a - b);

  // The week's lines by player, for the box score's counting stats and clubs.
  const weekLines = lines.filter(inWeek);
  const sums = new Map<string, { r: number; rbi: number; so: number; w: number; l: number; sv: number; team: string; level: string; date: string }>();
  for (const l of weekLines) {
    const s = sums.get(l[1]) || { r: 0, rbi: 0, so: 0, w: 0, l: 0, sv: 0, team: '', level: '', date: '' };
    if (l[4] === 'b') { s.r += l[11][0]; s.rbi += l[11][1]; s.so += l[11][2]; } else { s.w += l[11][0]; s.l += l[11][1]; s.sv += l[11][2]; }
    if (l[3] >= s.date) { s.date = l[3]; s.team = l[7]; s.level = l[9]; }
    sums.set(l[1], s);
  }
  const clubOf = (pid: string) => { const s = sums.get(pid); return s ? `${shortClub(s.team)}, ${s.level}` : ''; };
  // A shout-out's line for the stats day, in the same words as its stat line
  // ("2-for-4, HR, 2 RBI, BB" / "6.0 IP, 3 H, 1 ER, 2 BB, 8 K, W"), with the
  // day's club.
  const dayLines = lines.filter(inDaily);
  const count = (n: number, label: string) => (n > 1 ? `${n} ${label}` : n === 1 ? label : '');
  const shoutLine = (pid: string, kind: 'bat' | 'pit') => {
    const mine = dayLines.filter((l) => l[1] === pid && l[4] === (kind === 'bat' ? 'b' : 'p'));
    if (!mine.length) return '';
    const s = mine.reduce((a, l) => a.map((v, i) => v + (l[5][i] || 0)), Array(9).fill(0) as number[]);
    const x = mine.reduce((a, l) => a.map((v, i) => v + (l[11][i] || 0)), [0, 0, 0, 0]);
    const last = mine[mine.length - 1];
    const parts = kind === 'bat'
      ? [`${s[2]}-for-${s[1]}`, count(s[3], '2B'), count(s[4], '3B'), count(s[5], 'HR'), count(x[1], 'RBI'), count(s[6], 'BB'), count(x[3], 'SB')]
      : [`${ip(s[0])} IP`, `${s[5]} H`, `${s[7]} ER`, `${s[2]} BB`, `${s[4]} K`, x[0] ? 'W' : '', x[1] ? 'L' : '', x[2] ? 'SV' : '', x[3] ? 'HLD' : ''];
    return `(${shortClub(last[7])}, ${last[9]}): ${parts.filter(Boolean).join(', ')}`;
  };

  for (const region of regions) {
    const group = rows.filter((r) => r.region === region);
    const idx = buildIndex(season, group);
    for (const key of Object.keys(COMMISSIONER_DECISIONS)) delete COMMISSIONER_DECISIONS[key];
    for (const r of rulings.filter((x) => x.region === region)) COMMISSIONER_DECISIONS[`${r.week}:${r.home_hsid}:${r.away_hsid}`] = r.winner_hsid;
    const scored: Record<string, GameBox> = scoreLive(idx, live, asof);
    const byId = new Map(group.map((r) => [r.game_id, r]));
    const name = (h: number) => idx.schools[h]?.[0] || String(h);

    for (const round of idx.rounds) for (const s of round.series as SeriesRow[]) s[7].forEach((g: GameRow, n: number) => {
      const row = byId.get(g[0])!;
      const box = scored[String(g[0])];
      if (g[1] === dailyWeek) {
        // The Daily: the score through the day's inning, and each school's story of it.
        const inn = g[5] || [];
        const home = Array.from({ length: k + 1 }, (_, i) => Number(inn[i * 2] || 0));
        const away = Array.from({ length: k + 1 }, (_, i) => Number(inn[i * 2 + 1] || 0));
        const hr = home.reduce((a, b) => a + b, 0), ar = away.reduce((a, b) => a + b, 0);
        scores.push({
          stats_date: day, season_key: season.season_key, region, game_id: g[0], week: g[1], home_hsid: g[2], away_hsid: g[3],
          home_label: shortName(name(g[2])).toUpperCase(), away_label: shortName(name(g[3])).toUpperCase(),
          home_innings: home.map(String), away_innings: away.map(String), home_runs: hr, away_runs: ar, through_inning: k + 1, is_final: false,
        });
        for (const me of [g[2], g[3]]) {
          const st = inningStory(idx, g, box, me, k);
          if (!st) { problems.push(`no story: region ${region} game ${g[0]} school ${me} (inning ${k + 1} not settled)`); continue; }
          const mine = me === g[2];
          stories.push({
            stats_date: day, hsid: me, season_key: season.season_key, week: g[1], region, game_id: g[0], opponent_hsid: mine ? g[3] : g[2],
            school_name: shortName(name(me)), opponent_name: shortName(name(mine ? g[3] : g[2])),
            series_note: `${row.round_name || round.name}, Game ${n + 1} of 3.`, through_inning: k + 1, is_final: false,
            school_runs: mine ? hr : ar, opponent_runs: mine ? ar : hr, title: st.title, story: st.summary,
            shout_outs: st.shouts.map((x) => ({
              playerid: x.id, name: x.name,
              line: `${x.name} ${shoutLine(x.id, x.kind)} (${x.value} ${x.kind === 'bat' ? 'OPS+' : 'FIP-'})`,
            })),
          });
        }
      }
      if (g[1] === week) {
        // The Weekly: the locked result, with the rescored week's tables.
        if (row.status !== 'final' || !row.locked_at || row.winner_hsid == null) { problems.push(`week ${week} region ${region} game ${g[0]} isn't final and locked`); return; }
        const locked = inningsOf(row.innings);
        const again = (g[5] || []).slice(0, 16).map(Number);
        if (JSON.stringify(locked.slice(0, 16)) !== JSON.stringify(again)) {
          problems.push(`region ${region} game ${g[0]}: innings 1-8 rescore ${again.join(',')} but are locked ${locked.slice(0, 16).join(',')}`);
          return;
        }
        const n9 = locked.length / 2;
        const home = Array.from({ length: n9 }, (_, i) => locked[i * 2]), away = Array.from({ length: n9 }, (_, i) => locked[i * 2 + 1]);
        const hr = home.reduce((a, b) => a + b, 0), ar = away.reduce((a, b) => a + b, 0);
        const tables = (side: 'h' | 'a') => {
          const rowsOf = (box?.[side].p || []) as PlayerRow[];
          const team = (side === 'h' ? box?.d?.[7]?.[0] : box?.d?.[7]?.[1]) ?? null;
          const teamFip = (side === 'h' ? box?.d?.[7]?.[2] : box?.d?.[7]?.[3]) ?? null;
          const bats = rowsOf.filter((p) => Array.isArray(p[4]) && p[4][0] > 0);
          const arms = rowsOf.filter((p) => Array.isArray(p[5]) && p[5].slice(0, 5).some((v) => v > 0));
          const sum = (xs: number[]) => String(xs.reduce((a, b) => a + b, 0));
          const b = bats.map((p) => { const s = p[4] as number[], x = sums.get(p[0]); return [p[1], clubOf(p[0]), String(s[1]), String(x?.r ?? 0), String(s[2]), String(s[3]), String(s[4]), String(s[5]), String(x?.rbi ?? 0), String(s[6]), String(x?.so ?? 0), p[6] == null ? '' : String(p[6])]; });
          const q = arms.map((p) => { const s = p[5] as number[], x = sums.get(p[0]); return [p[1], clubOf(p[0]), ip(s[0]), String(s[5]), String(s[6]), String(s[7]), String(s[2]), String(s[4]), String(s[1]), x && x.w + x.l ? `${x.w}-${x.l}${x.sv ? ', SV' : ''}` : x?.sv ? 'SV' : '', p[7] == null ? '' : String(p[7])]; });
          const xbh = ([['2B', 3], ['3B', 4], ['HR', 5]] as [string, number][]).flatMap(([label, i]) => {
            const who = bats.filter((p) => (p[4] as number[])[i] > 0).map((p) => `${p[1]} (${clubOf(p[0])})${(p[4] as number[])[i] > 1 ? ` ${(p[4] as number[])[i]}` : ''}`);
            return who.length ? [`${label}: ${who.join(', ')}`] : [];
          });
          return {
            batting: { columns: ['Player', 'Team', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'SO', 'OPS+'], rows: b,
              totals: ['Totals', '', ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => sum(b.map((r) => Number(r[c])))), team == null || !b.length ? '' : String(team)] },
            pitching: { columns: ['Pitcher', 'Team', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR', 'W-L', 'FIP-'], rows: q,
              totals: ['Totals', '', ip(arms.reduce((a, p) => a + (p[5] as number[])[0], 0)), ...[3, 4, 5, 6, 7, 8].map((c) => sum(q.map((r) => Number(r[c])))), '', teamFip == null || !q.length ? '' : String(teamFip)] },
            xbh,
          };
        };
        const h = tables('h'), a = tables('a');
        boxes.push({
          season_key: season.season_key, region, game_id: g[0], week, period_start: monday, period_end: sunday,
          round_name: row.round_name || round.name, game_no: n + 1, home_hsid: g[2], away_hsid: g[3],
          home_name: row.home_school_name || name(g[2]), away_name: row.away_school_name || name(g[3]), home_runs: hr, away_runs: ar,
          winner_hsid: Number(row.winner_hsid),
          decision: row.decided_by === 'commissioner' ? "Final (Commissioner's decision)" : row.decided_by && row.decided_by !== 'runs' && row.decided_note ? `Final (${row.decided_note})` : 'Final',
          line_score: { columns: [...home.map((_, i) => String(i + 1)), 'R'], away: [...away.map(String), String(ar)], home: [...home.map(String), String(hr)] },
          home_batting: h.batting, away_batting: a.batting, home_pitching: h.pitching, away_pitching: a.pitching,
          extra_base_hits: { home: h.xbh, away: a.xbh },
        });
      }
    });
  }

  const field = [...new Set(rows.filter((r) => r.stage === 'bracket' && r.week === 1).flatMap((r) => [r.home_hsid, r.away_hsid]))].filter((h): h is number => h != null).sort((a, b) => a - b);
  const dailyGames = rows.filter((r) => r.stage === 'bracket' && r.week === dailyWeek && r.home_hsid != null && r.away_hsid != null).length;
  const weekGames = rows.filter((r) => r.stage === 'bracket' && r.week === week).length;
  const S = lit(season.season_key);

  // Each edition is one transaction, in this order; any failed check aborts it.
  const daily = [
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.edition_ready WHERE cadence = 'daily' AND period_start = DATE ${lit(day)})
       OR EXISTS (SELECT 1 FROM public.daily_stat_lines WHERE stats_date = DATE ${lit(day)})
       OR EXISTS (SELECT 1 FROM public.daily_game_scores WHERE stats_date = DATE ${lit(day)})
       OR EXISTS (SELECT 1 FROM public.daily_game_stories WHERE stats_date = DATE ${lit(day)})
     THEN RAISE EXCEPTION 'The Daily for ${day} is already published: it is never written twice'; END IF; END $$`,
    sqlDailyStatLines(day),
    `INSERT INTO public.daily_game_scores (stats_date, season_key, region, game_id, week, home_hsid, away_hsid, home_label, away_label,
       home_innings, away_innings, home_runs, away_runs, through_inning, is_final)
     SELECT stats_date, season_key, region, game_id, week, home_hsid, away_hsid, home_label, away_label,
       ARRAY(SELECT jsonb_array_elements_text(home_innings)), ARRAY(SELECT jsonb_array_elements_text(away_innings)),
       home_runs, away_runs, through_inning, is_final
       FROM jsonb_to_recordset(${dollar(JSON.stringify(scores))}::jsonb) AS x(stats_date date, season_key text, region smallint, game_id integer,
         week smallint, home_hsid integer, away_hsid integer, home_label text, away_label text, home_innings jsonb, away_innings jsonb,
         home_runs smallint, away_runs smallint, through_inning smallint, is_final boolean)`,
    `INSERT INTO public.daily_game_stories (stats_date, hsid, season_key, week, region, game_id, opponent_hsid, school_name, opponent_name,
       series_note, through_inning, is_final, school_runs, opponent_runs, title, story, shout_outs)
     SELECT * FROM jsonb_to_recordset(${dollar(JSON.stringify(stories))}::jsonb) AS x(stats_date date, hsid integer, season_key text,
       week smallint, region smallint, game_id integer, opponent_hsid integer, school_name text, opponent_name text, series_note text,
       through_inning smallint, is_final boolean, school_runs smallint, opponent_runs smallint, title text, story text, shout_outs jsonb)`,
    `DO $$ BEGIN
       IF (SELECT count(*) FROM public.daily_stat_lines WHERE stats_date = DATE ${lit(day)}) = 0 THEN RAISE EXCEPTION 'No stat lines for ${day}'; END IF;
       IF (SELECT count(*) FROM public.daily_game_scores WHERE stats_date = DATE ${lit(day)}) <> ${dailyGames} THEN RAISE EXCEPTION 'Expected ${dailyGames} game scores for ${day}'; END IF;
       IF (SELECT count(*) FROM public.daily_game_stories WHERE stats_date = DATE ${lit(day)}) <> ${dailyGames * 2} THEN RAISE EXCEPTION 'Expected ${dailyGames * 2} game stories for ${day}'; END IF;
     END $$`,
    `INSERT INTO public.edition_ready (cadence, period_start, period_end, season_key, week, cutoff_at, row_counts)
     SELECT 'daily', DATE ${lit(day)}, DATE ${lit(day)}, ${S}, ${dailyWeek}, TIMESTAMPTZ ${lit(cutoffOf(day))},
       jsonb_build_object('daily_stat_lines', (SELECT count(*) FROM public.daily_stat_lines WHERE stats_date = DATE ${lit(day)}),
                          'daily_game_scores', (SELECT count(*) FROM public.daily_game_scores WHERE stats_date = DATE ${lit(day)}),
                          'daily_game_stories', (SELECT count(*) FROM public.daily_game_stories WHERE stats_date = DATE ${lit(day)}))`,
  ];
  const weekly = [
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.edition_ready WHERE cadence = 'weekly' AND period_start = DATE ${lit(monday)})
       OR EXISTS (SELECT 1 FROM public.weekly_player_lines WHERE period_start = DATE ${lit(monday)})
       OR EXISTS (SELECT 1 FROM public.weekly_box_scores WHERE season_key = ${S} AND week = ${week})
     THEN RAISE EXCEPTION 'The Weekly for ${monday} is already published: it is never written twice'; END IF;
     IF EXISTS (SELECT 1 FROM public.master_bracket WHERE season_key = ${S} AND stage = 'bracket' AND week = ${week} AND (status <> 'final' OR locked_at IS NULL))
     THEN RAISE EXCEPTION 'Week ${week} has a game that is not final and locked'; END IF; END $$`,
    sqlWeeklyPlayerLines(season.season_key, week, monday, sunday, field),
    `INSERT INTO public.weekly_box_scores (season_key, region, game_id, week, period_start, period_end, round_name, game_no, home_hsid, away_hsid,
       home_name, away_name, home_runs, away_runs, winner_hsid, decision, line_score, home_batting, away_batting, home_pitching, away_pitching, extra_base_hits)
     SELECT * FROM jsonb_to_recordset(${dollar(JSON.stringify(boxes))}::jsonb) AS x(season_key text, region smallint, game_id integer, week smallint,
       period_start date, period_end date, round_name text, game_no smallint, home_hsid integer, away_hsid integer, home_name text, away_name text,
       home_runs smallint, away_runs smallint, winner_hsid integer, decision text, line_score jsonb, home_batting jsonb, away_batting jsonb,
       home_pitching jsonb, away_pitching jsonb, extra_base_hits jsonb)`,
    `DO $$ BEGIN
       IF (SELECT count(*) FROM public.weekly_box_scores WHERE season_key = ${S} AND week = ${week}) <> ${weekGames} THEN RAISE EXCEPTION 'Expected ${weekGames} box scores for week ${week}'; END IF;
       IF EXISTS (SELECT 1 FROM public.weekly_box_scores b JOIN public.master_bracket m USING (season_key, region, game_id)
                   WHERE b.week = ${week} AND (b.home_runs, b.away_runs, b.winner_hsid) IS DISTINCT FROM (m.home_runs, m.away_runs, m.winner_hsid))
       THEN RAISE EXCEPTION 'A box score disagrees with its locked result'; END IF;
       IF (SELECT count(DISTINCT hsid) FROM public.weekly_player_lines WHERE period_start = DATE ${lit(monday)}) = 0 THEN RAISE EXCEPTION 'No roster lines for week ${week}'; END IF;
     END $$`,
    `INSERT INTO public.edition_ready (cadence, period_start, period_end, season_key, week, cutoff_at, row_counts)
     SELECT 'weekly', DATE ${lit(monday)}, DATE ${lit(sunday)}, ${S}, ${week}, TIMESTAMPTZ ${lit(cutoffOf(sunday))},
       jsonb_build_object('weekly_player_lines', (SELECT count(*) FROM public.weekly_player_lines WHERE period_start = DATE ${lit(monday)}),
                          'weekly_box_scores', (SELECT count(*) FROM public.weekly_box_scores WHERE season_key = ${S} AND week = ${week}),
                          'schools', (SELECT count(DISTINCT hsid) FROM public.weekly_player_lines WHERE period_start = DATE ${lit(monday)}))`,
  ];

  writeFileSync(join(dir, 'daily.json'), JSON.stringify(daily));
  writeFileSync(join(dir, 'weekly.json'), JSON.stringify(weekly));
  const report = {
    daily: { day, week: dailyWeek, inning: k + 1, cutoff: cutoffOf(day), scores: scores.length, stories: stories.length, expectedGames: dailyGames },
    weekly: { week, monday, sunday, cutoff: cutoffOf(sunday), boxes: boxes.length, expectedGames: weekGames, field: field.length },
    problems,
  };
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (problems.length) process.exitCode = 1;
}

main();
