/** Sponsor presentation is separate from player records and fantasy rosters. */
export const SPONSOR_CARD_LEVEL = 'SPONSOR' as const;
export const SPONSOR_CARD_TEMPLATES = ['banner_text', 'share_promotion', 'full_image'] as const;
export type SponsorCardTemplate = typeof SPONSOR_CARD_TEMPLATES[number];
export const SPONSOR_CARD_STATUSES = ['ACTIVE', 'RETIRED', 'INJURED 60-DAY', 'INJURED - FULL SEASON', 'FREE AGENT', 'COACH', 'UNKNOWN'] as const;

export const SPONSOR_CARD_SHARE_DEFAULTS = {
  headline: 'Help our hometown team grow',
  body: 'Follow our school’s active alumni, share their stories and stats, and invite another fan to join the YAT?STATS community. Every new fan helps our program and the sponsors who support it.',
  ctaLabel: 'Share our community',
  ctaUrl: '',
} as const;

export type SponsorCardPublic = {
  id: string;
  sponsorId: string;
  sponsorName: string;
  sponsorLogoUrl: string;
  revision: number;
  firstName: string;
  lastName: string;
  currentTeam: string;
  organization: string;
  level: typeof SPONSOR_CARD_LEVEL;
  statusLabel: string;
  gradClass: string;
  varsityYears: string[];
  frontImageUrl: string;
  frontImageAlt: string;
  backTemplate: SponsorCardTemplate;
  bannerImageUrl: string;
  bannerImageAlt: string;
  fullImageUrl: string;
  fullImageAlt: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  schoolIds: string[];
  hsid?: string;
  schoolName?: string;
  schoolColor1?: string;
  schoolColor2?: string;
};

export type SponsorCardRecord = SponsorCardPublic & {
  status: 'draft' | 'pending' | 'published' | 'archived';
  previousId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

/** The preview frame receives data, never HTML, CSS, or executable URLs. */
export function isSponsorCardPublic(value: unknown): value is SponsorCardPublic {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const card = value as Record<string, unknown>;
  if (card.level !== SPONSOR_CARD_LEVEL || !SPONSOR_CARD_TEMPLATES.includes(card.backTemplate as SponsorCardTemplate)) return false;
  if (!Number.isInteger(card.revision) || Number(card.revision) < 1) return false;
  for (const key of ['id', 'sponsorId']) if (typeof card[key] !== 'string' || !/^[1-9][0-9]{0,17}$/.test(card[key] as string)) return false;
  const limits: Record<string, number> = {
    sponsorName: 160, firstName: 80, lastName: 80, currentTeam: 160, organization: 160,
    statusLabel: 80, gradClass: 4, frontImageAlt: 240, bannerImageAlt: 240, fullImageAlt: 240,
    headline: 120, body: 1800, ctaLabel: 60,
  };
  for (const [key, limit] of Object.entries(limits)) if (typeof card[key] !== 'string' || (card[key] as string).length > limit) return false;
  for (const key of ['sponsorLogoUrl', 'frontImageUrl', 'bannerImageUrl', 'fullImageUrl', 'ctaUrl']) {
    if (typeof card[key] !== 'string' || (card[key] as string).length > 2048) return false;
    if (!card[key]) continue;
    try {
      const url = new URL(card[key] as string);
      if (url.protocol !== 'https:' || url.username || url.password || /[\r\n]/.test(card[key] as string)) return false;
    } catch { return false; }
  }
  if (card.gradClass && !/^(19|20|21)[0-9]{2}$/.test(card.gradClass as string)) return false;
  if (!Array.isArray(card.varsityYears) || card.varsityYears.length > 8 || card.varsityYears.some(year => typeof year !== 'string' || !/^(19|20|21)[0-9]{2}$/.test(year))) return false;
  if (!Array.isArray(card.schoolIds) || card.schoolIds.length > 1000 || card.schoolIds.some(id => typeof id !== 'string' || !/^[1-9][0-9]{0,17}$/.test(id))) return false;
  if (card.hsid !== undefined && (typeof card.hsid !== 'string' || !/^[1-9][0-9]{0,17}$/.test(card.hsid))) return false;
  if (card.schoolName !== undefined && (typeof card.schoolName !== 'string' || card.schoolName.length > 200)) return false;
  for (const key of ['schoolColor1', 'schoolColor2']) if (card[key] !== undefined && (typeof card[key] !== 'string' || !/^$|^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(card[key] as string))) return false;
  return true;
}
