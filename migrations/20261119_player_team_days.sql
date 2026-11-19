-- Which real team each player was on, day by day, as MLB's own roster check
-- saw it (Pete, Nov 19 2026: the latest MLB evidence wins). Read by the W-L
-- inning (src/lib/bracket/clubOnDay.ts) together with MLB transactions and
-- game lines. TEST COPY FIRST (claude-test), then live only with Pete's
-- approval.
--
-- mlb_org_roster_raw keeps only about a week of roster checks (the roster
-- sync prunes older runs), so this table is the lasting record. Filled after
-- every roster sync run by record_player_team_days(run_id); the backfill at
-- the end records the runs still on hand.
--
-- His team that day: his "active" roster team (the team he plays for); else,
-- off the active roster (most often injured), his fullRoster affiliate; only
-- if that's all MLB lists, the MLB club. The day is the date in Arizona.

CREATE TABLE IF NOT EXISTS public.player_team_days (
  yatid       text        NOT NULL,
  day         date        NOT NULL,
  source      text        NOT NULL,   -- 'mlb_roster' (later: indy, international, presto)
  team_name   text        NOT NULL,
  level       text,
  mlb_id      text,
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (yatid, day, source)
);
CREATE INDEX IF NOT EXISTS player_team_days_day_idx ON public.player_team_days (day);

CREATE OR REPLACE FUNCTION public.record_player_team_days(p_run uuid)
RETURNS integer LANGUAGE plpgsql AS $f$
DECLARE n integer;
BEGIN
  WITH r AS (
    SELECT x.source_player_id AS mlb_id, x.source_team_name AS team, x.level, x.org_name,
           x.roster_type, x.seen_at,
           CASE WHEN x.roster_type = 'active' THEN 1
                WHEN x.roster_type = 'fullRoster' AND x.source_team_name IS DISTINCT FROM x.org_name THEN 2
                WHEN x.roster_type = 'fullRoster' THEN 3
                ELSE 9 END AS pref
      FROM public.mlb_org_roster_raw x
     WHERE x.run_id = p_run AND coalesce(x.source_team_name, '') <> ''
  ), best AS (
    SELECT DISTINCT ON (r.mlb_id) r.*
      FROM r WHERE r.pref < 9
     ORDER BY r.mlb_id, r.pref, r.seen_at DESC
  ), ins AS (
    INSERT INTO public.player_team_days (yatid, day, source, team_name, level, mlb_id, observed_at)
    SELECT l.yatid, (b.seen_at AT TIME ZONE 'America/Phoenix')::date, 'mlb_roster', b.team, b.level, b.mlb_id, b.seen_at
      FROM best b
      JOIN public.yat_mlb_links l ON l.mlb_id = b.mlb_id
    ON CONFLICT (yatid, day, source) DO UPDATE
       SET team_name = EXCLUDED.team_name, level = EXCLUDED.level, mlb_id = EXCLUDED.mlb_id,
           observed_at = EXCLUDED.observed_at
     WHERE EXCLUDED.observed_at >= public.player_team_days.observed_at
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  RETURN n;
END
$f$;

-- Backfill: every roster run still on hand, oldest first.
SELECT public.record_player_team_days(run_id)
  FROM (SELECT run_id, min(seen_at) AS t FROM public.mlb_org_roster_raw GROUP BY run_id ORDER BY t) runs;
