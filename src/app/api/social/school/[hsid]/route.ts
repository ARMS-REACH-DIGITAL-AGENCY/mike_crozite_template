// Public Instagram posts for a school account, shared on its coach's
// player profile. Uses the existing social_sources ownership model without
// assigning school posts to the coach's personal Instagram account.
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, context: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await context.params;
  if (!/^\d{1,10}$/.test(hsid || '')) {
    return NextResponse.json({ posts: [] }, { status: 400 });
  }

  try {
    const { rows } = await query(
      `SELECT p.external_post_id AS id, p.media_type, p.caption, p.permalink,
              p.thumbnail_url, p.published_at, s.handle
         FROM social_sources s
         JOIN social_posts p ON p.social_source_id = s.id
        WHERE s.hsid = $1 AND s.owner_type = 'school'
          AND s.platform = 'instagram' AND s.status = 'active'
          AND p.thumbnail_url IS NOT NULL
        ORDER BY p.published_at DESC NULLS LAST
        LIMIT 12`,
      [hsid],
    );
    return NextResponse.json(
      { posts: rows },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600' } },
    );
  } catch (error) {
    console.error('school social posts failed', { hsid, error });
    return NextResponse.json({ posts: [] }, { status: 500 });
  }
}
