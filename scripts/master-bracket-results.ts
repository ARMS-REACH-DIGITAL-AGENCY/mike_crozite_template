// The bracket results job: scores every started game of a fantasy season
// with the bracket engine - the scoreboard's own code (liveSeason.ts
// scoreLive) on the scoreboard's own data (/api/bracket/live) - and writes
// the results into master_bracket, so the school pages, the newsletters and
// the Monday email all read one stored answer.
//
//   - Each started game gets its innings, score, status and stat-drawer box.
//   - A game is final at 4 a.m. Arizona the Monday after its week; it's then
//     locked. If a later run scores a locked final differently (a stat
//     correction), the stored result stays and the difference goes on Pete's
//     needs-decision list.
//   - A game tied after every tiebreaker is decided by the commissioner's
//     automatic rules (lib/bracket/autoRuling.ts, Pete, Oct 27), unless a
//     ruling recorded in commissioner_rulings says otherwise. (Before those
//     rules it waited as 'awaiting_commissioner' on the needs-decision list.)
//   - Once a series is decided its winner fills the next round's slot. Home is
//     the better (lower) original seed; two equal seeds go on the
//     needs-decision list rather than being guessed.
//   - 2027, Rounds 8-10 (Pete, Oct 28): the 8 regional bracket winners play
//     each other all nine weeks, reseeded 1-8 by regional seed (a tie in seed
//     goes to more runs through Round 7). Round 8: series 1 = 1 v 8, 2 = 4 v 5,
//     3 = 3 v 6, 4 = 2 v 7. Round 9: 5 = the winners of 1 and 2, 6 = winners
//     of 3 and 4, 7 = losers of 1 and 2, 8 = losers of 3 and 4. Round 10:
//     9 = winners of 5 and 6 (the Main Bracket winner), 10 = loser of 5 v
//     winner of 8, 11 = loser of 6 v winner of 7, 12 = losers of 7 and 8.
//     Rounds 8-10 show the new seeds, the better one at home.
//   - Every school plays every week (Pete, Oct 28). Once every series of a
//     round is decided, the schools out of the regional brackets so far are
//     paired for the next round's three weeks (Rounds 8-10: all 1,016 but
//     the 8 regional winners): across regions in 2027 (inside its own bracket
//     in a test season), real-life teammates' high schools first (each
//     alumnus's latest pro or college team in player_team_stints, by
//     teamid), then a draw fixed by the round; never two schools that have
//     already played each other (a draw that had one isn't stored; it goes
//     on the needs-decision list). Publicly they are "randomly selected";
//     the method is never published.
//   - Total Runs: after Week 30, each region's leader in runs over the 30
//     weeks (then run differential, wins, seed; total_runs_standings) plays
//     Weeks 31-33, seeded 1-8 the same way; the Main Bracket winner has byes
//     those weeks and its region sends the next school. Week 34: the Main
//     Bracket winner (home) v the Total Runs winner.
//   - Held stat lines are landed again first (stat_lines_reland_held), so a
//     team or level Pete adds takes effect on its own.
//
//   DATABASE_URL=... npx --yes tsx scripts/master-bracket-results.ts [--season <key>] [--asof YYYY-MM-DD] [--dry-run]
//     Every season live on the bracket's day (or the Monday after its last
//     week) unless --season. Live data from
//     ${BRACKET_LIVE_BASE_URL:-https://5004.yatstats.com}/api/bracket/live.
//     On the server: /api/cron/bracket-results runs the same thing.
//
//   npx --yes tsx scripts/master-bracket-results.ts --offline <dir> --season <key> --asof YYYY-MM-DD [--no-box]
//     No database: reads <dir>/season.json, rows.json, rulings.json and
//     live.json (the rows as the database returns them, the live data as the
//     API does), and teams.json if it's there ({ playerid: teamid }, each
//     alumnus's latest team), and prints the SQL it would run.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { bracketOrder, pairEliminated } from '@/lib/bracket/engine';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
import { COMMISSIONER_DECISIONS } from '@/lib/bracket/commissioner';
import { scoreLive, type Live } from '@/components/bracket/liveSeason';
import { tieNote, type GameBox, type GameRow, type Index, type SeriesRow } from '@/components/bracket/gallery';

type Season = { season_key: string; is_test: boolean; opening_day: string; last_day: string; weeks: number; regions: number; schools_per_region: number };
type Row = {
  stage: string; region: number; round: number; round_name?: string; series_no: number; game_no: number; game_id: number; week: number;
  home_hsid: number | null; away_hsid: number | null; home_seed: number | null; away_seed: number | null;
  home_school_name: string | null; away_school_name: string | null; status: string;
  innings: number[] | null; home_runs?: number | null; away_runs?: number | null;
  winner_hsid: number | null; decided_by: string | null; locked_at: string | null;
  box_missing?: boolean;
  // A week in progress: when the job last scored it, and its stored drawer.
  computed_at?: string | null; box_in_progress?: GameBox | null;
};
type Ruling = { region: number; week: number; home_hsid: number; away_hsid: number; winner_hsid: number };
type Result = {
  region: number; game_id: number; status: string; innings: number[]; home_runs: number; away_runs: number;
  winner_hsid: number | null; decided_by: string | null; decided_note: string | null; box: GameBox | null; lock: boolean;
};
type Fill = { region: number; game_id: number; home_hsid: number; away_hsid: number; home_seed: number | null; away_seed: number | null; home_school_name: string | null; away_school_name: string | null };
type Decision = { kind: string; ref: string; summary: string; details: unknown };
type BoxFill = { region: number; game_id: number; box: GameBox };
// Each school's alumni by real-life team: hsid -> teamid -> how many.
export type Clubs = Map<number, Map<string, number>>;

const iso =(t: number) => new Date(t).toISOString().slice(0, 10);
// The bracket's day: the date in Arizona (UTC-7, no DST), turning over at 4 a.m.
export const bracketDay = (now = Date.now()) => iso(now - 11 * 3600000);
const daysFrom = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

