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
} from './engine';

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
const week = (days: LevelBuckets[], wins = 0, losses = 0, seed = 1): SideWeek => ({ days, wins, losses, seed });

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

// Each alumnus's week for the player-vs-player tiebreak.
const roster = (...weeks: LevelBuckets[]) => new Map(weeks.map((w, i) => [`p${i}`, w]));
const hitter = (h: number, hr = 0) => day('MLB', { pa: 10, ab: 10, h, hr }); // more hits = higher OPS+
const pitcher = (so: number) => day('MLB', {}, { outs: 18, so }); // more K = lower FIP-
const idleWeek = () => Array(7).fill(null).map(() => off());
// A 0-0 game after 9 (no day stats), with the players' weeks given separately.
const tied = (players: Map<string, LevelBuckets>, seed = 1): SideWeek => ({ ...week(idleWeek(), 0, 0, seed), players });

test('ties: no players to compare - seed in the bracket, a tie on the leaderboard', () => {
  const same = idleWeek();
  // W-L inning gives home the only run - no tie at all
  const a = playGame(week(same, 3, 1, 5), week(same, 1, 3, 2), baselines, AVG);
  assert.equal(a.winner, 'home');
  assert.equal(a.decidedBy, 'runs');
  const b = playGame(week(same, 0, 0, 5), week(same, 0, 0, 2), baselines, AVG);
  assert.equal(b.winner, 'away');
  assert.equal(b.decidedBy, 'seed');
  const c = playGame(week(same, 0, 0, 5), week(same, 0, 0, 2), baselines, AVG, true);
  assert.equal(c.winner, null);
  assert.equal(c.decidedBy, 'tie');
});

test("tiebreak: best hitter vs best hitter and best pitcher vs best pitcher; winning both takes it", () => {
  const g = playGame(tied(roster(hitter(5), hitter(1), pitcher(10))), tied(roster(hitter(4), pitcher(6), pitcher(9))), baselines, HOLD);
  assert.deepEqual([g.home, g.away], [0, 0]);
  assert.equal(g.decidedBy, 'players');
  assert.equal(g.tieRank, 1);
  assert.equal(g.winner, 'home');
});

test('tiebreak: 1-1 on the best pair goes down to the #2 hitters and #2 pitchers', () => {
  // #1: home's hitter better (5 hits vs 4), away's pitcher better (12 K vs 10) -> 1-1
  // #2: away's hitter better (3 vs 2) and away's pitcher better (9 K vs 7) -> away 2-0
  const home = roster(hitter(5), hitter(2), pitcher(10), pitcher(7));
  const away = roster(hitter(4), hitter(3), pitcher(12), pitcher(9));
  const g = playGame(tied(home), tied(away), baselines, HOLD);
  assert.equal(g.decidedBy, 'players');
  assert.equal(g.tieRank, 2);
  assert.equal(g.winner, 'away');
});

test("tiebreak: a player with no one left to face counts only by beating league average", () => {
  // #1 split 1-1; home has a #2 hitter, away doesn't
  const top = [hitter(5), pitcher(10)];
  const awayTop = roster(hitter(4), pitcher(12));
  // 1-for-10 is below average: no run, rosters run out level -> seed
  const cold = playGame(tied(roster(...top, hitter(1)), 5), tied(awayTop, 2), baselines, HOLD);
  assert.equal(cold.decidedBy, 'seed');
  assert.equal(cold.winner, 'away');
  // 4-for-10 with a homer is above average: home takes it at #2
  const hot = playGame(tied(roster(...top, hitter(4, 1)), 5), tied(awayTop, 2), baselines, HOLD);
  assert.equal(hot.decidedBy, 'players');
  assert.equal(hot.tieRank, 2);
  assert.equal(hot.winner, 'home');
});

test("a school with nobody playing can't win a tie against one that played", () => {
  // Hamilton plays below average all week (no runs); Basha has nobody: 0-0
  const coldDay = day('MLB', { pa: 12, ab: 12, h: 1 });
  const cold: SideWeek = { ...week([coldDay, off(), off(), off(), off(), off(), off()], 0, 0, 5), players: roster(coldDay) };
  const idle = tied(new Map(), 1);
  const g = playGame(cold, idle, baselines, HOLD);
  assert.deepEqual([g.home, g.away], [0, 0]);
  assert.equal(g.winner, 'home');
  assert.equal(g.decidedBy, 'players');
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

test('best of 3: all three games are always played', () => {
  const seq = ['home', 'home', 'away'] as const;
  const s = playSeries((g) => ({ winner: seq[g - 1] }));
  assert.equal(s.games.length, 3);
  assert.equal(s.winner, 'home');
  const t = playSeries((g) => ({ winner: (['home', 'away', 'away'] as const)[g - 1] }));
  assert.equal(t.games.length, 3);
  assert.equal(t.winner, 'away');
});

test('eliminated pairings are fixed by the seed and give one bye when odd', () => {
  const teams = [1, 2, 3, 4, 5];
  const played = new Map([[3, 4]]);
  const a = pairEliminated(teams, played, 'w5-r1');
  const b = pairEliminated(teams, played, 'w5-r1');
  assert.deepEqual(a, b);
  assert.equal(a.bye, 3);
  assert.equal(a.pairs.length, 2);
  assert.equal(new Set(a.pairs.flat()).size, 4);
});
