// Newsletter publication ONLY. Fantasy scores, daily innings, player-day
// ledgers and winners come from the already-stored master_bracket result.
// Nothing in this script runs the tournament scoring engine or decides a
// winner. Daily and weekly editions are frozen publication snapshots; the
// bracket result remains the sole authority.
// Input rows.json MUST be exported from master_bracket, INCLUDING its box,
// innings, home_runs, away_runs, status and locked_at columns.
//   - daily_stat_lines and weekly_player_lines are written by the SQL in this
//     file, inside the same transaction (they need every player, so they are
//     made where the rows are).
//   - edition_ready goes in last, in the same transaction, after every count
//     is checked. An edition already ready is never written again.
//
// Manual, one-shot (no schedule yet). Without a database connection here, it
// works from files and prints the transaction to apply:
//
//   npx --yes tsx scripts/newsletter-publish.ts --dir <dir> --daily 2026-04-13 --historical-replay
//   npx --yes tsx scripts/newsletter-publish.ts --dir <dir> --week 4 --historical-replay
//   npx --yes tsx scripts/newsletter-publish.ts --dir <dir> --daily 2026-05-03 --week 6 --historical-replay
//
// <dir> holds season.json, rows.json (authoritative master_bracket results,
// including the stored GameBox) and lines.json: the field's active alumni's
// stat lines for the days scored, each in by its cutoff -
// [hsid, playerid, name, game_date, 'b'|'p', engine stats, game, team, MLB's
// level label, official level, opponent, [R RBI SO SB] | [W L SV HLD], final].
// It writes daily.json and weekly.json (the statements, in order) and
// report.json (counts and checks).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
import { dailyFromStored, weeklyFromStored, storedInnings, type StoredBracketGame } from '@/lib/bracket/storedPublication';
import { shortName, type GameBox, type GameRow, type Index, type PlayerRow, type SeriesRow } from '@/components/bracket/gallery';
import { inningStory } from '@/components/bracket/dayStory';

