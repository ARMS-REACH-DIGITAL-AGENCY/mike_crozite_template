// src/lib/bracket/engine.test.ts
// Run: npx tsx --test src/lib/bracket/engine.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type Baselines,
  type LevelBuckets,
  type SideWeek,
  addToBuckets,
  bracketOrder,
  emptyBat,
  emptyPit,
  offenseScore,
  pairEliminated,
  pitchingScore,
  playGame,
  playSeries,
  teamOffense,
  teamPitching,
} from './engine';
import { TOURNAMENT_2027, TOURNAMENT_2027_WEEKS, bracketRoundWeeks } from './tournamentCalendar';

const baselines: Baselines = new Map([
  ['MLB', { obp: 0.315, slg: 0.405, fip: 4.1, cfip: 3.1 }],
  ['NJCAA', { obp: 0.4, slg: 0.5, fip: 5.5, cfip: 4.2 }],
]);

function day(level: string, bat: Partial<ReturnType<typeof emptyBat>> = {}, pit: Partial<ReturnType<typeof emptyPit>> = {}): LevelBuckets {
  const b: LevelBuckets = new Map();
  addToBuckets(b, level, { ...emptyBat(), ...bat }, { ...emptyPit(), ...pit });
  return b;
}

const off = (): LevelBuckets => new Map();
const AVG = { mode: 'adjusted', absent: 'average' } as const;
const FORFEIT = { mode: 'adjusted', absent: 'forfeit' } as const;
const HOLD = { mode: 'adjusted', absent: 'hold' } as const;
// Each test day is one player's lines ('p').
const week = (days: LevelBuckets[], wins = 0, losses = 0): SideWeek => ({ days: days.map((d) => new Map(d.size ? [['p', d]] : [])), wins, losses });

test('OPS+ measures each level against its own average', () => {
  // .300/.400 at MLB (OPS .700) beats .380/.480 at juco (OPS .860) once adjusted
  const mlb = day('MLB', { pa: 10, ab: 10, h: 3, d2: 1 }); // OBP .300, SLG .400
  const juco = day('NJCAA', { pa: 50, ab: 50, h: 19, d2: 5 }); // OBP .380, SLG .480
  const m = offenseScore(mlb, baselines, 'adjusted')!;
  const j = offenseScore(juco, baselines, 'adjusted')!;
  assert.ok(m > j, `mlb ${m} should beat juco ${j}`);
  assert.ok(offenseScore(juco, baselines, 'raw')! > offenseScore(mlb, baselines, 'raw')!);
  assert.equal(offenseScore(off(), baselines, 'adjusted'), null);
});

test('FIP- is 100 for a league-average line and lower is better', () => {
  // core = (13*1 + 3*3 - 2*9)/9 = 0.444; +3.1 = 3.54 FIP vs league 4.1
  const good = day('MLB', {}, { outs: 27, hr: 1, bb: 3, so: 9 });
  const v = pitchingScore(good, baselines, 'adjusted')!;
  assert.ok(Math.abs(v - (100 * (4 / 9 + 3.1)) / 4.1) < 1e-9);
  assert.equal(pitchingScore(off(), baselines, 'adjusted'), null);
});

test('zero-out pitching appearances with BB/HBP/HR are scored as bad outings, not absences', () => {
  const disaster = day('MLB', {}, { outs: 0, hr: 1, bb: 2, hbp: 1, so: 0 });
  const v = pitchingScore(disaster, baselines, 'adjusted');
  assert.notEqual(v, null);
  assert.ok(v! > 100, `zero-out disaster should be worse than league average, got ${v}`);

  const team = teamPitching(new Map([['p', disaster]]), baselines, 'adjusted');
  assert.notEqual(team, null);
  assert.ok(team! > 100, `team score should retain the zero-out appearance, got ${team}`);
});

test("the school's OPS+ and FIP- are its players' own, weighted by playing time", () => {
  // MLB, 20 PA, .400 / .600 -> OPS+ 175; juco, 10 PA, .300 / .300 -> OPS+ 35
  const mlb = day('MLB', { pa: 20, ab: 20, h: 8, d2: 4 });
  const juco = day('NJCAA', { pa: 10, ab: 10, h: 3 });
  const a = offenseScore(mlb, baselines, 'adjusted')!;
  const b = offenseScore(juco, baselines, 'adjusted')!;
  assert.ok(Math.abs(a - 175.1) < 0.1 && Math.abs(b - 35) < 1e-9);
  const both = new Map([['a', mlb], ['b', juco]]);
  assert.ok(Math.abs(teamOffense(both, baselines, 'adjusted')! - (a * 20 + b * 10) / 30) < 1e-9); // 128.4
  // pitchers by innings: 6 IP at FIP- x and 3 IP at FIP- y
  const p1 = day('MLB', {}, { outs: 18, so: 8 });
  const p2 = day('MLB', {}, { outs: 9, hr: 2, bb: 3 });
  const x = pitchingScore(p1, baselines, 'adjusted')!, y = pitchingScore(p2, baselines, 'adjusted')!;
  assert.ok(Math.abs(teamPitching(new Map([['a', p1], ['b', p2]]), baselines, 'adjusted')! - (x * 18 + y * 9) / 27) < 1e-9);
  assert.equal(teamOffense(new Map(), baselines, 'adjusted'), null);
});

