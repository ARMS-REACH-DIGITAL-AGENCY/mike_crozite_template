import { NextRequest } from 'next/server';
import {
  getTribunePreferences, saveTribunePreferences, verifyTribunePreferenceToken,
  type TribuneCadence, type TribuneFormat, type TribunePreferences,
} from '@/lib/tribune/preferences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function page(title: string, content: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | The YAT-A-BOY Tribune</title><style>
  body{margin:0;background:#ece8df;color:#22221e;font:17px/1.6 Georgia,serif}main{box-sizing:border-box;max-width:580px;margin:40px auto;padding:30px;background:#fffdf7;border-top:6px solid #175139}h1{font-size:34px;line-height:1.1;margin:12px 0 26px}h2{font-size:24px;line-height:1.3}p{margin:14px 0}small,.eyebrow{font:12px/1.5 Arial,sans-serif}.eyebrow{text-transform:uppercase;letter-spacing:2px}fieldset{border:0;border-top:1px solid #c7c3b8;padding:16px 0;margin:18px 0}legend{font-weight:bold;padding-right:10px}label{display:block;margin:12px 0}input{margin-right:8px}button{border:0;background:#175139;color:white;display:block;padding:14px 20px;font:bold 16px Arial,sans-serif;cursor:pointer;min-height:46px}a{color:#175139;text-underline-offset:3px}.note{font:14px/1.5 Arial,sans-serif;color:#55564d}@media(max-width:600px){main{margin:0;padding:24px 20px;min-height:100vh}}
  </style></head><body><main><p class="eyebrow">YAT?STATS • Your home-school sports page</p><h1>The YAT-A-BOY Tribune</h1><h2>${escape(title)}</h2>${content}</main></body></html>`, { status, headers });
}

function unavailable(status = 400): Response {
  return page('This settings link is unavailable', '<p>Please use the preferences link in your newest Tribune email. Settings links expire after 366 days.</p><p class="note">No subscription settings were changed.</p>', status);
}

function preferenceForm(token: string, prefs: TribunePreferences, unsubscribe: boolean): string {
  const checked = (value: boolean) => value ? ' checked' : '';
  const hidden = `<input type="hidden" name="token" value="${escape(token)}">`;
  if (unsubscribe) return `<p>Stop receiving The YAT-A-BOY Tribune? Your YAT?STATS account and player follows will stay available.</p><form method="post" action="/api/newsletter/preferences">${hidden}<input type="hidden" name="action" value="unsubscribe"><button type="submit">Confirm unsubscribe</button></form><p><a href="/api/newsletter/preferences?token=${encodeURIComponent(token)}">Keep receiving it / manage preferences</a></p>`;
  return `<p>Choose when your school’s stories and stats arrive, and how you like to read them.</p><form method="post" action="/api/newsletter/preferences">${hidden}<input type="hidden" name="action" value="save">
  <fieldset><legend>Delivery</legend><label><input type="radio" name="cadence" value="daily"${checked(prefs.cadence === 'daily')}>Daily — yesterday’s stats</label><label><input type="radio" name="cadence" value="weekly"${checked(prefs.cadence === 'weekly')}>Weekly — the completed Monday–Sunday week</label><p class="note">Daily editions are scheduled for 4:00 AM Arizona time. Weekly editions arrive Monday at 4:00 AM Arizona time.</p></fieldset>
  <fieldset><legend>Reading format</legend><label><input type="radio" name="format" value="html"${checked(prefs.format === 'html')}>The newspaper edition (HTML)</label><label><input type="radio" name="format" value="text"${checked(prefs.format === 'text')}>Plain text — the same stories and complete stats</label></fieldset>
  <fieldset><legend>Subscription</legend><label><input type="checkbox" name="subscribed" value="yes"${checked(prefs.subscribed)}>Send me The YAT-A-BOY Tribune</label></fieldset>
  <button type="submit">Save my preferences</button></form><p class="note">Changing these choices applies to future editions. It does not change your membership or your player follows.</p>`;
}

/** Email security scanners may visit this URL; GET never changes preferences. */
export async function GET(request: NextRequest): Promise<Response> {
  const token = request.nextUrl.searchParams.get('token') || '';
  const uid = verifyTribunePreferenceToken(token);
  if (!uid) return unavailable();
  try {
    const prefs = await getTribunePreferences(uid) || { cadence: 'daily', format: 'html', subscribed: false };
    const unsub = request.nextUrl.searchParams.get('action') === 'unsubscribe';
    return page(unsub ? 'Unsubscribe' : 'Make it your edition', preferenceForm(token, prefs, unsub));
  } catch {
    return page('Settings are temporarily unavailable', '<p>Please try again later. No subscription settings were changed.</p>', 503);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return unavailable(403);
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return unavailable(415);
  let form: URLSearchParams;
  try {
    const body = await request.text();
    if (body.length > 4096) return unavailable(413);
    form = new URLSearchParams(body);
  } catch { return unavailable(); }
  const token = form.get('token') || '';
  const uid = verifyTribunePreferenceToken(token);
  if (!uid) return unavailable();
  const action = form.get('action');
  if (action !== 'save' && action !== 'unsubscribe') return unavailable();
  try {
    const old = await getTribunePreferences(uid) || { cadence: 'daily', format: 'html', subscribed: false };
    let prefs: TribunePreferences;
    if (action === 'unsubscribe') prefs = { ...old, subscribed: false };
    else {
      const cadence = form.get('cadence'), format = form.get('format');
      if (!cadence || !['daily', 'weekly'].includes(cadence) || !format || !['html', 'text'].includes(format)) return unavailable();
      prefs = { cadence: cadence as TribuneCadence, format: format as TribuneFormat, subscribed: form.get('subscribed') === 'yes' };
    }
    await saveTribunePreferences(uid, prefs);
    const message = prefs.subscribed
      ? `Your ${prefs.cadence} edition will use ${prefs.format === 'text' ? 'plain text' : 'the HTML newspaper format'}.`
      : 'You are unsubscribed from The YAT-A-BOY Tribune.';
    return page('Preferences saved', `<p>${escape(message)}</p><p class="note">Your YAT?STATS account and player follows are unchanged.</p><p><a href="/api/newsletter/preferences?token=${encodeURIComponent(token)}">Review my preferences</a></p>`);
  } catch {
    return page('We could not save your preferences', '<p>Please try again later. Your requested changes have not been confirmed.</p>', 503);
  }
}