// The live data for a set of schools, asked 64 at a time (the route's limit)
// and merged.
async function fetchLive(base: string, start: string, weeks: number, hsids: number[]): Promise<Live> {
  const out: Live = { asOf: '', roster: {}, lines: [], clubs: {}, games: {}, fans: {} } as unknown as Live;
  for (let i = 0; i < hsids.length; i += 64) {
    const url = `${base}/api/bracket/live?start=${start}&weeks=${weeks}&h=${hsids.slice(i, i + 64).join(',')}`;
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    mergeLive(out, await res.json() as Live);
  }
  return out;
}
function mergeLive(into: Live, part: Live) {
  into.asOf = into.asOf || part.asOf;
  Object.assign(into.roster, part.roster);
  into.lines.push(...part.lines);
  Object.assign(into.fans || (into.fans = {}), part.fans || {});
  for (const key of ['clubs', 'games'] as const) {
    const target = (into[key] || (into[key] = {})) as Record<string, unknown[][]>;
    for (const [club, list] of Object.entries((part[key] || {}) as Record<string, unknown[][]>)) {
      const have = new Set((target[club] || []).map((g) => String(g[1])));
      target[club] = [...(target[club] || []), ...list.filter((g) => !have.has(String(g[1])))];
    }
  }
}

// The scoreboard's index for a set of rows: the season's weeks, its
// schools and every series whose two schools are known - the bracket's, the
// knocked-out schools' (three games, like a bracket series) and Weeks 31-34
// (one game each). Every game is scored the same way.
function buildIndex(season: Season, rows: Row[]): Index {
  const weeks = tournamentWeeks(season.opening_day, season.weeks);
  const schools: Index['schools'] = {};
  const rounds = new Map<string, SeriesRow[]>();
  const series = new Map<string, SeriesRow>();
  const sorted = [...rows].sort((a, b) => a.round - b.round || a.region - b.region || a.series_no - b.series_no || a.game_no - b.game_no);
  for (const r of sorted) {
    if (r.home_hsid == null || r.away_hsid == null) continue;
    if (r.stage === 'bracket') {
      schools[r.home_hsid] ||= [r.home_school_name || String(r.home_hsid), r.region, r.home_seed ?? 0];
      schools[r.away_hsid] ||= [r.away_school_name || String(r.away_hsid), r.region, r.away_seed ?? 0];
    }
    const key = `${r.stage}:${r.round}:${r.region}:${r.series_no}`;
    let s = series.get(key);
    if (!s) {
      s = [r.region, r.home_hsid, r.away_hsid, r.home_seed ?? 0, r.away_seed ?? 0, 0, [0, 0], []];
      series.set(key, s);
      const rk = `${r.stage}:${r.round}`;
      (rounds.get(rk) || rounds.set(rk, []).get(rk)!).push(s);
    }
    s[7].push([r.game_id, r.week, r.home_hsid, r.away_hsid, '', [], null] as GameRow);
  }
  return {
    season: Number(season.opening_day.slice(0, 4)), weeks, schools,
    rounds: [...rounds.entries()].map(([k, list]) => {
      const r = Number(k.split(':')[1]);
      const gameWeeks = list.flatMap((s) => s[7].map((g) => g[1]));
      return {
        r, name: k.startsWith('bracket:') ? `Round ${r}` : k, series: list,
        start: weeks[Math.min(...gameWeeks) - 1]?.[0] || '', end: weeks[Math.max(...gameWeeks) - 1]?.[1] || '',
      };
    }),
    lbt: [], gf: [], champion: 0, lbLeaders: [], lbChampion: 0,
  } as unknown as Index;
}

const ref = (season: string, r: { region: number; week: number; home_hsid: number | null; away_hsid: number | null }) =>
  `${season}:${r.region}:${r.week}:${r.home_hsid}:${r.away_hsid}`;

// A week in progress: a day that had already closed (4 a.m. Arizona the
// morning after) when the job last scored the game is frozen - its inning and
// its drawer stay as stored, whatever stats arrive later (Pete, Oct 27). A
// day closed since then is scored now, once, and frozen from then on.
function freezeClosedDays(res: Result, row: Row, weekStart: string) {
  const stored = (row.innings || []).map(Number);
  if (!row.computed_at || stored.length < 14) return;
  const closed = Math.max(0, Math.min(7, daysFrom(weekStart, bracketDay(Date.parse(row.computed_at)))));
  for (let d = 0; d < closed; d++) [res.innings[2 * d], res.innings[2 * d + 1]] = [stored[2 * d], stored[2 * d + 1]];
  res.home_runs = res.innings.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
  res.away_runs = res.innings.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0);
  const was = row.box_in_progress;
  if (!res.box || !was) return;
  for (let d = 0; d < closed; d++) {
    if (was.d?.[d]) res.box.d[d] = was.d[d];
    if (was.f?.[d] && res.box.f) res.box.f[d] = was.f[d];
    if (was.h.days?.[d] && res.box.h.days) res.box.h.days[d] = was.h.days[d];
    if (was.a.days?.[d] && res.box.a.days) res.box.a.days[d] = was.a.days[d];
  }
}