test('a day off counts as league average, not as a loss', () => {
  const home = week([day('MLB', { pa: 4, ab: 4, h: 0 }), off(), off(), off(), off(), off(), off()]);
  const away = week([off(), off(), off(), off(), off(), off(), off()]);
  const g = playGame(home, away, baselines, AVG);
  // 0-for-4 is below average: the away side (day off = average) takes inning 1's offense run
  assert.equal(g.innings[0].away, 1);
  assert.equal(g.innings[0].home, 0);
  // nobody pitched anywhere: no pitching runs; days 2-7 score nothing
  for (let i = 1; i < 7; i++) assert.deepEqual([g.innings[i].home, g.innings[i].away], [0, 0]);
});

test("forfeit rule: a school with no one playing can't win the comparison", () => {
  const home = week([day('MLB', { pa: 4, ab: 4, h: 0 }), off(), off(), off(), off(), off(), off()]);
  const away = week([off(), off(), off(), off(), off(), off(), off()]);
  const g = playGame(home, away, baselines, FORFEIT);
  assert.deepEqual([g.innings[0].home, g.innings[0].away], [1, 0]);
  // and the week inning too: the away side never played
  assert.deepEqual([g.innings[7].home, g.innings[7].away], [1, 0]);
});

test('hold rule: the absent school never scores; the one that played must beat average', () => {
  const cold = week([day('MLB', { pa: 4, ab: 4, h: 0 }), off(), off(), off(), off(), off(), off()]);
  const hot = week([day('MLB', { pa: 4, ab: 4, h: 2, hr: 1 }), off(), off(), off(), off(), off(), off()]);
  const idle = week([off(), off(), off(), off(), off(), off(), off()]);
  const a = playGame(cold, idle, baselines, HOLD);
  assert.deepEqual([a.innings[0].home, a.innings[0].away], [0, 0]);
  const b = playGame(hot, idle, baselines, HOLD);
  assert.deepEqual([b.innings[0].home, b.innings[0].away], [1, 0]);
});

test('nine innings: 7 days, the week, then W-L%', () => {
  const hot = day('MLB', { pa: 5, ab: 4, h: 3, hr: 1, bb: 1 }, { outs: 18, so: 8 });
  const cold = day('MLB', { pa: 5, ab: 5, h: 0 }, { outs: 9, hr: 2, bb: 3 });
  const g = playGame(week(Array(7).fill(hot), 5, 2), week(Array(7).fill(cold), 2, 5), baselines, AVG);
  assert.equal(g.innings.length, 9);
  assert.equal(g.home, 17); // 7 days x 2 + week 2 + W-L 1
  assert.equal(g.away, 0);
  assert.equal(g.winner, 'home');
  assert.equal(g.innings[8].kind, 'wl');
});

test('two-way players contribute batting and pitching, but their team W-L counts once', () => {
  const twoWay = day('MLB', { pa: 5, ab: 4, h: 3, hr: 1, bb: 1 }, { outs: 18, so: 8 });
  const idle = Array(7).fill(null).map(() => off());
  const g = playGame(week([twoWay, ...idle.slice(1)], 1, 0), week(idle, 0, 1), baselines, HOLD);

  assert.deepEqual([g.innings[0].home, g.innings[0].away], [2, 0]);
  assert.deepEqual([g.innings[7].home, g.innings[7].away], [2, 0]);
  assert.deepEqual([g.innings[8].home, g.innings[8].away], [1, 0]);
  assert.equal(g.home, 5);
});

