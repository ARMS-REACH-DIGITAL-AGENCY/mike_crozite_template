// Event sign-up offers sent by text (Pete, Nov 12 2026). A fan who joins from
// an event link (utm_campaign) on that event's school site, gives a mobile
// number and checks the PROMOTIONAL texts box, gets one text with a free
// Superfan code. Texting is never a condition of joining: no box, no text.
// Add a row per event; the code must exist in PROMO_CODES (src/lib/promo.ts).

export interface EventSmsOffer {
  hsid: string;
  promoCode: string;
  /** Shown on the JOIN form above the text-message boxes. */
  formNote: string;
  /** The text. Must name YAT?STATS and say how to opt out. */
  message: string;
}

export const EVENT_SMS_OFFERS: Record<string, EventSmsOffer> = {
  golf_2026: {
    hsid: '5004',
    promoCode: 'WOODY10RINGS',
    formNote: 'Golf tournament guests: add your mobile number and check the promotional texts box, and we will text you a code for free Super Fan access all season.',
    message:
      'YAT?STATS: Thanks for joining Hamilton Baseball! Golf tournament gift: use code WOODY10RINGS for free Super Fan access all season ' +
      'and follow players from 17,000 schools. Open https://hamilton.az.yatstats.com/?join=1 and enter it under "Have a promo code?". ' +
      'Reply STOP to opt out.',
  },
};

/** The offer for a sign-up, or null. `pageUrl` is the JOIN form's full address. */
export function eventSmsOfferFor(pageUrl: string, homeHsid: string | null | undefined): EventSmsOffer | null {
  let campaign = '';
  try { campaign = new URL(pageUrl).searchParams.get('utm_campaign') || ''; } catch { return null; }
  const offer = EVENT_SMS_OFFERS[campaign.trim().toLowerCase()];
  if (!offer || String(homeHsid || '') !== offer.hsid) return null;
  return offer;
}
