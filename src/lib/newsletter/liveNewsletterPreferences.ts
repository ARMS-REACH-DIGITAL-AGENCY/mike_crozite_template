import type { NewsletterPreferenceLoader, NewsletterPreferenceRequest, NewsletterPreferences } from './finishedPublication';

/** This endpoint has no write or delivery operations. Never send a QA/production
 * database credential or an arbitrary endpoint URL from a rehearsal. */
export const LIVE_NEWSLETTER_PREFERENCES_URL = 'https://hamilton.az.yatstats.com/api/admin/rehearsal-newsletter-preferences';
export function liveNewsletterPreferenceLoader(token: string | undefined, request: typeof fetch = fetch): NewsletterPreferenceLoader {
  if (!token || token.length < 32) throw new Error('Missing dedicated live newsletter preferences token; rehearsal cannot use copied QA favorites');
  return async (input: NewsletterPreferenceRequest): Promise<NewsletterPreferences> => {
    const response = await request(LIVE_NEWSLETTER_PREFERENCES_URL, {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ email: input.email, cadence: input.cadence, ...(input.firebaseUid ? {firebaseUid:input.firebaseUid} : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Live newsletter preferences unavailable (HTTP ' + response.status + '); no QA fallback');
    const result = await response.json();
    if (result?.source !== 'production-newsletter-preferences' || !result.preferences) throw new Error('Live newsletter preferences response was not verified');
    return result.preferences;
  };
}
