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

// For reads (which story is mine, what have I liked): the signed pass only.
export function viewerUid(req: NextRequest): string | null {
  return readAuthPass(req.cookies.get(AUTH_PASS_COOKIE)?.value);
}
