// Shared between the fan registration form and its server-side consent evidence.
// Changes to this wording require a new disclosure version.
export const FAN_CONSENT_VERSION = 'yatstats-sms-v1-2026-10-21';

export function schoolSmsTopic(schoolName?: string | null): string {
  const value = String(schoolName || '').trim();
  return value ? value.toUpperCase() + ' BASEBALL' : 'MY HOME SCHOOL BASEBALL';
}

export function fanInformationalConsent(schoolName?: string | null): string {
  return 'I agree to receive non-marketing text messages from YAT?STATS about ' +
    schoolSmsTopic(schoolName) + ', including player and community alerts I subscribe to.';
}

export function fanPromotionalConsent(schoolName?: string | null): string {
  return 'I agree to receive promotional text messages from YAT?STATS about ' +
    schoolSmsTopic(schoolName) + ', including events, sponsorships, fundraising opportunities, and special offers.';
}

export const FAN_SMS_DISCLOSURE =
  'Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for assistance. ' +
  'Consent is optional and is not a condition of registering or purchasing. ' +
  'Privacy Policy: https://yatstats.com/privacy-policy. Terms: https://yatstats.com/terms-and-conditions.';
