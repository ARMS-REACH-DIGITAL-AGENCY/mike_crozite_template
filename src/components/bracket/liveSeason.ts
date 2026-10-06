// Live scoring: the bracket's games scored from real game lines
// (/api/bracket/live) with the bracket engine, in place of the practice
// season's pre-computed files. Each game's week is scored as its days come
// in: innings 1-7 are the days, 8 the week, 9 the alumni's clubs' W-L; a
// week still in progress has no winner yet.
//
// A run goes on the board only once it can't change. The offensive and the
// pitching run of a day are settled separately: the offensive run when every
// hitter on both rosters is done for the day (no club game still to finish,
// no line from a game still going), the pitching run likewise for the
// pitchers - or, at the latest, at 4 a.m. Arizona time the next morning.
// Until then the box shows who leads (the drawer outlines the cell) but
// counts no run. The week (8) and W-L (9) innings settle with Sunday.
//
// Scoring is 'adjusted', exactly as the 2027 season will be: every line is
// measured against the league average for the player's level (the Rules'
// "League averages by level", lib/bracket/levelAverages.ts) - OPS+ and FIP-,
// 100 = his level's average.
import {
  addToBuckets, emptyBat, emptyPit, fipCore, mergeBuckets, offenseScore, pitchingScore, playGame,
  type Baselines, type BatTotals, type GameResult, type LevelBuckets, type PitTotals, type PlayerLines, type SideWeek,
} from '@/lib/bracket/engine';
import { LEVEL_AVERAGES } from '@/lib/bracket/levelAverages';
import type { GameBox, GameRow, Index, PlayerRow, SeriesRow } from './gallery';
import { setSettledDays } from './schoolSeason';

type RosterEntry = [id: string, name: string, level: string, pitcher: 0 | 1, club: string];
type Line = [hsid: string, playerid: string, day: number, kind: 'b' | 'p', stats: number[], game: string, club: string, final?: 0 | 1, level?: string];
type Live = {
  asOf: string; roster: Record<string, RosterEntry[]>; lines: Line[];
  clubs: Record<string, [number, string, 0 | 1][]>; games?: Record<string, [number, string, 0 | 1][]>;
};

const RULES = { mode: 'adjusted' as const, absent: 'hold' as const };
const DAY = 86400000;
// OPS+ and FIP- are on the plus scale already: 100 is league average.
const AVERAGE = 100;

const BASELINES: Baselines = new Map(LEVEL_AVERAGES.map((a) => [a.level, { obp: a.obp, slg: a.slg, fip: a.fip, cfip: a.cfip }]));
// A roster level ("TRIPLE-A", "NCAA-D1", "NJCAA" ...) -> its row in the
// level averages. A level we can't place (blank, "PRO", "INT'L") is measured
// against MLB's.
function levelKey(label: string) {
  const l = label.toUpperCase().replace(/\s+/g, '').replace(/\(.*\)/, '');
  if (l === 'MLB') return 'MLB';
  if (l === 'TRIPLE-A' || l === 'AAA') return 'Triple-A';
  if (l === 'DOUBLE-A' || l === 'AA') return 'Double-A';
  if (l === 'HIGH-A' || l === 'A+') return 'High-A';
  if (l === 'LOW-A' || l === 'SINGLE-A' || l === 'A') return 'Low-A';
  if (/^(ROOKIE|ROK|DSL|ACL|FCL|CPX)/.test(l)) return 'Rookie';
  if (/^(INDY|INDEPENDENT|IND)/.test(l)) return 'Independent';
  if (l === 'NCAA-D2' || l === 'D2') return 'NCAA D2';
  if (l === 'NCAA-D3' || l === 'D3') return 'NCAA D3';
  if (l === 'NCAA-D1' || l === 'D1' || l === 'NCAA') return 'NCAA D1';
  if (l === 'NAIA') return 'NAIA';
  if (/^(NJCAA|CCCAA|NWAC|JUCO|JRCOLLEGE)/.test(l)) return 'JUCO';
  // The Arizona Fall League (MLB's "WIN"): top prospects, Double-A-ish.
  if (l === 'WIN' || l === 'AFL') return 'Double-A';
  return 'MLB';
}
const round = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v));
// One player's line as level buckets (for the engine's scores).
function buckets(level: string, b: number[] | 0, q: number[] | 0): LevelBuckets {
  const out: LevelBuckets = new Map();
  if (b) addToBuckets(out, level, bat(b), emptyPit());
  if (q) addToBuckets(out, level, emptyBat(), pit(q));
  return out;
}
const bat = (s: number[]): BatTotals => ({ pa: s[0], ab: s[1], h: s[2], d2: s[3], d3: s[4], hr: s[5], bb: s[6], hbp: s[7], sf: s[8] });
const pit = (s: number[]): PitTotals => ({ outs: s[0], hr: s[1], bb: s[2], hbp: s[3], so: s[4] });
const add = (a: number[] | 0, b: number[]) => (a ? a.map((v, i) => v + (b[i] || 0)) : [...b]);
// A day settles by 4 a.m. Arizona time (UTC-7, no DST) the next morning.
const settledBy = (start: string, day: number) => Date.parse(`${start}T00:00:00Z`) + (day + 1) * DAY + (4 + 7) * 3600000;

