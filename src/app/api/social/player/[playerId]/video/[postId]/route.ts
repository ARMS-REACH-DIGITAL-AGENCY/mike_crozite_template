// Clean playback for video posts synced from Instagram professional accounts.
// Only authorized, already-synced player posts may resolve through Meta;
// this endpoint never reveals API credentials or untrusted outbound URLs.
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { instagramProfessionalVideoUrl } from '@/lib/instagramSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ playerId: string; postId: string }> }) {
  const { playerId, postId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(playerId) || !/^[A-Za-z0-9_-]{5,80}$/.test(postId)) {
    return NextResponse.json({ video_url: null }, { status: 400 });
  }
  try {
    const { rows } = await query<{ handle: string }>(
      `SELECT s.handle FROM social_sources s
         JOIN social_posts p ON p.social_source_id = s.id
        WHERE s.playerid = $1 AND s.platform = 'instagram' AND s.status = 'active'
          AND p.external_post_id = $2 AND p.media_type = 'video'
        LIMIT 1`,
      [playerId, postId]
    );
    if (!rows.length) return NextResponse.json({ video_url: null }, { status: 404 });
    const video_url = await instagramProfessionalVideoUrl(rows[0].handle, postId);
    return NextResponse.json({ video_url }, {
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  } catch (error) {
    console.error('instagram social video lookup failed', { playerId, postId, error: String(error) });
    return NextResponse.json({ video_url: null }, { status: 502 });
  }
}
