import type { NewsletterPreferenceLoader, NewsletterPreferenceRequest, NewsletterPreferences } from './finishedPublication';
import type { NewsletterRecipientEntry } from './recipientDirectory';

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
    const result = await response.json().catch(()=>null);
    if (!response.ok) {
      const code=typeof result?.error==='string' && /^[a-z_]{1,64}$/.test(result.error)?result.error:'unavailable';
      throw new Error('Live newsletter preferences unavailable (HTTP ' + response.status + ', '+code+'); no QA fallback');
    }
    if (result?.source !== 'production-newsletter-preferences' || !result.preferences) throw new Error('Live newsletter preferences response was not verified');
    return result.preferences;
  };
}

/** Read the live 4 a.m. recipient directory. No QA fallback. */
export async function readLiveNewsletterDirectory(token: string | undefined, request: typeof fetch=fetch):Promise<NewsletterRecipientEntry[]> {
  if(!token || token.length<32) throw new Error('Missing dedicated live newsletter preferences token');
  const response=await request(LIVE_NEWSLETTER_PREFERENCES_URL,{method:'POST',redirect:'error',cache:'no-store',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({action:'list-recipients'}),signal:AbortSignal.timeout(15000)});
  const body=await response.json().catch(()=>null);
  if(!response.ok) {
    const code=typeof body?.error==='string' && /^[a-z_]{1,64}$/.test(body.error)?body.error:'unavailable';
    throw new Error('Live recipient directory HTTP '+response.status+' ('+code+'); no QA fallback');
  }
  if(body?.source!=='production-newsletter-preferences'||!Array.isArray(body.recipients)) throw new Error('Unverified live recipient directory');
  const seen=new Set<string>();
  for(const row of body.recipients) {
    if(typeof row?.email!=='string'||!row.email||row.email!==row.email.trim().toLowerCase()||seen.has(row.email)||
      !Array.isArray(row.homeHsids)||row.homeHsids.some((id:unknown)=>typeof id!=='number'||!Number.isSafeInteger(id)||id<=0))
      throw new Error('Invalid live recipient directory');
    seen.add(row.email);
  }
  return body.recipients;
}
