// Live scoring: the bracket's games scored from real game lines
// (/api/bracket/live) with the bracket engine, in place of the practice
// season's pre-computed files. Each game's week is scored as its days come
// in: innings 1-7 are the days, 8 the week, 9 the alumni's clubs' W-L; a
// week still in progress has no winner yet.
//
// The board runs like a ballpark's: the bracket's day runs 4 a.m. to 4 a.m.
// Arizona time, the same for every game. At 4 a.m. the day's inning starts
// in the Top (a yellow 0 for the visitors); once the last real game of the
// day for the two schools' alumni has started it's the Bottom (yellow 0s for
// both); once those games are over its real runs go up in yellow, and at
// 4 a.m. they turn white as the next inning starts. Until then the drawer
// outlines who'd get each run if the day ended now. Innings 8 (the week) and
// 9 (W-L) post with Sunday's runs; the game is final at 4 a.m. Monday.
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
import { type LivePhase, setLiveInning } from './schoolSeason';
import { setInAction } from './inAction';

type RosterEntry = [id: string, name: string, level: string, pitcher: 0 | 1, club: string];
type Line = [hsid: string, playerid: string, day: number, kind: 'b' | 'p', stats: number[], game: string, club: string, final?: 0 | 1, level?: string];
type Live = {
  asOf: string; roster: Record<string, RosterEntry[]>; lines: Line[];
  clubs: Record<string, [number, string, 0 | 1][]>; games?: Record<string, [number, string, 0 | 1, (0 | 1)?, number?][]>;
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
  // asof is the bracket's day, which turns over at 4 a.m. Arizona time.
  const today = dayOf(asof, start);
  // The real games of each day: by club, and the whole bracket's.
  type Real = { done: boolean; started: boolean; start: number };
  const clubDay = new Map<string, Map<string, Real>>(); // `${club}:${day}` -> game -> state
  const allDay = new Map<number, Map<string, Real>>();
  for (const [club, list] of Object.entries(live.games || {})) {
    for (const [d, game, done, started, start] of list) {
      // Before the route sent "started": a game is under way once it's over.
      const st = { done: Boolean(done), started: Boolean(done || started), start: Number(start) || 0 };
      const k = `${club}:${d}`;
      (clubDay.get(k) || clubDay.set(k, new Map()).get(k)!).set(game, st);
      (allDay.get(d) || allDay.set(d, new Map()).get(d)!).set(game, st);
    }
  }
  // Players with a line from a game still going, by day.
  const openLines = new Map<number, Set<string>>();
  for (const [, pid, d, , , , , fin] of live.lines) {
    if (fin === 0) (openLines.get(d) || openLines.set(d, new Set()).get(d)!).add(pid);
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

  // In action today, for each school's drawer strip: its alumni with a game
  // today (the bracket's day) and those games' first pitches.
  for (const [h, players] of roster) {
    const mine = lines.get(h);
    const real = new Map<string, Real>();
    let n = 0;
    for (const p of players) {
      const x = mine?.get(p[0])?.get(today);
      const day = clubDay.get(`${x?.club || p[4]}:${today}`);
      if (day?.size || x?.b || x?.p) n++;
      for (const [id, st] of day || []) real.set(id, st);
    }
    const list = [...real.values()];
    const starts = list.map((x) => x.start).filter(Boolean);
    const upcoming = list.filter((x) => !x.started && x.start).map((x) => x.start);
    setInAction(Number(h), {
      players: n, games: list.length, started: list.filter((x) => x.started).length, done: list.filter((x) => x.done).length,
      first: starts.length ? Math.min(...starts) : undefined,
      next: upcoming.length ? Math.min(...upcoming) : undefined,
      last: starts.length ? Math.max(...starts) : undefined,
    });
  }

  const boxes: Record<string, GameBox> = {};
  const scoreGame = (g: GameRow) => {
    const week = g[1];
    const [ws] = idx.weeks[week - 1] || [];
    if (!ws || ws > asof || !g[2] || !g[3]) return;
    const from = dayOf(ws, start);
    // The current inning (0-6 = Monday-Sunday; 7 = the week is over) and
    // where it stands: 'top' from 4 a.m., 'bottom' once the last real game
    // of the day for these two schools' alumni has started (the whole
    // bracket's last game if neither school has anyone playing), 'posted'
    // once all of those games are over - its real runs go up in yellow,
    // and turn white at 4 a.m.
    const cur = Math.max(0, Math.min(7, today - from));
    const phaseOf = (abs: number): LivePhase => {
      const real = new Map<string, Real>();
      const going = openLines.get(abs);
      let open = false;
      for (const h of [g[2], g[3]]) {
        const mine = lines.get(String(h));
        for (const p of roster.get(String(h)) || []) {
          const x = mine?.get(p[0])?.get(abs);
          for (const [id, st] of clubDay.get(`${x?.club || p[4]}:${abs}`) || []) real.set(id, st);
          if (going?.has(p[0])) open = true;
        }
      }
      const list = [...(real.size ? real : allDay.get(abs) || new Map<string, Real>()).values()];
      if (!list.length || !list.every((x) => x.started)) return 'top';
      return list.every((x) => x.done) && !open ? 'posted' : 'bottom';
    };
    const phase: LivePhase = cur < 7 ? phaseOf(from + cur) : 'posted';
    setLiveInning(g[0], cur, phase);
    // A day's runs count once posted: every day before today, and today's
    // once its games are over. Innings 8 and 9 post with Sunday's.
    const posted = (k: number) => k < cur || (k === cur && phase === 'posted');
    const f = Array.from({ length: 7 }, (_, d) => [posted(d), posted(d)] as [boolean, boolean]);
    const final = cur >= 7;
    const weekPosted = final || (cur === 6 && phase === 'posted');
    const weekDone: [boolean, boolean] = [weekPosted, weekPosted];
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
    // A week in progress counts only the posted runs; the week (8) and W-L
    // (9) innings post with Sunday's, and any tiebreak once it's final.
    g[5] = final
      ? result.innings.flatMap((i) => [i.home, i.away])
      : result.innings.slice(0, 9).flatMap((i, k) => {
        if (k >= 7) return weekPosted ? [i.home, i.away] : [0, 0];
        const off = f[k][0] ? holdRuns(i.homeOffense, i.awayOffense, AVERAGE, true) : [0, 0];
        const pitc = f[k][1] ? holdRuns(i.homePitching, i.awayPitching, AVERAGE, false) : [0, 0];
        return [off[0] + pitc[0], off[1] + pitc[1]];
      });
    g[6] = final && result.winner ? (result.winner === 'home' ? g[2] : g[3]) : null;
    g[4] = !final ? '' : result.decidedBy === 'players' ? `players-${result.tieRank}` : result.decidedBy;
    boxes[String(g[0])] = {
      d: result.innings.slice(0, 8).map((i) => [round(i.homeOffense), round(i.awayOffense), round(i.homePitching), round(i.awayPitching)]),
      // Posted [offense, pitching] per inning 1-8, then the W-L inning.
      f: [...f, weekDone, weekDone],
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
