// YAT ID key transition, step 4, social (docs/yat-key-transition.md): a
// player's own social accounts and posts show on every card of that person.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
assert.match(read("src/app/api/social/player/[playerId]/route.ts"), /s\.yatid = public\.yat_id_for\(\$1::text\)/, "player posts read by person");
assert.match(read("src/lib/db.ts"), /WHERE yatid = public\.yat_id_for\(\$1::text\) AND status = 'active' AND COALESCE\(handle, ''\) <> ''/, "player handles read by person");
console.log("yat step 4 social OK");
