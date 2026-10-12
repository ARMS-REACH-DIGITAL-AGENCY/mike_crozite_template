// The short team link a school page shares: /5004/t/2017 (see
// lib/teamYearShareMeta.ts). Short like the Fantasy game's /g/ links, so a
// text shows the team card alone rather than a long URL above it.
import { teamShortLinkResponse } from '@/lib/teamYearShareMeta';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ hsid: string; year: string }> }) {
  const { hsid, year } = await params;
  return teamShortLinkResponse(request, hsid, year);
}
