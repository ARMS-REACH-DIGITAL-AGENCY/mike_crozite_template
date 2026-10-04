'use client';

import { useEffect, useState } from 'react';
import PlayerCard from "@/components/yatstats/PlayerCard";
import { PhotoUploadForm } from '@/components/FanDashboard';

type Row = Record<string, unknown>;

function ArrowLabel({ text, sub, onClick }: { text: string; sub?: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', marginBottom: '8px' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
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
      }}>
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

export default function ContributeClient({
  hsid,
  schoolName,
  crestUrl,
  players,
  stripPlayers,
  frontImageMap,
  headshotMap,
  shareBaseUrl,
}: {
  hsid: string;
  schoolName: string;
  crestUrl: string;
  players: Row[];
  stripPlayers: Row[];
  frontImageMap: Record<string, { image_url: string }>;
  headshotMap: Record<string, { image_url: string }>;
  shareBaseUrl: string;
}) {
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
  }, []);

  const open = (type: string) => setDrawerType(type);

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', paddingBottom: '40px' }}>

      {/* School header */}
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <img src={crestUrl} alt="School crest"
          onClick={() => open('school_logo')}
          style={{ width: '64px', height: '64px', cursor: 'pointer', objectFit: 'contain' }}
        />
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>{schoolName.toUpperCase()}</div>
          <div style={{ fontSize: '13px', color: '#aaa' }}>CONNECTING CONTRIBUTE</div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        <ArrowLabel text="High School Logo" onClick={() => open('school_logo')} />
      </div>

      {/* Row 3: Headshot strip (identical to homepage) */}
      <div style={{ display: 'flex', overflowX: 'auto', gap: '2px', padding: '8px 0' }}>
        {stripPlayers.map((p) => {
          const pid = String(p.playerid);
          const hs = headshotMap[pid]?.image_url;
          const name = String(p.last_name || p.player_name || '?').toUpperCase();
          return (
            <div key={pid} onClick={() => open('headshot')}
              style={{ flexShrink: 0, width: '110px', cursor: 'pointer' }}>
              <div style={{ width: '110px', height: '130px', background: '#1a1a1a', overflow: 'hidden' }}>
                {hs ? (
                  <img src={hs} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>👤</div>
                )}
              </div>
              <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, padding: '4px 0' }}>
                {name}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '0 16px', marginBottom: '16px' }}>
        <ArrowLabel text="Current Official Headshot" onClick={() => open('headshot')} />
      </div>

      {/* Polaroid CTA */}
      <div style={{ padding: '0 16px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div onClick={() => open('flip_card')}
          style={{
            width: '60px', height: '70px', background: '#fff', borderRadius: '4px',
            padding: '4px 4px 16px 4px', cursor: 'pointer', transform: 'rotate(-5deg)',
          }}>
          <div style={{ width: '100%', height: '100%', background: '#111' }} />
        </div>
        <div onClick={() => open('flip_card')} style={{ cursor: 'pointer' }}>
          <span style={{ fontSize: '20px', color: '#FFD700' }}>←</span>
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#FFD700', marginLeft: '8px' }}>
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

      {/* Section 5: Real flip cards (3 players) */}
      <div style={{ padding: '16px' }}>
        <div style={{ marginBottom: '12px' }}>
          <ArrowLabel text="Flip Card Front" sub="High school image" onClick={() => open('flip_card')} />
          <ArrowLabel text="Flip Card Back" sub="Current team hero image" onClick={() => open('back_hero')} />
        </div>
        <div className="yat-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {players.map((p) => {
            const pid = String(p.playerid);
            return (
              <PlayerCard
                key={pid}
                player={p}
                resolvedHsid={hsid}
                frontImageUrl={frontImageMap[pid]?.image_url ?? null}
                headshotUrl={headshotMap[pid]?.image_url ?? null}
                shareBaseUrl={shareBaseUrl}
                schoolName={schoolName}
                schoolLocation=""
              />
            );
          })}
        </div>
        <p style={{ fontSize: '12px', color: '#888', marginTop: '12px' }}>
          <span style={{ color: '#FFD700' }}>➤</span>{' '}
          <strong style={{ color: '#fff' }}>News Tip:</strong> Your news tip appears on the
          back of the flip card in the Fun Zone tab. That's why we need them.
        </p>
      </div>

      {/* Section 5.5: Player profile elements */}
      <div style={{ padding: '16px', borderTop: '1px solid #222' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#666', marginBottom: '12px' }}>
          PLAYER PROFILE PAGE
        </h2>
        <ArrowLabel text="Career Path Timeline Annual Hero Image" sub="College or Pro" onClick={() => open('timeline_hero')} />
        <div onClick={() => open('timeline_hero')}
          style={{ background: '#111', borderRadius: '8px', padding: '16px', cursor: 'pointer', marginBottom: '16px' }}>
          <div style={{ height: '80px', background: '#1a1a1a', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '13px' }}>
            [Timeline hero — click to upload]
          </div>
        </div>
        <ArrowLabel text="Next-Level Team Logo" sub="College or Pro" onClick={() => open('team_logo')} />
        <div onClick={() => open('team_logo')}
          style={{ display: 'flex', gap: '12px', cursor: 'pointer', padding: '12px', background: '#111', borderRadius: '8px', width: 'fit-content' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ width: '48px', height: '48px', background: '#1a1a1a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🏟️</div>
          ))}
        </div>
      </div>

      {/* Section 6: Banner ad */}
      <div style={{ marginTop: '24px', borderTop: '1px solid #222', paddingTop: '16px' }}>
        <div style={{ padding: '0 16px', marginBottom: '8px' }}>
          <ArrowLabel text="Sponsor a Player Page" sub="Your business here" onClick={() => {}} />
        </div>
        <div style={{
          background: '#1a1a1a', padding: '24px 16px', textAlign: 'center',
          borderTop: '2px solid #FFD700', borderBottom: '2px solid #FFD700',
        }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#FFD700', marginBottom: '8px' }}>
            YOUR MESSAGE HERE
          </div>
          <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '12px' }}>
            Sponsor a player page — $10/mo. Your banner ad, your link.
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
        homeHsid={hsid}
        loggedIn={loggedIn}
      />
    </div>
  );
}
