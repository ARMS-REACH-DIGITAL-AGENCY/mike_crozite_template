import { SPONSOR_CARD_SHARE_DEFAULTS, type SponsorCardPublic, type SponsorCardTemplate } from './sponsorCardTypes';

/** Trusted, fictional proof data only. Never returned by the public card feed. */
export function sponsorCardExample(template: SponsorCardTemplate): SponsorCardPublic {
  const share = template === 'share_promotion';
  return {
    id: '1', sponsorId: '1', sponsorName: 'Example sponsor', revision: 1,
    sponsorLogoUrl: '/img/sponsor-card-example/banner.svg',
    firstName: 'Your', lastName: 'Name', currentTeam: 'Your business', organization: 'Your organization',
    level: 'SPONSOR', statusLabel: 'RETIRED', gradClass: '1996', varsityYears: ['1994', '1995', '1996'],
    frontImageUrl: '/img/sponsor-card-example/front.svg', frontImageAlt: 'Illustrated community supporter — fictional example',
    backTemplate: template,
    bannerImageUrl: '/img/sponsor-card-example/banner.svg', bannerImageAlt: 'Your business. Proud to be part of the home team. Example banner.',
    fullImageUrl: '/img/sponsor-card-example/full.svg', fullImageAlt: 'Fictional full-card sponsor artwork with its complete border visible',
    headline: share ? SPONSOR_CARD_SHARE_DEFAULTS.headline : 'Proud to be part of the home team.',
    body: share ? SPONSOR_CARD_SHARE_DEFAULTS.body : 'We played here. We cheered here. Now we help our alumni stay connected.\n\nYour business can share its story and support the fans who keep their hometown team close.',
    ctaLabel: share ? SPONSOR_CARD_SHARE_DEFAULTS.ctaLabel : 'Your call to action',
    // Proof links are deliberately inert. No real school or sponsor target.
    ctaUrl: '#example', schoolIds: [], schoolName: 'Example community', schoolColor1: '#17382e', schoolColor2: '#bd985b',
  };
}
