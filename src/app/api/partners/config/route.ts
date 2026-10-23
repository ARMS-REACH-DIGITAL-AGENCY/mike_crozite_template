import { NextResponse } from 'next/server';
import { getFirebaseConfig } from '@/lib/firebase-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = getFirebaseConfig();
  // These are Firebase's public browser configuration fields, not credentials
  // that grant database access or publisher/sponsor permissions.
  const firebase = {
    apiKey: configured.apiKey || process.env.FIREBASE_API_KEY || '',
    authDomain: configured.authDomain || process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: configured.projectId || process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: configured.storageBucket || process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: configured.messagingSenderId || process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: configured.appId || process.env.FIREBASE_APP_ID || '',
  };
  const verificationProject = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const enabled = Boolean(firebase.apiKey && firebase.authDomain && firebase.projectId && verificationProject === firebase.projectId);
  return NextResponse.json({ firebase, enabled, authAvailable: enabled }, {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
