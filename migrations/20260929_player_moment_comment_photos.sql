-- migrations/20260929_player_moment_comment_photos.sql
-- Photos a fan attaches to a comment on a story (approved 2026-09-29; for
-- every story, including the system Draft Day stories). Same fields as
-- player_moment_photos (files in S3 via storeStoryPhoto: full JPEG, web
-- WebP, thumb WebP); a comment's photos go when the comment row goes.
-- Grants match player_moment_photos: the site's roles read and write the
-- rows and draw ids from the sequence.

BEGIN;

CREATE TABLE IF NOT EXISTS public.player_moment_comment_photos (
  id              bigserial   PRIMARY KEY,
  comment_id      bigint      NOT NULL REFERENCES public.player_moment_comments(id) ON DELETE CASCADE,
  sort_order      integer     NOT NULL DEFAULT 0,
  s3_key          text        NOT NULL,
  web_s3_key      text,
  thumb_s3_key    text,
  width           integer,
  height          integer,
  mime_type       text,
  file_size_bytes bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_moment_comment_photos_comment_idx ON public.player_moment_comment_photos (comment_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_moment_comment_photos TO authenticated, authenticator;
GRANT USAGE, SELECT ON SEQUENCE public.player_moment_comment_photos_id_seq TO authenticated, authenticator;

COMMIT;