// Score one group of rows (a test bracket, or a whole 2027 season) and say
// what to write.
function scoreGroup(season: Season, rows: Row[], rulings: Ruling[], live: Live, asof: string, withBox: boolean) {
  const idx = buildIndex(season, rows);
  for (const k of Object.keys(COMMISSIONER_DECISIONS)) delete COMMISSIONER_DECISIONS[k];
  for (const r of rulings) COMMISSIONER_DECISIONS[`${r.week}:${r.home_hsid}:${r.away_hsid}`] = r.winner_hsid;
  const boxes = scoreLive(idx, live, asof);

  const byId = new Map(rows.map((r) => [r.game_id, r]));
  const results: Result[] = [];
  const decisions: Decision[] = [];
  const boxFills: BoxFill[] = [];
  for (const round of idx.rounds) for (const s of round.series as SeriesRow[]) for (const g of s[7]) {
    const row = byId.get(g[0])!;
    const [ws] = idx.weeks[g[1] - 1] || [];
    if (!ws || ws > asof) continue; // not started
    const innings = g[5];
    const decided = g[4];
    const status = !decided ? 'in_progress' : decided === 'commissioner-pending' ? 'awaiting_commissioner' : 'final';
    const res: Result = {
      region: row.region, game_id: g[0], status, innings,
      home_runs: innings.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0),
      away_runs: innings.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0),
      winner_hsid: status === 'final' ? g[6] : null,
      decided_by: decided || null,
      decided_note: decided && decided !== 'runs' ? tieNote(decided) || null : null,
      box: withBox ? boxes[String(g[0])] || null : null,
      lock: status === 'final',
    };
    if (row.locked_at) {
      // A locked final whose week isn't over as of asof: a rerun of an
      // earlier day. Nothing to compare.
      if (status === 'in_progress') continue;
      const was = { status: row.status, innings: (row.innings || []).map(Number), winner: num(row.winner_hsid), by: row.decided_by };
      const now = { status: res.status, innings: res.innings, winner: res.winner_hsid, by: res.decided_by };
      if (JSON.stringify(was) !== JSON.stringify(now)) {
        decisions.push({
          kind: 'locked_final_changed', ref: `${season.season_key}:${row.region}:${row.game_id}`,
          summary: `${row.away_school_name} at ${row.home_school_name} (week ${row.week}) was locked final; the stats now score it differently. The locked result stands until you decide.`,
          details: { locked: was, now },
        });
      } else if (row.box_missing && res.box) {
        // A final locked without its stat drawer gets it once, the result
        // untouched (the newsletters print the drawer's lines).
        boxFills.push({ region: row.region, game_id: g[0], box: res.box });
      }
      continue;
    }
    if (status === 'in_progress') freezeClosedDays(res, row, ws);
    if (status === 'awaiting_commissioner') {
      decisions.push({
        kind: 'commissioner_ruling', ref: ref(season.season_key, row),
        summary: `${row.away_school_name} at ${row.home_school_name} (week ${row.week}, ${season.is_test ? `bracket ${row.region}` : `region ${row.region}`}) is tied after every tiebreaker: it needs the commissioner's ruling.`,
        details: { innings, home_runs: res.home_runs, away_runs: res.away_runs },
      });
    }
    results.push(res);
  }
  return { results, decisions, boxFills };
}

// 2027, Rounds 8-10 (Pete, Oct 28): the 8 regional bracket winners play each
// other all nine weeks, reseeded 1-8 by their regional seeds; a tie in seed
// goes to more runs through Round 7. tie: the first of two still even.
export function reseed<T extends { seed: number | null; runs: number }>(winners: T[]) {
  const ranked = [...winners].sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0) || b.runs - a.runs);
  const tie = ranked.findIndex((s, i) => i > 0 && s.seed === ranked[i - 1].seed && s.runs === ranked[i - 1].runs);
  return { ranked, tie };
}
// Round 8, series 1-4, by the new seeds.
export const ROUND_8: [home: number, away: number][] = [[1, 8], [4, 5], [3, 6], [2, 7]];
// Rounds 9 and 10: each series' two schools, as the winner (W) or loser (L)
// of an earlier series.
type From = [round: number, series: number, side: 'W' | 'L'];
export const ROUNDS_9_10: [round: number, series: number, a: From, b: From][] = [
  [9, 5, [8, 1, 'W'], [8, 2, 'W']], // Bracket Semi 1
  [9, 6, [8, 3, 'W'], [8, 4, 'W']], // Bracket Semi 2
  [9, 7, [8, 1, 'L'], [8, 2, 'L']], // Bracket Semi 1 Loser
  [9, 8, [8, 3, 'L'], [8, 4, 'L']], // Bracket Semi 2 Loser
  [10, 9, [9, 5, 'W'], [9, 6, 'W']], // the Bracket Championship: the Main Bracket winner
  [10, 10, [9, 5, 'L'], [9, 8, 'W']],
  [10, 11, [9, 6, 'L'], [9, 7, 'W']],
  [10, 12, [9, 7, 'L'], [9, 8, 'L']],
];
export const CHAMPIONSHIP_SERIES = 9;

// How many of two schools' alumni are real-life teammates: for each team,
// one school's alumni on it times the other's.
export const teammates = (clubs: Clubs) => (a: number, b: number) => {
  const x = clubs.get(a), y = clubs.get(b);
  if (!x || !y) return 0;
  let n = 0;
  for (const [team, k] of x) n += k * (y.get(team) || 0);
  return n;
};

// Each school's alumni by team, from each alumnus's latest team (teamid).
export function clubsOf(live: Live, teamOf: Map<string, string>): Clubs {
  const clubs: Clubs = new Map();
  for (const [h, players] of Object.entries(live.roster || {})) {
    const mine = new Map<string, number>();
    for (const p of players) {
      const team = teamOf.get(p[0]);
      if (team) mine.set(team, (mine.get(team) || 0) + 1);
    }
    if (mine.size) clubs.set(Number(h), mine);
  }
  return clubs;
}

export const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

// A round's knocked-out pairs: real-life teammates' schools first, then the
// draw (fixed by seed). Two schools that have already played each other
// (met) are never paired again: a pair that met swaps partners with a drawn
// pair (keeping the teammates' pairs), else with any pair; if one were still
// left, any pairing without a rematch is searched for, in the draw's order.
// One always exists: a school out of the bracket has played at most one
// school per round before (9 before Round 10), and every pool is big enough
// that each school has more than half the pool left to play - 2027's pools
// are 512 or more; a 16-school test bracket's are 8, 12 and 14.
export function drawPairs(pool: number[], seed: string, clubs: Clubs, met: Set<string>): [number, number][] {
  const mates = teammates(clubs);
  const fresh = (a: number, b: number) => !met.has(pairKey(a, b));
  const score = (a: number, b: number) => (fresh(a, b) ? mates(a, b) : 0);
  const { pairs } = pairEliminated(pool, seed, score);
  const swap = (i: number, with_: number[]) => {
    const [a, b] = pairs[i];
    for (const j of with_) {
      if (j === i) continue;
      const [c, d] = pairs[j];
      if (fresh(a, c) && fresh(b, d)) { pairs[i] = [a, c]; pairs[j] = [b, d]; return true; }
      if (fresh(a, d) && fresh(b, c)) { pairs[i] = [a, d]; pairs[j] = [b, c]; return true; }
    }
    return false;
  };
  const all = pairs.map((_, i) => i);
  const drawn = all.filter((i) => score(...pairs[i]) === 0);
  for (const i of all) if (!fresh(...pairs[i]) && !swap(i, drawn)) swap(i, all);
  if (pairs.every(([a, b]) => fresh(a, b))) return pairs;
  return pairWithoutRematch(pairs.flat(), fresh) ?? pairs;
}

