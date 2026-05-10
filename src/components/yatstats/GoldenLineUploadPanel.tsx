'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const STAGE_OPTIONS = [
  'Youth Baseball',
  'Middle School',
  'High School',
  'College',
  'Minor Leagues',
  'Major Leagues',
  'Fan Memory',
];

type FanSession = {
  uid: string;
  email: string;
  contactId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  plan?: string | null;
  isSuperfan?: boolean;
  homeHsid?: string | null;
  homeSchoolName?: string | null;
};

function normalizePlan(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function getDisplayName(session: FanSession | null) {
  if (!session) return '';
  const first = String(session.firstName || '').trim();
  const last = String(session.lastName || '').trim();
  const name = [first, last].filter(Boolean).join(' ').trim();
  if (name) return name;
  return String(session.email || '').trim();
}

function openAccountDrawer(tab: 'signin' | 'register') {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: tab }));

  const drawer = document.getElementById('drawerAccount');
  const mask = document.getElementById('drawerMask');

  drawer?.classList.add('open', 'is-open', 'active');
  drawer?.setAttribute('aria-hidden', 'false');
  mask?.classList.add('open', 'is-open', 'active');
}

export default function GoldenLineUploadPanel() {
  const playerProfile = usePlayerProfile();
  const playerId = String(playerProfile?.playerId || '').trim();
  const hsid = String(playerProfile?.playerHsid || '').trim();
  const playerName = String(playerProfile?.playerName || 'this player').trim();
  const firstName = playerName.split(' ')[0] || 'this player';

  const [stage, setStage] = useState('Youth Baseball');
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [session, setSession] = useState<FanSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const isLoggedIn = Boolean(session?.uid && session?.email);
  const isSuperfan = Boolean(session?.isSuperfan || normalizePlan(session?.plan) === 'superfan');
  const contributorName = useMemo(() => getDisplayName(session), [session]);
  const sessionEmail = String(session?.email || '').trim();

  async function refreshSession() {
    setSessionLoading(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();

      if (data?.authenticated && data?.session?.uid) {
        setSession(data.session as FanSession);
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }

  useEffect(() => {
    const updateStage = () => {
      try {
        const saved = sessionStorage.getItem('yat:goldenLineStage');
        if (saved && STAGE_OPTIONS.includes(saved)) setStage(saved);
      } catch {}
    };

    updateStage();
    refreshSession();

    const handleAuthChange = () => refreshSession();
    window.addEventListener('yat:golden-line-stage', updateStage);
    window.addEventListener('yat-auth-success', handleAuthChange);
    window.addEventListener('yat-sign-out', handleAuthChange);

    return () => {
      window.removeEventListener('yat:golden-line-stage', updateStage);
      window.removeEventListener('yat-auth-success', handleAuthChange);
      window.removeEventListener('yat-sign-out', handleAuthChange);
    };
  }, []);

  function handlePreview(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPreviewUrl('');
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isLoggedIn) {
      setUploadStatus('Please sign in before submitting a Golden Line memory.');
      openAccountDrawer('signin');
      return;
    }

    if (!isSuperfan) {
      setUploadStatus('Photo uploads are currently available to Superfans only.');
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set('playerId', playerId);
    formData.set('hsid', hsid);
    formData.set('stage', stage);
    formData.set('playerName', playerName);
    formData.set('pageUrl', typeof window !== 'undefined' ? window.location.href : '');
    formData.set('firebaseUid', session?.uid || '');
    formData.set('contactId', session?.contactId || '');
    formData.set('contributorName', contributorName || 'YAT?STATS Fan');
    formData.set('contributorEmail', sessionEmail);
    formData.set('contributorRole', session?.role || 'fan');
    formData.set('contributorPlan', session?.plan || (isSuperfan ? 'superfan' : 'fan'));

    setIsUploading(true);
    setUploadStatus('Uploading memory...');

    try {
      const res = await fetch('/api/player-moments', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setUploadStatus('Uploaded. It is pending review and should appear in the Golden Line after refresh.');
      form.reset();
      setPreviewUrl('');
      window.dispatchEvent(new CustomEvent('yat:golden-line-uploaded', { detail: data.moment }));
    } catch (error: any) {
      setUploadStatus(error?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  if (sessionLoading) {
    return (
      <div className="glu-panel glu-panel-single">
        <div className="glu-explainer">
          <div className="glu-kicker">The Golden Line</div>
          <h2>Checking your fan access...</h2>
          <p>Golden Line photo submissions are connected to your signed-in YAT?STATS fan account.</p>
        </div>
        <PanelStyles />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="glu-panel glu-panel-single">
        <div className="glu-explainer">
          <div className="glu-kicker">The Golden Line</div>
          <h2>Sign in to submit a memory for {firstName}.</h2>
          <p>
            Golden Line submissions are tied to a real YAT?STATS fan account. Sign in or create a free fan account so the memory is saved with your identity and connected to your ARMS contact record.
          </p>
          <div className="glu-gate-actions">
            <button type="button" onClick={() => openAccountDrawer('signin')}>Log In</button>
            <button type="button" onClick={() => openAccountDrawer('register')}>Join Free</button>
          </div>
        </div>
        <PanelStyles />
      </div>
    );
  }

  if (!isSuperfan) {
    return (
      <div className="glu-panel glu-panel-single">
        <div className="glu-explainer">
          <div className="glu-kicker">The Golden Line</div>
          <h2>Photo uploads are a Superfan feature.</h2>
          <p>
            You are signed in as {contributorName || 'a YAT?STATS fan'}. For now, Golden Line photo uploads are restricted to Superfans so every submission is tied to a verified fan account and easier to moderate.
          </p>
          <div className="glu-identity-card">
            <span>Signed in as</span>
            <strong>{contributorName || sessionEmail}</strong>
            <em>{sessionEmail}</em>
          </div>
          <div className="glu-gate-actions">
            <button type="button" onClick={() => openAccountDrawer('signin')}>Open Account</button>
          </div>
        </div>
        <PanelStyles />
      </div>
    );
  }

  return (
    <div className="glu-panel">
      <div className="glu-explainer">
        <div className="glu-kicker">The Golden Line</div>
        <h2>Upload a memory from {firstName}&apos;s baseball journey.</h2>
        <p>
          This submission will be saved under your YAT?STATS identity and synced into ARMS, so the memory connects back to the fan who shared it.
        </p>
        <div className="glu-identity-card">
          <span>Submitting as</span>
          <strong>{contributorName || sessionEmail}</strong>
          <em>{sessionEmail}</em>
        </div>
      </div>

      <form className="glu-form" onSubmit={handleSubmit}>
        <label>
          Photo stage
          <select name="stage" value={stage} onChange={(event) => setStage(event.target.value)}>
            {STAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>

        <label>
          Date photo was taken
          <input name="photoTakenDate" type="date" />
        </label>

        <label>
          Relationship / role
          <input name="relationship" placeholder="Parent, coach, teammate, alumni, fan..." />
        </label>

        <label className="glu-wide">
          Memory title
          <input name="title" placeholder="Example: First travel ball tournament" />
        </label>

        <label className="glu-wide">
          Caption / memory
          <textarea name="caption" rows={3} placeholder="I remember this because..." />
        </label>

        <label>
          Upload photo
          <input name="photo" type="file" accept="image/*" required onChange={handlePreview} />
        </label>

        {previewUrl && (
          <div className="glu-preview">
            <img src={previewUrl} alt="Selected upload preview" />
          </div>
        )}

        <div className="glu-actions">
          <button type="submit" disabled={isUploading || !playerId}>{isUploading ? 'Uploading...' : 'Submit Memory'}</button>
          <span>{uploadStatus || 'Submitted photos are saved as pending memories.'}</span>
        </div>
      </form>

      <PanelStyles />
    </div>
  );
}

function PanelStyles() {
  return (
    <style jsx>{`
      .glu-panel {
        width: min(980px, 100%);
        margin: 0 auto;
        padding: 28px 18px 18px;
        display: grid;
        grid-template-columns: minmax(220px, 34%) minmax(0, 1fr);
        gap: 22px;
        color: #f5f5f5;
      }
      .glu-panel-single { grid-template-columns: minmax(0, 720px); justify-content: center; }
      .glu-explainer { border-left: 4px solid #f5c85a; padding-left: 18px; }
      .glu-kicker { color: #f5c85a; font: 800 11px/1 Oswald, sans-serif; letter-spacing: .16em; text-transform: uppercase; }
      .glu-explainer h2 { margin: 8px 0 10px; font: 800 clamp(28px, 4vw, 48px)/.92 'Bebas Neue', Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
      .glu-explainer p { margin: 0; color: rgba(255,255,255,.72); font: 400 14px/1.45 system-ui, sans-serif; }
      .glu-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 14px; border: 1px solid rgba(245,200,90,.28); background: rgba(255,255,255,.045); }
      .glu-form label { display: grid; gap: 4px; color: rgba(255,255,255,.72); font: 800 10px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
      .glu-form input, .glu-form textarea, .glu-form select { width: 100%; border: 1px solid rgba(255,255,255,.18); border-radius: 0; background: rgba(0,0,0,.45); color: #fff; padding: 8px; font: 400 13px/1.25 system-ui, sans-serif; }
      .glu-wide, .glu-actions { grid-column: 1 / -1; }
      .glu-preview { width: 100%; aspect-ratio: 7 / 5; border: 1px solid rgba(245,200,90,.4); overflow: hidden; background: #111; }
      .glu-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .glu-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      .glu-actions button, .glu-gate-actions button { min-height: 38px; padding: 0 16px; border: 1px solid rgba(245,200,90,.75); border-radius: 0; background: rgba(245,200,90,.12); color: #f5c85a; font: 800 12px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
      .glu-gate-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
      .glu-actions button:disabled { opacity: .55; cursor: wait; }
      .glu-actions span { color: rgba(255,255,255,.7); font: 700 12px/1.35 system-ui, sans-serif; }
      .glu-identity-card { margin-top: 16px; padding: 12px; border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.35); display: grid; gap: 3px; }
      .glu-identity-card span { color: rgba(255,255,255,.55); font: 800 10px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
      .glu-identity-card strong { color: #fff; font: 800 18px/1 'Bebas Neue', Oswald, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
      .glu-identity-card em { color: rgba(255,255,255,.65); font: 500 12px/1.25 system-ui, sans-serif; font-style: normal; }
      @media (max-width: 760px) { .glu-panel { grid-template-columns: 1fr; padding-top: 18px; } .glu-form { grid-template-columns: 1fr; } }
    `}</style>
  );
}
