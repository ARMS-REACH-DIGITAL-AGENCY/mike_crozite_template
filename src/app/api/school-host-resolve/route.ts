import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { normalizeSchoolHost, resolveSchoolHsidFromHost, schoolHostnamePattern } from '@/lib/schoolDirectoryRouting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The Edge middleware calls this endpoint for every school request. Without
// a server-side cache, a single visit can resolve the same hostname with 2-4
// SQL queries before the page even starts loading. Cache by the *validated*
// hostname in Next's shared data cache; failures are not cached. Keep HTTP
// responses private: the hostname is in a header, not the URL cache key.
const resolveCachedSchoolHost = unstable_cache(
  async (hostname: string) => resolveSchoolHsidFromHost(
    hostname,
    (sql, params = []) => query(sql, params),
  ),
  ['school-host-resolution-v1'],
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
    const hsid = await resolveCachedSchoolHost(host);
    return NextResponse.json({ hsid }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    console.error('school-host-resolve failed', error);
    return NextResponse.json(
      { hsid: null, error: 'School resolver unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
