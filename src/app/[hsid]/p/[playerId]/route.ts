// /p/{playerId} short links are navigation links for EVERY visitor.
// Never return bare Open Graph HTML here: the same messaging app can use a
// preview-looking user-agent when its user taps a previously shared link.
// Full player profile pages already emit crawler-safe OG metadata; crawlers
// can follow this redirect and read those tags without a separate landing page.
import { getPlayerById, getSchoolByHsid, getSchoolByUrl, resolveLegacyPlayerRedirect } from '@/lib/db';
import { toPlayerSlug } from '@/lib/slug';
import { escapePlayerPreviewHtml, playerProfileShareInfo, playerShareOrigin } from '@/lib/playerProfileShare';

export const runtime = 'nodejs';
const PLAYER_ID = /^[A-Za-z0-9_-]{1,40}$/;
// Use specific messenger crawlers, never generic mobile/webview user agents.
// Human requests keep the fast 307. Bot responses must include OG metadata
// on the short URL itself because some messaging apps do not follow 307s.
const LINK_PREVIEW_BOT = /bot\b|crawler\b|spider\b|GoogleMessages|Google-PageRenderer|BingPreview|facebookexternalhit|Twitterbot|Slackbot|Discordbot|WhatsApp|TelegramBot|LinkedInBot|SkypeUriPreview|Applebot|Pinterest|redditbot|vkShare/i;

export async function GET(request: Request, context: { params: Promise<{ hsid: string; playerId: string }> }) {
  const { hsid, playerId } = await context.params;
  if (!PLAYER_ID.test(playerId)) return new Response('Not found', { status: 404 });
  const legacy = await resolveLegacyPlayerRedirect(playerId);
  const canonicalId = legacy?.playerId || playerId;
  const canonicalHsid = legacy?.hsid || hsid;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
  const origin = playerShareOrigin(host, request.headers.get('x-forwarded-proto') || 'https');
  const [player, school] = await Promise.all([
    getPlayerById(canonicalId).catch(() => null),
    (/^\d+$/.test(canonicalHsid) ? getSchoolByHsid(canonicalHsid) : getSchoolByUrl(origin)).catch(() => null),
  ]);
  if (!player || !school) return new Response('Not found', { status: 404 });
  const resolvedHsid = String(school.hsid || canonicalHsid);
  const name = [player.firstname || player.first_name, player.lastname || player.last_name].filter(Boolean).join(' ').trim();
  const slug = toPlayerSlug(String(player.firstname || player.first_name || ''), String(player.lastname || player.last_name || ''));
  const info = playerProfileShareInfo({
    origin, hsid: resolvedHsid, playerId: canonicalId, slug,
    playerName: name, schoolName: String(school.hsname || ''),
  });
  if (LINK_PREVIEW_BOT.test(request.headers.get('user-agent') || '')) {
    const esc = escapePlayerPreviewHtml;
    const shortUrl = new URL(request.url).toString();
    // The OG tags must precede the client redirect so Google Messages can
    // build the large image card without following a redirect into the full PPP.
    // JS, refresh and an ordinary visible link all lead real visitors straight
    // to the full profile, including webviews that use a crawler user-agent.
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<title>' + esc(info.title) + '</title>' +
      '<meta name="description" content="' + esc(info.description) + '">' +
      '<link rel="canonical" href="' + esc(info.url) + '">' +
      '<meta property="og:type" content="profile">' +
      '<meta property="og:site_name" content="YAT?STATS">' +
      '<meta property="og:title" content="' + esc(info.title) + '">' +
      '<meta property="og:description" content="' + esc(info.description) + '">' +
      '<meta property="og:url" content="' + esc(shortUrl) + '">' +
      '<meta property="og:image" content="' + esc(info.image) + '">' +
      '<meta property="og:image:secure_url" content="' + esc(info.image) + '">' +
      '<meta property="og:image:type" content="image/png">' +
      '<meta property="og:image:width" content="1200">' +
      '<meta property="og:image:height" content="630">' +
      '<meta name="twitter:card" content="summary_large_image">' +
      '<meta name="twitter:title" content="' + esc(info.title) + '">' +
      '<meta name="twitter:description" content="' + esc(info.description) + '">' +
      '<meta name="twitter:image" content="' + esc(info.image) + '">' +
      '<meta http-equiv="refresh" content="0;url=' + esc(info.url) + '">' +
      '</head><body><a href="' + esc(info.url) + '">View ' + esc(info.name) +
      ' on YAT?STATS</a><script>window.location.replace(' +
      JSON.stringify(info.url) + ')</script></body></html>';
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Vary': 'User-Agent',
        'X-YAT-Share-Preview': 'short-player-profile',
        'X-Robots-Tag': 'noindex',
      },
    });
  }
  return new Response(null, {
    status: 307,
    headers: {
      Location: info.url,
      'Cache-Control': 'private, no-store',
      'Vary': 'User-Agent',
    },
  });
}
