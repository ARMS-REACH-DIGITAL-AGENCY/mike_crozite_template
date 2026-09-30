// src/lib/fantasyGameSocial.ts
import 'server-only';
import { query } from '@/lib/db';

export const GAME_COMMENT_MAX = 5000;

export async function ensureFantasyGameSocialTables() {
  await query(`
    create table if not exists public.fantasy_game_likes (
      game_key text not null,
      liker_uid text not null,
      created_at timestamptz not null default now(),
      primary key (game_key, liker_uid)
    )
  `);
  await query(`
    create table if not exists public.fantasy_game_comments (
      id bigserial primary key,
      game_key text not null,
      firebase_uid text not null,
      body text not null default '',
      status text not null default 'visible',
      created_at timestamptz not null default now()
    )
  `);
  await query(`
    create index if not exists fantasy_game_comments_game_idx
    on public.fantasy_game_comments (game_key, created_at asc)
  `);
  await query(`
    create table if not exists public.fantasy_game_comment_photos (
      id bigserial primary key,
      comment_id bigint not null references public.fantasy_game_comments(id) on delete cascade,
      sort_order integer not null default 0,
      s3_key text not null,
      web_s3_key text,
      thumb_s3_key text,
      width integer,
      height integer,
      mime_type text,
      file_size_bytes bigint,
      created_at timestamptz not null default now()
    )
  `);
  await query(`
    create index if not exists fantasy_game_comment_photos_comment_idx
    on public.fantasy_game_comment_photos (comment_id, sort_order)
  `);
}

export function gameKey(raw: string) {
  const v = String(raw || '').trim();
  return /^[A-Za-z0-9._:-]{1,160}$/.test(v) ? v : '';
}
