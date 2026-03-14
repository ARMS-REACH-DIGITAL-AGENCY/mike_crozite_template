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

// Firebase must only be initialized in the browser.
// Calling initializeApp / getAuth during server-side module evaluation (Next.js SSR
// pre-renders every 'use client' component on the server) causes
// "auth/invalid-api-key" to be thrown at module-load time, which crashes the
// entire SSR pass and produces a broken HTML shell with no usable JavaScript.
const isBrowser = typeof window !== "undefined";
let app: FirebaseApp;
let auth: Auth;
if (isBrowser) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
} else {
  // Server-side stubs — all real Firebase calls live inside useEffect / event
  // handlers in AccountDrawer.tsx, which only execute in the browser.
  app = {} as FirebaseApp;
  auth = {} as Auth;
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
