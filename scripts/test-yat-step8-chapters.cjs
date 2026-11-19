'use strict';
// A person with two schools: one card, one chapter per school (CLAUDE.md;
// Pete, Nov 18-19 2026). Pins Greg Bordes (coach who played), a two-school
// active player, and a normal one-school player.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const src = fs.readFileSync('src/lib/playerChapters.ts', 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText)(mod, mod.exports);
const { buildPlayerChapters, defaultChapterIndex, chapterCardFields } = mod.exports;

// Greg Bordes, YAT000073: COACH at Hamilton (5004); played at Dobson (2623).
const bordes = buildPlayerChapters({
  yatid: 'YAT000073', homeHsid: '5004', statusLabel: 'COACH', levelLabel: 'HIGH SCHOOL',
  highestLevelLabel: 'DOUBLE-A', teamName: 'HAMILTON HUSKIES', teamId: '', orgName: '',
  schools: [{ hsid: '2623', schoolName: 'Dobson', location: '' }, { hsid: '5004', schoolName: 'Hamilton', location: '' }],
});
assert.equal(bordes.length, 2);
assert.deepEqual(bordes.map((c) => c.hsid), ['5004', '2623'], 'current school first');
assert.equal(bordes[0].statusLabel, 'COACH');
assert.equal(bordes[0].teamName, 'HAMILTON HUSKIES');
assert.equal(bordes[1].statusLabel, 'RETIRED', 'a coach\'s other school is RETIRED');
assert.equal(bordes[1].levelLabel, 'DOUBLE-A', 'with his highest level');
assert.equal(bordes[1].teamName, '', 'and no team');
assert.equal(bordes[defaultChapterIndex(bordes, '2623')].hsid, '2623', 'Dobson page shows the Dobson chapter');
assert.equal(bordes[defaultChapterIndex(bordes, '')].hsid, '5004', 'search/favorites show his current status');
assert.equal(chapterCardFields(bordes[1]).status_label, 'RETIRED');
assert.equal(chapterCardFields(bordes[1]).highest_level_label, 'DOUBLE-A', 'front shows HIGHEST LEVEL: DOUBLE-A');
assert.ok(bordes.every((c) => c.statusLabel !== 'ALUMNUS'), 'never ALUMNUS');

// An ACTIVE college player who played for two high schools: current status on both.
const transfer = buildPlayerChapters({
  yatid: 'YAT900001', homeHsid: '100', statusLabel: 'ACTIVE', levelLabel: 'NCAA-D1',
  highestLevelLabel: 'NCAA-D1', teamName: 'State Univ', teamId: '9', orgName: 'Big Conf',
  schools: [{ hsid: '100', schoolName: 'A', location: '' }, { hsid: '200', schoolName: 'B', location: '' }],
});
for (const c of transfer) {
  assert.equal(c.statusLabel, 'ACTIVE');
  assert.equal(c.levelLabel, 'NCAA-D1');
  assert.equal(c.teamName, 'State Univ');
}

// A normal player: one chapter, so no toggle and no change to his card.
const normal = buildPlayerChapters({
  yatid: 'YAT900002', homeHsid: '300', statusLabel: 'RETIRED', levelLabel: 'MLB',
  highestLevelLabel: 'MLB', teamName: '', teamId: '', orgName: '',
  schools: [{ hsid: '300', schoolName: 'C', location: '' }],
});
assert.equal(normal.length, 1);

const page = fs.readFileSync('src/app/[hsid]/page.tsx', 'utf8');
assert.match(page, /if \(chapters\.length < 2\) continue;/, 'one-school people untouched');
assert.match(fs.readFileSync('src/components/yatstats/PlayerCardBack.tsx', 'utf8'), /p\.chapters\.length > 1/, 'toggle only for two chapters');
console.log('yat step 8 chapters OK');