// Any pairing of the schools (in this order) with no two that met: each
// school in turn takes the first school after it it hasn't played, backing
// up when the rest can't be paired.
function pairWithoutRematch(order: number[], fresh: (a: number, b: number) => boolean): [number, number][] | null {
  const out: [number, number][] = [];
  const used = new Set<number>();
  const next = (): boolean => {
    const a = order.find((h) => !used.has(h));
    if (a === undefined) return true;
    used.add(a);
    for (const b of order) {
      if (used.has(b) || !fresh(a, b)) continue;
      used.add(b);
      out.push([a, b]);
      if (next()) return true;
      used.delete(b);
      out.pop();
    }
    used.delete(a);
    return false;
  };
  return next() ? out : null;
}

type Side = { hsid: number; seed: number | null; name: string | null };

// Fill every empty slot that the results so far decide (this run's results
// applied first): the bracket's next rounds, the knocked-out schools' pairs
// and Weeks 31-34. A slot already filled is checked, never changed.
function fillSlots(season: Season, rows: Row[], results: Result[], clubs: Clubs) {
  const regionRounds = Math.log2(season.schools_per_region);
  const lastRound = season.is_test ? regionRounds : regionRounds + Math.log2(season.regions);
  const now = new Map(results.map((r) => [`${r.region}:${r.game_id}`, r]));
  const state = (r: Row) => {
    const x = now.get(`${r.region}:${r.game_id}`);
    return x
      ? { status: x.status, winner: x.winner_hsid, home: x.home_runs, away: x.away_runs }
      : { status: r.status, winner: num(r.winner_hsid), home: num(r.home_runs) ?? 0, away: num(r.away_runs) ?? 0 };
  };
  type Series = { stage: string; region: number; round: number; series_no: number; games: Row[] };
  const series = new Map<string, Series>();
  for (const r of [...rows].sort((a, b) => a.game_no - b.game_no)) {
    const k = `${r.stage}:${r.round}:${r.region}:${r.series_no}`;
    (series.get(k) || series.set(k, { stage: r.stage, region: r.region, round: r.round, series_no: r.series_no, games: [] }).get(k)!).games.push(r);
  }
  const stageRound = (stage: string, round: number, region?: number) => [...series.values()]
    .filter((s) => s.stage === stage && s.round === round && (region === undefined || s.region === region))
    .sort((a, b) => a.region - b.region || a.series_no - b.series_no);
  // Each school's own region and original seed: its Round 1 game.
  const school = new Map<number, Side & { region: number }>();
  for (const r of rows) {
    if (r.stage !== 'bracket' || r.round !== 1) continue;
    for (const [h, seed, name] of [[r.home_hsid, r.home_seed, r.home_school_name], [r.away_hsid, r.away_seed, r.away_school_name]] as const) {
      if (h != null) school.set(Number(h), { hsid: Number(h), seed: num(seed), name, region: r.region });
    }
  }
  const sideOf = (s: Series, home: boolean): Side => {
    const g0 = s.games[0];
    return home ? { hsid: num(g0.home_hsid)!, seed: num(g0.home_seed), name: g0.home_school_name } : { hsid: num(g0.away_hsid)!, seed: num(g0.away_seed), name: g0.away_school_name };
  };
  // A series' winner: 2 wins (a single game: its winner).
  const winnerOf = (s: Series): Side | null => {
    const g0 = s.games[0];
    if (g0.home_hsid == null || g0.away_hsid == null) return null;
    let h = 0, a = 0;
    for (const g of s.games) {
      const st = state(g);
      if (st.status !== 'final') continue;
      if (st.winner === num(g0.home_hsid)) h++;
      else if (st.winner === num(g0.away_hsid)) a++;
    }
    const need = s.games.length === 1 ? 1 : 2;
    return h >= need ? sideOf(s, true) : a >= need ? sideOf(s, false) : null;
  };
  const loserOf = (s: Series) => {
    const w = winnerOf(s);
    return w ? sideOf(s, w.hsid !== num(s.games[0].home_hsid)) : null;
  };

  const fills: Fill[] = [];
  const decisions: Decision[] = [];
  const refOf = (s: Series) => `${season.season_key}:${s.stage}:${s.round}:${s.region}:${s.series_no}`;
  // Put two schools in a series' slots, or check the ones already there.
  const place = (target: Series, home: Side, away: Side) => {
    const g0 = target.games[0];
    if (g0.home_hsid != null) {
      const have = new Set([num(g0.home_hsid), num(g0.away_hsid)]);
      if (!have.has(home.hsid) || !have.has(away.hsid)) {
        decisions.push({
          kind: 'pairing_changed', ref: refOf(target),
          summary: `${g0.round_name ?? `Round ${target.round}`} series ${target.series_no} already has ${g0.away_school_name} at ${g0.home_school_name}, but the results now send ${home.name} and ${away.name}.`,
          details: { stored: [g0.home_hsid, g0.away_hsid], now: [home.hsid, away.hsid] },
        });
      }
      return;
    }
    for (const g of target.games) {
      fills.push({ region: g.region, game_id: g.game_id, home_hsid: home.hsid, away_hsid: away.hsid, home_seed: home.seed, away_seed: away.seed, home_school_name: home.name, away_school_name: away.name });
    }
  };
  // Runs, runs allowed and wins over the weeks every school plays (bracket
  // and knocked-out games), final games only, through a week.
  const totals = (lastWeek: number) => {
    const t = new Map<number, { rf: number; ra: number; w: number }>();
    for (const r of rows) {
      if ((r.stage !== 'bracket' && r.stage !== 'total_runs') || r.week > lastWeek || r.home_hsid == null) continue;
      const st = state(r);
      if (st.status !== 'final') continue;
      for (const [h, rf, ra] of [[num(r.home_hsid)!, st.home, st.away], [num(r.away_hsid)!, st.away, st.home]]) {
        const cur = t.get(h) || { rf: 0, ra: 0, w: 0 };
        cur.rf += rf; cur.ra += ra; cur.w += st.winner === h ? 1 : 0;
        t.set(h, cur);
      }
    }
    return t;
  };

  // The bracket inside a region (Rounds 2-7; every round of a test bracket):
  // each decided series sends its winner on. Where a series' winner goes:
  // [round, region, series_no, first or second].
  const next = (s: Series): [number, number, number, 0 | 1] | null =>
    s.round < regionRounds ? [s.round + 1, s.region, Math.ceil(s.series_no / 2), (s.series_no % 2 ? 0 : 1)] : null;
  const feeders = new Map<string, [Side | null, Side | null]>();
  for (const s of series.values()) {
    if (s.stage !== 'bracket') continue;
    const to = next(s);
    if (!to) continue;
    const k = `bracket:${to[0]}:${to[1]}:${to[2]}`;
    const pair = feeders.get(k) || [null, null];
    pair[to[3]] = winnerOf(s);
    feeders.set(k, pair);
  }
  for (const [k, [first, second]] of feeders) {
    const target = series.get(k);
    if (!target || !first || !second) continue;
    if (target.games[0].home_hsid == null && first.seed === second.seed) {
      decisions.push({
        kind: 'home_team', ref: refOf(target),
        summary: `${first.name} and ${second.name} are both seed ${first.seed}: who is home in Round ${target.round}?`,
        details: { first, second },
      });
      continue;
    }
    const [home, away] = (first.seed ?? 0) < (second.seed ?? 0) ? [first, second] : [second, first];
    place(target, home, away);
  }

  // 2027, Rounds 8-10: the 8 regional bracket winners, reseeded (Round 8),
  // then each series' winner or loser on to its next series. Rounds 8-10
  // show the new seeds 1-8; the better one is at home.
  const national = !season.is_test && season.regions === 8 && regionRounds === 7;
  const nationalSeries = (round: number, no: number) => series.get(`bracket:${round}:0:${no}`);
  if (national) {
    const winners = stageRound('bracket', regionRounds).map(winnerOf);
    if (winners.length === 8 && winners.every(Boolean)) {
      const t = totals(regionRounds * 3);
      const { ranked, tie } = reseed((winners as Side[]).map((s) => ({ ...s, runs: t.get(s.hsid)?.rf ?? 0 })));
      if (tie > 0) {
        decisions.push({
          kind: 'reseed_tie', ref: `${season.season_key}:reseed:8`,
          summary: `${ranked[tie - 1].name} and ${ranked[tie].name} are both seed ${ranked[tie].seed} with ${ranked[tie].runs} runs through Round 7: who is seeded higher for Rounds 8-10?`,
          details: { ranked },
        });
      } else {
        const as = (seed: number): Side => ({ hsid: ranked[seed - 1].hsid, seed, name: ranked[seed - 1].name });
        ROUND_8.forEach(([h, a], i) => {
          const target = nationalSeries(8, i + 1);
          if (target) place(target, as(h), as(a));
        });
      }
    }
    for (const [round, no, a, b] of ROUNDS_9_10) {
      const target = nationalSeries(round, no);
      const pick = ([r, n, side]: From) => {
        const s = nationalSeries(r, n);
        return s ? (side === 'W' ? winnerOf(s) : loserOf(s)) : null;
      };
      const [x, y] = [pick(a), pick(b)];
      if (!target || !x || !y) continue;
      const [home, away] = (x.seed ?? 0) < (y.seed ?? 0) ? [x, y] : [y, x];
      place(target, home, away);
    }
  }

  // The knocked-out schools: once every bracket series before a round is
  // decided, every school out of the regional brackets so far is paired for
  // that round (in 2027 the 8 regional winners never are). Each test bracket
  // pairs its own; 2027 pairs them nationally (region 0).
  const met = new Set(rows.filter((r) => r.home_hsid != null && r.away_hsid != null).map((r) => pairKey(num(r.home_hsid)!, num(r.away_hsid)!)));
  for (const f of fills) met.add(pairKey(f.home_hsid, f.away_hsid));
  const groups = season.is_test ? [...new Set(rows.map((r) => r.region))] : [0];
  for (const region of groups) {
    for (let round = 2; round <= lastRound; round++) {
      const slots = stageRound('total_runs', round, region);
      if (!slots.length) continue;
      const before = [...series.values()].filter((s) => s.stage === 'bracket' && s.round < round && (!season.is_test || s.region === region));
      if (before.some((s) => !winnerOf(s))) continue;
      const pool = before.filter((s) => s.round <= regionRounds).map((s) => loserOf(s)!).sort((a, b) => a.hsid - b.hsid);
      const ref = `${season.season_key}:total_runs:${round}:${region}`;
      if (pool.length !== slots.length * 2) {
        decisions.push({ kind: 'total_runs_pool', ref, summary: `Round ${round}: ${pool.length} schools are out of the bracket but there are ${slots.length * 2} places for them.`, details: { pool: pool.map((s) => s.hsid) } });
        continue;
      }
      const filled = slots.filter((s) => s.games[0].home_hsid != null);
      if (filled.length) {
        const stored = new Set(filled.flatMap((s) => [num(s.games[0].home_hsid), num(s.games[0].away_hsid)]));
        if (filled.length < slots.length || pool.some((s) => !stored.has(s.hsid))) {
          decisions.push({ kind: 'pairing_changed', ref, summary: `Round ${round}: the knocked-out schools' pairs on file don't match the schools out of the bracket now.`, details: { stored: [...stored], now: pool.map((s) => s.hsid) } });
        }
        continue;
      }
      // Original seeds for the commissioner's Game 3 rule; the better one at home.
      const seeded = (h: number): Side => ({ hsid: h, seed: school.get(h)?.seed ?? null, name: school.get(h)?.name ?? null });
      const pairs = drawPairs(pool.map((s) => s.hsid), ref, clubs, met);
      const again = pairs.filter(([a, b]) => met.has(pairKey(a, b)));
      if (again.length) {
        // Can't happen (see drawPairs); if it ever did, nothing is stored.
        decisions.push({ kind: 'total_runs_rematch', ref, summary: `Round ${round}: the draw paired ${again.length} schools that already played each other. Nothing was stored for the round.`, details: { again } });
        continue;
      }
      const games = pairs
        .map(([a, b]) => { const [x, y] = [seeded(a), seeded(b)]; return (y.seed ?? 0) < (x.seed ?? 0) ? [y, x] : [x, y]; })
        .sort(([a], [b]) => (school.get(a.hsid)?.region ?? 0) - (school.get(b.hsid)?.region ?? 0) || (a.seed ?? 0) - (b.seed ?? 0) || a.hsid - b.hsid);
      games.forEach(([home, away], i) => {
        place(slots[i], home, away);
        met.add(pairKey(home.hsid, away.hsid));
      });
    }
  }

  // Weeks 31-34 (2027). Once every game of Weeks 1-30 is final: each
  // region's Total Runs leader, seeded 1-8 by the same order, into the slots'
  // seeds (1 v 8, 4 v 5, 2 v 7, 3 v 6); winners go on, the better seed at
  // home; then the Main Bracket winner (home) v the Total Runs winner. The
  // Main Bracket winner has byes in Weeks 31-33 (Pete, Oct 28): if it leads
  // its region's Total Runs, the region's next school goes.
  const sct = (round: number) => stageRound('season_championship', round, 0);
  if (sct(1).length) {
    const regular = rows.filter((r) => r.stage === 'bracket' || r.stage === 'total_runs');
    const final = regular.every((r) => state(r).status === 'final');
    const top = national ? nationalSeries(lastRound, CHAMPIONSHIP_SERIES) : stageRound('bracket', lastRound, 0)[0];
    const champion = top ? winnerOf(top) : null;
    if (final && champion) {
      const t = totals(Math.max(...regular.map((r) => r.week)));
      const order = (a: number, b: number) => {
        const x = t.get(a) || { rf: 0, ra: 0, w: 0 }, y = t.get(b) || { rf: 0, ra: 0, w: 0 };
        return y.rf - x.rf || (y.rf - y.ra) - (x.rf - x.ra) || y.w - x.w || (school.get(a)?.seed ?? 0) - (school.get(b)?.seed ?? 0);
      };
      const leaders: number[] = [];
      for (let region = 1; region <= season.regions; region++) {
        const board = [...school.values()].filter((s) => s.region === region).map((s) => s.hsid).sort(order);
        const leader = board.find((h) => h !== champion.hsid);
        if (leader != null) leaders.push(leader);
      }
      leaders.sort(order);
      const trSide = (seed: number): Side => ({ hsid: leaders[seed - 1], seed, name: school.get(leaders[seed - 1])?.name ?? null });
      if (leaders.length === season.regions) {
        sct(1).forEach((target, i) => {
          const g0 = target.games[0];
          const order8 = bracketOrder(season.regions);
          place(target, trSide(num(g0.home_seed) ?? order8[2 * i]), trSide(num(g0.away_seed) ?? order8[2 * i + 1]));
        });
      }
    }
    for (let round = 2; sct(round).length; round++) {
      const prev = sct(round - 1);
      sct(round).forEach((target, i) => {
        const [a, b] = [winnerOf(prev[2 * i]), winnerOf(prev[2 * i + 1])];
        if (!a || !b) return;
        const [home, away] = (a.seed ?? 0) < (b.seed ?? 0) ? [a, b] : [b, a];
        place(target, home, away);
      });
    }
    const last = [...series.values()].filter((s) => s.stage === 'season_championship').reduce((m, s) => Math.max(m, s.round), 0);
    const trChampion = last ? winnerOf(sct(last)[0]) : null;
    const ws = stageRound('world_series', 1, 0)[0];
    if (ws && champion && trChampion) {
      const orig = (s: Side): Side => ({ ...s, seed: school.get(s.hsid)?.seed ?? null });
      place(ws, orig(champion), orig(trChampion));
    }
  }
  return { fills, decisions };
}

