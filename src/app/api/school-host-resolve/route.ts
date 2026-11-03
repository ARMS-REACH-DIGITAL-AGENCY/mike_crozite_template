import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { canonicalSchoolUrls, normalizeSchoolHost, resolveSchoolHsidFromHost, schoolHostnamePattern } from '@/lib/schoolDirectoryRouting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The Edge middleware calls this endpoint for every school request. Without
// a server-side cache, a single visit can resolve the same hostname with 2-4
// SQL queries before the page even starts loading. Cache by the *validated*
// hostname in Next's shared data cache; failures are not cached. Keep HTTP
// responses private: the hostname is in a header, not the URL cache key.
const resolveCachedSchoolHost = unstable_cache(
  async (hostname: string) => {
    // Opt-in directory: one indexed lookup resolves both school ID and its
    // canonical hostname. Preserve the complete legacy resolver as fallback
    // for missing, duplicate, stale or unavailable prepared mappings.
    if (process.env.YATSTATS_PREPARED_SCHOOL_URLS === '1') {
      try {
        const prepared = await query<{ hsid: string; canonical_url: string }>(
          'SELECT hsid::text AS hsid, canonical_url FROM public.school_url_directory WHERE hostname = $1 LIMIT 1',
          [hostname],
        );
        const record = prepared.rows[0];
        if (record && /^https:\/\/[a-z0-9-]+\.[a-z]{2}\.yatstats\.com$/i.test(record.canonical_url) &&
            normalizeSchoolHost(record.canonical_url) === hostname) {
          return { hsid: record.hsid, canonicalUrl: record.canonical_url };
        }
      } catch (error) {
        console.warn('Prepared school URL lookup unavailable, using original resolver', {
          failure: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
    const hsid = await resolveSchoolHsidFromHost(hostname, (sql, params = []) => query(sql, params));
    if (!hsid) return { hsid: null, canonicalUrl: null };
    const urls = await canonicalSchoolUrls([hsid], (sql, params = []) => query(sql, params));
    return { hsid, canonicalUrl: urls.get(hsid) || null };
  },
  ['school-host-resolution-city-v3', process.env.YATSTATS_PREPARED_SCHOOL_URLS === '1' ? 'prepared' : 'legacy'],
  { revalidate: 600, tags: ['school-directory'] },
);

// Read-only internal resolver for the existing Vercel-compatible Edge
// middleware. Fail closed on unknown or ambiguous school hostnames.
export async function GET(request: NextRequest) {
  const host = normalizeSchoolHost(request.headers.get('x-yat-school-host') || '');
  if (!schoolHostnamePattern(host)) {
    return NextResponse.json({ hsid: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const resolved = await resolveCachedSchoolHost(host);
    return NextResponse.json(resolved, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    console.error('school-host-resolve failed', error);
    return NextResponse.json(
      { hsid: null, error: 'School resolver unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
