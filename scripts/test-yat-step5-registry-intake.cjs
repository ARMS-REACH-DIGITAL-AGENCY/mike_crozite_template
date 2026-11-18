// YAT ID key transition, step 5 (docs/yat-key-transition.md): every new MLB
// ID a job learns attaches to the person's YAT ID in the registry, whichever
// job writes it; rejected matches, MLB IDs already owned, and a second MLB ID
// for one person are never attached.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const sql = fs.readFileSync(path.join(__dirname, "..", "migrations/20261118_yat_step5_mlb_registry_intake.sql"), "utf8");
assert.match(sql, /CREATE TRIGGER trg_yat_attach_mlb AFTER INSERT OR UPDATE OF match_status, playerid, source_player_id\s+ON public\.mlb_org_roster_resolution/, "roster matches attach MLB IDs");
assert.match(sql, /CREATE TRIGGER trg_yat_attach_mlb AFTER INSERT OR UPDATE OF source, source_player_id, playerid, match_method\s+ON public\.player_source_map/, "MLB links attach MLB IDs");
assert.match(sql, /match_method IS DISTINCT FROM 'rejected_bad_identity_match'/, "rejected matches never attach");
assert.match(sql, /WHERE source = 'mlb' AND source_id = btrim\(p_mlb\)\) THEN RETURN/, "an MLB ID already owned is never moved");
assert.match(sql, /WHERE source = 'mlb' AND yatid = v_yat\) THEN RETURN/, "a second MLB ID for one person is left for Pete");
const indy = fs.readFileSync(path.join(__dirname, "..", "migrations/20261118_yat_step5_indy_registry_intake.sql"), "utf8");
assert.match(indy, /CREATE TRIGGER trg_yat_attach_indy AFTER INSERT OR UPDATE OF yatstats_playerid, source_player_id\s+ON public\.indy_iscore_player_source_map/, "INDY links attach INDY IDs");
assert.match(indy, /ON CONFLICT \(source, source_id\) DO NOTHING/, "an INDY ID already attached is never moved");
console.log("yat step 5 registry intake OK");
