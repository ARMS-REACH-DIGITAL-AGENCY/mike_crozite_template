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
    // After a validated school_success URL backfill, this resolves a school
    // with one small lookup instead of also recalculating canonical URLs.
    // Ambiguous and missing matches still use the original routing logic.
    if (process.env.YATSTATS_SCHOOL_SUCCESS_FAST_PATH === '1') {
      const pattern = schoolHostnamePattern(hostname);
      if (pattern?.type === 'named') {
        try {
          const { rows } = await query<{ hsid: string; microsite_url: string }>(
            `SELECT hsid::text AS hsid, microsite_url FROM public.school_success
               WHERE LOWER(BTRIM(microsite_url, '/')) = $1 AND hsid IS NOT NULL LIMIT 2`,
            ['https://' + hostname],
          );
          if (rows.length === 1 && normalizeSchoolHost(rows[0].microsite_url) === hostname)
            return { hsid: rows[0].hsid, canonicalUrl: rows[0].microsite_url.replace(/\\/+$/, '') };
        } catch (error) {
          console.warn('School success fast lookup unavailable; using existing resolver', {
            name: error instanceof Error ? error.name : 'unknown',
          });
        }
      }
    }
    const hsid = await resolveSchoolHsidFromHost(hostname, (sql, params = []) => query(sql, params));
    if (!hsid) return { hsid: null, canonicalUrl: null };
    const urls = await canonicalSchoolUrls([hsid], (sql, params = []) => query(sql, params));
    return { hsid, canonicalUrl: urls.get(hsid) || null };
  },
  ['school-host-resolution-city-v2', process.env.YATSTATS_SCHOOL_SUCCESS_FAST_PATH === '1' ? 'success-fast' : 'legacy'],
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
