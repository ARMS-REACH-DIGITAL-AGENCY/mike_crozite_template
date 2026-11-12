'use strict';
// Build-gated contract: a TeamID always resolves to its OWN historical artwork
// before any explicitly approved same-club alias. Never use successor IDs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function loadTs(relPath, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 }
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    exports: mod.exports,
    require: (name) => { if (name in mocks) return mocks[name]; throw Error('Unexpected import ' + name); },
    process: { env: {} },
    encodeURIComponent,
  }, { filename: relPath });
  return mod.exports;
}

const logo = loadTs('src/lib/teamLogo.ts');
const story = loadTs('src/lib/storyAssets.ts', { '@/lib/teamLogo': logo });
const draft = loadTs('src/lib/draftTeamLogoSql.ts');
const key = (id) => Array.from(logo.teamLogoAssetKeys(id));
const urls = (id) => Array.from(logo.teamLogoAssetUrls(id));
const base = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/';
const endpoint = 'https://hamilton.az.yatstats.com/api/team-logo/';

assert.equal(logo.teamLogoPath('10032'), '/api/team-logo/10032');
assert.equal(logo.teamLogoPath('0'), null);
assert.equal(logo.teamLogoPath('../20'), null);
assert.equal(logo.teamLogoPath('C5004'), null);
assert.equal(logo.teamLogoPath(''), null);
assert.equal(key('10032')[0], 'teams-web/10032.webp');
assert.ok(key('10032').includes('teams-web/4.webp'));
assert.ok(!urls('10032').some(u => u.includes('/20.'))); // never Yankees
assert.equal(key('231')[0], 'teams-web/231.webp');
assert.ok(key('231').includes('teams-web/32.webp'));
assert.equal(key('21')[0], 'teams-web/21.webp');
assert.ok(key('21').includes('teams-web/37.webp'));
assert.equal(key('18')[0], 'teams-web/18.webp');
assert.ok(!key('18').some(k => /\/(?:32|231)\./.test(k))); // no Nationals for Expos
assert.ok(!key('1').some(k => /\/(?:36|10012)\./.test(k))); // no current Angels substitution
for (const id of ['12','31','10011','10013','10014','10018','10020','10021']) {
  assert.equal(key(id)[0], 'teams-web/' + id + '.webp');
  assert.ok(!key(id).some(k => /\/(?:17|29|32|36|37)\./.test(k)), id + ' must not inherit successor');
}
assert.equal(story.storyAssetUrl('teams/10032.png'), endpoint+'10032');
const image = loadTs('src/lib/playerImage.ts', { '@/lib/teamLogo': logo });
assert.equal(image.getTeamLogoUrl('10032'), '/api/team-logo/10032');
assert.equal(image.getOriginalForCardCopy('/api/team-logo/10032'), '');
assert.equal(story.storyAssetUrl('teams-web/21.webp'), endpoint+'21');
assert.equal(story.storyAssetUrl('teams/18.png'), endpoint+'18');
assert.equal(story.storyAssetUrl('teams/cutouts/4.png'), endpoint+'4');
assert.equal(story.storyAssetUrl('players/21.png'), base+'players/21.png');
assert.equal(story.storyAssetUrl('teams/21.jpg'), endpoint+'21');
assert.equal(story.storyAssetUrl(null), null);
assert.equal(story.storyAssetUrl(''), null);

const draftSql = draft.draftTeamLogoLateralSql();
assert.match(draftSql, /\bLATERAL\b/);
assert.match(draftSql, /\bLIMIT 1\b/);
assert.match(draftSql, /'washington senators'.*draft_year <= 1960/);
assert.match(draftSql, /'washington senators'.*draft_year BETWEEN 1961 AND 1971/);
assert.ok(!draftSql.includes('currentteamid'));
assert.ok(!draftSql.includes('currentFranchiseSql'));

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
for (const file of ['src/lib/playerImage.ts','src/lib/playerUtils.ts','src/components/yatstats/ZoomableCareerTimeline.tsx','src/components/yatstats/SearchDrawerTabs.tsx','src/components/bracket/gallery.tsx','src/components/yatstats/ContributeProof.tsx','src/app/api/teams/search/route.ts']) {
  assert.match(read(file), /teamLogoPath/, file + ': shared resolver missing');
}
for (const file of ['src/lib/db.ts','scripts/import-player-draft-picks.ts']) {
  assert.match(read(file), /draftTeamLogoLateralSql\(\)/, file + ': one-row identity lookup missing');
}
const route = read('src/app/api/team-logo/[teamId]/route.ts');
assert.match(route, /method: 'HEAD'/);
assert.match(route, /X-Team-Logo-Status/);
assert.match(route, /TEAM_LOGO_FALLBACK/);
assert.ok(!route.includes('currentteamid'));
console.log('PASS shared team-logo resolution: period identities, exact-first assets, same-club alternatives, all readers');