// Each alumnus's week for the player-vs-player tiebreak.
const roster = (...weeks: LevelBuckets[]) => new Map(weeks.map((w, i) => [`p${i}`, w]));
const hitter = (h: number, hr = 0) => day('MLB', { pa: 10, ab: 10, h, hr }); // more hits = higher OPS+
const pitcher = (so: number) => day('MLB', {}, { outs: 18, so }); // more K = lower FIP-
const idleWeek = () => Array(7).fill(null).map(() => off());
// A 0-0 game after 9 (no day stats), with the players' weeks given separately.
const tied = (players: Map<string, LevelBuckets>): SideWeek => ({ ...week(idleWeek()), players });

test("ties: nothing to compare - the commissioner decides, or a tie on the leaderboard", () => {
  const same = idleWeek();
  // W-L inning gives home the only run - no tie at all
  const a = playGame(week(same, 3, 1), week(same, 1, 3), baselines, AVG);
  assert.equal(a.winner, 'home');
  assert.equal(a.decidedBy, 'runs');
  // the commissioner's decision is an extra inning worth one run
  const b = playGame(week(same), week(same), baselines, AVG, false, () => 'away');
  assert.equal(b.winner, 'away');
  assert.equal(b.decidedBy, 'commissioner');
  assert.deepEqual([b.home, b.away], [0, 1]);
  assert.equal(b.innings.length, 10);
  assert.equal(b.innings[9].kind, 'commissioner');
  // no ruling yet: no winner until the commissioner decides
  const pending = playGame(week(same), week(same), baselines, AVG, false, () => null);
  assert.equal(pending.winner, null);
  assert.equal(pending.decidedBy, 'commissioner');
  const c = playGame(week(same), week(same), baselines, AVG, true);
  assert.equal(c.winner, null);
  assert.equal(c.decidedBy, 'tie');
});

test("tiebreak: best hitter vs best hitter and best pitcher vs best pitcher; winning both takes it", () => {
  const g = playGame(tied(roster(hitter(5), hitter(1), pitcher(10))), tied(roster(hitter(4), pitcher(6), pitcher(9))), baselines, HOLD);
  assert.deepEqual([g.home, g.away], [2, 0]);
  assert.equal(g.decidedBy, 'players');
  assert.equal(g.tieRank, 1);
  assert.deepEqual(g.tieScore, [2, 0]);
  assert.equal(g.innings.length, 10);
  assert.deepEqual([g.innings[9].home, g.innings[9].away], [2, 0]);
  assert.equal(g.winner, 'home');
});

test('tiebreak: 1-1 on #1 advances to #2 and cumulative player runs decide it', () => {
  // #1: home's hitter better (5 hits vs 4), away's pitcher better (12 K vs 10) -> 1-1
  // #2: away's hitter better (3 vs 2) and away's pitcher better (9 K vs 7) -> cumulative 1-3
  const home = roster(hitter(5), hitter(2), pitcher(10), pitcher(7));
  const away = roster(hitter(4), hitter(3), pitcher(12), pitcher(9));
  const g = playGame(tied(home), tied(away), baselines, HOLD);
  assert.deepEqual([g.home, g.away], [1, 3]);
  assert.equal(g.decidedBy, 'players');
  assert.equal(g.tieRank, 2);
  assert.deepEqual(g.tieScore, [1, 3]);
  assert.equal(g.innings.length, 11);
  assert.deepEqual([g.innings[9].home, g.innings[9].away], [1, 1]);
  assert.deepEqual([g.innings[10].home, g.innings[10].away], [0, 2]);
  assert.equal(g.winner, 'away');
});

test('extra innings: hitters only - the hitters decide it, no pitchers needed', () => {
  // Neither school has a pitcher: #1 hitter vs #1 hitter is still played.
  const g = playGame(tied(roster(hitter(5))), tied(roster(hitter(3))), baselines, HOLD);
  assert.equal(g.winner, 'home');
  assert.equal(g.decidedBy, 'players');
  assert.equal(g.tieRank, 1);
  assert.deepEqual([g.innings[9].home, g.innings[9].away], [1, 0]);
});

test('extra innings: both below league average - the better number still wins', () => {
  // 1-for-10 vs 2-for-10: both far below 100 OPS+, but the 2-for-10 wins the run.
  const g = playGame(tied(roster(hitter(1))), tied(roster(hitter(2))), baselines, HOLD);
  assert.equal(g.winner, 'away');
  assert.deepEqual([g.innings[9].home, g.innings[9].away], [0, 1]);
});

test('extra innings: one matchup at a rank is enough; the missing one scores nothing', () => {
  // Only home has a hitter; both have a pitcher. The pitchers decide inning 10.
  const g = playGame(tied(roster(hitter(5), pitcher(10))), tied(roster(pitcher(6))), baselines, HOLD);
  assert.equal(g.winner, 'home');
  assert.equal(g.decidedBy, 'players');
  assert.deepEqual([g.innings[9].home, g.innings[9].away], [1, 0]);
});

