// Test branch only: preserve the completed 2026 simulation when visiting another
// school from the shared Fantasy Bracket UI. Outside the replay, use the
// original 2027 school link. Never add these flags to production navigation.
export const COMPLETED_REPLAY_ASOF = '2026-11-18';
export const COMPLETED_REPLAY_WEEK = '34';

export function schoolBracketHref(hsid: string | number, search: string): string {
  const base = `/${encodeURIComponent(String(hsid))}`;
  const params = new URLSearchParams(search);
  if (params.get('sim2026field') === '1') {
    const asof = /^\d{4}-\d{2}-\d{2}$/.test(params.get('asof') || '') ? params.get('asof')! : '2026-03-25';
    const week = Number(params.get('week'));
    return `${base}?sim2026field=1&week=${Number.isInteger(week) && week >= 1 && week <= 34 ? week : 1}&asof=${asof}#sec-fantasy`;
  }
  if (params.get('sim2026') !== '1') return `${base}#sec-fantasy`;
  return `${base}?sim2026=1&week=${COMPLETED_REPLAY_WEEK}&asof=${COMPLETED_REPLAY_ASOF}#sec-fantasy`;
}

// Game-share links retain their selected game/week, but must also load the
// finished historical source rather than the unopened 2027 bracket.
export function replayShareUrl(url: string, search: string): string {
  const params = new URLSearchParams(search);
  if (params.get('sim2026field') === '1') {
    const asof = /^\d{4}-\d{2}-\d{2}$/.test(params.get('asof') || '') ? params.get('asof')! : '2026-03-25';
    const hashAt = url.indexOf('#');
    const body = hashAt < 0 ? url : url.slice(0, hashAt);
    const fragment = hashAt < 0 ? '' : url.slice(hashAt);
    return `${body}${body.includes('?') ? '&' : '?'}sim2026field=1&asof=${asof}${fragment}`;
  }
  if (params.get('sim2026') !== '1') return url;
  const hashAt = url.indexOf('#');
  const body = hashAt < 0 ? url : url.slice(0, hashAt);
  const fragment = hashAt < 0 ? '' : url.slice(hashAt);
  return `${body}${body.includes('?') ? '&' : '?'}sim2026=1&asof=${COMPLETED_REPLAY_ASOF}${fragment}`;
}
