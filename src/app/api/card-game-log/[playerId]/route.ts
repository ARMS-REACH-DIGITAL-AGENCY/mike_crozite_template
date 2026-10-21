// Dedicated school-subdomain-safe endpoint for the gallery's on-demand game log.
// /card-game-log/* currently 404s on school wildcard hosts even though it
// works on the project's base domain. Keep the seven-day snapshot lazy.
import { NextRequest, NextResponse } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import PlayerSevenDaySnapshot from '@/components/yatstats/PlayerSevenDaySnapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await context.params;
  const hsid = req.nextUrl.searchParams.get('hsid') || '';
  const slug = req.nextUrl.searchParams.get('slug') || '';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(playerId) ||
      !/^[1-9][0-9]{0,9}$/.test(hsid) ||
      !/^[a-zA-Z0-9-]{0,120}$/.test(slug)) {
    return NextResponse.json({ error: 'Invalid game log link' }, { status: 400 });
  }
  try {
    const component = await PlayerSevenDaySnapshot({
      playerId, displayName: '', profileHref: `/${hsid}/player/${encodeURIComponent(playerId)}/${slug}`,
    });
    const html = renderToStaticMarkup(component);
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=90, stale-while-revalidate=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[api/card-game-log] seven-day snapshot failed', { playerId, error });
    return NextResponse.json({ error: 'Game log temporarily unavailable' }, { status: 503 });
  }
}
