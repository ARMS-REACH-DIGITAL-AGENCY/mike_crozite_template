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
const { isFantasyRosterStatus, FANTASY_ROSTER_STATUSES, ACTIVE_GALLERY_STATUSES, releasedDuringPeriod } = mod;
for (const s of ['ACTIVE', '40-MAN', 'INJURED 10-DAY', 'OPTIONED', 'RED SHIRT', 'REDSHIRT-MEDICAL', 'active']) assert.equal(isFantasyRosterStatus(s), true, s + ' counts');
for (const s of ['FREE AGENT', 'free agent', 'RETIRED', 'UNKNOWN', '', null, 'COMMIT', 'DFA', 'COACH']) assert.equal(isFantasyRosterStatus(s), false, String(s) + ' does not count');
assert.deepEqual([...FANTASY_ROSTER_STATUSES], ACTIVE_GALLERY_STATUSES.filter(s => s !== 'FREE AGENT'), 'fantasy roster = Active Alumni minus free agents');
assert.ok(ACTIVE_GALLERY_STATUSES.includes('FREE AGENT'), 'the Active Alumni gallery still shows free agents');
for (const file of ['src/app/api/bracket/live/route.ts', 'src/app/api/players/[hsid]/route.ts']) {
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /isFantasyRosterStatus\(/, file + ' must use the fantasy roster rule');
  assert.doesNotMatch(code, /\bisActiveGalleryStatus\(|\bisRosterStatus\(/, file + ' must not use another membership rule');
}
// Pete, Nov 24 2026: released mid-week, his games before the release still count in that week.
assert.equal(releasedDuringPeriod('FREE AGENT', '2027-04-08T00:00:00.000Z', '2027-04-05'), '2027-04-08', 'released Thursday of the scored week');
assert.equal(releasedDuringPeriod('FREE AGENT', new Date('2027-04-08T00:00:00Z'), '2027-04-05'), '2027-04-08');
assert.equal(releasedDuringPeriod('FREE AGENT', '2027-03-30', '2027-04-05'), null, 'released before the period: does not count');
assert.equal(releasedDuringPeriod('FREE AGENT', null, '2027-04-05'), null, 'no release date: does not count');
assert.equal(releasedDuringPeriod('ACTIVE', '2027-04-08', '2027-04-05'), null, 'only free agents');
const live = fs.readFileSync('src/app/api/bracket/live/route.ts', 'utf8');
assert.match(live, /releasedDuringPeriod\(/, 'scoring keeps a mid-period release');
assert.match(live, /Number\(r\.day\) < releaseDay\(r\.playerid\)/, 'only games before the release date count');
const season = fs.readFileSync('src/components/bracket/liveSeason.ts', 'utf8');
assert.match(season, /if \(p\[5\] != null && from >= p\[5\]\) continue;/, 'released before the week: off the team');
assert.match(season, /!\(p\[5\] != null && from \+ d >= p\[5\]\)/, 'released mid-week: days from the release on do not count');
// Pete, Nov 24 2026 (Kyle Nicolas, Jackson): the stat drawer lists every player in the
// stored game, on today's roster or not, so a released player's runs never vanish.
const gallery = fs.readFileSync('src/components/bracket/gallery.tsx', 'utf8');
assert.match(gallery, /const kept = existing\.filter\(\(p\) => !used\.has\(String\(p\[0\]\)\)\)/, 'drawer keeps box players missing from the roster');
assert.match(gallery, /return \[\.\.\.listed, \.\.\.kept\];/, 'drawer lists them after the roster');
console.log('PASS fantasy roster: free agents never count; scoring and drawer share one rule; a mid-week release keeps his earlier games and stays in the drawer');
