'use client';

import { useEffect, useState } from 'react';
import { PhotoUploadForm } from '@/components/FanDashboard';

export default function ContributePage() {
  const [userName, setUserName] = useState('');
  const [homeHsid, setHomeHsid] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((s) => {
        setUserName(s.displayName || s.email || '');
        setHomeHsid(s.homeHsid || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 20px 120px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px', color: 'var(--fg)' }}>
        Contribute
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '24px', lineHeight: 1.5 }}>
        Help build the most complete baseball community on the internet.
        Upload photos, share news tips, suggest missing players, or report corrections.
        Every contribution makes the hub better for everyone.
      </p>

      <PhotoUploadForm
        defaultHsid={homeHsid}
        userName={userName}
      />

      {/* Sticky sponsorship footer */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.92) 30%)',
        padding: '32px 20px 16px',
        textAlign: 'center',
        zIndex: 50,
      }}>
        <div style={{
          display: 'inline-block',
          background: 'var(--gold)',
          color: '#000',
          fontWeight: 700,
          fontSize: '14px',
          padding: '12px 28px',
          borderRadius: '8px',
          cursor: 'pointer',
        }}>
          Sponsor a Player Page — $10/mo
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
          Put your business in front of every fan who visits. Cancel anytime.
        </div>
      </div>
    </div>
  );
}
