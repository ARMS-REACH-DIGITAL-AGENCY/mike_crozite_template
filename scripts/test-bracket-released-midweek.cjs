'use strict';
// Pete, Nov 24 2026: a player released mid-week (FREE AGENT from Thursday)
// keeps his Monday-Wednesday games in that week's totals; his days from the
// release on don't count (no lines, no club W-L). Released before a week, he
// is off the school's team that week. No database/network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const modules = new Map();
function load(file) {
  const absolute = path.resolve(root, file);
  if (modules.has(absolute)) return modules.get(absolute);
  const exports = {};
  modules.set(absolute, exports);
  const js = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', js)(exports, id => {
    if (id === './schoolSeason') return { setLiveInning() {} };
    if (id === './inAction') return { setInAction() {} };
    if (id === '@/lib/bracket/fetchLiveBatches') return { fetchBracketLiveBatches() { throw Error('This scorer test must not fetch data'); } };
    const target = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(absolute), id);
    return load(target + '.ts');
  });
  return exports;
}
const { scoreLive } = load('src/components/bracket/liveSeason.ts');
const YANKEES = 'New York Yankees';
const player = 'YAT083773';
const lines = [
  ['5004',player,0,'b',[4,4,2,0,0,0,0,0,0],'g0',YANKEES,1,'MLB'],
  ['5004',player,1,'b',[4,3,1,1,0,0,1,0,0],'g1',YANKEES,1,'MLB'],
  ['5004',player,2,'b',[3,3,0,0,0,0,0,0,0],'g2',YANKEES,1,'MLB'],
  // A line after the release: the live route turns it into a 'back on a team' day.
  ['5004',player,4,'b',[4,4,4,0,0,4,0,0,0],'g4',YANKEES,1,'MLB'],
];
const clubs = { [YANKEES]: [[0,'g0',1,2],[1,'g1',1,3],[2,'g2',0,-1],[3,'g3',1,1],[4,'g4',1,6],[5,'g5',1,2],[6,'g6',1,4]] };
function run(released, back) {
  const game = [1,1,5004,25,'',[],null];
  const index = { season:2026, weeks:[['2026-08-17','2026-08-23']],
    schools:{5004:['Hamilton',1,1],25:['Opponent control',1,2]},
    rounds:[{r:1,name:'Round 1',start:'2026-08-17',end:'2026-08-23',series:[[1,5004,25,1,2,0,[0,0],[game]]]}],
    lbt:[],gf:[],champion:0,lbLeaders:[],lbChampion:0,grandChampion:0 };
  const entry = [player,'Cody Bellinger','MLB',0,''];
  if (released != null) entry.push(released);
  if (back != null) entry.push(back);
  const live = { asOf:'2026-08-24', roster:{5004:[entry],25:[]}, lines:structuredClone(lines), clubs:structuredClone(clubs), games:{}, fans:{} };
  return scoreLive(index,live,'2026-08-24')['1'];
}
// Released Thursday (day 3): Monday-Wednesday count.
const mid = run(3);
const week = mid.h.p.find(p => p[0] === player);
assert.ok(week, 'he stays in that week');
assert.deepEqual(week[4], [11,10,3,1,0,0,1,0,0], 'week batting = Monday-Wednesday only');
assert.deepEqual(mid.h.wl, [2,1], 'club W-L Monday-Wednesday only');
for (const d of [3,4,5,6]) {
  const row = mid.h.days[d].find(p => p[0] === player);
  assert.deepEqual(row ? row[8] : [0,0], [0,0], 'no W-L from his release day on (day ' + d + ')');
}
assert.ok(mid.h.days[0].some(p => p[0] === player && p[4] && p[4][2] === 2), 'Monday line counts');
// Released before the week: off the team.
const before = run(0);
assert.equal(before.h.p.some(p => p[0] === player), false, 'released before the week: not on the team');
assert.deepEqual(before.h.wl, [0,0]);
// Pete, Nov 24 2026: a stat line beats any status. Released Thursday, then a game
// line Friday: back on a team from Friday (his Friday line and club W-L count again).
const backFriday = run(3, 4);
const wk = backFriday.h.p.find(p => p[0] === player);
assert.deepEqual(wk[4], [15,14,7,1,0,4,1,0,0], 'Monday-Wednesday plus the Friday line');
assert.deepEqual(backFriday.h.wl, [5,1], 'club W-L Mon-Wed and Fri-Sun, not Thursday');
assert.deepEqual((backFriday.h.days[3].find(p => p[0] === player) || [])[8] || [0,0], [0,0], 'Thursday (released): no W-L');
// A free agent before the week who plays Friday counts from Friday on.
const faPlays = run(-1, 4);
const fa = faPlays.h.p.find(p => p[0] === player);
assert.ok(fa, 'a free agent with a game line is on the team');
assert.deepEqual(fa[4], [4,4,4,0,0,4,0,0,0], 'only his Friday line');
assert.deepEqual(faPlays.h.wl, [3,0], 'club W-L Friday-Sunday');
console.log('PASS a mid-week release keeps his earlier games; a stat line beats any status: a new line puts him back on a team from that day');
