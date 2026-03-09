-- 002_create_news_articles.sql
-- YAT?STATS — News articles table for Webz.io ingested headlines.
-- Populated by scripts/ingest-news.ts (cron or manual).
-- Read by getNewsByHsid() in src/lib/db.ts.

CREATE TABLE IF NOT EXISTS news_articles (
  id            SERIAL PRIMARY KEY,
  uuid          TEXT UNIQUE NOT NULL,              -- Webz.io article UUID (dedup key)
  playerid      TEXT,                              -- matched player ID (nullable)
  player_name   TEXT,                              -- matched player display name
  hsid          TEXT NOT NULL,                     -- school ID for routing to subdomain
  title         TEXT NOT NULL,                     -- article headline
  source        TEXT NOT NULL,                     -- site name (e.g. "espn.com")
  source_full   TEXT,                              -- full site domain
  published_at  TIMESTAMPTZ NOT NULL,              -- article publish date
  url           TEXT NOT NULL,                     -- canonical outbound link
  image_url     TEXT,                              -- main article image (nullable)
  snippet       TEXT,                              -- highlighted text snippet
  sentiment     TEXT DEFAULT 'neutral',            -- positive / negative / neutral
  categories    TEXT[] DEFAULT '{}',               -- article categories
  country       TEXT,                              -- source country
  domain_rank   INT,                               -- source domain rank
  ingested_at   TIMESTAMPTZ DEFAULT NOW()          -- when we ingested this row
);

-- Indexes for the three query patterns:
-- 1. Alumni News page: WHERE hsid = $1 ORDER BY published_at DESC
-- 2. Player profile:   WHERE playerid = $1 ORDER BY published_at DESC
-- 3. Flip card teaser:  WHERE playerid = $1 ORDER BY published_at DESC LIMIT 3
CREATE INDEX IF NOT EXISTS idx_news_articles_hsid       ON news_articles(hsid, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_playerid   ON news_articles(playerid, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_published  ON news_articles(published_at DESC);
