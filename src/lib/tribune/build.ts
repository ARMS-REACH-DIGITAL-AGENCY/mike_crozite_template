import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { GET as rosterGET } from '@/app/api/players/[hsid]/route';
import { resolveTribunePublication } from '@/lib/partners/publication';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';
import { TRIBUNE_LAYOUT_VERSION, type TribuneEdition } from './types';
import { tribunePreferenceLinks, type TribunePeriod } from './preferences';
import { loadTribuneData, type TribuneRosterPlayer } from './tournament';
import { createTribuneStory } from './story';

export type TribuneFan = {
  firebase_uid: string; home_hsid: string; plan: string;
  subscription_status: string | null; promo_code: string | null;
  promo_expires_at: string | null; stripe_subscription_id: string | null;
};
type School = { hsname: string; hslocation: string | null; microsite_url: string | null };

export async function getTribuneFan(email: string): Promise<TribuneFan | null> {
  return (await query<TribuneFan>(
    `SELECT firebase_uid,home_hsid,plan,subscription_status,promo_code,
      promo_expires_at,stripe_subscription_id FROM public.user_profiles WHERE lower(email)=$1 LIMIT 1`,
    [email.toLowerCase()],
  )).rows[0] || null;
}

function entitledSuperfan(fan: TribuneFan): boolean {
  const status = String(fan.subscription_status || '').toLowerCase();
  return (!!fan.stripe_subscription_id && ['active', 'trialing'].includes(status)) ||
    (!!fan.promo_code && (!fan.promo_expires_at || new Date(fan.promo_expires_at) > new Date())) ||
    ['demo_comped', 'demo-comped'].includes(status) ||
    (fan.plan === 'superfan' && !fan.stripe_subscription_id && !fan.promo_code && !['cancelled', 'canceled', 'unpaid', 'past_due'].includes(status));
}

function httpsUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : undefined; } catch { return undefined; }
}
function schoolHub(hsid: string, supplied?: string | null): string {
  if (!/^\d+$/.test(hsid)) throw new Error('School identity unavailable');
  const candidate = httpsUrl(supplied);
  if (candidate) {
    const url = new URL(candidate);
    // A home-school URL must stay on a school hub, where these API routes live.
    if (url.hostname.endsWith('.yatstats.com')) { url.search = ''; url.hash = ''; return url.toString(); }
  }
  return `https://${hsid}.yatstats.com/`;
}

/** One factual edition is rendered twice; its private settings links never enter share URLs. */
export async function buildTribuneEdition(input: {
  request: NextRequest; fan: TribuneFan; period: TribunePeriod; preview: boolean;
}): Promise<{ edition: TribuneEdition; statLineCount: number }> {
  const { request, fan, period } = input;
  const school = (await query<School>(
    'SELECT hsname,hslocation,microsite_url FROM public.school_success WHERE hsid::text=$1 LIMIT 1', [fan.home_hsid],
  )).rows[0];
  if (!school?.hsname) throw new Error('School identity unavailable');
  const hub = schoolHub(fan.home_hsid, school.microsite_url);
  const rosterResponse = await rosterGET(request, { params: Promise.resolve({ hsid: fan.home_hsid }) });
  if (!rosterResponse.ok) throw new Error('Canonical fantasy roster unavailable');
  const home = await rosterResponse.json() as TribuneRosterPlayer[];
  if (!Array.isArray(home) || !home.length) throw new Error('Canonical fantasy roster empty');
  const homeIds = new Set(home.map((player) => String(player.playerid)));
  const superfan = entitledSuperfan(fan);
  const favorites = superfan ? (await query<TribuneRosterPlayer>(
    `SELECT f.playerid::text AS playerid,
      COALESCE(NULLIF(s.display_name,''),f.playerid::text) AS display_name,
      s.current_team_name,s.position,s.current_teamid,
      COALESCE(f.hsid::text,s.hsid::text) AS hsid, school.hsname AS "schoolName"
    FROM public.user_favorites f
    LEFT JOIN LATERAL (
      SELECT display_name,current_team_name,position,current_teamid,hsid
      FROM public.flip_card_front_stage WHERE playerid::text=f.playerid::text
      ORDER BY (hsid::text=f.hsid::text) DESC NULLS LAST, stage_updated_at DESC NULLS LAST LIMIT 1
    ) s ON true
    LEFT JOIN public.school_success school ON school.hsid::text=COALESCE(f.hsid::text,s.hsid::text)
    WHERE f.firebase_uid=$1 ORDER BY display_name`, [fan.firebase_uid],
  )).rows.filter((player) => !homeIds.has(String(player.playerid))) : [];
  const data = await loadTribuneData({ request, hsid: fan.home_hsid, schoolName: school.hsname, schoolUrl: hub, period, extraFavorites: favorites, home });
  const now = new Date();
  // Select dated school content once. The finished edition keeps this exact
  // masthead, note and sponsor creative for HTML, text and archived copies.
  const publication = structuredClone(await resolveTribunePublication({
    hsid: fan.home_hsid, cadence: period.cadence,
    periodStart: period.start, periodEnd: period.end, asOf: now,
  }));
  let settings: { preferences: string; unsubscribe: string } | undefined;
  try { settings = tribunePreferenceLinks(hub, fan.firebase_uid); } catch { /* Missing secret remains a send-readiness failure. */ }
  const postalAddress = publication.postalAddress?.trim() || process.env.TRIBUNE_POSTAL_ADDRESS?.trim();
  const base: Omit<TribuneEdition, 'story'> = {
    layoutVersion: TRIBUNE_LAYOUT_VERSION,
    preview: input.preview,
    dataStatus: data.dataStatus,
    generatedAt: now.toISOString(),
    school: { id: fan.home_hsid, name: school.hsname, location: school.hslocation || '', logoUrl: getSchoolCrestUrl(fan.home_hsid) },
    recipientTier: superfan ? 'superfan' : 'fan',
    period, matchup: data.matchup, homeRoster: data.homeRoster, follows: data.follows,
    masthead: publication.masthead, publisherNote: publication.publisherNote,
    sweepstakesReminder: publication.sweepstakesReminder,
    sponsor: publication.sponsor,
    links: {
      hub, tournament: hub + '#sec-fantasy', share: hub + '#sec-fantasy',
      ...settings,
      officialRules: httpsUrl(publication.officialRulesUrl) || httpsUrl(process.env.TRIBUNE_OFFICIAL_RULES_URL),
      sponsorInquiry: 'https://yatstats.com/partners/',
    },
    sender: postalAddress ? { name: 'YAT?STATS', postalAddress } : undefined,
    notices: data.notices,
  };
  return { edition: { ...base, story: await createTribuneStory(base) }, statLineCount: data.statLineCount };
}
