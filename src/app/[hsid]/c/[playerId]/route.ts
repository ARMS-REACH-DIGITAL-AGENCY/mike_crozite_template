import { getPlayerById, getSchoolByHsid, getSchoolByUrl } from '@/lib/db';
const PLAYER_PREVIEW_BOT = /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discord|whatsapp|telegram|linkedinbot|skypeuripreview|pinterest|redditbot|preview/i;
function escapePlayerPreviewHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function playerShareOrigin(host: string, proto: string) { const safeHost = host.split(',')[0].trim().toLowerCase(); if (!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(safeHost)) return 'https://yatstats.com'; return (safeHost.startsWith('localhost') ? 'http' : proto === 'http' ? 'http' : 'https') + '://' + safeHost; }

export const runtime = 'nodejs';
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export async function GET(request: Request, context: { params: Promise<{ hsid: string; playerId: string }> }) {
  const { hsid, playerId } = await context.params;
  if (!ID.test(playerId)) return new Response('Not found', { status: 404 });
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
  const origin = playerShareOrigin(host, request.headers.get('x-forwarded-proto') || 'https');
  const [player, school] = await Promise.all([
    getPlayerById(playerId).catch(() => null),
    (/^\d+$/.test(hsid) ? getSchoolByHsid(hsid) : getSchoolByUrl(origin)).catch(() => null),
  ]);
  if (!player || !school) return new Response('Not found', { status: 404 });
  const schoolId = String(school.hsid || hsid);
  const name = [player.firstname || player.first_name, player.lastname || player.last_name].filter(Boolean).join(' ').trim() || 'Player';
  const schoolName = String(school.hsname || 'High School');
  const currentTeam = /^\d+$/.test(String(player.class_of || '')) && Number(player.class_of) >= new Date().getFullYear();
  const view = currentTeam ? 'current' : 'alltime';
  const target = origin + (/^\d+$/.test(hsid) ? '/' + encodeURIComponent(hsid) : '') + '/?view=' + view + '&player=' + encodeURIComponent(playerId) + '#player-' + encodeURIComponent(playerId);
  const committedName = String(player.resolved_committed_team_short_name || player.committed_team_name || player.resolved_committed_team_name || '').trim();
  const title = committedName ? name + ' | ' + committedName + ' Commit | YAT?STATS' : name + ' | ' + schoolName + ' | YAT?STATS';
  const description = committedName ? name + ' of ' + schoolName + ' has committed to ' + committedName + '. View the player flip card on YAT?STATS.' : 'View ' + name + "'s player flip card from " + schoolName + ' on YAT?STATS.';
  const image = origin + '/api/og/player-card?playerId=' + encodeURIComponent(playerId);
  if (!PLAYER_PREVIEW_BOT.test(request.headers.get('user-agent') || '')) {
    return new Response(null, { status: 307, headers: { Location: target, 'Cache-Control': 'no-store' } });
  }
  const esc = escapePlayerPreviewHtml;
  const self = origin + (/^\d+$/.test(hsid) ? '/' + encodeURIComponent(hsid) : '') + '/c/' + encodeURIComponent(playerId);
  return new Response('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title>'
    + '<meta name="description" content="' + esc(description) + '">'
    + '<meta property="og:type" content="website"><meta property="og:site_name" content="YAT?STATS">'
    + '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(description) + '">'
    + '<meta property="og:url" content="' + esc(self) + '"><meta property="og:image" content="' + esc(image) + '">'
    + '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
    + '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(title) + '">'
    + '<meta name="twitter:description" content="' + esc(description) + '"><meta name="twitter:image" content="' + esc(image) + '">'
    + '</head><body><a href="' + esc(target) + '">View ' + esc(name) + "'s flip card</a></body></html>",
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
}
