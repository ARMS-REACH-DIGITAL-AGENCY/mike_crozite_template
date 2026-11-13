// Regression guards for uploaded front-photo ownership and verified college transfers.
// Read-only checks; no live database or image objects are modified.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const read = (path) => fs.readFileSync(path, 'utf8');
const imageCode = ts.transpileModule(read('src/lib/playerImage.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exp = {};
new Function('exports', 'require', imageCode)(exp, (name) => {
  if (name === '@/lib/teamLogo') return { teamLogoPath: () => '' };
  throw Error('Unexpected playerImage dependency ' + name);
});
const front = exp.getApprovedFrontPhotoSources;
assert.equal(typeof front, 'function');
const key = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/180634.jpg?v=approved-20261030';
assert.deepEqual(front(key), [
  'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then-card/180634.webp?v=approved-20261030',
  key,
], 'Jamie uses two renditions of the SAME approved photo');
assert.deepEqual(front('https://example.com/photo.jpg'), ['https://example.com/photo.jpg'],
  'Do not guess alternate images from external or non-designated URLs');
assert.deepEqual(front(''), []);
const frontComponent = read('src/components/yatstats/PlayerCardFront.tsx');
assert.match(frontComponent, /getApprovedFrontPhotoSources\(designatedPhotoUrl\)/);
assert.doesNotMatch(frontComponent, /\? \[designatedPhotoUrl\]/);
const db = read('src/lib/db.ts');
const from = db.indexOf('export const getBatchDesignatedPlayerImages = cache(');
const to = db.indexOf('export async function getPlayerPhotos(',from);
assert.ok(from >= 0 && to > from);
const batch = db.slice(from,to);
assert.match(batch, /m\.purpose='flip_card'/);
assert.match(batch, /m\.status='approved'/);
assert.match(batch, /p\.image_role=\$2/);
assert.match(batch, /m\.uploaded_at::text AS asset_updated_at/);
assert.match(batch, /encodeURIComponent\(row\.asset_updated_at\)/);
assert.match(batch, /approvedPublishedPlayerImageKey\(row\.description, 'flip_card'\)/);
const importer = read('scripts/import-region1-college-schedules.mjs');
const authorityGate = /COALESCE\(f\.current_team_source,''\) <> 'contribute_direct'[\s\S]*?not exists \(\s*select 1 from public\.player_team_override o\s*where o\.playerid=f\.playerid\s*\)/g;
assert.equal([...importer.matchAll(authorityGate)].length,2,
  'Both schedule identity resolution and next-game seeding must honor verified manual transfers');
const publisher = read('src/lib/publishCurrentTeamChange.ts');
assert.match(publisher, /INSERT INTO player_team_override/);
assert.match(publisher, /'region1_college_next_game'/);
assert.match(publisher, /- 'schedule_url' - 'boxscore_url'/);
assert.match(publisher, /current_team_source='contribute_direct'/);
console.log('PASS published flip-card photo redundancy, immutable asset revision, and reviewed transfer protections');
