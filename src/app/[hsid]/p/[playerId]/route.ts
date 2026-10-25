// The concise URL a fan can text: /p/364038 on a school's microsite,
// or /5004/p/364038 from a numeric school route. Link crawlers receive OG
// metadata here; a real visitor receives a 307 to the full player profile.
import { getPlayerById, getSchoolByHsid, getSchoolByUrl } from '@/lib/db';
import { toPlayerSlug } from '@/lib/slug';
import { escapePlayerPreviewHtml, PLAYER_PREVIEW_BOT, playerProfileShareInfo, playerShareOrigin } from '@/lib/playerProfileShare';

export const runtime = 'nodejs';
const PLAYER_ID = /^[A-Za-z0-9_-]{1,40}$/;

export async function GET(request: Request, context: { params: Promise<{ hsid: string; playerId: string }> }) {
  const { hsid, playerId } = await context.params;
  if (!PLAYER_ID.test(playerId)) return new Response('Not found', { status: 404 });
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
  const origin = playerShareOrigin(host, request.headers.get('x-forwarded-proto') || 'https');
  const [player, school] = await Promise.all([
    getPlayerById(playerId).catch(() => null),
    (/^\d+$/.test(hsid) ? getSchoolByHsid(hsid) : getSchoolByUrl(origin)).catch(() => null),
  ]);
  if (!player || !school) return new Response('Not found', { status: 404 });

  const resolvedHsid = String(school.hsid || hsid);
  const name = [player.firstname || player.first_name, player.lastname || player.last_name].filter(Boolean).join(' ').trim();
  const slug = toPlayerSlug(String(player.firstname || player.first_name || ''), String(player.lastname || player.last_name || ''));
  const info = playerProfileShareInfo({
    origin, hsid: resolvedHsid, playerId, slug,
    playerName: name, schoolName: String(school.hsname || ''),
  });
  if (!PLAYER_PREVIEW_BOT.test(request.headers.get('user-agent') || '')) {
    return new Response(null, {
      status: 307,
      headers: { Location: info.url, 'Cache-Control': 'no-store' },
    });
  }

  const shortPath = /^\d+$/.test(hsid) ? '/' + hsid + '/p/' + encodeURIComponent(playerId) : '/p/' + encodeURIComponent(playerId);
  const self = origin + shortPath;
  const esc = escapePlayerPreviewHtml;
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<title>' + esc(info.title) + '</title>'
    + '<meta name="description" content="' + esc(info.description) + '">'
    + '<meta property="og:type" content="profile"><meta property="og:site_name" content="YAT?STATS">'
    + '<meta property="og:title" content="' + esc(info.title) + '">'
    + '<meta property="og:description" content="' + esc(info.description) + '">'
    + '<meta property="og:url" content="' + esc(self) + '">'
    + '<meta property="og:image" content="' + esc(info.image) + '">'
    + '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
    + '<meta property="og:image:type" content="image/png">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<meta name="twitter:title" content="' + esc(info.title) + '">'
    + '<meta name="twitter:description" content="' + esc(info.description) + '">'
    + '<meta name="twitter:image" content="' + esc(info.image) + '">'
    + '</head><body><a href="' + esc(info.url) + '">View ' + esc(info.name) + ' on YAT?STATS</a></body></html>';
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
