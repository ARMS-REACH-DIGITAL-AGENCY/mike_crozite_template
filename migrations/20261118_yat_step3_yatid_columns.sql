-- YAT ID key transition, step 3 (docs/yat-key-transition.md; Pete, Nov 18 2026).
-- Every live (group C) table gets a YAT ID column beside its player number,
-- filled from the registry; new and changed rows fill it themselves. Nothing
-- reads these columns yet (step 4), so the site does not change. Additive and
-- reversible: migrations/20261118_yat_step3_yatid_columns_down.sql.
-- flip_card_front_stage and player_game_logs already carry yatid (Nov 13).
BEGIN;

-- The person behind any player number: a YAT ID stays itself; a TBC number
-- or an old card number resolves through yat_registry_ids.
CREATE OR REPLACE FUNCTION public.yat_id_for(p text)
RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT CASE
    WHEN NULLIF(btrim(p),'') IS NULL THEN NULL
    WHEN btrim(p) ~ '^YAT[0-9]{6,}$' AND EXISTS (SELECT 1 FROM public.yat_registry r WHERE r.yatid = btrim(p)) THEN btrim(p)
    ELSE (SELECT ids.yatid FROM public.yat_registry_ids ids
           WHERE ids.source IN ('tbc','yat_card','yat_legacy') AND ids.source_id = btrim(p)
           ORDER BY ids.source = 'tbc' DESC LIMIT 1)
  END
$f$;

-- Trigger arguments come in pairs: player column, YAT ID column.
CREATE OR REPLACE FUNCTION public.set_yatid_from_player_columns()
RETURNS trigger LANGUAGE plpgsql AS $t$
DECLARE i int;
BEGIN
  FOR i IN 0 .. (TG_NARGS / 2) - 1 LOOP
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
      TG_ARGV[2*i+1], public.yat_id_for(to_jsonb(NEW) ->> TG_ARGV[2*i])));
  END LOOP;
  RETURN NEW;
END;
$t$;


-- afl_current_roster_overlays
ALTER TABLE public.afl_current_roster_overlays ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.afl_current_roster_overlays SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_afl_current_roster_overlays_yatid ON public.afl_current_roster_overlays(yatid);
DROP TRIGGER IF EXISTS trg_afl_current_roster_overlays_yatid ON public.afl_current_roster_overlays;
CREATE TRIGGER trg_afl_current_roster_overlays_yatid BEFORE INSERT OR UPDATE OF playerid ON public.afl_current_roster_overlays FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- alumni_where_yat_memory_tags
ALTER TABLE public.alumni_where_yat_memory_tags ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.alumni_where_yat_memory_tags SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_alumni_where_yat_memory_tags_yatid ON public.alumni_where_yat_memory_tags(yatid);
DROP TRIGGER IF EXISTS trg_alumni_where_yat_memory_tags_yatid ON public.alumni_where_yat_memory_tags;
CREATE TRIGGER trg_alumni_where_yat_memory_tags_yatid BEFORE INSERT OR UPDATE OF playerid ON public.alumni_where_yat_memory_tags FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- alumni_where_yat_now
ALTER TABLE public.alumni_where_yat_now ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.alumni_where_yat_now SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_alumni_where_yat_now_yatid ON public.alumni_where_yat_now(yatid);
DROP TRIGGER IF EXISTS trg_alumni_where_yat_now_yatid ON public.alumni_where_yat_now;
CREATE TRIGGER trg_alumni_where_yat_now_yatid BEFORE INSERT OR UPDATE OF playerid ON public.alumni_where_yat_now FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- college_player_match_review
ALTER TABLE public.college_player_match_review ADD COLUMN IF NOT EXISTS candidate_yatid_1 text, ADD COLUMN IF NOT EXISTS candidate_yatid_2 text, ADD COLUMN IF NOT EXISTS candidate_yatid_3 text;
UPDATE public.college_player_match_review SET candidate_yatid_1 = public.yat_id_for(candidate_playerid_1::text) WHERE candidate_playerid_1 IS NOT NULL AND candidate_yatid_1 IS DISTINCT FROM public.yat_id_for(candidate_playerid_1::text);
CREATE INDEX IF NOT EXISTS idx_college_player_match_review_candidate_yatid_1 ON public.college_player_match_review(candidate_yatid_1);
UPDATE public.college_player_match_review SET candidate_yatid_2 = public.yat_id_for(candidate_playerid_2::text) WHERE candidate_playerid_2 IS NOT NULL AND candidate_yatid_2 IS DISTINCT FROM public.yat_id_for(candidate_playerid_2::text);
CREATE INDEX IF NOT EXISTS idx_college_player_match_review_candidate_yatid_2 ON public.college_player_match_review(candidate_yatid_2);
UPDATE public.college_player_match_review SET candidate_yatid_3 = public.yat_id_for(candidate_playerid_3::text) WHERE candidate_playerid_3 IS NOT NULL AND candidate_yatid_3 IS DISTINCT FROM public.yat_id_for(candidate_playerid_3::text);
CREATE INDEX IF NOT EXISTS idx_college_player_match_review_candidate_yatid_3 ON public.college_player_match_review(candidate_yatid_3);
DROP TRIGGER IF EXISTS trg_college_player_match_review_yatid ON public.college_player_match_review;
CREATE TRIGGER trg_college_player_match_review_yatid BEFORE INSERT OR UPDATE OF candidate_playerid_1, candidate_playerid_2, candidate_playerid_3 ON public.college_player_match_review FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('candidate_playerid_1', 'candidate_yatid_1', 'candidate_playerid_2', 'candidate_yatid_2', 'candidate_playerid_3', 'candidate_yatid_3');

