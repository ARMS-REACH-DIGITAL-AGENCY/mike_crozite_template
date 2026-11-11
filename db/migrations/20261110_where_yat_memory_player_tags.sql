-- Additional social links for retired alumni memories. One original published post,
-- linked by submission ID and prompt key to tagged players across all schools.
-- This does not modify existing stories, players, player IDs, or YAT IDs.
CREATE TABLE IF NOT EXISTS public.alumni_where_yat_memory_tags (
  submission_id bigint NOT NULL REFERENCES public.alumni_where_yat_now(id) ON DELETE CASCADE,
  story_key text NOT NULL CHECK (story_key IN ('favoriteHs','favoriteAfter','family','story','business')),
  playerid text NOT NULL,
  tagged_by_firebase_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, story_key, playerid)
);
CREATE INDEX IF NOT EXISTS alumni_where_yat_memory_tags_playerid_idx
  ON public.alumni_where_yat_memory_tags (playerid, created_at DESC);
