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
console.log("yat step 4 favorites OK");
