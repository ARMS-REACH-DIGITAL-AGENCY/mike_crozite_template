// src/lib/schoolCanonical.ts
// The canonical hub URL a search engine should see for a school.
//
// getCanonicalBaseUrl falls back to https://<hsid>.yatstats.com when a school
// has no curated school_success.microsite_url. That is most schools (about
// 16,000 of 17,000 in Nov 2026), and it told Google to index 14385.yatstats.com
// instead of the readable img-academy.fl.yatstats.com the sitemap lists.
// This resolves the same generated hostname the sitemap and player pages use
// (canonicalSchoolUrls), cached for a day per school because that query reads
// the whole school reference table.
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { getCanonicalBaseUrl } from '@/lib/canonicalUrl';
import { canonicalSchoolUrls } from '@/lib/schoolDirectoryRouting';

const generatedSchoolUrl = unstable_cache(async (hsid: string): Promise<string> => {
  const urls = await canonicalSchoolUrls([hsid], (sql, params = []) => query(sql, params));
  return (urls.get(hsid) || '').replace(/\/+$/, '');
}, ['school-canonical-url-v1'], { revalidate: 60 * 60 * 24, tags: ['sitemap'] });

export async function getSchoolCanonicalUrl(
  school: Record<string, unknown> | null | undefined,
  hsid: string,
): Promise<string> {
  const curated = getCanonicalBaseUrl(school, hsid);
  if (school?.microsite_url || !/^[1-9]\d*$/.test(hsid)) return curated;
  try {
    return (await generatedSchoolUrl(hsid)) || curated;
  } catch {
    return curated;
  }
}
