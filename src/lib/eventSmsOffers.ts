// Event sign-ups and the thank-you text (Pete, Nov 12 2026).
//
// Event links (utm_campaign, e.g. the Hamilton golf tournament QR code) on
// that event's school site open the JOIN form with the event's free
// Superfan code already filled in and applied, so the Superfan button reads
// FREE. Add a row per event; the code must exist in PROMO_CODES
// (src/lib/promo.ts).
//
// Every fan who joins with a mobile number and checks a text box gets one
// thank-you text (welcomeSmsMessage). Texting is never a condition of
// joining: no box, no text.

import { schoolSmsTopic } from '@/lib/fanConsent';

export interface EventSignupOffer {
  hsid: string;
  promoCode: string;
  /** Shown on the JOIN form above the text-message boxes. */
  formNote: string;
  /** Extra line in the thank-you text for this event's sign-ups. */
  thankYouLine: string;
}

export const EVENT_SIGNUP_OFFERS: Record<string, EventSignupOffer> = {
  golf_2026: {
    hsid: '5004',
    promoCode: 'WOODY10RINGS',
    formNote: 'Golf tournament guests: your free Super Fan access is already applied. Add your mobile number and check a text box for a thank-you text and Hamilton updates.',
    thankYouLine: 'Thanks for supporting the golf tournament! Your free Super Fan code, if you need it: WOODY10RINGS.',
  },
};

function campaignOf(pageUrl: string): string {
  try { return (new URL(pageUrl).searchParams.get('utm_campaign') || '').trim().toLowerCase(); } catch { return ''; }
}

/** The event offer for a JOIN form address on a school (hsid), or null. */
export function eventSignupOfferFor(pageUrl: string, homeHsid: string | number | null | undefined): EventSignupOffer | null {
  const offer = EVENT_SIGNUP_OFFERS[campaignOf(pageUrl)];
  if (!offer || String(homeHsid ?? '') !== offer.hsid) return null;
  return offer;
}

/**
 * The one thank-you text sent right after a fan joins with SMS consent.
 * It names YAT?STATS and carries the frequency, rates, HELP and STOP
 * wording the A2P campaign requires for the first message.
 */
export function welcomeSmsMessage(schoolName: string | null | undefined, offer: EventSignupOffer | null): string {
  const topic = schoolSmsTopic(schoolName);
  const team = topic === 'MY HOME SCHOOL BASEBALL' ? 'your home school baseball community' : topic.replace(/\b([A-Z])([A-Z']*)\b/g, (_, a, b) => a + b.toLowerCase());
  return [
    `YAT?STATS: Welcome to ${team}! Thanks for joining.`,
    offer?.thankYouLine,
    'Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.',
  ].filter(Boolean).join(' ');
}
