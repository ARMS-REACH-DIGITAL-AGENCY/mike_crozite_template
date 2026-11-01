// Canonical profile-link parsing for both the retired-alumni form and its API.
// Store actual absolute https links; accept compact handles in the UI.
export type WhereYatLinkField = 'website' | 'linkedin' | 'instagram' | 'facebook' | 'x';
export type WhereYatLinkResult = { url: string; error?: string };
const socials: Record<Exclude<WhereYatLinkField, 'website'>, { host: string; domains: string[]; hint: string }> = {
  linkedin: { host: 'www.linkedin.com/in', domains: ['linkedin.com', 'www.linkedin.com'], hint: 'petedeluca or linkedin.com/in/petedeluca' },
  instagram: { host: 'www.instagram.com', domains: ['instagram.com', 'www.instagram.com'], hint: '@pcdaction or instagram.com/pcdaction' },
  facebook: { host: 'www.facebook.com', domains: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com'], hint: 'petedeluca or facebook.com/petedeluca' },
  x: { host: 'x.com', domains: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'], hint: '@pcdaction or x.com/pcdaction' },
};
const scheme = /^[a-z][a-z0-9+.-]*:\/\//i;
const handle = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const socialKeys = Object.keys(socials) as Array<Exclude<WhereYatLinkField, 'website'>>;

export function normalizeWhereYatLink(field: WhereYatLinkField, input: string): WhereYatLinkResult {
  let value = String(input || '').trim();
  if (!value) return { url: '' };
  if (value.length > 300) return { url: '', error: 'Link is too long.' };
  // A common mobile-keyboard typo (httpa://) is unambiguous.
  value = value.replace(/^httpa:\/\//i, 'https://');
  if (field !== 'website') {
    const spec = socials[field];
    if (value.startsWith('@')) value = value.slice(1).trim();
    if (handle.test(value)) return { url: `https://${spec.host}/${value}` };
    if (!scheme.test(value) && !/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
    try {
      const parsed = new URL(value);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || !spec.domains.includes(parsed.hostname.toLowerCase()) || !parsed.pathname.replace(/\//g,'').trim()) {
        return { url: '', error: `Enter a handle or a valid ${field === 'x' ? 'X' : field} profile: ${spec.hint}.` };
      }
      if (field === 'linkedin' && !/^\/(in|company|school)\//i.test(parsed.pathname)) {
        return { url: '', error: 'LinkedIn: use your /in/ profile or enter just your username.' };
      }
      parsed.protocol = 'https:';
      parsed.hash = '';
      return { url: parsed.toString() };
    } catch {
      return { url: '', error: `Enter a handle or a valid profile: ${spec.hint}.` };
    }
  }
  // Business websites are domains/URLs, never guessed to be a social handle.
  if (!scheme.test(value) && !/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.hostname) || parsed.hostname.includes('..')) {
      return { url: '', error: 'Enter a website domain such as yatstats.com.' };
    }
    parsed.hash = '';
    return { url: parsed.toString() };
  } catch {
    return { url: '', error: 'Enter a website domain such as yatstats.com.' };
  }
}

export const WHERE_YAT_LINK_FIELDS: ReadonlyArray<WhereYatLinkField> = ['website', ...socialKeys];
