import { canonicalSchoolUrls, schoolHostnamePattern, type SchoolQuery } from './schoolDirectoryRouting';

// News links must use the canonical school microsite, never yatstats.com.
// This applies equally to curated, generated, and collision-suffixed hosts.
export function schoolNewsOrigin(value: string | null | undefined): string | null {
  try {
    if (!value) return null;
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    if (!schoolHostnamePattern(parsed.hostname)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export async function resolveSchoolNewsOrigins(
  hsids: Array<string | number>,
  run: SchoolQuery,
): Promise<Map<string, string>> {
  const canonical = await canonicalSchoolUrls(hsids, run);
  const origins = new Map<string, string>();
  for (const [hsid, value] of canonical) {
    const origin = schoolNewsOrigin(value);
    if (origin) origins.set(hsid, origin);
  }
  return origins;
}

export function schoolNewsStoryUrl(schoolBase: string | null | undefined, uuid: string): string | null {
  const origin = schoolNewsOrigin(schoolBase);
  if (!origin || !/^[A-Za-z0-9_-]{1,100}$/.test(uuid)) return null;
  const url = new URL('/', origin);
  url.searchParams.set('news', '1');
  url.searchParams.set('story', uuid);
  url.hash = 'sec-news';
  return url.toString();
}

export function schoolNewsReviewUrl(schoolBase: string | null | undefined): string | null {
  const origin = schoolNewsOrigin(schoolBase);
  return origin ? new URL('/contribute-review', origin).toString() : null;
}
