'use strict';
// YAT key step 8 (Pete, Nov 18 2026): one person, one flip card. A card insert
// for a YAT ID that already has a card is held for review (no second card);
// inserts/upserts of an existing card number are left to their ON CONFLICT.
const assert = require('node:assert/strict');
const sql = require('node:fs').readFileSync('migrations/20261119_yat_step8_one_card_per_person.sql', 'utf8');
assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.card_identity_holds/, 'held attempts are kept for review');
assert.match(sql, /WHERE playerid = NEW\.playerid\) THEN\s+RETURN NEW;/, 'an existing card number is untouched (ON CONFLICT decides)');
assert.match(sql, /WHERE yatid = NEW\.yatid AND playerid <> NEW\.playerid/, 'a second card for the same YAT ID is detected');
assert.match(sql, /RETURN NULL;/, 'a second card is never created');
assert.match(sql, /CREATE TRIGGER trg_zz_one_card_per_person BEFORE INSERT ON public\.flip_card_front_stage/, 'runs after the YAT ID is resolved (name order)');
assert.doesNotMatch(sql, /\b(UPDATE|DELETE FROM)\s+public\.flip_card_front_stage/i, 'existing cards are not changed');
for (const f of ['scripts/refresh-flip-card-front-stage-from-mlb.ts', 'src/lib/publishNewPlayer.ts', 'src/lib/contributionPublisher.ts']) {
  const src = require('node:fs').readFileSync(f, 'utf8');
  assert.match(src, /INSERT INTO (public\.)?flip_card_front_stage/, `${f} still inserts cards`);
}
console.log('yat step 8 one-card guard OK');
