// YAT ID key transition, step 4, headshots (docs/yat-key-transition.md): a
// player's official MLB headshot uses the MLB ID the YAT registry attaches to
// the person, for any of his numbers; never player_source_map.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "src/lib/playerHeadshots.ts"), "utf8");
assert.match(src, /ON r\.yatid = public\.yat_id_for\(x\) AND r\.source = 'mlb'/, "headshot MLB ID comes from the registry");
assert(!/FROM player_source_map/.test(src), "headshots must not read player_source_map");
console.log("yat step 4 headshots OK");
