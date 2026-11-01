// A signed-in contribution can register a public profile for the existing
// Meta Business Discovery worker. Eligibility is determined by Meta during
// the scheduled poll; an active source is NOT evidence that Meta approved it.
import 'server-only';
import { query } from '@/lib/db';
import { normalizeInstagramHandle } from '@/lib/instagramHandle';

export type InstagramEnrollmentState = 'registered' | 'needs_review';

export async function enrollPlayerInstagramSource(args: {
  playerId: string; hsid: string; input: string;
}): Promise<InstagramEnrollmentState> {
  const handle = normalizeInstagramHandle(args.input);
  if (!handle || !args.playerId || !/^\d+$/.test(args.hsid)) return 'needs_review';

  const existing = await query<{ owner_type: string; playerid: string | null; status: string }>(
    `SELECT owner_type, playerid, status FROM social_sources
      WHERE platform = 'instagram' AND lower(handle) = $1 ORDER BY id LIMIT 2`,
    [handle]
  );
  // Never hijack a school account or someone else's player identity.
  if (existing.rows.length > 0) {
    return existing.rows.length === 1 && existing.rows[0].owner_type === 'player'
      && existing.rows[0].playerid === args.playerId && existing.rows[0].status === 'active'
      ? 'registered' : 'needs_review';
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO social_sources (platform, handle, owner_type, hsid, playerid, authorization_type, status)
     VALUES ('instagram', $1, 'player', $2, $3, 'business_discovery', 'active')
     ON CONFLICT (platform, handle) DO NOTHING RETURNING id::text`,
    [handle, args.hsid, args.playerId]
  );
  if (inserted.rows.length === 1) return 'registered';
  // A concurrent submission may win the unique constraint. Report success
  // only when the stored owner is still the intended player.
  const race = await query<{ owner_type: string; playerid: string | null; status: string }>(
    `SELECT owner_type, playerid, status FROM social_sources
      WHERE platform = 'instagram' AND lower(handle) = $1 ORDER BY id LIMIT 2`,
    [handle]
  );
  return race.rows.length === 1 && race.rows[0].owner_type === 'player'
    && race.rows[0].playerid === args.playerId && race.rows[0].status === 'active'
    ? 'registered' : 'needs_review';
}