export function computeSeason(season: Season, rows: Row[], rulings: Ruling[], live: Live, asof: string, withBox: boolean, clubs: Clubs = new Map()) {
  // A test bracket is its own field; the 2027 regions share one.
  const groups = season.is_test ? [...new Set(rows.map((r) => r.region))].map((g) => rows.filter((r) => r.region === g)) : [rows];
  const results: Result[] = [];
  const decisions: Decision[] = [];
  const boxFills: BoxFill[] = [];
  for (const group of groups) {
    const region = group[0]?.region;
    const out = scoreGroup(season, group, season.is_test ? rulings.filter((r) => r.region === region) : rulings, live, asof, withBox);
    results.push(...out.results);
    decisions.push(...out.decisions);
    boxFills.push(...out.boxFills);
  }
  const { fills, decisions: more } = fillSlots(season, rows, results, clubs);
  return { results, fills, decisions: [...decisions, ...more], boxFills };
}

const startedWeeks = (season: Season, asof: string) =>
  tournamentWeeks(season.opening_day, season.weeks).filter(([a]) => a <= asof).length;
const fieldOf = (rows: Row[]) =>
  [...new Set(rows.flatMap((r) => (r.stage === 'bracket' ? [r.home_hsid, r.away_hsid] : [])).filter((h): h is number => h != null).map(Number))];

