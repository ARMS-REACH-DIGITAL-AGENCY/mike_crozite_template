# GoHighLevel Integration Setup Guide

This document explains how to set up the GoHighLevel (GHL) integration with your YAT?STATS Next.js application.

## Overview

The integration allows users to:
1. Sign up and log in using Firebase Authentication
2. Automatically sync their information to your GoHighLevel agency account
3. Be tagged with their subdomain (e.g., `hamilton.az`) for easy segmentation in GHL

## Architecture

### Files Added

- **`src/lib/gohighlevel.ts`** - GoHighLevel API helper functions
- **`src/lib/firebase.ts`** - Firebase configuration helper
- **`src/app/api/auth/register/route.ts`** - Backend API endpoint for user registration
- **`src/components/AccountDrawer.tsx`** - React component for the account/auth UI
- **`.env.local.example`** - Template for environment variables

### Flow

1. User clicks the account button in the header
2. User fills out the sign-up form in the Account Drawer
3. Firebase creates the user account
4. The `AccountDrawer` component calls `/api/auth/register` with the user's email and subdomain
5. The backend API creates a contact in GoHighLevel and tags them with the subdomain
6. User is now logged in and synced to GHL

## Setup Instructions

### Step 1: Get Your Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on "Project Settings" (gear icon)
4. Under "Your apps", find your web app
5. Copy the configuration object (it will look like this):

```javascript
{
  "apiKey": "AIzaSy...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abc123def456"
}
```

### Step 2: Get Your GoHighLevel Credentials

1. Log in to your GoHighLevel agency account
2. Go to Settings → API Keys
3. Create a new API key (or use an existing one)
4. Copy the **Agency API Key**
5. Go to Sub-Accounts and find your YatStats sub-account
6. Copy the **Location ID** from the URL or settings

### Step 3: Add Environment Variables to Vercel

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add the following variables:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
GOHIGHLEVEL_AGENCY_API_KEY=your_gohighlevel_api_key
GOHIGHLEVEL_LOCATION_ID=your_yatstats_location_id
```

**Important:** Variables starting with `NEXT_PUBLIC_` are visible to the client. The GHL API key is only used server-side, so it's secure.

### Step 4: Update the Account Drawer in Your Page

In `src/app/[hsid]/page.tsx`, replace the Account Drawer placeholder with the new component:

```tsx
import AccountDrawer from '@/components/AccountDrawer';

// Inside the JSX, replace the account drawer section with:
<aside className="yat-drawer yat-drawer-right" id="drawerAccount">
  <button className="yat-icon-btn yat-close-btn" id="closeAccount"><i className="ri-close-line" /></button>
  <h3>ACCOUNT</h3>
  <AccountDrawer subdomain={subdomain} />
</aside>
```

### Step 5: Add Firebase Script to Your Layout

The Firebase authentication library needs to be loaded on the client side. You'll need to add a script to your layout or page that initializes Firebase with the configuration from environment variables.

Add this to your `src/app/layout.tsx` or `src/app/[hsid]/page.tsx`:

```tsx
<script dangerouslySetInnerHTML={{__html:`
  window.__firebase_config = ${getFirebaseConfigJSON()};
`}} />
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
      document.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user } }));
    });

    await signInAnonymously(window.auth);
  } catch (e) {
    console.error("Firebase initialization error:", e);
  }
</script>
```

## How It Works

### User Registration Flow

1. User enters email and password in the Account Drawer
2. `AccountDrawer` component calls Firebase's `createUserWithEmailAndPassword()`
3. Once Firebase user is created, it calls `/api/auth/register` with:
   - `email`: User's email
   - `firstName`: User's first name (optional)
   - `lastName`: User's last name (optional)
   - `subdomain`: The subdomain they signed up from (e.g., "hamilton.az")
4. Backend creates a contact in GoHighLevel with the subdomain as a tag
5. User is now logged in and synced to GHL

### Subdomain Extraction

The subdomain is automatically extracted from the URL:
- `hamilton.az.yatstats.com` → `hamilton.az`
- `5004.yatstats.com` → `5004`

This is handled by the middleware in `middleware.ts`, which rewrites the URL to `/{subdomain}/...`

## Testing

### Local Testing

1. Copy `.env.local.example` to `.env.local`
2. Fill in your Firebase and GoHighLevel credentials
3. Run `npm run dev`
4. Visit `http://localhost:3000/hamilton` (or any subdomain)
5. Click the account button and try signing up

### Vercel Testing

1. Add environment variables to your Vercel project
2. Deploy your changes
3. Visit your subdomain (e.g., `hamilton.az.yatstats.com`)
4. Test the sign-up flow

## Troubleshooting

### "GoHighLevel API credentials are not configured"

- Check that `GOHIGHLEVEL_AGENCY_API_KEY` and `GOHIGHLEVEL_LOCATION_ID` are set in your Vercel environment variables
- Make sure they are set for the correct environment (Production, Preview, Development)

### Firebase not initializing

- Check that all `NEXT_PUBLIC_FIREBASE_*` variables are set correctly
- Make sure the Firebase script is being loaded before the AccountDrawer component
- Check the browser console for Firebase initialization errors

### User created in Firebase but not in GoHighLevel

- Check the server logs in Vercel
- The API endpoint returns a warning if GHL sync fails, but the user is still created in Firebase
- You can manually sync users later using the `addTagToGHLContact()` function

### Subdomain not being tagged correctly

- Check that the subdomain is being passed correctly to the AccountDrawer component
- Verify that the middleware is correctly extracting the subdomain
- Check the GHL contact in your agency account to see if the tag was applied

## Next Steps

### Future Enhancements

1. **Paywall Integration**: Add Stripe integration to handle premium subscriptions
2. **Player Following**: Allow users to follow specific players and customize their experience
3. **Email Notifications**: Send welcome emails when users sign up
4. **User Profile**: Let users edit their profile and preferences
5. **Analytics**: Track user engagement and behavior

### Scaling to Other Clients

Once this is working for YatStats, you can:

1. Create a new sub-account in GoHighLevel for each client
2. Update the `GOHIGHLEVEL_LOCATION_ID` environment variable for each deployment
3. Deploy the same code to different Vercel projects or use environment-based routing
4. Each client will have their own user base and tags in GHL

## Support

For issues or questions:
1. Check the Vercel logs: `vercel logs`
2. Check the browser console for client-side errors
3. Check the GoHighLevel API documentation: https://highlevel.stoplight.io/
4. Review the Firebase documentation: https://firebase.google.com/docs
