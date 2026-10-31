// Resolve videos only for Instagram posts already synced to a school account.
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { instagramProfessionalVideoUrl } from '@/lib/instagramSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ hsid: string; postId: string }> }) {
  const { hsid, postId } = await context.params;
  if (!/^\d{1,10}$/.test(hsid) || !/^[A-Za-z0-9_-]{5,80}$/.test(postId)) {
    return NextResponse.json({ video_url: null }, { status: 400 });
  }
  try {
    const { rows } = await query<{ handle: string }>(
      `SELECT s.handle FROM social_sources s
         JOIN social_posts p ON p.social_source_id = s.id
        WHERE s.hsid = $1 AND s.owner_type = 'school'
          AND s.platform = 'instagram' AND s.status = 'active'
          AND p.external_post_id = $2 AND p.media_type = 'video'
        LIMIT 1`,
      [hsid, postId]
    );
    if (!rows.length) return NextResponse.json({ video_url: null }, { status: 404 });
    const video_url = await instagramProfessionalVideoUrl(rows[0].handle, postId);
    return NextResponse.json({ video_url }, {
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  } catch (error) {
    console.error('school instagram video lookup failed', { hsid, postId, error: String(error) });
    return NextResponse.json({ video_url: null }, { status: 502 });
  }
}
