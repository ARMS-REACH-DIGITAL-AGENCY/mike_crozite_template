// src/lib/bracket/engine.ts
// The YAT?STATS National Alumni Bracket scoring engine: pure logic, no
// database and no UI, so it scores real box scores and simulated ones the
// same way.
//
// The game clock: 1 day = 1 inning, 1 week (Mon-Sun) = 1 game, 3 weeks =
// a best-of-3 series.
//   Innings 1-7  each day of the week, two runs on the table:
//                  offense  - 1 run to the school whose alumni had the
//                             better OPS+ that day
//                  pitching - 1 run to the school whose alumni had the
//                             better (lower) FIP- that day
//   Inning 8     the same two comparisons on the whole week's totals
//   Inning 9     1 run to the school whose alumni's real clubs had the
//                better W-L% that week
// A school with no one playing on a day ('absent' rule):
//   'average' - counts as league average (OPS+ 100, FIP- 100): a day off
//               neither helps nor hurts
//   'forfeit' - can't win that comparison: any school that played takes it
//   'hold'    - can't score; the school that played scores only by beating
//               league average
// Equal values score nothing.
//
// Level adjustment ('adjusted' mode): every line is measured against the
// 2026 average for the level it was played at (MLB, Triple-A ... NCAA-D1,
// JUCO), so a juco hitter's .900 OPS and a big leaguer's .750 are compared
// fairly. 'raw' mode compares plain OPS and FIP, as the first prototype did.
//
// Ties after 9 in an elimination game: better week W-L%, then more
// plate appearances + innings pitched that week, then the better seed.
// Leaderboard games can end tied (half a win each).

export type Level = string;

export type BatTotals = { pa: number; ab: number; h: number; d2: number; d3: number; hr: number; bb: number; hbp: number; sf: number };
export type PitTotals = { outs: number; hr: number; bb: number; hbp: number; so: number };

// One school's production on one day (or one week), split by level.
export type LevelBuckets = Map<Level, { bat: BatTotals; pit: PitTotals }>;

// A level's 2026 average. fip is the league FIP (set equal to league ERA
// via the FIP constant cfip).
export type Baseline = { obp: number; slg: number; fip: number; cfip: number };
export type Baselines = Map<Level, Baseline>;

export type Mode = 'adjusted' | 'raw';
export type Absent = 'average' | 'forfeit' | 'hold';
export type Rules = { mode: Mode; absent: Absent };

// Raw mode's league reference points (MLB-like), used for days off.
export const RAW_AVERAGE_OPS = 0.72;
export const RAW_FIP_CONSTANT = 3.1;
export const RAW_AVERAGE_FIP = 4.2;

export const emptyBat = (): BatTotals => ({ pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, hbp: 0, sf: 0 });
export const emptyPit = (): PitTotals => ({ outs: 0, hr: 0, bb: 0, hbp: 0, so: 0 });

export function addBat(a: BatTotals, b: BatTotals): BatTotals {
  return { pa: a.pa + b.pa, ab: a.ab + b.ab, h: a.h + b.h, d2: a.d2 + b.d2, d3: a.d3 + b.d3, hr: a.hr + b.hr, bb: a.bb + b.bb, hbp: a.hbp + b.hbp, sf: a.sf + b.sf };
}
export function addPit(a: PitTotals, b: PitTotals): PitTotals {
  return { outs: a.outs + b.outs, hr: a.hr + b.hr, bb: a.bb + b.bb, hbp: a.hbp + b.hbp, so: a.so + b.so };
}

export function addToBuckets(buckets: LevelBuckets, level: Level, bat?: BatTotals, pit?: PitTotals) {
  const cur = buckets.get(level) || { bat: emptyBat(), pit: emptyPit() };
  buckets.set(level, { bat: bat ? addBat(cur.bat, bat) : cur.bat, pit: pit ? addPit(cur.pit, pit) : cur.pit });
}

