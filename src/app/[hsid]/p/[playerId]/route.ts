// /p/{playerId} short links are navigation links for EVERY visitor.
// Never return bare Open Graph HTML here: the same messaging app can use a
// preview-looking user-agent when its user taps a previously shared link.
// Full player profile pages already emit crawler-safe OG metadata; crawlers
// can follow this redirect and read those tags without a separate landing page.
import { getPlayerById, getSchoolByHsid, getSchoolByUrl, resolveLegacyPlayerRedirect } from '@/lib/db';
import { toPlayerSlug } from '@/lib/slug';
import { playerProfileShareInfo, playerShareOrigin } from '@/lib/playerProfileShare';

export const runtime = 'nodejs';
const PLAYER_ID = /^[A-Za-z0-9_-]{1,40}$/;

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
  return new Response(null, {
    status: 307,
    headers: { Location: info.url, 'Cache-Control': 'private, no-store' },
  });
}
