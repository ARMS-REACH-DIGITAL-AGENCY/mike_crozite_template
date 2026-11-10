import 'server-only';
import { after } from 'next/server';
import { Pool } from 'pg';
import { syncInstagramSource } from '@/lib/instagramSync';
import { parseInstagramHandle } from '@/lib/playerInstagramRegistration';

// A submitted public handle always appears as a link immediately. Start the
// professional-account discovery/import immediately after sending the response.
// This is not a cron wait or a direct Meta call in the browser. Preview builds
// must not use real Meta or write to the shared production database.
export function scheduleNewInstagramImport(playerId: string, rawHandle: string): void {
  if (process.env.VERCEL_ENV !== 'production' || !process.env.META_IG_ACCESS_TOKEN) return;
  const handle = parseInstagramHandle(rawHandle);
  if (!handle) return;

  after(async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      // Claim a single immediate attempt; regular 15-minute cron still
      // handles future refreshes with the existing 6-hour cooldown.
      const { rows } = await pool.query<{ id: number; handle: string }>(
        "UPDATE social_sources SET last_polled_at=now() " +
        "WHERE id=(SELECT id FROM social_sources WHERE platform='instagram' AND lower(handle)=$1 " +
        "AND playerid=$2 AND owner_type='player' AND status='active' " +
        "AND (last_polled_at IS NULL OR last_polled_at < now()-interval '15 minutes') LIMIT 1) " +
        "RETURNING id,handle",
        [handle, playerId],
      );
      if (!rows.length) return;
      const result = await syncInstagramSource(pool, rows[0]);
      if (!result.ok) console.warn('[instagram-registration] Meta check unavailable', {
        category: result.errorCategory || 'other',
      });
    } catch (error) {
      console.error('[instagram-registration] immediate discovery failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    } finally {
      await pool.end().catch(() => {});
    }
  });
}
