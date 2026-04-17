/**
 * Firebase Client Configuration
 * Uses the official Firebase npm SDK for reliable initialization.
 * Credentials are read from NEXT_PUBLIC_ environment variables set in Vercel.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

// Singleton: reuse existing app if already initialized
let app: FirebaseApp | null = null;
let auth: Auth | null = null;

if (typeof window !== "undefined" && firebaseConfig.apiKey) {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }
}

export {
  app,
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
};

/**
 * Legacy helpers kept for backward compatibility with server-side code
 */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export function getFirebaseConfig(): FirebaseConfig {
  return firebaseConfig;
}

export function getFirebaseConfigJSON(): string {
  return JSON.stringify(firebaseConfig);
}
