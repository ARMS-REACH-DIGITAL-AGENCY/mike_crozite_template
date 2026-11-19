-- YAT key transition, step 8 (docs/yat-key-transition.md): one YAT ID, one
-- row in flip_card_front_stage, enforced by the database itself (Pete, Nov 19
-- 2026: "Yes" to deleting Greg Bordes's second row). Closes both gaps the
-- PR #837 review found: an UPDATE that re-points a card's yatid, and two
-- writers inserting the same new YAT ID at once, now fail instead of
-- leaving two cards. The one-card guard stays: an insert for a YAT ID that
-- already has a card is still held quietly instead of erroring.
-- TEST COPY FIRST, then live with Pete's approval.

-- 1. Greg Bordes (YAT000073) keeps his one card, YAT000073 (Hamilton 5004,
--    COACH). His second row, 55184 (Dobson 2623, RETIRED, DOUBLE-A), is kept
--    in a backup table and removed. His Dobson link stays in player_hsids
--    (TBC 55184 -> 2623), so Dobson's page still lists him.
CREATE TABLE IF NOT EXISTS public.flip_card_front_stage_backup_20261119_bordes AS
SELECT * FROM public.flip_card_front_stage WHERE playerid = '55184' AND yatid = 'YAT000073';

DELETE FROM public.flip_card_front_stage f
 WHERE f.playerid = '55184' AND f.yatid = 'YAT000073'
   AND EXISTS (SELECT 1 FROM public.flip_card_front_stage_backup_20261119_bordes b WHERE b.playerid = f.playerid);

-- 2. The rule. Fails (and the whole change rolls back) if any YAT ID still
--    has two rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_flip_card_front_stage_yatid
  ON public.flip_card_front_stage (yatid);
