'use client';

import { useEffect, useState } from 'react';
import { PhotoUploadForm } from '@/components/FanDashboard';

// ---------------------------------------------------------------------------
// Upload drawer — slides in from the right with the form pre-set to one type
// ---------------------------------------------------------------------------
function UploadDrawer({ type, onClose, userName, homeHsid, loggedIn }: {
  type: string | null;
  onClose: () => void;
  userName: string;
  homeHsid: string;
  loggedIn: boolean;
}) {
  if (!type) return null;
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
          zIndex: 100, cursor: 'pointer',
        }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)',
        background: 'var(--bg, #0a0a0a)', borderLeft: '1px solid var(--line, #333)',
        zIndex: 101, overflowY: 'auto', padding: '24px 20px',
        animation: 'slideInRight .25s ease-out',
      }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--fg, #fff)', margin: 0 }}>
            Upload
          </h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--muted, #888)',
            fontSize: '24px', cursor: 'pointer',
          }}>×</button>
        </div>
        {loggedIn ? (
          <PhotoUploadForm defaultHsid={homeHsid} userName={userName} presetType={type} />
        ) : (
          <LoginPrompt />
        )}
      </div>
    </>
  );
}

function LoginPrompt() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
      <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--fg, #fff)', marginBottom: '8px' }}>
        Fans Only
      </h3>
      <p style={{ fontSize: '14px', color: 'var(--muted, #888)', marginBottom: '24px', lineHeight: 1.5 }}>
        You need to be logged in as a Fan or Superfan to contribute.
        It's free and takes 30 seconds.
      </p>
      <button
        onClick={() => {
          // Open the account/login drawer
          const evt = new CustomEvent('open-login-drawer');
          window.dispatchEvent(evt);
        }}
        style={{
          background: 'var(--gold, #ffd700)', color: '#000', fontWeight: 700,
          fontSize: '15px', padding: '12px 32px', borderRadius: '8px',
          border: 'none', cursor: 'pointer',
        }}
      >
        Log In / Join Free
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clickable hotspot card — mimics the mockup's annotated callouts
// ---------------------------------------------------------------------------
function Hotspot({ label, sub, onClick, children, wide }: {
  label: string;
  sub?: string;
  onClick: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: '2px dashed rgba(255,215,0,.4)',
        borderRadius: '12px',
        padding: '16px',
        position: 'relative',
        transition: 'border-color .2s, transform .2s',
        gridColumn: wide ? '1 / -1' : undefined,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold, #ffd700)'; e.currentTarget.style.transform = 'scale(1.01)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,215,0,.4)'; e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <div style={{
        position: 'absolute', top: '-12px', left: '16px',
        background: 'var(--gold, #ffd700)', color: '#000',
        fontSize: '11px', fontWeight: 800, letterSpacing: '.05em',
        padding: '2px 10px', borderRadius: '10px',
        textTransform: 'uppercase',
      }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: '11px', color: 'var(--muted, #888)', marginBottom: '8px', marginTop: '4px' }}>
          {sub}
        </div>
      )}
      {children}
      <div style={{
        marginTop: '12px', textAlign: 'center',
        fontSize: '13px', fontWeight: 700, color: 'var(--gold, #ffd700)',
      }}>
        📸 Click to upload →
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main contribute page — visual explainer matching Pete's mockup
// ---------------------------------------------------------------------------
export default function ContributePage() {
  const [userName, setUserName] = useState('');
  const [homeHsid, setHomeHsid] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [drawerType, setDrawerType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((s) => {
        if (s.uid || s.email) {
          setLoggedIn(true);
          setUserName(s.displayName || s.email || '');
          setHomeHsid(s.homeHsid || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openUpload = (type: string) => setDrawerType(type);

  if (loading) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted, #888)' }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 20px 140px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '8px', color: 'var(--fg, #fff)' }}>
        Contribute
      </h1>
      <p style={{ fontSize: '15px', color: 'var(--muted, #888)', marginBottom: '8px', lineHeight: 1.6 }}>
        Every photo on YAT?STATS comes from fans like you. Click any section below
        to upload — we'll show you exactly where your photo will appear.
      </p>
      {!loggedIn && (
        <p style={{ fontSize: '13px', color: 'var(--gold, #ffd700)', marginBottom: '24px' }}>
          You're browsing as a visitor — you can see everything, but you'll need to{' '}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-login-drawer'))}
            style={{ background: 'none', border: 'none', color: 'var(--gold, #ffd700)', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px', padding: 0 }}
          >
            log in as a Fan
          </button>{' '}
          to upload.
        </p>
      )}
      {loggedIn && userName && (
        <p style={{ fontSize: '13px', color: 'var(--muted, #888)', marginBottom: '24px' }}>
          Thank you, {userName} — we appreciate your participation!
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

        {/* 1. High School Logo */}
        <Hotspot label="High School Logo" sub="Top-left of every hub page" onClick={() => openUpload('school_logo')}>
          <div style={{
            width: '80px', height: '80px', background: '#1a1a1a', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '36px', fontWeight: 800, color: 'var(--gold, #ffd700)',
          }}>H</div>
          <p style={{ fontSize: '12px', color: 'var(--muted, #888)', marginTop: '8px' }}>
            The official crest for the high school. PNG format, we'll optimize it.
          </p>
        </Hotspot>

        {/* 2. Current Headshot */}
        <Hotspot label="Headshot" sub="Row 3 thumbnails — click scrolls to flip card" onClick={() => openUpload('headshot')}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['A', 'B', 'C', 'D'].map((n, i) => (
              <div key={i} style={{
                width: '60px', height: '84px', background: '#1a1a1a', borderRadius: '4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', color: '#555',
              }}>👤</div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--muted, #888)', marginTop: '8px' }}>
            The current official headshot. Tell us what year it's from.
          </p>
        </Hotspot>

        {/* 3. Flip Card Front */}
        <Hotspot label="High School Image" sub="Front of flip card" onClick={() => openUpload('flip_card')}>
          <div style={{
            width: '120px', height: '168px', background: '#1a1a1a', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', color: '#555', textAlign: 'center', padding: '8px',
          }}>
            5×7<br />Portrait
          </div>
          <p style={{ fontSize: '12px', color: 'var(--muted, #888)', marginTop: '8px' }}>
            <strong style={{ color: 'var(--gold, #ffd700)' }}>High school era only.</strong> This is
            the "then" photo — baby photos and pro photos will be rejected.
          </p>
        </Hotspot>

        {/* 4. Flip Card Back */}
        <Hotspot label="Flip Card Back" sub="Current team hero image" onClick={() => openUpload('back_hero')}>
          <div style={{
            width: '100%', height: '100px', background: '#1a1a1a', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', color: '#555',
          }}>
            Action shot in current uniform
          </div>
          <p style={{ fontSize: '12px', color: 'var(--muted, #888)', marginTop: '8px' }}>
            The hero image on the back of the flip card — current team, action shot.
          </p>
        </Hotspot>

        {/* 5. Career Timeline Hero */}
        <Hotspot label="Career Timeline Annual Hero" sub="Year-by-year journey" onClick={() => openUpload('timeline_hero')}>
          <div style={{
            width: '100%', height: '60px', background: '#1a1a1a', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
            fontSize: '12px', color: '#555',
          }}>
            <span>2019</span><span>→</span><span>2020</span><span>→</span><span>2021</span><span>→</span><span>2022</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--muted, #888)', marginTop: '8px' }}>
            The hero image for each year on the Career Path timeline. Action shots preferred.
          </p>
        </Hotspot>

        {/* 6. Next-Level Team Logo */}
        <Hotspot label="Next-Level Team Logo" sub="College / Pro" onClick={() => openUpload('team_logo')}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['⚾', '🏟️', '🧢'].map((e, i) => (
              <div key={i} style={{
                width: '50px', height: '50px', background: '#1a1a1a', borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
              }}>{e}</div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--muted, #888)', marginTop: '8px' }}>
            College or pro team logos that appear on the timeline and player pages.
          </p>
        </Hotspot>

      </div>

      {/* Other ways to contribute */}
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--fg, #fff)', marginTop: '40px', marginBottom: '16px' }}>
        More Ways to Contribute
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        {[
          { icon: '📰', label: 'Submit a News Tip', desc: 'Saw a great story about an alum?' },
          { icon: '⚾', label: 'Suggest a Missing Player', desc: 'Know someone we don\'t have?' },
          { icon: '🔧', label: 'Report a Correction', desc: 'Spotted bad data?' },
          { icon: '📍', label: 'Where Are They Now?', desc: 'Update us on a retired player' },
          { icon: '🎥', label: 'Video Shoutout', desc: 'Coming soon — personalized videos from players', disabled: true },
        ].map((item, i) => (
          <div key={i} style={{
            border: '1px solid var(--line, #333)', borderRadius: '8px',
            padding: '16px', textAlign: 'center',
            cursor: item.disabled ? 'default' : 'pointer',
            opacity: item.disabled ? 0.5 : 1,
          }}
          onClick={() => { if (!item.disabled) window.dispatchEvent(new CustomEvent('open-login-drawer')); }}
          >
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>{item.icon}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fg, #fff)', marginBottom: '4px' }}>{item.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted, #888)' }}>{item.desc}</div>
          </div>
        ))}
      </div>

      <UploadDrawer
        type={drawerType}
        onClose={() => setDrawerType(null)}
        userName={userName}
        homeHsid={homeHsid}
        loggedIn={loggedIn}
      />

      {/* Sticky sponsorship footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.95) 35%)',
        padding: '36px 20px 16px', textAlign: 'center', zIndex: 50,
      }}>
        <div style={{
          display: 'inline-block', background: 'var(--gold, #ffd700)', color: '#000',
          fontWeight: 700, fontSize: '14px', padding: '12px 28px',
          borderRadius: '8px', cursor: 'pointer',
        }}>
          Sponsor a Player Page — $10/mo
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted, #888)', marginTop: '8px' }}>
          Put your business in front of every fan. Cancel anytime.
        </div>
      </div>
    </div>
  );
}
