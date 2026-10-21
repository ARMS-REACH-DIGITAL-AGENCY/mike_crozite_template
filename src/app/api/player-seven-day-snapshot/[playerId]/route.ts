import { NextResponse } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import PlayerSevenDaySnapshot from '@/components/yatstats/PlayerSevenDaySnapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The school gallery defers its per-player game log. No HTML is generated
// (and no player schedule SQL is executed) until a fan opens the Game Log.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await params;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(playerId)) {
    return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 });
  }

  try {
    const markup = await PlayerSevenDaySnapshot({
      playerId,
      displayName: '',
      profileHref: '#',
    });
    if (!markup) return new NextResponse(null, { status: 404 });
    return new NextResponse(renderToStaticMarkup(markup), {
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
