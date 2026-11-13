// The publisher records immutable S3 asset keys; changing a YAT ID must
// never cause a card to lose its already approved photo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('src/lib/approvedPublishedPlayerImage.ts','utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
const exportsValue = {};
new Function('exports', outputText)(exportsValue);
const lookup = exportsValue.approvedPublishedPlayerImageKey;
assert.equal(typeof lookup, 'function');

const approved = JSON.stringify({
  published_assets: [
    'players/then/YAT149256554099832.jpg',
    'players/then-card/YAT149256554099832.webp',
  ],
});
assert.equal(lookup(approved, 'flip_card'), 'players/then/YAT149256554099832.jpg');
assert.equal(lookup(approved, 'back_hero'), null, 'front-photo assets cannot fill back-hero role');
assert.equal(lookup(null, 'flip_card'), null);
assert.equal(lookup('{broken', 'flip_card'), null);
assert.equal(lookup(JSON.stringify({published_assets: ['players/then/../../secret.jpg']}), 'flip_card'), null);
assert.equal(lookup(JSON.stringify({published_assets: ['https://example.org/player.jpg']}), 'flip_card'), null);
assert.equal(lookup(JSON.stringify({published_assets: ['players/back/YAT816250826200263.jpg']}), 'back_hero'),
 'players/back/YAT816250826200263.jpg');
assert.equal(lookup(JSON.stringify({published_assets: ['players/season-headshots/YAT816250826200263_1985.jpg']}), 'headshot'),
 'players/season-headshots/YAT816250826200263_1985.jpg');
assert.equal(lookup(JSON.stringify({published_assets: ['players/then-card/YAT000100.webp']}), 'flip_card'), null);

const db = fs.readFileSync('src/lib/db.ts','utf8');
const start = db.indexOf('export const getBatchDesignatedPlayerImages = cache(');
const end = db.indexOf('export async function getPlayerPhotos(',start);
assert.ok(start>=0 && end>start);
const batch = db.slice(start,end);
assert.match(batch,/m\.playerid = ANY\(\$1::text\[\]\)/);
assert.match(batch,/m\.purpose='flip_card'/);
assert.match(batch,/m\.status='approved'/);
assert.match(batch,/p\.approval_status='APPROVED'/);
assert.match(batch,/source_priority/);
assert.match(batch,/approvedPublishedPlayerImageKey\(row\.description, 'flip_card'\)/);
assert.match(batch,/storyAssetUrl\(approvedKey\)/);
assert.doesNotMatch(batch,/SELECT.*FROM player_source_map/i,
 'gallery photo batches must not scan provider/source aliases');
const front = fs.readFileSync('src/components/yatstats/PlayerCardFront.tsx','utf8');
assert.match(front,/normalizeImageUrl\(frontImageUrl\)/);
assert.match(front,/\[designatedPhotoUrl\]/);
console.log('PASS renamed YAT player retains immutable, approved original front photo');
