-- One card truth (Pete, Nov 18 2026): /api/cron/card-cache-sync clears every
-- kept copy of a changed card each minute. It needs a bookmark (the last
-- change time it handled) and a fast way to find cards changed since then.
CREATE TABLE IF NOT EXISTS public.card_cache_sync_state (
  name    text PRIMARY KEY,
  last_at timestamptz NOT NULL
);
INSERT INTO public.card_cache_sync_state (name, last_at)
VALUES ('flip_card_front_stage', now()) ON CONFLICT (name) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_flip_card_front_stage_changed_at
  ON public.flip_card_front_stage ((GREATEST(stage_updated_at, updated_at)));
