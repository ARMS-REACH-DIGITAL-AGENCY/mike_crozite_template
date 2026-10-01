-- migrations/20260929_fantasy_game_social.sql
-- Persistent Like / Comment / Share support for Fantasy Bracket game cards.
-- Mirrors the player-profile Stories interaction model while keeping game
-- engagement separate from player_moment_* content.

BEGIN;

CREATE TABLE IF NOT EXISTS public.fantasy_game_likes (
  game_key text NOT NULL,
  liker_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_key, liker_uid)
);

CREATE TABLE IF NOT EXISTS public.fantasy_game_comments (
  id bigserial PRIMARY KEY,
  game_key text NOT NULL,
  firebase_uid text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'visible',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fantasy_game_comments_game_idx
  ON public.fantasy_game_comments (game_key, created_at ASC);

CREATE TABLE IF NOT EXISTS public.fantasy_game_comment_photos (
  id bigserial PRIMARY KEY,
  comment_id bigint NOT NULL REFERENCES public.fantasy_game_comments(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  s3_key text NOT NULL,
  web_s3_key text,
  thumb_s3_key text,
  width integer,
  height integer,
  mime_type text,
  file_size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fantasy_game_comment_photos_comment_idx
  ON public.fantasy_game_comment_photos (comment_id, sort_order);

GRANT USAGE ON SCHEMA public TO authenticated, authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_game_likes TO authenticated, authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_game_comments TO authenticated, authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_game_comment_photos TO authenticated, authenticator;
GRANT USAGE, SELECT ON SEQUENCE public.fantasy_game_comments_id_seq TO authenticated, authenticator;
GRANT USAGE, SELECT ON SEQUENCE public.fantasy_game_comment_photos_id_seq TO authenticated, authenticator;

COMMIT;
