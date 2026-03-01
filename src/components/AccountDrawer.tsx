'use client';

import { useEffect, useState } from 'react';

interface AuthUser {
  email: string;
  uid: string;
}

interface AccountDrawerProps {
  subdomain: string;
}

export default function AccountDrawer({ subdomain }: AccountDrawerProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');

  // Initialize Firebase auth listener
  useEffect(() => {
    const initAuth = async () => {
      // Wait for Firebase to be loaded
      if (typeof window !== 'undefined' && (window as any).auth) {
        const { onAuthStateChanged } = (window as any).firebaseAuth;
        const auth = (window as any).auth;

        onAuthStateChanged(auth, (currentUser: AuthUser | null) => {
          setUser(currentUser);
        });
      }
    };

    initAuth();
  }, []);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const email = (e.currentTarget.elements.namedItem('signInEmail') as HTMLInputElement).value;
      const password = (e.currentTarget.elements.namedItem('signInPassword') as HTMLInputElement).value;

      if (typeof window !== 'undefined' && (window as any).firebaseAuth) {
        const { signInWithEmailAndPassword } = (window as any).firebaseAuth;
        const auth = (window as any).auth;

        await signInWithEmailAndPassword(auth, email, password);
        setMessage('Sign in successful!');
        setTimeout(() => {
          setMessage('');
          // Close drawer if needed
        }, 1500);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed');
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
      const password = (e.currentTarget.elements.namedItem('registerPassword') as HTMLInputElement).value;
      const firstName = (e.currentTarget.elements.namedItem('registerFirstName') as HTMLInputElement)?.value || '';
      const lastName = (e.currentTarget.elements.namedItem('registerLastName') as HTMLInputElement)?.value || '';

      if (typeof window !== 'undefined' && (window as any).firebaseAuth) {
        const { createUserWithEmailAndPassword } = (window as any).firebaseAuth;
        const auth = (window as any).auth;

        // Create user in Firebase
        await createUserWithEmailAndPassword(auth, email, password);

        // Sync to GoHighLevel
        const registerResponse = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            firstName,
            lastName,
            subdomain,
          }),
        });

        if (!registerResponse.ok) {
          const errorData = await registerResponse.json();
          throw new Error(errorData.error || 'Failed to register');
        }

        setMessage('Registration successful! Welcome to YAT?STATS.');
        setTimeout(() => {
          setMessage('');
          // Close drawer if needed
        }, 1500);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).firebaseAuth) {
        const { signOut } = (window as any).firebaseAuth;
        const auth = (window as any).auth;
        await signOut(auth);
        setMessage('Signed out successfully');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign out failed');
    }
  };

  return (
    <div className="yat-drawer-content">
      {user && !user.email?.includes('anonymous') ? (
        // Logged in state
        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', marginBottom: '10px' }}>
              <strong>Logged in as:</strong>
            </p>
            <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{user.email}</p>
          </div>
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
                color: message.includes('failed') ? '#fca5a5' : '#86efac',
              }}
            >
              {message}
            </p>
          )}
        </div>
      ) : (
        // Not logged in state
        <>
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--line)',
              marginBottom: '15px',
            }}
          >
            <button
              onClick={() => setActiveTab('signin')}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '10px',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                color: activeTab === 'signin' ? 'var(--fg)' : 'var(--muted)',
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: '14px',
                letterSpacing: '.05em',
                borderBottom: activeTab === 'signin' ? '2px solid var(--fg)' : 'none',
              }}
            >
              Sign In
            </button>
            <button
              onClick={() => setActiveTab('register')}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '10px',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                color: activeTab === 'register' ? 'var(--fg)' : 'var(--muted)',
                fontFamily: '"Bebas Neue", Oswald, sans-serif',
                fontSize: '14px',
                letterSpacing: '.05em',
                borderBottom: activeTab === 'register' ? '2px solid var(--fg)' : 'none',
              }}
            >
              Register
            </button>
          </div>

          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn} style={{ padding: '15px' }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
                  Email
                </label>
                <input
                  type="email"
                  name="signInEmail"
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
                  Password
                </label>
                <input
                  type="password"
                  name="signInPassword"
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
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
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          )}

          {activeTab === 'register' && (
            <form onSubmit={handleRegister} style={{ padding: '15px' }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
                  First Name (optional)
                </label>
                <input
                  type="text"
                  name="registerFirstName"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
                  Last Name (optional)
                </label>
                <input
                  type="text"
                  name="registerLastName"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
                  Email
                </label>
                <input
                  type="email"
                  name="registerEmail"
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
                  Password
                </label>
                <input
                  type="password"
                  name="registerPassword"
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'rgba(255, 255, 255, .06)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
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
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}

          {message && (
            <p
              style={{
                marginTop: '15px',
                textAlign: 'center',
                fontSize: '12px',
                color: message.includes('failed') ? '#fca5a5' : '#86efac',
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
