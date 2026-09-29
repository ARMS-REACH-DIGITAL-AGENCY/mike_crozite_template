-- migrations/20260929_favorites_roles_consent_playerid_hsid.sql
-- Our tables name these columns playerid and hsid (text) everywhere else.
-- Three older tables used player_id / school_id instead; this brings them in
-- line so a field never has two spellings.
--
-- user_favorites (live, 90 rows): column renames only. A rename changes the
--   name, not the data; indexes, the unique key and grants follow it.
-- user_roles, player_consent (empty): renamed, and their id columns become
--   text like playerid / hsid everywhere else (player ids such as YAT000001
--   aren't numbers).
--
-- Run right after the deploy with the matching code (favorites API,
-- userProfile.ts, FavoritesDrawer) is live. Undo: the reverse renames.

BEGIN;

ALTER TABLE public.user_favorites RENAME COLUMN player_id TO playerid;
ALTER TABLE public.user_favorites RENAME COLUMN school_id TO hsid;
ALTER INDEX public.user_favorites_firebase_uid_player_id_key RENAME TO user_favorites_firebase_uid_playerid_key;

ALTER TABLE public.user_roles RENAME COLUMN player_id TO playerid;
ALTER TABLE public.user_roles RENAME COLUMN school_id TO hsid;
ALTER TABLE public.user_roles
  ALTER COLUMN playerid TYPE text USING playerid::text,
  ALTER COLUMN hsid TYPE text USING hsid::text;
ALTER INDEX public.user_roles_firebase_uid_role_school_id_player_id_key RENAME TO user_roles_firebase_uid_role_hsid_playerid_key;

ALTER TABLE public.player_consent RENAME COLUMN player_id TO playerid;
ALTER TABLE public.player_consent ALTER COLUMN playerid TYPE text USING playerid::text;

COMMIT;
