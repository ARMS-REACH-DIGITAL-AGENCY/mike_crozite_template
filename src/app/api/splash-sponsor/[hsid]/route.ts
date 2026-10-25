import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const preferredRegion = 'iad1';

// Keep database work cached; select the displayed brand PER request so
// unrelated fans do not all receive the same logo from an edge-cached response.
type SponsorRow = {
  id: string;
  name: string;
  logo_url: string;
  website_url: string | null;
  priority: number;
};
const eligibleSponsorPool = unstable_cache(async (hsid: string): Promise<SponsorRow[]> => {
  const { rows } = await query<SponsorRow>(`
    SELECT b.id::text AS id, b.name, b.logo_url, b.website_url, s.priority
    FROM public.school_splash_sponsorships s
    JOIN public.sponsor_brands b ON b.id = s.sponsor_id
    WHERE s.hsid = $1 AND s.status = 'active' AND b.is_active = true
      AND s.starts_at <= now() AND (s.ends_at IS NULL OR s.ends_at > now())
      AND (s.sponsor_order_id IS NULL OR EXISTS (
        SELECT 1 FROM public.sponsor_orders o WHERE o.id = s.sponsor_order_id
          AND lower(o.status) IN ('paid','active','completed','succeeded')
      ))
    ORDER BY s.priority DESC, s.starts_at DESC, s.id DESC
    LIMIT 256
  `, [hsid]);
  return rows;
}, ['splash-sponsor-rotation-v1'], { revalidate: 120 });

export function selectSplashSponsor(rows: SponsorRow[], random = Math.random): SponsorRow | null {
  // Priority is an entitlement tier, NOT a preference for oldest/latest brand.
  // Equal-priority sponsor assignments receive an equal share of new splashes.
  const valid = rows.filter((row) => {
    const url = row.logo_url;
    return typeof url === 'string' && (/^https:\/\//i.test(url) || url.startsWith('/img/'));
  });
  if (!valid.length) return null;
  const highest = Math.max(...valid.map((row) => Number(row.priority)));
  const seen = new Set<string>();
  const pool = valid.filter((row) => {
    if (Number(row.priority) !== highest || seen.has(String(row.id))) return false;
    seen.add(String(row.id));
    return true;
  });
  return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length))] || null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await context.params;
  if (!/^\d{1,12}$/.test(hsid)) {
    return NextResponse.json({ sponsor: null }, { status: 400 });
  }
  try {
    const row = selectSplashSponsor(await eligibleSponsorPool(hsid));
    return NextResponse.json({
      sponsor: row ? { name: row.name, logoUrl: row.logo_url, websiteUrl: row.website_url } : null,
    }, {
      // Do not cache a random selection. Database eligibility is already
      // revalidated at most once per school per two minutes on the server.
      headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' },
    });
  } catch (error) {
    console.error('[splash-sponsor] lookup unavailable', {
      hsid, message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ sponsor: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
