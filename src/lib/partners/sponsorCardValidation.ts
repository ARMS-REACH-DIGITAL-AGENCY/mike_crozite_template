import { z } from 'zod';
import { optionalInstant, optionalLink, optionalText, partnerId, schoolIds } from './validation';
import { SPONSOR_CARD_LEVEL, SPONSOR_CARD_STATUSES, SPONSOR_CARD_TEMPLATES } from './sponsorCardTypes';

const year = z.string().regex(/^(19|20|21)[0-9]{2}$/, 'Choose a four-digit year.');

export const sponsorCardInput = z.object({
  sponsorId: partnerId,
  schoolIds,
  firstName: optionalText(80),
  lastName: optionalText(80),
  currentTeam: optionalText(160),
  organization: optionalText(160),
  // A modified browser request cannot turn a paid sponsor into a player.
  level: z.literal(SPONSOR_CARD_LEVEL).default(SPONSOR_CARD_LEVEL),
  statusLabel: z.enum(SPONSOR_CARD_STATUSES).default('ACTIVE'),
  gradClass: z.union([z.literal(''), year]).default(''),
  varsityYears: z.array(year).max(8).default([]).transform(years => [...new Set(years)].sort()),
  frontImageUrl: optionalLink,
  frontImageAlt: optionalText(240),
  backTemplate: z.enum(SPONSOR_CARD_TEMPLATES).default('banner_text'),
  bannerImageUrl: optionalLink,
  bannerImageAlt: optionalText(240),
  fullImageUrl: optionalLink,
  fullImageAlt: optionalText(240),
  headline: optionalText(120),
  body: optionalText(1800),
  ctaLabel: optionalText(60),
  ctaUrl: optionalLink,
  startsAt: optionalInstant,
  endsAt: optionalInstant,
}).superRefine((card, ctx) => {
  for (const [url, alt] of [['frontImageUrl', 'frontImageAlt'], ['bannerImageUrl', 'bannerImageAlt'], ['fullImageUrl', 'fullImageAlt']] as const) {
    if (card[url] && !card[alt]) ctx.addIssue({ code: 'custom', path: [alt], message: 'Describe this image for readers who cannot see it.' });
  }
  if (card.startsAt && card.endsAt && Date.parse(card.endsAt) <= Date.parse(card.startsAt)) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must follow start time.' });
  }
  // The community-share template can link to the selected school automatically.
  if ((card.ctaUrl && !card.ctaLabel) || (card.ctaLabel && !card.ctaUrl && card.backTemplate !== 'share_promotion')) {
    ctx.addIssue({ code: 'custom', path: ['ctaUrl'], message: 'Provide both the button text and its HTTPS destination, or leave both empty.' });
  }
});

export type SponsorCardInput = z.infer<typeof sponsorCardInput>;

export function sponsorCardReadiness(card: SponsorCardInput): string[] {
  const problems: string[] = [];
  if (!card.firstName && !card.lastName) problems.push('Add a name to the card front.');
  if (!card.frontImageUrl || !card.frontImageAlt) problems.push('Upload and describe the card-front image.');
  if (card.backTemplate === 'full_image') {
    if (!card.fullImageUrl || !card.fullImageAlt) problems.push('Upload and describe the full card-back image.');
  } else {
    if (!card.headline) problems.push('Add a headline for the card back.');
    if (!card.body) problems.push('Write the card-back message.');
  }
  return problems;
}
