// Guard the historical replay's complete-season navigation across all 1,024 schools.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'src/components/bracket/simulationLinks.ts');
const output = ts.transpileModule(fs.readFileSync(helperPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;
const exportsObject = {};
vm.runInNewContext(output, { exports: exportsObject, URLSearchParams, encodeURIComponent }, { filename: helperPath });
const { schoolBracketHref, replayShareUrl } = exportsObject;
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'public/replay-2026/index.json'), 'utf8'));
const hsids = Object.keys(snapshot.schools);
assert.equal(hsids.length, 1024, 'Completed replay must contain the full school field');
assert.equal(snapshot.weeks.length, 34, 'Completed replay must include all 34 weeks');
for (const hsid of hsids) {
  const href = schoolBracketHref(hsid, '?sim2026=1&week=13&asof=2026-06-17');
  const url = new URL(href, 'https://preview.example');
  assert.equal(url.pathname, `/${hsid}`);
  assert.equal(url.searchParams.get('sim2026'), '1');
  assert.equal(url.searchParams.get('week'), '34');
  assert.equal(url.searchParams.get('asof'), '2026-11-18');
  assert.equal(url.hash, '#sec-fantasy');
  assert.equal(schoolBracketHref(hsid, ''), `/${hsid}#sec-fantasy`, '2027 link must not change');
}
const gameShare = 'https://preview.example/2076?fantasyGame=101&week=13&snapshot=1#sec-fantasy';
const replayShared = new URL(replayShareUrl(gameShare, '?sim2026=1'));
assert.equal(replayShared.searchParams.get('sim2026'), '1');
assert.equal(replayShared.searchParams.get('asof'), '2026-11-18');
assert.equal(replayShared.searchParams.get('week'), '13', 'A specific shared game retains its week');
assert.equal(replayShared.searchParams.get('fantasyGame'), '101');
assert.equal(replayShared.searchParams.get('snapshot'), '1');
assert.equal(replayShared.hash, '#sec-fantasy');
assert.equal(replayShareUrl(gameShare, ''), gameShare, '2027 share URL must not change');
const schoolSource = fs.readFileSync(path.join(root, 'src/components/bracket/SchoolBracket.tsx'), 'utf8');
const postseasonSource = fs.readFileSync(path.join(root, 'src/components/bracket/PostseasonStage.tsx'), 'utf8');
assert.ok(schoolSource.includes('href={schoolBracketHref(s.h,'), 'Every leaderboard school must use the shared replay-aware link');
assert.equal(schoolSource.split('replayShareUrl(').length - 1, 2, 'Both school game share paths retain replay context');
assert.equal(postseasonSource.split('replayShareUrl(').length - 1, 2, 'Both postseason share paths retain replay context');
console.log('PASS: completed 2026 replay links for 1,024 schools, all 34 weeks, game shares, and unchanged 2027 links.');
