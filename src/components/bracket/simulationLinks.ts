// Test branch only: preserve the completed 2026 simulation when visiting another
// school from the shared Fantasy Bracket UI. Outside the replay, use the
// original 2027 school link. Never add these flags to production navigation.
export const COMPLETED_REPLAY_ASOF = '2026-11-18';
export const COMPLETED_REPLAY_WEEK = '34';

export function schoolBracketHref(hsid: string | number, search: string): string {
  const base = `/${encodeURIComponent(String(hsid))}`;
  if (new URLSearchParams(search).get('sim2026') !== '1') return `${base}#sec-fantasy`;
  return `${base}?sim2026=1&week=${COMPLETED_REPLAY_WEEK}&asof=${COMPLETED_REPLAY_ASOF}#sec-fantasy`;
}

// Game-share links retain their selected game/week, but must also load the
// finished historical source rather than the unopened 2027 bracket.
export function replayShareUrl(url: string, search: string): string {
  if (new URLSearchParams(search).get('sim2026') !== '1') return url;
  const hashAt = url.indexOf('#');
  const body = hashAt < 0 ? url : url.slice(0, hashAt);
  const fragment = hashAt < 0 ? '' : url.slice(hashAt);
  return `${body}${body.includes('?') ? '&' : '?'}sim2026=1&asof=${COMPLETED_REPLAY_ASOF}${fragment}`;
}
