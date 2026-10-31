// Public Instagram CDN media links are temporary. Never treat them as an archive,
// and never send Graph API tokens or untrusted URLs to the browser.
export const INSTAGRAM_VIDEO_URL_TTL_MS = 10 * 60 * 60 * 1000;

export function safeInstagramVideoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password ||
        !(host === 'fbcdn.net' || host.endsWith('.fbcdn.net') ||
          host === 'cdninstagram.com' || host.endsWith('.cdninstagram.com'))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isInstagramRateLimit(message: unknown): boolean {
  return /\(#(?:4|17|613|80002)\)|application request limit reached|rate.?limit reached/i.test(String(message || ''));
}
