'use client';

import { useEffect, useState } from 'react';
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

  const normalizeState = (state: string) =>
    String(state || '').toLowerCase().trim();

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

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | 'info'>('info');
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('register');
  const [displayName, setDisplayName] = useState('');
  const [signInEmail, setSignInEmail] = useState('');
  const [favConfirm, setFavConfirm] = useState<string>('');
  const [superfanLaunching, setSuperfanLaunching] = useState(false);
  const [isSuperfan, setIsSuperfan] = useState(false);

  useEffect(() => {
    const handleTabSwitch = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail;
      if (tab === 'signin' || tab === 'register') setActiveTab(tab);
    };
    window.addEventListener('yat:acct-tab', handleTabSwitch);
    return () => window.removeEventListener('yat:acct-tab', handleTabSwitch);
  }, []);

  // Single valid auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setDisplayName('');
        setIsSuperfan(false);
        try {
          localStorage.removeItem('yat-plan');
          localStorage.removeItem('yat-user');
        } catch {}
        return;
      }

      const uid = currentUser.uid;
      const email = currentUser.email || '';

      try {
        const storedName = localStorage.getItem(`yat_firstName_${uid}`);
        setDisplayName(currentUser.displayName || storedName || '');
        const storedPlan = localStorage.getItem('yat-plan');
        setIsSuperfan(storedPlan === 'superfan');
      } catch {}

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

        try {
          localStorage.setItem(`yat_firstName_${uid}`, firstName);
          localStorage.setItem(
            'yat-user',
            JSON.stringify({
              uid,
              contactId: loginData?.contactId ?? null,
              email,
              firstName: firstName || null,
              homeHsid: loginData?.homeHsid ?? subdomain ?? null,
              role: loginData?.role ?? 'fan',
            })
          );
          localStorage.setItem('yat-plan', loginData?.plan ?? 'fan');
        } catch {}
      } catch (err) {
        console.error('Auth rehydrate failed:', err);
      }
    });

    return () => unsubscribe();
  }, [subdomain]);

  /** Execute a pending favorite intent stored in sessionStorage, if any. */
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
    } catch {
      // non-fatal
    }
  };

  /** Launch Stripe checkout for the Superfan subscription. */
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
      } else {
        setMessage(data?.error || 'Could not start checkout. Please try again.');
        setMessageType('error');
        setSuperfanLaunching(false);
      }
    } catch {
      setMessage('Network error starting checkout. Please try again.');
      setMessageType('error');
      setSuperfanLaunching(false);
    }
  };

  /** Resume a pending superfan intent after auth, or dismiss if none. */
  const resumePendingSuperfan = async (firebaseUid: string, email: string) => {
    const pending = sessionStorage.getItem('pending_superfan');
    if (!pending) return;
    sessionStorage.removeItem('pending_superfan');
    await launchSuperfanCheckout(firebaseUid, email);
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const email = (e.currentTarget.elements.namedItem('signInEmail') as HTMLInputElement).value;
      const password = (e.currentTarget.elements.namedItem('signInPassword') as HTMLInputElement)
        .value;

      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      try {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, email, currentHsid: subdomain }),
        });
        const loginData = await loginRes.json();

        if (loginData?.firstName) {
          try {
            localStorage.setItem(`yat_firstName_${uid}`, loginData.firstName);
          } catch {}
          setDisplayName(loginData.firstName);
        }

        const canonicalHome = loginData?.homeHsid ?? null;
const homeSchoolName = loginData?.homeSchoolName ?? null;
const homeSchoolLocation = loginData?.homeSchoolLocation ?? null;
const homeMicrositeUrl = buildMicrositeUrl(canonicalHome, homeSchoolName, homeSchoolLocation);

const homeHsid = regData?.homeHsid ?? null;
const homeSchoolName = regData?.homeSchoolName ?? null;
const homeSchoolLocation = regData?.homeSchoolLocation ?? null;
const homeMicrositeUrl = buildMicrositeUrl(homeHsid, homeSchoolName, homeSchoolLocation);

try {
  localStorage.setItem(
    'yat-user',
    JSON.stringify({
      uid,
      contactId: regData?.contactId ?? null,
      email,
      firstName: firstName || null,
      homeHsid,
      homeSchoolName,
      homeSchoolLocation,
      homeMicrositeUrl,
      role: 'fan',
    })
  );
} catch {}

if (loginData?.isSuperfan) setIsSuperfan(true);
try {
  localStorage.setItem('yat-plan', loginData?.plan ?? 'fan');
} catch {}

const isSuperfanUser = loginData?.isSuperfan || loginData?.plan === 'superfan';

