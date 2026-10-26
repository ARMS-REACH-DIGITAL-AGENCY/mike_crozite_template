-- Immutable private/public edition snapshots in isolated publication storage.
-- No shared table definition, permission, policy, trigger or row is changed.
BEGIN;
CREATE SCHEMA IF NOT EXISTS tribune_private;
CREATE TABLE IF NOT EXISTS tribune_private.alumni_newsletter_editions (
  id uuid PRIMARY KEY,
  firebase_uid text NOT NULL,
  school_id text NOT NULL,
  report_start date NOT NULL,
  report_end date NOT NULL,
  edition jsonb NOT NULL,
  public_edition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alumni_newsletter_editions_school_period
  ON tribune_private.alumni_newsletter_editions (school_id, report_end DESC);
COMMIT;
