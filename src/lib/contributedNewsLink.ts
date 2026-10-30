// Safe, non-embeddable outbound links are still valid Alumni News contributions.
// All schools use this shared policy; a link is never used as an iframe src.
export type ContributedNewsLink = {
  url: string;
  source: string;
  instagramStory: boolean;
};

const PUBLIC_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function parseContributedNewsLink(raw: string): ContributedNewsLink | null {
  if (!raw || raw.length > 2048 || /[\u0000-\u0020\u007f]/.test(raw)) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
  const host = parsed.hostname.toLowerCase();
  if (!PUBLIC_DOMAIN.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
  const source = host.replace(/^www\./, '');
  // An Instagram Story is a normal outbound news link. It is NOT an Instagram
  // /p/ embed: the original may expire or require the viewer to sign in.
  const instagramStory = ['instagram.com','m.instagram.com'].includes(source)
    && /^\/stories\/[a-z0-9._-]+\/[0-9]+\/?$/i.test(parsed.pathname);
  return { url: parsed.href, source, instagramStory };
}
