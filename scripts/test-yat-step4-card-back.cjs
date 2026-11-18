// YAT ID key transition, step 4, card back (docs/yat-key-transition.md):
// the card back's stats (TBC career, INDY, external, AFL) read by the person,
// so every card of one person shows the same numbers.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const db = read("src/lib/db.ts");
assert.match(db, /WHERE yatid=public\.yat_id_for\(\$1::text\) AND source='tbc'/, "career TBC numbers come from the person's registry entry for any id");
const indy = read("src/lib/indyIscore.ts");
for (const a of ["b", "p", "g"]) {
  assert(indy.includes(`where ${a}.yatstats_playerid::text in \${personIdsSql('$1')}`), `INDY ${a} rows must match every number of the person`);
}
assert.match(read("src/lib/externalStats.ts"), /where ep\.yatid = public\.yat_id_for\(\$1::text\)/, "external stats read by YAT ID");
assert(read("src/lib/aflSeasonStats.ts").includes("WHERE s.playerid IN ${personIdsSql('$1')}"), "AFL stats match every number of the person");
assert.match(read("src/lib/personIdsSql.ts"), /public\.yat_registry_ids ids/, "person ids come from the registry");
console.log("yat step 4 card back OK");