const SQL_RESULTS = `
UPDATE public.master_bracket m SET
  status = x.status, innings = x.innings, home_runs = x.home_runs, away_runs = x.away_runs,
  winner_hsid = x.winner_hsid, decided_by = x.decided_by, decided_note = x.decided_note,
  box = CASE WHEN $3 THEN x.box ELSE m.box END, computed_at = now(),
  locked_at = CASE WHEN x.lock THEN now() ELSE NULL END
FROM jsonb_to_recordset($2::jsonb) AS x(region smallint, game_id integer, status text, innings smallint[], home_runs smallint,
  away_runs smallint, winner_hsid integer, decided_by text, decided_note text, box jsonb, lock boolean)
WHERE m.season_key = $1 AND m.region = x.region AND m.game_id = x.game_id AND m.locked_at IS NULL`;
const SQL_FILLS = `
UPDATE public.master_bracket m SET
  home_hsid = x.home_hsid, away_hsid = x.away_hsid, home_seed = x.home_seed, away_seed = x.away_seed,
  home_school_name = x.home_school_name, away_school_name = x.away_school_name, status = 'scheduled'
FROM jsonb_to_recordset($2::jsonb) AS x(region smallint, game_id integer, home_hsid integer, away_hsid integer,
  home_seed smallint, away_seed smallint, home_school_name text, away_school_name text)
WHERE m.season_key = $1 AND m.region = x.region AND m.game_id = x.game_id AND m.status = 'tbd'`;
const SQL_DECISIONS = `
INSERT INTO public.needs_decision (kind, season_key, ref, summary, details)
SELECT x.kind, $1, x.ref, x.summary, x.details FROM jsonb_to_recordset($2::jsonb) AS x(kind text, ref text, summary text, details jsonb)
ON CONFLICT (kind, ref) DO NOTHING`;
// Only the box of a locked final that has none; run with the lock lifted
// for this purpose (the guard trigger), last in the transaction.
const SQL_BOXES = `
UPDATE public.master_bracket m SET box = x.box
FROM jsonb_to_recordset($2::jsonb) AS x(region smallint, game_id integer, box jsonb)
WHERE m.season_key = $1 AND m.region = x.region AND m.game_id = x.game_id AND m.locked_at IS NOT NULL AND m.box IS NULL`;

