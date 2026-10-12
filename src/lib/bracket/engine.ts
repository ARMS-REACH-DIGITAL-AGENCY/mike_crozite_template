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
// Level adjustment ('adjusted' mode): every player's line is measured
// against the 2026 average for the level he played at (MLB, Triple-A ...
// NCAA-D1, JUCO), so a juco hitter's .900 OPS and a big leaguer's .750 are
// compared fairly. 'raw' mode compares plain OPS and FIP, as the first
// prototype did.
//
// A school's number for a day or week is the average of its players' own
// numbers, weighted by playing time: OPS+ by plate appearances, FIP- by
// innings pitched. (Averages, so more alumni never helps by itself.)
//
// Ties after 9: extra innings, player vs player. The 10th compares each
// school's best weekly hitter (higher OPS+ wins 1 run) and best weekly
// pitcher (lower FIP- wins 1 run); the 11th the #2s, and so on. Whichever of
// the two matchups both schools can supply is played - no pitchers on one
// side doesn't cancel the hitters' matchup - and nobody needs to beat league
// average: the better number wins. When the same-type matchups run out with
// the game still tied, the next inning is hitter vs pitcher: each school's
// best hitter against the other's best pitcher, the run going to whoever is
// closer to (or further above) league average - OPS+ - 100 for the hitter,
// 100 - FIP- for the pitcher. Still tied, or nothing left to compare: the
// school with the bigger fan base (registered YAT?STATS fans when the game
// went final) wins. Even there too: the commissioner decides. Exact stat
// ties award no run.
//
// W-L% counts every alumnus on a club's roster that week, game or no game:
// a pitcher who throws once a week for a winning club helps his school; a
// bench player on a losing club doesn't.
//
// A series is best of 3 and all three games are always played (every run
// counts); the school that wins 2 advances.

export type Level = string;

export type BatTotals = { pa: number; ab: number; h: number; d2: number; d3: number; hr: number; bb: number; hbp: number; sf: number };
export type PitTotals = { outs: number; hr: number; bb: number; hbp: number; so: number };

// One player's production on one day (or one week), split by level (a
// player promoted mid-week has lines at two levels).
export type LevelBuckets = Map<Level, { bat: BatTotals; pit: PitTotals }>;
// A school's alumni on one day (or one week): playerid -> his lines.
export type PlayerLines = Map<string, LevelBuckets>;

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
const hasPitchingAppearance = (p: PitTotals) => p.outs > 0 || p.hr > 0 || p.bb > 0 || p.hbp > 0 || p.so > 0;
// FIP is undefined when a pitcher records zero outs. If he nevertheless
// allowed a BB/HBP/HR, that is a real (and very bad) appearance, not an
// absence. Give it one surrogate out solely so it stays in the comparison
// instead of being dropped; this intentionally produces a worst-case FIP.
const effectivePitchingOuts = (p: PitTotals) => p.outs > 0 ? p.outs : hasPitchingAppearance(p) ? 1 : 0;
export const fipCore = (p: PitTotals) => {
  const outs = effectivePitchingOuts(p);
  return outs ? (13 * p.hr + 3 * (p.bb + p.hbp) - 2 * p.so) / (outs / 3) : 0;
};

// One player's offense for a day/week: OPS+ (adjusted; against his level's
// average) or OPS (raw). null when he didn't bat.
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

