// src/lib/fanIdentity.ts
// Who is making a Stories request.
//
// A Firebase ID token from the page (x-firebase-token header or an idToken
// form field) is checked first; failing that, the signed pass set at sign-in
// (lib/authPass.ts), which also covers a fan signed in on another
// yatstats.com site. The plain session cookie is never trusted for this.
import 'server-only';
import type { NextRequest } from 'next/server';
import { AUTH_PASS_COOKIE, readAuthPass } from './authPass';
import { verifyFirebaseIdToken } from './firebaseIdToken';

export type FanIdentity = { uid: string; email: string };

export async function identifyFan(req: NextRequest, idToken?: string | null): Promise<FanIdentity | null> {
  const token = idToken || req.headers.get('x-firebase-token') || '';
  if (token) {
    const verified = await verifyFirebaseIdToken(token);
    if (verified) return verified;
  }
  const passUid = readAuthPass(req.cookies.get(AUTH_PASS_COOKIE)?.value);
  return passUid ? { uid: passUid, email: '' } : null;
}

// For reads (which story is mine): the signed pass only.
export function viewerUid(req: NextRequest): string | null {
  return readAuthPass(req.cookies.get(AUTH_PASS_COOKIE)?.value);
}

// Likes don't need an account. A visitor who isn't signed in gets a random
// id in a cookie so their like sticks (and can be taken back); it's stored
// in the like's firebase_uid column as "anon:<id>".
export const VISITOR_COOKIE = 'yat-visitor';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function visitorId(req: NextRequest): string | null {
  const v = req.cookies.get(VISITOR_COOKIE)?.value || '';
  return UUID.test(v) ? v.toLowerCase() : null;
}

// Whose likes to show as "liked by me": the signed-in fan, else the visitor.
export function likerKey(req: NextRequest, fanUid?: string | null): string | null {
  if (fanUid) return fanUid;
  const uid = viewerUid(req);
  if (uid) return uid;
  const visitor = visitorId(req);
  return visitor ? `anon:${visitor}` : null;
}
