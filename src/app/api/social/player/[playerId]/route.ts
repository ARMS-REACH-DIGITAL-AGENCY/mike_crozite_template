// A player's own Instagram posts for the profile's Social tab, newest
// first, as stored by the instagram-sync cron (pictures are our S3 copies).
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, context: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(playerId || '')) {
    return NextResponse.json({ posts: [] }, { status: 400 });
  }
  try {
    const { rows } = await query(
      `SELECT p.external_post_id AS id, p.media_type, p.caption, p.permalink, p.thumbnail_url,
              p.published_at, s.handle
         FROM social_sources s
         JOIN social_posts p ON p.social_source_id = s.id
        WHERE s.playerid = $1 AND s.platform = 'instagram' AND s.status = 'active'
          AND p.thumbnail_url IS NOT NULL
        ORDER BY p.published_at DESC NULLS LAST
        LIMIT 12`,
      [playerId]
    );
    return NextResponse.json(
      { posts: rows },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600' } }
    );
  } catch (error) {
    console.error('player social posts failed', { playerId, error });
    return NextResponse.json({ posts: [] }, { status: 500 });
  }
}
