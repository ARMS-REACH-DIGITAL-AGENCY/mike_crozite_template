-- Safe snapshot-first ingest tables for TBC daily feed ingestion.
-- This migration intentionally does not modify canonical raw tables.

CREATE TABLE IF NOT EXISTS tbc_ingest_runs (
  ingest_run_id UUID PRIMARY KEY,
  feed_type TEXT NOT NULL CHECK (feed_type IN ('players', 'batting', 'pitching')),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  row_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS tbc_ingest_runs_feed_type_started_idx
  ON tbc_ingest_runs (feed_type, started_at DESC);

CREATE TABLE IF NOT EXISTS tbc_players_feed_snapshots (
  snapshot_id BIGSERIAL PRIMARY KEY,
  ingest_run_id UUID NOT NULL REFERENCES tbc_ingest_runs(ingest_run_id),
  snapshot_ts TIMESTAMPTZ NOT NULL,
  snapshot_date DATE NOT NULL,
  playerid TEXT NOT NULL,
  source_url TEXT NOT NULL,
  raw_payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS tbc_players_feed_snapshots_date_idx
  ON tbc_players_feed_snapshots (snapshot_date, playerid);

CREATE TABLE IF NOT EXISTS tbc_batting_feed_snapshots (
  snapshot_id BIGSERIAL PRIMARY KEY,
  ingest_run_id UUID NOT NULL REFERENCES tbc_ingest_runs(ingest_run_id),
  snapshot_ts TIMESTAMPTZ NOT NULL,
  snapshot_date DATE NOT NULL,
  playerid TEXT NOT NULL,
  source_url TEXT NOT NULL,
  raw_payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS tbc_batting_feed_snapshots_date_idx
  ON tbc_batting_feed_snapshots (snapshot_date, playerid);

CREATE TABLE IF NOT EXISTS tbc_pitching_feed_snapshots (
  snapshot_id BIGSERIAL PRIMARY KEY,
  ingest_run_id UUID NOT NULL REFERENCES tbc_ingest_runs(ingest_run_id),
  snapshot_ts TIMESTAMPTZ NOT NULL,
  snapshot_date DATE NOT NULL,
  playerid TEXT NOT NULL,
  source_url TEXT NOT NULL,
  raw_payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS tbc_pitching_feed_snapshots_date_idx
  ON tbc_pitching_feed_snapshots (snapshot_date, playerid);
