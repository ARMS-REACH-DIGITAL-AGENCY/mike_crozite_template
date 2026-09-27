-- YAT?STATS Alumni News pipeline v2
-- Adds explicit verification state, keeps raw Webz evidence, and repairs
-- v_news_player_context so decimal TBC year variants (2018.1/2018.2) do not break it.

ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS discovery_source TEXT NOT NULL DEFAULT 'webz',
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS webz_persons JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS webz_organizations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS webz_topics TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS syndication_id TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'REVIEW',
  ADD COLUMN IF NOT EXISTS verification_score NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS verification_reason TEXT,
  ADD COLUMN IF NOT EXISTS verification_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS newsworthiness TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS image_verification_status TEXT NOT NULL DEFAULT 'FALLBACK_PLAYER',
  ADD COLUMN IF NOT EXISTS display_image_url TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_news_articles_verification
  ON public.news_articles (verification_status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_articles_syndication
  ON public.news_articles (syndication_id)
  WHERE syndication_id IS NOT NULL;

-- Publisher art is preserved in image_url, but the safe public default is a
-- YAT?STATS-controlled player image until source art is explicitly verified.
UPDATE public.news_articles
SET display_image_url =
  'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/' || playerid || '.jpg'
WHERE NULLIF(BTRIM(COALESCE(playerid, '')), '') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(display_image_url, '')), '') IS NULL;

-- Seed only the strongest legacy approvals. Everything else must be
-- re-verified by the v2 identity resolver.
UPDATE public.news_articles na
SET verification_status = 'VERIFIED',
    verification_score = nd.match_confidence,
    verification_reason = 'legacy derivative approval with high confidence',
    newsworthiness = CASE
      WHEN UPPER(COALESCE(nd.player_relevance,'')) = 'PRIMARY' THEN 'FEATURED'
      WHEN UPPER(COALESCE(nd.player_relevance,'')) IN ('SECONDARY','HIGH','MEDIUM') THEN 'NORMAL'
      ELSE 'NORMAL'
    END,
    verified_at = COALESCE(nd.updated_at, now())
FROM public.news_article_derivatives nd
WHERE nd.news_article_uuid = na.uuid
  AND nd.playerid = na.playerid
  AND nd.approval_status IN ('approved','published')
  AND COALESCE(nd.match_confidence,0) >= 0.85;

CREATE OR REPLACE VIEW public.v_news_player_context AS
WITH school_map AS (
  SELECT ph.playerid,
         min(ph.hsid::text) AS hsid,
         min(ph.hsname) AS hsname
  FROM public.player_hsids ph
  GROUP BY ph.playerid
),
latest_season_all AS (
  SELECT p.playerid,
         CASE WHEN p.year::text ~ '^[0-9]{4}([.][0-9]+)?$'
              THEN split_part(p.year::text, '.', 1)::integer END AS year_num,
         p.teamid,
         p.highlevel AS current_level,
         p.draft_info,
         p.playyears,
         1 AS source_priority
  FROM public.tbc_pitching_raw p
  UNION ALL
  SELECT b.playerid,
         CASE WHEN b.year::text ~ '^[0-9]{4}([.][0-9]+)?$'
              THEN split_part(b.year::text, '.', 1)::integer END AS year_num,
         b.teamid,
         b.highlevel AS current_level,
         b.draft_info,
         b.playyears,
         2 AS source_priority
  FROM public.tbc_batting_raw b
),
latest_season_choice AS (
  SELECT DISTINCT ON (x.playerid)
         x.playerid,
         x.year_num,
         x.teamid AS current_teamid,
         x.current_level,
         x.draft_info,
         x.playyears
  FROM latest_season_all x
  WHERE x.year_num IS NOT NULL
  ORDER BY x.playerid, x.year_num DESC, x.source_priority, x.teamid
),
college_rows AS (
  SELECT v.playerid,
         CASE WHEN v.year::text ~ '^[0-9]{4}([.][0-9]+)?$'
              THEN split_part(v.year::text, '.', 1)::integer END AS yr,
         v.team_display AS college_name
  FROM public.vw_player_pitching_seasons v
  WHERE v.team_level = ANY (ARRAY['JUCO','JrCollege','NCAA','NCAA-D1','NAIA']::text[])
  UNION ALL
  SELECT v.playerid,
         CASE WHEN v.year::text ~ '^[0-9]{4}([.][0-9]+)?$'
              THEN split_part(v.year::text, '.', 1)::integer END AS yr,
         v.team_display AS college_name
  FROM public.vw_player_batting_seasons v
  WHERE v.team_level = ANY (ARRAY['JUCO','JrCollege','NCAA','NCAA-D1','NAIA']::text[])
),
college_dedup AS (
  SELECT cr.playerid,
         cr.college_name,
         min(cr.yr) AS first_year
  FROM college_rows cr
  WHERE cr.college_name IS NOT NULL
    AND btrim(cr.college_name) <> ''
    AND cr.yr IS NOT NULL
  GROUP BY cr.playerid, cr.college_name
),
college_path AS (
  SELECT cd.playerid,
         string_agg(cd.college_name, '; ' ORDER BY cd.first_year, cd.college_name) AS college_path_text
  FROM college_dedup cd
  GROUP BY cd.playerid
)
SELECT tp.playerid,
       tp.firstname,
       tp.lastname,
       sm.hsid,
       COALESCE(sm.hsname, tp.high_school) AS high_school,
       tp.highlevel,
       lsc.draft_info,
       lsc.playyears,
       cp.college_path_text,
       lsc.current_teamid,
       t.team_name AS current_team_name,
       t.organization_name AS current_org_name,
       t.level AS current_team_level,
       lsc.current_level,
       tp.throws,
       tp.bats,
       tp.posit
FROM public.tbc_players_raw tp
LEFT JOIN school_map sm ON sm.playerid = tp.playerid
LEFT JOIN latest_season_choice lsc ON lsc.playerid = tp.playerid
LEFT JOIN public.teams t ON t.teamid::text = lsc.current_teamid::text
LEFT JOIN college_path cp ON cp.playerid = tp.playerid;
