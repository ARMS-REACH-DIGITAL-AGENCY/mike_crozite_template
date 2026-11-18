// YAT ID key transition, step 4, search (docs/yat-key-transition.md): one
// person = one search result (de-duplicated by YAT ID), duplicate TBC numbers
// resolve through the YAT registry, not player_source_map.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const route = fs.readFileSync(path.join(__dirname, "..", "src/app/api/players/search/route.ts"), "utf8");
assert.match(route, /select distinct on \(coalesce\(public\.yat_id_for\(c\.playerid\), c\.playerid\)\)/, "search results must be one per person");
assert.match(route, /f\.yatid = public\.yat_id_for\(tp\.playerid::text\)/, "TBC numbers resolve to the person's card through the registry");
assert(!/player_source_map/.test(route), "search must not read player_source_map");
console.log("yat step 4 search OK");