-- connect_video_players
ALTER TABLE public.connect_video_players ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.connect_video_players SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_connect_video_players_yatid ON public.connect_video_players(yatid);
DROP TRIGGER IF EXISTS trg_connect_video_players_yatid ON public.connect_video_players;
CREATE TRIGGER trg_connect_video_players_yatid BEFORE INSERT OR UPDATE OF playerid ON public.connect_video_players FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- daily_stat_lines
ALTER TABLE public.daily_stat_lines ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.daily_stat_lines SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_daily_stat_lines_yatid ON public.daily_stat_lines(yatid);
DROP TRIGGER IF EXISTS trg_daily_stat_lines_yatid ON public.daily_stat_lines;
CREATE TRIGGER trg_daily_stat_lines_yatid BEFORE INSERT OR UPDATE OF playerid ON public.daily_stat_lines FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- external_players
ALTER TABLE public.external_players ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.external_players SET yatid = public.yat_id_for(yatstats_playerid::text) WHERE yatstats_playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(yatstats_playerid::text);
CREATE INDEX IF NOT EXISTS idx_external_players_yatid ON public.external_players(yatid);
DROP TRIGGER IF EXISTS trg_external_players_yatid ON public.external_players;
CREATE TRIGGER trg_external_players_yatid BEFORE INSERT OR UPDATE OF yatstats_playerid ON public.external_players FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('yatstats_playerid', 'yatid');

-- fan_activity
ALTER TABLE public.fan_activity ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.fan_activity SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_fan_activity_yatid ON public.fan_activity(yatid);
DROP TRIGGER IF EXISTS trg_fan_activity_yatid ON public.fan_activity;
CREATE TRIGGER trg_fan_activity_yatid BEFORE INSERT OR UPDATE OF playerid ON public.fan_activity FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- indy_iscore_player_source_map
ALTER TABLE public.indy_iscore_player_source_map ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.indy_iscore_player_source_map SET yatid = public.yat_id_for(yatstats_playerid::text) WHERE yatstats_playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(yatstats_playerid::text);
CREATE INDEX IF NOT EXISTS idx_indy_iscore_player_source_map_yatid ON public.indy_iscore_player_source_map(yatid);
DROP TRIGGER IF EXISTS trg_indy_iscore_player_source_map_yatid ON public.indy_iscore_player_source_map;
CREATE TRIGGER trg_indy_iscore_player_source_map_yatid BEFORE INSERT OR UPDATE OF yatstats_playerid ON public.indy_iscore_player_source_map FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('yatstats_playerid', 'yatid');

