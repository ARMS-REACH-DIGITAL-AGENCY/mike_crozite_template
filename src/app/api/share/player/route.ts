// Tiny Open Graph response for messaging-app crawlers visiting a PPP URL.
// The real profile page is large and expensive to render. GoogleMessages
// must get its image tags without loading the gallery, shell or career stats.
// Human visitors continue to the actual player page unchanged.
import type { NextRequest } from 'next/server';
import { getSchoolByUrl } from '@/lib/db';
import { escapePlayerPreviewHtml, playerShareOrigin } from '@/lib/playerProfileShare';

export const runtime = 'nodejs';

const VALID_ID = /^[A-Za-z0-9_-]{1,40}$/;
const VALID_HSID = /^[1-9][0-9]{0,19}$/;
const VALID_SLUG = /^[a-z0-9][a-z0-9_-]{0,159}$/i;
const VALID_PUBLIC_PATH = /^\/(?:[1-9][0-9]{0,19}\/)?player\/[A-Za-z0-9_-]{1,40}\/[a-z0-9_-]{1,160}\/?$/i;

function titleCase(slug: string): string {
  return slug.split(/[-_]+/).filter(Boolean).map(s =>
    s.charAt(0).toUpperCase() + s.slice(1)
  ).join(' ') || 'Baseball Alumni';
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const playerId = params.get('playerId') || '';
  const slug = params.get('slug') || '';
  const suppliedHsid = params.get('hsid') || '';
  if (!VALID_ID.test(playerId) || !VALID_SLUG.test(slug) ||
      (suppliedHsid !== '' && !VALID_HSID.test(suppliedHsid))) {
    return new Response('Invalid player link', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  const origin = playerShareOrigin(host, request.headers.get('x-forwarded-proto') || 'https');

  // Named school hosts use /player/...; only these need a school lookup.
  // Numeric /{hsid}/player/... links (including newly created YAT IDs) need
  // zero database queries to serve the metadata.
  let hsid = suppliedHsid;
  if (!hsid) {
    const school = await getSchoolByUrl(origin).catch(() => null);
    hsid = String(school?.hsid || '');
  }
  if (!VALID_HSID.test(hsid)) {
    return new Response('School not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const requestedPath = params.get('path') || '';
  const fallbackPath = '/' + (suppliedHsid ? hsid + '/' : '') +
    'player/' + encodeURIComponent(playerId) + '/' + encodeURIComponent(slug);
  const publicPath = VALID_PUBLIC_PATH.test(requestedPath) &&
    requestedPath.includes('/' + playerId + '/' + slug)
      ? requestedPath : fallbackPath;
  const publicUrl = origin + publicPath;
  const name = titleCase(slug);
  const title = name + ' | YAT?STATS Player Profile';
  const description = 'Explore ' + name + "'s baseball career timeline, photos, stats and stories on YAT?STATS.";
  const image = origin + '/api/og/player-profile?playerId=' +
    encodeURIComponent(playerId) + '&hsid=' + encodeURIComponent(hsid) + '&v=real-timeline-only-v1';
  const esc = escapePlayerPreviewHtml;

  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<title>' + esc(title) + '</title>' +
    '<meta name="description" content="' + esc(description) + '">' +
    '<link rel="canonical" href="' + esc(publicUrl) + '">' +
    '<meta property="og:type" content="profile">' +
    '<meta property="og:site_name" content="YAT?STATS">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(description) + '">' +
    '<meta property="og:url" content="' + esc(publicUrl) + '">' +
    '<meta property="og:image" content="' + esc(image) + '">' +
    '<meta property="og:image:secure_url" content="' + esc(image) + '">' +
    '<meta property="og:image:type" content="image/png">' +
    '<meta property="og:image:width" content="1200">' +
    '<meta property="og:image:height" content="630">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(title) + '">' +
    '<meta name="twitter:description" content="' + esc(description) + '">' +
    '<meta name="twitter:image" content="' + esc(image) + '">' +
    '</head><body><a href="' + esc(publicUrl) + '">View ' + esc(name) + ' on YAT?STATS</a></body></html>';

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Bot and human responses share the public URL. Never allow a crawler's
      // stripped-down HTML response to be cached for a human visitor.
      'Cache-Control': 'private, no-store',
      'Vary': 'User-Agent',
      'X-YAT-Share-Preview': 'lightweight-player-page',
    },
  });
}
