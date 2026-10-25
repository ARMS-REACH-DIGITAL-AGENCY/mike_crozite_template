// Fast, dependency-free release guard for browser inline scripts that Next's
// TypeScript compile cannot syntax-check. Runs during every Vercel build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';

const splash = readFileSync('src/components/yatstats/shell/SchoolSplash.tsx', 'utf8');
const root = readFileSync('src/app/layout.tsx', 'utf8');
const school = readFileSync('src/app/[hsid]/layout.tsx', 'utf8');
const route = readFileSync('src/app/api/splash-sponsor/[hsid]/route.ts', 'utf8');
const sql = readFileSync('migrations/20261021_school_splash_sponsorships.sql', 'utf8');

function templateBody(source, name) {
  const marker = `const ${name} = \``;
  const i = source.indexOf(marker);
  assert.ok(i !== -1, `missing ${name}`);
  const start = i + marker.length, end = source.indexOf('`;', start);
  assert.ok(end > start, `unclosed ${name}`);
  return runInNewContext('`' + source.slice(start, end) + '`');
}
for (const name of ['FIT_WORDS', 'SPONSOR_LOOKUP']) {
  new Script(templateBody(splash, name), { filename: name });
}
new Script(templateBody(root, 'SPLASH_BOOTSTRAP'), { filename: 'SPLASH_BOOTSTRAP' });

const rotate = splash.match(/const ROTATE_SPLASH_PLAYERS = ("(?:\\.|[^"\\])*");/);
assert.ok(rotate, 'missing rotating splash player script');
new Script(runInNewContext(rotate[1]), { filename: 'ROTATE_SPLASH_PLAYERS' });

