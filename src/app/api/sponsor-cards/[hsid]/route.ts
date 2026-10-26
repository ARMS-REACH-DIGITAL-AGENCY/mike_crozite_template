import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getPublicSponsorCards } from '@/lib/partners/sponsorCards';

export const runtime = 'nodejs';
export const preferredRegion = 'iad1';
export const maxDuration = 30;

const cardsForSchool = unstable_cache((hsid: string) => getPublicSponsorCards(hsid),
  ['public-title-sponsor-cards-v1'], { revalidate: 30, tags: ['partner-sponsor-cards'] });

/** One cached manifest for the gallery, never one request per athlete. */
export async function GET(_request: NextRequest, context: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await context.params;
  if (!/^[1-9][0-9]{0,11}$/.test(hsid)) return NextResponse.json({ cards: [] }, { status: 400 });
  try {
    return NextResponse.json({ cards: await cardsForSchool(hsid) }, {
      headers: { 'Cache-Control': 'public, s-maxage=30', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    console.error('[sponsor-cards] public manifest unavailable', { code: (error as { code?: string })?.code || 'unavailable' });
    // A held rollout or unavailable sponsor service must not break player cards.
    return NextResponse.json({ cards: [] }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
  }
}