test('extra innings: hitter vs pitcher when there is no same-type matchup (closer to league average wins)', () => {
  // Gilman at Hendricken, Week 1: away's only player went 0-for-1 (-100 OPS+,
  // 200 below average); home's only player is a pitcher below average
  // (FIP- about 145, 45 below). The pitcher is closer: home scores.
  const coldBat = day('MLB', { pa: 1, ab: 1 });
  const shakyArm = day('MLB', {}, { outs: 18, hr: 1, bb: 2, so: 1 });
  const g = playGame(tied(roster(shakyArm)), tied(roster(coldBat)), baselines, HOLD);
  assert.equal(g.winner, 'home');
  assert.equal(g.decidedBy, 'cross');
  assert.equal(g.innings[9].kind, 'cross');
  assert.deepEqual([g.innings[9].home, g.innings[9].away], [1, 0]);
  // A hot hitter (143 OPS+, 43 above) beats the same pitcher.
  const hotBat = day('MLB', { pa: 10, ab: 10, h: 3, hr: 1 });
  const h = playGame(tied(roster(shakyArm)), tied(roster(hotBat)), baselines, HOLD);
  assert.equal(h.winner, 'away');
  assert.equal(h.decidedBy, 'cross');
});

test('extra innings: hitter vs pitcher continues inning by inning with the unmatched players', () => {
  // No same-type matchups: home has two pitchers, away two hitters, so the
  // 10th inning is already hitter vs pitcher and labeled 'cross'.
  const hotBat = day('MLB', { pa: 10, ab: 10, h: 3, hr: 1 });
  const coldBat = day('MLB', { pa: 10, ab: 10, h: 1 });
  const shakyArm = day('MLB', {}, { outs: 18, hr: 1, bb: 2, so: 1 });
  const goodArm = day('MLB', {}, { outs: 18, so: 8 });
  const g = playGame(tied(roster(goodArm, shakyArm)), tied(roster(hotBat, coldBat)), baselines, HOLD, false, () => null);
  assert.equal(g.innings[9].kind, 'cross');
  assert.equal(g.decidedBy, 'cross');
  assert.ok(g.winner === 'home' || g.winner === 'away');
});

test('extra innings: #1s split, nothing left at #2 - the hitter-vs-pitcher inning comes next', () => {
  // #1: home's hitter better (5 hits vs 4), away's pitcher better (12 K vs 10) -> 1-1.
  // Away has no #2s, so inning 11 is hitter vs pitcher.
  const home = roster(hitter(5), hitter(4, 1), pitcher(10), pitcher(7));
  const away = roster(hitter(4), pitcher(12));
  const g = playGame(tied(home), tied(away), baselines, HOLD, false, () => null);
  assert.deepEqual([g.innings[9].home, g.innings[9].away], [1, 1]);
  assert.equal(g.innings[10].kind, 'cross');
  assert.ok(g.decidedBy === 'cross' || g.decidedBy === 'commissioner');
});

test('extra innings: nothing left to compare - the bigger fan base wins, then the commissioner', () => {
  const coldDay = day('MLB', { pa: 12, ab: 12, h: 1 });
  const cold: SideWeek = { ...week([coldDay, off(), off(), off(), off(), off(), off()]), players: roster(coldDay) };
  const idle = tied(new Map());
  // away has more registered fans: away wins the fan-base inning
  const g = playGame(cold, idle, baselines, HOLD, false, () => 'home', [3, 10]);
  assert.equal(g.winner, 'away');
  assert.equal(g.decidedBy, 'fans');
  assert.equal(g.innings[9].kind, 'fans');
  assert.deepEqual([g.home, g.away], [0, 1]);
  // even fan bases: on to the commissioner
  const c = playGame(cold, idle, baselines, HOLD, false, () => 'home', [4, 4]);
  assert.equal(c.decidedBy, 'commissioner');
  assert.equal(c.winner, 'home');
  // a game still in progress is never settled by fans
  const live = playGame(cold, idle, baselines, HOLD, true, undefined, [3, 10]);
  assert.equal(live.decidedBy, 'tie');
});

