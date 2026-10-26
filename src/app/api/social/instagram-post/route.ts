// Resolve an Instagram news link to an already-synced S3 preview, if available.
// Only called when a News Instagram viewer opens: no per-story DB work on page load.
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { parseNewsVideo } from '@/lib/newsVideo';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get('url');
  if (!raw || raw.length > 500) {
    return NextResponse.json({ error: 'Invalid Instagram URL' }, { status: 400 });
  }
  const media = parseNewsVideo(raw);
  if (media?.provider !== 'Instagram') {
    return NextResponse.json({ error: 'Invalid Instagram post' }, { status: 400 });
  }
  // Match exact validated Instagram permalinks, never substring/LIKE across
  // all social posts. Some posts were stored as /p/ rather than /reel/.
  const parts = new URL(media.watchUrl).pathname.split('/').filter(Boolean);
  const shortcode = parts[1];
  const urls = ['p', 'reel', 'tv'].flatMap(type =>
    ['https://www.instagram.com/', 'https://instagram.com/', 'https://m.instagram.com/']
      .map(origin => origin + type + '/' + shortcode + '/')
  );
  try {
    const { rows } = await query<{
      media_type: string | null; thumbnail_url: string | null; handle: string | null; caption: string | null;
    }>(
      `SELECT p.media_type, p.thumbnail_url, s.handle, p.caption
         FROM social_posts p
         JOIN social_sources s ON s.id = p.social_source_id
        WHERE s.platform = 'instagram' AND s.status = 'active'
          AND p.permalink = ANY($1::text[]) AND p.thumbnail_url IS NOT NULL
        ORDER BY p.published_at DESC NULLS LAST LIMIT 1`, [urls]
    );
    const post = rows[0];
    return NextResponse.json({ post: post ? {
      media_type: post.media_type,
      thumbnail_url: post.thumbnail_url,
      handle: post.handle,
      caption: post.caption,
    } : null }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch (error) {
    console.error('[instagram news preview] lookup failed', error);
    return NextResponse.json({ post: null }, { status: 503 });
  }
}