type Season = { season_key: string; is_test: boolean; opening_day: string; last_day: string; weeks: number; regions: number; schools_per_region: number };
type Row = StoredBracketGame & {
  round: number; round_name?: string; series_no: number; game_no: number;
  home_seed: number | null; away_seed: number | null;
  home_school_name: string | null; away_school_name: string | null;
  decided_note?: string | null;
};
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
const historicalReplay = process.argv.includes('--historical-replay');

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
const SHORT_CLUBS = new Map(MLB_SHORT);
const shortClub = (team: string) => SHORT_CLUBS.get(team) || team;
const OFFICIAL = ['MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'SINGLE-A', 'ROOKIE', 'INDY', 'INTERNATIONAL',
  'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'CCCAA', 'NWAC', 'HIGH SCHOOL'];
const ACTIVE = ['ACTIVE', 'INJURED 7-DAY', 'INJURED 10-DAY', 'INJURED 15-DAY', 'INJURED 30-DAY', 'INJURED 60-DAY',
  'INJURED - FULL SEASON', 'ADMINISTRATIVE LEAVE', 'BEREAVEMENT LIST', 'DEVELOPMENT LIST', 'INELIGIBLE LIST', 'MILITARY LEAVE',
  'NOT YET REPORTED', 'OPTIONED', 'PATERNITY LIST', 'REASSIGNED TO MINORS', 'REHAB ASSIGNMENT', 'RESERVE LIST (MINORS)',
  'RESTRICTED LIST', 'SUSPENDED', 'TEMPORARILY INACTIVE LIST', 'FREE AGENT', 'RED SHIRT', 'REDSHIRT-MEDICAL'];

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const list = (xs: string[]) => xs.map(lit).join(', ');
const dollar = (s: string) => `$j$${s}$j$`;
const ip = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;

// Reconstitute only the presentation index from persisted game records.
// Do not call scoreLive: rows already contain the engine's decisions.
function buildIndex(season: Season, rows: Row[]): Index {
  const weeks = tournamentWeeks(season.opening_day, season.weeks);
  const schools: Index['schools'] = {};
  const rounds = new Map<string, SeriesRow[]>();
  const series = new Map<string, SeriesRow>();
  const sorted = [...rows].sort((a, b) =>
    a.week - b.week || a.stage.localeCompare(b.stage) ||
    a.region - b.region || a.series_no - b.series_no || a.game_no - b.game_no);
  for (const r of sorted) {
    if (r.home_hsid == null || r.away_hsid == null) continue;
    schools[r.home_hsid] ||= [r.home_school_name || String(r.home_hsid), r.region, r.home_seed ?? 0];
    schools[r.away_hsid] ||= [r.away_school_name || String(r.away_hsid), r.region, r.away_seed ?? 0];
    const key = r.stage + ':' + r.round + ':' + r.region + ':' + r.series_no;
    let entry = series.get(key);
    if (!entry) {
      entry = [r.region, r.home_hsid, r.away_hsid, r.home_seed ?? 0, r.away_seed ?? 0, 0, [0, 0], []];
      series.set(key, entry);
      const rk = r.stage + ':' + r.round;
      (rounds.get(rk) || rounds.set(rk, []).get(rk)!).push(entry);
    }
    entry[7].push([
      r.game_id, r.week, r.home_hsid, r.away_hsid,
      r.status === 'final' ? r.decided_by || 'runs' : '',
      storedInnings(r.innings),
      r.status === 'final' ? r.winner_hsid : null,
    ]);
  }
  return {
    season: Number(season.opening_day.slice(0, 4)), weeks, schools,
    rounds: [...rounds.entries()].map(([key, grouped]) => {
      const stage = key.split(':')[0];
      const roundNo = Number(key.split(':')[1]);
      const dates = grouped.flatMap((x) => x[7].map((g) => g[1]));
      return {
        r: roundNo,
        name: stage === 'bracket' ? 'Round ' + roundNo :
          stage === 'total_runs' ? 'Total Runs' : 'Championship',
        start: weeks[Math.min(...dates) - 1]?.[0] || '',
        end: weeks[Math.max(...dates) - 1]?.[1] || '',
        series: grouped,
      };
    }),
    lbt: [], gf: [], champion: 0, lbLeaders: [], lbChampion: 0,
  } as Index;
}

// --- The SQL half: every player's finished line. -----------------------------

const SQL_MLB = `mlb(full_name, short) AS (VALUES ${MLB_SHORT.map(([a, b]) => `(${lit(a)}, ${lit(b)})`).join(', ')})`;
// A batting line: "2-for-4, HR, 2 RBI, BB"; a pitching line:
// "6.0 IP, 3 H, 1 ER, 2 BB, 8 K, W". n: the count, label: what it counts.
const many = (n: string, label: string) => `CASE WHEN ${n} > 1 THEN ${n} || ' ${label}' WHEN ${n} = 1 THEN '${label}' END`;
const SQL_BAT = (x: string) => `concat_ws(', ', ${x}h || '-for-' || ${x}ab, ${many(`${x}d2`, '2B')}, ${many(`${x}d3`, '3B')}, ${many(`${x}hr`, 'HR')},
      ${many(`${x}rbi`, 'RBI')}, ${many(`${x}bb`, 'BB')}, ${many(`${x}sb`, 'SB')})`;
const SQL_CARDS = `card AS (
  SELECT f.playerid::text AS pid, f.yatid AS yatid, f.hsid::text AS hsid,
         coalesce(nullif(btrim(f.display_name), ''), btrim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, ''))) AS nm,
         lower(coalesce(f.last_name, '')) AS last, lower(coalesce(f.first_name, '')) AS first,
         upper(btrim(coalesce(f.status_label, ''))) AS st,
         CASE WHEN upper(btrim(coalesce(f.level_label, ''))) IN (${list(OFFICIAL)}) THEN upper(btrim(f.level_label)) ELSE '' END AS lvl,
         btrim(coalesce(f.current_team_name, '')) AS team,
         (upper(btrim(coalesce(f.level_label, ''))) IN ('HIGH SCHOOL', 'HS') OR upper(btrim(coalesce(f.display_level_label, ''))) IN ('HIGH SCHOOL', 'HS')) AS hs
    FROM public.flip_card_front_stage f)`;
// Preserve the original live ingest cutoff; historical replay imports
// arrived AFTER their 2026 game dates, so exclude that cutoff only when
// --historical-replay is explicitly selected for a completed sim season.
// Fantasy scores still come exclusively from stored master_bracket results.
const SQL_FROZEN = (from: string, to: string, cutoff: string) => `src AS (
  SELECT DISTINCT ON (g.yatid, s.source_game_id, s.stat_type) s.*, g.yatid
    FROM public.stat_lines s
    JOIN public.player_game_logs g ON s.source = 'mlb_api' AND g.id::text = s.source_line_id
   WHERE s.game_date BETWEEN DATE ${lit(from)} AND DATE ${lit(to)}
     AND s.removed_at IS NULL AND s.hold_reason IS NULL AND s.is_final
     AND g.yatid IS NOT NULL
     ${historicalReplay ? '' : 'AND g.created_at <= TIMESTAMPTZ ' + lit(cutoff)}
   ORDER BY g.yatid, s.source_game_id, s.stat_type, g.updated_at DESC)`;

function sqlDailyStatLines(day: string) {
  return `WITH ${SQL_MLB}, ${SQL_CARDS}, ${SQL_FROZEN(day, day, cutoffOf(day))},
x AS (
  SELECT s.*, c.nm, c.last, c.first, c.hsid AS card_hsid,
         coalesce(m1.short, s.team_name) AS team_short, coalesce(m2.short, s.opponent_name) AS opp_short,
         count(*) OVER (PARTITION BY s.playerid, s.stat_type) AS games,
         row_number() OVER (PARTITION BY s.playerid, s.stat_type ORDER BY s.source_game_id) AS game_no,
         EXISTS (SELECT 1 FROM src p WHERE p.playerid = s.playerid AND p.source_game_id = s.source_game_id AND p.stat_type = 'pitching') AS pitched
    FROM src s
    JOIN card c ON c.pid = s.playerid AND c.yatid = s.yatid
    LEFT JOIN mlb m1 ON m1.full_name = s.team_name
    LEFT JOIN mlb m2 ON m2.full_name = s.opponent_name),
y AS (
  SELECT x.*,
         coalesce(bat_h, 0) AS h, coalesce(bat_ab, 0) AS ab, coalesce(bat_2b, 0) AS d2, coalesce(bat_3b, 0) AS d3,
         coalesce(bat_hr, 0) AS hr, coalesce(bat_rbi, 0) AS rbi, coalesce(bat_bb, 0) AS bb, coalesce(bat_sb, 0) AS sb
    FROM x
   -- A pitcher's empty batting line (no plate appearance) isn't news.
   WHERE NOT (stat_type = 'batting' AND coalesce(bat_pa, 0) = 0 AND pitched))
INSERT INTO public.daily_stat_lines (stats_date, stat_line_id, playerid, yatid, player_name, hsid, team_name, team_short, level,
                                     opponent_name, opponent_short, stat_type, line, sort_key)
SELECT game_date, id, playerid, yatid, nm, CASE WHEN card_hsid ~ '^\\d{1,9}$' THEN card_hsid::integer END,
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
  SELECT r.hsid, r.pid, r.yatid, r.nm, r.last, r.first, coalesce(wk.games, 0) AS games,
         coalesce(wk.team_name, r.team) AS team_name, coalesce(m.short, wk.team_name, r.team) AS team_short,
         coalesce(wk.level, r.lvl) AS level, wk.pa, wk.ab, wk.h, wk.d2, wk.d3, wk.hr, wk.rbi, wk.bb, wk.sb,
         wk.outs, wk.bf, wk.p_h, wk.p_er, wk.p_bb, wk.p_so, wk.w, wk.l, wk.sv, coalesce(wk.pitched, false) AS pitched
    FROM roster r
    LEFT JOIN wk ON wk.playerid = r.pid
    LEFT JOIN mlb m ON m.full_name = coalesce(wk.team_name, r.team))
INSERT INTO public.weekly_player_lines (period_start, hsid, playerid, yatid, period_end, season_key, week, player_name,
                                        team_name, team_short, level, games, line, sort_key)
SELECT DATE ${lit(monday)}, hsid::integer, pid, yatid, DATE ${lit(sunday)}, ${lit(season)}, ${week}, nm, team_name, team_short, level, games,
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
  const rawWeek = arg('week');
  const week = rawWeek == null ? 0 : Number(rawWeek);
  if (!dir || (!day && !week) || (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) ||
      (rawWeek != null && (!Number.isInteger(week) || week < 1))) {
    throw new Error('usage: --dir <dir> [--daily YYYY-MM-DD] [--week N]');
  }
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const season: Season = read('season.json');
  if (historicalReplay && (new Date(season.last_day + 'T00:00:00Z').getTime() >= Date.now() || !season.season_key.endsWith('bracketsim'))) {
    throw new Error('Historical replay is restricted to a completed bracket simulation season');
  }
  // rows.json comes from master_bracket, not from a new scoring pass.
  const rows: Row[] = read('rows.json');
  const lines: InLine[] = read('lines.json');
  const weeks = tournamentWeeks(season.opening_day, season.weeks);
  const dailyWeek = day ? weeks.findIndex(([a, b]) => a <= day && day <= b) + 1 : 0;
  if (day && !dailyWeek) throw new Error(day + ' is outside season ' + season.season_key);
  const k = day ? dayOf(day, weeks[dailyWeek - 1][0]) : -1;
  if (week && !weeks[week - 1]) throw new Error('Week out of range: ' + week);
  const [monday, sunday] = week ? weeks[week - 1] : ['', ''];
  if (day && week && day !== sunday) {
    throw new Error('Combined Daily+Weekly publication requires the Sunday ending that week');
  }
  // Each line once, in the window its edition freezes.
  const inDaily = (l: InLine) => Boolean(day) && l[3] === day;
  const inWeek = (l: InLine) => Boolean(week) && monday <= l[3] && l[3] <= sunday;

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
    // Only the requested editions' weeks are read; no future fixtures or
    // placeholder games are mistaken for persisted fantasy calculations.
    const candidates = rows.filter((r) => r.region === region &&
      (r.week === dailyWeek || (week > 0 && r.week === week)) &&
      r.home_hsid != null && r.away_hsid != null &&
      ['bracket', 'total_runs', 'season_championship', 'world_series'].includes(r.stage));
    // A malformed game is flagged, not a veto on the rest of the edition.
    // Never invent a zero score to replace a missing result.
    const group = candidates.filter((r) => {
      try { storedInnings(r.innings); return true; }
      catch (err) {
        problems.push('Missing saved innings ' + season.season_key + '/' +
          r.region + '/' + r.game_id + ' week ' + r.week + ': ' + String(err));
        return false;
      }
    });
    if (!group.length) continue;
    const idx = buildIndex(season, group);
    const byId = new Map(group.map((r) => [r.game_id, r]));
    const name = (h: number) => idx.schools[h]?.[0] || String(h);

    for (const round of idx.rounds) for (const series of round.series as SeriesRow[]) {
      for (const g of series[7] as GameRow[]) {
        const row = byId.get(g[0])!;
        if (day && row.week === dailyWeek) {
          try {
          // Direct projection of the saved scoreboard, never a second score.
          const saved = dailyFromStored(row, k);
          const home = saved.homeInnings;
          const away = saved.awayInnings;
          const hr = saved.homeRuns;
          const ar = saved.awayRuns;
          const box = saved.box;
          scores.push({
            stats_date: day, season_key: season.season_key, region, game_id: g[0],
            week: g[1], home_hsid: g[2], away_hsid: g[3],
            home_label: shortName(name(g[2])).toUpperCase(),
            away_label: shortName(name(g[3])).toUpperCase(),
            home_innings: home.map(String), away_innings: away.map(String),
            home_runs: hr, away_runs: ar,
            through_inning: saved.throughInning, is_final: saved.isFinal,
          });
          for (const me of [g[2], g[3]]) {
            let st;
            try { st = inningStory(idx, g, box, me, saved.storyInning); }
            catch (err) { problems.push('Story error ' + season.season_key + '/' + region +
              '/' + g[0] + ' school ' + me + ': ' + String(err)); continue; }
            if (!st) {
              problems.push('Missing settled stored story ' + season.season_key +
                '/' + region + '/' + g[0] + ' school ' + me);
              continue;
            }
            const mine = me === g[2];
            stories.push({
              stats_date: day, hsid: me, season_key: season.season_key,
              week: g[1], region, game_id: g[0],
              opponent_hsid: mine ? g[3] : g[2],
              school_name: shortName(name(me)),
              opponent_name: shortName(name(mine ? g[3] : g[2])),
              series_note: (row.stage === 'bracket' ? row.round_name || round.name : 'Total Runs') +
                ', Game ' + row.game_no + ' of 3.',
              through_inning: saved.throughInning, is_final: saved.isFinal,
              school_runs: mine ? hr : ar, opponent_runs: mine ? ar : hr,
              title: st.title, story: st.summary,
              shout_outs: st.shouts.map((x) => ({
                playerid: x.id, name: x.name,
                line: x.name + ' ' + shoutLine(x.id, x.kind) +
                  ' (' + x.value + ' ' + (x.kind === 'bat' ? 'OPS+' : 'FIP-') + ')',
              })),
            });
          }
          } catch (err) {
            problems.push('Daily scoreboard unavailable for ' + season.season_key +
              '/' + region + '/' + g[0] + ' week ' + g[1] + ': ' + String(err));
          }
        }
        if (week && row.week === week) {
          try {
          // The stored, locked result is the one and only official answer.
          const saved = weeklyFromStored(row);
          const box = saved.box;
          const locked = saved.innings;
          const n9 = 9;
          const home = saved.homeInnings;
          const away = saved.awayInnings;
          const hr = saved.homeRuns;
          const ar = saved.awayRuns;
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
          round_name: row.round_name || round.name, game_no: row.game_no, home_hsid: g[2], away_hsid: g[3],
          home_name: row.home_school_name || name(g[2]), away_name: row.away_school_name || name(g[3]), home_runs: hr, away_runs: ar,
          winner_hsid: Number(row.winner_hsid),
          decision: row.decided_by === 'commissioner' ? "Final (Commissioner's decision)" : row.decided_by && row.decided_by !== 'runs' && row.decided_note ? `Final (${row.decided_note})` : 'Final',
          line_score: { columns: [...home.map((_, i) => String(i + 1)), 'R'], away: [...away.map(String), String(ar)], home: [...home.map(String), String(hr)] },
          home_batting: h.batting, away_batting: a.batting, home_pitching: h.pitching, away_pitching: a.pitching,
          extra_base_hits: { home: h.xbh, away: a.xbh },
        });
          } catch (err) {
            problems.push('Weekly box unavailable for ' + season.season_key +
              '/' + region + '/' + g[0] + ' week ' + g[1] + ': ' + String(err));
          }
      }
      }
    }
  }

  const field = [...new Set(rows.filter((r) => r.stage === 'bracket' && r.week === 1).flatMap((r) => [r.home_hsid, r.away_hsid]))].filter((h): h is number => h != null).sort((a, b) => a - b);
  const publishingStages = ['bracket', 'total_runs', 'season_championship', 'world_series'];
  const dailyGames = day ? rows.filter((r) => publishingStages.includes(r.stage) && r.week === dailyWeek && r.home_hsid != null && r.away_hsid != null).length : 0;
  const weekGames = week ? rows.filter((r) => publishingStages.includes(r.stage) && r.week === week && r.home_hsid != null && r.away_hsid != null).length : 0;
  const S = lit(season.season_key);

  // Each edition is one transaction, in this order; any failed check aborts it.
  const daily = day ? [
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
  ] : [];
  const weekly = week ? [
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
  ] : [];

  // Never emit executable publication SQL if any saved score or story is missing.
  if (problems.length || (day && (scores.length !== dailyGames || stories.length !== dailyGames * 2)) ||
      (week && boxes.length !== weekGames)) {
    throw new Error('Incomplete authoritative publication: ' +
      JSON.stringify({ problems, dailyScores: scores.length, dailyGames, dailyStories: stories.length, weeklyBoxes: boxes.length, weekGames }));
  }
  if (day) writeFileSync(join(dir, 'daily.json'), JSON.stringify(daily));
  if (week) writeFileSync(join(dir, 'weekly.json'), JSON.stringify(weekly));
  const report = {
    daily: day ? { day, week: dailyWeek, inning: k + 1, cutoff: cutoffOf(day), scores: scores.length, stories: stories.length, expectedGames: dailyGames } : null,
    weekly: week ? { week, monday, sunday, cutoff: cutoffOf(sunday), boxes: boxes.length, expectedGames: weekGames, field: field.length } : null,
    problems,
  };
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  // An invalid edition throws above and cannot create a ready row.
}

main();
