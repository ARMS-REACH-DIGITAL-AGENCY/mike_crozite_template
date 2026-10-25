// Shared Open Graph details for player-profile links and short /p/{id} links.
// Keep this module pure so the profile page and short-link handler agree.
export const PLAYER_PREVIEW_BOT = /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discord|whatsapp|telegram|linkedinbot|skypeuripreview|google-structured-data|pinterest|vkshare|redditbot|preview/i;

export function escapePlayerPreviewHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function playerProfileShareInfo(input: {
  origin: string;
  hsid: string;
  playerId: string;
  slug: string;
  playerName: string;
  schoolName?: string;
}) {
  const name = input.playerName.trim() || 'Baseball Alumni';
  const school = (input.schoolName || '').trim();
  const title = name + ' | YAT?STATS Player Profile';
  const description = 'Explore ' + name + "'s baseball career timeline, photos, stats and stories" + (school ? ' from ' + school : '') + ' on YAT?STATS.';
  const image = input.origin + '/api/og/player-profile?playerId=' + encodeURIComponent(input.playerId) + '&hsid=' + encodeURIComponent(input.hsid);
  const url = input.origin + '/' + encodeURIComponent(input.hsid) + '/player/' + encodeURIComponent(input.playerId) + '/' + encodeURIComponent(input.slug);
  return { title, description, image, url, name, school };
}

export function playerShareOrigin(host: string, proto = 'https'): string {
  const safeHost = host.split(',')[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(safeHost)) return 'https://yatstats.com';
  return (safeHost.startsWith('localhost') || safeHost.startsWith('127.0.0.1') ? 'http' : proto === 'http' ? 'http' : 'https') + '://' + safeHost;
}
