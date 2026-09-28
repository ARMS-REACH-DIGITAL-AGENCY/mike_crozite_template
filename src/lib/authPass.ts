// src/lib/authPass.ts
// A signed "who is signed in" pass, set by /api/auth/login only after it has
// verified the fan's Firebase ID token.
//
// Why: the site's session cookie (yat-platform-session) is shared across
// every *.yatstats.com microsite, but Firebase keeps its own sign-in per
// site address. A fan signed in on one school's site shows as signed in on
// another, yet has no Firebase user there - so anything that needs proof of
// identity (posting a story) couldn't get it. The session cookie itself is
// plain JSON the browser could edit, so it can't be that proof; this pass
// is signed with a server-only key, so it can.
import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const AUTH_PASS_COOKIE = 'yat-auth-pass';
export const AUTH_PASS_MAX_AGE = 60 * 60 * 24 * 30;

// A dedicated YATSTATS_SESSION_SECRET if one is set; otherwise a key derived
// (one-way, purpose-labelled) from an existing server-only secret.
function signingKey(): Buffer | null {
  const own = process.env.YATSTATS_SESSION_SECRET;
  if (own) return createHash('sha256').update(own).digest();
  const base = process.env.CRON_SECRET || process.env.ADMIN_INGEST_SECRET;
  if (!base) return null;
  return createHmac('sha256', base).update('yatstats-auth-pass-v1').digest();
}

function sign(payload: string, key: Buffer) {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

// "v1.<uid>.<expires>.<signature>" - null when no signing key is configured.
export function createAuthPass(uid: string, maxAgeSeconds = AUTH_PASS_MAX_AGE): string | null {
  const key = signingKey();
  if (!key || !uid) return null;
  const payload = `v1.${Buffer.from(uid).toString('base64url')}.${Math.floor(Date.now() / 1000) + maxAgeSeconds}`;
  return `${payload}.${sign(payload, key)}`;
}

// The uid the pass was issued to, or null if it's missing, forged or expired.
export function readAuthPass(value: string | null | undefined): string | null {
  const key = signingKey();
  const parts = String(value || '').split('.');
  if (!key || parts.length !== 4 || parts[0] !== 'v1') return null;
  const payload = parts.slice(0, 3).join('.');
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(parts[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(parts[2]) < Math.floor(Date.now() / 1000)) return null;
  const uid = Buffer.from(parts[1], 'base64url').toString('utf8');
  return uid || null;
}
