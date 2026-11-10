import 'server-only';
import { query } from '@/lib/db';

// The verified badge is not an Instagram API account type. A link can be
// published without asserting Creator/Business eligibility; the existing
// Meta Business Discovery sync determines that separately.
export type InstagramRegistration = 'queued' | 'registered' | 'needs_review';

const INSTAGRAM_PROFILE_PATHS = new Set([
  'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct',
  'about', 'developer', 'challenge', 'tv',
]);

export function parseInstagramHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let candidate = value.trim();
  if (!candidate) return null;

  if (/^(?:https?:\/\/|(?:(?:www|m)\.)?instagram\.com\/)/i.test(candidate)) {
    try {
      const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : 'https://' + candidate);
      if (!['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname.toLowerCase())
          || url.username || url.password || url.port) return null;
      const segments = url.pathname.split('/').filter(Boolean);
      // Post and Reel permalinks must not be mistaken for account profiles.
      if (segments.length !== 1) return null;
      candidate = segments[0];
    } catch {
      return null;
    }
  } else {
    candidate = candidate.replace(/^@/, '');
  }

  const handle = candidate.toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(handle) || handle.startsWith('.')
    || handle.endsWith('.') || handle.includes('..')
    || INSTAGRAM_PROFILE_PATHS.has(handle)) return null;
  return handle;
}

// Reusable path for both existing-player edits and brand-new player records.
// Never reassign a public handle from a school or another player.
export async function registerPlayerInstagram(
  playerId: string,
  hsid: string,
  input: string,
): Promise<InstagramRegistration> {
  const handle = parseInstagramHandle(input);
  if (!handle || !/^(?:YAT)?[0-9]{1,18}$/i.test(playerId) || !/^[0-9]{1,10}$/.test(hsid)) {
    return 'needs_review';
  }

  const { rows: existing } = await query<{
    id: string; playerid: string | null; owner_type: string; status: string;
  }>(
    "SELECT id::text AS id,playerid,owner_type,status FROM social_sources WHERE platform='instagram' AND lower(handle)=$1 LIMIT 1",
    [handle],
  );
  if (existing.length) {
    return existing[0].playerid === playerId &&
      existing[0].owner_type === 'player' &&
      existing[0].status === 'active' ? 'registered' : 'needs_review';
  }

  const { rows: inserted } = await query<{ id: string }>(
    "INSERT INTO social_sources(platform,handle,owner_type,hsid,playerid,authorization_type,status) " +
      "SELECT 'instagram',$1,'player',$2,$3,'public','active' " +
      "WHERE NOT EXISTS (SELECT 1 FROM social_sources WHERE platform='instagram' AND lower(handle)=$1) " +
      "ON CONFLICT (platform,handle) DO NOTHING RETURNING id::text AS id",
    [handle, hsid, playerId],
  );
  // If another request claimed this handle between lookup and insert, send
  // it to the existing review flow rather than reporting a successful link.
  return inserted.length === 1 ? 'registered' : 'needs_review';
}
