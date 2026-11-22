// Static contract checks: player profile addresses use the YAT ID (Pete, Nov 17 2026).
// The address shows the YAT ID; the page, images, gallery and favorites keep
// reading the card under its own id; old addresses move permanently.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');
const db = read('src/lib/db.ts');
const layout = read('src/app/[hsid]/player/[playerId]/layout.tsx');
const page = read('src/app/[hsid]/player/[playerId]/[slug]/page.tsx');
const schoolLayout = read('src/app/[hsid]/layout.tsx');
const shell = read('src/components/yatstats/SharedShell.tsx');
const bar = read('src/components/yatstats/shell/SchoolContextBar.tsx');
const search = read('src/components/yatstats/SearchDrawerTabs.tsx');
const sitemap = read('src/lib/sitemap.ts');
const share = read('src/lib/playerProfileShare.ts');
const shareRoute = read('src/app/api/share/player/route.ts');
const middleware = read('src/middleware.ts');

// One resolver, two indexed lookups (playerid primary key, yatid index), no scan.
assert.match(db, /export const resolveProfileCard = cache\(/, 'profile address resolver must be request-cached');
assert.match(db, /WHERE playerid = \$1\s+UNION ALL\s+SELECT [^;]*WHERE yatid = \$1 AND playerid <> \$1/, 'resolver must use the two indexed lookups');

// Old address -> YAT address, permanently, keeping the query string.
assert.match(layout, /resolveProfileCard\(routeId, hsid\)/, 'profile layout must resolve the address');
assert.match(layout, /if \(routeId !== publicId\)[\s\S]*permanentRedirect\(target \+ search\)/, 'old addresses must move permanently with their query');
assert.match(middleware, /requestHeaders\.set\('x-search', request\.nextUrl\.search\)/, 'middleware must pass the query to the layout');
assert.match(layout, /ProfileCardIdRegistrar routeId=\{publicId\} cardId=\{playerId\}/, 'client code must learn the card behind the address');

// The page reads the card under its own id; canonical/og:url use the YAT ID.
assert.equal((page.match(/const \{ cardId: playerId(?:, yatId)? \} = await resolveProfileCard\(routeId, hsid\);/g) || []).length, 2, 'metadata and page must both read the card id');
assert.match(page, /publicId: yatId \|\| playerId/, 'canonical URL must use the YAT ID');
assert.match(share, /encodeURIComponent\(input\.publicId \|\| input\.playerId\)/, 'share helper must put the YAT ID in the URL');
assert.match(share, /playerId=' \+ encodeURIComponent\(input\.playerId\)/, 'share image stays under the card id');
assert.match(shareRoute, /resolveProfileCard\(playerId, hsid\)\)\.cardId/, 'crawler preview image stays under the card id');

// Header (gallery return, favorite star, timeline) uses the card id.
assert.match(schoolLayout, /profileRouteCard=\{profileRouteCard\}/, 'school layout must pass the first page\'s card id');
for (const [name, src] of [['SharedShell', shell], ['SchoolContextBar', bar]]) {
  assert.match(src, /useProfileCardId\(playerRouteMatch \? playerRouteMatch\[1\] : null, profileRouteCard\)/, `${name} must map the address to the card id`);
}

// Search links and the sitemap use the YAT ID.
assert.match(search, /\/\^YAT\[0-9\]\{6,\}\$\/i\.test\(yatId\) \? yatId : playerIdOf\(player\)/, 'search profile links must use the YAT ID');
assert.match(search, /#player-\$\{playerId\}`/, 'flip card links keep the card id');
assert.match(sitemap, /f\.yatid AS playerid/, 'sitemap must select only YAT ID addresses');
assert.match(sitemap, /f\.yatid ~ '\^YAT\[0-9\]\+\$'/, 'sitemap excludes legacy player IDs');
assert.doesNotMatch(sitemap, /COALESCE\(NULLIF\(f\.yatid/, 'sitemap may never fall back to TBC player ID');
assert.match(sitemap, /school-players-v4-strict-yatid-alltime/, 'sitemap cache must vary for YAT-ID-only historical inclusion');
assert.match(sitemap, /SITEMAP_ALL_TIME_PERCENT/, 'historical sitemap exposure must be configurable');
assert.match(sitemap, /const includeAllTime = /, 'all-time expansion must be deterministically staged by school');
assert.match(sitemap, /const percent = Math.min\(100, Math.max\(0, Number\(process.env.SITEMAP_ALL_TIME_PERCENT\) \|\| 0\)\)/, 'historical coverage must remain off by default');
assert.match(sitemap, /\$2::boolean OR UPPER\(TRIM\(COALESCE\(f.status_label/, 'all-time mode must include retired player profiles');
assert.match(sitemap, /schoolHostnamePattern\(new URL\(school.url\).hostname\)\?\.type === 'named'/, 'sitemap must detect named school hosts');
assert.match(sitemap, /const prefix = isNamedHost \? '' : /, 'named school canonical URLs must not include an extra HSID');

console.log('PASS: profile addresses use the YAT ID; card id kept inside; old addresses move permanently');

// Client-side navigation to a YAT address: the header/timeline must re-read
// the card id the profile layout registers (Jake Johnson, Nov 17 2026: his
// timeline asked S3 for then/YAT162674.jpg and showed no high school photo).
const hook = read('src/lib/useProfileCardId.ts');
const store = read('src/lib/profileCardIds.ts');
assert.match(hook, /useSyncExternalStore\(subscribe, getProfileCardVersion, \(\) => 0\)/, 'the hook must re-check the store after subscribing');
assert.match(store, /known\.set\(routeId, cardId\);\s*profileCardVersion \+= 1;/, 'every new pair bumps the store version');
console.log('PASS: a profile opened by client-side navigation uses the card id for its images');

// Build guard (Pete, Nov 17 2026): photos are stored under the card's own id,
// so any code that reads a player id out of the page address must translate a
// YAT address to the card id first. This only stops a broken code update from
// being published; the live site and its pages are never affected by it.
const path = require('node:path');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}
const ADDRESS_ID = /match\(\/\\\/player\\\/\(\[\^/;
const TRANSLATES = /profileCardIdFor|useProfileCardId|resolveProfileCard/;
// Reads only the name part of the address (the slug), never the id.
const SLUG_ONLY = new Set(['src/components/yatstats/ZoomableCareerTimeline.tsx']);
for (const file of walk('src')) {
  const rel = file.split(path.sep).join('/');
  const src = read(rel);
  if (!ADDRESS_ID.test(src) || SLUG_ONLY.has(rel)) continue;
  assert.match(src, TRANSLATES, `${rel} reads a player id from the page address but never translates a YAT ID to the card id (photos would not be found)`);
}
assert.doesNotMatch(read('src/components/yatstats/ZoomableCareerTimeline.tsx'), /pathname\?\.match\([^)]*\)\?\.\[1\]/, 'the timeline reads only the slug from the address');
console.log('PASS: every reader of the address id translates YAT IDs to card ids');
