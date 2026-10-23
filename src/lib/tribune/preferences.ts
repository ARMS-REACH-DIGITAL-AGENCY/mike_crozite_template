import { createHmac, timingSafeEqual } from 'node:crypto';
import { query } from '@/lib/tribune/db';

export type TribuneCadence = 'daily' | 'weekly';
export type TribuneFormat = 'html' | 'text';
export type TribunePreferences = { cadence: TribuneCadence; format: TribuneFormat; subscribed: boolean };
export type TribunePeriod = { cadence: TribuneCadence; start: string; end: string; label: string };
const MAX_PILOT_RECIPIENTS = 7;
export type TribunePilotAudience =
  | { configured: true; emails: string[] }
  | { configured: false; emails: []; reason: 'pilot_recipients_unconfigured' | 'pilot_recipients_invalid' };

/** Private, comma-separated configuration only; no fallback recipients. */
export function parseTribunePilotEmails(value: string | undefined): TribunePilotAudience {
  if (!value?.trim()) return { configured: false, emails: [], reason: 'pilot_recipients_unconfigured' };
  const invalid: TribunePilotAudience = { configured: false, emails: [], reason: 'pilot_recipients_invalid' };
  if (value.length > MAX_PILOT_RECIPIENTS * 255) return invalid;
  const entries = value.split(',').map(email => email.trim().toLowerCase());
  if (entries.length > MAX_PILOT_RECIPIENTS) return invalid;
  for (const email of entries) {
    const [local, domain, extra] = email.split('@');
    if (extra !== undefined || !local || !domain || email.length > 254 || local.length > 64) return invalid;
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return invalid;
    const labels = domain.split('.');
    if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return invalid;
  }
  return { configured: true, emails: [...new Set(entries)] };
}

export function getTribunePilotAudience(): TribunePilotAudience {
  return parseTribunePilotEmails(process.env.TRIBUNE_PILOT_EMAILS);
}
const TOKEN_LIFETIME_SECONDS = 366 * 24 * 60 * 60;
const PURPOSE = 'tribune-preferences';
type PreferenceToken = { v: 1; purpose: typeof PURPOSE; uid: string; exp: number };

function signingSecret(): string {
  const secret = process.env.TRIBUNE_PREFERENCES_SECRET || process.env.CRON_SECRET;
  if (!secret) throw new Error('Newsletter preferences signing secret unavailable');
  return secret;
}

export function createTribunePreferenceToken(firebaseUid: string, now = Date.now()): string {
  if (!firebaseUid || firebaseUid.length > 256) throw new Error('Invalid newsletter recipient');
  const payload: PreferenceToken = { v: 1, purpose: PURPOSE, uid: firebaseUid, exp: Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', signingSecret()).update(PURPOSE + '.' + encoded).digest('base64url');
  return encoded + '.' + signature;
}

export function verifyTribunePreferenceToken(token: string, now = Date.now()): string | null {
  try {
    if (!token || token.length > 1024) return null;
    const [encoded, signature, extra] = token.split('.');
    if (extra !== undefined || !encoded || !/^[A-Za-z0-9_-]{43}$/.test(signature || '')) return null;
    const expected = createHmac('sha256', signingSecret()).update(PURPOSE + '.' + encoded).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(expected, received)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as PreferenceToken;
    const seconds = Math.floor(now / 1000);
    if (parsed.v !== 1 || parsed.purpose !== PURPOSE || typeof parsed.uid !== 'string' || !parsed.uid || parsed.uid.length > 256) return null;
    if (!Number.isSafeInteger(parsed.exp) || parsed.exp <= seconds || parsed.exp > seconds + TOKEN_LIFETIME_SECONDS) return null;
    return parsed.uid;
  } catch { return null; }
}

export function tribunePreferenceLinks(origin: string, firebaseUid: string): { preferences: string; unsubscribe: string } {
  const url = new URL('/api/newsletter/preferences', origin);
  if (url.protocol !== 'https:') throw new Error('Newsletter links require HTTPS');
  url.searchParams.set('token', createTribunePreferenceToken(firebaseUid));
  const preferences = url.toString();
  url.searchParams.set('action', 'unsubscribe');
  return { preferences, unsubscribe: url.toString() };
}

export async function getTribunePreferences(firebaseUid: string): Promise<TribunePreferences | null> {
  // Intentionally no inferred subscription: a missing row or table must not
  // silently enroll somebody. Pilot enrollment is a private operator action.
  const row = (await query<TribunePreferences>(
    'SELECT cadence, format, subscribed FROM public.alumni_newsletter_preferences WHERE firebase_uid = $1', [firebaseUid],
  )).rows[0];
  if (!row || !['daily', 'weekly'].includes(row.cadence) || !['html', 'text'].includes(row.format) || typeof row.subscribed !== 'boolean') return null;
  return row;
}

export async function saveTribunePreferences(firebaseUid: string, preferences: TribunePreferences): Promise<void> {
  if (!['daily', 'weekly'].includes(preferences.cadence) || !['html', 'text'].includes(preferences.format) || typeof preferences.subscribed !== 'boolean') throw new Error('Invalid newsletter preferences');
  await query(
    `INSERT INTO public.alumni_newsletter_preferences (firebase_uid, cadence, format, subscribed)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid) DO UPDATE SET cadence = EXCLUDED.cadence,
       format = EXCLUDED.format, subscribed = EXCLUDED.subscribed, updated_at = now()`,
    [firebaseUid, preferences.cadence, preferences.format, preferences.subscribed],
  );
}

export function phoenixDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function validReportDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function shiftDate(date: string, days: number): string {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function dateLabel(date: string): string {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

/** `reportEnd` is the completed reporting date, never the send date. */
export function tribuneReportingPeriod(cadence: TribuneCadence, reportEnd: string): TribunePeriod {
  if (!validReportDate(reportEnd)) throw new Error('Invalid newsletter reporting date');
  if (cadence === 'daily') return { cadence, start: reportEnd, end: reportEnd, label: dateLabel(reportEnd) };
  if (new Date(reportEnd + 'T12:00:00Z').getUTCDay() !== 0) throw new Error('Weekly newsletter must end on a completed Sunday');
  const start = shiftDate(reportEnd, -6);
  return { cadence, start, end: reportEnd, label: dateLabel(start) + ' – ' + dateLabel(reportEnd) };
}

/** Cron remains 4 AM Phoenix. Weekly recipients are due only on Monday. */
export function dueTribunePeriod(cadence: TribuneCadence, now = new Date()): TribunePeriod | null {
  const today = phoenixDate(now);
  const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
  if (cadence === 'weekly' && weekday !== 1) return null;
  return tribuneReportingPeriod(cadence, shiftDate(today, -1));
}
