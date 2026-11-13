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
  for (const url of teamLogoAssetUrls(teamId)) {
    if (await isPublishedImage(url)) {
      // A freshly approved logo may replace a previously cached crest or image.
      // Preserve only the validated revision token so the browser and S3 both
      // fetch the newly published bytes, never their old cached variant.
      const revision = request.nextUrl.searchParams.get('rev');
      const destination = new URL(url);
      if (revision && /^[A-Za-z0-9-]{1,60}$/.test(revision)) {
        destination.searchParams.set('rev', revision);
      }
      return NextResponse.redirect(destination, {
        status: 302,
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
          'X-Team-Logo-Status': 'published',
        },
      });
    }
  }

  return NextResponse.redirect(new URL(TEAM_LOGO_FALLBACK, request.url), {
    status: 302,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Team-Logo-Status': 'artwork-missing',
    },
  });
}
