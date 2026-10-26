// One public Instagram post's picture, @handle, caption and kind, so a news
// story linking to Instagram opens in the same viewer, with the same details,
// as the profile's Social tab. ?url=<instagram post link>
import { NextRequest, NextResponse } from 'next/server';
import { fetchInstagramPostPreview, parseInstagramPermalink } from '@/lib/instagramPostPreview';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') || '';
  if (!parseInstagramPermalink(url)) {
    return NextResponse.json({ post: null }, { status: 400 });
  }
  try {
    const post = await fetchInstagramPostPreview(url);
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
