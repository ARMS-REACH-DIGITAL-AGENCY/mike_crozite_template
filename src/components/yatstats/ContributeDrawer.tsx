'use client';

// src/components/yatstats/ContributeDrawer.tsx
// The Connect & Contribute drawer: one drawer for the whole site, mounted
// once in the school shell. Anything can open it with openContribute()
// (lib/contribute.ts) - the YAT?STATS mark on a card, a silhouette, a
// missing headshot, a fallback crest, "missing stats", "can't find a
// player?" - and it opens on the right tab with the player and school
// already filled in.
//
// Four tabs: Photos (several at once, each with its type and year),
// Fix data, Missing player, News tip. Anyone can look; sending takes a
// free fan account. Nothing a fan sends reaches the site until we've
// reviewed it.

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '@/lib/firebase';
import { SchoolContext } from '@/context/SchoolContext';
import FanConfirm from '@/components/yatstats/FanConfirm';
import { shrinkPhoto } from '@/lib/shrinkPhoto';
import {
  CLASS_YEARS,
  CONTRIBUTE_MAX_PHOTOS,
  CONTRIBUTE_MAX_PHOTO_BYTES,
  CONTRIBUTE_OPEN_EVENT,
  DATA_KINDS,
  PHOTO_TYPES,
  PLAYER_LEVELS,
  type ContributeOpen,
  type ContributePlayer,
  type ContributeSchool,
  type ContributeTab,
  type DataKind,
  type PhotoPurpose,
} from '@/lib/contribute';

type FanSession = { uid?: string; email?: string; firstName?: string | null };
type PhotoRow = {
  id: string;
  file: File;
  preview: string;
  purpose: PhotoPurpose;
  year: number | '';
  classYear: string;
  state: 'ready' | 'sending' | 'sent' | 'error';
  message?: string;
};
type Status = { kind: 'idle' | 'sending' | 'error' | 'done'; text?: string; confirm?: boolean };

const TABS: { id: ContributeTab; label: string; icon: string }[] = [
  { id: 'photo', label: 'Photos', icon: 'ri-image-add-line' },
  { id: 'data', label: 'Fix data', icon: 'ri-edit-2-line' },
  { id: 'missing', label: 'Missing player', icon: 'ri-user-add-line' },
  { id: 'tip', label: 'News tip', icon: 'ri-newspaper-line' },
];
const CREST_FALLBACK = '/img/school-placeholder.png';
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 2 - 1960 }, (_, i) => THIS_YEAR + 1 - i);

function openAccountDrawer(tab: 'signin' | 'register') {
  document.body.classList.remove('drawer-contribute-open');
  document.body.classList.add('drawer-account-open', 'drawer-open');
  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: tab }));
}

async function idToken() {
  await auth.authStateReady?.();
  return auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
}

