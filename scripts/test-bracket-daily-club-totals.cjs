'use strict';
// PIPELINE regression: a weekly Stat Ledger must sum its own daily club
// assignments, including an off day after a player's last known assignment.
// Historical inputs below were read from the isolated production copy:
// YAT083773, Aug 17-23 2026. No database/network access or official writes.
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
const YANKEES = 'New York Yankees', RAILRIDERS = 'Scranton/Wilkes-Barre RailRiders';
const player = 'YAT083773';
const originalLines = [
  ['5004',player,3,'b',[3,3,1,0,0,0,0,0,0],'815792',RAILRIDERS,1,'AAA'],
  ['5004',player,4,'b',[3,3,0,0,0,0,0,0,0],'815790',RAILRIDERS,1,'AAA'],
  ['5004',player,6,'b',[4,4,1,0,0,0,0,0,0],'823507',YANKEES,1,'MLB'],
];
const clubs = {
  [YANKEES]: [[1,'ny-18',1,2],[2,'ny-19',1,2],[3,'ny-20',1,5],[4,'ny-21',1,2],[5,'ny-22',0,-1],[6,'823507',1,5]],
  [RAILRIDERS]: [[1,'swb-18',0,-1],[2,'swb-19',0,-5],[3,'815792',1,2],[4,'815790',1,2],[5,'swb-22',0,-3],[6,'swb-23',1,4]],
};
function run(asof, lines = originalLines) {
  const game = [1,1,5004,25,'',[],null];
  const index = { season:2026, weeks:[['2026-08-17','2026-08-23']],
    schools:{5004:['Hamilton',1,1],25:['Opponent control',1,2]},
    rounds:[{r:1,name:'Round 1',start:'2026-08-17',end:'2026-08-23',series:[[1,5004,25,1,2,0,[0,0],[game]]]}],
    lbt:[],gf:[],champion:0,lbLeaders:[],lbChampion:0,grandChampion:0 };
  const live = { asOf:asof, roster:{5004:[[player,'Cody Bellinger','MLB',0,YANKEES]],25:[]},
    lines:structuredClone(lines),clubs:structuredClone(clubs),games:{},fans:{} };
  const box = scoreLive(index,live,asof)['1'];
  return {game,box};
}
const finished = run('2026-08-24');
const friday = run('2026-08-21');
// Control: one club for the entire input. Uses the unchanged real Yankees
// line only, to isolate preservation of ordinary single-club scoring.
const singleClub = run('2026-08-24',originalLines.filter(line=>line[6]===YANKEES));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
if(process.argv.includes('--baseline')) {
  console.log(JSON.stringify({finished:{wl:finished.box.h.wl,rd:finished.box.h.rd},friday:{wl:friday.box.h.wl,rd:friday.box.h.rd},singleClub:{wl:singleClub.box.h.wl,rd:singleClub.box.h.rd,digest:digest(singleClub)}},null,2));
  process.exit(0);
}
assert.deepEqual(finished.box.h.wl,[5,1]);
assert.equal(finished.box.h.rd,10,'Final weekly run differential must sum the Yankees/RailRiders days, not the final club all week');
assert.deepEqual(friday.box.h.wl,[4,0],'The Friday ledger must include the Yankees wins before the rehab assignment');
assert.equal(friday.box.h.rd,8,'A reached-day total excludes future Saturday/Sunday outcomes');
for(const {box} of [finished,friday,singleClub]) {
  const daily=box.h.days.reduce((totals,rows)=>{const wl=rows[0][8];totals[0]+=wl[0];totals[1]+=wl[1];return totals;},[0,0]);
  assert.deepEqual(box.h.wl,daily,'School weekly W-L equals the seven daily ledgers');
  assert.deepEqual(box.h.p[0][8],daily,'Player weekly W-L equals his seven daily ledgers');
}
assert.deepEqual(friday.box.h.days[5][0][8],[0,0]);
assert.deepEqual(friday.box.h.days[6][0][8],[0,0]);
assert.deepEqual(singleClub.box.h.wl,[5,1]);
assert.equal(singleClub.box.h.rd,15);
assert.equal(digest(singleClub),'fe773ce17915ee3e3b8e63cdb87e54514c99757dd2a3bc5c244ff2e6c0ac6ce0','Entire single-club scoreboard and Stat Ledger match production 7ba0883');
console.log('PASS daily club transfers, off-day assignment, historical clock, and unchanged single-club scoring');