export function mergeBuckets(list: LevelBuckets[]): LevelBuckets {
  const out: LevelBuckets = new Map();
  for (const b of list) for (const [level, v] of b) addToBuckets(out, level, v.bat, v.pit);
  return out;
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------
export function tb(b: BatTotals) {
  const singles = Math.max(0, b.h - b.d2 - b.d3 - b.hr);
  return singles + 2 * b.d2 + 3 * b.d3 + 4 * b.hr;
}
export function obpParts(b: BatTotals) {
  return { num: b.h + b.bb + b.hbp, den: b.ab + b.bb + b.hbp + b.sf };
}
export const ops = (b: BatTotals) => {
  const { num, den } = obpParts(b);
  return (den ? num / den : 0) + (b.ab ? tb(b) / b.ab : 0);
};
export const fipCore = (p: PitTotals) => (p.outs ? (13 * p.hr + 3 * (p.bb + p.hbp) - 2 * p.so) / (p.outs / 3) : 0);

// The school's offense for a day/week: OPS+ (adjusted) or OPS (raw).
// null when nobody batted.
export function offenseScore(buckets: LevelBuckets, baselines: Baselines, mode: Mode): number | null {
  let num = 0, den = 0, tbs = 0, ab = 0, lgObpW = 0, lgSlgW = 0;
  for (const [level, { bat }] of buckets) {
    const p = obpParts(bat);
    if (!p.den && !bat.ab) continue;
    num += p.num; den += p.den; tbs += tb(bat); ab += bat.ab;
    const base = baselines.get(level);
    if (mode === 'adjusted' && base) {
      lgObpW += base.obp * p.den;
      lgSlgW += base.slg * bat.ab;
    }
  }
  if (!den && !ab) return null;
  const obp = den ? num / den : 0;
  const slg = ab ? tbs / ab : 0;
  if (mode === 'raw') return obp + slg;
  const lgObp = den ? lgObpW / den : 0;
  const lgSlg = ab ? lgSlgW / ab : 0;
  return 100 * ((lgObp ? obp / lgObp : 0) + (lgSlg ? slg / lgSlg : 0) - 1);
}

// The school's pitching: FIP- (adjusted; each level's FIP against that
// level's league FIP, weighted by innings) or FIP (raw). null when nobody
// pitched.
export function pitchingScore(buckets: LevelBuckets, baselines: Baselines, mode: Mode): number | null {
  let outs = 0, core = 0, fipW = 0, lgW = 0;
  for (const [level, { pit }] of buckets) {
    if (!pit.outs) continue;
    outs += pit.outs;
    core += 13 * pit.hr + 3 * (pit.bb + pit.hbp) - 2 * pit.so;
    const base = baselines.get(level);
    if (mode === 'adjusted' && base) {
      fipW += (fipCore(pit) + base.cfip) * pit.outs;
      lgW += base.fip * pit.outs;
    }
  }
  if (!outs) return null;
  if (mode === 'raw') return core / (outs / 3) + RAW_FIP_CONSTANT;
  return lgW ? (100 * fipW) / lgW : 100;
}

const averageOffense = (mode: Mode) => (mode === 'raw' ? RAW_AVERAGE_OPS : 100);
const averagePitching = (mode: Mode) => (mode === 'raw' ? RAW_AVERAGE_FIP : 100);

// ---------------------------------------------------------------------------
// A game (one week)
// ---------------------------------------------------------------------------
export type Side = 'home' | 'away';

export type SideWeek = {
  days: LevelBuckets[]; // 7 entries, Monday first
  // Real clubs' results that week, summed over the school's alumni.
  wins: number;
  losses: number;
  seed: number; // lower is better; only used as the last tiebreak
};

export type Inning = {
  inning: number;
  kind: 'day' | 'week' | 'wl';
  home: number;
  away: number;
  // what each side posted (null = no one played / no results)
  homeOffense?: number | null;
  awayOffense?: number | null;
  homePitching?: number | null;
  awayPitching?: number | null;
  homeWinPct?: number | null;
  awayWinPct?: number | null;
};

export type GameResult = {
  innings: Inning[];
  home: number;
  away: number;
  winner: Side | null; // null = tie (leaderboard games only)
  decidedBy: 'runs' | 'wl' | 'volume' | 'seed' | 'tie';
  homeVolume: number; // PA + IP
  awayVolume: number;
};

function compareHigher(a: number, b: number): [number, number] {
  return a > b ? [1, 0] : b > a ? [0, 1] : [0, 0];
}

// One comparison. better(a, b) > 0 when a is better.
function compareSides(hv: number | null, av: number | null, average: number, higherIsBetter: boolean, absent: Absent): [number, number] {
  if (hv === null && av === null) return [0, 0];
  if (absent === 'forfeit' && (hv === null || av === null)) return hv === null ? [0, 1] : [1, 0];
  const h = hv ?? average, a = av ?? average;
  const [x, y] = higherIsBetter ? compareHigher(h, a) : compareHigher(-h, -a);
  // 'hold': the absent side never scores (it could only "beat" a below-average line)
  if (absent === 'hold') return [hv === null ? 0 : x, av === null ? 0 : y];
  return [x, y];
}

function scoreInning(inning: number, kind: 'day' | 'week', home: LevelBuckets, away: LevelBuckets, baselines: Baselines, rules: Rules): Inning {
  const { mode, absent } = rules;
  const ho = offenseScore(home, baselines, mode);
  const ao = offenseScore(away, baselines, mode);
  const hp = pitchingScore(home, baselines, mode);
  const ap = pitchingScore(away, baselines, mode);
  const [ox, oy] = compareSides(ho, ao, averageOffense(mode), true, absent);
  // lower FIP / FIP- is better
  const [px, py] = compareSides(hp, ap, averagePitching(mode), false, absent);
  const h = ox + px, a = oy + py;
  return { inning, kind, home: h, away: a, homeOffense: ho, awayOffense: ao, homePitching: hp, awayPitching: ap };
}

export const winPct = (w: number, l: number) => (w + l ? w / (w + l) : null);

export function volume(buckets: LevelBuckets) {
  let v = 0;
  for (const { bat, pit } of buckets.values()) v += bat.pa + pit.outs / 3;
  return v;
}

export function playGame(home: SideWeek, away: SideWeek, baselines: Baselines, rules: Rules, allowTie = false): GameResult {
  const innings: Inning[] = [];
  for (let d = 0; d < 7; d++) innings.push(scoreInning(d + 1, 'day', home.days[d] || new Map(), away.days[d] || new Map(), baselines, rules));
  const homeWeek = mergeBuckets(home.days);
  const awayWeek = mergeBuckets(away.days);
  innings.push(scoreInning(8, 'week', homeWeek, awayWeek, baselines, rules));
  const hw = winPct(home.wins, home.losses);
  const aw = winPct(away.wins, away.losses);
  // A school whose alumni's clubs didn't play counts as .500.
  const [x, y] = hw === null && aw === null ? [0, 0] : compareHigher(hw ?? 0.5, aw ?? 0.5);
  innings.push({ inning: 9, kind: 'wl', home: x, away: y, homeWinPct: hw, awayWinPct: aw });

  const hr = innings.reduce((s, i) => s + i.home, 0);
  const ar = innings.reduce((s, i) => s + i.away, 0);
  const homeVolume = volume(homeWeek);
  const awayVolume = volume(awayWeek);
  const base = { innings, home: hr, away: ar, homeVolume, awayVolume };
  if (hr !== ar) return { ...base, winner: hr > ar ? 'home' : 'away', decidedBy: 'runs' };
  if (allowTie) return { ...base, winner: null, decidedBy: 'tie' };
  if ((hw ?? 0.5) !== (aw ?? 0.5)) return { ...base, winner: (hw ?? 0.5) > (aw ?? 0.5) ? 'home' : 'away', decidedBy: 'wl' };
  if (homeVolume !== awayVolume) return { ...base, winner: homeVolume > awayVolume ? 'home' : 'away', decidedBy: 'volume' };
  return { ...base, winner: home.seed <= away.seed ? 'home' : 'away', decidedBy: 'seed' };
}

// ---------------------------------------------------------------------------
// Bracket structure
// ---------------------------------------------------------------------------

// Standard seeded bracket order: for 8 -> [1,8,4,5,2,7,3,6]. Adjacent
// entries meet in round 1, adjacent winners in round 2, and so on, so the
// top seeds can only meet late.
export function bracketOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

// Best of 3: stops as soon as a side has 2 wins.
export function playSeries<T>(playWeek: (gameNumber: number) => T & { winner: Side | null }): { games: (T & { winner: Side | null })[]; winner: Side } {
  const games: (T & { winner: Side | null })[] = [];
  let h = 0, a = 0;
  for (let g = 1; g <= 3 && h < 2 && a < 2; g++) {
    const r = playWeek(g);
    games.push(r);
    if (r.winner === 'home') h++;
    else if (r.winner === 'away') a++;
  }
  return { games, winner: h > a ? 'home' : 'away' };
}

// ---------------------------------------------------------------------------
// Seeded randomness (leaderboard pairings; the simulator's college days)
// ---------------------------------------------------------------------------
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Eliminated schools' weekly pairings within a region: shuffled with a
// fixed seed; with an odd count, the school that has played the most
// leaderboard games sits out (first in shuffled order on a tie).
export function pairEliminated(teams: number[], gamesPlayed: Map<number, number>, seed: string): { pairs: [number, number][]; bye: number | null } {
  let pool = shuffle(teams, mulberry32(hashString(seed)));
  let bye: number | null = null;
  if (pool.length % 2 === 1) {
    let best = 0;
    for (let i = 1; i < pool.length; i++) if ((gamesPlayed.get(pool[i]) || 0) > (gamesPlayed.get(pool[best]) || 0)) best = i;
    bye = pool[best];
    pool = pool.filter((_, i) => i !== best);
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) pairs.push([pool[i], pool[i + 1]]);
  return { pairs, bye };
}
