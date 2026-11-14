// Return the original Instagram post's media to the shared News/Social viewer.
// A published news UUID must match the canonical Instagram permalink before
// any synced media can be reused. Public scraping is best effort.
import { NextRequest, NextResponse } from 'next/server';
import { fetchInstagramPostPreview, parseInstagramPermalink } from '@/lib/instagramPostPreview';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') || '';
  const newsUuid = req.nextUrl.searchParams.get('newsUuid') || '';
  const parsed = parseInstagramPermalink(url);
  if (!parsed) return NextResponse.json({ post: null }, { status: 400 });

  // Remove the trailing slash only for equality checks. Instagram tracking
  // params such as ?img_index=5 must not stop the same post being matched.
  const canonicalPath = parsed.permalink.replace(/\/$/, '');
  // Preserve a selected carousel frame on the outbound ORIGINAL POST link.
  // The media thumbnail is a post-level preview, never claimed to be frame N.
  const chosenFrame = req.nextUrl.searchParams.get('url')
    ? new URL(url).searchParams.get('img_index')
    : null;
  const originalPostUrl = chosenFrame && /^[1-9][0-9]?$/.test(chosenFrame)
    ? parsed.permalink + '?img_index=' + chosenFrame
    : parsed.permalink;
  if (/^[A-Za-z0-9_-]{1,100}$/.test(newsUuid)) {
    try {
      const { rows } = await query<{
        external_post_id: string; media_type: string | null; caption: string | null;
        permalink: string; thumbnail_url: string | null; media_url: string | null;
        published_at: string | null; handle: string;
      }>(`
        SELECT p.external_post_id, p.media_type, p.caption, p.permalink,
               p.thumbnail_url,
               CASE WHEN p.media_url_expires_at > now() THEN p.media_url ELSE NULL END AS media_url,
               p.published_at::text AS published_at, s.handle
        FROM news_articles n
        JOIN social_posts p
          ON p.id = CASE
            WHEN (n.raw_payload->>'socialPostId') ~ '^[0-9]+$'
            THEN (n.raw_payload->>'socialPostId')::bigint
            ELSE NULL
          END
        JOIN social_sources s ON s.id = p.social_source_id
        WHERE n.uuid = $1
          AND regexp_replace(split_part(n.url, '?', 1), '/+$', '') = $2
          AND regexp_replace(split_part(p.permalink, '?', 1), '/+$', '') = $2
          AND n.verification_status = 'VERIFIED'
          AND p.platform = 'instagram'
          AND s.status = 'active'
        LIMIT 1
      `, [newsUuid, canonicalPath]);
      if (rows[0]) {
        const stored = rows[0];
        return NextResponse.json({ post: {
          shortcode: parsed.shortcode,
          id: stored.external_post_id,
          permalink: originalPostUrl,
          handle: stored.handle,
          caption: stored.caption,
          media_type: stored.media_type,
          media_url: stored.media_url,
          thumbnail_url: stored.thumbnail_url,
          published_at: stored.published_at,
        } }, { headers: { 'Cache-Control': 'private, no-store' } });
      }
    } catch (error) {
      // A database lookup must not prevent the public preview fallback.
      console.error('instagram news media lookup failed', { newsUuid, error: String(error) });
    }
  }

  try {
    const post = await fetchInstagramPostPreview(parsed.permalink);
    if (post) post.permalink = originalPostUrl;
    const complete = Boolean(post?.handle && post?.thumbnail_url);
    return NextResponse.json({ post }, {
      headers: { 'Cache-Control': complete
        ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
        : 'private, no-store' },
    });
  } catch (error) {
    // Instagram can withhold media from server-side crawlers. Do not give the
    // viewer an HTTP 502 or let a broken embed masquerade as actual media.
    console.warn('instagram public media unavailable', { shortcode: parsed.shortcode, error: String(error) });
    return NextResponse.json({ post: null }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
}
