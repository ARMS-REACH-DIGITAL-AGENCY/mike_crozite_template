import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { resolveSchoolHsidFromHost, schoolHostnamePattern } from '@/lib/schoolDirectoryRouting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read-only internal resolver for the existing Vercel-compatible Edge
// middleware. Fail closed on unknown or ambiguous school hostnames.
export async function GET(request: NextRequest) {
  const host = request.headers.get('x-yat-school-host') || '';
  if (!schoolHostnamePattern(host)) {
    return NextResponse.json({ hsid: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const hsid = await resolveSchoolHsidFromHost(
      host,
      (sql, params = []) => query(sql, params),
    );
    return NextResponse.json({ hsid }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    console.error('school-host-resolve failed', error);
    return NextResponse.json(
      { hsid: null, error: 'School resolver unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
