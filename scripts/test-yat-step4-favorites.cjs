// YAT ID key transition, step 4, favorites (docs/yat-key-transition.md):
// a favorite is a person. Saving him on a second card is not a second
// favorite; removing him from any card removes him; hearts light on every
// card of a favorited person; MLB alerts reach fans of any of his cards.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const lib = read("src/lib/userProfile.ts");
const route = read("src/app/api/favorites/route.ts");
const alerts = read("src/app/api/cron/mlb-transaction-alerts/route.ts");
assert.match(lib, /done\.yatid = public\.yat_id_for\(\$3::text\)/, "save skips a person already favorited");
assert.match(route, /done\.yatid = public\.yat_id_for\(\$4::text\)/, "backup save skips a person already favorited");
assert.match(lib, /yatid = public\.yat_id_for\(\$2::text\)/, "remove takes the person off every card");
assert.match(route, /f\.yatid IN \(SELECT public\.yat_id_for\(x\) FROM unnest\(\$1::text\[\]\) x\)/, "hearts light every card of a favorited person");
assert.match(alerts, /uf\.yatid = public\.yat_id_for\(\$1::text\)/, "MLB alerts reach fans of any card of the person");
// Direct Favorites-to-profile navigation must not use legacy TBC ids or
// trigger browser reloads / redirect chains. Card IDs remain unchanged
// for hearts, unfavorite actions and flip card gallery links.
const drawer = read("src/components/yatstats/FavoritesDrawer.tsx");
const persist = read("src/components/yatstats/DrawerNavigationPersistence.tsx");
assert.match(route, /const publicId = photoIds\.get\(id\) \|\| id/, "Favorites API exposes canonical YAT URL key");
assert.match(route, /return \{ \.\.\.p, publicId, headshotUrl:/, "Favorites retains card id and provides public id");
assert.match(drawer, /import Link from 'next\/link'/, "profile links must navigate with Next client router");
assert.match(drawer, /const publicId = String\(player\.publicId \|\| playerId\)/, "profile URL uses YAT ID with safe fallback");
assert.match(drawer, /const profileHref = \x60\$\{profileBase\}\/player\/\$\{encodeURIComponent\(publicId\)\}\/\$\{slug\}\x60/, "open the canonical player profile directly");
assert.match(drawer, /<Link href=\{profileHref\} prefetch=\{false\} className="yat-favorite-headshot-link"/, "headshot uses client routing");
assert.match(drawer, /<Link href=\{profileHref\} prefetch=\{false\} className="yat-favorite-text-link"/, "player name uses client routing");
assert.match(drawer, /playerFlipCardUrl\(playerId, schoolId/, "flip-card gallery still uses original card key");
assert.match(persist, /drawer\.id === 'drawerFavorites' && link\.matches\('\.yat-favorite-headshot-link, \.yat-favorite-text-link'\)/, "close Favorites drawer without reopening during client navigation");
console.log("yat step 4 favorites OK");
