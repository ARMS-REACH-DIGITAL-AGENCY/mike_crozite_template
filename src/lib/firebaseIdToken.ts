// src/lib/firebaseIdToken.ts
// Verifies a Firebase ID token on the server without the Admin SDK.
import 'server-only';
import { createVerify } from 'crypto';

// ---------------------------------------------------------------------------
// The browser sends the ID token Firebase gave it at sign-in.
// It is a JWT signed by Google; we check the signature against Google's
// published public keys and that it was issued for this Firebase project and
// hasn't expired (Firebase's documented way to verify ID tokens without the
// Admin SDK). The session cookie alone is not proof - it is plain JSON the
// browser could edit.
// ---------------------------------------------------------------------------
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certCache: { certs: Record<string, string>; expires: number } | null = null;

async function googleCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.expires > Date.now()) return certCache.certs;
  const res = await fetch(GOOGLE_CERTS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Google certs ${res.status}`);
  const certs = (await res.json()) as Record<string, string>;
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  certCache = { certs, expires: Date.now() + maxAge * 1000 };
  return certs;
}

function base64UrlJson(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const parts = String(idToken || '').split('.');
  if (!projectId || parts.length !== 3) {
    console.error('[auth] id token check: missing project id or malformed token');
    return null;
  }
  try {
    const header = base64UrlJson(parts[0]);
    const claims = base64UrlJson(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected token header');

    const cert = (await googleCerts())[header.kid];
    if (!cert) throw new Error('unknown signing key');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    if (!verifier.verify(cert, Buffer.from(parts[2], 'base64url'))) throw new Error('bad signature');

    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== projectId) throw new Error('wrong project');
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('wrong issuer');
    if (!claims.sub || typeof claims.sub !== 'string') throw new Error('no user id');
    if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new Error('expired');
    if (typeof claims.iat !== 'number' || claims.iat > now + 60) throw new Error('issued in the future');

    return { uid: claims.sub, email: String(claims.email || '') };
  } catch (error) {
    console.error('[auth] id token check failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

