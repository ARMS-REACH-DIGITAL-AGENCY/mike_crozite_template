// src/middleware.ts
// Injects the current request pathname as an x-pathname request header so that
// server-side layouts (which only receive their own segment params) can
// read the full URL path and extract child-segment params like playerId.
//
// IMPORTANT: Must use NextResponse.next({ request: { headers } }) to forward
// headers to the server component — setting response headers does NOT work.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// AI and SEO scrapers that crawl every player page as fast as they can.
// Each player page reads a career's worth of stats, and a crawl like that
// took the database down (Oct 2026). Search engines (Google, Bing...) still
// get in; these are refused before any page or API work starts. robots.txt
// asks them to stay away too, but many don't ask.
const BLOCKED_BOTS = /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|CCBot|Bytespider|Amazonbot|meta-externalagent|PerplexityBot|Diffbot|ImagesiftBot|Omgilibot|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|DataForSeoBot|BLEXBot|Barkrowler|serpstatbot|SeekportBot/i;

export function middleware(request: NextRequest) {
  if (BLOCKED_BOTS.test(request.headers.get('user-agent') || '')) {
    return new NextResponse('Automated crawling is not permitted.', { status: 403 });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  // A shared team link (?team=2017): the layout renders rows 2-3 and the
  // count box for that team from the first byte (layouts get no
  // searchParams of their own).
  const team = request.nextUrl.searchParams.get('team') || '';
  if (/^\d{4}$/.test(team)) requestHeaders.set('x-yat-team', team);
  else requestHeaders.delete('x-yat-team');

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
