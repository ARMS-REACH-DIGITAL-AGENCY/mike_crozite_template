# Firebase Integration Notes

## Current Status

The YAT?STATS application now has the backend infrastructure for GoHighLevel integration. However, to complete the authentication flow, you need to:

1. **Add Firebase Script to Your Page**
2. **Update the Account Drawer Component**
3. **Configure Environment Variables in Vercel**

## Step-by-Step Integration

### 1. Add Firebase Initialization Script

The Firebase authentication library needs to be loaded in your Next.js page. Add this to your `src/app/[hsid]/page.tsx` file, in the return JSX (inside the `<>` fragment):

```tsx
import { getFirebaseConfigJSON } from '@/lib/firebase';

// ... inside the JSX, add this script tag:

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

### 2. Update the Account Drawer

Replace the placeholder Account Drawer in your `src/app/[hsid]/page.tsx` with the new component:

**Before:**
```tsx
<aside className="yat-drawer yat-drawer-right" id="drawerAccount">
  <button className="yat-icon-btn yat-close-btn" id="closeAccount"><i className="ri-close-line" /></button>
  <h3>ACCOUNT</h3>
  <div className="yat-drawer-content">
    <div className="yat-placeholder-body" style={{paddingTop:"20px"}}>Sign-in and account management coming soon.</div>
  </div>
</aside>
```

**After:**
```tsx
import AccountDrawer from '@/components/AccountDrawer';

// ... in the JSX:

<aside className="yat-drawer yat-drawer-right" id="drawerAccount">
  <button className="yat-icon-btn yat-close-btn" id="closeAccount"><i className="ri-close-line" /></button>
  <h3>ACCOUNT</h3>
  <AccountDrawer subdomain={subdomain} />
</aside>
```

Note: You'll need to extract the `subdomain` from the `params` and pass it to the `AccountDrawer` component. The subdomain is already being extracted in your middleware, so you can get it from the URL path.

### 3. Extract Subdomain in Page Component

At the top of your `SchoolPage` component function, add:

```tsx
// Extract subdomain from the URL path
// The middleware rewrites SUBDOMAIN.yatstats.com to /SUBDOMAIN/...
const pathParts = new URL(request.url).pathname.split('/').filter(Boolean);
const subdomain = pathParts[0] || '';
```

Or if you have access to the host header:

```tsx
const headersList = await headers();
const host = headersList.get("host") || "";
const ROOT_DOMAIN = "yatstats.com";
const subdomainPart = host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1));
const subdomain = subdomainPart.split(".")[0] || "";
```

### 4. Configure Environment Variables in Vercel

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add these variables (get the values from your Firebase and GoHighLevel accounts):

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123def456
GOHIGHLEVEL_AGENCY_API_KEY=your_gohighlevel_api_key
GOHIGHLEVEL_LOCATION_ID=your_yatstats_location_id
```

## How the Flow Works

1. **User visits**: `hamilton.az.yatstats.com`
2. **Middleware rewrites** to: `/hamilton.az/...`
3. **Page component** extracts subdomain: `hamilton.az`
4. **AccountDrawer component** receives subdomain as prop
5. **User signs up** with email/password
6. **Firebase** creates the user account
7. **AccountDrawer** calls `/api/auth/register` with email and subdomain
8. **Backend API** creates contact in GoHighLevel with subdomain tag
9. **User is tagged** in GoHighLevel as `hamilton.az`

## Testing Checklist

- [ ] Firebase credentials are set in Vercel environment variables
- [ ] GoHighLevel API key and Location ID are set in Vercel environment variables
- [ ] Firebase script loads without errors (check browser console)
- [ ] Account button opens the Account Drawer
- [ ] Sign-up form appears in the Account Drawer
- [ ] User can create an account with email/password
- [ ] User appears in GoHighLevel with correct email
- [ ] User is tagged with the correct subdomain in GoHighLevel
- [ ] User can sign out and sign back in
- [ ] Multiple subdomains create separate users with different tags

## Troubleshooting

### Firebase not loading
- Check that `NEXT_PUBLIC_FIREBASE_*` variables are set in Vercel
- Check browser console for initialization errors
- Verify the Firebase script is included in your page

### User not appearing in GoHighLevel
- Check Vercel function logs for errors
- Verify `GOHIGHLEVEL_AGENCY_API_KEY` and `GOHIGHLEVEL_LOCATION_ID` are correct
- Check that the API endpoint is being called (use network tab in browser dev tools)

### Wrong subdomain being tagged
- Verify the subdomain extraction logic
- Check that the subdomain is being passed correctly to AccountDrawer
- Look at the GHL contact to see what tag was applied

## Files Modified

- `src/app/[hsid]/page.tsx` - Add Firebase script and update Account Drawer
- `src/lib/firebase.ts` - Already created
- `src/components/AccountDrawer.tsx` - Already created
- `src/app/api/auth/register/route.ts` - Already created
- `.env.local` (local) or Vercel environment variables - Add Firebase and GHL credentials

## Next Steps

Once this is working, you can:

1. **Add Paywall**: Integrate Stripe for premium subscriptions
2. **Player Following**: Let users follow specific players
3. **Email Notifications**: Send welcome emails
4. **User Profile**: Let users edit their preferences
5. **Analytics**: Track user engagement

See `GHL_INTEGRATION_SETUP.md` for more detailed setup instructions.
