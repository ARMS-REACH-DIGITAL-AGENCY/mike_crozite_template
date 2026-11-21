// 2026 historical replay: no full-season reconstruction per game, preserve
// the historical player roster and the daily stats behind all 1,024 schools.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const route = source('src/app/api/sim-2026-ledger/route.ts');
const gallery = source('src/components/bracket/gallery.tsx');
const engine = source('src/components/bracket/liveSeason.ts');
const school = source('src/components/bracket/SchoolBracket.tsx');
const timeline = source('src/components/bracket/FantasyTimeline.tsx');
const idx = JSON.parse(source('public/replay-2026/index.json'));
const lb = [...JSON.parse(source('public/replay-2026/lb-a.json')), ...JSON.parse(source('public/replay-2026/lb-b.json'))];
const gameIds = new Set();
for (const round of idx.rounds) for (const series of round.series) for (const game of series[7]) {
  assert.ok(!gameIds.has(game[0]), 'Duplicate frozen bracket game ID');
  gameIds.add(game[0]);
}
for (const game of [...lb.map((x) => x.slice(0, 7)), ...idx.lbt.map((x) => x.game), ...idx.gf]) {
  assert.ok(!gameIds.has(game[0]), 'Duplicate frozen postseason/leaderboard game ID');
  gameIds.add(game[0]);
}
assert.equal(gameIds.size, 15368, 'All 15,368 frozen games must be addressable individually');
assert.equal(Object.keys(idx.schools).length, 1024);
assert.equal(idx.weeks.length, 34);
assert.ok(gameIds.has(149), 'Marina round 1 game 2 has a historical ledger');
assert.ok(gameIds.has(1), 'Pacifica and Orange Lutheran round 1 opener retained');
assert.ok(gameIds.has(1611), 'Marina round 2 game 3 has a historical ledger');
assert.match(route, /if \(process\.env\.VERCEL_ENV === 'production'\)/);
assert.match(route, /fetchBracketLiveBatches\([\s\S]*?weekStart, 1, \[home, away\]/);
assert.ok(route.includes('rebaseReplayWeek(recent, offsetDays, week)'), 'Rebase seven-day source to tournament calendar');
const rebase = source('src/app/api/sim-2026-ledger/rebaseReplayWeek.ts');
assert.ok(rebase.includes('shift(line[2])'), 'Daily stat lines are moved onto their tournament days');
assert.ok(rebase.includes('shift(row[0])'), 'Club wins and game scheduling retain dates');
assert.ok(rebase.includes('index === week - 1'), 'Fan totals retain their original week');
assert.match(route, /JSON\.stringify\(copy\[5\]\.slice\(0, 18\)\)/);
assert.ok(!route.includes('computeSeason('), 'Game ledger must never run a full-season simulation');
assert.ok(gallery.includes('replayGameBoxCache'));
assert.ok(gallery.includes("fetch('/api/sim-2026-ledger?game='"));
assert.ok(gallery.includes('const mineRoster = replayMode() ? undefined'), 'Historical roster must not be replaced with current roster');
assert.ok(gallery.includes('rawMine?.days?.[statDay]'), 'Daily game lines stay available');
assert.ok(engine.includes('x: result.innings.slice(0, 8)'), 'Store the engine exact values alongside legacy rounded display');
assert.ok(gallery.includes('const metricAt = (i: number) => boxForView?.x?.[i] || boxForView?.d?.[i]'), 'Highlight with unrounded data');
assert.ok(gallery.includes('cellClass(i, idx, raw?.[idx], raw?.[opp], higher)'), 'Gold must use unrounded numbers');
assert.ok(gallery.includes('bl-tb-precision-note'), 'Explain visually equal rounded values');
assert.ok(gallery.includes('correctedInnings[16 + side]'), 'Inning nine highlight follows locked run');
assert.ok(gallery.includes("if (!replayMode()) {"), 'Replay game loading must not bypass exact-value ledger');
const ortiz = 100 * ((.4 / .316) + (.25 / .399) - 1);
const romero = 100 * ((.4 / .350) + ((2 / 3) / .421) - 1);
const ricketts = 100 * ((.2 / .350) + (.2 / .421) - 1);
const orange = (romero * 5 + ricketts * 5) / 10;
assert.equal(Math.round(ortiz), 89);
assert.equal(Math.round(orange), 89);
assert.ok(ortiz > orange, 'Pacifica wins rounded-equal fifth inning OPS+');
assert.equal(+(ortiz - orange).toFixed(3), .595);
assert.ok(school.includes('loadGameBox(card.file, g[0])'));
assert.ok(school.includes("boxStatus === 'error'"), 'A missing ledger must not silently look like no stats');
assert.ok(timeline.includes('stageKeyForWeek(c.week) === stage'), 'Fetch only the selected round, not all 34 weeks at once');
console.log('PASS: full frozen field, all 15,368 game IDs, two-school historical ledger, complete daily stats, read-only boundary, and lazy native UI.');