-- media_upload
ALTER TABLE public.media_upload ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.media_upload SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_media_upload_yatid ON public.media_upload(yatid);
DROP TRIGGER IF EXISTS trg_media_upload_yatid ON public.media_upload;
CREATE TRIGGER trg_media_upload_yatid BEFORE INSERT OR UPDATE OF playerid ON public.media_upload FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- missing_player_submission
ALTER TABLE public.missing_player_submission ADD COLUMN IF NOT EXISTS published_yatid text;
UPDATE public.missing_player_submission SET published_yatid = public.yat_id_for(published_playerid::text) WHERE published_playerid IS NOT NULL AND published_yatid IS DISTINCT FROM public.yat_id_for(published_playerid::text);
CREATE INDEX IF NOT EXISTS idx_missing_player_submission_published_yatid ON public.missing_player_submission(published_yatid);
DROP TRIGGER IF EXISTS trg_missing_player_submission_yatid ON public.missing_player_submission;
CREATE TRIGGER trg_missing_player_submission_yatid BEFORE INSERT OR UPDATE OF published_playerid ON public.missing_player_submission FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('published_playerid', 'published_yatid');

-- mlb_debut_events
ALTER TABLE public.mlb_debut_events ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.mlb_debut_events SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_mlb_debut_events_yatid ON public.mlb_debut_events(yatid);
DROP TRIGGER IF EXISTS trg_mlb_debut_events_yatid ON public.mlb_debut_events;
CREATE TRIGGER trg_mlb_debut_events_yatid BEFORE INSERT OR UPDATE OF playerid ON public.mlb_debut_events FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- mlb_draft_picks_all
ALTER TABLE public.mlb_draft_picks_all ADD COLUMN IF NOT EXISTS matched_yatid text;
UPDATE public.mlb_draft_picks_all SET matched_yatid = public.yat_id_for(matched_playerid::text) WHERE matched_playerid IS NOT NULL AND matched_yatid IS DISTINCT FROM public.yat_id_for(matched_playerid::text);
CREATE INDEX IF NOT EXISTS idx_mlb_draft_picks_all_matched_yatid ON public.mlb_draft_picks_all(matched_yatid);
DROP TRIGGER IF EXISTS trg_mlb_draft_picks_all_yatid ON public.mlb_draft_picks_all;
CREATE TRIGGER trg_mlb_draft_picks_all_yatid BEFORE INSERT OR UPDATE OF matched_playerid ON public.mlb_draft_picks_all FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('matched_playerid', 'matched_yatid');

-- mlb_person_profile
ALTER TABLE public.mlb_person_profile ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.mlb_person_profile SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_mlb_person_profile_yatid ON public.mlb_person_profile(yatid);
DROP TRIGGER IF EXISTS trg_mlb_person_profile_yatid ON public.mlb_person_profile;
CREATE TRIGGER trg_mlb_person_profile_yatid BEFORE INSERT OR UPDATE OF playerid ON public.mlb_person_profile FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- news_article_derivatives
ALTER TABLE public.news_article_derivatives ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.news_article_derivatives SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_news_article_derivatives_yatid ON public.news_article_derivatives(yatid);
DROP TRIGGER IF EXISTS trg_news_article_derivatives_yatid ON public.news_article_derivatives;
CREATE TRIGGER trg_news_article_derivatives_yatid BEFORE INSERT OR UPDATE OF playerid ON public.news_article_derivatives FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- news_articles
ALTER TABLE public.news_articles ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.news_articles SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_news_articles_yatid ON public.news_articles(yatid);
DROP TRIGGER IF EXISTS trg_news_articles_yatid ON public.news_articles;
CREATE TRIGGER trg_news_articles_yatid BEFORE INSERT OR UPDATE OF playerid ON public.news_articles FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- news_tip_queue
ALTER TABLE public.news_tip_queue ADD COLUMN IF NOT EXISTS matched_yatid text;
UPDATE public.news_tip_queue SET matched_yatid = public.yat_id_for(matched_playerid::text) WHERE matched_playerid IS NOT NULL AND matched_yatid IS DISTINCT FROM public.yat_id_for(matched_playerid::text);
CREATE INDEX IF NOT EXISTS idx_news_tip_queue_matched_yatid ON public.news_tip_queue(matched_yatid);
DROP TRIGGER IF EXISTS trg_news_tip_queue_yatid ON public.news_tip_queue;
CREATE TRIGGER trg_news_tip_queue_yatid BEFORE INSERT OR UPDATE OF matched_playerid ON public.news_tip_queue FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('matched_playerid', 'matched_yatid');

