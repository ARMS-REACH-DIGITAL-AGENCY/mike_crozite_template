'use strict';
// Runs during the normal production and preview builds. Protects Draft Day
// stories from bad historical Oakland Athletics logo URLs, even after import.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/storyAssets.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 }
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { exports: mod.exports, process: { env: {} }, encodeURIComponent });
const assetUrl = mod.exports.storyAssetUrl;
const s3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/';

// The importer deliberately preserves historical ID 21 in database rows.
// The story API must remap both the original and WebP/thumb image URLs.
assert.equal(assetUrl('teams/21.png'), s3 + 'teams/37.png');
assert.equal(assetUrl('teams-web/21.webp'), s3 + 'teams-web/37.webp');

// Full public-S3 Draft Day logo audit (40 distinct IDs, 48,531 photo rows)
// found missing assets for Orioles, Nationals, and eight historic identities.
// Verify true same-team aliases; never follow incorrect currentteamid=20
// from Orioles 10032 to Yankees 20.
assert.equal(assetUrl('teams/10032.png'), s3 + 'teams/4.png');
assert.equal(assetUrl('teams-web/10032.webp'), s3 + 'teams-web/4.webp');
assert.equal(assetUrl('teams/231.png'), s3 + 'teams/32.png');
assert.equal(assetUrl('teams-web/231.webp'), s3 + 'teams-web/32.webp');
assert.equal(assetUrl('teams/4.png'), s3 + 'teams/4.png');
assert.equal(assetUrl('teams-web/4.webp'), s3 + 'teams-web/4.webp');

// A modern successor franchise's logo is NOT historically accurate.
// Missing historic artwork gets the existing in-app crest instead.
for (const id of ['1','12','18','31','10011','10013','10014','10018']) {
  assert.equal(assetUrl(`teams/${id}.png`), '/img/ys-crest.png');
  assert.equal(assetUrl(`teams-web/${id}.webp`), '/img/ys-crest.png');
}

// Guard against silently rewriting IDs or unrelated photo paths.
assert.equal(assetUrl('teams/37.png'), s3 + 'teams/37.png');
assert.equal(assetUrl('teams-web/37.webp'), s3 + 'teams-web/37.webp');
assert.equal(assetUrl('teams/10011.png'), s3 + 'teams/10011.png');
assert.equal(assetUrl('teams/21.jpg'), s3 + 'teams/21.jpg');
assert.equal(assetUrl('teams-web/21.png'), s3 + 'teams-web/21.png');
assert.equal(assetUrl('players/21.png'), s3 + 'players/21.png');
assert.equal(assetUrl('team-cards/21/2023.webp'), s3 + 'team-cards/21/2023.webp');
assert.equal(assetUrl(null), null);
assert.equal(assetUrl(''), null);
console.log('PASS 2026-11-10 Draft Day logo coverage: Orioles, Nationals, Athletics, missing historical crests, unaffected assets');
