# Firebase Integration Notes

## Current Status

The YAT?STATS application now has the backend infrastructure for
GoHighLevel integration. However, to complete the authentication flow,
you need to:

1.  Add Firebase Script to Your Page
2.  Update the Account Drawer Component
3.  Configure Environment Variables in Vercel

------------------------------------------------------------------------

## Step-by-Step Integration

### 1. Add Firebase Initialization Script

The Firebase authentication library needs to be loaded in your Next.js
page. Add this to your `src/app/[hsid]/page.tsx` file, in the return JSX
(inside the `<>` fragment):

``` tsx
import { getFirebaseConfigJSON } from '@/lib/firebase';

// ... inside the JSX, add this script tag:

<script
  dangerouslySetInnerHTML={{
    __html: `
      window.__firebase_config = \${getFirebaseConfigJSON()};
    `
  }}
/>

<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    signInAnonymously
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

  window.firebaseAuth = {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    signInAnonymously
  };

  try {
    const firebaseConfig = JSON.parse(window.__firebase_config || '{}');
    const app = initializeApp(firebaseConfig);
    window.auth = getAuth(app);

    onAuthStateChanged(window.auth, user => {
      document.dispatchEvent(
        new CustomEvent('authStateChanged', { detail: { user } })
      );
    });

    await signInAnonymously(window.auth);
  } catch (e) {
    console.error("Firebase initialization error:", e);
  }
</script>
```

------------------------------------------------------------------------

### 2. Update the Account Drawer

Replace the placeholder Account Drawer in your `src/app/[hsid]/page.tsx`
with the new component.

------------------------------------------------------------------------

### 3. Extract Subdomain in Page Component

Ensure the subdomain is extracted and passed to `AccountDrawer`
correctly.

------------------------------------------------------------------------

### 4. Configure Environment Variables in Vercel

Add the following environment variables in Vercel:

NEXT_PUBLIC_FIREBASE_API_KEY=... NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=... GOHIGHLEVEL_AGENCY_API_KEY=...
GOHIGHLEVEL_LOCATION_ID=...