// Accept a player profile handle or URL, never an Instagram post/reel URL.
// Pure parser shared by the intake workflow and its regression tests.
const RESERVED_INSTAGRAM_PATHS = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'direct', 'accounts']);

export function normalizeInstagramHandle(value: string): string | null {
  let candidate = String(value || '').trim();
  if (candidate.startsWith('@')) candidate = candidate.slice(1).trim();
  if (!candidate) return null;
  if (/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com(?:\/|$)/i.test(candidate)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    } catch { return null; }
    if (!['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname.toLowerCase())) return null;
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) return null;
    candidate = segments[0];
  } else if (/[\s/?#:]/.test(candidate)) {
    return null;
  }
  if (!/^[a-z0-9._]{1,30}$/i.test(candidate) || candidate.startsWith('.') || candidate.endsWith('.') || candidate.includes('..')) return null;
  const handle = candidate.toLowerCase();
  return RESERVED_INSTAGRAM_PATHS.has(handle) ? null : handle;
}
