import { isSponsorCardPublic, SPONSOR_CARD_LEVEL, SPONSOR_CARD_SHARE_DEFAULTS, type SponsorCardPublic } from './sponsorCardTypes';

/** Explicit projection: a public card can never carry player data or markup. */
export function readSponsorCard(value: unknown): SponsorCardPublic | null {
  if (!isSponsorCardPublic(value)) return null;
  return {
    id: value.id, sponsorId: value.sponsorId, sponsorName: value.sponsorName,
    sponsorLogoUrl: value.sponsorLogoUrl, revision: value.revision,
    firstName: value.firstName, lastName: value.lastName,
    currentTeam: value.currentTeam, organization: value.organization,
    level: SPONSOR_CARD_LEVEL, statusLabel: value.statusLabel, gradClass: value.gradClass,
    varsityYears: [...new Set(value.varsityYears)],
    frontImageUrl: value.frontImageUrl, frontImageAlt: value.frontImageAlt,
    backTemplate: value.backTemplate, bannerImageUrl: value.bannerImageUrl,
    bannerImageAlt: value.bannerImageAlt, fullImageUrl: value.fullImageUrl,
    fullImageAlt: value.fullImageAlt, headline: value.headline, body: value.body,
    ctaLabel: value.ctaLabel, ctaUrl: value.ctaUrl, schoolIds: [...new Set(value.schoolIds)],
    ...(value.hsid ? { hsid: value.hsid } : {}),
    ...(value.schoolName ? { schoolName: value.schoolName } : {}),
    ...(value.schoolColor1 ? { schoolColor1: value.schoolColor1 } : {}),
    ...(value.schoolColor2 ? { schoolColor2: value.schoolColor2 } : {}),
  };
}

export function sponsorCardCopy(card: SponsorCardPublic) {
  const share = card.backTemplate === 'share_promotion';
  return {
    headline: card.headline || (share ? SPONSOR_CARD_SHARE_DEFAULTS.headline : ''),
    body: card.body || (share ? SPONSOR_CARD_SHARE_DEFAULTS.body : ''),
    ctaLabel: card.ctaLabel || (share ? SPONSOR_CARD_SHARE_DEFAULTS.ctaLabel : ''),
    ctaUrl: card.ctaUrl || (share && card.hsid ? `https://${card.hsid}.yatstats.com/` : ''),
  };
}