// The team list stays complete: every team on MLB's lists for this season
// and next must have a teamid (team_id_map) before it plays, and any stat
// line still held is one item per team on Pete's needs-decision list - never
// one per line.
const MLB_SPORTS = '1,11,12,13,14,16,17,23';
export async function checkTeams(pool: Pool) {
  const year = Number(bracketDay().slice(0, 4));
  const listed = new Map<number, string>();
  for (const season of [year, year + 1]) {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/teams?sportIds=${MLB_SPORTS}&season=${season}&fields=teams,id,name,sport,league`);
    if (!res.ok) { console.log(`MLB team list ${season}: HTTP ${res.status}`); continue; }
    const { teams = [] } = await res.json() as { teams?: { id: number; name: string; sport?: { name?: string }; league?: { name?: string } }[] };
    for (const t of teams) listed.set(t.id, `${t.name} (${[t.sport?.name, t.league?.name].filter(Boolean).join(' / ')})`);
  }
  const { rows: mapped } = await pool.query<{ id: number }>('SELECT DISTINCT mlb_stats_api_id AS id FROM public.team_id_map WHERE mlb_stats_api_id IS NOT NULL');
  const known = new Set(mapped.map((r) => Number(r.id)));
  const decisions: Decision[] = [...listed].filter(([id]) => !known.has(id)).map(([id, name]) => ({
    kind: 'new_mlb_team', ref: `mlb_team:${id}`,
    summary: `MLB lists ${name} (MLB team ${id}), which isn't in the team list yet: add it with its level before it plays.`,
    details: { mlb_team_id: id, name },
  }));
  const { rows: held } = await pool.query<{ hold_reason: string; source_team_id: string | null; team_name: string | null; lines: string; first_game: string; last_game: string }>(
    `SELECT hold_reason, source_team_id, team_name, sum(lines)::text AS lines, min(first_game)::text AS first_game, max(last_game)::text AS last_game
       FROM public.stat_line_holds GROUP BY 1, 2, 3`,
  );
  for (const h of held) {
    decisions.push({
      kind: 'stat_line_hold', ref: `${h.source_team_id || h.team_name}:${h.hold_reason}`,
      summary: `${h.lines} stat lines (${h.first_game} to ${h.last_game}) are held: ${h.hold_reason}`,
      details: h,
    });
  }
  for (const d of decisions) console.log(`  needs decision: ${d.summary}`);
  if (decisions.length && !flag('dry-run')) await pool.query(SQL_DECISIONS, [null, JSON.stringify(decisions)]);
}

// innings go to Postgres as an array literal.
const forDb = (results: Result[]) => results.map((r) => ({ ...r, innings: `{${r.innings.join(',')}}` }));
const dollar = (s: string) => `$j$${s}$j$`;

// Each alumnus's latest real-life team as of a day (pro or college, by our
// teamid), for the knocked-out schools' pairings. Only read while some of
// those pairs are still to be drawn.
async function loadTeams(db: Pool | PoolClient, rows: Row[], live: Live, asof: string) {
  if (!rows.some((r) => r.stage === 'total_runs' && r.status === 'tbd')) return new Map<string, string>();
  const ids = Object.values(live.roster || {}).flat().map((p) => p[0]);
  const { rows: teams } = await db.query<{ playerid: string; teamid: string }>(
    `SELECT DISTINCT ON (playerid) playerid, teamid
       FROM public.player_team_stints
      WHERE playerid = ANY($1) AND stint_start <= $2::date AND level IS DISTINCT FROM 'HIGH SCHOOL'
      ORDER BY playerid, stint_start DESC, teamid`,
    [ids, asof],
  );
  return new Map(teams.map((t) => [String(t.playerid), String(t.teamid)]));
}

