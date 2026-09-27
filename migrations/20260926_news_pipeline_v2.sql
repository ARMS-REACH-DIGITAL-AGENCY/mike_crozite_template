-- YAT?STATS Alumni News pipeline v2
-- Explicit candidate verification state and raw-source evidence.

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
