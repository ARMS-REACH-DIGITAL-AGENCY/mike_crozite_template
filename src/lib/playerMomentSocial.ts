// src/lib/playerMomentSocial.ts
// Shared helpers for the Golden Line social layer (YAT-A-BOY reactions and
// wall-post comments on uploaded memories). Kept separate from
// api/player-moments/route.ts so the reaction and comment routes don't need
// to duplicate table setup or session parsing.

import { query } from "@/lib/db";

export async function ensurePlayerMomentSocialTables() {
  await query(`
    create table if not exists public.player_moment_reactions (
      id bigserial primary key,
      moment_id bigint not null references public.player_moment_submissions(id) on delete cascade,
      contributor_firebase_uid text not null,
      reaction_type text not null default 'yataboy',
      created_at timestamptz not null default now(),
      unique (moment_id, contributor_firebase_uid, reaction_type)
    )
  `);

  await query(`
    create index if not exists player_moment_reactions_moment_idx
    on public.player_moment_reactions (moment_id)
  `);

  await query(`
    create table if not exists public.player_moment_comments (
      id bigserial primary key,
      moment_id bigint not null references public.player_moment_submissions(id) on delete cascade,
      contributor_firebase_uid text not null,
      contributor_name text not null,
      body text not null,
      status text not null default 'visible',
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create index if not exists player_moment_comments_moment_idx
    on public.player_moment_comments (moment_id, created_at asc)
  `);
}

export type YatMomentSession = {
  uid?: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
};

interface CookieReader {
  get(name: string): { value: string } | undefined;
}

// login/register write the current session under "yat-platform-session";
// "yat-session" only ever appears as a legacy artifact. Matches the read
// order in api/auth/session/route.ts and the fixed player-moments GET/POST.
export function getMomentSession(cookies: CookieReader): YatMomentSession | null {
  const raw = cookies.get("yat-platform-session")?.value || cookies.get("yat-session")?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as YatMomentSession;
    if (!parsed?.uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSessionDisplayName(session: YatMomentSession) {
  const first = String(session.firstName || "").trim();
  const last = String(session.lastName || "").trim();
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || String(session.email || "YAT?STATS Fan").trim();
}