type Computed = ReturnType<typeof computeSeason>;
// One season's writes, in one transaction.
export async function writeSeason(client: PoolClient, seasonKey: string, out: Computed, withBox: boolean) {
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL master_bracket.reason = 'bracket results job'");
    await client.query(SQL_RESULTS, [seasonKey, JSON.stringify(forDb(out.results)), withBox]);
    await client.query(SQL_FILLS, [seasonKey, JSON.stringify(out.fills)]);
    await client.query(SQL_DECISIONS, [seasonKey, JSON.stringify(out.decisions)]);
    if (out.boxFills.length) {
      await client.query("SET LOCAL master_bracket.unlock = 'on'");
      await client.query("SET LOCAL master_bracket.reason = 'bracket results job: stat drawer added to a locked final (result unchanged)'");
      await client.query(SQL_BOXES, [seasonKey, JSON.stringify(out.boxFills)]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

export const SQL_ROWS = `
SELECT stage, region, round, round_name, series_no, game_no, game_id, week, home_hsid, away_hsid, home_seed, away_seed,
       home_school_name, away_school_name, status, innings, home_runs, away_runs, winner_hsid, decided_by, locked_at,
       box IS NULL AS box_missing, computed_at::text,
       CASE WHEN locked_at IS NULL AND status = 'in_progress' THEN box END AS box_in_progress
  FROM public.master_bracket WHERE season_key = $1`;
export const SQL_RULINGS = 'SELECT region, week, home_hsid, away_hsid, winner_hsid FROM public.commissioner_rulings WHERE season_key = $1';
export type { Season, Row, Ruling };

// The production site's live data (any school's subdomain serves the same
// /api/bracket/live; the bare yatstats.com is another site).
export const LIVE_BASE = 'https://5004.yatstats.com';

export const SQL_SEASONS = `
SELECT season_key, is_test, opening_day::text, last_day::text, weeks, regions, schools_per_region
  FROM public.fantasy_seasons
 WHERE ($1::text IS NULL AND $2::date BETWEEN opening_day AND last_day + 1) OR season_key = $1`;

// One season's run: score every started game on the live data and write it.
// When it draws new pairs (a round just ended), it runs again at once so
// their games are scored too. region: just one test bracket (a test
// branch's own database holds all six). Returns what each pass did.
export async function runSeason(pool: Pool, season: Season, asof: string, opts: { base: string; region?: number; withBox?: boolean; dryRun?: boolean }) {
  const withBox = opts.withBox ?? true;
  const passes: { results: number; final: number; fills: number; boxFills: number; decisions: string[] }[] = [];
  for (let pass = 0; pass < 3; pass++) {
    let { rows } = await pool.query<Row>(SQL_ROWS, [season.season_key]);
    let { rows: rulings } = await pool.query<Ruling>(SQL_RULINGS, [season.season_key]);
    if (opts.region != null) {
      rows = rows.filter((r) => Number(r.region) === opts.region);
      rulings = rulings.filter((r) => Number(r.region) === opts.region);
    }
    const weeks = startedWeeks(season, asof);
    if (!weeks || !rows.length) break;
    const live = await fetchLive(opts.base, season.opening_day, Math.min(weeks, 40), fieldOf(rows));
    const clubs = clubsOf(live, await loadTeams(pool, rows, live, asof));
    const out = computeSeason(season, rows, rulings, live, asof, withBox, clubs);
    passes.push({
      results: out.results.length, final: out.results.filter((r) => r.lock).length, fills: out.fills.length,
      boxFills: out.boxFills.length, decisions: out.decisions.map((d) => d.summary),
    });
    if (opts.dryRun) break;
    const client: PoolClient = await pool.connect();
    try {
      await writeSeason(client, season.season_key, out, withBox);
    } finally {
      client.release();
    }
    if (!out.fills.length) break;
  }
  return passes;
}

async function main() {
  const seasonKey = arg('season');
  const asof = arg('asof') || bracketDay();
  const offline = arg('offline');
  const withBox = !flag('no-box');

  if (offline) {
    if (!seasonKey) throw new Error('--offline needs --season');
    const read = (f: string) => JSON.parse(readFileSync(join(offline, f), 'utf8'));
    const season: Season = read('season.json');
    const rows: Row[] = read('rows.json');
    const rulings: Ruling[] = read('rulings.json');
    const live: Live = read('live.json');
    const teamOf = new Map<string, string>(existsSync(join(offline, 'teams.json')) ? Object.entries(read('teams.json')) : []);
    const { results, fills, decisions, boxFills } = computeSeason(season, rows, rulings, live, asof, withBox, clubsOf(live, teamOf));
    const sub = (sql: string, json: unknown) => sql.replaceAll('$1', `'${season.season_key}'`).replaceAll('$2', dollar(JSON.stringify(json))).replaceAll('$3', String(withBox)).trim();
    console.log(`-- ${season.season_key} as of ${asof}: ${results.length} results, ${fills.length} slots filled, ${decisions.length} for Pete, ${boxFills.length} locked finals get their box`);
    console.log(`${sub(SQL_RESULTS, forDb(results))};\n${sub(SQL_FILLS, fills)};\n${sub(SQL_DECISIONS, decisions)};`);
    if (boxFills.length) console.log(`SET LOCAL master_bracket.unlock = 'on';\n${sub(SQL_BOXES, boxFills)};`);
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const base = (process.env.BRACKET_LIVE_BASE_URL || LIVE_BASE).replace(/\/$/, '');
  try {
    const relanded = await pool.query('SELECT public.stat_lines_reland_held() AS n');
    console.log(`held stat lines landed again: ${relanded.rows[0].n}`);
    await checkTeams(pool);
    const { rows: seasons } = await pool.query<Season>(SQL_SEASONS, [seasonKey || null, asof]);
    if (!seasons.length) console.log(`no fantasy season is live on ${asof}`);
    for (const season of seasons) {
      for (const pass of await runSeason(pool, season, asof, { base, withBox, dryRun: flag('dry-run') })) {
        console.log(`${season.season_key} as of ${asof}: ${pass.results} results (${pass.final} final), ${pass.fills} slots filled, ${pass.decisions.length} for Pete, ${pass.boxFills} locked finals get their box`);
        for (const d of pass.decisions) console.log(`  needs decision: ${d}`);
      }
    }
  } finally {
    await pool.end();
  }
}

// Run as the job; imported (the full-season proof), it only lends its parts.
if (/master-bracket-results\.ts$/.test(process.argv[1] || '')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
