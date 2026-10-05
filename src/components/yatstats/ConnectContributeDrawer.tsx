'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const PLACEMENTS = [
  'High School Photo (Flip Card Front)',
  'Current Headshot',
  'Career Timeline Headshot',
  'Flip Card Back (Action Photo)',
  'Career Timeline Annual Hero',
  'High School Logo',
  'Next-Level Team Logo',
  'Where Are They Now Photo',
];

const MAX_ROWS = 10;

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

type PlayerResult = {
  playerId: string;
  displayName: string;
  schoolId: string;
  schoolName: string;
  city: string;
  state: string;
};

type SchoolResult = {
  hsid: string;
  hsname: string;
  hslocation: string;
};

type RowState = {
  file: File | null;
  previewUrl: string;
  date: string;
  placement: string;
  playerQuery: string;
  playerResults: PlayerResult[];
  playerSearching: boolean;
  selectedPlayer: PlayerResult | null;
  showManual: boolean;
  manualName: string;
  schoolQuery: string;
  schoolResults: SchoolResult[];
  schoolSearching: boolean;
  selectedSchool: SchoolResult | null;
  status: 'idle' | 'uploading' | 'done' | 'error';
  statusMessage: string;
};

function emptyRow(): RowState {
  return {
    file: null,
    previewUrl: '',
    date: '',
    placement: PLACEMENTS[0],
    playerQuery: '',
    playerResults: [],
    playerSearching: false,
    selectedPlayer: null,
    showManual: false,
    manualName: '',
    schoolQuery: '',
    schoolResults: [],
    schoolSearching: false,
    selectedSchool: null,
    status: 'idle',
    statusMessage: '',
  };
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

export default function ConnectContributeDrawer({
  hsid,
  open,
  onClose,
}: {
  hsid: string;
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RowState[]>(() => Array.from({ length: MAX_ROWS }, emptyRow));
  const [session, setSession] = useState<FanSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isLoggedIn = Boolean(session?.uid && session?.email);

  const refreshSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      setSession(data?.authenticated && data?.session?.uid ? (data.session as FanSession) : null);
    } catch {
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) refreshSession();
    const onAuth = () => refreshSession();
    window.addEventListener('yat-auth-success', onAuth);
    window.addEventListener('yat-sign-out', onAuth);
    return () => {
      window.removeEventListener('yat-auth-success', onAuth);
      window.removeEventListener('yat-sign-out', onAuth);
    };
  }, [open, refreshSession]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open ]);

  function updateRow(index: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function debouncedSearch(key: string, fn: () => void) {
    const t = searchTimers.current[key];
    if (t) clearTimeout(t);
    searchTimers.current[key] = setTimeout(fn, 350);
  }

  async function searchPlayers(index: number, q: string) {
    if (q.trim().length < 2) {
      updateRow(index, { playerResults: [], playerSearching: false });
      return;
    }
    updateRow(index, { playerSearching: true });
    try {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json();
      updateRow(index, { playerResults: Array.isArray(data.players) ? data.players : [], playerSearching: false });
    } catch {
      updateRow(index, { playerResults: [], playerSearching: false });
    }
  }

  async function searchSchools(index: number, q: string) {
    if (q.trim().length < 2) {
      updateRow(index, { schoolResults: [], schoolSearching: false });
      return;
    }
    updateRow(index, { schoolSearching: true });
    try {
      const res = await fetch(`/api/schools/search?q=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json();
      updateRow(index, { schoolResults: Array.isArray(data.programs) ? data.programs : [], schoolSearching: false });
    } catch {
      updateRow(index, { schoolResults: [], schoolSearching: false });
    }
  }

  function handleFile(index: number, file: File | null) {
    const row = rows[index];
    if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
    updateRow(index, {
      file,
      previewUrl: file ? URL.createObjectURL(file) : '',
      status: 'idle',
      statusMessage: '',
    });
  }

  function rowIsFillable(row: RowState) {
    return Boolean(row.file);
  }

  function rowIsSubmittable(row: RowState) {
    if (!row.file) return false;
    if (row.selectedPlayer) return true;
    if (row.showManual && row.manualName.trim() && row.selectedSchool) return true;
    return false;
  }

  async function handleSubmit() {
    if (!isLoggedIn) {
      openAccountDrawer('signin');
      return;
    }
    const active = rows.map((r, i) => ({ row: r, index: i })).filter(({ row }) => rowIsFillable(row));
    if (!active.length) return;

    setSubmitting(true);
    for (const { row, index } of active) {
      if (!rowIsSubmittable(row)) {
        updateRow(index, { status: 'error', statusMessage: 'Pick a player (or enter a name and school) before submitting.' });
        continue;
      }
      updateRow(index, { status: 'uploading', statusMessage: 'Uploading...' });
      try {
        const fd = new FormData();
        fd.set('photo', row.file as File);
        fd.set('hsid', hsid);
        fd.set('placement', row.placement);
        fd.set('photoTakenDate', row.date);
        fd.set('playerId', row.selectedPlayer ? row.selectedPlayer.playerId : '');
        fd.set('playerName', row.selectedPlayer ? row.selectedPlayer.displayName : row.manualName.trim());
        fd.set('playerSchoolHsid', row.selectedPlayer ? row.selectedPlayer.schoolId : row.selectedSchool ? row.selectedSchool.hsid : '');
        fd.set('playerSchoolName', row.selectedPlayer ? row.selectedPlayer.schoolName : row.selectedSchool ? row.selectedSchool.hsname : '');
        fd.set('pageUrl', window.location.href);

        const res = await fetch('/api/connect-contribute/upload', {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Upload failed');
        updateRow(index, { status: 'done', statusMessage: 'Submitted for review.' });
      } catch (err: any) {
        updateRow(index, { status: 'error', statusMessage: err?.message || 'Upload failed' });
      }
    }
    setSubmitting(false);
  }

  if (!open) return null;

  const filledCount = rows.filter(rowIsFillable).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Contribute photos"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }}
      />
      <div
        style={{
          position: 'relative', width: 'min(560px, 100%)', height: '100%',
          background: '#111', color: '#fff', display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid #333',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '18px' }}>Contribute Photos</div>
            <div style={{ fontSize: '13px', opacity: 0.7 }}>Up to 10 photos, each with its own details.</div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {sessionLoading ? (
            <p style={{ opacity: 0.7 }}>Checking your sign-in...</p>
          ) : !isLoggedIn ? (
            <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ margin: '0 0 12px', fontSize: '14px' }}>
                Sign in with your free YAT?STATS fan account to submit photos. Your uploads are saved under your name.
              </p>
              <button
                type="button"
                onClick={() => openAccountDrawer('signin')}
                style={{ background: 'var(--gold, #ffd700)', color: '#000', fontWeight: 700, border: 'none', borderRadius: '6px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px' }}
              >
                Sign In / Join Free
              </button>
            </div>
          ) : null}

          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                border: '1px solid #333', borderRadius: '8px', padding: '14px',
                marginBottom: '12px', background: row.file ? '#161616' : '#101010',
                opacity: row.file || i === 0 ? 1 : 0.75,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <div
                  style={{
                    width: '56px', height: '56px', borderRadius: '6px', flexShrink: 0,
                    background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', border: '1px dashed #555',
                  }}
                >
                  {row.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '11px', opacity: 0.5, textAlign: 'center', padding: '4px' }}>No photo</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>Photo {i + 1}</div>
                  <label
                    style={{
                      display: 'inline-block', background: '#2a2a2a', border: '1px solid #555',
                      borderRadius: '6px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer',
                    }}
                  >
                    {row.file ? 'Change photo' : 'Choose photo'}
                    <input
                      type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={(e) => handleFile(i, e.target.files?.[0] || null)}
                    />
                  </label>
                  {row.file && <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '4px' }}>{row.file.name}</div>}
                </div>
              </div>

              {row.file && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <label style={{ fontSize: '13px' }}>
                      <div style={{ marginBottom: '4px', opacity: 0.8 }}>Date taken</div>
                      <input
                        type="date" value={row.date}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => updateRow(i, { date: e.target.value })}
                        style={{ width: '100%', background: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', padding: '8px' }}
                      />
                    </label>
                    <label style={{ fontSize: '13px' }}>
                      <div style={{ marginBottom: '4px', opacity: 0.8 }}>Photo type</div>
                      <select
                        value={row.placement}
                        onChange={(e) => updateRow(i, { placement: e.target.value })}
                        style={{ width: '100%', background: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', padding: '8px' }}
                      >
                        {PLACEMENTS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {!row.showManual ? (
                    <div style={{ position: 'relative', marginBottom: '6px' }}>
                      <div style={{ fontSize: '13px', marginBottom: '4px', opacity: 0.8 }}>Player</div>
                      <input
                        type="text" placeholder="Search player name..." value={row.playerQuery}
                        onChange={(e) => {
                          const q = e.target.value;
                          updateRow(i, { playerQuery: q, selectedPlayer: null });
                          debouncedSearch(`p-${i}`, () => searchPlayers(i, q));
                        }}
                        style={{ width: '100%', background: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', padding: '8px' }}
                      />
                      {row.selectedPlayer && (
                        <div style={{ fontSize: '13px', marginTop: '6px', color: '#8f8' }}>
                          Selected: {row.selectedPlayer.displayName} ({row.selectedPlayer.schoolName})
                        </div>
                      )}
                      {row.playerSearching && <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '4px' }}>Searching...</div>}
                      {row.playerResults.length > 0 && !row.selectedPlayer && (
                        <div style={{ border: '1px solid #555', borderRadius: '6px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto', background: '#1a1a1a' }}>
                          {row.playerResults.map((p) => (
                            <button
                              key={p.playerId} type="button"
                              onClick={() => updateRow(i, { selectedPlayer: p, playerResults: [], playerQuery: p.displayName })}
                              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', padding: '8px 10px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a' }}
                            >
                              {p.displayName} <span style={{ opacity: 0.6 }}>— {p.schoolName}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {row.playerQuery.trim().length >= 2 && !row.playerSearching && row.playerResults.length === 0 && !row.selectedPlayer && (
                        <button
                          type="button"
                          onClick={() => updateRow(i, { showManual: true, manualName: row.playerQuery })}
                          style={{ background: 'none', border: 'none', color: 'var(--gold, #ffd700)', fontSize: '13px', cursor: 'pointer', marginTop: '6px', padding: 0, textDecoration: 'underline' }}
                        >
                          Player not found? Enter name manually
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginBottom: '6px' }}>
                      <div style={{ fontSize: '13px', marginBottom: '4px', opacity: 0.8 }}>Player name (manual entry)</div>
                      <input
                        type="text" placeholder="Player's full name" value={row.manualName}
                        onChange={(e) => updateRow(i, { manualName: e.target.value })}
                        style={{ width: '100%', background: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', padding: '8px', marginBottom: '8px' }}
                      />
                      <div style={{ fontSize: '13px', marginBottom: '4px', opacity: 0.8 }}>High school</div>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text" placeholder="Search high school..." value={row.schoolQuery}
                          onChange={(e) => {
                            const q = e.target.value;
                            updateRow(i, { schoolQuery: q, selectedSchool: null });
                            debouncedSearch(`s-${i}`, () => searchSchools(i, q));
                          }}
                          style={{ width: '100%', background: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', padding: '8px' }}
                        />
                        {row.selectedSchool && (
                          <div style={{ fontSize: '13px', marginTop: '6px', color: '#8f8' }}>
                            Selected: {row.selectedSchool.hsname} ({row.selectedSchool.hslocation})
                          </div>
                        )}
                        {row.schoolSearching && <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '4px' }}>Searching...</div>}
                        {row.schoolResults.length > 0 && !row.selectedSchool && (
                          <div style={{ border: '1px solid #555', borderRadius: '6px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto', background: '#1a1a1a' }}>
                            {row.schoolResults.map((s) => (
                              <button
                                key={s.hsid} type="button"
                                onClick={() => updateRow(i, { selectedSchool: s, schoolResults: [], schoolQuery: s.hsname })}
                                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', padding: '8px 10px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a' }}
                              >
                                {s.hsname} <span style={{ opacity: 0.6 }}>— {s.hslocation}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateRow(i, { showManual: false, manualName: '', selectedSchool: null, schoolQuery: '', schoolResults: [] })}
                        style={{ background: 'none', border: 'none', color: '#999', fontSize: '12px', cursor: 'pointer', marginTop: '6px', padding: 0, textDecoration: 'underline' }}
                      >
                        Back to player search
                      </button>
                    </div>
                  )}

                  {row.status !== 'idle' && (
                    <div
                      style={{
                        fontSize: '13px', marginTop: '8px',
                        color: row.status === 'done' ? '#8f8' : row.status === 'error' ? '#f88' : '#fd0',
                      }}
                    >
                      {row.statusMessage}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #333' }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || filledCount === 0}
            style={{
              width: '100%',
              background: filledCount === 0 ? '#333' : 'var(--gold, #ffd700)',
              color: filledCount === 0 ? '#888' : '#000',
              fontWeight: 700, border: 'none', borderRadius: '8px',
              padding: '14px', fontSize: '15px',
              cursor: filledCount === 0 || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting
              ? 'Submitting...'
              : !isLoggedIn
                ? 'Sign In to Submit'
                : filledCount === 0
                  ? 'Choose at least one photo'
                  : `Submit ${filledCount} photo${filledCount === 1 ? '' : 's'}`}
          </button>
          {!isLoggedIn && filledCount > 0 && (
            <p style={{ fontSize: '12px', opacity: 0.6, marginTop: '8px', textAlign: 'center' }}>
              You&apos;ll be asked to sign in before anything is submitted.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