// One player's pitching: FIP- (adjusted; against his level's league FIP,
// weighted by innings if he pitched at two levels) or FIP (raw). null when
// he didn't pitch.
export function pitchingScore(buckets: LevelBuckets, baselines: Baselines, mode: Mode): number | null {
  let outs = 0, core = 0, fipW = 0, lgW = 0;
  for (const [level, { pit }] of buckets) {
    const effOuts = effectivePitchingOuts(pit);
    if (!effOuts) continue;
    outs += effOuts;
    core += 13 * pit.hr + 3 * (pit.bb + pit.hbp) - 2 * pit.so;
    const base = baselines.get(level);
    if (mode === 'adjusted' && base) {
      fipW += (fipCore(pit) + base.cfip) * effOuts;
      lgW += base.fip * effOuts;
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
  days: PlayerLines[]; // 7 entries, Monday first
  // Real clubs' results that week, summed over the school's alumni.
  wins: number;
  losses: number;
  // Each alumnus's week for the tiebreak (default: the days merged).
  players?: PlayerLines;
};

// The school's OPS+ (OPS raw): its players' own, weighted by plate
// appearances. null when nobody batted.
export function teamOffense(lines: PlayerLines, baselines: Baselines, mode: Mode): number | null {
  let sum = 0, weight = 0;
  for (const buckets of lines.values()) {
    const v = offenseScore(buckets, baselines, mode);
    if (v === null) continue;
    let pa = 0;
    for (const { bat } of buckets.values()) pa += Math.max(bat.pa, obpParts(bat).den);
    sum += v * pa; weight += pa;
  }
  return weight ? sum / weight : null;
}

// The school's FIP- (FIP raw): its pitchers' own, weighted by innings
// pitched. null when nobody pitched.
export function teamPitching(lines: PlayerLines, baselines: Baselines, mode: Mode): number | null {
  let sum = 0, weight = 0;
  for (const buckets of lines.values()) {
    const v = pitchingScore(buckets, baselines, mode);
    if (v === null) continue;
    let outs = 0;
    for (const { pit } of buckets.values()) outs += effectivePitchingOuts(pit);
    sum += v * outs; weight += outs;
  }
  return weight ? sum / weight : null;
}

// Several days' lines combined, player by player.
export function mergeLines(list: PlayerLines[]): PlayerLines {
  const out: PlayerLines = new Map();
  for (const day of list) for (const [pid, buckets] of day) out.set(pid, mergeBuckets([out.get(pid) || new Map(), buckets]));
  return out;
}

export type Inning = {
  inning: number;
  kind: 'day' | 'week' | 'wl' | 'tiebreak' | 'cross' | 'fans' | 'commissioner';
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
  winner: Side | null;
  // 'commissioner' with winner null: the commissioner's decision is still
  // to come.
  decidedBy: 'runs' | 'players' | 'cross' | 'fans' | 'commissioner' | 'tie';
  tieRank?: number; // 'players': which ranked hitter/pitcher pair decided it.
  tieScore?: [number, number]; // cumulative tiebreak runs, home first.
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

function scoreInning(inning: number, kind: 'day' | 'week', home: PlayerLines, away: PlayerLines, baselines: Baselines, rules: Rules): Inning {
  const { mode, absent } = rules;
  const ho = teamOffense(home, baselines, mode);
  const ao = teamOffense(away, baselines, mode);
  const hp = teamPitching(home, baselines, mode);
  const ap = teamPitching(away, baselines, mode);
  const [ox, oy] = compareSides(ho, ao, averageOffense(mode), true, absent);
  // lower FIP / FIP- is better
  const [px, py] = compareSides(hp, ap, averagePitching(mode), false, absent);
  const h = ox + px, a = oy + py;
  return { inning, kind, home: h, away: a, homeOffense: ho, awayOffense: ao, homePitching: hp, awayPitching: ap };
}

export const winPct = (w: number, l: number) => (w + l ? w / (w + l) : null);

// A school's alumni ranked on the week: hitters by OPS+ (best first),
// pitchers by FIP- (best = lowest first). Each player's week is measured
// against his own level's average.
export function rankPlayers(players: PlayerLines | undefined, baselines: Baselines, mode: Mode) {
  const hitters: number[] = [], pitchers: number[] = [];
  for (const week of players?.values() || []) {
    const o = offenseScore(week, baselines, mode);
    const p = pitchingScore(week, baselines, mode);
    if (o !== null) hitters.push(o);
    if (p !== null) pitchers.push(p);
  }
  hitters.sort((a, b) => b - a);
  pitchers.sort((a, b) => a - b);
  return { hitters, pitchers };
}

// The extra-innings ladder (see the header):
//   #1 hitter vs #1 hitter and #1 pitcher vs #1 pitcher, one run each -
//   whichever of the two both schools can supply; then #2, #3 ... while
//   either matchup exists. Then one hitter-vs-pitcher inning on distance
//   from league average (adjusted mode only). winner null: the commissioner.
function playerTiebreak(
  home: SideWeek,
  away: SideWeek,
  baselines: Baselines,
  rules: Rules,
): { winner: Side | null; rank?: number; cross?: boolean; crossAt?: number; innings: [number, number][] } {
  const h = rankPlayers(home.players ?? mergeLines(home.days), baselines, rules.mode);
  const a = rankPlayers(away.players ?? mergeLines(away.days), baselines, rules.mode);
  const innings: [number, number][] = [];

  for (let k = 0; ; k++) {
    const hitters = k < h.hitters.length && k < a.hitters.length;
    const pitchers = k < h.pitchers.length && k < a.pitchers.length;
    if (!hitters && !pitchers) break;
    const [hx, ax] = hitters ? compareHigher(h.hitters[k], a.hitters[k]) : [0, 0];
    // Lower FIP- wins, so reverse the comparison.
    const [hp, ap] = pitchers ? compareHigher(-h.pitchers[k], -a.pitchers[k]) : [0, 0];
    const inning: [number, number] = [hx + hp, ax + ap];
    innings.push(inning);
    // Every prior tiebreak inning was level, otherwise the game would
    // already have ended. The first non-level one decides it.
    if (inning[0] !== inning[1]) return { winner: inning[0] > inning[1] ? 'home' : 'away', rank: k + 1, innings };
  }

  // Hitter vs pitcher, on the plus scale: a hitter's OPS+ - 100 against a
  // pitcher's 100 - FIP-. Each school's best hitter faces the other's best
  // pitcher; one run per matchup.
  if (rules.mode === 'adjusted') {
    let x = 0, y = 0, any = false;
    if (h.hitters.length && a.pitchers.length) {
      any = true;
      const [p, q] = compareHigher(h.hitters[0] - 100, 100 - a.pitchers[0]);
      x += p; y += q;
    }
    if (a.hitters.length && h.pitchers.length) {
      any = true;
      const [p, q] = compareHigher(100 - h.pitchers[0], a.hitters[0] - 100);
      x += p; y += q;
    }
    if (any) {
      innings.push([x, y]);
      const crossAt = innings.length - 1;
      if (x !== y) return { winner: x > y ? 'home' : 'away', cross: true, crossAt, innings };
      return { winner: null, crossAt, innings };
    }
  }
  return { winner: null, innings };
}

export function volume(buckets: LevelBuckets) {
  let v = 0;
  for (const { bat, pit } of buckets.values()) v += bat.pa + pit.outs / 3;
  return v;
}

// commissioner: the commissioner's decision for a game still tied after
// every extra inning - the side he gave it to, or null while he hasn't
// ruled. Without one such a game comes back with winner null and decidedBy
// 'commissioner' (still to be decided).
// fans: each school's fan base when the game went final [home, away], for
// the fan-base step before the commissioner.
export function playGame(home: SideWeek, away: SideWeek, baselines: Baselines, rules: Rules, allowTie = false, commissioner?: () => Side | null, fans?: [number, number]): GameResult {
  const innings: Inning[] = [];
  for (let d = 0; d < 7; d++) innings.push(scoreInning(d + 1, 'day', home.days[d] || new Map(), away.days[d] || new Map(), baselines, rules));
  const homeWeek = mergeLines(home.days);
  const awayWeek = mergeLines(away.days);
  innings.push(scoreInning(8, 'week', homeWeek, awayWeek, baselines, rules));
  const hw = winPct(home.wins, home.losses);
  const aw = winPct(away.wins, away.losses);
  // A school whose alumni's clubs didn't play counts as .500.
  const [x, y] = hw === null && aw === null ? [0, 0] : compareHigher(hw ?? 0.5, aw ?? 0.5);
  innings.push({ inning: 9, kind: 'wl', home: x, away: y, homeWinPct: hw, awayWinPct: aw });

  let hr = innings.reduce((sum, i) => sum + i.home, 0);
  let ar = innings.reduce((sum, i) => sum + i.away, 0);
  if (hr !== ar) return { innings, home: hr, away: ar, winner: hr > ar ? 'home' : 'away', decidedBy: 'runs' };

  // Ties after 9 become visible extra innings: inning 10 the #1s, 11 the
  // #2s ... then the hitter-vs-pitcher inning (see playerTiebreak).
  const pt = playerTiebreak(home, away, baselines, rules);
  pt.innings.forEach(([h, a], i) => {
    innings.push({ inning: 10 + i, kind: i === pt.crossAt ? 'cross' : 'tiebreak', home: h, away: a });
    hr += h;
    ar += a;
  });
  const tieScore: [number, number] = [
    pt.innings.reduce((sum, x) => sum + x[0], 0),
    pt.innings.reduce((sum, x) => sum + x[1], 0),
  ];

  if (pt.winner) {
    return {
      innings,
      home: hr,
      away: ar,
      winner: pt.winner,
      decidedBy: pt.cross ? 'cross' : 'players',
      tieRank: pt.rank,
      tieScore,
    };
  }

  // Nothing left to compare: the bigger fan base wins, an extra inning worth
  // one run (only for a game being decided - not one still in progress).
  if (!allowTie && fans && fans[0] !== fans[1]) {
    const run: [number, number] = fans[0] > fans[1] ? [1, 0] : [0, 1];
    innings.push({ inning: 10 + pt.innings.length, kind: 'fans', home: run[0], away: run[1] });
    hr += run[0];
    ar += run[1];
    return { innings, home: hr, away: ar, winner: run[0] ? 'home' : 'away', decidedBy: 'fans', tieScore: [tieScore[0] + run[0], tieScore[1] + run[1]] };
  }

  // Even fan bases too: the commissioner decides. His decision is an extra
  // inning worth one run, so a decided game never ends tied.
  const ruling = commissioner?.() ?? null;
  if (ruling) {
    const run: [number, number] = ruling === 'home' ? [1, 0] : [0, 1];
    innings.push({ inning: 10 + pt.innings.length, kind: 'commissioner', home: run[0], away: run[1] });
    hr += run[0];
    ar += run[1];
    return { innings, home: hr, away: ar, winner: ruling, decidedBy: 'commissioner', tieScore: [tieScore[0] + run[0], tieScore[1] + run[1]] };
  }

  if (allowTie) return { innings, home: hr, away: ar, winner: null, decidedBy: 'tie', tieScore };
  return { innings, home: hr, away: ar, winner: null, decidedBy: 'commissioner', tieScore };
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


// Best of 3, all three games always played; the side with more wins
// advances (bracket games never tie, so 2 or 3 wins decides it).
export function playSeries<T>(playWeek: (gameNumber: number) => T & { winner: Side | null }): { games: (T & { winner: Side | null })[]; winner: Side } {
  const games: (T & { winner: Side | null })[] = [];
  let h = 0, a = 0;
  for (let g = 1; g <= 3; g++) {
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

export type PairAffinity = (a: number, b: number) => number;

// Eliminated schools are paired across the full national pool, never by
// region. The eliminated count is always even (1,024 minus the teams still
// alive in the power-of-two bracket), so a bye is a data/logic error.
//
// Pairing stays reproducible: the seed first creates a deterministic shuffle.
// If an affinity callback is supplied, positive-affinity pairs are selected
// first (highest score wins; shuffled order breaks ties), then the remaining
// schools are paired from that seeded shuffle.
export function pairEliminated(teams: number[], seed: string, affinity?: PairAffinity): { pairs: [number, number][] } {
  if (teams.length % 2 !== 0) {
    throw new Error(`Eliminated-school pool must be even; got ${teams.length}. No byes are allowed.`);
  }
  const unique = new Set(teams);
  if (unique.size !== teams.length) throw new Error('Eliminated-school pool contains duplicate schools');

  const pool = shuffle(teams, mulberry32(hashString(seed)));
  const pairs: [number, number][] = [];
  const used = new Set<number>();

  // Evaluate affinity once per possible pair (O(n^2)), not once per greedy
  // iteration. The original iterative scan became cubic at ~1,000 schools.
  if (affinity) {
    const candidates: { a: number; b: number; score: number; order: number }[] = [];
    let order = 0;
    for (let i = 0; i < pool.length - 1; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const score = Number(affinity(pool[i], pool[j])) || 0;
        if (score > 0) candidates.push({ a: pool[i], b: pool[j], score, order });
        order++;
      }
    }
    candidates.sort((x, y) => y.score - x.score || x.order - y.order);
    for (const c of candidates) {
      if (used.has(c.a) || used.has(c.b)) continue;
      pairs.push([c.a, c.b]);
      used.add(c.a);
      used.add(c.b);
    }
  }

  // Everyone without a preferred teammate-linked opponent falls back to the
  // deterministic shuffled order. Because the input count is even and linked
  // matches consume two schools at a time, this remainder is also even.
  const rest = pool.filter((h) => !used.has(h));
  for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);

  return { pairs };
}
