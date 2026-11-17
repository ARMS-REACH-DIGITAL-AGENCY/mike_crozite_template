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
assert.equal((page.match(/const \{ cardId: playerId \} = await resolveProfileCard\(routeId, hsid\);/g) || []).length, 2, 'metadata and page must both read the card id');
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
assert.match(sitemap, /COALESCE\(NULLIF\(f\.yatid, ''\), f\.playerid::text\) AS playerid/, 'sitemap must list YAT ID addresses');
assert.match(sitemap, /school-players-v2-yatid/, 'sitemap cache key must change with the addresses');

console.log('PASS: profile addresses use the YAT ID; card id kept inside; old addresses move permanently');
