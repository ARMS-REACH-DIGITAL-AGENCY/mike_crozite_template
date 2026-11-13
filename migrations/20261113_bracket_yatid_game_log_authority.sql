-- YAT?STATS: permanent identity for game statistics consumed by the 2027 bracket.
-- Preserve immutable provider playerid and source-game identifiers, including
-- uniqueness and the existing stat_lines publication triggers.
-- No fan-facing joins or per-player crosswalk queries; indexed YAT IDs are
-- materialized when stats enter the database and updated on verified linking.
--
-- Rehearse on a Neon production clone. Backfill about 188k existing rows.
-- A NULL yatid is an explicit unresolved hold: its line cannot enter scoring.
BEGIN;

ALTER TABLE public.player_game_logs
  ADD COLUMN IF NOT EXISTS yatid text;

CREATE OR REPLACE FUNCTION public.game_log_source_yatid(
  p_source text, p_external_player_id text
)
RETURNS text
LANGUAGE sql STABLE
AS $yat$
  SELECT CASE
    WHEN p_source = 'yat' THEN
      (SELECT y.yatid FROM public.yat_registry y
        WHERE y.yatid=p_external_player_id AND y.merged_into IS NULL)
    WHEN p_source IN ('mlb_api','tbc','presto_sports','sidearm','mlb') THEN
      (SELECT ids.yatid FROM public.yat_registry_ids ids
        WHERE ids.source = CASE WHEN p_source='mlb_api' THEN 'tbc' ELSE p_source END
          AND ids.source_id = p_external_player_id)
    ELSE NULL
  END
$yat$;

-- Source=mlb_api currently stores TBC playerid, not MLB person.id. That
-- legacy adapter is explicit; Presto and SIDEARM never fall back to TBC.
CREATE OR REPLACE FUNCTION public.assign_game_log_yatid()
RETURNS trigger
LANGUAGE plpgsql AS $assign$
BEGIN
  NEW.yatid := public.game_log_source_yatid(NEW.source, NEW.playerid);
  RETURN NEW;
END
$assign$;

DROP TRIGGER IF EXISTS trg_assign_game_log_yatid ON public.player_game_logs;
CREATE TRIGGER trg_assign_game_log_yatid
  BEFORE INSERT OR UPDATE OF playerid, source
  ON public.player_game_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_game_log_yatid();

-- Existing source/game keys are untouched. Every saved 2026 game is now
-- resolvable by its authoritative YAT ID using a source-PK lookup.
UPDATE public.player_game_logs l
   SET yatid = public.game_log_source_yatid(l.source,l.playerid)
 WHERE l.yatid IS DISTINCT FROM public.game_log_source_yatid(l.source,l.playerid);

CREATE INDEX IF NOT EXISTS idx_player_game_logs_yatid_date
  ON public.player_game_logs (yatid, game_date DESC)
  WHERE yatid IS NOT NULL;

-- When a provider identity arrives AFTER its game log, promote the held raw
-- line to a scored YAT identity. Revocations clear the old identity. Uses
-- existing playerid index; does not touch historical raw IDs or stats.
CREATE OR REPLACE FUNCTION public.sync_game_log_yatid_on_verified_source()
RETURNS trigger LANGUAGE plpgsql AS $links$
DECLARE
  old_log_source text;
  new_log_source text;
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') THEN
    old_log_source := CASE WHEN OLD.source='tbc' THEN 'mlb_api' ELSE OLD.source END;
    IF OLD.source IN ('tbc','presto_sports','sidearm','mlb') THEN
      UPDATE public.player_game_logs l
         SET yatid = NULL
       WHERE l.playerid=OLD.source_id
         AND l.source=old_log_source
         AND l.yatid=OLD.yatid;
      -- A native TBC game-log source can carry the exact same TBC ID.
      IF OLD.source='tbc' THEN
        UPDATE public.player_game_logs l SET yatid=NULL
         WHERE l.playerid=OLD.source_id AND l.source='tbc'
           AND l.yatid=OLD.yatid;
      END IF;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    new_log_source := CASE WHEN NEW.source='tbc' THEN 'mlb_api' ELSE NEW.source END;
    IF NEW.source IN ('tbc','presto_sports','sidearm','mlb') THEN
      UPDATE public.player_game_logs l SET yatid=NEW.yatid
       WHERE l.playerid=NEW.source_id
         AND l.source=new_log_source
         AND l.yatid IS DISTINCT FROM NEW.yatid;
      IF NEW.source='tbc' THEN
        UPDATE public.player_game_logs l SET yatid=NEW.yatid
         WHERE l.playerid=NEW.source_id AND l.source='tbc'
           AND l.yatid IS DISTINCT FROM NEW.yatid;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END
$links$;

DROP TRIGGER IF EXISTS trg_sync_game_log_verified_yat
  ON public.yat_registry_ids;
CREATE TRIGGER trg_sync_game_log_verified_yat
  AFTER INSERT OR UPDATE OF source,source_id,yatid OR DELETE
  ON public.yat_registry_ids
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_game_log_yatid_on_verified_source();

-- Operational view, never used by public pages. Unmatched incoming Presto
-- and SIDEARM records stay in raw logs but are held OUT of scoring.
CREATE OR REPLACE VIEW public.yat_bracket_unresolved_game_log_sources AS
  SELECT source,playerid AS external_player_id,COUNT(*)::bigint AS held_lines,
         MIN(game_date) AS first_game,MAX(game_date) AS last_game
    FROM public.player_game_logs
   WHERE yatid IS NULL
   GROUP BY source,playerid;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.player_game_logs
     WHERE source='mlb_api' AND yatid IS NULL
  ) THEN
    RAISE EXCEPTION 'Existing MLB game logs have unresolved YAT IDs; abort YAT bracket migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.player_game_logs l
    JOIN public.yat_registry_ids ids
      ON ids.source='tbc' AND ids.source_id=l.playerid
   WHERE l.source='mlb_api' AND l.yatid IS DISTINCT FROM ids.yatid
  ) THEN
    RAISE EXCEPTION 'MLB/TBC to permanent YAT mapping mismatch; abort migration';
  END IF;
END
$verify$;

COMMIT;
