// src/lib/sponsorFlipCards.ts
// Sponsor flip cards: a sponsor's own 5x7 card, front and back, shown inside
// a school's flip-card galleries among the alumni. A sponsor card is NOT a
// player: it never goes in the player tables, has no playerid (YAT ids are
// players only), no level and no status, so the roster syncs, level checks,
// filters, sorts, favorites and the Active Alumni count never touch it.
//
// Where it sits (Pete, Nov 2 2026):
//   Active Alumni   after the pros: between ROOKIE and INDY
//   2027 HS Team    always 2nd, after the coach
//   All-Time        2nd after any retired coaches (1st if there are none)
// SponsorCardPlacer keeps it there when the gallery scripts re-sort.

export type SponsorSection = 'active' | 'current' | 'alltime';

export type SponsorFlipCard = {
  id: string;
  sponsorName: string;
  /** Full 5x7 artwork (any size with a 5:7 ratio). */
  frontImage: string;
  backImage: string;
  frontAlt: string;
  backAlt: string;
  /** Where the back's call to action goes. Empty: the card only flips. */
  destinationUrl?: string;
  /** '*' = every school, or a list of hsids. */
  schoolIds: '*' | string[];
  sections: SponsorSection[];
  startsAt?: string;
  endsAt?: string;
};

export const sponsorFlipCards: SponsorFlipCard[] = [
  {
    id: 'payroll-impact-2026',
    sponsorName: 'Payroll Impact',
    frontImage: '/img/sponsors/payroll-impact-front.webp',
    backImage: '/img/sponsors/payroll-impact-back.webp',
    frontAlt: 'Business owners, stop leaving runners on base. Learn how your employees can score and you win too. Learn more.',
    backAlt: 'Payroll impact stats: about $600 in potential payroll savings per eligible employee per year, from $6,000 for 10 employees to $600,000 for 1,000. See if you qualify.',
    destinationUrl: '',
    schoolIds: '*',
    sections: ['active', 'current', 'alltime'],
  },
];

function isLive(card: SponsorFlipCard, now: Date) {
  return (!card.startsAt || new Date(card.startsAt) <= now) && (!card.endsAt || new Date(card.endsAt) >= now);
}

/** The sponsor cards for one school's gallery section, in list order. */
export function sponsorCardsFor(hsid: string, section: SponsorSection, now = new Date()): SponsorFlipCard[] {
  return sponsorFlipCards.filter((card) =>
    isLive(card, now)
    && card.sections.includes(section)
    && (card.schoolIds === '*' || card.schoolIds.includes(String(hsid))));
}

// Level order used by the galleries (src/lib/playerUtils.ts LEVEL_RANK):
// ROOKIE is 6, INDY 7. A sponsor card goes in front of the first card
// ranked after ROOKIE.
export const SPONSOR_AFTER_LEVEL_RANK = 6;

const isCoachStatus = (status: unknown) => /(?:^|[ -])COACH(?:$|[ -])/.test(String(status || '').trim().toUpperCase());

/**
 * Where the sponsor card goes in a section's server-rendered card list.
 * `rankOf` gives a card's level rank (Active); `statusOf` its status.
 */
export function sponsorSlot(
  section: SponsorSection,
  rows: Record<string, unknown>[],
  rankOf: (row: Record<string, unknown>) => number,
  statusOf: (row: Record<string, unknown>) => unknown,
): number {
  if (section === 'active') {
    const i = rows.findIndex((row) => rankOf(row) > SPONSOR_AFTER_LEVEL_RANK);
    return i < 0 ? rows.length : i;
  }
  if (section === 'current') return Math.min(1, rows.length);
  // All-Time: after the leading run of retired coaches.
  let coaches = 0;
  while (coaches < rows.length && isCoachStatus(statusOf(rows[coaches]))) coaches++;
  return coaches;
}