test("extra innings: a school with no one in action - the commissioner decides", () => {
  // Nobody to match against, the same way or the other way: no extra innings.
  const coldDay = day('MLB', { pa: 12, ab: 12, h: 1 });
  const cold: SideWeek = { ...week([coldDay, off(), off(), off(), off(), off(), off()]), players: roster(coldDay) };
  const idle = tied(new Map());
  const pending = playGame(cold, idle, baselines, HOLD, false, () => null);
  assert.equal(pending.winner, null);
  assert.equal(pending.decidedBy, 'commissioner');
  const g = playGame(cold, idle, baselines, HOLD, false, () => 'home');
  assert.deepEqual([g.home, g.away], [1, 0]);
  assert.equal(g.winner, 'home');
  assert.equal(g.decidedBy, 'commissioner');
});

test("inning 9: every alumnus's real team record for the week, college or pro, summed", () => {
  // 10 players whose teams each went 3-4 = 30-40 (.429) vs 31-39 (.443): away gets the run
  const same = Array(7).fill(null).map(() => off());
  const g = playGame(week(same, 30, 40), week(same, 31, 39), baselines, HOLD);
  assert.deepEqual([g.innings[8].home, g.innings[8].away], [0, 1]);
});

test('bracket order keeps top seeds apart', () => {
  assert.deepEqual(bracketOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const o = bracketOrder(128);
  assert.equal(o.length, 128);
  assert.deepEqual(o.slice(0, 4), [1, 128, 64, 65]);
  assert.equal(new Set(o).size, 128);
});

test('the 1,024-school bracket is one continuous 10-round tree', () => {
  let alive = Array.from({ length: 1024 }, (_, i) => i + 1);
  const seriesByRound: number[] = [];
  for (let round = 1; round <= 10; round++) {
    seriesByRound.push(alive.length / 2);
    alive = alive.filter((_, i) => i % 2 === 0);
  }
  assert.deepEqual(seriesByRound, [512, 256, 128, 64, 32, 16, 8, 4, 2, 1]);
  assert.equal(alive.length, 1);
});

test('best of 3: all three games are always played', () => {
  const seq = ['home', 'home', 'away'] as const;
  const s = playSeries((g) => ({ winner: seq[g - 1] }));
  assert.equal(s.games.length, 3);
  assert.equal(s.winner, 'home');
  const t = playSeries((g) => ({ winner: (['home', 'away', 'away'] as const)[g - 1] }));
  assert.equal(t.games.length, 3);
  assert.equal(t.winner, 'away');
});

test('eliminated pairings are deterministic, national, and never allow a bye', () => {
  const teams = [1, 2, 3, 4, 5, 6];
  const a = pairEliminated(teams, 'round-5');
  const b = pairEliminated(teams, 'round-5');
  assert.deepEqual(a, b);
  assert.equal(a.pairs.length, 3);
  assert.equal(new Set(a.pairs.flat()).size, 6);
  assert.throws(() => pairEliminated([1, 2, 3], 'odd-pool'), /No byes are allowed/);
});

test('eliminated pairings prefer real-world teammate links before random fallback', () => {
  const teams = [1, 2, 3, 4, 5, 6];
  const links = new Map([
    ['1:6', 2],
    ['2:5', 1],
  ]);
  const affinity = (a: number, b: number) => links.get(`${Math.min(a, b)}:${Math.max(a, b)}`) || 0;
  const { pairs } = pairEliminated(teams, 'teammate-links', affinity);
  const normalized = pairs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]);
  assert.ok(normalized.some(([a, b]) => a === 1 && b === 6));
  assert.ok(normalized.some(([a, b]) => a === 2 && b === 5));
  assert.equal(new Set(pairs.flat()).size, 6);
});


test('2027 master calendar is exactly Monday Feb 1 through Sunday Sep 26 across 34 weeks', () => {
  assert.equal(TOURNAMENT_2027.start, '2027-02-01');
  assert.equal(TOURNAMENT_2027.end, '2027-09-26');
  assert.equal(TOURNAMENT_2027_WEEKS.length, 34);
  assert.deepEqual(TOURNAMENT_2027_WEEKS[0], ['2027-02-01', '2027-02-07']);
  assert.deepEqual(TOURNAMENT_2027_WEEKS[29], ['2027-08-23', '2027-08-29']);
  assert.deepEqual(TOURNAMENT_2027_WEEKS[30], ['2027-08-30', '2027-09-05']);
  assert.deepEqual(TOURNAMENT_2027_WEEKS[31], ['2027-09-06', '2027-09-12']);
  assert.deepEqual(TOURNAMENT_2027_WEEKS[32], ['2027-09-13', '2027-09-19']);
  assert.deepEqual(TOURNAMENT_2027_WEEKS[33], ['2027-09-20', '2027-09-26']);
  assert.deepEqual(bracketRoundWeeks(1), [1, 3]);
  assert.deepEqual(bracketRoundWeeks(10), [28, 30]);
});
