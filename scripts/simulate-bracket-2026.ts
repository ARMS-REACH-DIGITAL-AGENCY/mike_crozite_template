// scripts/simulate-bracket-2026.ts
// Plays the whole 2026 YAT?STATS National Alumni Bracket on 2026 data with
// the scoring engine (src/lib/bracket/engine.ts), and writes every series,
// game and inning plus a summary to a JSON file. Nothing is written to the
// database.
//
// Stats:
//   Pros     - their real day-by-day lines (player_game_logs, MLB Stats API),
//              Opening Day (Mar 25) on, plus MLB spring training games
//              (Feb 20 - Mar 24) as their own level (--no-spring leaves
//              them out).
//   College  - 2026 totals only (The Baseball Cube, a partial season), so
//              each player's games are simulated: a full season's share of
//              games on a standard college calendar for his level, each
//              game's line drawn from his own 2026 rates with a fixed random
//              seed (same result every run). Marked simulated.
//   Inning 9 - real W-L of every pro alumnus's club that week, from the
//              team stints (on the roster counts, played or not); college
//              results aren't loaded, so a school with only college alumni
//              counts as .500.
//
// The tournament:
//   Weeks 1-30 (Feb 2 - Aug 30): the 1,024-school bracket, 10 rounds of
//     best-of-3. Rounds 1-7 stay inside each 128-school region (standard
//     seeded order, 1 v 128 ...). The 8 regional champions then enter the
//     fixed national bracket in their regional slots for Rounds 8-10; the
//     main bracket is NOT reseeded by school seed or run differential.
//   Regional leaderboards: every school, all 30 weeks, ranked on total
//     runs. Schools still in the bracket score in their bracket games;
//     eliminated schools play a weekly game, paired at random inside their
//     region.
//   Weeks 31-33 (Aug 31 - Sep 20): each region's leaderboard leader plays a
//     single-game, 8-team bracket. The bracket champion sits out (its
//     region sends the next school).
//   Week 34 (Sep 21-27): the Fantasy World Series, one game, bracket champion v
//     leaderboard champion.
//
// Usage:
//   npx tsx scripts/simulate-bracket-2026.ts --data <dir> --out results.json [--mode adjusted|raw] [--absent hold|forfeit|average] [--no-spring]
// <dir> holds seeds.psv, pro_bat.csv, pro_pit.csv, col_bat.psv, col_pit.psv,
// team_results.csv, stints.csv, spring_bat.csv, spring_pit.csv and spring_results.csv
// (exported read-only from production and the MLB Stats API).

import fs from 'node:fs';
import path from 'node:path';
import {
  type Absent,
  type BatTotals,
  type Baselines,
  type GameResult,
  type LevelBuckets,
  type Mode,
  type PitTotals,
  type PlayerLines,
  type SideWeek,
  addToBuckets,
  bracketOrder,
  emptyBat,
  emptyPit,
  fipCore,
  hashString,
  mulberry32,
  offenseScore,
  pairEliminated,
  pitchingScore,
  playGame,
  playSeries,
} from '../src/lib/bracket/engine';

const args = process.argv.slice(2);
const arg = (name: string, def?: string) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : def;
};
const DATA = arg('--data', '.')!;
const OUT = arg('--out', 'bracket-sim-2026.json')!;
const MODE = (arg('--mode', 'adjusted') as Mode);
const ABSENT = (arg('--absent', 'hold') as Absent);
const RULES = { mode: MODE, absent: ABSENT };
// MLB spring training counts for the bracket (lines from
// export-spring-training-2026.ts, measured against the spring training
// average; clubs' spring results count in inning 9). --no-spring leaves it
// out. It stays off the Game Log either way.
const SPRING = !args.includes('--no-spring');
const SEED = 'yatstats-2026';
// The bracket's 10 rounds end Aug 30 (week 30); the leaderboard runs the
// same 30 weeks. Then the 8-team tournament (weeks 31-33, Aug 31 - Sep 20;
// the bracket champion sits out) and the Fantasy World Series (week 34, Sep 21-27,
// the last week of the MLB regular season).
const BRACKET_LAST_WEEK = 30;
const GRAND_FINAL_WEEK = 34;

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
const WEEK1 = Date.UTC(2026, 1, 2); // Monday, Feb 2 2026
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const weekStart = (w: number) => WEEK1 + (w - 1) * 7 * DAY;
const weekDates = (w: number) => Array.from({ length: 7 }, (_, d) => iso(weekStart(w) + d * DAY));
const weekOf = (date: string) => Math.floor((Date.parse(date) - WEEK1) / (7 * DAY)) + 1;
const LAST_DATA_DAY = '2026-09-27';

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
function rows(file: string, sep: string) {
  const [head, ...lines] = fs.readFileSync(path.join(DATA, file), 'utf8').split('\n').filter(Boolean);
  const cols = head.split(sep);
  return lines.map((l) => {
    const v = l.split(sep);
    return Object.fromEntries(cols.map((c, i) => [c, v[i]])) as Record<string, string>;
  });
}
const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : 0);
// "12.1" innings = 12 1/3 = 37 outs
const ipToOuts = (v: string) => {
  const [whole, frac] = String(v || '0').split('.');
  return num(whole) * 3 + Math.min(2, num((frac || '0').slice(0, 1)));
};

