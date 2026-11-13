import { NextRequest, NextResponse } from 'next/server';
import { normalizeTeamLogoId, teamLogoAssetUrls, TEAM_LOGO_FALLBACK } from '@/lib/teamLogo';

export const runtime = 'nodejs';
export const maxDuration = 10;

// Public S3 artwork is probed by exact TeamID before approved SAME-CLUB
// alternatives. This route is shared by timelines, stories, cards and search.
// A missing historical logo NEVER becomes an unrelated successor logo.
async function isPublishedImage(url: string): Promise<boolean> {
  try {
    const result = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(1800),
    });
    const type = result.headers.get('content-type');
    return result.ok && (!type || type.toLowerCase().startsWith('image/'));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const { teamId: raw } = await context.params;
  const teamId = normalizeTeamLogoId(raw);
  if (!teamId) return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 });

  // Optimized WebP is almost always the first match. Missing artwork can
  // be uploaded under its OWN TeamID and becomes visible after short CDN TTL.
  const candidateYear = request.nextUrl.searchParams.get('year');
  const year = candidateYear && /^\d{4}$/.test(candidateYear) ? Number(candidateYear) : undefined;
  for (const url of teamLogoAssetUrls(teamId, year)) {
    if (await isPublishedImage(url)) {
      return NextResponse.redirect(url, {
        status: 302,
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400',
          'X-Team-Logo-Status': 'published',
        },
      });
    }
  }

  return NextResponse.redirect(new URL(TEAM_LOGO_FALLBACK, request.url), {
    status: 302,
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=300',
      'X-Team-Logo-Status': 'artwork-missing',
    },
  });
}
