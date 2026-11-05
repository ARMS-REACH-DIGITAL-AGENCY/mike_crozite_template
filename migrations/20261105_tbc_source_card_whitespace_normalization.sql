-- Normalize whitespace carried in TBC identity fields into newly created
-- flip cards. TBC source snapshots and raw player identity fields remain
-- unchanged for provenance. Do not touch fan-created or manually edited cards.
-- The batch publisher now applies this normalization on initial publication.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
UPDATE public.flip_card_front_stage f SET
  display_name=BTRIM(regexp_replace(f.display_name, '[[:space:]]+', ' ', 'g')),
  first_name=BTRIM(regexp_replace(f.first_name, '[[:space:]]+', ' ', 'g')),
  last_name=BTRIM(regexp_replace(f.last_name, '[[:space:]]+', ' ', 'g')),
  updated_at=now()
WHERE f.source_summary->>'source'='tbc_player_feed'
  AND (
    f.display_name IS DISTINCT FROM BTRIM(regexp_replace(f.display_name, '[[:space:]]+', ' ', 'g'))
    OR f.first_name IS DISTINCT FROM BTRIM(regexp_replace(f.first_name, '[[:space:]]+', ' ', 'g'))
    OR f.last_name IS DISTINCT FROM BTRIM(regexp_replace(f.last_name, '[[:space:]]+', ' ', 'g'))
  );
COMMIT;
