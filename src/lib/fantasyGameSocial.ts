// src/lib/fantasyGameSocial.ts
import 'server-only';
import { query } from '@/lib/db';

export const GAME_COMMENT_MAX = 5000;

export async function ensureFantasyGameSocialTables() {
  // Schema is provisioned through the checked-in migration / Neon admin path.
  // Runtime app roles intentionally do NOT create tables or indexes.
  return;
}

export function gameKey(raw: string) {
  const v = String(raw || '').trim();
  return /^[A-Za-z0-9._:-]{1,160}$/.test(v) ? v : '';
}