if (canonicalHome && !isSuperfanUser && canonicalHome !== subdomain) {
  const homeLabel = homeSchoolName
    ? `${homeSchoolName}${homeSchoolLocation ? ` (${homeSchoolLocation})` : ''}`
    : canonicalHome;

  setMessage(
    `Your Fan account is registered to ${homeLabel}. Redirecting you to your home microsite…`
  );
  setMessageType('info');

  setTimeout(() => {
    window.location.href = homeMicrositeUrl || `/${canonicalHome}`;
  }, 2500);

  return;
}

        if (sessionStorage.getItem('pending_fav_pid')) {
          await resumePendingFavorite(uid, loginData?.contactId);
        } else if (sessionStorage.getItem('pending_superfan')) {
          await resumePendingSuperfan(uid, email);
          return;
        }
      } catch {
        // non-fatal
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

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const email = (e.currentTarget.elements.namedItem('registerEmail') as HTMLInputElement).value;
      const password = (e.currentTarget.elements.namedItem('registerPassword') as HTMLInputElement)
        .value;
      const firstName =
  loginData?.firstName ||
  currentUser.displayName ||
  localStorage.getItem(`yat_firstName_${uid}`) ||
  '';

const homeHsid = loginData?.homeHsid ?? null;
const homeSchoolName = loginData?.homeSchoolName ?? null;
const homeSchoolLocation = loginData?.homeSchoolLocation ?? null;
const homeMicrositeUrl = buildMicrositeUrl(homeHsid, homeSchoolName, homeSchoolLocation);

setDisplayName(firstName);
setIsSuperfan(loginData?.isSuperfan || loginData?.plan === 'superfan');

try {
  localStorage.setItem(`yat_firstName_${uid}`, firstName);
  localStorage.setItem(
    'yat-user',
    JSON.stringify({
      uid,
      contactId: loginData?.contactId ?? null,
      email,
      firstName: firstName || null,
      homeHsid,
      homeSchoolName,
      homeSchoolLocation,
      homeMicrositeUrl,
      role: loginData?.role ?? 'fan',
    })
  );
  localStorage.setItem('yat-plan', loginData?.plan ?? 'fan');
} catch {}

      try {
        localStorage.setItem('yat-plan', regData?.plan ?? 'fan');
      } catch {}

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
        setActiveTab('signin');
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
      await signOut(auth);
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
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent. Check your inbox.');
      setMessageType('success');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to send password reset email.'
      );
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="yat-drawer-content">
      {user && !user.isAnonymous ? (
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
                onClick={() => user?.uid && user.email && launchSuperfanCheckout(user.uid, user.email)}
                style={{
                  display: 'inline-block',
                  padding: '8px 14px',
                  background: '#b8860b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: '"Bebas Neue", Oswald, sans-serif',
                  letterSpacing: '.06em',
                  cursor: superfanLaunching ? 'not-allowed' : 'pointer',
                  opacity: superfanLaunching ? 0.6 : 1,
                }}
              >
                {superfanLaunching ? 'Launching…' : 'Upgrade to Superfan →'}
              </button>
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
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                You can follow players from any school in the YAT?STATS network.
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
            <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{user.email}</p>
          </div>

          {!isSuperfan && !superfanLaunching && (
            <button
              type="button"
              onClick={() => user?.uid && user.email && launchSuperfanCheckout(user.uid, user.email)}
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

          <div style={{ borderTop: '1px solid var(--line)', marginTop: '8px' }}>
            <div
              style={{
                padding: '16px',
                fontSize: '11px',
                lineHeight: '1.7',
                color: 'var(--muted)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: 'left',
                        fontSize: '10px',
                        fontFamily: '"Bebas Neue", Oswald, sans-serif',
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
                        fontFamily: '"Bebas Neue", Oswald, sans-serif',
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
                        fontFamily: '"Bebas Neue", Oswald, sans-serif',
                        letterSpacing: '.04em',
                        paddingBottom: '6px',
                        color: 'var(--fg)',
                        width: '20%',
                      }}
                    >
                      HOME
                      <br />
                      FAN
                    </th>
                    <th
                      style={{
                        textAlign: 'center',
                        fontSize: '9px',
                        fontFamily: '"Bebas Neue", Oswald, sans-serif',
                        letterSpacing: '.04em',
                        paddingBottom: '6px',
                        color: '#FFD700',
                        width: '22%',
                      }}
                    >
                      ⭐ SUPER
                      <br />
                      FAN
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
                    <tr key={feat as string} style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
                      <td style={{ padding: '5px 4px 5px 0', color: 'var(--muted)' }}>{feat}</td>
                      <td style={{ textAlign: 'center', color: 'var(--muted)' }}>{v}</td>
                      <td style={{ textAlign: 'center', color: 'var(--fg)' }}>{f}</td>
                      <td style={{ textAlign: 'center', color: '#FFD700' }}>{s}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
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
                  src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/YaTi.png"
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
                  <button
                    type="button"
                    style={{
                      marginTop: '8px',
                      background: '#FFD700',
                      color: '#000',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontFamily: '"Bebas Neue", Oswald, sans-serif',
                      fontSize: '13px',
                      letterSpacing: '.06em',
                      cursor: 'pointer',
                    }}
                  >
                    LET&apos;S GO!!
                  </button>

                  <span
                    style={{
                      position: 'absolute',
                      top: '12px',
                      left: '-8px',
                      width: 0,
                      height: 0,
                      borderTop: '8px solid transparent',
                      borderBottom: '8px solid transparent',
                      borderRight: '8px solid #fff',
                      display: 'block',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
