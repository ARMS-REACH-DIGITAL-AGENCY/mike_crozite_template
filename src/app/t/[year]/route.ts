// The short team link from a school's own subdomain root
// (hamilton.az.yatstats.com/t/2017): the school is the subdomain's.
import { teamShortLinkResponse } from '@/lib/teamYearShareMeta';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  return teamShortLinkResponse(request, null, year);
}