type School = { hsid: number; name: string; region: number; seed: number };
const schools = new Map<number, School>();
for (const r of rows('seeds.psv', '|')) {
  schools.set(num(r.home_hsid), { hsid: num(r.home_hsid), name: r.home_name, region: num(r.region), seed: num(r.home_seed) });
  schools.set(num(r.visitor_hsid), { hsid: num(r.visitor_hsid), name: r.visitor_name, region: num(r.region), seed: num(r.visitor_seed) });
}

// College levels: the three juco associations share one baseline.
const levelOf = (l: string) => (['NJCAA', 'CCCAA', 'NWAC'].includes(l) ? 'JUCO' : l);

const proBat = [...rows('pro_bat.csv', ','), ...(SPRING ? rows('spring_bat.csv', ',') : [])];
const proPit = [...rows('pro_pit.csv', ','), ...(SPRING ? rows('spring_pit.csv', ',') : [])];
const colBat = rows('col_bat.psv', '|').filter((r) => schools.has(num(r.hsid)) && !['?', 'UNKNOWN'].includes(r.level));
const colPit = rows('col_pit.psv', '|').filter((r) => schools.has(num(r.hsid)) && !['?', 'UNKNOWN'].includes(r.level));

// A pro line with no level (a team not on the schedule feed) takes the
// level the player played most at.
const proLevelByPlayer = new Map<string, Map<string, number>>();
for (const r of [...proBat, ...proPit]) {
  if (r.level === '?' || r.level === 'SPRING') continue;
  const m = proLevelByPlayer.get(r.playerid) || new Map();
  m.set(r.level, (m.get(r.level) || 0) + 1);
  proLevelByPlayer.set(r.playerid, m);
}
const proLevel = (r: Record<string, string>) => {
  if (r.level !== '?') return r.level;
  const m = proLevelByPlayer.get(r.playerid);
  return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : 'ROOKIE';
};

// ---------------------------------------------------------------------------
// Level baselines (2026 averages of the alumni in the bracket)
// ---------------------------------------------------------------------------
type Agg = { bat: BatTotals; pit: PitTotals & { er: number } };
const agg = new Map<string, Agg>();
const aggOf = (l: string) => {
  if (!agg.has(l)) agg.set(l, { bat: emptyBat(), pit: { ...emptyPit(), er: 0 } });
  return agg.get(l)!;
};
const proBatLine = (r: Record<string, string>): BatTotals => ({ pa: num(r.pa), ab: num(r.ab), h: num(r.h), d2: num(r.d2), d3: num(r.d3), hr: num(r.hr), bb: num(r.bb), hbp: num(r.hbp), sf: num(r.sf) });
const proPitLine = (r: Record<string, string>): PitTotals => ({ outs: num(r.outs), hr: num(r.hr), bb: num(r.bb), hbp: num(r.hbp), so: num(r.so) });
function addAgg(level: string, bat?: BatTotals, pit?: PitTotals, er = 0) {
  const a = aggOf(level);
  if (bat) for (const k of Object.keys(bat) as (keyof BatTotals)[]) a.bat[k] += bat[k];
  if (pit) {
    for (const k of Object.keys(pit) as (keyof PitTotals)[]) a.pit[k] += pit[k];
    a.pit.er += er;
  }
}
for (const r of proBat) addAgg(proLevel(r), proBatLine(r));
for (const r of proPit) addAgg(proLevel(r), undefined, proPitLine(r), num(r.er));
const colBatTotals = (r: Record<string, string>): BatTotals => ({ pa: num(r.pa), ab: num(r.ab), h: num(r.h), d2: num(r.d2), d3: num(r.d3), hr: num(r.hr), bb: num(r.bb), hbp: num(r.hbp), sf: num(r.sf) });
const colPitTotals = (r: Record<string, string>): PitTotals => ({ outs: ipToOuts(r.ip), hr: num(r.hr), bb: num(r.bb), hbp: num(r.hbp), so: num(r.so) });
for (const r of colBat) addAgg(levelOf(r.level), colBatTotals(r));
for (const r of colPit) addAgg(levelOf(r.level), undefined, colPitTotals(r), num(r.er));

const baselines: Baselines = new Map();
const baselineReport: Record<string, unknown>[] = [];
for (const [level, { bat, pit }] of agg) {
  const obpDen = bat.ab + bat.bb + bat.hbp + bat.sf;
  const obp = obpDen ? (bat.h + bat.bb + bat.hbp) / obpDen : 0;
  const tbs = bat.h - bat.d2 - bat.d3 - bat.hr + 2 * bat.d2 + 3 * bat.d3 + 4 * bat.hr;
  const slg = bat.ab ? tbs / bat.ab : 0;
  const era = pit.outs ? (27 * pit.er) / pit.outs : 0;
  const cfip = era - fipCore(pit);
  baselines.set(level, { obp, slg, fip: era, cfip });
  baselineReport.push({ level, pa: bat.pa, ops: +(obp + slg).toFixed(3), obp: +obp.toFixed(3), slg: +slg.toFixed(3), ip: +(pit.outs / 3).toFixed(1), era: +era.toFixed(2), cfip: +cfip.toFixed(2) });
}

