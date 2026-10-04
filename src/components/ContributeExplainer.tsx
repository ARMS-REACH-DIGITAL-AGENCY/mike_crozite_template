'use client';

import { useEffect, useState } from 'react';
import { PhotoUploadForm } from '@/components/FanDashboard';

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

// Real Hamilton headshots for the strip (from Pete's mockup order)
const HEADSHOTS = [
  { name: 'BELLINGER', img: `${S3_BASE}/players/now-web/bellinger.webp` },
  { name: 'MURPHY', img: `${S3_BASE}/players/now-web/murphy.webp` },
  { name: 'SWIFT', img: `${S3_BASE}/players/now-web/swift.webp` },
  { name: 'MURPHY', img: `${S3_BASE}/players/now-web/murphy2.webp` },
  { name: 'WONG', img: `${S3_BASE}/players/now-web/wong.webp` },
  { name: 'HAMEL', img: `${S3_BASE}/players/now-web/hamel.webp` },
];

// ---------------------------------------------------------------------------
// Yellow arrow label (matches Pete's mockup style)
// ---------------------------------------------------------------------------
function ArrowLabel({ text, sub, onClick }: { text: string; sub?: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', marginBottom: '8px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ fontSize: '24px', color: '#FFD700' }}>➤</span>
        <span style={{
          fontSize: '15px', fontWeight: 800, color: '#fff',
          letterSpacing: '.03em', textTransform: 'uppercase',
        }}>
          {text}
        </span>
      </div>
      {sub && (
        <div style={{ fontSize: '13px', color: '#aaa', marginLeft: '32px', marginTop: '2px' }}>
          ({sub})
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload drawer
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
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 100, cursor: 'pointer',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)',
        background: '#0a0a0a', borderLeft: '1px solid #333',
        zIndex: 101, overflowY: 'auto', padding: '24px 20px',
        animation: 'slideInRight .25s ease-out',
      }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: 0 }}>Upload</h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer',
          }}>×</button>
        </div>
        {loggedIn ? (
          <PhotoUploadForm defaultHsid={homeHsid} userName={userName} presetType={type} />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Fans Only</h3>
            <p style={{ fontSize: '14px', color: '#888', marginBottom: '24px', lineHeight: 1.5 }}>
              You need to be logged in as a Fan or Superfan to contribute.
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

// ---------------------------------------------------------------------------
// Main explainer — replicates Pete's mockup with real page elements
// ---------------------------------------------------------------------------
export default function ContributeExplainer({ defaultHsid }: { defaultHsid?: string }) {
  const [userName, setUserName] = useState('');
  const [homeHsid, setHomeHsid] = useState(defaultHsid || '');
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
          if (!defaultHsid) setHomeHsid(s.homeHsid || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [defaultHsid]);

  const open = (type: string) => setDrawerType(type);

  if (loading) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: '#888' }}>Loading…</div>;
  }

  return (
    <div style={{ background: '#000', color: '#fff', paddingBottom: '40px' }}>

      {/* Header like the hub page */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid #222',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>☰</span>
          <span style={{ fontSize: '20px' }}>👤</span>
        </div>
        <div style={{ fontSize: '18px', fontWeight: 800 }}>YAT?STATS</div>
      </div>

      {/* School header with logo */}
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          onClick={() => open('school_logo')}
          style={{
            width: '64px', height: '64px', background: '#1a1a1a', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '32px', fontWeight: 800, color: '#FFD700', cursor: 'pointer',
            border: '2px solid transparent',
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#FFD700'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
        >
          H
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#888' }}>CHANDLER, AZ</div>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>HAMILTON HIGH SCHOOL</div>
          <div style={{ fontSize: '13px', color: '#aaa' }}>CONNECT & CONTRIBUTE PORTAL</div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        <ArrowLabel text="High School Logo" onClick={() => open('school_logo')} />
        <p style={{ fontSize: '13px', color: '#888', marginLeft: '32px', marginBottom: '20px' }}>
          The official crest. If your school's hub is missing the real logo, you can fix that here.
        </p>
      </div>

      {/* Headshot strip (row 3) */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{
          display: 'flex', overflowX: 'auto', gap: '2px',
          padding: '0 0 8px 0',
        }}>
          {HEADSHOTS.map((h, i) => (
            <div key={i}
              onClick={() => open('headshot')}
              style={{ flexShrink: 0, width: '110px', cursor: 'pointer', position: 'relative' }}
            >
              <div style={{
                width: '110px', height: '130px', background: '#1a1a1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '40px', overflow: 'hidden',
              }}>
                <img src={h.img} alt={h.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <div style={{
                textAlign: 'center', fontSize: '11px', fontWeight: 700,
                padding: '4px 0', letterSpacing: '.05em',
              }}>
                {h.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        <ArrowLabel
          text="Current Official Headshot"
          onClick={() => open('headshot')}
        />
        <p style={{ fontSize: '13px', color: '#888', marginLeft: '32px', marginBottom: '8px' }}>
          Click any headshot to upload. Tell us what year it's from.
        </p>
      </div>

      {/* Polaroid CTA */}
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          onClick={() => open('flip_card')}
          style={{
            width: '60px', height: '70px', background: '#fff', borderRadius: '4px',
            padding: '4px 4px 16px 4px', cursor: 'pointer', transform: 'rotate(-5deg)',
            boxShadow: '0 2px 8px rgba(0,0,0,.5)',
          }}
        >
          <div style={{ width: '100%', height: '100%', background: '#111' }} />
        </div>
        <div
          onClick={() => open('flip_card')}
          style={{ cursor: 'pointer' }}
        >
          <span style={{ fontSize: '20px', color: '#FFD700' }}>←</span>
          <span style={{
            fontSize: '16px', fontWeight: 800, color: '#FFD700',
            marginLeft: '8px', letterSpacing: '.03em',
          }}>
            START HERE TO UPLOAD
          </span>
        </div>
      </div>

      {!loggedIn && (
        <p style={{ fontSize: '13px', color: '#FFD700', padding: '0 16px', marginBottom: '16px' }}>
          You're browsing as a visitor —{' '}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-login-drawer'))}
            style={{ background: 'none', border: 'none', color: '#FFD700', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px', padding: 0 }}
          >
            log in as a Fan
          </button>{' '}
          to upload.
        </p>
      )}

      {/* Section 5: Flip cards (one row of 3) */}
      <div style={{ padding: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '16px', color: '#666' }}>
          FLIP CARDS
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

          {/* Flip card back */}
          <div>
            <ArrowLabel text="Flip Card Back" sub="Current team hero image" onClick={() => open('back_hero')} />
            <div
              onClick={() => open('back_hero')}
              style={{
                background: '#111', borderRadius: '12px', overflow: 'hidden',
                cursor: 'pointer', border: '2px solid transparent',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#FFD700'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
            >
              <div style={{
                height: '160px', background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', color: '#555',
              }}>
                [Action shot in current uniform]
              </div>
              <div style={{ padding: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: 800 }}>CODY BELLINGER</div>
                <div style={{ fontSize: '11px', color: '#888' }}>NEW YORK YANKEES</div>
                <div style={{
                  marginTop: '8px', padding: '8px', background: '#1a1a1a',
                  borderRadius: '6px', fontSize: '11px', color: '#aaa',
                }}>
                  📰 Latest news appears here in the Fun Zone tab
                </div>
              </div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <ArrowLabel text="News Tip" onClick={() => open('back_hero')} />
              <p style={{ fontSize: '12px', color: '#888', marginLeft: '32px' }}>
                Your news tip appears on the back of the flip card. That's why we need them.
              </p>
            </div>
          </div>

          {/* Flip card front */}
          <div>
            <ArrowLabel text="Flip Card Front" sub="High school image" onClick={() => open('flip_card')} />
            <div
              onClick={() => open('flip_card')}
              style={{
                background: '#111', borderRadius: '12px', overflow: 'hidden',
                cursor: 'pointer', border: '2px solid transparent',
                maxWidth: '240px',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#FFD700'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
            >
              <div style={{
                aspectRatio: '5/7', background: 'linear-gradient(135deg, #2a1a1a, #3e1621)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', color: '#555',
              }}>
                [High school photo]
              </div>
              <div style={{ padding: '12px' }}>
                <div style={{ fontSize: '20px', fontWeight: 800 }}>DREW<br />SWIFT</div>
                <div style={{ fontSize: '11px', color: '#888' }}>Las Vegas Aviators</div>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: '#FFD700', marginTop: '8px' }}>
              High school era only. Baby photos and pro photos will be rejected.
            </p>
          </div>

          {/* Third card placeholder */}
          <div>
            <div style={{
              background: '#0a0a0a', borderRadius: '12px', border: '1px dashed #333',
              aspectRatio: '5/7', maxWidth: '240px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', color: '#444',
            }}>
              Third flip card
            </div>
          </div>

        </div>
      </div>

      {/* Section 5.5: Player profile page elements */}
      <div style={{ padding: '16px', borderTop: '1px solid #222', marginTop: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '4px', color: '#666' }}>
          PLAYER PROFILE PAGE
        </h2>
        <p style={{ fontSize: '12px', color: '#555', marginBottom: '16px' }}>
          A whole different page — here's where your uploads appear there
        </p>

        <div style={{ marginBottom: '20px' }}>
          <ArrowLabel
            text="Career Path Timeline Annual Hero Image"
            sub="College or Pro"
            onClick={() => open('timeline_hero')}
          />
          <div
            onClick={() => open('timeline_hero')}
            style={{
              background: '#111', borderRadius: '8px', padding: '16px',
              cursor: 'pointer', border: '2px solid transparent',
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#FFD700'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>DOM HAMEL</div>
            <div style={{
              height: '80px', background: 'linear-gradient(90deg, #1a1a2e, #16213e)',
              borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', color: '#555', marginBottom: '8px',
            }}>
              [Timeline hero image]
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {['2019', '2020', '2021', '2022'].map((y) => (
                <div key={y} style={{ fontSize: '11px', color: '#666' }}>{y} →</div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <ArrowLabel
            text="Career Path Timeline Next-Level Team Logo"
            sub="College or Pro"
            onClick={() => open('team_logo')}
          />
          <div
            onClick={() => open('team_logo')}
            style={{
              display: 'flex', gap: '12px', cursor: 'pointer',
              padding: '12px', background: '#111', borderRadius: '8px',
              border: '2px solid transparent', width: 'fit-content',
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#FFD700'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
          >
            {['⚾', '🏟️', '🧢'].map((e, i) => (
              <div key={i} style={{
                width: '48px', height: '48px', background: '#1a1a1a',
                borderRadius: '8px', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '24px',
              }}>{e}</div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: '#888', marginLeft: '32px', marginTop: '8px' }}>
            College or pro team logos on the timeline and player pages.
          </p>
        </div>
      </div>

      {/* Section 6: Banner ad (real position) */}
      <div style={{ marginTop: '24px', borderTop: '1px solid #222', paddingTop: '16px' }}>
        <div style={{ padding: '0 16px', marginBottom: '8px' }}>
          <ArrowLabel text="Sponsor a Player Page" sub="Your business here" onClick={() => {}} />
        </div>
        <div style={{
          background: 'linear-gradient(90deg, #1a1a1a, #2a2a1a)',
          padding: '20px 16px', textAlign: 'center',
          borderTop: '2px solid #FFD700', borderBottom: '2px solid #FFD700',
        }}>
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>
            HEY, THEY'RE GIVING AWAY
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#FFD700', marginBottom: '8px' }}>
            YOUR MESSAGE HERE
          </div>
          <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '12px' }}>
            Sponsor a player page — $10/mo. Your banner ad, your link, every fan sees it.
          </div>
          <button style={{
            background: '#FFD700', color: '#000', fontWeight: 700,
            fontSize: '14px', padding: '10px 24px', borderRadius: '8px',
            border: 'none', cursor: 'pointer',
          }}>
            Become a Sponsor →
          </button>
        </div>
      </div>

      <UploadDrawer
        type={drawerType}
        onClose={() => setDrawerType(null)}
        userName={userName}
        homeHsid={homeHsid}
        loggedIn={loggedIn}
      />
    </div>
  );
}
