'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from '@/lib/firebase';
import type { User } from 'firebase/auth';
import { track } from '@/lib/analytics';
import ContributeShortcuts from '@/components/yatstats/ContributeShortcuts';

interface AccountDrawerProps {
  subdomain: string;
  initialTab?: 'signin' | 'register';
}

type SessionUser = {
  uid: string;
  email: string;
  contactId?: string | null;
  firstName?: string | null;
  homeHsid?: string | null;
  homeSchoolName?: string | null;
  homeSchoolLocation?: string | null;
  homeMicrositeUrl?: string | null;
  role?: string | null;
  plan?: string | null;
  isSuperfan?: boolean;
};

function PasswordInput({
  name,
  required = true,
  placeholder = 'Password',
}: {
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type={visible ? 'text' : 'password'}
        name={name}
        required={required}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 40px 10px 12px',
          borderRadius: '8px',
          border: '1px solid var(--line)',
          background: 'rgba(255, 255, 255, .06)',
          color: 'var(--ink)',
          fontSize: '13px',
        }}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          color: 'var(--muted)',
          cursor: 'pointer',
          padding: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          lineHeight: 1,
        }}
      >
        <i className={visible ? 'ri-eye-off-line' : 'ri-eye-line'} />
      </button>
    </div>
  );
}

function normalizeMicrositeUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return raw.replace(/\/+$/, '');
}

function buildMicrositeUrl(
  homeHsid?: string | null,
  homeSchoolName?: string | null,
  homeSchoolLocation?: string | null,
  canonicalMicrositeUrl?: string | null
) {
  const canonicalUrl = normalizeMicrositeUrl(canonicalMicrositeUrl);
  if (canonicalUrl) return canonicalUrl;
  if (!homeHsid) return null;

  const slugifySchoolName = (name: string) =>
    String(name || '')
      .toLowerCase()
      .trim()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const normalizeState = (state: string) => String(state || '').toLowerCase().trim();

  const schoolSlug = slugifySchoolName(homeSchoolName || '');
  const statePart = String(homeSchoolLocation || '').split(',')[1] || '';
  const stateSlug = normalizeState(statePart);

  if (schoolSlug && stateSlug) {
    return `https://${schoolSlug}.${stateSlug}.yatstats.com/${homeHsid}`;
  }

  return `https://yatstats.com/${homeHsid}`;
}

