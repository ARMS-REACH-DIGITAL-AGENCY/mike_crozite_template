'use client';

import { useEffect, useState } from 'react';
import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from '@/lib/firebase';
import type { User } from 'firebase/auth';

interface AccountDrawerProps {
  subdomain: string;
}

function PasswordInput({ name, required = true }: { name: string; required?: boolean }) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type={visible ? 'text' : 'password'}
        name={name}
        required={required}
        style={{
          width: '100%',
          padding: '10px',
          paddingRight: '40px',
          borderRadius: '8px',
          border: '1px solid var(--line)',
          background: 'rgba(255, 255, 255, .06)',
          color: 'var(--ink)',
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

export default function AccountDrawer({ subdomain }: AccountDrawerProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');
  const [displayName, setDisplayName] = useState('');

  // Listen to Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Try to get display name from Firebase profile or localStorage
        const storedName = localStorage.getItem(`yat_firstName_${currentUser.uid}`);
        setDisplayName(currentUser.displayName || storedName || '');
      } else {
        setDisplayName('');
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const email = (e.currentTarget.elements.namedItem('signInEmail') as HTMLInputElement).value;
      const password = (e.currentTarget.elements.namedItem('signInPassword') as HTMLInputElement).value;

      await signInWithEmailAndPassword(auth, email, password);
      setMessage('Sign in successful!');
      setTimeout(() => setMessage(''), 1500);
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
      const firstName = (e.currentTarget.elements.namedItem('registerFirstName') as HTMLInputElement)?.value?.trim() || '';
      const lastName = (e.currentTarget.elements.namedItem('registerLastName') as HTMLInputElement)?.value?.trim() || '';

      if (!firstName || !lastName) {
        setMessage('First name and last name are required.');
        setIsLoading(false);
        return;
      }

      // Create user in Firebase
      await createUserWithEmailAndPassword(auth, email, password);

      // Store first name in localStorage for greeting
      if (auth.currentUser) {
        localStorage.setItem(`yat_firstName_${auth.currentUser.uid}`, firstName);
        setDisplayName(firstName);
      }

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
        throw new Error(errorData.error || 'Failed to sync to CRM');
      }

      setMessage('Registration successful! Welcome to YAT?STATS.');
      setTimeout(() => setMessage(''), 1500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setMessage('Signed out successfully');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign out failed');
    }
  };

  return (
    <div className="yat-drawer-content">
      {user && !user.isAnonymous ? (
        // Logged in state
        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '18px', marginBottom: '10px', fontFamily: '"Bebas Neue", Oswald, sans-serif', letterSpacing: '.05em' }}>
              Hi {displayName || 'Fan'}!
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
                <PasswordInput name="signInPassword" />
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
                  First Name
                </label>
                <input
                  type="text"
                  name="registerFirstName"
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
                  Last Name
                </label>
                <input
                  type="text"
                  name="registerLastName"
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
                <PasswordInput name="registerPassword" />
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
