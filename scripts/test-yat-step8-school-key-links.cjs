'use strict';
// YAT key step 8 (Pete, Nov 19 2026): a player whose tbc_players_raw.high_school
// matches a school only through school_source_keys (TBC renamed the school) is
// linked (school_key_match), shown by player_hsids, and so gets his flip card
// from the nightly TBC job. Links stay current with no hand-run step.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync('migrations/20261119_yat_step8_school_key_links.sql', 'utf8');
assert.match(sql, /CREATE OR REPLACE VIEW public\.player_hsids AS[\s\S]*l\.method IN \('tbc_verified_link', 'tbc_legacy_link', 'school_key_match'\)/, 'player_hsids reads school_key_match links');
assert.match(sql, /HAVING count\(DISTINCT sk\.hsid\) = 1/, 'a name with two hsids never places a player');
assert.match(sql, /NOT EXISTS \(SELECT 1 FROM public\.yat_school_links x\s+WHERE x\.source = 'tbc' AND x\.source_player_id = p\.playerid::text\)/, 'TBC\'s own link always wins');
assert.match(sql, /player_hsid_exclusion e/, 'exclusions always win');
for (const t of ['tbc_players_raw', 'school_source_keys']) {
  assert.match(sql, new RegExp(`CREATE TRIGGER trg_yat_links_ins AFTER INSERT ON public\\.${t}`), `${t} inserts keep links current`);
  assert.match(sql, new RegExp(`CREATE TRIGGER trg_yat_links_upd AFTER UPDATE ON public\\.${t}`), `${t} updates keep links current`);
}
const ingest = fs.readFileSync('src/app/api/cron/tbc-safe-ingest/route.ts', 'utf8');
assert.match(ingest, /from public\.player_hsids ph[\s\S]*left join public\.flip_card_front_stage f on f\.playerid = ph\.playerid/, 'nightly job still makes cards from player_hsids');
// One card per person (Pete, Nov 19 2026): a card keyed by his YAT ID is his
// card, so the nightly job never tries a second one under his TBC number.
assert.match(ingest, /left join public\.yat_registry_ids r\s+on r\.source = 'tbc' and r\.source_id = ph\.playerid::text/, 'nightly job finds his YAT ID');
assert.match(ingest, /not exists \(\s*select 1 from public\.flip_card_front_stage fy\s+where r\.yatid is not null and fy\.yatid = r\.yatid\s*\)/, 'a card for his YAT ID counts as his card');
console.log('yat step 8 school key links OK');