// Player search (the site's Global Search API).
function PlayerPicker({ value, onChange, onMissing }: { value: ContributePlayer | null; onChange: (p: ContributePlayer | null) => void; onMissing?: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<(ContributePlayer & { city?: string; state?: string })[]>([]);
  const [searchedFor, setSearchedFor] = useState('');
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/players/search?q=${encodeURIComponent(term)}&limit=8`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => { setResults(Array.isArray(data?.players) ? data.players : []); setSearchedFor(term); })
        .catch(() => {});
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [term]);
  // Results only for the current search (two letters or more).
  const shown = term.length >= 2 ? results : [];
  const searched = term.length >= 2 && searchedFor === term;

  if (value) {
    return (
      <div className="ycd-chosen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value.crestUrl || CREST_FALLBACK} alt="" onError={(e) => { e.currentTarget.src = CREST_FALLBACK; }} />
        <span className="ycd-chosen-text"><b>{value.displayName}</b>{value.schoolName ? <small>{value.schoolName}</small> : null}</span>
        <button type="button" className="ycd-link" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  return (
    <div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players by name" autoComplete="off" />
      {shown.length > 0 && (
        <div className="ycd-results yat-gs-results" role="listbox" aria-label="Players">
          {shown.map((r) => {
            const sub = [r.schoolName, [r.city, r.state].filter(Boolean).join(', ')].filter(Boolean).join(' - ');
            return (
              <button type="button" key={r.playerId} className="yat-gs-result yat-gs-player" role="option" aria-selected={false}
                onClick={() => { onChange({ playerId: r.playerId, displayName: r.displayName, schoolId: r.schoolId, schoolName: r.schoolName, crestUrl: r.crestUrl }); setQ(''); setResults([]); }}>
                <span className="yat-gs-result-top">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="yat-gs-result-crest" src={r.crestUrl || CREST_FALLBACK} alt="" loading="lazy" onError={(e) => { e.currentTarget.src = CREST_FALLBACK; }} />
                  <span className="yat-gs-result-info">
                    <span className="yat-gs-result-name">{r.displayName}</span>
                    {sub ? <span className="yat-gs-result-loc">{sub}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {searched && shown.length === 0 && onMissing ? (
        <div className="ycd-muted ycd-small">Not on YAT?STATS yet? <button type="button" className="ycd-link" onClick={onMissing}>Tell us about him</button></div>
      ) : null}
    </div>
  );
}

// High school search.
function SchoolPicker({ value, onChange }: { value: ContributeSchool | null; onChange: (s: ContributeSchool | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ hsid: string; hsname: string | null; hslocation: string | null }[]>([]);
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/schools/search?q=${encodeURIComponent(term)}&limit=8`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setResults(Array.isArray(data?.programs) ? data.programs : []))
        .catch(() => {});
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [term]);
  const shown = term.length >= 2 ? results : [];
  if (value) {
    return (
      <div className="ycd-chosen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://yatstats-assets.s3.us-west-2.amazonaws.com/schools/${value.hsid}.png`} alt="" onError={(e) => { e.currentTarget.src = CREST_FALLBACK; }} />
        <span className="ycd-chosen-text"><b>{value.name}</b>{value.location ? <small>{value.location}</small> : null}</span>
        <button type="button" className="ycd-link" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  return (
    <div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search high schools" autoComplete="off" />
      {shown.length > 0 && (
        <div className="ycd-results yat-gs-results" role="listbox" aria-label="Schools">
          {shown.map((s) => (
            <button type="button" key={s.hsid} className="yat-gs-result" role="option" aria-selected={false}
              onClick={() => { onChange({ hsid: String(s.hsid), name: s.hsname || '', location: s.hslocation || '' }); setQ(''); setResults([]); }}>
              <span className="yat-gs-result-info">
                <span className="yat-gs-result-name">{s.hsname}</span>
                {s.hslocation ? <span className="yat-gs-result-loc">{s.hslocation}</span> : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ContributeDrawer() {
  const schoolData = useContext(SchoolContext);
  const homeSchool: ContributeSchool | null = schoolData?.hsid
    ? { hsid: String(schoolData.hsid), name: schoolData.hsName || '', location: schoolData.hsLocation || '' }
    : null;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ContributeTab>('photo');
  const [session, setSession] = useState<FanSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  // Shared by the tabs: who and which school it's about.
  const [player, setPlayer] = useState<ContributePlayer | null>(null);
  const [manualPlayer, setManualPlayer] = useState(false);
  const [manualName, setManualName] = useState('');
  const [school, setSchool] = useState<ContributeSchool | null>(homeSchool);

  // Photos
  const [defaultPurpose, setDefaultPurpose] = useState<PhotoPurpose>('flip_card');
  const [rows, setRows] = useState<PhotoRow[]>([]);
  const [note, setNote] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Fix data
  const [dataKind, setDataKind] = useState<DataKind>('stats');
  const [details, setDetails] = useState('');
  const [source, setSource] = useState('');
  // Missing player
  const [mp, setMp] = useState({ name: '', gradYear: '', position: '', level: '', team: '', notes: '' });
  // News tip
  const [tipUrl, setTipUrl] = useState('');
  const [tipWhy, setTipWhy] = useState('');

  const signedIn = Boolean(session?.uid && session?.email);
  const sending = status.kind === 'sending';

  const close = useCallback(() => {
    setOpen(false);
    document.body.classList.remove('drawer-contribute-open');
    if (!document.body.className.match(/drawer-(left|right|sort|account|favorites|story)-open/)) document.body.classList.remove('drawer-open');
  }, []);

  const resetForms = useCallback(() => {
    setRows((current) => { current.forEach((r) => URL.revokeObjectURL(r.preview)); return []; });
    setNote(''); setDetails(''); setSource(''); setTipUrl(''); setTipWhy('');
    setMp({ name: '', gradYear: '', position: '', level: '', team: '', notes: '' });
    setStatus({ kind: 'idle' });
  }, []);

  // Open from any entry point, with what it knows.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const d = (event as CustomEvent<ContributeOpen>).detail || {};
      if (status.kind === 'done') resetForms();
      if (d.tab) setTab(d.tab);
      if (d.photoType) setDefaultPurpose(d.photoType);
      if (d.dataKind) setDataKind(d.dataKind);
      if (d.player !== undefined) { setPlayer(d.player); setManualPlayer(false); }
      if (d.school) setSchool(d.school);
      else if (d.player?.schoolId) setSchool({ hsid: d.player.schoolId, name: d.player.schoolName || '' });
      setOpen(true);
      document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-sort-open', 'drawer-account-open', 'drawer-favorites-open', 'drawer-story-open');
      document.body.classList.add('drawer-contribute-open', 'drawer-open');
      setSessionLoading(true);
      fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setSession(data?.authenticated ? (data.session as FanSession) : null))
        .catch(() => setSession(null))
        .finally(() => setSessionLoading(false));
    };
    window.addEventListener(CONTRIBUTE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONTRIBUTE_OPEN_EVENT, onOpen);
  }, [resetForms, status.kind]);

  // Back from signing in: check again.
  useEffect(() => {
    const refresh = () => {
      fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setSession(data?.authenticated ? (data.session as FanSession) : null))
        .catch(() => {});
    };
    window.addEventListener('yat-auth-success', refresh);
    return () => window.removeEventListener('yat-auth-success', refresh);
  }, []);

  // Close on Escape or a tap on the dark mask.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onMask = (e: MouseEvent) => { if ((e.target as HTMLElement | null)?.closest?.('.yat-drawer-mask')) close(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onMask);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('click', onMask); };
  }, [open, close]);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const room = CONTRIBUTE_MAX_PHOTOS - rows.length;
    const picked: PhotoRow[] = Array.from(files)
      .filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name))
      .slice(0, Math.max(0, room))
      .map((file) => ({
        id: `${file.name}-${file.size}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        purpose: defaultPurpose,
        year: defaultPurpose === 'school_logo' || defaultPurpose === 'headshot' || defaultPurpose === 'back_hero' ? THIS_YEAR : '',
        classYear: '',
        state: 'ready',
      }));
    setRows((current) => [...current, ...picked]);
    if (fileInput.current) fileInput.current.value = '';
    setStatus({ kind: 'idle' });
  };
  const updateRow = (id: string, patch: Partial<PhotoRow>) => setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows((current) => {
    const gone = current.find((r) => r.id === id);
    if (gone) URL.revokeObjectURL(gone.preview);
    return current.filter((r) => r.id !== id);
  });

  const who = () => ({
    playerId: player?.playerId || '',
    playerName: player?.displayName || (manualPlayer ? manualName.trim() : ''),
    hsid: player?.schoolId || school?.hsid || '',
  });

  // Photos go one at a time, so each can fail or succeed on its own.
  const sendPhotos = async () => {
    const pending = rows.filter((r) => r.state !== 'sent');
    if (!pending.length) return setStatus({ kind: 'error', text: 'Add at least one photo.' });
    const needsPlayer = pending.some((r) => r.purpose !== 'school_logo');
    const w = who();
    if (needsPlayer && !w.playerId && !(w.playerName && school)) return setStatus({ kind: 'error', text: 'Pick the player (or type his name and pick his high school).' });
    if (pending.some((r) => r.purpose === 'school_logo') && !school) return setStatus({ kind: 'error', text: 'Pick the high school for the logo.' });
    const missingYear = pending.find((r) => r.purpose !== 'school_logo' && !r.year);
    if (missingYear) return setStatus({ kind: 'error', text: 'Pick the year each photo was taken. A best guess is fine.' });
    const missingClass = pending.find((r) => r.purpose === 'year_headshot' && !r.classYear);
    if (missingClass) return setStatus({ kind: 'error', text: 'Pick which school year each past headshot is from.' });

    setStatus({ kind: 'sending', text: 'Sending…' });
    const token = await idToken();
    let failed = 0;
    for (const r of pending) {
      updateRow(r.id, { state: 'sending', message: undefined });
      try {
        // Logos keep their transparency; phone photos are shrunk first.
        const blob = r.purpose === 'school_logo' && r.file.size <= CONTRIBUTE_MAX_PHOTO_BYTES ? r.file : await shrinkPhoto(r.file);
        const form = new FormData();
        if (token) form.set('idToken', token);
        form.set('photo', blob, r.file.name);
        form.set('purpose', r.purpose);
        form.set('year', String(r.year || THIS_YEAR));
        form.set('classYear', r.classYear);
        if (r.purpose === 'school_logo') {
          form.set('hsid', school?.hsid || '');
        } else {
          form.set('playerId', w.playerId);
          form.set('playerName', w.playerName);
          form.set('hsid', w.hsid);
        }
        form.set('note', note.trim());
        form.set('pageUrl', window.location.href);
        const res = await fetch('/api/contribute/photo', { method: 'POST', body: form, credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          updateRow(r.id, { state: 'ready' });
          setStatus({ kind: 'error', confirm: true });
          return;
        }
        if (!res.ok) throw new Error(data?.error || 'Not sent.');
        updateRow(r.id, { state: 'sent' });
      } catch (error) {
        failed++;
        updateRow(r.id, { state: 'error', message: error instanceof Error ? error.message : 'Not sent.' });
      }
    }
    setStatus(failed ? { kind: 'error', text: `${failed} photo${failed === 1 ? '' : 's'} didn't go through. Try again.` } : { kind: 'done' });
  };

  const sendForm = async () => {
    const w = who();
    let body: Record<string, unknown>;
    if (tab === 'data') {
      if (!details.trim()) return setStatus({ kind: 'error', text: 'Tell us what should change.' });
      body = { kind: 'data', dataKind, details: details.trim(), source: source.trim(), ...w };
    } else if (tab === 'tip') {
      if (!/^https?:\/\/\S+\.\S+/i.test(tipUrl.trim())) return setStatus({ kind: 'error', text: 'Paste the link to the story.' });
      body = { kind: 'tip', url: tipUrl.trim(), why: tipWhy.trim(), ...w };
    } else {
      if (!mp.name.trim()) return setStatus({ kind: 'error', text: "Type the player's name." });
      if (!school) return setStatus({ kind: 'error', text: 'Pick his high school.' });
      body = { kind: 'missing', ...mp, hsid: school.hsid };
    }
    setStatus({ kind: 'sending', text: 'Sending…' });
    try {
      const token = await idToken();
      const res = await fetch('/api/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, idToken: token || undefined, pageUrl: window.location.href }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return setStatus({ kind: 'error', confirm: true });
      if (!res.ok) throw new Error(data?.error || 'That could not be sent.');
      setStatus({ kind: 'done' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'That could not be sent.' });
    }
  };

  const submit = () => {
    if (!signedIn) return openAccountDrawer('signin');
    return tab === 'photo' ? sendPhotos() : sendForm();
  };

  if (!portalReady) return null;

  const firstName = player?.displayName.split(' ')[0] || 'him';
  const needsPlayerPicker = tab === 'data' || tab === 'tip' || (tab === 'photo' && (rows.length === 0 ? defaultPurpose !== 'school_logo' : rows.some((r) => r.purpose !== 'school_logo')));
  const needsSchoolPicker = tab === 'missing' || (tab === 'photo' && (rows.some((r) => r.purpose === 'school_logo') || (rows.length === 0 && defaultPurpose === 'school_logo') || (!player && manualPlayer)));
  const kindHint = DATA_KINDS.find((k) => k.id === dataKind)?.hint || '';
  const sendLabel = !signedIn ? 'Sign in to send' : sending ? 'Sending…' : tab === 'photo' ? `Send ${rows.filter((r) => r.state !== 'sent').length || ''} photo${rows.filter((r) => r.state !== 'sent').length === 1 ? '' : 's'}`.replace('  ', ' ') : 'Send';

  return createPortal(
    <aside className="yat-drawer yat-drawer-right yat-contribute-drawer" id="drawerContribute" aria-label="Contribute to YAT?STATS" aria-hidden={!open}>
      <div className="ycd-header">
        <div>
          <div className="ycd-kicker">Connect &amp; Contribute</div>
          <h3 className="ycd-title">{player ? `Help us complete ${player.displayName}` : `Help build ${homeSchool?.name || 'YAT?STATS'}`}</h3>
        </div>
        <button type="button" className="yat-icon-btn ycd-close" onClick={close} aria-label="Close"><i className="ri-close-line" /></button>
      </div>

      <nav className="ycd-tabs" aria-label="What are you sending?">
        {TABS.map((t) => (
          <button type="button" key={t.id} className={`ycd-tab${tab === t.id ? ' is-active' : ''}`} aria-pressed={tab === t.id}
            onClick={() => { setTab(t.id); if (status.kind !== 'sending') setStatus({ kind: 'idle' }); }}>
            <i className={t.icon} aria-hidden="true" /><span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="ycd-body">
        {!sessionLoading && !signedIn ? (
          <div className="ycd-gate">
            <span>Sending takes a free fan account.</span>
            <button type="button" className="ycd-link" onClick={() => openAccountDrawer('signin')}>Sign in</button>
            <span className="ycd-muted">or</span>
            <button type="button" className="ycd-link" onClick={() => openAccountDrawer('register')}>Join free</button>
          </div>
        ) : null}

        {status.kind === 'done' ? (
          <div className="ycd-done">
            <p className="ycd-done-title">Thank you{session?.firstName ? `, ${session.firstName}` : ''}!</p>
            <p className="ycd-muted">We review everything before it goes on the site. You&apos;re helping build the most complete record of where they YAT now.</p>
            <div className="ycd-actions">
              <button type="button" className="ycd-btn ycd-btn-primary" onClick={resetForms}>Send more</button>
              <button type="button" className="ycd-btn" onClick={close}>Done</button>
            </div>
          </div>
        ) : (
          <>
            {needsPlayerPicker && (
              <div className="ycd-field">
                <div className="ycd-label">{tab === 'tip' ? 'Who is it about? (optional)' : 'Which player?'}</div>
                {manualPlayer && !player ? (
                  <div className="ycd-stack">
                    <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="His full name" />
                    <button type="button" className="ycd-link ycd-small" onClick={() => setManualPlayer(false)}>Search instead</button>
                  </div>
                ) : (
                  <>
                    <PlayerPicker value={player} onChange={setPlayer} onMissing={() => { setTab('missing'); setStatus({ kind: 'idle' }); }} />
                    {!player && tab === 'photo' ? (
                      <button type="button" className="ycd-link ycd-small" onClick={() => setManualPlayer(true)}>Can&apos;t find him? Type his name</button>
                    ) : null}
                  </>
                )}
              </div>
            )}

            {needsSchoolPicker && (
              <div className="ycd-field">
                <div className="ycd-label">{tab === 'missing' ? 'His high school' : 'Which high school?'}</div>
                <SchoolPicker value={school} onChange={setSchool} />
              </div>
            )}

            {tab === 'photo' && (
              <>
                <div className="ycd-field">
                  <div className="ycd-label">Photos <span className="ycd-muted">({rows.length}/{CONTRIBUTE_MAX_PHOTOS})</span></div>
                  {rows.map((r) => {
                    const type = PHOTO_TYPES.find((t) => t.id === r.purpose);
                    return (
                      <div className={`ycd-row is-${r.state}`} key={r.id}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="ycd-thumb" src={r.preview} alt="" />
                        <div className="ycd-row-fields">
                          <select value={r.purpose} onChange={(e) => updateRow(r.id, { purpose: e.target.value as PhotoPurpose })} aria-label="What kind of photo" disabled={r.state === 'sent'}>
                            {PHOTO_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                          {r.purpose !== 'school_logo' && (
                            <div className="ycd-row-pair">
                              <select value={r.year} onChange={(e) => updateRow(r.id, { year: e.target.value ? Number(e.target.value) : '' })} aria-label="Year taken" disabled={r.state === 'sent'}>
                                <option value="">Year taken</option>
                                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                              </select>
                              {r.purpose === 'year_headshot' && (
                                <select value={r.classYear} onChange={(e) => updateRow(r.id, { classYear: e.target.value })} aria-label="School year" disabled={r.state === 'sent'}>
                                  <option value="">School year</option>
                                  {CLASS_YEARS.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                              )}
                            </div>
                          )}
                          <div className="ycd-muted ycd-small">
                            {r.state === 'sent' ? 'Sent. Thank you!' : r.state === 'sending' ? 'Sending…' : r.state === 'error' ? <span className="ycd-error">{r.message}</span> : type?.spec}
                          </div>
                        </div>
                        {r.state !== 'sent' && r.state !== 'sending' ? (
                          <button type="button" className="ycd-remove" onClick={() => removeRow(r.id)} aria-label="Remove photo">×</button>
                        ) : null}
                      </div>
                    );
                  })}
                  {rows.length < CONTRIBUTE_MAX_PHOTOS && (
                    <button type="button" className="ycd-add" onClick={() => fileInput.current?.click()}>
                      <i className="ri-image-add-line" aria-hidden="true" />
                      <span>{rows.length ? 'Add more photos' : 'Choose photos'}</span>
                      {!rows.length ? <small>{PHOTO_TYPES.find((t) => t.id === defaultPurpose)?.spec}</small> : null}
                    </button>
                  )}
                  <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
                </div>
                <div className="ycd-field">
                  <label className="ycd-label" htmlFor="ycdNote">Anything we should know? (optional)</label>
                  <textarea id="ycdNote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Who took it, the game or event, who else is in it…`} />
                </div>
              </>
            )}

            {tab === 'data' && (
              <>
                <div className="ycd-field">
                  <label className="ycd-label" htmlFor="ycdKind">What needs fixing?</label>
                  <select id="ycdKind" value={dataKind} onChange={(e) => setDataKind(e.target.value as DataKind)}>
                    {DATA_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </div>
                <div className="ycd-field">
                  <label className="ycd-label" htmlFor="ycdDetails">Tell us</label>
                  <textarea id="ycdDetails" rows={6} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={kindHint} />
                </div>
                <div className="ycd-field">
                  <label className="ycd-label" htmlFor="ycdSource">Link that shows it (optional)</label>
                  <input id="ycdSource" type="url" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://" />
                </div>
              </>
            )}

            {tab === 'missing' && (
              <>
                <div className="ycd-muted ycd-small">Played at the next level and not on YAT?STATS? Tell us who he is and we&apos;ll add him.</div>
                <div className="ycd-field">
                  <label className="ycd-label" htmlFor="ycdMpName">His name</label>
                  <input id="ycdMpName" type="text" value={mp.name} onChange={(e) => setMp({ ...mp, name: e.target.value })} placeholder="First and last name" />
                </div>
                <div className="ycd-row-pair">
                  <div className="ycd-field">
                    <label className="ycd-label" htmlFor="ycdMpGrad">HS class of</label>
                    <select id="ycdMpGrad" value={mp.gradYear} onChange={(e) => setMp({ ...mp, gradYear: e.target.value })}>
                      <option value="">Year</option>
                      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="ycd-field">
                    <label className="ycd-label" htmlFor="ycdMpPos">Position</label>
                    <input id="ycdMpPos" type="text" value={mp.position} onChange={(e) => setMp({ ...mp, position: e.target.value })} placeholder="SS, RHP…" />
                  </div>
                </div>
                <div className="ycd-row-pair">
                  <div className="ycd-field">
                    <label className="ycd-label" htmlFor="ycdMpLevel">Highest level</label>
                    <select id="ycdMpLevel" value={mp.level} onChange={(e) => setMp({ ...mp, level: e.target.value })}>
                      <option value="">Pick one</option>
                      {PLAYER_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="ycd-field">
                    <label className="ycd-label" htmlFor="ycdMpTeam">Team</label>
                    <input id="ycdMpTeam" type="text" value={mp.team} onChange={(e) => setMp({ ...mp, team: e.target.value })} placeholder="College or pro team" />
                  </div>
                </div>
                <div className="ycd-field">
                  <label className="ycd-label" htmlFor="ycdMpNotes">Anything else (optional)</label>
                  <textarea id="ycdMpNotes" rows={3} value={mp.notes} onChange={(e) => setMp({ ...mp, notes: e.target.value })} placeholder="A link to his stats or a story about him helps." />
                </div>
              </>
            )}

            {tab === 'tip' && (
              <>
                <div className="ycd-field">
                  <label className="ycd-label" htmlFor="ycdTipUrl">Link to the story</label>
                  <input id="ycdTipUrl" type="url" value={tipUrl} onChange={(e) => setTipUrl(e.target.value)} placeholder="https://" />
                </div>
                <div className="ycd-field">
                  <label className="ycd-label" htmlFor="ycdTipWhy">Why it matters (optional)</label>
                  <textarea id="ycdTipWhy" rows={3} value={tipWhy} onChange={(e) => setTipWhy(e.target.value)} placeholder={`A milestone, a call-up, a great game by ${firstName}…`} />
                </div>
              </>
            )}

            {status.kind === 'error' && status.confirm ? (
              <FanConfirm email={session?.email} onConfirmed={() => { void submit(); }} />
            ) : status.kind === 'error' ? (
              <div className="ycd-error">{status.text}</div>
            ) : null}

            <div className="ycd-actions">
              <button type="button" className="ycd-btn ycd-btn-primary" onClick={submit} disabled={sending || (tab === 'photo' && signedIn && !rows.some((r) => r.state !== 'sent'))}>
                {sendLabel}
              </button>
            </div>
            <div className="ycd-muted ycd-small">We review everything before it goes on the site.</div>
          </>
        )}
      </div>

      <style jsx global>{`
        body.drawer-contribute-open #drawerContribute { transform: translateX(0); }
        body.drawer-contribute-open .yat-drawer-mask { opacity: 1; pointer-events: auto; }
        .yat-contribute-drawer { width: min(94vw, 460px); }
        .ycd-header { position: relative; isolation: isolate; overflow: hidden; flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 16px 10px; border-bottom: 1px solid var(--line); }
        .ycd-header::before { content: ""; position: absolute; z-index: -1; top: 50%; right: -14%; width: 62%; aspect-ratio: 1637/1281; transform: translateY(-50%); background: url("/img/ys-crest.png") center/contain no-repeat; opacity: .15; pointer-events: none; }
        body.light-theme .ycd-header::before { filter: invert(1); opacity: .09; }
        .ycd-kicker { color: #FFD700; font: 400 15px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
        body.light-theme .ycd-kicker { color: #9a6f00; }
        .ycd-title { margin: 6px 0 0 !important; padding: 0 !important; font: 700 20px/1.05 "Bebas Neue", Oswald, sans-serif !important; letter-spacing: .04em; }
        .ycd-close { position: static !important; flex: none; }
        .ycd-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 10px 12px 0; flex-shrink: 0; }
        .ycd-tab { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 2px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; opacity: .7; cursor: pointer; font: 400 12px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
        .ycd-tab i { font-size: 18px; }
        .ycd-tab.is-active { opacity: 1; border-color: #FFD700; color: #FFD700; background: rgba(255,215,0,.08); }
        body.light-theme .ycd-tab.is-active { color: #9a6f00; border-color: #9a6f00; }
        .ycd-body { flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; padding: 14px 16px 28px; }
        .ycd-muted { opacity: .65; }
        .ycd-small { font-size: 12px; line-height: 1.4; }
        .ycd-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .ycd-stack { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
        .ycd-label { font: 400 15px/1.1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; }
        .yat-contribute-drawer select, .yat-contribute-drawer textarea, .yat-contribute-drawer input[type="search"],
        .yat-contribute-drawer input[type="text"], .yat-contribute-drawer input[type="url"] {
          width: 100%; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,.06);
          color: var(--ink); padding: 10px 12px; font-family: inherit; font-size: 14px; line-height: 1.45;
        }
        .yat-contribute-drawer textarea { resize: vertical; }
        .ycd-gate { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 12px; border: 1px solid rgba(255,215,0,.5); border-radius: 8px; background: rgba(255,215,0,.07); font-size: 13px; }
        .ycd-link { border: 0; background: none; padding: 0; color: #FFD700; font: inherit; text-decoration: underline; cursor: pointer; }
        body.light-theme .ycd-link { color: #9a6f00; }
        .ycd-chosen { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid rgba(255,215,0,.6); border-radius: 8px; background: rgba(255,215,0,.06); }
        .ycd-chosen img { width: 34px; height: 34px; object-fit: contain; flex: none; }
        .ycd-chosen-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
        .ycd-chosen-text small { opacity: .65; font-size: 12px; }
        .ycd-results.yat-gs-results { max-height: none; overflow: visible; }
        .ycd-results .yat-gs-result { width: 100%; text-align: left; font: inherit; }
        .ycd-row { position: relative; display: flex; gap: 10px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; }
        .ycd-row.is-sent { border-color: rgba(80,200,120,.7); }
        .ycd-row.is-error { border-color: #ff6b6b; }
        .ycd-thumb { width: 64px; height: 90px; object-fit: cover; border-radius: 6px; flex: none; }
        .ycd-row-fields { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; padding-right: 18px; }
        .ycd-row-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .ycd-remove { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; font-size: 15px; line-height: 1; cursor: pointer; }
        .ycd-add { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px 12px; border: 1px dashed var(--line); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font: 400 15px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; }
        .ycd-add i { font-size: 24px; }
        .ycd-add small { font: 400 12px/1.4 inherit; font-family: inherit; text-transform: none; letter-spacing: 0; opacity: .65; text-align: center; }
        .ycd-error { color: #ff6b6b; font-size: 13px; }
        .ycd-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .ycd-btn { min-height: 42px; padding: 0 18px; border-radius: 8px; border: 1px solid #FFD700; background: transparent; color: #FFD700; font: 400 16px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; cursor: pointer; }
        .ycd-btn-primary { background: #FFD700; color: #000; }
        body.light-theme .ycd-btn:not(.ycd-btn-primary) { border-color: #9a6f00; color: #9a6f00; }
        .ycd-btn:disabled { opacity: .55; cursor: default; }
        .ycd-done p { margin: 0 0 8px; line-height: 1.45; }
        .ycd-done-title { font: 700 22px/1.1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .04em; }
      `}</style>
    </aside>,
    document.body
  );
}
