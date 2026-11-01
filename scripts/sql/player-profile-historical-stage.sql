-- Historical stage refresh only. NEVER alters original TBC feed tables.
-- Run after an approved, complete historical import, not from fan requests.
-- Transactional rebuild: if parity or row count validation fails, ROLLBACK
-- preserves the previously published staged data.
BEGIN;
SET LOCAL statement_timeout='180s';
CREATE TABLE IF NOT EXISTS public.player_profile_historical_stats_stage (
  playerid text PRIMARY KEY,
  batting_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  pitching_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  batting_prepared_at timestamptz,
  pitching_prepared_at timestamptz
);
CREATE TEMP TABLE _new_historical_batting ON COMMIT DROP AS
SELECT b.playerid::text AS playerid,
       jsonb_agg(to_jsonb(b) ORDER BY b.year,b.teamid,md5(to_jsonb(b)::text)) AS batting_rows
FROM public.tbc_batting_raw b
WHERE b.playerid IS NOT NULL
  AND (substring(b.year from '[0-9]{4}') IS NULL OR substring(b.year from '[0-9]{4}')::int < 2026)
GROUP BY b.playerid::text;
CREATE UNIQUE INDEX ON _new_historical_batting(playerid);
CREATE TEMP TABLE _new_historical_pitching ON COMMIT DROP AS
SELECT p.playerid::text AS playerid,
       jsonb_agg(to_jsonb(p) ORDER BY p.year,p.teamid,md5(to_jsonb(p)::text)) AS pitching_rows
FROM public.tbc_pitching_raw p
WHERE p.playerid IS NOT NULL
  AND (substring(p.year from '[0-9]{4}') IS NULL OR substring(p.year from '[0-9]{4}')::int < 2026)
GROUP BY p.playerid::text;
CREATE UNIQUE INDEX ON _new_historical_pitching(playerid);
DO $$
DECLARE source_batting bigint; stage_batting bigint;
        source_pitching bigint; stage_pitching bigint;
        mismatch_batting bigint; mismatch_pitching bigint; stale_players bigint;
BEGIN
 SELECT count(*) INTO source_batting FROM public.tbc_batting_raw
 WHERE playerid IS NOT NULL AND (substring(year from '[0-9]{4}') IS NULL OR substring(year from '[0-9]{4}')::int < 2026);
 SELECT COALESCE(sum(jsonb_array_length(batting_rows)),0) INTO stage_batting FROM _new_historical_batting;
 SELECT count(*) INTO source_pitching FROM public.tbc_pitching_raw
 WHERE playerid IS NOT NULL AND (substring(year from '[0-9]{4}') IS NULL OR substring(year from '[0-9]{4}')::int < 2026);
 SELECT COALESCE(sum(jsonb_array_length(pitching_rows)),0) INTO stage_pitching FROM _new_historical_pitching;
 IF source_batting <> stage_batting OR source_pitching <> stage_pitching THEN
  RAISE EXCEPTION 'Historical stage count parity failed: batting %/% pitching %/%',source_batting,stage_batting,source_pitching,stage_pitching;
 END IF;
 -- Order-independent per-player fingerprints, including duplicate source rows.
 WITH raw_d AS (
  SELECT b.playerid::text AS playerid, md5(string_agg(md5(to_jsonb(b)::text),':' ORDER BY md5(to_jsonb(b)::text))) digest
  FROM public.tbc_batting_raw b
  WHERE b.playerid IS NOT NULL AND (substring(b.year from '[0-9]{4}') IS NULL OR substring(b.year from '[0-9]{4}')::int < 2026)
  GROUP BY b.playerid::text
 ), stage_d AS (
  SELECT t.playerid, md5(string_agg(md5(e.value::text),':' ORDER BY md5(e.value::text))) digest
  FROM _new_historical_batting t CROSS JOIN LATERAL jsonb_array_elements(t.batting_rows) e(value) GROUP BY t.playerid
 )
 SELECT count(*) INTO mismatch_batting FROM raw_d FULL JOIN stage_d USING(playerid)
 WHERE raw_d.digest IS DISTINCT FROM stage_d.digest;
 WITH raw_d AS (
  SELECT p.playerid::text AS playerid, md5(string_agg(md5(to_jsonb(p)::text),':' ORDER BY md5(to_jsonb(p)::text))) digest
  FROM public.tbc_pitching_raw p
  WHERE p.playerid IS NOT NULL AND (substring(p.year from '[0-9]{4}') IS NULL OR substring(p.year from '[0-9]{4}')::int < 2026)
  GROUP BY p.playerid::text
 ), stage_d AS (
  SELECT t.playerid, md5(string_agg(md5(e.value::text),':' ORDER BY md5(e.value::text))) digest
  FROM _new_historical_pitching t CROSS JOIN LATERAL jsonb_array_elements(t.pitching_rows) e(value) GROUP BY t.playerid
 )
 SELECT count(*) INTO mismatch_pitching FROM raw_d FULL JOIN stage_d USING(playerid)
 WHERE raw_d.digest IS DISTINCT FROM stage_d.digest;
 IF mismatch_batting <> 0 OR mismatch_pitching <> 0 THEN
  RAISE EXCEPTION 'Historical stage content parity failed: batting % pitching %',mismatch_batting,mismatch_pitching;
 END IF;
 -- Removed or reassigned source IDs require explicit investigation. A refresh
 -- must not quietly retain stale staging records and claim full parity.
 SELECT count(*) INTO stale_players
 FROM public.player_profile_historical_stats_stage s
 WHERE NOT EXISTS (SELECT 1 FROM _new_historical_batting b WHERE b.playerid=s.playerid)
   AND NOT EXISTS (SELECT 1 FROM _new_historical_pitching p WHERE p.playerid=s.playerid);
 IF stale_players > 0 THEN
  RAISE EXCEPTION 'Historical stage includes % source-absent players; stop and review source/import changes',stale_players;
 END IF;
END $$;
-- Update only after successful complete validation.
INSERT INTO public.player_profile_historical_stats_stage(playerid,batting_rows,pitching_rows,batting_prepared_at,pitching_prepared_at)
SELECT u.playerid,
       COALESCE(b.batting_rows,'[]'::jsonb),
       COALESCE(p.pitching_rows,'[]'::jsonb),now(),now()
FROM (SELECT playerid FROM _new_historical_batting UNION SELECT playerid FROM _new_historical_pitching) u
LEFT JOIN _new_historical_batting b USING(playerid)
LEFT JOIN _new_historical_pitching p USING(playerid)
ON CONFLICT(playerid) DO UPDATE SET
 batting_rows=excluded.batting_rows,pitching_rows=excluded.pitching_rows,
 batting_prepared_at=excluded.batting_prepared_at,pitching_prepared_at=excluded.pitching_prepared_at;
-- In-place staged refresh does not remove players automatically: stale player IDs
-- should be reviewed, never silently dropped or rekeyed.
COMMIT;
