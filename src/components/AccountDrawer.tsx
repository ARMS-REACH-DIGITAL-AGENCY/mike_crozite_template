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

interface AccountDrawerProps {
  subdomain: string;
}

interface ServerSessionUser {
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
}

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

function buildMicrositeUrl(
  homeHsid?: string | null,
  homeSchoolName?: string | null,
  homeSchoolLocation?: string | null
) {
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

  return `/${homeHsid}`;
}

export default function AccountDrawer({ subdomain }: AccountDrawerProps) {
  const MSG_COLOR: Record<'error' | 'success' | 'info', string> = {
    error: '#dc2626',
    success: '#16a34a',
    info: 'var(--muted)',
  };

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [serverSessionUser, setServerSessionUser] = useState<ServerSessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | 'info'>('info');
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('register');
  const [displayName, setDisplayName] = useState('');
  const [signInEmail, setSignInEmail] = useState('');
  const [favConfirm, setFavConfirm] = useState('');
  const [superfanLaunching, setSuperfanLaunching] = useState(false);
  const [isSuperfan, setIsSuperfan] = useState(false);

  const effectiveUser = firebaseUser || (serverSessionUser
    ? ({
        uid: serverSessionUser.uid,
        email: serverSessionUser.email,
        isAnonymous: false,
      } as unknown as User)
    : null);

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
  }: {
    uid: string;
    email: string;
    contactId?: string | null;
    firstName?: string | null;
    homeHsid?: string | null;
    homeSchoolName?: string | null;
    homeSchoolLocation?: string | null;
    role?: string | null;
    plan?: string | null;
  }) => {
    const homeMicrositeUrl = buildMicrositeUrl(homeHsid, homeSchoolName, homeSchoolLocation);

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

    setServerSessionUser({
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
      isSuperfan: plan === 'superfan',
    });

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

  async function bootstrapFromServerSession() {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        cache: 'no-store',
      });

      const data = await res.json();

      if (!data?.authenticated || !data?.session) {
        setServerSessionUser(null);
        return;
      }

      const s = data.session;
      const homeMicrositeUrl =
        s.homeMicrositeUrl ||
        buildMicrositeUrl(s.homeHsid ?? null, s.homeSchoolName ?? null, s.homeSchoolLocation ?? null);

      setServerSessionUser({
        uid: s.uid,
        email: s.email,
        contactId: s.contactId ?? null,
        firstName: s.firstName ?? null,
        homeHsid: s.homeHsid ?? null,
        homeSchoolName: s.homeSchoolName ?? null,
        homeSchoolLocation: s.homeSchoolLocation ?? null,
        homeMicrositeUrl,
        role: s.role ?? 'fan',
        plan: s.plan ?? 'fan',
        isSuperfan: s.plan === 'superfan' || s.isSuperfan === true,
      });

      setDisplayName(s.firstName ?? '');
      setIsSuperfan(s.plan === 'superfan' || s.isSuperfan === true);

      persistLocalUser({
        uid: s.uid,
        email: s.email,
        contactId: s.contactId ?? null,
        firstName: s.firstName ?? null,
        homeHsid: s.homeHsid ?? null,
        homeSchoolName: s.homeSchoolName ?? null,
        homeSchoolLocation: s.homeSchoolLocation ?? null,
        role: s.role ?? 'fan',
        plan: s.plan ?? 'fan',
      });
    } catch (err) {
      console.error('Session bootstrap failed:', err);
    }
  }

  useEffect(() => {
    const handleTabSwitch = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail;
      if (tab === 'signin' || tab === 'register') setActiveTab(tab);
    };

    window.addEventListener('yat:acct-tab', handleTabSwitch);
    return () => window.removeEventListener('yat:acct-tab', handleTabSwitch);
  }, []);

  useEffect(() => {
    bootstrapFromServerSession();
  }, [subdomain]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);

      if (!currentUser) {
        await bootstrapFromServerSession();
        return;
      }

      const uid = currentUser.uid;
      const email = currentUser.email || '';

      try {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid,
            email,
            currentHsid: subdomain,
          }),
        });

        const loginData = await loginRes.json();

        const firstName =
          loginData?.firstName ||
          currentUser.displayName ||
          localStorage.getItem(`yat_firstName_${uid}`) ||
          '';

        setDisplayName(firstName);
        setIsSuperfan(loginData?.isSuperfan || loginData?.plan === 'superfan');

        persistLocalUser({
          uid,
          email,
          contactId: loginData?.contactId ?? null,
          firstName,
          homeHsid: loginData?.homeHsid ?? null,
          homeSchoolName: loginData?.homeSchoolName ?? null,
          homeSchoolLocation: loginData?.homeSchoolLocation ?? null,
          role: loginData?.role ?? 'fan',
          plan: loginData?.plan ?? 'fan',
        });
      } catch (err) {
        console.error('Auth rehydrate failed:', err);
      }
    });

    return () => unsubscribe();
  }, [subdomain]);

  const resumePendingFavorite = async (firebaseUid: string, contactId?: string | null) => {
    const pid = sessionStorage.getItem('pending_fav_pid');
    const pName = sessionStorage.getItem('pending_fav_name') || pid || '';
    if (!pid || !firebaseUid) return;

    sessionStorage.removeItem('pending_fav_pid');
    sessionStorage.removeItem('pending_fav_name');

    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid,
          contactId,
          playerId: pid,
          playerName: pName,
          schoolId: subdomain,
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

      const data = await res.json();

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      setMessage(data?.error || 'Could not start checkout. Please try again.');
      setMessageType('error');
      setSuperfanLaunching(false);
    } catch {
      setMessage('Network error starting checkout. Please try again.');
      setMessageType('error');
      setSuperfanLaunching(false);
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

      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, email, currentHsid: subdomain }),
      });

      const loginData = await loginRes.json();

      const firstName =
        loginData?.firstName ||
        cred.user.displayName ||
        localStorage.getItem(`yat_firstName_${uid}`) ||
        '';

      setDisplayName(firstName);
      setIsSuperfan(loginData?.isSuperfan || loginData?.plan === 'superfan');

      persistLocalUser({
        uid,
        email,
        contactId: loginData?.contactId ?? null,
        firstName,
        homeHsid: loginData?.homeHsid ?? null,
        homeSchoolName: loginData?.homeSchoolName ?? null,
        homeSchoolLocation: loginData?.homeSchoolLocation ?? null,
        role: loginData?.role ?? 'fan',
        plan: loginData?.plan ?? 'fan',
      });

      if (sessionStorage.getItem('pending_fav_pid')) {
        await resumePendingFavorite(uid, loginData?.contactId);
      } else if (sessionStorage.getItem('pending_superfan')) {
        await resumePendingSuperfan(uid, email);
        return;
      }

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

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

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
        throw new Error(regData?.error || 'Registration failed');
      }

      setDisplayName(firstName);
      setIsSuperfan(regData?.isSuperfan || regData?.plan === 'superfan');

      persistLocalUser({
        uid,
        email,
        contactId: regData?.contactId ?? null,
        firstName,
        homeHsid: regData?.homeHsid ?? subdomain ?? null,
        homeSchoolName: regData?.homeSchoolName ?? null,
        homeSchoolLocation: regData?.homeSchoolLocation ?? null,
        role: regData?.role ?? 'fan',
        plan: regData?.plan ?? 'fan',
      });

      if (sessionStorage.getItem('pending_fav_pid')) {
        await resumePendingFavorite(uid, regData?.contactId);
      } else if (sessionStorage.getItem('pending_superfan')) {
        await resumePendingSuperfan(uid, email);
        return;
      }

      setMessage('Registration successful! Welcome to YAT?STATS.');
      setMessageType('success');
      setTimeout(() => setMessage(''), 1500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Registration failed');
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
        });
      } catch {}

      try {
        await signOut(auth);
      } catch {}

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

      setFirebaseUser(null);
      setServerSessionUser(null);
      setDisplayName('');
      setIsSuperfan(false);

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
    <div className="yat-drawer-content">
      {effectiveUser && !effectiveUser.isAnonymous ? (
        <div style={{ padding: '20px' }}>
          {superfanLaunching && (
            <div
              style={{
                background: 'rgba(255,215,0,.1)',
                border: '1px solid #FFD700',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  fontSize: '14px',
                  color: '#FFD700',
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
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
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
                  letterSpacing: '.05em',
                  marginBottom: '6px',
                }}
              >
                ⭐ {favConfirm} added to your favorites
              </p>
            </div>
          )}

          {isSuperfan && (
            <div
              style={{
                background: 'rgba(255,215,0,.1)',
                border: '1px solid rgba(255,215,0,.4)',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '16px',
              }}
            >
              <p
                style={{
                  fontSize: '13px',
                  color: '#FFD700',
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
                  letterSpacing: '.06em',
                }}
              >
                ⭐ You are a Superfan
              </p>
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <p
              style={{
                fontSize: '18px',
                marginBottom: '10px',
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                letterSpacing: '.05em',
              }}
            >
              Hi, {displayName || 'Fan'}!
            </p>
            <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{effectiveUser.email}</p>
          </div>

          {!isSuperfan && !superfanLaunching && (
            <button
              type="button"
              onClick={() => effectiveUser?.uid && effectiveUser.email && launchSuperfanCheckout(effectiveUser.uid, effectiveUser.email)}
              style={{
                width: '100%',
                padding: '12px',
                background: '#FFD700',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: '14px',
                letterSpacing: '.08em',
                cursor: 'pointer',
                marginBottom: '10px',
              }}
            >
              ⭐ Become a Superfan — $2.99/mo
            </button>
          )}

          <button
            onClick={handleSignOut}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--fg)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: '8px',
              fontFamily: '"Bebas Neue", Oswald, sans-serif',
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
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
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
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
                  fontSize: '13px',
                  letterSpacing: '.07em',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                  marginBottom: '8px',
                }}
              >
                {isLoading ? 'Creating Account...' : 'BECOME A FAN OF THIS SCHOOL — FREE'}
              </button>

              <button
                type="submit"
                name="intent"
                value="superfan"
                disabled={isLoading}
                onClick={() => sessionStorage.setItem('pending_superfan', '1')}
                style={{
                  width: '100%',
                  padding: '11px',
                  background: '#FFD700',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
                  fontSize: '13px',
                  letterSpacing: '.07em',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? 'Setting Up...' : '⭐ BECOME A GLOBAL SUPER FAN — $2.99/mo'}
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
        </>
      )}
    </div>
  );
}