/**
 * Firebase Configuration
 * This file exports the Firebase configuration that will be injected into the client-side
 * authentication code. The actual credentials should be set as environment variables in Vercel.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Get the Firebase configuration from environment variables
 * These should be set in your Vercel project settings
 */
export function getFirebaseConfig(): FirebaseConfig {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  };
}

/**
 * Get the Firebase configuration as a JSON string for client-side injection
 */
export function getFirebaseConfigJSON(): string {
  return JSON.stringify(getFirebaseConfig());
}