export default function AccountDrawerContent({ subdomain, initialTab }: AccountDrawerProps) {
  const MSG_COLOR: Record<'error' | 'success' | 'info', string> = {
    error: '#dc2626',
    success: '#16a34a',
    info: 'var(--muted)',
  };

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | 'info'>('info');
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>(initialTab ?? 'register');
  const [displayName, setDisplayName] = useState('');
  const [signInEmail, setSignInEmail] = useState('');
  const [favConfirm, setFavConfirm] = useState('');
  const [superfanLaunching, setSuperfanLaunching] = useState(false);
  const [isSuperfan, setIsSuperfan] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);

  const effectiveEmail = firebaseUser?.email || sessionUser?.email || '';
  const effectiveUid = firebaseUser?.uid || sessionUser?.uid || '';
  const isAuthenticated = Boolean(firebaseUser || sessionUser);

  const persistLocalUser = ({
    uid,
    email,
    contactId,
    firstName,
    homeHsid,
    homeSchoolName,
    homeSchoolLocation,
    role,
    plan,
    homeMicrositeUrl: canonicalHomeMicrositeUrl,
  }: {
    uid: string;
    email: string;
    contactId?: string | null;
    firstName?: string | null;
    homeHsid?: string | null;
    homeSchoolName?: string | null;
    homeSchoolLocation?: string | null;
    homeMicrositeUrl?: string | null;
    role?: string | null;
    plan?: string | null;
  }) => {
    const homeMicrositeUrl = buildMicrositeUrl(
      homeHsid,
      homeSchoolName,
      homeSchoolLocation,
      canonicalHomeMicrositeUrl
    );

    const nextSessionUser: SessionUser = {
      uid,
      email,
      contactId: contactId ?? null,
      firstName: firstName ?? null,
      homeHsid: homeHsid ?? null,
      homeSchoolName: homeSchoolName ?? null,
      homeSchoolLocation: homeSchoolLocation ?? null,
      homeMicrositeUrl,
      role: role ?? 'fan',
      plan: plan ?? 'fan',
      isSuperfan: (plan ?? 'fan') === 'superfan',
    };

    try {
      if (firstName) {
        localStorage.setItem(`yat_firstName_${uid}`, firstName);
      }

      localStorage.setItem(
        'yat-user',
        JSON.stringify({
          uid,
          contactId: contactId ?? null,
          email,
          firstName: firstName ?? null,
          homeHsid: homeHsid ?? null,
          homeSchoolName: homeSchoolName ?? null,
          homeSchoolLocation: homeSchoolLocation ?? null,
          homeMicrositeUrl,
          role: role ?? 'fan',
        })
      );

      localStorage.setItem('yat-plan', plan ?? 'fan');
    } catch {}

    setSessionUser(nextSessionUser);

    window.dispatchEvent(
      new CustomEvent('yat-auth-success', {
        detail: {
          uid,
          contactId: contactId ?? null,
          homeHsid: homeHsid ?? null,
          homeSchoolName: homeSchoolName ?? null,
          homeSchoolLocation: homeSchoolLocation ?? null,
          homeMicrositeUrl,
          role: role ?? 'fan',
          plan: plan ?? 'fan',
        },
      })
    );
  };

  useEffect(() => {
    const handleTabSwitch = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail;
      if (tab === 'signin' || tab === 'register') setActiveTab(tab);
    };

    window.addEventListener('yat:acct-tab', handleTabSwitch);
    return () => window.removeEventListener('yat:acct-tab', handleTabSwitch);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreFromServerSession = async () => {
      try {
        const res = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        const data = await res.json();

        if (cancelled) return;

        if (data?.authenticated && data?.session?.uid) {
          const s = data.session as SessionUser;

          setSessionUser({
            uid: s.uid,
            email: s.email,
            contactId: s.contactId ?? null,
            firstName: s.firstName ?? null,
            homeHsid: s.homeHsid ?? null,
            homeSchoolName: s.homeSchoolName ?? null,
            homeSchoolLocation: s.homeSchoolLocation ?? null,
            homeMicrositeUrl: buildMicrositeUrl(
              s.homeHsid,
              s.homeSchoolName,
              s.homeSchoolLocation,
              s.homeMicrositeUrl
            ),
            role: s.role ?? 'fan',
            plan: s.plan ?? 'fan',
            isSuperfan: s.isSuperfan ?? s.plan === 'superfan',
          });

          setDisplayName(s.firstName || '');
          setIsSuperfan(Boolean(s.isSuperfan || s.plan === 'superfan'));

          try {
            localStorage.setItem(
              'yat-user',
              JSON.stringify({
                uid: s.uid,
                contactId: s.contactId ?? null,
                email: s.email,
                firstName: s.firstName ?? null,
                homeHsid: s.homeHsid ?? null,
                homeSchoolName: s.homeSchoolName ?? null,
                homeSchoolLocation: s.homeSchoolLocation ?? null,
                homeMicrositeUrl: buildMicrositeUrl(
                  s.homeHsid,
                  s.homeSchoolName,
                  s.homeSchoolLocation,
                  s.homeMicrositeUrl
                ),
                role: s.role ?? 'fan',
              })
            );
            localStorage.setItem('yat-plan', s.plan ?? 'fan');
            if (s.firstName) {
              localStorage.setItem(`yat_firstName_${s.uid}`, s.firstName);
            }
          } catch {}

          window.dispatchEvent(
            new CustomEvent('yat-auth-success', {
              detail: {
                uid: s.uid,
                contactId: s.contactId ?? null,
                homeHsid: s.homeHsid ?? null,
                homeSchoolName: s.homeSchoolName ?? null,
                homeSchoolLocation: s.homeSchoolLocation ?? null,
                homeMicrositeUrl: buildMicrositeUrl(
                  s.homeHsid,
                  s.homeSchoolName,
                  s.homeSchoolLocation,
                  s.homeMicrositeUrl
                ),
                role: s.role ?? 'fan',
                plan: s.plan ?? 'fan',
              },
            })
          );
        } else {
          setSessionUser(null);
        }
      } catch {
        setSessionUser(null);
      }
    };

    if (!auth) {
      restoreFromServerSession();
      return () => {};
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (cancelled) return;

      setFirebaseUser(currentUser);

      if (!currentUser) {
        await restoreFromServerSession();
        return;
      }

      const uid = currentUser.uid;
      const email = currentUser.email || '';

      try {
        const storedName = localStorage.getItem(`yat_firstName_${uid}`);
        setDisplayName(currentUser.displayName || storedName || '');
        setIsSuperfan(localStorage.getItem('yat-plan') === 'superfan');
      } catch {}

      try {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid,
            email,
            currentHsid: subdomain,
            idToken: await currentUser.getIdToken().catch(() => undefined),
          }),
        });

        const loginData = await loginRes.json();

        const firstName =
          loginData?.firstName ||
          currentUser.displayName ||
          localStorage.getItem(`yat_firstName_${uid}`) ||
          '';

        const homeHsid = loginData?.homeHsid ?? null;
        const homeSchoolName = loginData?.homeSchoolName ?? null;
        const homeSchoolLocation = loginData?.homeSchoolLocation ?? null;
        const plan = loginData?.plan ?? 'fan';
        const superfan = loginData?.isSuperfan || plan === 'superfan';

        setDisplayName(firstName);
        setIsSuperfan(superfan);

        persistLocalUser({
          uid,
          email,
          contactId: loginData?.contactId ?? null,
          firstName,
          homeHsid,
          homeSchoolName,
          homeSchoolLocation,
          homeMicrositeUrl: loginData?.homeMicrositeUrl ?? null,
          role: loginData?.role ?? 'fan',
          plan,
        });
      } catch (err) {
        console.error('Auth rehydrate failed:', err);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [subdomain]);

  const resumePendingFavorite = async (firebaseUid: string, contactId?: string | null) => {
    const pid = sessionStorage.getItem('pending_fav_pid');
    const pName = sessionStorage.getItem('pending_fav_name') || pid || '';
    // The favorited player's OWN school, not the page the fan happened to be
    // browsing when they clicked favorite - those only ever matched by
    // construction on a profile page (its hsid IS the player's own), but the
    // global search result list lets a Superfan favorite a player from a
    // different school than the one currently open, so subdomain alone is
    // wrong there.
    const pHsid = sessionStorage.getItem('pending_fav_hsid') || subdomain;
    if (!pid || !firebaseUid) return;

    sessionStorage.removeItem('pending_fav_pid');
    sessionStorage.removeItem('pending_fav_name');
    sessionStorage.removeItem('pending_fav_hsid');

    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid,
          contactId,
          playerId: pid,
          playerName: pName,
          schoolId: pHsid,
          type: 'fan',
        }),
      });

      const data = await res.json();

      if (data && data.success) {
        setFavConfirm(pName);
        window.dispatchEvent(
          new CustomEvent('yat-auth-success', { detail: { contactId, playerId: pid } })
        );
      }
    } catch {}
  };

  const launchSuperfanCheckout = async (firebaseUid: string, email: string) => {
    setSuperfanLaunching(true);
    setMessage('Launching Superfan checkout…');
    setMessageType('info');

    try {
      const res = await fetch('/api/stripe/create-superfan-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseUid, email }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }

      setMessage(
        data?.message || data?.error || 'Could not start checkout. Please try again.'
      );
      setMessageType('error');
      setSuperfanLaunching(false);
    } catch {
      setMessage('Network error starting checkout. Please try again.');
      setMessageType('error');
      setSuperfanLaunching(false);
    }
  };

  const redeemPromo = async () => {
    const code = promoCode.trim();
    if (!code || !effectiveUid) return;
    setPromoBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/promo/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseUid: effectiveUid, email: effectiveEmail, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setIsSuperfan(true);
        setPromoOpen(false);
        setPromoCode('');
        try {
          localStorage.setItem('yat-plan', 'superfan');
        } catch {}
        setMessage('Promo applied — welcome, Superfan!');
        setMessageType('success');
      } else {
        setMessage(data?.error || 'Could not apply the promo code.');
        setMessageType('error');
      }
    } catch {
      setMessage('Network error applying the promo code. Please try again.');
      setMessageType('error');
    } finally {
      setPromoBusy(false);
    }
  };

  const resumePendingSuperfan = async (firebaseUid: string, email: string) => {
    const pending = sessionStorage.getItem('pending_superfan');
    if (!pending) return;

    sessionStorage.removeItem('pending_superfan');
    await launchSuperfanCheckout(firebaseUid, email);
  };

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const email = (e.currentTarget.elements.namedItem('signInEmail') as HTMLInputElement).value;
      const password = (e.currentTarget.elements.namedItem('signInPassword') as HTMLInputElement)
        .value;

      if (!auth) throw new Error('Firebase auth not initialized');
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      track('login', { method: 'email' });

      try {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, email, currentHsid: subdomain, idToken: await cred.user.getIdToken().catch(() => undefined) }),
        });

        const loginData = await loginRes.json();

        const firstName =
          loginData?.firstName ||
          cred.user.displayName ||
          localStorage.getItem(`yat_firstName_${uid}`) ||
          '';

        const homeHsid = loginData?.homeHsid ?? null;
        const homeSchoolName = loginData?.homeSchoolName ?? null;
        const homeSchoolLocation = loginData?.homeSchoolLocation ?? null;
        const plan = loginData?.plan ?? 'fan';
        const superfan = loginData?.isSuperfan || plan === 'superfan';

        if (firstName) {
          setDisplayName(firstName);
        }

        setIsSuperfan(superfan);

        persistLocalUser({
          uid,
          email,
          contactId: loginData?.contactId ?? null,
          firstName: firstName || null,
          homeHsid,
          homeSchoolName,
          homeSchoolLocation,
          homeMicrositeUrl: loginData?.homeMicrositeUrl ?? null,
          role: loginData?.role ?? 'fan',
          plan,
        });

        if (sessionStorage.getItem('pending_fav_pid')) {
          await resumePendingFavorite(uid, loginData?.contactId);
        } else if (sessionStorage.getItem('pending_superfan')) {
          await resumePendingSuperfan(uid, email);
          return;
        }
      } catch {}

      setMessage('Sign in successful!');
      setMessageType('success');
      setTimeout(() => setMessage(''), 1500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed');
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const email = (e.currentTarget.elements.namedItem('registerEmail') as HTMLInputElement).value;
      const password = (e.currentTarget.elements.namedItem('registerPassword') as HTMLInputElement)
        .value;
      const firstName =
        (e.currentTarget.elements.namedItem('registerFirstName') as HTMLInputElement)?.value?.trim() ||
        '';
      const lastName =
        (e.currentTarget.elements.namedItem('registerLastName') as HTMLInputElement)?.value?.trim() ||
        '';

      if (!firstName || !lastName) {
        setMessage('First name and last name are required.');
        setMessageType('error');
        setIsLoading(false);
        return;
      }

      if (!auth) throw new Error('Firebase auth not initialized');
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      track('sign_up', { method: 'email' });

      if (auth.currentUser) {
        try {
          localStorage.setItem(`yat_firstName_${auth.currentUser.uid}`, firstName);
        } catch {}
        setDisplayName(firstName);
      }

      const registerResponse = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          email,
          firstName,
          lastName,
          subdomain,
        }),
      });

      const regData = await registerResponse.json();

      if (!registerResponse.ok) {
        const err = new Error(regData?.error || 'Failed to sync to CRM') as Error & {
          isEmailTaken?: boolean;
        };
        if (registerResponse.status === 409) err.isEmailTaken = true;
        throw err;
      }

      const homeHsid = regData?.homeHsid ?? subdomain ?? null;
      const homeSchoolName = regData?.homeSchoolName ?? null;
      const homeSchoolLocation = regData?.homeSchoolLocation ?? null;
      const plan = regData?.plan ?? 'fan';
      const superfan = regData?.isSuperfan || plan === 'superfan';

      setIsSuperfan(superfan);

      persistLocalUser({
        uid,
        email,
        contactId: regData?.contactId ?? null,
        firstName: firstName || null,
        homeHsid,
        homeSchoolName,
        homeSchoolLocation,
        homeMicrositeUrl: regData?.homeMicrositeUrl ?? null,
        role: 'fan',
        plan,
      });

      // Promo code entered on the join form? The Superfan CTA sets
      // pending_superfan; the Fan CTA clears it. A code typed with the Fan
      // button is ignored (normal Fan signup). With the Superfan button, a
      // valid code grants free Superfan immediately (no Stripe). An invalid
      // or failed code stops here with an error — it must never fall through
      // to Stripe checkout.
      const enteredPromo = promoCode.trim();
      const clickedSuperfanCta = sessionStorage.getItem('pending_superfan');
      if (clickedSuperfanCta && enteredPromo && uid) {
        try {
          const promoRes = await fetch('/api/promo/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firebaseUid: uid, email, code: enteredPromo }),
          });
          const promoData = await promoRes.json().catch(() => ({}));
          if (promoRes.ok && promoData?.ok) {
            sessionStorage.removeItem('pending_superfan');
            setIsSuperfan(true);
            setPromoCode('');
            setPromoOpen(false);
            try {
              localStorage.setItem('yat-plan', 'superfan');
            } catch {}
            if (sessionStorage.getItem('pending_fav_pid')) {
              await resumePendingFavorite(uid, regData?.contactId);
            }
            setMessage('Promo applied — welcome, Superfan!');
            setMessageType('success');
            setTimeout(() => setMessage(''), 2500);
            return;
          }
          // Bad or failed code: stay on the form so it can be fixed.
          // Never continue to Stripe checkout on a bad code.
          sessionStorage.removeItem('pending_superfan');
          setMessage(
            (promoData?.error || 'That promo code is not valid.') +
              " You can try another code in your account — look for 'Have a promo code?' below."
          );
          setMessageType('error');
          return;
        } catch {
          sessionStorage.removeItem('pending_superfan');
          setMessage(
            "Could not apply the promo code. You can try again in your account — look for 'Have a promo code?' below."
          );
          setMessageType('error');
          return;
        }
      }

      if (sessionStorage.getItem('pending_fav_pid') && uid) {
        await resumePendingFavorite(uid, regData?.contactId);
      } else if (sessionStorage.getItem('pending_superfan') && uid) {
        await resumePendingSuperfan(uid, email);
        return;
      }

      setMessage('Registration successful! Welcome to YAT?STATS.');
      setMessageType('success');
      setTimeout(() => setMessage(''), 1500);
    } catch (error) {
      const firebaseCode = (error as { code?: string })?.code;

      if (
        firebaseCode === 'auth/email-already-in-use' ||
        (error as { isEmailTaken?: boolean })?.isEmailTaken
      ) {
        setMessage('This email already has a YAT?STATS account. Please sign in.');
        window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: 'signin' }));
      } else {
        setMessage(error instanceof Error ? error.message : 'Registration failed');
      }

      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
      } catch {}

      try {
        if (auth) await signOut(auth);
      } catch {}

      setFirebaseUser(null);
      setSessionUser(null);

      try {
        localStorage.removeItem('yat-plan');
        localStorage.removeItem('yat-user');

        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('yat_firstName_')) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));

        window.dispatchEvent(new CustomEvent('yat-sign-out'));
      } catch {}

      setMessage('Signed out successfully');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign out failed');
      setMessageType('error');
    }
  };

  const handleForgotPassword = async () => {
    const email = signInEmail.trim();

    if (!email) {
      setMessage('Please enter your email address first.');
      setMessageType('error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setMessage('Please enter a valid email address.');
      setMessageType('error');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      if (!auth) throw new Error('Firebase auth not initialized');
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent. Check your inbox.');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to send password reset email.');
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="yat-drawer-content yat-account-content">
      {isAuthenticated ? (
        <div className="yat-account-signed-in" style={{ padding: '20px' }}>
          {superfanLaunching && (
            <div
              style={{
                background: 'rgba(128,128,128,.08)',
                border: '1px solid #171717',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--fg)',
                  fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                  letterSpacing: '.05em',
                  marginBottom: '4px',
                }}
              >
                ⭐ Launching Superfan Checkout…
              </p>
              <p style={{ fontSize: '11px', color: 'var(--muted)' }}>
                You&apos;ll be redirected to our secure payment page.
              </p>
            </div>
          )}

          {favConfirm && !isSuperfan && (
            <div
              style={{
                background: 'rgba(22,163,74,.12)',
                border: '1px solid #16a34a',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
              }}
            >
              <p
                style={{
                  fontSize: '14px',
                  color: '#16a34a',
                  fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                  letterSpacing: '.05em',
                  marginBottom: '6px',
                }}
              >
                ⭐ {favConfirm} added to your favorites
              </p>
              <p
                style={{
                  fontSize: '11px',
                  color: 'var(--muted)',
                  lineHeight: '1.5',
                  marginBottom: '10px',
                }}
              >
                Want to follow players from other schools too? Upgrade to Superfan for global access.
              </p>
              <button
                type="button"
                disabled={superfanLaunching}
                onClick={() =>
                  effectiveUid &&
                  effectiveEmail &&
                  launchSuperfanCheckout(effectiveUid, effectiveEmail)
                }
                style={{
                  display: 'inline-block',
                  padding: '8px 14px',
                  background: 'var(--fg)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                  letterSpacing: '.06em',
                  cursor: superfanLaunching ? 'not-allowed' : 'pointer',
                  opacity: superfanLaunching ? 0.6 : 1,
                }}
              >
                {superfanLaunching ? 'Launching…' : 'Upgrade to Superfan →'}
              </button>
            </div>
          )}

          <div className="yat-account-identity" style={{ marginBottom: '10px' }}>
            <p
              style={{
                fontSize: '18px',
                marginBottom: '10px',
                fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                letterSpacing: '.05em',
              }}
            >
              Hi, {displayName || 'Fan'}!
            </p>
            <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{effectiveEmail}</p>
          </div>

          {isSuperfan && (
            <div
              className="yat-account-superfan"
              style={{
                background: 'rgba(128,128,128,.08)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '10px',
              }}
            >
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--fg)',
                  fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                  letterSpacing: '.06em',
                }}
              >
                ⭐ You are a Superfan
              </p>
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                You can follow players from any school in the YAT?STATS network.
              </p>
            </div>
          )}

          {/* First thing after joining or logging in: the ways to connect
              and contribute. Sign Out sits at the bottom. */}
          <ContributeShortcuts />

          {!isSuperfan && !superfanLaunching && (
            <>
              <button
                type="button"
                onClick={() =>
                  effectiveUid && effectiveEmail && launchSuperfanCheckout(effectiveUid, effectiveEmail)
                }
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--fg)',
                  color: 'var(--bg)',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                  fontSize: '14px',
                  letterSpacing: '.08em',
                  cursor: 'pointer',
                  marginBottom: '10px',
                }}
              >
                ⭐ Become a Superfan — $2.99/mo
              </button>
              {!promoOpen ? (
                <button
                  type="button"
                  onClick={() => setPromoOpen(true)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'transparent',
                    color: 'var(--muted)',
                    border: 'none',
                    fontSize: '12px',
                    cursor: 'pointer',
                    marginBottom: '10px',
                    textDecoration: 'underline',
                  }}
                >
                  Have a promo code?
                </button>
              ) : (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="Enter promo code"
                      disabled={promoBusy}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--muted)',
                        background: 'var(--bg)',
                        color: 'var(--fg)',
                        fontSize: '13px',
                        textTransform: 'uppercase',
                      }}
                    />
                    <button
                      type="button"
                      onClick={redeemPromo}
                      disabled={promoBusy || !promoCode.trim()}
                      style={{
                        padding: '10px 16px',
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                        fontSize: '13px',
                        letterSpacing: '.06em',
                        cursor: promoBusy ? 'not-allowed' : 'pointer',
                        opacity: promoBusy || !promoCode.trim() ? 0.6 : 1,
                      }}
                    >
                      {promoBusy ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <button
            className="yat-account-signout"
            onClick={handleSignOut}
            style={{
              width: '100%',
              marginTop: '9px',
              padding: '12px',
              background: 'var(--fg)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: '8px',
              fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
              fontSize: '14px',
              letterSpacing: '.08em',
              cursor: 'pointer',
              marginBottom: '15px',
            }}
          >
            Sign Out
          </button>

          {message && (
            <p
              style={{
                marginTop: '15px',
                textAlign: 'center',
                fontSize: '12px',
                color: MSG_COLOR[messageType],
              }}
            >
              {message}
            </p>
          )}
        </div>
      ) : (
        <>
          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn} style={{ padding: '12px 15px' }}>
              <div style={{ marginBottom: '8px' }}>
                <input
                  type="email"
                  name="signInEmail"
                  required
                  placeholder="Email"
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '6px' }}>
                <PasswordInput name="signInPassword" placeholder="Password" />
              </div>

              <div style={{ textAlign: 'right', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 0',
                    fontSize: '11px',
                    color: 'var(--muted)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '11px',
                  background: 'var(--fg)',
                  color: 'var(--bg)',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                  fontSize: '14px',
                  letterSpacing: '.08em',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? 'Logging In...' : 'LOG IN'}
              </button>
            </form>
          )}

          {activeTab === 'register' && (
            <form onSubmit={handleRegister} style={{ padding: '12px 15px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  name="registerFirstName"
                  required
                  placeholder="First Name"
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                    fontSize: '13px',
                  }}
                />
                <input
                  type="text"
                  name="registerLastName"
                  required
                  placeholder="Last Name"
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '8px' }}>
                <input
                  type="email"
                  name="registerEmail"
                  required
                  placeholder="Email"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <PasswordInput name="registerPassword" placeholder="Password" />
              </div>

              <button
                className="yat-account-membership-cta"
                type="submit"
                name="intent"
                value="fan"
                disabled={isLoading}
                onClick={() => sessionStorage.removeItem('pending_superfan')}
                style={{
                  width: '100%',
                  padding: '11px',
                  background: 'var(--fg)',
                  color: 'var(--bg)',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                  fontSize: '13px',
                  letterSpacing: '.07em',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                  marginBottom: '8px',
                }}
              >
                {isLoading ? 'Creating Account...' : 'BECOME A FAN — FREE'}
              </button>

              <div style={{ marginBottom: '10px' }}>
                <input
                  className="yat-account-promo-code"
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="SUPER FAN PROMO CODE (OPTIONAL)"
                  aria-label="Superfan promo code"
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                    fontSize: '13px',
                    textTransform: 'uppercase',
                  }}
                />
              </div>

              <button
                className="yat-account-membership-cta"
                type="submit"
                name="intent"
                value="superfan"
                disabled={isLoading}
                onClick={() => sessionStorage.setItem('pending_superfan', '1')}
                style={{
                  width: '100%',
                  padding: '11px',
                  background: 'var(--fg)',
                  color: 'var(--bg)',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                  fontSize: '13px',
                  letterSpacing: '.07em',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? 'Setting Up...' : 'BECOME A SUPER FAN — $2.99/MO'}
              </button>
            </form>
          )}

          {message && (
            <p
              style={{
                marginTop: '15px',
                textAlign: 'center',
                fontSize: '12px',
                color: MSG_COLOR[messageType],
                padding: '0 15px',
              }}
            >
              {message}
            </p>
          )}

          {activeTab === "signin" && <section
            className="yat-raffle-section"
            aria-label="Fall Classic Tickets Raffle"
            style={{
              margin: '14px 15px 4px',
              padding: '14px 15px',
              border: '1px solid var(--line)',
              background: 'linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.26)), url("/img/world-series-trophy-cta.png") 92% center / auto 94% no-repeat',
            }}
          >
            <div
              style={{
                color: 'var(--fg)',
                fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                fontSize: '18px',
                lineHeight: 1,
                letterSpacing: '.07em',
                marginBottom: '5px',
              }}
            >
              FALL CLASSIC TICKETS RAFFLE
            </div>
            <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: '11px', lineHeight: 1.45 }}>
              Register on your favorite high school alumni hub. Fans earn one entry for every regular-season round they are registered.
              Super Fans earn one additional entry for every round they are a Super Fan. A Super Fan since Round 1 can have
              <strong style={{ color: 'var(--fg)' }}> 20 regular-season entries + 1 postseason entry</strong>.
            </p>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '11px', lineHeight: 1.45 }}>
              Entries close <strong style={{ color: 'var(--fg)' }}>11:59 PM September 26, 2027</strong>. The winner will be drawn on
              <strong style={{ color: 'var(--fg)' }}> October 3, 2027</strong>, with the drawing planned to stream LIVE on yatstats.com.
            </p>
          </section>}

          <div className="yat-account-comparison" style={{ borderTop: '1px solid var(--line)', marginTop: '14px' }}>
            <div
              style={{
                padding: '16px',
                fontSize: '11px',
                lineHeight: '1.7',
                color: 'var(--muted)',
              }}
            >
              <table className="yat-account-benefit-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: 'left',
                        fontSize: '10px',
                        fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                        letterSpacing: '.06em',
                        paddingBottom: '6px',
                        color: 'var(--fg)',
                        width: '40%',
                      }}
                    >
                      FEATURE
                    </th>
                    <th
                      style={{
                        textAlign: 'center',
                        fontSize: '9px',
                        fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                        letterSpacing: '.04em',
                        paddingBottom: '6px',
                        color: 'var(--muted)',
                        width: '18%',
                      }}
                    >
                      VISITOR
                    </th>
                    <th
                      style={{
                        textAlign: 'center',
                        fontSize: '9px',
                        fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                        letterSpacing: '.04em',
                        paddingBottom: '6px',
                        color: 'var(--fg)',
                        width: '20%',
                      }}
                    >
                      HOME FAN
                    </th>
                    <th
                      style={{
                        textAlign: 'center',
                        fontSize: '9px',
                        fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                        letterSpacing: '.04em',
                        paddingBottom: '6px',
                        color: 'var(--fg)',
                        width: '22%',
                      }}
                    >
                      SUPER FAN
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Browse all alumni stats', '✓', '✓', '✓'],
                    ['View schedules & scores', '✓', '✓', '✓'],
                    ['Save Home School favorites', '—', '✓', '✓'],
                    ['Filter by My Favorites', '—', '✓', '✓'],
                    ['Follow players from any school', '—', '—', '✓'],
                    ['All-Schools favorites filter', '—', '—', '✓'],
                  ].map(([feat, v, f, s]) => (
                    <tr
                      key={feat as string}
                      style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}
                    >
                      <td style={{ padding: '5px 4px 5px 0', color: 'var(--muted)' }}>{feat}</td>
                      <td style={{ textAlign: 'center', color: 'var(--muted)' }}>{v}</td>
                      <td style={{ textAlign: 'center', color: 'var(--fg)' }}>{f}</td>
                      <td style={{ textAlign: 'center', color: 'var(--fg)' }}>{s}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="yat-account-tour"
              style={{
                borderTop: '1px solid var(--line)',
                padding: '16px',
                display: 'flex',
                alignItems: 'flex-end',
                gap: '12px',
                background: 'rgba(255,255,255,.03)',
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <img
                  src="/img/yati-placeholders/yati-running-field.webp"
                  alt="YaTi mascot"
                  style={{ width: '80px', objectFit: 'contain', display: 'block' }}
                />
              </div>

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    background: '#fff',
                    color: '#000',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    position: 'relative',
                  }}
                >
                  Welcome to YAT?STATS! I would love to give you a quick tour of our platform.
                  <br />
                  <strong style={{display:'block',marginTop:'4px'}}>Select your role in the baseball world.</strong>
                  <div className="yat-tour-roles" aria-label="Choose a guided tour">
                    {([
                      ['coach','COACH'],
                      ['player','PLAYER'],
                      ['partner','PARTNER'],
                      ['fan','FAN'],
                    ] as const).map(([role,label]) => (
                      <a key={role} className="yat-tour-role" href={`https://yatstats.com/?tour=${role}`} aria-label={`${label} guided tour`}>
                        <img src={`https://raw.githubusercontent.com/ARMS-REACH-DIGITAL-AGENCY/armsreach/main/sites/yatstats/img/tour-${role}.jpg`} alt="" loading="lazy" />
                        <span>{label}</span>
                      </a>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { window.location.assign("https://yatstats.com"); }}
                    style={{
                      marginTop: '8px',
                      background: '#171717',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      minHeight: '40px',
                       padding: '0 14px',
                      fontFamily: 'var(--yat-font-ui, Archivo, Arial, sans-serif)',
                      fontSize: '12px',
                       fontWeight: 800,
                      letterSpacing: '.01em',
                      cursor: 'pointer',
                    }}
                  >
                    LET&apos;S GO!!
                  </button>

                  <span
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '-8px',
                      width: 0,
                      height: 0,
                      borderTop: '8px solid transparent',
                      borderBottom: '8px solid transparent',
                      borderLeft: '8px solid #fff',
                      display: 'block',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {/* Account styles must survive sign-in, when both password fields unmount. */}
      <style jsx global>{`
        #drawerAccount .yat-account-content{font-family:var(--yat-font-ui,Archivo,Arial,sans-serif);padding:0!important;gap:0!important;}
        #drawerAccount .yat-raffle-section > div:first-child{font:800 clamp(12px,3.05vw,18px)/1.1 Oswald,sans-serif!important;letter-spacing:-.01em!important;text-transform:uppercase;white-space:nowrap;}
        #drawerAccount .yat-account-comparison{display:flex;flex-direction:column;margin-top:4px!important;border-top:0!important;}
        #drawerAccount .yat-account-tour{order:0;padding:7px 10px 9px!important;gap:7px!important;align-items:center!important;border-top:0!important;background:transparent!important;}
        #drawerAccount .yat-account-tour > div:first-child{order:2!important;flex:0 0 70px!important;}
        #drawerAccount .yat-account-tour > div:last-child{order:1!important;flex:1 1 auto!important;min-width:0;}
        #drawerAccount .yat-account-tour > div:last-child > div > span{right:-8px!important;left:auto!important;border-right:0!important;border-left:8px solid #fff!important;top:19px!important;}
        #drawerAccount .yat-account-tour img{width:70px!important;max-height:112px;object-fit:contain!important;object-position:center!important;}
        #drawerAccount .yat-account-tour > div:last-child > div{padding:8px 10px!important;font-size:11px!important;line-height:1.35!important;}
        #drawerAccount .yat-account-tour button{min-height:34px!important;margin-top:5px!important;padding:0 10px!important;}
        #drawerAccount .yat-tour-roles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:9px;padding-top:8px;border-top:1px solid #d4d4d4;gap:0;}
        #drawerAccount .yat-tour-role{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:0;gap:4px;padding:0 2px;color:#161616;text-decoration:none;font:700 clamp(8px,2.1vw,11px)/1.1 var(--yat-font-ui,Archivo,Arial,sans-serif);border-right:1px solid #ddd;}
        #drawerAccount .yat-tour-role:last-child{border-right:0;}
        #drawerAccount .yat-tour-role img{width:min(100%,43px)!important;height:43px!important;max-height:43px!important;object-fit:contain!important;mix-blend-mode:multiply;}
        #drawerAccount .yat-tour-role:hover,#drawerAccount .yat-tour-role:focus-visible{color:#bd630b;text-decoration:underline;}
        #drawerAccount .yat-raffle-section{background-color:rgba(0,0,0,.28)!important;background-blend-mode:normal!important;background-size:auto 94%!important;background-position:right center!important;}
        #drawerAccount .yat-account-benefit-table :is(th,td):first-child{font-family:var(--yat-font-ui,Archivo,Arial,sans-serif)!important;letter-spacing:-.025em!important;}
        #drawerAccount .yat-account-comparison > div:first-child{padding:8px 12px!important;}
        @media(max-width:779px){#drawerAccount .yat-account-tour img{width:70px!important;}}

        /* 1:1 button/input heights and compact, legible membership offers. */
        #drawerAccount .yat-account-membership-cta,
        #drawerAccount .yat-account-promo-code{
          box-sizing:border-box!important;
          height:43px!important;min-height:43px!important;max-height:43px!important;
          width:100%!important;border-radius:7px!important;
          font:800 clamp(11px,2.9vw,13px)/1.1 Oswald,sans-serif!important;
          letter-spacing:0!important;white-space:nowrap!important;
        }
        #drawerAccount .yat-account-membership-cta{
          display:flex!important;align-items:center!important;justify-content:center!important;
          padding:0 7px!important;text-transform:uppercase!important;
        }
        #drawerAccount .yat-account-promo-code{
          display:block!important;font:500 12px/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif)!important;
          padding:0 12px!important;
        }
        /* Keep all six benefit features on one line. Give the check columns
           just enough width for icons, instead of reserving 60% for them. */
        #drawerAccount .yat-account-benefit-table{
          table-layout:fixed!important;width:100%!important;border-collapse:collapse!important;
        }
        #drawerAccount .yat-account-benefit-table :is(th,td):first-child{
          width:57%!important;
          white-space:nowrap!important;
          overflow:hidden!important;
          text-overflow:clip!important;
          font-family:Oswald,sans-serif!important;
          letter-spacing:-.015em!important;
        }
        #drawerAccount .yat-account-benefit-table :is(th,td):not(:first-child){width:14.333%!important;}
        #drawerAccount .yat-account-benefit-table th{
          font:700 clamp(8px,2.25vw,10px)/1.15 Oswald,sans-serif!important;
          white-space:nowrap!important;letter-spacing:0!important;
          padding:0 0 6px!important;
        }
        #drawerAccount .yat-account-benefit-table td{
          font:500 clamp(9px,2.7vw,11px)/1.3 Oswald,sans-serif!important;
          padding:5px 0!important;
        }
        #drawerAccount .yat-account-benefit-table td:not(:first-child){
          font:700 14px/1 Oswald,sans-serif!important;
          text-align:center!important;
        }
        #drawerAccount .yat-account-signed-in{padding:9px 16px 16px!important;min-width:0;}
        #drawerAccount .yat-account-identity{margin:0 0 7px!important;padding:2px 40px 5px 2px!important;border-bottom:0!important;}
        #drawerAccount .yat-account-identity p:first-child{margin:0 0 4px!important;font:800 22px/1.15 var(--yat-font-ui,Archivo,Arial,sans-serif)!important;letter-spacing:-.035em!important;color:var(--ink);}
        #drawerAccount .yat-account-identity p:last-child{margin:0!important;font:400 12px/1.35 var(--yat-font-ui,Archivo,Arial,sans-serif)!important;overflow-wrap:anywhere;color:var(--muted);}
        #drawerAccount .yat-account-superfan{padding:8px 10px!important;margin-bottom:3px!important;border:0!important;background:var(--line)!important;}
        #drawerAccount .yat-account-signout{margin-top:4px!important;margin-bottom:0!important;min-height:44px!important;font:800 12px/1.1 var(--yat-font-ui,Archivo,Arial,sans-serif)!important;letter-spacing:.025em!important;border-radius:8px!important;}
        #drawerAccount .yat-account-content input,#drawerAccount .yat-account-content button{font-family:var(--yat-font-ui,Archivo,Arial,sans-serif)!important;}
        #drawerAccount .yat-account-content form{font-family:var(--yat-font-ui,Archivo,Arial,sans-serif);}
        @media(max-width:779px){#drawerAccount .yat-account-signed-in{padding:8px 14px 14px!important;}#drawerAccount .yat-account-identity{margin-top:0!important;}#drawerAccount .yat-account-identity p:first-child{font-size:20px!important;}}
      `}</style>
    </div>
  );
}