// ---------------------------------------------------------------------------
// Daily production per school
// ---------------------------------------------------------------------------
type PlayerDay = { playerid: string; level: string; simulated: boolean; bat?: BatTotals; pit?: PitTotals };
const daily = new Map<number, Map<string, PlayerDay[]>>();
function addDay(hsid: number, date: string, pd: PlayerDay) {
  if (!schools.has(hsid)) return;
  if (!daily.has(hsid)) daily.set(hsid, new Map());
  const m = daily.get(hsid)!;
  if (!m.has(date)) m.set(date, []);
  m.get(date)!.push(pd);
}
for (const r of proBat) addDay(num(r.hsid), r.date, { playerid: r.playerid, level: proLevel(r), simulated: false, bat: proBatLine(r) });
for (const r of proPit) addDay(num(r.hsid), r.date, { playerid: r.playerid, level: proLevel(r), simulated: false, pit: proPitLine(r) });

// College calendars: game days and season windows by level (2026).
const COLLEGE: Record<string, { start: string; end: string; latest: string; days: number[] }> = {
  'NCAA-D1': { start: '2026-02-13', end: '2026-05-17', latest: '2026-06-22', days: [2, 5, 6, 0] },
  'NCAA-D2': { start: '2026-02-06', end: '2026-05-10', latest: '2026-06-07', days: [2, 5, 6, 0] },
  'NCAA-D3': { start: '2026-02-27', end: '2026-05-10', latest: '2026-06-07', days: [2, 5, 6, 0] },
  NAIA: { start: '2026-02-06', end: '2026-05-10', latest: '2026-06-07', days: [2, 5, 6, 0] },
  JUCO: { start: '2026-01-30', end: '2026-05-10', latest: '2026-06-07', days: [2, 4, 6] },
};
function calendarFor(level: string, games: number): string[] {
  const c = COLLEGE[level] || COLLEGE['NCAA-D1'];
  const slots: string[] = [];
  for (let t = Date.parse(c.start); iso(t) <= c.latest; t += DAY) {
    if (!c.days.includes(new Date(t).getUTCDay())) continue;
    slots.push(iso(t));
    // past the regular season only as far as his game count needs
    if (iso(t) >= c.end && slots.length >= games) break;
  }
  return slots;
}
// The Baseball Cube's 2026 college totals are a partial season (captured
// around early April: UCLA's regulars show ~24 games of ~56). Each player
// keeps his rates, but plays a full season's share: his games so far
// scaled by (the level's regular-season games / games played so far),
// where "so far" is the level's 90th-percentile games among our alumni
// (a regular's count). A regular plays ~4 games a week; part-timers keep
// their share.
function regularSeasonSlots(level: string) {
  const c = COLLEGE[level] || COLLEGE['NCAA-D1'];
  let n = 0;
  for (let t = Date.parse(c.start); iso(t) <= c.end; t += DAY) if (c.days.includes(new Date(t).getUTCDay())) n++;
  return n;
}
const snapshotGames = new Map<string, number>();
{
  const byLevel = new Map<string, number[]>();
  for (const r of colBat) {
    const l = levelOf(r.level);
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(num(r.g));
  }
  for (const [l, g] of byLevel) {
    g.sort((a, b) => a - b);
    snapshotGames.set(l, Math.max(1, g[Math.floor(0.9 * (g.length - 1))]));
  }
}
function fullSeasonGames(level: string, g: number) {
  const slots = regularSeasonSlots(level);
  return Math.min(slots, Math.max(1, Math.round((g * slots) / (snapshotGames.get(level) || g))));
}

function pickGameDates(level: string, games: number, rand: () => number) {
  const slots = calendarFor(level, games);
  const idx = slots.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(games, slots.length)).sort((a, b) => a - b).map((i) => slots[i]);
}
function poisson(lambda: number, rand: () => number) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}
const spread = (mean: number, rand: () => number) => Math.floor(mean) + (rand() < mean - Math.floor(mean) ? 1 : 0);

let simulatedBatLines = 0, simulatedPitLines = 0;
for (const r of colBat) {
  const t = colBatTotals(r);
  const g = num(r.g), sh = num(r.sh);
  if (!g || !t.pa) continue;
  const level = levelOf(r.level);
  const rand = mulberry32(hashString(`${SEED}:bat:${r.playerid}:${r.teamid}`));
  const singles = Math.max(0, t.h - t.d2 - t.d3 - t.hr);
  // one plate appearance's outcomes, from his own 2026 season
  const outcomes: [keyof BatTotals | 'single' | 'sh' | 'out', number][] = [
    ['single', singles], ['d2', t.d2], ['d3', t.d3], ['hr', t.hr], ['bb', t.bb], ['hbp', t.hbp], ['sf', t.sf], ['sh', sh],
  ];
  const known = outcomes.reduce((s, [, n]) => s + n, 0);
  outcomes.push(['out', Math.max(0, t.pa - known)]);
  const total = outcomes.reduce((s, [, n]) => s + n, 0) || 1;
  for (const date of pickGameDates(level, fullSeasonGames(level, g), rand)) {
    const line = emptyBat();
    const pas = spread(t.pa / g, rand);
    for (let i = 0; i < pas; i++) {
      let x = rand() * total, k = 0;
      while (k < outcomes.length - 1 && x >= outcomes[k][1]) x -= outcomes[k++][1];
      const o = outcomes[k][0];
      line.pa++;
      if (o === 'single' || o === 'd2' || o === 'd3' || o === 'hr') { line.ab++; line.h++; if (o !== 'single') line[o]++; }
      else if (o === 'bb' || o === 'hbp' || o === 'sf') line[o]++;
      else if (o === 'out') line.ab++;
    }
    addDay(num(r.hsid), date, { playerid: r.playerid, level, simulated: true, bat: line });
    simulatedBatLines++;
  }
}
for (const r of colPit) {
  const t = colPitTotals(r);
  const g = num(r.g);
  if (!g || !t.outs) continue;
  const level = levelOf(r.level);
  const rand = mulberry32(hashString(`${SEED}:pit:${r.playerid}:${r.teamid}`));
  for (const date of pickGameDates(level, fullSeasonGames(level, g), rand)) {
    const outs = spread(t.outs / g, rand);
    const per = (n: number) => poisson((n / t.outs) * outs, rand);
    addDay(num(r.hsid), date, { playerid: r.playerid, level, simulated: true, pit: { outs, hr: per(t.hr), bb: per(t.bb), hbp: per(t.hbp), so: per(t.so) } });
    simulatedPitLines++;
  }
}

