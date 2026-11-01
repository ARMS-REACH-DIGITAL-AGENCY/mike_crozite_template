-- ARMS/HighLevel integration outbox for retired alumni questionnaires.
-- Additive only; preserves existing approved profiles and canonical raw data.
ALTER TABLE public.alumni_where_yat_now
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS arms_contact_id text,
  ADD COLUMN IF NOT EXISTS arms_task_id text,
  ADD COLUMN IF NOT EXISTS arms_note_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS arms_sync_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS arms_sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arms_sync_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS arms_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS arms_sync_error text;

CREATE INDEX IF NOT EXISTS alumni_where_yat_arms_pending_idx
  ON public.alumni_where_yat_now (created_at, id)
  WHERE arms_sync_status IN ('not_sent','failed','syncing');
