import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';

// Neon Players compute is in US East; keep the cache miss close to it.
export const runtime = 'nodejs';
export const preferredRegion = 'iad1';

// Only one small indexed lookup per school per cache window, not per page hit.
// This GET only returns public sponsor branding. Writes belong to authenticated
// commerce/admin integrations, never the public splash endpoint.
type SponsorRow = { name: string; logo_url: string; website_url: string | null };
const sponsorForSchool = unstable_cache(async (hsid: string) => {
  const { rows } = await query<SponsorRow>(`
    SELECT b.name, b.logo_url, b.website_url
    FROM public.school_splash_sponsorships s
    JOIN public.sponsor_brands b ON b.id = s.sponsor_id
    WHERE s.hsid = $1 AND s.status = 'active' AND b.is_active = true
      AND s.starts_at <= now() AND (s.ends_at IS NULL OR s.ends_at > now())
    ORDER BY s.priority DESC, s.starts_at DESC, s.id DESC
    LIMIT 1
  `, [hsid]);
  return rows[0] || null;
}, ['splash-sponsor-v1'], { revalidate: 120 });

export async function GET(request: NextRequest, context: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await context.params;
  if (!/^\d{1,12}$/.test(hsid)) {
    return NextResponse.json({ sponsor: null }, { status: 400 });
  }
  try {
    const row = await sponsorForSchool(hsid);
    const safe = row && (/^https:\/\//i.test(row.logo_url) || row.logo_url.startsWith('/img/'));
    return NextResponse.json({
      sponsor: safe ? { name: row.name, logoUrl: row.logo_url, websiteUrl: row.website_url } : null,
    }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } });
  } catch (error) {
    // Keep microsites navigable while schema rollout or Neon failover is underway.
    console.error('[splash-sponsor] lookup unavailable', { hsid, message: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ sponsor: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
