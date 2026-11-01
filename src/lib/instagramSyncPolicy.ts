// Shared capacity policy for Meta Business Discovery. A 15-minute cron tick is
// for onboarding newly registered accounts, not re-reading every account.
export const INSTAGRAM_SYNC_ACCOUNTS_PER_RUN = 8;
export const INSTAGRAM_SYNC_REFRESH_HOURS = 6;

export function isMetaInstagramRateLimit(error: string | null | undefined): boolean {
  const message = String(error || '').toLowerCase();
  return message.includes('(#4)')
    || message.includes('application request limit')
    || message.includes('rate limit')
    || message.includes('too many requests');
}