-- player_consent
ALTER TABLE public.player_consent ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_consent SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_consent_yatid ON public.player_consent(yatid);
DROP TRIGGER IF EXISTS trg_player_consent_yatid ON public.player_consent;
CREATE TRIGGER trg_player_consent_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_consent FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_current_status
ALTER TABLE public.player_current_status ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_current_status SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_current_status_yatid ON public.player_current_status(yatid);
DROP TRIGGER IF EXISTS trg_player_current_status_yatid ON public.player_current_status;
CREATE TRIGGER trg_player_current_status_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_current_status FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_current_team
ALTER TABLE public.player_current_team ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_current_team SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_current_team_yatid ON public.player_current_team(yatid);
DROP TRIGGER IF EXISTS trg_player_current_team_yatid ON public.player_current_team;
CREATE TRIGGER trg_player_current_team_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_current_team FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_draft_picks
ALTER TABLE public.player_draft_picks ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_draft_picks SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_draft_picks_yatid ON public.player_draft_picks(yatid);
DROP TRIGGER IF EXISTS trg_player_draft_picks_yatid ON public.player_draft_picks;
CREATE TRIGGER trg_player_draft_picks_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_draft_picks FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_hsid_exclusion
ALTER TABLE public.player_hsid_exclusion ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_hsid_exclusion SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_hsid_exclusion_yatid ON public.player_hsid_exclusion(yatid);
DROP TRIGGER IF EXISTS trg_player_hsid_exclusion_yatid ON public.player_hsid_exclusion;
CREATE TRIGGER trg_player_hsid_exclusion_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_hsid_exclusion FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_hsid_metadata
ALTER TABLE public.player_hsid_metadata ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_hsid_metadata SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_hsid_metadata_yatid ON public.player_hsid_metadata(yatid);
DROP TRIGGER IF EXISTS trg_player_hsid_metadata_yatid ON public.player_hsid_metadata;
CREATE TRIGGER trg_player_hsid_metadata_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_hsid_metadata FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_identity_override
ALTER TABLE public.player_identity_override ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_identity_override SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_identity_override_yatid ON public.player_identity_override(yatid);
DROP TRIGGER IF EXISTS trg_player_identity_override_yatid ON public.player_identity_override;
CREATE TRIGGER trg_player_identity_override_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_identity_override FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_moment_players
ALTER TABLE public.player_moment_players ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_moment_players SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_moment_players_yatid ON public.player_moment_players(yatid);
DROP TRIGGER IF EXISTS trg_player_moment_players_yatid ON public.player_moment_players;
CREATE TRIGGER trg_player_moment_players_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_moment_players FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_moment_submissions
ALTER TABLE public.player_moment_submissions ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_moment_submissions SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_moment_submissions_yatid ON public.player_moment_submissions(yatid);
DROP TRIGGER IF EXISTS trg_player_moment_submissions_yatid ON public.player_moment_submissions;
CREATE TRIGGER trg_player_moment_submissions_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_moment_submissions FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_photos
ALTER TABLE public.player_photos ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_photos SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_photos_yatid ON public.player_photos(yatid);
DROP TRIGGER IF EXISTS trg_player_photos_yatid ON public.player_photos;
CREATE TRIGGER trg_player_photos_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_photos FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_profile_historical_stats_stage
ALTER TABLE public.player_profile_historical_stats_stage ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_profile_historical_stats_stage SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_profile_historical_stats_stage_yatid ON public.player_profile_historical_stats_stage(yatid);
DROP TRIGGER IF EXISTS trg_player_profile_historical_stats_stage_yatid ON public.player_profile_historical_stats_stage;
CREATE TRIGGER trg_player_profile_historical_stats_stage_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_profile_historical_stats_stage FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_profile_sponsors
ALTER TABLE public.player_profile_sponsors ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_profile_sponsors SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_profile_sponsors_yatid ON public.player_profile_sponsors(yatid);
DROP TRIGGER IF EXISTS trg_player_profile_sponsors_yatid ON public.player_profile_sponsors;
CREATE TRIGGER trg_player_profile_sponsors_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_profile_sponsors FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_school_profile
ALTER TABLE public.player_school_profile ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_school_profile SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_school_profile_yatid ON public.player_school_profile(yatid);
DROP TRIGGER IF EXISTS trg_player_school_profile_yatid ON public.player_school_profile;
CREATE TRIGGER trg_player_school_profile_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_school_profile FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_source_map
ALTER TABLE public.player_source_map ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_source_map SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_source_map_yatid ON public.player_source_map(yatid);
DROP TRIGGER IF EXISTS trg_player_source_map_yatid ON public.player_source_map;
CREATE TRIGGER trg_player_source_map_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_source_map FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_team_override
ALTER TABLE public.player_team_override ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_team_override SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_team_override_yatid ON public.player_team_override(yatid);
DROP TRIGGER IF EXISTS trg_player_team_override_yatid ON public.player_team_override;
CREATE TRIGGER trg_player_team_override_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_team_override FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_team_stints
ALTER TABLE public.player_team_stints ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_team_stints SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_team_stints_yatid ON public.player_team_stints(yatid);
DROP TRIGGER IF EXISTS trg_player_team_stints_yatid ON public.player_team_stints;
CREATE TRIGGER trg_player_team_stints_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_team_stints FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- player_transactions
ALTER TABLE public.player_transactions ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.player_transactions SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_player_transactions_yatid ON public.player_transactions(yatid);
DROP TRIGGER IF EXISTS trg_player_transactions_yatid ON public.player_transactions;
CREATE TRIGGER trg_player_transactions_yatid BEFORE INSERT OR UPDATE OF playerid ON public.player_transactions FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- sim_daily_batting
ALTER TABLE public.sim_daily_batting ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.sim_daily_batting SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_sim_daily_batting_yatid ON public.sim_daily_batting(yatid);
DROP TRIGGER IF EXISTS trg_sim_daily_batting_yatid ON public.sim_daily_batting;
CREATE TRIGGER trg_sim_daily_batting_yatid BEFORE INSERT OR UPDATE OF playerid ON public.sim_daily_batting FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- sim_daily_pitching
ALTER TABLE public.sim_daily_pitching ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.sim_daily_pitching SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_sim_daily_pitching_yatid ON public.sim_daily_pitching(yatid);
DROP TRIGGER IF EXISTS trg_sim_daily_pitching_yatid ON public.sim_daily_pitching;
CREATE TRIGGER trg_sim_daily_pitching_yatid BEFORE INSERT OR UPDATE OF playerid ON public.sim_daily_pitching FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- social_post_player_mentions
ALTER TABLE public.social_post_player_mentions ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.social_post_player_mentions SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_social_post_player_mentions_yatid ON public.social_post_player_mentions(yatid);
DROP TRIGGER IF EXISTS trg_social_post_player_mentions_yatid ON public.social_post_player_mentions;
CREATE TRIGGER trg_social_post_player_mentions_yatid BEFORE INSERT OR UPDATE OF playerid ON public.social_post_player_mentions FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- social_sources
ALTER TABLE public.social_sources ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.social_sources SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_social_sources_yatid ON public.social_sources(yatid);
DROP TRIGGER IF EXISTS trg_social_sources_yatid ON public.social_sources;
CREATE TRIGGER trg_social_sources_yatid BEFORE INSERT OR UPDATE OF playerid ON public.social_sources FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- sponsor_orders
ALTER TABLE public.sponsor_orders ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.sponsor_orders SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_sponsor_orders_yatid ON public.sponsor_orders(yatid);
DROP TRIGGER IF EXISTS trg_sponsor_orders_yatid ON public.sponsor_orders;
CREATE TRIGGER trg_sponsor_orders_yatid BEFORE INSERT OR UPDATE OF playerid ON public.sponsor_orders FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- sportsblaze_mlb_player_map
ALTER TABLE public.sportsblaze_mlb_player_map ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.sportsblaze_mlb_player_map SET yatid = public.yat_id_for(yatstats_playerid::text) WHERE yatstats_playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(yatstats_playerid::text);
CREATE INDEX IF NOT EXISTS idx_sportsblaze_mlb_player_map_yatid ON public.sportsblaze_mlb_player_map(yatid);
DROP TRIGGER IF EXISTS trg_sportsblaze_mlb_player_map_yatid ON public.sportsblaze_mlb_player_map;
CREATE TRIGGER trg_sportsblaze_mlb_player_map_yatid BEFORE INSERT OR UPDATE OF yatstats_playerid ON public.sportsblaze_mlb_player_map FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('yatstats_playerid', 'yatid');

