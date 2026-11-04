-- Single, transactional source of truth for new fan-created YAT player IDs.
-- Legacy manually assigned YAT210000 is intentionally reserved, not the counter.
-- Source import IDs (TBC/MLB) are not part of this YAT-only series.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public.yat_player_id_counter (
  id smallint PRIMARY KEY CHECK (id = 1),
  last_assigned integer NOT NULL CHECK (last_assigned BETWEEN 0 AND 999999)
);
-- As of 2026-11-04 there are no gaps in YAT000001..YAT000091.
-- Initialize from the contiguous normal IDs; do not jump to YAT210000.
INSERT INTO public.yat_player_id_counter (id, last_assigned)
SELECT 1, COALESCE(MAX(substring(playerid from 4)::integer), 0)
FROM public.flip_card_front_stage
WHERE playerid ~ '^YAT[0-9]{6}$'
  AND playerid <> 'YAT210000'
ON CONFLICT (id) DO NOTHING;
COMMIT;