// The engine's comparison under the 'hold' rule: [home run, away run].
function holdRuns(hv: number | null | undefined, av: number | null | undefined, average: number, higher: boolean): [number, number] {
  if (hv == null && av == null) return [0, 0];
  const h = hv ?? average, a = av ?? average;
  const hb = higher ? h > a : h < a, ab = higher ? a > h : a < h;
  return [hv == null ? 0 : hb ? 1 : 0, av == null ? 0 : ab ? 1 : 0];
}

const dayOf = (iso: string, start: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);

// A deterministic commissioner's flip for a finished, level game.
function flip(gameId: number): 'home' | 'away' {
  let x = (gameId * 2654435761) >>> 0;
  x ^= x >>> 16;
  return x % 2 ? 'home' : 'away';
}

// A pitcher's FIP on his levels' scales: each level's core plus its FIP
// constant, weighted by outs.
function fipOf(lines: LevelBuckets) {
  let sum = 0, outs = 0;
  for (const [level, { pit: x }] of lines) {
    if (!x.outs) continue;
    sum += (fipCore(x) + (BASELINES.get(level)?.cfip ?? 0)) * x.outs;
    outs += x.outs;
  }
  return outs ? sum / outs : 0;
}

// One player's line for a set of days, as the drawer's PlayerRow. lv: his
// lines by the level of each game (a call-up's week is measured against
// each level's average for the games he played there); without it, his
// listed level.
function playerRow(p: RosterEntry, b: number[] | 0, q: number[] | 0, wl: [number, number] | null, lv?: LevelBuckets): PlayerRow {
  const batted = b && b[0] > 0;
  const pitched = q && (q[0] > 0 || q[1] > 0 || q[2] > 0 || q[3] > 0 || q[4] > 0);
  const lines = lv && lv.size ? lv : buckets(levelKey(p[2]), batted ? b : 0, pitched ? q : 0);
  const fip = pitched ? fipOf(lines) : 0;
  // Everyone stays in his usual group with a zero line on a day off.
  const batLine = b || (!q && !p[3] ? [0, 0, 0, 0, 0, 0, 0, 0, 0] : 0);
  const pitLine = q ? [...q, +fip.toFixed(2)] : (!b && p[3] ? [0, 0, 0, 0, 0, 0, 0, 0, 0] : 0);
  return [
    p[0], p[1], p[2], 0, batLine, pitLine,
    batted ? round(offenseScore(lines, BASELINES, 'adjusted')) : batLine ? 0 : null,
    pitched ? round(pitchingScore(lines, BASELINES, 'adjusted')) : pitLine ? 0 : null,
    wl, 0,
  ];
}

let livePromise: Promise<{ live: Live | null; boxes: Record<string, GameBox> }> | null = null;
let boxesResolve: ((b: Record<string, GameBox>) => void) | null = null;
const boxesPromise = new Promise<Record<string, GameBox>>((res) => { boxesResolve = res; });

// The live boxes, keyed by game id (every round shares one set).
export function liveBoxes() {
  return boxesPromise;
}

