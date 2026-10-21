import { NextResponse } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { unstable_cache } from 'next/cache';
import PlayerSevenDaySnapshot from '@/components/yatstats/PlayerSevenDaySnapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The school gallery defers its per-player game log. No HTML is generated
// (and no player schedule SQL is executed) until a fan opens the Game Log.
const renderSnapshot = unstable_cache(
  async (playerId: string, profileHref: string) => {
    const view = await PlayerSevenDaySnapshot({ playerId, displayName: '', profileHref });
    return view ? renderToStaticMarkup(view) : null;
  },
  ['player-seven-day-html-v1'],
  { revalidate: 60 },
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await params;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(playerId)) {
    return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const hsid = url.searchParams.get('hsid') || '';
    const slug = url.searchParams.get('slug') || '';
    if (!/^[1-9][0-9]{0,9}$/.test(hsid) || !/^[a-zA-Z0-9-]{0,120}$/.test(slug)) {
      return NextResponse.json({ error: 'Invalid school or slug' }, { status: 400 });
    }
    const profileHref = `/${hsid}/player/${encodeURIComponent(playerId)}/${slug}`;
    const markup = await renderSnapshot(playerId, profileHref);
    if (!markup) return new NextResponse(null, { status: 404 });
    return new NextResponse(markup, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    console.error('[game-log] deferred snapshot failed', { playerId, error });
    return NextResponse.json({ error: 'Schedule unavailable' }, { status: 503 });
  }
}