const css = templateBody(splash, 'SPLASH_CSS');
assert.ok(!css.includes('\\n#yatSplash'), 'splash CSS contains literal escaped newlines');
assert.ok(!/<\/div>\\n\s*<div/.test(splash), 'splash JSX contains accidental escaped newlines');
assert.match(css, /yat-sponsor-reveal/);
// The duplicated foreground layer with a diagonal clip produced a visible
// straight seam across the field. It must not be reintroduced.
assert.doesNotMatch(css, /yat-splash-swoosh-foreground/, 'no duplicated splash foreground');
assert.doesNotMatch(splash, /className="yat-splash-swoosh-foreground"/, 'no diagonal foreground element');
assert.doesNotMatch(css, /mix-blend-mode:screen/, 'no lightened seam from overlay blending');
assert.equal(css.split('splash-field-reference.webp').length - 1, 1, 'field background image rendered exactly once');
assert.match(splash, /logo\.naturalWidth/);
assert.match(css, /yat-splash-player\{[^}]*left:26%;bottom:3px;/, 'desktop cutout must rest on the lower field baseline');
assert.match(css, /@media\(max-width:600px\)\{#yatSplash \.yat-splash-player\{left:22%;bottom:3px;/, 'mobile cutout must rest on the marked field baseline');
assert.match(root, /mounted\+5500/);
assert.ok(!root.includes('sponsorTimer='), 'sponsor timer must start from actual splash mount');
assert.match(school, /splashRosterJson/);
assert.match(school, /sortActivePlayers\(\[\.\.\.activeAlumniRows\]\)/, 'splash candidates must follow the Active Alumni gallery sort');
assert.match(school, /featuredSplashIds\.length : 4/, 'non-curated schools must use at most four candidates');
assert.match(school, /const splashOtherIds: string\[\] = \[\]/, 'no full-roster image-probing fallback');
assert.match(school, /missingSplashDetails\.delete\(id\)/, 'send only curated caption data');
const featured = JSON.parse(readFileSync('src/config/splash-featured-players.json', 'utf8'));
assert.deepEqual(featured['5004'].ids, ['320111','317316','180827','213884','225132','233197','284749','YAT000067'], 'Hamilton curated list must stay exactly eight');
assert.ok(featured['5004'].confirmedCutouts.every(id => featured['5004'].ids.includes(id)), 'verified cutouts must be inside approved pool');
assert.ok(featured['5004'].confirmedCutouts.includes('YAT000067'), 'preserve working Ben Ball cutout as fast fallback');

assert.deepEqual(Object.keys(featured['5004'].details).sort(), featured['5004'].ids.slice().sort(), 'all featured players require captions');
assert.equal(featured['5004'].details['YAT000067'].name, 'Ben Ball', 'known-good cutout name');
assert.equal(featured['5004'].details['YAT000067'].team, 'University of Arizona', 'known-good cutout school');
assert.match(splash, /data-featured-details=\{JSON\.stringify\(featuredPlayerDetails\)\}/, 'first-paint captions in server markup');
assert.match(splash, /className="yat-splash-player-caption-name">\{initialPlayerDetails\.name\}/, 'server-render initial player name');
assert.match(splash, /className="yat-splash-player-caption-team">\{initialPlayerDetails\.team\}/, 'server-render initial player team');
assert.match(school, /featuredPlayerDetails=\{splashOverride\?\.details \?\? \{\}\}/, 'use reusable data-driven school caption schema');

assert.match(splash, /data-featured-ids=\{featuredPlayerIds\.join/, 'render approved IDs before DB roster loads');
assert.match(splash, /data-confirmed-ids=\{confirmedCutoutIds\.join/, 'render confirmed cutout IDs before DB roster loads');
assert.match(splash, /confirmedCutoutIds\.length \? ' is-visible'/, 'immediate visible server-rendered cutout');
assert.match(splash, /then-cutouts\/\$\{encodeURIComponent\(confirmedCutoutIds\[0\]\)\}\.png/, 'render known-good image src without relying on JavaScript');
assert.match(splash, /if\(staticIds\.length\)begin\(staticIds,staticConfirmed\)/, 'start curated splash image loading immediately');
assert.match(school, /window\.__yatSplashRoster=/, 'save streamed roster event to prevent missed listeners');
assert.match(school, /featuredPlayerIds=\{splashOverride\?\.ids \?\? \[\]\}/, 'pass generic school configuration to shared splash');

assert.match(route, /WHERE s\.hsid = \$1/);
assert.match(sql, /REFERENCES public\.sponsor_orders\(id\)/);
assert.match(sql, /v_school_splash_sponsor_assignments/);
// Protect the previously approved Alumni News preview from being silently
// replaced by an older layout when a separate feature branch is deployed.
const newsGallery = readFileSync('src/components/yatstats/NewsGallery.tsx', 'utf8');
const newsRails = readFileSync('src/components/yatstats/DrawerRailController.tsx', 'utf8');
const newsStyles = readFileSync('src/components/yatstats/YatStyles.tsx', 'utf8');
const newsRoute = readFileSync('src/app/api/news/[hsid]/route.ts', 'utf8');
const newsImages = readFileSync('src/lib/playerImage.ts', 'utf8');
assert.match(newsGallery, /container:yp-news \/ inline-size/, 'preserve container-aware Alumni News layout');
assert.match(newsGallery, /@container yp-news \(max-width:840px\)/, 'preserve responsive Alumni News sponsor tower');
assert.match(newsRails, /\(hover: none\) and \(pointer: coarse\)/, 'preserve touch-device drawer-width fix');
assert.match(newsStyles, /@media\(max-width:779px\)/, 'preserve mobile full-width rows');
assert.match(newsRoute, /chooseNewsDisplayImage/, 'preserve verified Alumni News image selection in API');
assert.match(newsImages, /export function chooseNewsDisplayImage/, 'preserve shared news image verification');
console.log('[news preview] article imagery and responsive mobile layout baseline verified');

console.log('[splash sponsors] inline JS syntax, reveal timing, CSS and DB mapping verified');
