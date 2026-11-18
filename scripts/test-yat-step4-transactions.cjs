// YAT ID key transition, step 4, transactions (docs/yat-key-transition.md):
// a player's MLB transactions and draft picks show on every card of that person.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const db = fs.readFileSync(path.join(__dirname, "..", "src/lib/db.ts"), "utf8");
assert.match(db, /FROM player_transactions\s+-- One person, every card \(YAT key step 4\)\.\s+WHERE yatid = public\.yat_id_for\(\$1::text\)/, "transactions read by person");
assert.match(db, /where d\.yatid = public\.yat_id_for\(\$1::text\)/, "draft picks read by person");
console.log("yat step 4 transactions OK");
