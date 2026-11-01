import 'server-only';
import { query } from './db';
import { getGHLApiKey, getGHLLocationId, findOrCreateGhlContact, sendGHLEmail } from './gohighlevel';
import { resolveSchoolNewsOrigins } from './schoolNewsLinks';

// Central, school-independent reviewer destinations. These are administrative
// transaction alerts, not opt-in marketing subscriptions.
// alumni@yatstats.com is a GoDaddy alias of pete@yatstats.com; no second mailbox needed.
const REVIEW_EMAIL = 'alumni@yatstats.com';
// Send only from the A2P-registered ARMS number to the owner's personal cell.
// The Google Voice line is neither the sender nor the recipient for these alerts.
const REVIEW_FROM_NUMBER = '+19289282228';
const REVIEW_TO_NUMBER = '+14806282588';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => (
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string,string>)[char]
));

export async function whereYatReviewUrl(hsid: string, submissionId: number): Promise<string | null> {
  const origins = await resolveSchoolNewsOrigins([hsid], query);
  const origin = origins.get(hsid);
  if (!origin || !Number.isSafeInteger(submissionId) || submissionId <= 0) return null;
  const url = new URL('/contribute-review', origin);
  url.searchParams.set('alumni', String(submissionId));
  return url.toString();
}

async function lookupSmsContact(): Promise<string | null> {
  const key = getGHLApiKey();
  const locationId = getGHLLocationId();
  if (!key || !locationId) return null;
  const url = new URL('https://services.leadconnectorhq.com/contacts/search/duplicate');
  url.searchParams.set('locationId', locationId);
  url.searchParams.set('number', REVIEW_TO_NUMBER);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + key, Version: '2021-07-28' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error('[where-yat-alert] SMS contact lookup failed:', response.status);
      return null;
    }
    const data = await response.json() as {contact?: {id?: string; phone?: string; dnd?: boolean; dndSettings?: {SMS?: {status?: string}}}};
    const contact = data.contact;
    // Never route a private review notification to a different contact.
    if (!contact?.id || String(contact.phone || '').replace(/\D/g,'') !== REVIEW_TO_NUMBER.replace(/\D/g,'')) return null;
    if (contact.dnd || contact.dndSettings?.SMS?.status === 'active') {
      console.warn('[where-yat-alert] SMS contact has Do Not Disturb enabled');
      return null;
    }
    return contact.id;
  } catch (error) {
    console.error('[where-yat-alert] SMS lookup unavailable', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

async function sendSms(contactId: string, message: string): Promise<boolean> {
  const key = getGHLApiKey();
  if (!key) return false;
  try {
    const response = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + key, Version: '2021-04-15' },
      body: JSON.stringify({ type: 'SMS', contactId, fromNumber: REVIEW_FROM_NUMBER, toNumber: REVIEW_TO_NUMBER, message }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) console.error('[where-yat-alert] SMS not queued', response.status, (await response.text()).slice(0,220));
    return response.ok;
  } catch (error) {
    console.error('[where-yat-alert] SMS send failed', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}

export async function notifyWhereYatReviewers(info: {
  id: number; hsid: string; playerId: string; displayName: string;
  sendEmail?: boolean; sendSms?: boolean;
}): Promise<{ emailQueued: boolean; smsQueued: boolean }> {
  // Preview environments can share the production database. Never generate
  // live admin messages containing a preview-only approval route.
  if (process.env.VERCEL_ENV !== 'production') {
    return { emailQueued: false, smsQueued: false };
  }
  const link = await whereYatReviewUrl(info.hsid, info.id).catch(() => null);
  if (!link) {
    console.error('[where-yat-alert] No canonical review URL for school', info.hsid);
    return { emailQueued: false, smsQueued: false };
  }
  const { rows } = await query<{hsname: string}>(
    'SELECT hsname FROM public.school_success WHERE hsid::text=$1 LIMIT 1', [info.hsid]
  );
  const school = rows[0]?.hsname || ('School ' + info.hsid);
  const subject = 'YAT?STATS | Where YAT Now? review #' + info.id;
  const html = '<p>A retired-alumni update is waiting for your review.</p>' +
    '<p><b>Alumnus:</b> ' + escapeHtml(info.displayName) + '<br>' +
    '<b>School:</b> ' + escapeHtml(school) + '<br>' +
    '<b>Submission:</b> #' + info.id + '</p>' +
    '<p><a href="' + escapeHtml(link) + '">Preview and review this submission</a></p>' +
    '<p>Sign in as an authorized YAT?STATS reviewer to approve or reject it. No action is taken from the link alone.</p>';
  const sms = 'YAT?STATS review #' + info.id + ': ' + info.displayName + ' (' + school + '). Preview / approve after sign-in: ' + link;
  const [emailQueued, smsQueued] = await Promise.all([
    (async () => {
      if(info.sendEmail===false)return false;
      const contact = await findOrCreateGhlContact(REVIEW_EMAIL, 'YAT?STATS', 'Alumni Review');
      return contact ? sendGHLEmail(contact, subject, html) : false;
    })().catch(() => false),
    (async () => {
      if(info.sendSms===false)return false;
      const contact = await lookupSmsContact();
      return contact ? sendSms(contact, sms) : false;
    })().catch(() => false),
  ]);
  // Low-PII operational audit. This does not store the admin phone or email.
  await query(
    "INSERT INTO public.fan_activity (firebase_uid, action, playerid, hsid, details) VALUES ('system:where-yat-review-alert', 'where_yat_notification', $1, $2, $3::jsonb)",
    [info.playerId, info.hsid, JSON.stringify({ submissionId: info.id, emailQueued, smsQueued })]
  ).catch(err => console.error('[where-yat-alert] audit failed', err));
  if (!emailQueued || !smsQueued) console.warn('[where-yat-alert] Incomplete delivery', { id: info.id, emailQueued, smsQueued });
  return { emailQueued, smsQueued };
}
