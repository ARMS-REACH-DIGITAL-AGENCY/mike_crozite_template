-- TBC stat lines proven wrong by the school's own records (Pete, Nov 18 2026).
-- Example: TBC filed Lakeland's 2026 line of OF Jordan Domingue (30-30 GP,
-- 111 AB, 29 H; lakelandmuskies.com/sports/baseball/stats/2026) under
-- P Diego Jordan (TBC 308115, Chandler HS, born 1999, last played 2024 INDY).
-- A held line is removed from the landing tables and refused when TBC's daily
-- import loads it again, so no page, card, job or bracket can use it. Each
-- hold records its evidence. Removing a hold lets the next import load it.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tbc_stat_line_holds (
  playerid     text NOT NULL,
  year         text NOT NULL,
  teamid       text NOT NULL,
  stat_type    text NOT NULL CHECK (stat_type IN ('batting','pitching')),
  yatid        text,
  reason       text NOT NULL,
  evidence_url text NOT NULL,
  held_by      text NOT NULL,
  held_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playerid, year, teamid, stat_type)
);

CREATE OR REPLACE FUNCTION public.refuse_held_tbc_stat_line()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tbc_stat_line_holds h
              WHERE h.playerid = NEW.playerid::text AND h.year = NEW.year::text
                AND h.teamid = NEW.teamid::text AND h.stat_type = TG_ARGV[0]) THEN
    RETURN NULL;  -- skip this row; the rest of the import continues
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS trg_refuse_held_line ON public.tbc_batting_2026_season_raw;
CREATE TRIGGER trg_refuse_held_line BEFORE INSERT OR UPDATE ON public.tbc_batting_2026_season_raw
  FOR EACH ROW EXECUTE FUNCTION public.refuse_held_tbc_stat_line('batting');
DROP TRIGGER IF EXISTS trg_refuse_held_line ON public.tbc_pitching_2026_season_raw;
CREATE TRIGGER trg_refuse_held_line BEFORE INSERT OR UPDATE ON public.tbc_pitching_2026_season_raw
  FOR EACH ROW EXECUTE FUNCTION public.refuse_held_tbc_stat_line('pitching');
DROP TRIGGER IF EXISTS trg_refuse_held_line ON public.tbc_complete_batting_history;
CREATE TRIGGER trg_refuse_held_line BEFORE INSERT OR UPDATE ON public.tbc_complete_batting_history
  FOR EACH ROW EXECUTE FUNCTION public.refuse_held_tbc_stat_line('batting');
DROP TRIGGER IF EXISTS trg_refuse_held_line ON public.tbc_complete_pitching_history;
CREATE TRIGGER trg_refuse_held_line BEFORE INSERT OR UPDATE ON public.tbc_complete_pitching_history
  FOR EACH ROW EXECUTE FUNCTION public.refuse_held_tbc_stat_line('pitching');

-- Diego Jordan (Pete, Nov 18 2026).
INSERT INTO public.tbc_stat_line_holds (playerid, year, teamid, stat_type, yatid, reason, evidence_url, held_by)
VALUES ('308115', '2026', '22447', 'batting', 'YAT161724',
        'Line belongs to OF Jordan Domingue (30-30 GP, 111 AB, 29 H); no Diego Jordan on Lakeland''s 2026 roster or stats',
        'https://lakelandmuskies.com/sports/baseball/stats/2026', 'Pete, Nov 18 2026')
ON CONFLICT DO NOTHING;

DELETE FROM public.tbc_batting_2026_season_raw d USING public.tbc_stat_line_holds h
 WHERE h.stat_type = 'batting' AND d.playerid::text = h.playerid AND d.year::text = h.year AND d.teamid::text = h.teamid;
DELETE FROM public.tbc_pitching_2026_season_raw d USING public.tbc_stat_line_holds h
 WHERE h.stat_type = 'pitching' AND d.playerid::text = h.playerid AND d.year::text = h.year AND d.teamid::text = h.teamid;
DELETE FROM public.tbc_complete_batting_history d USING public.tbc_stat_line_holds h
 WHERE h.stat_type = 'batting' AND d.playerid::text = h.playerid AND d.year::text = h.year AND d.teamid::text = h.teamid;
DELETE FROM public.tbc_complete_pitching_history d USING public.tbc_stat_line_holds h
 WHERE h.stat_type = 'pitching' AND d.playerid::text = h.playerid AND d.year::text = h.year AND d.teamid::text = h.teamid;
DELETE FROM public.tbc_verified_2026_participation v
 WHERE v.playerid::text = '308115'
   AND NOT EXISTS (SELECT 1 FROM public.tbc_batting_2026_season_raw b WHERE b.playerid::text = '308115' AND b.year = '2026')
   AND NOT EXISTS (SELECT 1 FROM public.tbc_pitching_2026_season_raw p WHERE p.playerid::text = '308115' AND p.year = '2026');

-- His card: RETIRED (Pete, Nov 18 2026). No team, no organization, highest
-- level (INDY). The override row keeps every team job off this card.
INSERT INTO public.player_team_override (playerid, teamid, team_name, level, reason, updated_by, updated_at)
VALUES ('308115', NULL, NULL, 'INDY',
        'RETIRED (Pete, Nov 18 2026). TBC 2026 Lakeland line was Jordan Domingue''s; last played 2024 INDY (Rocky Mountain)',
        'Pete, Nov 18 2026', now())
ON CONFLICT (playerid) DO UPDATE SET teamid = NULL, team_name = NULL, level = 'INDY',
  reason = EXCLUDED.reason, updated_by = EXCLUDED.updated_by, updated_at = now();

UPDATE public.flip_card_front_stage
   SET status_label = 'RETIRED', display_status_label = 'RETIRED', team_affiliation_status = 'RETIRED',
       current_teamid = NULL, current_team_name = NULL, current_org_or_conference_name = NULL,
       current_team_level = NULL, current_level_label = NULL,
       current_team_source = 'pete_manual_retired', current_team_source_team_id = NULL,
       current_team_roster_status = NULL, current_team_last_verified = NULL,
       level_label = 'INDY', display_level_label = 'INDY', highest_level_label = 'INDY',
       next_game_date = NULL, next_game_time_local = NULL, next_game_time_utc = NULL,
       next_game_home_away = NULL, next_game_opponent = NULL, next_game_status_label = NULL,
       source_summary = COALESCE(source_summary, '{}'::jsonb) || jsonb_build_object('pete_manual_status',
         jsonb_build_object('status','RETIRED','at',now(),'reason','TBC 2026 Lakeland line was Jordan Domingue''s')),
       stage_updated_at = now(), updated_at = now()
 WHERE playerid = '308115';

COMMIT;
