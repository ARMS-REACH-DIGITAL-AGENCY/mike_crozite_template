// One public Instagram post's picture, @handle, caption and kind, so a news
// story linking to Instagram opens in the same viewer, with the same details,
// as the profile's Social tab. ?url=<instagram post link>
import { NextRequest, NextResponse } from 'next/server';
import { fetchInstagramPostPreview, parseInstagramPermalink } from '@/lib/instagramPostPreview';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') || '';
  const newsUuid = req.nextUrl.searchParams.get('newsUuid') || '';
  const parsed = parseInstagramPermalink(url);
  if (!parsed) {
    return NextResponse.json({ post: null }, { status: 400 });
  }
  try {
    if (/^[A-Za-z0-9_-]{1,100}$/.test(newsUuid)) {
      // The verified article provides a reliable, indexed bridge from News to
      // the SAME Meta-synced video feed that powers the player's Social tab.
      // Never trust a newsUuid alone: the requested Instagram permalink must
      // match the published article and source post exactly.
      const { rows } = await query<{
        external_post_id: string; media_type: string | null; caption: string | null;
        permalink: string; thumbnail_url: string | null; media_url: string | null;
        published_at: string | null; handle: string;
      }>(`
        SELECT p.external_post_id,p.media_type,p.caption,p.permalink,p.thumbnail_url,
               CASE WHEN p.media_url_expires_at > now() THEN p.media_url ELSE NULL END AS media_url,
               p.published_at::text, s.handle
        FROM news_articles n
        JOIN social_posts p ON p.id = CASE
          WHEN (n.raw_payload->>'socialPostId') ~ '^[0-9]+
    // A complete post keeps for a day; a partial one is retried soon.
    const complete = Boolean(post?.handle && post?.thumbnail_url);
    return NextResponse.json(
      { post },
      { headers: { 'Cache-Control': complete
        ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
        : 'public, max-age=60, s-maxage=300' } }
    );
  } catch (error) {
    console.error('instagram post preview failed', { url, error: String(error) });
    return NextResponse.json({ post: null }, { status: 502, headers: { 'Cache-Control': 'public, s-maxage=300' } });
  }
}

          THEN (n.raw_payload->>'socialPostId')::bigint ELSE NULL END
        JOIN social_sources s ON s.id=p.social_source_id
        WHERE n.uuid=$1 AND n.url=$2 AND n.verification_status='VERIFIED'
          AND p.permalink=$2 AND p.platform='instagram' AND s.status='active'
        LIMIT 1
      `, [newsUuid,parsed.permalink]);
      if (rows[0]) {
        const stored=rows[0];
        return NextResponse.json({post:{
          shortcode:parsed.shortcode,
          id:stored.external_post_id,
          permalink:parsed.permalink,
          handle:stored.handle,
          caption:stored.caption,
          media_type:stored.media_type,
          media_url:stored.media_url,
          thumbnail_url:stored.thumbnail_url,
          published_at:stored.published_at,
        }}, {headers:{'Cache-Control':'private, no-store'}});
      }
    }
    const post = await fetchInstagramPostPreview(parsed.permalink);
    // A complete post keeps for a day; a partial one is retried soon.
    const complete = Boolean(post?.handle && post?.thumbnail_url);
    return NextResponse.json(
      { post },
      { headers: { 'Cache-Control': complete
        ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
        : 'public, max-age=60, s-maxage=300' } }
    );
  } catch (error) {
    console.error('instagram post preview failed', { url, error: String(error) });
    return NextResponse.json({ post: null }, { status: 502, headers: { 'Cache-Control': 'public, s-maxage=300' } });
  }
}
