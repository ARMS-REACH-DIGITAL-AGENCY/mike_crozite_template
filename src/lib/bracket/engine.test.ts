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

test('ties: week OPS+, then week FIP-, then W-L%, then seed; leaderboard games may tie', () => {
  const same = Array(7).fill(null).map(() => off());
  // W-L inning gives home the only run - no tie at all
  const a = playGame(week(same, 3, 1, 5), week(same, 1, 3, 2), baselines, AVG);
  assert.equal(a.winner, 'home');
  assert.equal(a.decidedBy, 'runs');
  // identical weeks: nothing to break it but the seed
  const b = playGame(week(same, 0, 0, 5), week(same, 0, 0, 2), baselines, AVG);
  assert.equal(b.winner, 'away');
  assert.equal(b.decidedBy, 'seed');
  const c = playGame(week(same, 0, 0, 5), week(same, 0, 0, 2), baselines, AVG, true);
  assert.equal(c.winner, null);
  assert.equal(c.decidedBy, 'tie');
  // 1-1 after 9 (home wins the week's OPS+, away the week's FIP-, days split the same way):
  // the week's OPS+ decides it, however many alumni either side has
  const homeBat = day('MLB', { pa: 4, ab: 4, h: 2, hr: 1 });
  const awayPit = day('MLB', {}, { outs: 27, so: 12 });
  const d = playGame(week([homeBat, off(), off(), off(), off(), off(), off()]), week([awayPit, off(), off(), off(), off(), off(), off()]), baselines, HOLD);
  assert.equal(d.home, d.away);
  assert.equal(d.decidedBy, 'ops');
  assert.equal(d.winner, 'home');
});

test("a school with nobody playing can't win a tie against one that played", () => {
  // Hamilton plays below average all week (no runs); Basha has nobody: 0-0
  const cold = week([day('MLB', { pa: 12, ab: 12, h: 1 }), off(), off(), off(), off(), off(), off()], 0, 0, 5);
  const idle = week([off(), off(), off(), off(), off(), off(), off()], 0, 0, 1);
  const g = playGame(cold, idle, baselines, HOLD);
  assert.deepEqual([g.home, g.away], [0, 0]);
  assert.equal(g.winner, 'home');
  assert.equal(g.decidedBy, 'ops');
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
