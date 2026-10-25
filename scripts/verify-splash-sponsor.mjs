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

// Browser-level first-visit regression tests. Fake cookie storage respects
// host-only vs Domain=.yatstats.com, so a platform-wide cookie regression
// cannot silently suppress the intro on a second school's hostname.
const splashBoot = new Script(templateBody(root, 'SPLASH_BOOTSTRAP'), { filename: 'SPLASH_BOOTSTRAP_COOKIE_TEST' });
const hostCookies = new Map();
const domainCookies = new Map([['yatstats.com', new Map([['yat_seen', '1']])]]);
function splashVisit(hostname, pathname = '/', search = '') {
  const own = hostCookies.get(hostname) || new Map();
  hostCookies.set(hostname, own);
  let wrote = false, style = null;
  const doc = {
    head: { appendChild(el) { style = el; } },
    createElement() { return { textContent: '', id: '' }; },
    getElementById() { return null; },
  };
  Object.defineProperty(doc, 'cookie', {
    get() {
      const vals = [...own.entries()];
      for (const [domain, entries] of domainCookies) {
        if (hostname === domain || hostname.endsWith('.' + domain)) vals.push(...entries);
      }
      return vals.map(([k, v]) => k + '=' + v).join('; ');
    },
    set(raw) {
      wrote = true;
      const parts = raw.split(';').map(x => x.trim());
      const [key, value] = parts[0].split('=');
      const domainAttr = parts.find(x => x.toLowerCase().startsWith('domain='));
      if (domainAttr) {
        const domain = domainAttr.split('=')[1].replace(/^\./, '');
        if (!domainCookies.has(domain)) domainCookies.set(domain, new Map());
        domainCookies.get(domain).set(key, value);
      } else own.set(key, value);
    },
  });
  splashBoot.runInNewContext({
    document: doc,
    location: { hostname, pathname, search },
    matchMedia() { return { matches: false }; },
    addEventListener() {},
    setTimeout() { return 1; },
    Date,
  });
  assert.ok(style, 'bootstrap must install a splash style state');
  return { hidden: style.textContent.includes('display:none!important'), wrote };
}
assert.equal(splashVisit('hamilton.az.yatstats.com').hidden, false, 'Hamilton first visit opens');
assert.equal(splashVisit('hamilton.az.yatstats.com').hidden, true, 'Hamilton return skips');
assert.equal(splashVisit('perry.az.yatstats.com').hidden, false, 'Perry first visit opens even after Hamilton');
assert.equal(splashVisit('perry.az.yatstats.com').hidden, true, 'Perry return skips');
assert.equal(splashVisit('hamilton.az.yatstats.com', '/5004').hidden, true, 'a numeric route on the same school does not replay');
assert.equal(splashVisit('preview.vercel.app', '/5004').hidden, false, 'preview 5004 first visit opens');
assert.equal(splashVisit('preview.vercel.app', '/5005').hidden, false, 'preview 5005 first visit opens');
assert.equal(splashVisit('preview.vercel.app', '/5004').hidden, true, 'preview 5004 return skips');
assert.equal(splashVisit('perry.az.yatstats.com', '/', '?splash=1').hidden, false, 'explicit QA link forces replay');
assert.equal(splashVisit('yatstats.com').wrote, false, 'permanent platform landing never sets a school splash cookie');
assert.equal(splashVisit('www.yatstats.com').wrote, false, 'www landing never sets a school splash cookie');
const join = splashVisit('brandnew.az.yatstats.com', '/', '?join=1');
assert.equal(join.hidden, true, 'JOIN flow bypasses the intro');
assert.equal(join.wrote, false, 'JOIN flow cannot consume first visit');
assert.equal(splashVisit('brandnew.az.yatstats.com').hidden, false, 'after JOIN the school intro remains unconsumed');
assert.match(school, /const liveSchoolHost =/, 'server must identify live school hosts');
assert.match(school, /!liveSchoolHost &&/, 'numeric-route cookies are only for shared previews');
assert.match(school, /yat_splash_seen_/, 'server must support per-HSID preview cookies');
assert.doesNotMatch(school, /const seenSplash = .*yat_seen/, 'server must ignore the old platform-wide cookie');
console.log('[splash schools] per-school first-visit cookies, permanent platform landing, JOIN and forced replay verified');


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
// Keep the raised vertical offset deliberately; the prior bottom:3px regression
// was introduced while aligning a marked baseline and moved the player out of the swoosh.
assert.doesNotMatch(css, /yat-splash-player\{[^}]*bottom:3px/, 'never pin the player to the screen bottom');
assert.equal(css.split('splash-field-reference.webp').length - 1, 1, 'field background image rendered exactly once');
assert.match(splash, /logo\.naturalWidth/);
// The caption is deliberately anchored low beside the player's feet rather
// than growing upward into a multi-line text column on phones.
assert.match(css, /yat-splash-player-caption\{[^}]*left:calc\(100% - 14px\);bottom:clamp\(12px,2\.1vh,28px\)/, 'desktop player caption stays low');
assert.match(css, /yat-splash-player-caption\{left:calc\(100% - 30px\);right:auto;bottom:clamp\(8px,1\.25vh,16px\)/, 'phone player caption matches approved lower-left reference');
assert.match(css, /yat-splash-player-caption-name\{font-weight:800;text-transform:uppercase/, 'player name stays small and uppercase');
assert.match(css, /yatSplashNameFlash \.75s ease-out 1\.4s/, 'name glint follows YAT wordmark glint');
assert.match(css, /@keyframes yatSplashNameFlash/, 'caption glint keyframes exist');
assert.match(splash, /function fitCaption\(caption\)/, 'long team names fit without clipping');

// A player selected while the school roster streams must NOT disappear when
// React restores server-authored classes during hydration. This is essential
// on schools without a preconfigured featured-player roster.
assert.match(css, /yat-splash-player\{[^}]*opacity:1;pointer-events:none/, 'player wrapper must stay visible even if hydration resets is-visible class');
assert.match(css, /yat-splash-player \.yat-splash-player-caption-name\{animation:yatSplashNameFlash/, 'name flash must not depend on hydration-prone is-visible class');
assert.doesNotMatch(css, /yat-splash-player\{[^}]*opacity:0/, 'never hide selected cutout behind hydration-controlled class');

// On Chrome Android an image with no src may draw an outlined empty box, even
// with alt="". Keep the loaded cutout visible, but never display its empty
// placeholder while a school is waiting for its first verified player image.
assert.match(css, /yat-splash-player img:not\(\[src\]\)/, 'hide empty player image elements on splash');
assert.match(css, /yat-splash-player img\[src=""\]/, 'hide empty src player images');
assert.ok(splash.includes("picture.addEventListener('error'"), 'hide cutout if a previously valid image fails to render');
assert.ok(splash.includes("picture.removeAttribute('src')"), 'clear failed image src to avoid broken image rectangle');

// Player profiles do not render InteractionStrip, so these independent,
// school-wide queries must not block navigation from Favorites.
assert.match(school, /const isProfileRoute = /, 'profile route fast-path must be scoped to player pages');
assert.match(school, /isProfileRoute\s*\? Promise\.resolve\(\[\] as string\[\]\)/, 'avoid season coverage query on profiles');
assert.match(school, /isProfileRoute\s*\? Promise\.resolve\(\{ playerIds:/, 'avoid current-year summary query on profiles');
assert.match(school, /teamSeasonResults = !isProfileRoute &&/, 'avoid team-season query on profiles');
assert.match(school, /\[stripFrontImageMap, stripHeadshotMap\] = isProfileRoute/, 'avoid unused two gallery image queries on profiles');
assert.match(school, /stripPlayers = \(isProfileRoute \? \[\] : allStripRows\)/, 'do not serialize gallery images on profiles');

assert.match(css, /yat-splash-player\{[^}]*left:26%;bottom:clamp\(35px,5\.5vh,78px\);/, 'desktop cutout must be raised inside the gold swoosh');
assert.match(css, /@media\(max-width:600px\)\{#yatSplash \.yat-splash-player\{left:22%;bottom:clamp\(24px,5vh,54px\);/, 'mobile cutout must be raised inside the gold swoosh');
assert.ok(root.includes("var minimumHold=noSponsor?3600:5500;"), 'skip empty sponsor read time but keep normal sponsored intro');
assert.ok(root.includes("var earliest=Math.max(mounted+minimumHold"), 'sponsor-aware minimum hold used for exit');
assert.ok(root.includes("addEventListener('DOMContentLoaded'"), 'profile splash must not wait for slow third-party images');
assert.ok(splash.includes("data-yat-sponsor-state','none'"), 'record when no sponsor can be shown');
assert.ok(splash.includes("data-yat-sponsor-state','pending'"), 'do not skip the paid sponsor while its image is loading');
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