-- tbc_flip_card_publication_holds
ALTER TABLE public.tbc_flip_card_publication_holds ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.tbc_flip_card_publication_holds SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_tbc_flip_card_publication_holds_yatid ON public.tbc_flip_card_publication_holds(yatid);
DROP TRIGGER IF EXISTS trg_tbc_flip_card_publication_holds_yatid ON public.tbc_flip_card_publication_holds;
CREATE TRIGGER trg_tbc_flip_card_publication_holds_yatid BEFORE INSERT OR UPDATE OF playerid ON public.tbc_flip_card_publication_holds FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- user_favorites
ALTER TABLE public.user_favorites ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.user_favorites SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_user_favorites_yatid ON public.user_favorites(yatid);
DROP TRIGGER IF EXISTS trg_user_favorites_yatid ON public.user_favorites;
CREATE TRIGGER trg_user_favorites_yatid BEFORE INSERT OR UPDATE OF playerid ON public.user_favorites FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.user_roles SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_user_roles_yatid ON public.user_roles(yatid);
DROP TRIGGER IF EXISTS trg_user_roles_yatid ON public.user_roles;
CREATE TRIGGER trg_user_roles_yatid BEFORE INSERT OR UPDATE OF playerid ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

-- weekly_player_lines
ALTER TABLE public.weekly_player_lines ADD COLUMN IF NOT EXISTS yatid text;
UPDATE public.weekly_player_lines SET yatid = public.yat_id_for(playerid::text) WHERE playerid IS NOT NULL AND yatid IS DISTINCT FROM public.yat_id_for(playerid::text);
CREATE INDEX IF NOT EXISTS idx_weekly_player_lines_yatid ON public.weekly_player_lines(yatid);
DROP TRIGGER IF EXISTS trg_weekly_player_lines_yatid ON public.weekly_player_lines;
CREATE TRIGGER trg_weekly_player_lines_yatid BEFORE INSERT OR UPDATE OF playerid ON public.weekly_player_lines FOR EACH ROW EXECUTE FUNCTION public.set_yatid_from_player_columns('playerid', 'yatid');

COMMIT;
