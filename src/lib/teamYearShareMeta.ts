// src/lib/teamYearShareMeta.ts
// The link preview for a shared high school team (2017 Hamilton): title,
// "23 from the 2017 team went on to the next level. Where they YAT now?",
// and the image - the team's state-champion card when it has one, else the
// generated team card. Used by the school page's metadata (?team=2017) and
// by the short team link (/t/2017), which is what the share button sends.

import { getFlipCardFrontStageByHsid, getSchoolByHsid, getSchoolByUrl, getSchoolTeamSeasonResults } from './db';
import { teamCardShareImage } from './teamCards';
import { TEAM_YEAR_SHARE_TAGLINE, parseTeamYear, teamYearAlumni, teamYearTitle } from './teamYearShare';

export type TeamShareMeta = { title: string; description: string; image: string };

export async function teamYearShareMeta(schoolHsid: string, schoolName: string, year: string, hostBase: string): Promise<TeamShareMeta> {
  const [teamResults, stageRows] = await Promise.all([
    getSchoolTeamSeasonResults(schoolHsid).catch(() => []),
    getFlipCardFrontStageByHsid(schoolHsid).catch(() => []),
  ]);
  const result = teamResults.find((r) => String(r.seasonYear) === year) || null;
  const count = teamYearAlumni(stageRows as Record<string, unknown>[], year).length;
  const schoolShort = schoolName.replace(/\s+high\s+school$/i, '').trim();
  return {
    title: `${teamYearTitle(schoolShort, year, result)} | YAT?STATS`,
    description: `${count} from the ${year} team went on to the next level. ${TEAM_YEAR_SHARE_TAGLINE}`,
    image: teamCardShareImage(schoolHsid, year)
      || `${hostBase}/api/og/team-year?hsid=${encodeURIComponent(schoolHsid)}&year=${year}`,
  };
}

const LINK_PREVIEW_BOT = /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discord|whatsapp|telegram|linkedinbot|skypeuripreview|google-structured-data|preview/i;
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The short team link: link-preview fetchers get the team card; people are
// sent on to the school's All-Time list opened on that team.
export async function teamShortLinkResponse(request: Request, segment: string | null, rawYear: string): Promise<Response> {
  const year = parseTeamYear(rawYear);
  if (!year) return new Response('Not found', { status: 404 });

  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const hostBase = `https://${host.split(',')[0].trim()}`;
  let school: Record<string, unknown> | null = null;
  try {
    if (segment && /^\d+$/.test(segment)) school = (await getSchoolByHsid(segment)) as Record<string, unknown> | null;
    if (!school) school = (await getSchoolByUrl(hostBase)) as Record<string, unknown> | null;
  } catch {
    return new Response('Unavailable', { status: 503 });
  }
  if (!school) return new Response('Not found', { status: 404 });

  // Same address the share button used to send: the school page this link
  // was shared from, opened on that team.
  // (/5004 on previews; a subdomain's own root otherwise.)
  const schoolPath = segment && /^\d+$/.test(segment) ? `/${segment}` : '';
  const target = `${hostBase}${schoolPath}/?team=${year}#sec-alltime`;

  if (!LINK_PREVIEW_BOT.test(request.headers.get('user-agent') || '')) {
    return new Response(null, { status: 307, headers: { Location: target, 'Cache-Control': 'no-store' } });
  }

  const meta = await teamYearShareMeta(String(school.hsid), String(school.hsname || ''), year, hostBase);
  const self = `${hostBase}${url.pathname}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.title)}</title>`
    + `<meta name="description" content="${esc(meta.description)}">`
    + `<meta property="og:type" content="website"><meta property="og:site_name" content="YAT?STATS">`
    + `<meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}">`
    + `<meta property="og:url" content="${esc(self)}"><meta property="og:image" content="${esc(meta.image)}">`
    + `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`
    + `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(meta.title)}">`
    + `<meta name="twitter:description" content="${esc(meta.description)}"><meta name="twitter:image" content="${esc(meta.image)}">`
    + `</head><body><a href="${esc(target)}">${esc(meta.title)}</a></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
