-- stat_lines.source_level for MLB's "WIN" and "IND" lines (Pete, Oct 27).
--
-- Pete's rules:
--   - a game in a league based outside the United States is INTERNATIONAL;
--   - the Arizona Fall League is MLB (MLB-level exhibition games, like
--     spring training).
-- MLB's feed files the Fall League and the Mexican, Dominican and Venezuelan
-- leagues under "WIN" (winter) or "IND" (independent), which are not levels.
-- The earlier migration left those lines' source_level empty (1,193 lines on
-- Oct 27); no line may be without a level.
--
-- source_level is now, in order:
--   1. MLB's affiliated level (MLB, TRIPLE-A ... ROOKIE), as before;
--   2. the league: Arizona Fall League -> MLB; Mexican League, Liga Mexicana
--      del Pacifico, Liga de Beisbol Dominicano, Liga Venezuela Beisbol
--      Profesional -> INTERNATIONAL;
--   3. otherwise the team's official level in teamid_universe_mapping (Pete's
--      list), never a guess. It is empty only when the team has no official
--      level, and such a line is already held (hold_reason).
-- A league line whose team is listed at a different level is held by the
-- view's existing check ("MLB lists ... at ...; teamid ... is listed ...").
--
-- The view's other columns are unchanged: this rewrites only its level block,
-- in place, and refuses to run if that block isn't found.

DO $do$
DECLARE
  d text := pg_get_viewdef('public.v_stat_lines_from_mlb'::regclass, true);
  n text;
BEGIN
  n := regexp_replace(d,
    $p$CROSS JOIN LATERAL \( SELECT\s+CASE \(l\.raw_payload -> 'sport'::text\) ->> 'abbreviation'::text.*END AS level\) mlb$p$,
    $r$CROSS JOIN LATERAL ( SELECT COALESCE(
                CASE (l.raw_payload -> 'sport'::text) ->> 'abbreviation'::text
                    WHEN 'MLB'::text THEN 'MLB'::text
                    WHEN 'AAA'::text THEN 'TRIPLE-A'::text
                    WHEN 'AA'::text THEN 'DOUBLE-A'::text
                    WHEN 'A+'::text THEN 'HIGH-A'::text
                    WHEN 'A'::text THEN 'SINGLE-A'::text
                    WHEN 'ROK'::text THEN 'ROOKIE'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN ((l.raw_payload -> 'league'::text) ->> 'name'::text) = 'Arizona Fall League'::text THEN 'MLB'::text
                    WHEN ((l.raw_payload -> 'league'::text) ->> 'name'::text) = ANY (ARRAY['Mexican League'::text, 'Liga Mexicana del Pacifico'::text, 'Liga de Beisbol Dominicano'::text, 'Liga Venezuela Beisbol Profesional'::text]) THEN 'INTERNATIONAL'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN u.official THEN u.level
                    ELSE NULL::text
                END) AS level) mlb$r$);
  IF n = d THEN
    RAISE EXCEPTION 'v_stat_lines_from_mlb: the source_level block was not found; nothing changed';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_stat_lines_from_mlb AS ' || n;
END
$do$;

-- The lines already landed. The MLB feed writes stat_lines all the time, so
-- this takes only rows that aren't locked; run it until it updates 0 rows.
WITH todo AS (
  SELECT id FROM public.stat_lines
   WHERE source = 'mlb_api' AND source_level IS NULL
     AND (league_name IN ('Arizona Fall League', 'Mexican League', 'Liga Mexicana del Pacifico',
                          'Liga de Beisbol Dominicano', 'Liga Venezuela Beisbol Profesional')
          OR level IS NOT NULL)
   FOR UPDATE SKIP LOCKED)
UPDATE public.stat_lines s
   SET source_level = CASE
         WHEN s.league_name = 'Arizona Fall League' THEN 'MLB'
         WHEN s.league_name IN ('Mexican League', 'Liga Mexicana del Pacifico',
                                'Liga de Beisbol Dominicano', 'Liga Venezuela Beisbol Profesional') THEN 'INTERNATIONAL'
         ELSE s.level
       END
  FROM todo
 WHERE s.id = todo.id;
