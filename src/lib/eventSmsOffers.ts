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
  /** Shown at the top of the JOIN form on the event link. */
  formNote: string;
  /** The whole thank-you text for this event's PROMOTIONAL opt-ins (it
   *  carries an offer). Ends with SMS_DISCLOSURE. */
  thankYouText: string;
}

export const EVENT_SIGNUP_OFFERS: Record<string, EventSignupOffer> = {
  golf_2026: {
    hsid: '5004',
    promoCode: 'WOODY10RINGS',
    // Pete's wording, Nov 12 2026.
    formNote:
      'FORE!\n' +
      'Golfers & Hamilton Fans... by scanning our special QR Code, we pre-loaded your FREE Annual Super Fan Subscription already.\n' +
      'Be sure to add your mobile number, and check an approval box if you would rather receive your Hamilton News & Stats Updates through text.',
    thankYouText: [
      'Thank you for supporting the program and contributing to the 14th Annual Golf Tournament!',
      '',
      'Please accept this FREE SuperFan Promo Code.',
      '',
      'WOODY10RINGS',
      '',
      'For the next 12 months, it will allow you FULL ACCESS to all the great features on your Hamilton Alumni Baseball Online Community Hub powered by YAT?STATS! ($35.88 Value)',
      '',
      'See you online...',
      'WHERE YAT? STORIES & STATS',
      'CONNECT.  COMMIT.  REMEMBER.',
      '',
      'Enjoy. Thanks again for your continued support.',
      '',
      '- The YAT?STATS Team',
      '',
      '', // SMS_DISCLOSURE is appended below
    ].join('\n'),
  },
};

/** The event link's campaign name (utm_campaign), lower case, or ''. */
export function eventOfferCampaign(pageUrl: string): string {
  return campaignOf(pageUrl);
}

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
export const SMS_DISCLOSURE = 'Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.';

export function welcomeSmsMessage(schoolName: string | null | undefined, offer: EventSignupOffer | null): string {
  if (offer) return offer.thankYouText + SMS_DISCLOSURE;
  const topic = schoolSmsTopic(schoolName);
  const team = topic === 'MY HOME SCHOOL BASEBALL' ? 'your home school baseball community' : topic.replace(/\b([A-Z])([A-Z']*)\b/g, (_, a, b) => a + b.toLowerCase());
  return `YAT?STATS: Welcome to ${team}! Thanks for joining. ${SMS_DISCLOSURE}`;
}