// Score every game of the index whose week has started, from live lines.
export function applyLive(idx: Index, asof: string) {
  if (!livePromise) {
    const start = idx.weeks[0][0];
    const hsids = Object.keys(idx.schools);
    const started = idx.weeks.filter(([a]) => a <= asof).length;
    livePromise = (started
      ? fetch(`/api/bracket/live?start=${start}&weeks=${started}&h=${hsids.join(',')}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() as Promise<Live> : null))
        .catch(() => null)
      : Promise.resolve(null))
      .then((live) => {
        const boxes = live ? score(idx, live, asof) : {};
        boxesResolve?.(boxes);
        return { live, boxes };
      });
  }
  return livePromise.then(() => idx);
}

function score(idx: Index, live: Live, asof: string) {
  const start = idx.weeks[0][0];
  const today = dayOf(asof, start);
  const now = Date.now();
  // Clubs with a game on a day (dayClubs), and those whose game isn't over yet.
  const dayClubs = new Map<number, Set<string>>();
  const openClubs = new Map<number, Set<string>>();
  for (const [club, list] of Object.entries(live.games || {})) {
    for (const [d, , done] of list) {
      (dayClubs.get(d) || dayClubs.set(d, new Set()).get(d)!).add(club);
      if (!done) (openClubs.get(d) || openClubs.set(d, new Set()).get(d)!).add(club);
    }
  }
  // Players with a line from a game still going: day -> 'b'|'p' -> ids.
  const openLines = new Map<string, Set<string>>();
  for (const [, pid, d, kind, , , , fin] of live.lines) {
    if (fin === 0) (openLines.get(`${d}:${kind}`) || openLines.set(`${d}:${kind}`, new Set()).get(`${d}:${kind}`)!).add(pid);
  }
  const roster = new Map(Object.entries(live.roster));
  // Each player's listed level: a line whose source doesn't give the
  // game's level counts at it.
  const listedLevel = new Map<string, string>();
  for (const list of roster.values()) for (const p of list) listedLevel.set(p[0], levelKey(p[2]));
  // Lines by school -> player -> day: the day's totals (the drawer's line)
  // and the same stats by the level of each game (the scoring).
  const lines = new Map<string, Map<string, Map<number, { b: number[] | 0; p: number[] | 0; club: string; lv: LevelBuckets }>>>();
  for (const [h, pid, day, kind, stats, , club, , level] of live.lines) {
    const school = lines.get(h) || new Map();
    lines.set(h, school);
    const days = school.get(pid) || new Map();
    school.set(pid, days);
    const cur = days.get(day) || { b: 0, p: 0, club: '', lv: new Map() };
    const lvl = level ? levelKey(level) : listedLevel.get(pid) || 'MLB';
    if (kind === 'b') { cur.b = add(cur.b, stats); addToBuckets(cur.lv, lvl, bat(stats), emptyPit()); }
    else { cur.p = add(cur.p, stats); addToBuckets(cur.lv, lvl, emptyBat(), pit(stats)); }
    cur.club = club || cur.club;
    days.set(day, cur);
  }
  // A club's W-L over days [from, to].
  const clubWl = (club: string, from: number, to: number): [number, number] => {
    const games = (live.clubs[club] || []).filter(([d]) => d >= from && d <= to);
    const w = games.filter((g) => g[2]).length;
    return [w, games.length - w];
  };

  const boxes: Record<string, GameBox> = {};
  const scoreGame = (g: GameRow) => {
    const week = g[1];
    const [ws] = idx.weeks[week - 1] || [];
    if (!ws || ws > asof || !g[2] || !g[3]) return;
    const from = dayOf(ws, start);
    // Is day d's offensive ('b') or pitching ('p') run settled? Early only
    // once the day has been played: someone on either roster had a game,
    // and every hitter (pitcher) is done - his club has no game left that
    // day and he has no line from a game still going. A day with no games
    // for either roster isn't over until 4 a.m. the next morning.
    const settled = (d: number, kind: 'b' | 'p') => {
      const abs = from + d;
      if (abs > today) return false;
      if (now >= settledBy(start, abs)) return true;
      const sched = dayClubs.get(abs);
      const open = openClubs.get(abs);
      const going = openLines.get(`${abs}:${kind}`);
      let played = false;
      for (const h of [g[2], g[3]]) {
        const mine = lines.get(String(h));
        for (const p of roster.get(String(h)) || []) {
          const x = mine?.get(p[0])?.get(abs);
          const club = x?.club || p[4];
          if (sched?.has(club) || x?.b || x?.p) played = true;
          const role = kind === 'p' ? p[3] === 1 || Boolean(x?.p) : p[3] === 0 || Boolean(x?.b);
          if (!role) continue;
          if (going?.has(p[0])) return false;
          if (open?.has(club)) return false;
        }
      }
      return played;
    };
    const f = Array.from({ length: 7 }, (_, d) => [settled(d, 'b'), settled(d, 'p')] as [boolean, boolean]);
    // The board shows a day's inning once both its runs are settled.
    const dayDone = f.findIndex((x) => !x[0] || !x[1]);
    setSettledDays(g[0], dayDone < 0 ? 7 : dayDone);
    const weekDone: [boolean, boolean] = [f.every((x) => x[0]), f.every((x) => x[1])];
    const final = weekDone[0] && weekDone[1];
    const side = (h: number) => {
      const players = roster.get(String(h)) || [];
      const mine = lines.get(String(h)) || new Map();
      const days: PlayerLines[] = Array.from({ length: 7 }, () => new Map());
      const dayRows: PlayerRow[][] = Array.from({ length: 7 }, () => []);
      const weekRows: PlayerRow[] = [];
      let wins = 0, losses = 0;
      for (const p of players) {
        const byDay = mine.get(p[0]);
        let wb: number[] | 0 = 0, wp: number[] | 0 = 0, club = p[4];
        const weekLv: LevelBuckets[] = [];
        for (let d = 0; d < 7; d++) {
          const x = byDay?.get(from + d);
          if (x?.club) club = x.club;
          if (x && (x.b || x.p)) {
            days[d].set(p[0], x.lv);
            weekLv.push(x.lv);
            if (x.b) wb = add(wb, x.b);
            if (x.p) wp = add(wp, x.p);
          }
          // That day's club result: 1-0 for a win, 0-1 for a loss, 0-0 off.
          dayRows[d].push(playerRow(p, x?.b || 0, x?.p || 0, clubWl(club, from + d, from + d), x?.lv));
        }
        const wl = clubWl(club, from, Math.min(from + 6, today));
        wins += wl[0]; losses += wl[1];
        weekRows.push(playerRow(p, wb, wp, wl, mergeBuckets(weekLv)));
      }
      return { week: { days, wins, losses } as SideWeek, weekRows, dayRows };
    };
    const home = side(g[2]), away = side(g[3]);
    const result: GameResult = playGame(home.week, away.week, BASELINES, RULES, !final, final ? () => flip(g[0]) : undefined);
    // A week in progress counts only the settled runs; the week (8) and
    // W-L (9) innings and any tiebreak wait for the week to end.
    g[5] = final
      ? result.innings.flatMap((i) => [i.home, i.away])
      : result.innings.slice(0, 9).flatMap((i, k) => {
        if (k >= 7) return [0, 0];
        const off = f[k][0] ? holdRuns(i.homeOffense, i.awayOffense, AVERAGE, true) : [0, 0];
        const pitc = f[k][1] ? holdRuns(i.homePitching, i.awayPitching, AVERAGE, false) : [0, 0];
        return [off[0] + pitc[0], off[1] + pitc[1]];
      });
    g[6] = final && result.winner ? (result.winner === 'home' ? g[2] : g[3]) : null;
    g[4] = !final ? '' : result.decidedBy === 'players' ? `players-${result.tieRank}` : result.decidedBy;
    boxes[String(g[0])] = {
      d: result.innings.slice(0, 8).map((i) => [round(i.homeOffense), round(i.awayOffense), round(i.homePitching), round(i.awayPitching)]),
      // Settled [offense, pitching] per inning 1-8, then the W-L inning.
      f: [...f, weekDone, [final, final]],
      h: { p: home.weekRows, wl: [home.week.wins, home.week.losses], days: home.dayRows },
      a: { p: away.weekRows, wl: [away.week.wins, away.week.losses], days: away.dayRows },
    };
  };

  for (const round of idx.rounds) {
    for (const s of round.series as SeriesRow[]) {
      s[7].forEach(scoreGame);
      // A series is decided once a school has 2 wins.
      const wins: [number, number] = [s[7].filter((g) => g[6] === s[1]).length, s[7].filter((g) => g[6] === s[2]).length];
      s[6] = wins;
      s[5] = wins[0] >= 2 ? s[1] : wins[1] >= 2 ? s[2] : 0;
    }
  }
  return boxes;
}