// Real club results (inning 9). Every alumnus on a
// club's roster counts, played or not - from player_team_stints (which club
// he was on, from when to when; stints.csv). Each player adds his club's
// wins and losses, so W-L% is an average over the school's alumni, not a
// total. Spring training has no rosters: there, alumni who appeared in a
// spring game that week count with their club's spring games that week.
const clubResults = new Map<string, { w: number; l: number }>();
for (const r of [...rows('team_results.csv', ','), ...(SPRING ? rows('spring_results.csv', ',') : [])]) clubResults.set(`${r.teamid}|${r.date}`, { w: num(r.w), l: num(r.l) });
const weeklyWL = new Map<string, { w: number; l: number }>(); // `${hsid}|${week}`
// Each alumnus's own share (his club's record that week), for the box score:
// `${hsid}|${week}` -> playerid -> W-L.
const playerWL = new Map<string, Map<string, { w: number; l: number }>>();
function addWL(hsid: number, date: string, club: string, playerid: string) {
  const res = clubResults.get(`${club}|${date}`);
  if (!res || !schools.has(hsid)) return;
  const key = `${hsid}|${weekOf(date)}`;
  const wl = weeklyWL.get(key) || { w: 0, l: 0 };
  wl.w += res.w; wl.l += res.l;
  weeklyWL.set(key, wl);
  if (!playerWL.has(key)) playerWL.set(key, new Map());
  const pw = playerWL.get(key)!.get(playerid) || { w: 0, l: 0 };
  pw.w += res.w; pw.l += res.l;
  playerWL.get(key)!.set(playerid, pw);
}
// A rostered alumnus's level (for the ones who didn't play that week).
const stintLevel = new Map<string, string>();
for (const r of rows('stints.csv', ',')) {
  stintLevel.set(r.playerid, r.level);
  for (let t = Date.parse(r.start); iso(t) <= r.end && iso(t) <= LAST_DATA_DAY; t += DAY) addWL(num(r.hsid), iso(t), r.teamid, r.playerid);
}
if (SPRING) {
  const springClubs = new Map<string, { hsid: number; clubs: Set<string> }>(); // `${playerid}|${week}`
  for (const r of [...proBat, ...proPit]) {
    if (r.level !== 'SPRING') continue;
    const key = `${r.playerid}|${weekOf(r.date)}`;
    const cur = springClubs.get(key) || { hsid: num(r.hsid), clubs: new Set<string>() };
    cur.clubs.add(r.teamid);
    springClubs.set(key, cur);
  }
  for (const [key, { hsid, clubs }] of springClubs) {
    const [playerid, wk] = key.split('|');
    const week = Number(wk);
    for (const club of clubs) for (const date of weekDates(week)) if (date < '2026-03-25') addWL(hsid, date, club, playerid);
  }
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------
// A school's alumni on one day: playerid -> his lines by level.
function dayLines(hsid: number, date: string): PlayerLines {
  const out: PlayerLines = new Map();
  for (const pd of daily.get(hsid)?.get(date) || []) {
    if (!out.has(pd.playerid)) out.set(pd.playerid, new Map());
    addToBuckets(out.get(pd.playerid)!, pd.level, pd.bat, pd.pit);
  }
  return out;
}
function sideWeek(hsid: number, week: number): SideWeek {
  const wl = weeklyWL.get(`${hsid}|${week}`) || { w: 0, l: 0 };
  return { days: weekDates(week).map((d) => dayLines(hsid, d)), wins: wl.w, losses: wl.l };
}
// The commissioner's coin flip, fixed per game so every rerun agrees.
const coinFlip = (week: number, home: number, away: number) => () =>
  mulberry32(hashString(`${SEED}:coin:${week}:${home}:${away}`))() < 0.5 ? ('home' as const) : ('away' as const);
function weekSource(hsid: number, week: number) {
  let real = 0, sim = 0;
  for (const d of weekDates(week)) for (const pd of daily.get(hsid)?.get(d) || []) { if (pd.simulated) sim++; else real++; }
  return { real, sim };
}

type GameRow = { week: number; home: number; away: number; score: [number, number]; winner: number | null; decidedBy: GameResult['decidedBy']; tieRank?: number; innings: [number, number][]; real: [number, number]; simulated: [number, number] };
function game(week: number, home: number, away: number, allowTie = false): GameRow {
  const r = playGame(sideWeek(home, week), sideWeek(away, week), baselines, RULES, allowTie, coinFlip(week, home, away));
  const hs = weekSource(home, week), as = weekSource(away, week);
  return {
    week, home, away,
    score: [r.home, r.away],
    winner: r.winner === 'home' ? home : r.winner === 'away' ? away : null,
    decidedBy: r.decidedBy,
    tieRank: r.tieRank,
    innings: r.innings.map((i) => [i.home, i.away]),
    real: [hs.real, as.real],
    simulated: [hs.sim, as.sim],
  };
}

type SeriesRow = { round: number; region: number | null; home: number; away: number; homeSeed: number; awaySeed: number; games: GameRow[]; winner: number; loser: number; wins: [number, number]; lastWeek: number };
const series: SeriesRow[] = [];
const eliminatedAfterWeek = new Map<number, number>(); // hsid -> last week played in the bracket

function playBracketSeries(round: number, region: number | null, a: number, b: number, seedA: number, seedB: number): SeriesRow {
  const [home, away, hSeed, aSeed] = seedA <= seedB ? [a, b, seedA, seedB] : [b, a, seedB, seedA];
  const firstWeek = (round - 1) * 3 + 1;
  const played = playSeries((g) => {
    const row = game(firstWeek + g - 1, home, away);
    return { row, winner: row.winner === home ? ('home' as const) : row.winner === away ? ('away' as const) : null };
  });
  const s = { winner: played.winner, games: played.games.map((g) => g.row) };
  const winner = s.winner === 'home' ? home : away;
  const loser = winner === home ? away : home;
  const wins: [number, number] = [s.games.filter((g) => g.winner === home).length, s.games.filter((g) => g.winner === away).length];
  const lastWeek = s.games[s.games.length - 1].week;
  eliminatedAfterWeek.set(loser, lastWeek);
  const row = { round, region, home, away, homeSeed: hSeed, awaySeed: aSeed, games: s.games, winner, loser, wins, lastWeek };
  series.push(row);
  return row;
}

// Rounds 1-7, inside each region.
const regionChamps: number[] = [];
for (let region = 1; region <= 8; region++) {
  const bySeed = new Map([...schools.values()].filter((s) => s.region === region).map((s) => [s.seed, s.hsid]));
  let alive = bracketOrder(128).map((seed) => bySeed.get(seed)!);
  for (let round = 1; round <= 7; round++) {
    const next: number[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const [a, b] = [alive[i], alive[i + 1]];
      next.push(playBracketSeries(round, region, a, b, schools.get(a)!.seed, schools.get(b)!.seed).winner);
    }
    alive = next;
  }
  regionChamps.push(alive[0]);
}
// Rounds 8-10: fixed national bracket by regional slot.
// regionChamps is [Region 1 champ, ..., Region 8 champ]. bracketOrder(8)
// gives the permanent national bracket: R1vR8, R4vR5, R2vR7, R3vR6.
// Do not reseed these eight schools by school seed, runs, or run differential.
const nationalSlot = new Map(regionChamps.map((h, i) => [h, i + 1]));
let alive = bracketOrder(8).map((regionSlot) => regionChamps[regionSlot - 1]);
for (let round = 8; round <= 10; round++) {
  const next: number[] = [];
  for (let i = 0; i < alive.length; i += 2) {
    next.push(playBracketSeries(round, null, alive[i], alive[i + 1], nationalSlot.get(alive[i])!, nationalSlot.get(alive[i + 1])!).winner);
  }
  alive = next;
}
const champion = alive[0];

// ---------------------------------------------------------------------------
// Regional leaderboards: every school, all season (weeks 1-30), ranked on
// total runs. Schools still in the bracket score in their bracket games;
// eliminated schools play a weekly game inside their region.
// ---------------------------------------------------------------------------
type Board = { games: number; w: number; l: number; t: number; rf: number; ra: number };
const board = new Map<number, Board>();
function addToBoard(g: GameRow) {
  for (const [h, rf, ra] of [[g.home, g.score[0], g.score[1]], [g.away, g.score[1], g.score[0]]] as const) {
    const cur = board.get(h) || { games: 0, w: 0, l: 0, t: 0, rf: 0, ra: 0 };
    cur.games++; cur.rf += rf; cur.ra += ra;
    if (g.winner === h) cur.w++; else if (g.winner === null) cur.t++; else cur.l++;
    board.set(h, cur);
  }
}
const lbGames: GameRow[] = [];
// Weekly games of eliminated schools; byes go by leaderboard games played.
const lbPlayed = new Map<number, number>();
for (let week = 2; week <= BRACKET_LAST_WEEK; week++) {
  for (let region = 1; region <= 8; region++) {
    const pool = [...eliminatedAfterWeek.entries()].filter(([h, w]) => w < week && schools.get(h)!.region === region).map(([h]) => h).sort((a, b) => a - b);
    if (pool.length < 2) continue;
    const { pairs } = pairEliminated(pool, lbPlayed, `${SEED}:lb:${week}:${region}`);
    for (const [a, b] of pairs) {
      const g = game(week, a, b, true);
      lbGames.push(g);
      for (const h of [a, b]) lbPlayed.set(h, (lbPlayed.get(h) || 0) + 1);
    }
  }
}
for (const g of [...series.flatMap((s) => s.games), ...lbGames]) addToBoard(g);
// Most runs; then run differential, wins.
const rankBoard = (a: number, b: number) => {
  const x = board.get(a)!, y = board.get(b)!;
  return y.rf - x.rf || (y.rf - y.ra) - (x.rf - x.ra) || y.w - x.w || schools.get(a)!.seed - schools.get(b)!.seed;
};
const leaderboards = Array.from({ length: 8 }, (_, i) => i + 1).map((region) =>
  [...board.keys()].filter((h) => schools.get(h)!.region === region).sort(rankBoard)
);
// Each region's leader goes to the 8-team tournament; the bracket champion
// sits it out, so its region sends the next school.
const lbLeaders = leaderboards.map((l) => l.find((h) => h !== champion)!).sort(rankBoard);

// Weeks 31-33: the leaders' single-game bracket (8 -> 4 -> 2 -> 1).
const lbSeed = new Map(lbLeaders.map((h, i) => [h, i + 1]));
const lbBracket: GameRow[] = [];
let lbAlive = bracketOrder(8).map((s) => lbLeaders[s - 1]);
for (let week = BRACKET_LAST_WEEK + 1; week <= BRACKET_LAST_WEEK + 3; week++) {
  const next: number[] = [];
  for (let i = 0; i < lbAlive.length; i += 2) {
    const [a, b] = lbSeed.get(lbAlive[i])! <= lbSeed.get(lbAlive[i + 1])! ? [lbAlive[i], lbAlive[i + 1]] : [lbAlive[i + 1], lbAlive[i]];
    const g = game(week, a, b);
    lbBracket.push(g);
    next.push(g.winner!);
  }
  lbAlive = next;
}
const lbChampion = lbAlive[0];

// Week 34: the Fantasy World Series, one game; the bracket champion is home.
const grandFinalGames = [game(GRAND_FINAL_WEEK, champion, lbChampion)];
const grandChampion = grandFinalGames[0].winner!;

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const allGames = [...series.flatMap((s) => s.games), ...lbGames, ...lbBracket, ...grandFinalGames];
const dayInnings = allGames.flatMap((g) => g.innings.slice(0, 7));
const summary = {
  mode: MODE,
  absent: ABSENT,
  spring: SPRING,
  seed: SEED,
  lastDataDay: LAST_DATA_DAY,
  baselines: baselineReport,
  simulatedBatLines,
  simulatedPitLines,
  realBatLines: proBat.length,
  realPitLines: proPit.length,
  bracketGames: series.reduce((s, x) => s + x.games.length, 0),
  leaderboardGames: lbGames.length,
  scorelessDayInnings: dayInnings.filter(([h, a]) => h + a === 0).length / dayInnings.length,
  decidedBy: Object.fromEntries(['runs', 'players', 'coin', 'tie'].map((k) => [k, allGames.filter((g) => g.decidedBy === k).length])),
  averageRuns: allGames.reduce((s, g) => s + g.score[0] + g.score[1], 0) / (2 * allGames.length),
  champion,
  runnerUp: series.find((s) => s.round === 10)!.loser,
  regionChamps,
  lbLeaders,
  lbChampion,
  grandFinal: { week: GRAND_FINAL_WEEK, dates: `${iso(weekStart(GRAND_FINAL_WEEK))} to ${iso(weekStart(GRAND_FINAL_WEEK) + 6 * DAY)}`, bracketChampion: champion, leaderboardChampion: lbChampion, winner: grandChampion },
};

// Each school's whole bracket season (weeks 1-30) on the same scale, to
// check whether the weekly games reward the better alumni.
const season = new Map<number, { opsPlus: number | null; fipMinus: number | null; pa: number; ip: number; players: number; proPlayers: number; activeDays: number }>();
for (const s of schools.values()) {
  const b: LevelBuckets = new Map();
  const players = new Set<string>(), pros = new Set<string>();
  let activeDays = 0;
  for (let w = 1; w <= 30; w++) for (const d of weekDates(w)) {
    const list = daily.get(s.hsid)?.get(d) || [];
    if (list.length) activeDays++;
    for (const pd of list) {
      addToBuckets(b, pd.level, pd.bat, pd.pit);
      players.add(pd.playerid);
      if (!pd.simulated) pros.add(pd.playerid);
    }
  }
  let pa = 0, outs = 0;
  for (const v of b.values()) { pa += v.bat.pa; outs += v.pit.outs; }
  season.set(s.hsid, {
    opsPlus: offenseScore(b, baselines, MODE),
    fipMinus: pitchingScore(b, baselines, MODE),
    pa, ip: +(outs / 3).toFixed(1), players: players.size, proPlayers: pros.size, activeDays,
  });
}
const schoolOut = Object.fromEntries([...schools.values()].map((s) => [s.hsid, { ...s, season: season.get(s.hsid) }]));
fs.writeFileSync(
  OUT,
  JSON.stringify({ summary, schools: schoolOut, series, leaderboards: leaderboards.map((l) => l.map((h) => ({ hsid: h, ...board.get(h)! }))), lbBracket, grandFinalGames, lbGamesCount: lbGames.length })
);
const nm = (h: number) => `${schools.get(h)!.name} (R${schools.get(h)!.region} #${schools.get(h)!.seed})`;
console.log(`Mode: ${MODE}, absent: ${ABSENT}, spring training: ${SPRING ? 'counts' : 'no'}`);
console.log(`Lines: ${proBat.length + proPit.length} real, ${simulatedBatLines + simulatedPitLines} simulated`);
console.log(`Champion: ${nm(champion)}; runner-up ${nm(summary.runnerUp)}`);
console.log(`Leaderboard champion (8-team bracket): ${nm(lbChampion)}`);
console.log(`Fantasy World Series: ${nm(grandChampion)} (${grandFinalGames.map((g) => g.score.join('-')).join(', ')}, bracket champion's score first)`);
console.log(`Wrote ${OUT}`);

// ---------------------------------------------------------------------------
// --export <dir>: the data behind the flip-card gallery (/bracket-lab).
//   index.json          - schools, and every series and game with its line
//                         score (rounds 1-10, the leaderboard tournament and
//                         the Fantasy World Series)
//   lb.json             - the eliminated schools' weekly regional games
//                         (line scores + region), for the leaderboards
//   d-<round>-<region>.json, d-lb-<week>-<region>.json, d-lbt.json,
//   d-gf.json           - each game's box score:
//                         both schools' alumni with their weekly lines,
//                         OPS+ and FIP-, the day-by-day team numbers behind
//                         every run, and the clubs' W-L
// ---------------------------------------------------------------------------
const EXPORT = arg('--export');
if (EXPORT) exportGallery(EXPORT);

function exportGallery(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  const names = new Map(rows('names.psv', '|').map((r) => [r.playerid, r.name]));
  const round1 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v));
  const batArr = (b: BatTotals) => [b.pa, b.ab, b.h, b.d2, b.d3, b.hr, b.bb, b.hbp, b.sf];
  const pitArr = (p: PitTotals) => [p.outs, p.hr, p.bb, p.hbp, p.so];

  function side(hsid: number, week: number) {
    const byPlayer = new Map<string, { levels: Set<string>; sim: boolean; bat: BatTotals | null; pit: PitTotals | null; buckets: LevelBuckets }>();
    for (const d of weekDates(week)) for (const pd of daily.get(hsid)?.get(d) || []) {
      const cur = byPlayer.get(pd.playerid) || { levels: new Set<string>(), sim: pd.simulated, bat: null, pit: null, buckets: new Map() };
      cur.levels.add(pd.level);
      if (pd.bat) cur.bat = cur.bat ? { ...cur.bat, ...Object.fromEntries(Object.keys(pd.bat).map((k) => [k, cur.bat![k as keyof BatTotals] + pd.bat![k as keyof BatTotals]])) } as BatTotals : { ...pd.bat };
      if (pd.pit) cur.pit = cur.pit ? { ...cur.pit, ...Object.fromEntries(Object.keys(pd.pit).map((k) => [k, cur.pit![k as keyof PitTotals] + pd.pit![k as keyof PitTotals]])) } as PitTotals : { ...pd.pit };
      addToBuckets(cur.buckets, pd.level, pd.bat, pd.pit);
      byPlayer.set(pd.playerid, cur);
    }
    const wlOf = playerWL.get(`${hsid}|${week}`) || new Map<string, { w: number; l: number }>();
    const players: unknown[][] = [...byPlayer.entries()].map(([pid, p]) => [
      pid,
      names.get(pid) || `Player ${pid}`,
      [...p.levels].join('/'),
      p.sim ? 1 : 0,
      p.bat && p.bat.pa ? batArr(p.bat) : 0,
      p.pit && p.pit.outs ? pitArr(p.pit) : 0,
      p.bat && p.bat.pa ? round1(offenseScore(p.buckets, baselines, MODE)) : null,
      p.pit && p.pit.outs ? round1(pitchingScore(p.buckets, baselines, MODE)) : null,
      // his club's W-L that week (inning 9); none when he wasn't on a club's roster
      wlOf.has(pid) ? [wlOf.get(pid)!.w, wlOf.get(pid)!.l] : null,
    ]);
    // Alumni on a roster who didn't play still count their club's W-L.
    for (const [pid, wl] of wlOf) {
      if (byPlayer.has(pid)) continue;
      players.push([pid, names.get(pid) || `Player ${pid}`, stintLevel.get(pid) || '', 0, 0, 0, null, null, [wl.w, wl.l]]);
    }
    const wl = weeklyWL.get(`${hsid}|${week}`) || { w: 0, l: 0 };
    return { p: players, wl: [wl.w, wl.l] };
  }

  let gid = 0;
  const details = new Map<string, Record<number, unknown>>();

  // Alumni of the Week: each school's player who beat league average by the
  // most that week - a hitter's OPS+ over 100 (8+ plate appearances) or a
  // pitcher's FIP- under 100 (3+ innings). Ties go to more PA / innings.
  // stars-<region>.json: hsid -> week -> [name, level, 'bat' | 'pit', OPS+ or FIP-, simulated, playerid].
  const stars = new Map<number, Record<number, Record<number, unknown[]>>>();
  function award(hsid: number, week: number, players: ReturnType<typeof side>['p']) {
    let best: { edge: number; vol: number; row: unknown[] } | null = null;
    for (const p of players) {
      const [pid, name, level, sim, bat, pit, opsPlus, fipMinus] = p as [string, string, string, number, number[] | 0, number[] | 0, number | null, number | null];
      const cands: { edge: number; vol: number; row: unknown[] }[] = [];
      if (bat && bat[0] >= 8 && opsPlus !== null) cands.push({ edge: opsPlus - 100, vol: bat[0], row: [name, level, 'bat', opsPlus, sim, pid] });
      if (pit && pit[0] >= 9 && fipMinus !== null) cands.push({ edge: 100 - fipMinus, vol: pit[0], row: [name, level, 'pit', fipMinus, sim, pid] });
      for (const c of cands) if (c.edge > 0 && (!best || c.edge > best.edge || (c.edge === best.edge && c.vol > best.vol))) best = c;
    }
    if (!best) return;
    const region = schools.get(hsid)!.region;
    if (!stars.has(region)) stars.set(region, {});
    const r = stars.get(region)!;
    (r[hsid] ||= {})[week] = best.row;
  }
  function gameOut(file: string, g: GameRow) {
    const id = ++gid;
    const r = playGame(sideWeek(g.home, g.week), sideWeek(g.away, g.week), baselines, RULES, g.winner === null);
    const days = r.innings.slice(0, 8).map((i) => [round1(i.homeOffense), round1(i.awayOffense), round1(i.homePitching), round1(i.awayPitching)]);
    if (!details.has(file)) details.set(file, {});
    const hs = side(g.home, g.week), as = side(g.away, g.week);
    details.get(file)![id] = { d: days, h: hs, a: as };
    award(g.home, g.week, hs.p);
    award(g.away, g.week, as.p);
    // 'players-2' = the tie went to the #2 hitters/pitchers
    return [id, g.week, g.home, g.away, g.decidedBy === 'players' ? `players-${g.tieRank}` : g.decidedBy, g.innings.flat(), g.winner];
  }

  const ROUND_NAMES = Array.from({ length: 10 }, (_, i) => `Round ${i + 1}`);
  const rounds = ROUND_NAMES.map((name, i) => {
    const round = i + 1;
    return {
      r: round,
      name,
      start: iso(weekStart((round - 1) * 3 + 1)),
      end: iso(weekStart(round * 3) + 6 * DAY),
      series: series.filter((s) => s.round === round).map((s) => {
        const file = `d-${round}-${s.region ?? 0}`;
        return [s.region ?? 0, s.home, s.away, s.homeSeed, s.awaySeed, s.winner, s.wins, s.games.map((g) => gameOut(file, g))];
      }),
    };
  });
  const lbt = lbBracket.map((g) => ({ seeds: [lbSeed.get(g.home), lbSeed.get(g.away)], game: gameOut('d-lbt', g) }));
  // The postseason schools' 2026 alumni (a line through week 30, or on a
  // club's roster by then), best level first: each nominates one fan for the
  // World Series Tickets Raffle.
  const LEVELS = ['MLB', 'TRIPLE-A', 'DOUBLE-A', 'HIGH-A', 'LOW-A', 'ROOKIE', 'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'JUCO'];
  const seasonEnd = iso(weekStart(BRACKET_LAST_WEEK) + 6 * DAY);
  const stintRows = rows('stints.csv', ',');
  function alumniOf(hsid: number) {
    const last = new Map<string, { date: string; level: string }>();
    for (const [date, pds] of daily.get(hsid) || []) {
      if (date > seasonEnd) continue;
      for (const pd of pds) {
        const cur = last.get(pd.playerid);
        if (!cur || date > cur.date) last.set(pd.playerid, { date, level: levelOf(pd.level) });
      }
    }
    for (const r of stintRows) if (num(r.hsid) === hsid && r.start <= seasonEnd && !last.has(r.playerid)) last.set(r.playerid, { date: r.start, level: r.level });
    const rank = (l: string) => (LEVELS.indexOf(l) + 1 || LEVELS.length + 1);
    return [...last.entries()]
      .map(([pid, v]) => [names.get(pid) || `Player ${pid}`, v.level === 'SPRING' ? 'MLB' : v.level])
      .sort((x, y) => rank(x[1]) - rank(y[1]) || x[0].localeCompare(y[0]));
  }
  const alumni = Object.fromEntries([champion, ...lbLeaders].map((h) => [h, alumniOf(h)]));
  const gf = grandFinalGames.map((g) => gameOut('d-gf', g));
  // Eliminated schools' weekly regional games (+ region), for the leaderboards.
  const lb = lbGames.map((g) => {
    const region = schools.get(g.home)!.region;
    return [...gameOut(`d-lb-${g.week}-${region}`, g), region];
  });

  const index = {
    season: 2026,
    rules: { mode: MODE, absent: ABSENT, spring: SPRING },
    weeks: Array.from({ length: GRAND_FINAL_WEEK },(_, i) => [iso(weekStart(i + 1)), iso(weekStart(i + 1) + 6 * DAY)]),
    schools: Object.fromEntries([...schools.values()].map((s) => [s.hsid, [s.name, s.region, s.seed]])),
    rounds,
    lbt,
    gf,
    champion,
    // The Season Championship Tournament field in seed order, announced after week 30.
    lbLeaders,
    // The postseason schools' alumni, for the raffle fan cards.
    alumni,
    lbChampion,
    grandChampion,
  };
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(dir, 'lb.json'), JSON.stringify({ games: lb }));
  for (const [file, data] of details) fs.writeFileSync(path.join(dir, `${file}.json`), JSON.stringify(data));
  for (const [region, data] of stars) fs.writeFileSync(path.join(dir, `stars-${region}.json`), JSON.stringify(data));
  console.log(`Exported ${gid} games to ${dir} (${details.size} box-score files)`);
}
