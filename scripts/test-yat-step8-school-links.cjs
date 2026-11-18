'use strict';
// YAT key step 8 groundwork (docs/yat-key-transition.md): school links that
// work for every source. player_hsids must keep returning exactly today's
// TBC links (verified + legacy) from yat_school_links, links must carry the
// YAT ID, and TBC link changes must flow in automatically.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync('migrations/20261118_yat_step8_school_links.sql', 'utf8');

assert.match(sql, /FUNCTION public\.school_key_norm\(t text\)[\s\S]*IMMUTABLE/, 'one school-text rule, ignoring capitals and spacing');
assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.school_source_keys/, 'school translation table');
assert.match(sql, /'Home Schooled \(--,--\)', 15322/, 'Home Schooled = TBC hs_team 15322 (Pete)');
assert.match(sql, /school_success_backup_20261118 AS SELECT \* FROM public\.school_success/, 'school_success backed up first');
assert.match(sql, /IF n <> 194 THEN RAISE EXCEPTION/, 'twin merge stops unless exactly the 194 measured twins');
assert.match(sql, /COALESCE\(a\.%1\$I, b\.%1\$I\)/, 'Pete numbers only fill empty fields');
assert.match(sql, /NOT IN \('hsid', 'microsite_url', 'staging_url'\)/, 'hsid and address are never taken from the hsid-less row');
assert.match(sql, /hsname NOT LIKE '\^%'/, "Pete's ^ / ^^ marker rows are not touched");
assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.yat_school_links/, 'YAT ID school links');
assert.match(sql, /FROM public\.v_player_hsids_verified_prepared v/, 'seeded from today\'s TBC links exactly');
for (const t of ['tbc_player_verified_school_links', 'tbc_legacy_player_school_links', 'player_hsid_exclusion']) {
  assert.ok(sql.includes(`'${t}'`), `${t} changes resync the links`);
}
assert.match(sql, /trg_yat_school_links_fill_yatid AFTER INSERT ON public\.yat_registry_ids/, 'late registrations get their YAT ID');
assert.match(sql, /CREATE OR REPLACE VIEW public\.player_hsids AS[\s\S]*FROM public\.yat_school_links l[\s\S]*l\.method IN \('tbc_verified_link', 'tbc_legacy_link'\)/,
  'player_hsids reads the same TBC links from yat_school_links');
assert.doesNotMatch(sql, /(UPDATE|DELETE FROM|INSERT INTO|TRUNCATE)\s+public\.tbc_(players|schools)_raw/i, 'TBC raw imports are never edited');
console.log('yat step 8 school links OK');
