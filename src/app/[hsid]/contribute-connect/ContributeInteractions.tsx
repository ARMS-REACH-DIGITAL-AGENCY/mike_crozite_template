'use client';

import { useEffect, useState } from 'react';
import { PhotoUploadForm } from '@/components/FanDashboard';

export default function ContributeInteractions({ hsid }: { hsid: string }) {
  const [userName, setUserName] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [drawerType, setDrawerType] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((s) => {
        if (s.uid || s.email) {
          setLoggedIn(true);
          setUserName(s.displayName || s.email || '');
        }
      })
      .catch(() => {});

    // Click delegation for upload hotspots
    const handler = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-upload-type], [data-arrow]');
      if (!el) return;
      const type = el.getAttribute('data-upload-type') || el.getAttribute('data-arrow');
      if (type) setDrawerType(type);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Login prompt banner (rendered via portal-like fixed div)
  useEffect(() => {
    if (loggedIn) return;
    const banner = document.createElement('div');
    banner.id = 'contribute-login-banner';
    banner.innerHTML = '';
    return () => { banner.remove(); };
  }, [loggedIn]);

  if (!drawerType) {
    return !loggedIn ? (
      <div style={{
        position: 'fixed', bottom: '80px', left: '16px', right: '16px',
        background: 'rgba(255,215,0,.12)', border: '1px solid #FFD700',
        borderRadius: '8px', padding: '12px 16px', zIndex: 90,
        fontSize: '13px', color: '#FFD700', textAlign: 'center',
      }}>
        You're browsing as a visitor —{' '}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-login-drawer'))}
          style={{ background: 'none', border: 'none', color: '#FFD700', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px', padding: 0, fontWeight: 700 }}
        >
          log in as a Fan
        </button>{' '}
        to upload.
      </div>
    ) : null;
  }

  return (
    <>
      <div onClick={() => setDrawerType(null)} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 100, cursor: 'pointer',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)',
        background: '#0a0a0a', borderLeft: '1px solid #333',
        zIndex: 101, overflowY: 'auto', padding: '24px 20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: 0 }}>Upload</h2>
          <button onClick={() => setDrawerType(null)} style={{
            background: 'transparent', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer',
          }}>×</button>
        </div>
        {loggedIn ? (
          <PhotoUploadForm defaultHsid={hsid} userName={userName} presetType={drawerType} />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Fans Only</h3>
            <p style={{ fontSize: '14px', color: '#888', marginBottom: '24px' }}>
              Log in as a Fan or Superfan to contribute.
            </p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-login-drawer'))}
              style={{
                background: '#FFD700', color: '#000', fontWeight: 700,
                fontSize: '15px', padding: '12px 32px', borderRadius: '8px',
                border: 'none', cursor: 'pointer',
              }}
            >
              Log In / Join Free
            </button>
          </div>
        )}
      </div>
    </>
  );
}
