### 1. Add Firebase Initialization Script

The Firebase authentication library needs to be loaded in your Next.js page. Add this to your `src/app/[hsid]/page.tsx` file, in the return JSX (inside the `<>` fragment):

{% raw %}
```tsx
import { getFirebaseConfigJSON } from '@/lib/firebase';

// ... inside the JSX, add this script tag:

<script
  dangerouslySetInnerHTML={{
    __html: `
      window.__firebase_config = ${getFirebaseConfigJSON()};
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
