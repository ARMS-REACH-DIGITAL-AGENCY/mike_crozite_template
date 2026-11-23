'use strict';
// Pete, Nov 23 2026: a player counts for his high school's fantasy team only
// while he is on a team's roster. A FREE AGENT does not count. One rule for
// scoring (/api/bracket/live) and the roster drawer (/api/players/[hsid]).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const src = fs.readFileSync('src/lib/galleryStatuses.ts', 'utf8');
const mod = {};
new Function('exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod);
const { isFantasyRosterStatus, FANTASY_ROSTER_STATUSES, ACTIVE_GALLERY_STATUSES } = mod;
for (const s of ['ACTIVE', '40-MAN', 'INJURED 10-DAY', 'OPTIONED', 'RED SHIRT', 'REDSHIRT-MEDICAL', 'active']) assert.equal(isFantasyRosterStatus(s), true, s + ' counts');
for (const s of ['FREE AGENT', 'free agent', 'RETIRED', 'UNKNOWN', '', null, 'COMMIT', 'DFA', 'COACH']) assert.equal(isFantasyRosterStatus(s), false, String(s) + ' does not count');
assert.deepEqual([...FANTASY_ROSTER_STATUSES], ACTIVE_GALLERY_STATUSES.filter(s => s !== 'FREE AGENT'), 'fantasy roster = Active Alumni minus free agents');
assert.ok(ACTIVE_GALLERY_STATUSES.includes('FREE AGENT'), 'the Active Alumni gallery still shows free agents');
for (const file of ['src/app/api/bracket/live/route.ts', 'src/app/api/players/[hsid]/route.ts']) {
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /isFantasyRosterStatus\(/, file + ' must use the fantasy roster rule');
  assert.doesNotMatch(code, /\bisActiveGalleryStatus\(|\bisRosterStatus\(/, file + ' must not use another membership rule');
}
console.log('PASS fantasy roster: free agents never count; scoring and drawer share one rule');
