'use client';

// src/components/yatstats/ContributeDrawer.tsx
// The Connect & Contribute drawer: one drawer for the whole site, mounted
// once in the school shell. Anything can open it with openContribute()
// (lib/contribute.ts) - the YAT?STATS mark on a card, a silhouette, a
// missing headshot, a fallback crest, "missing stats", "can't find a
// player?" - and it opens on the right tab with the player already picked.
//
// Photos and Update Data work the same way: pick the player, then one of
// his seasons (loaded from his record), then check what you have for that
// season - a photo (placed in the exact frame it will have on the site) or
// a few words. Or switch to "Our school" for the crest, school info and
// the All-Time list. Missing Next-Level Alumni and News Tip are short forms.
// Anyone can look; sending takes a free fan account. Nothing a fan sends
// reaches the site until we've reviewed it.

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '@/lib/firebase';
import { SchoolContext } from '@/context/SchoolContext';
import FanConfirm from '@/components/yatstats/FanConfirm';
import PhotoCropper from '@/components/yatstats/PhotoCropper';
import { shrinkPhoto } from '@/lib/shrinkPhoto';
import {
  CONTRIBUTE_MAX_PHOTO_BYTES,
  CONTRIBUTE_OPTIONS,
  CONTRIBUTE_OPEN_EVENT,
  DATA_KINDS,
  PHOTO_TYPES,
  PLAYER_LEVELS,
  type ContributeOpen,
  type ContributePlayer,
  type ContributeSchool,
  type ContributeTab,
  type Crop,
  type DataKind,
  type PhotoPurpose,
  type Season,
  tabIcon,
} from '@/lib/contribute';

type FanSession = { uid?: string; email?: string; firstName?: string | null; plan?: string | null; isSuperfan?: boolean };
type PhotoPick = { file: File; preview: string; crop: Crop | null; state: 'ready' | 'sending' | 'sent' | 'error'; message?: string };
type Status = { kind: 'idle' | 'sending' | 'error' | 'done'; text?: string; confirm?: boolean };
type PlayerInfo = { name: string; profileUrl: string | null; classOf: number | null };

// The same icons as the portal's row 3 (CONTRIBUTE_OPTIONS).
const TABS: { id: ContributeTab; label: string; icon: string }[] = CONTRIBUTE_OPTIONS
  .filter((o) => o.tab)
  .map((o) => ({ id: o.tab!, label: o.label, icon: o.icon }));
const CREST_FALLBACK = '/img/school-placeholder.png';
const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
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

// Global Search for a player.
function PlayerPicker({ value, onChange, onMissing }: { value: ContributePlayer | null; onChange: (p: ContributePlayer | null) => void; onMissing: () => void }) {
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
  const shown = term.length >= 2 ? results : [];
  const searched = term.length >= 2 && searchedFor === term;

  if (value) {
    return (
      <div className="ycd-chosen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value.crestUrl || (value.schoolId ? `${S3}/schools/${value.schoolId}.png` : CREST_FALLBACK)} alt="" onError={(e) => { e.currentTarget.src = CREST_FALLBACK; }} />
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
                onClick={() => { onChange({ playerId: r.playerId, displayName: r.displayName, schoolId: r.schoolId, schoolName: r.schoolName, crestUrl: r.crestUrl }); setQ(''); }}>
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
      {searched && shown.length === 0 ? (
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
        <img src={`${S3}/schools/${value.hsid}.png`} alt="" onError={(e) => { e.currentTarget.src = CREST_FALLBACK; }} />
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
              onClick={() => { onChange({ hsid: String(s.hsid), name: s.hsname || '', location: s.hslocation || '' }); setQ(''); }}>
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
  const hubSchool: ContributeSchool | null = schoolData?.hsid
    ? { hsid: String(schoolData.hsid), name: schoolData.hsName || '', location: schoolData.hsLocation || '' }
    : null;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ContributeTab>('photo');
  const [session, setSession] = useState<FanSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  // Who it's about.
  const [aboutSchool, setAboutSchool] = useState(false);
  const [player, setPlayer] = useState<ContributePlayer | null>(null);
  const [manualPlayer, setManualPlayer] = useState(false);
  const [manualName, setManualName] = useState('');
  const [school, setSchool] = useState<ContributeSchool | null>(hubSchool);
  // His seasons.
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [info, setInfo] = useState<PlayerInfo | null>(null);
  const [seasonsError, setSeasonsError] = useState('');
  const [seasonKey, setSeasonKey] = useState('');
  const [manualYear, setManualYear] = useState<number | ''>('');
  const seasonRequest = useRef(0);
  // What they have.
  const [photos, setPhotos] = useState<Partial<Record<PhotoPurpose, PhotoPick | null>>>({});
  const [data, setData] = useState<Partial<Record<DataKind, string>>>({});
  const [note, setNote] = useState('');
  const [source, setSource] = useState('');
  const pickFor = useRef<PhotoPurpose | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Missing Next-Level Alumni / News Tip
  const [mp, setMp] = useState({ name: '', gradYear: '', position: '', level: '', team: '', notes: '' });
  const [tipUrl, setTipUrl] = useState('');
  const [tipWhy, setTipWhy] = useState('');

  const signedIn = Boolean(session?.uid && session?.email);
  const sending = status.kind === 'sending';
  const season = seasons?.find((s) => s.key === seasonKey) || null;

  const close = useCallback(() => {
    setOpen(false);
    document.body.classList.remove('drawer-contribute-open');
    if (!document.body.className.match(/drawer-(left|right|sort|account|favorites|story)-open/)) document.body.classList.remove('drawer-open');
  }, []);

  const clearPicks = useCallback(() => {
    setPhotos((current) => {
      Object.values(current).forEach((p) => p && URL.revokeObjectURL(p.preview));
      return {};
    });
    setData({});
  }, []);

  const resetForms = useCallback(() => {
    clearPicks();
    setNote(''); setSource(''); setTipUrl(''); setTipWhy('');
    setMp({ name: '', gradYear: '', position: '', level: '', team: '', notes: '' });
    setStatus({ kind: 'idle' });
  }, [clearPicks]);

  // His seasons, newest first (the newest is "current").
  const loadSeasons = useCallback((p: ContributePlayer | null) => {
    const request = ++seasonRequest.current;
    setSeasons(null); setInfo(null); setSeasonsError(''); setSeasonKey('');
    if (!p?.playerId) return;
    fetch(`/api/contribute/seasons?playerId=${encodeURIComponent(p.playerId)}`)
      .then((res) => res.json())
      .then((body) => {
        if (request !== seasonRequest.current) return;
        if (body?.error) return setSeasonsError(body.error);
        const list: Season[] = Array.isArray(body?.seasons) ? body.seasons : [];
        setSeasons(list);
        setInfo(body?.player ? { name: body.player.name, profileUrl: body.player.profileUrl, classOf: body.player.classOf } : null);
      })
      .catch(() => { if (request === seasonRequest.current) setSeasonsError('His seasons could not be loaded.'); });
  }, []);

  const choosePlayer = useCallback((p: ContributePlayer | null) => {
    setPlayer(p);
    setManualPlayer(false);
    if (p?.schoolId) setSchool({ hsid: p.schoolId, name: p.schoolName || '' });
    loadSeasons(p);
  }, [loadSeasons]);

  // Open from any entry point, with what it knows.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const d = (event as CustomEvent<ContributeOpen>).detail || {};
      if (status.kind === 'done') resetForms();
      if (d.tab) setTab(d.tab);
      if (d.player !== undefined && d.player?.playerId !== player?.playerId) choosePlayer(d.player);
      if (d.school) setSchool(d.school);
      const wantsSchool = d.photoType === 'school_logo' || (d.dataKind ? DATA_KINDS.find((k) => k.id === d.dataKind)?.seasons === 'school' : false);
      setAboutSchool(Boolean(wantsSchool));
      if (d.photoType) setPhotos((cur) => (d.photoType! in cur ? cur : { ...cur, [d.photoType!]: null }));
      if (d.dataKind) setData((cur) => (d.dataKind! in cur ? cur : { ...cur, [d.dataKind!]: '' }));
      setOpen(true);
      document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-sort-open', 'drawer-account-open', 'drawer-favorites-open', 'drawer-story-open');
      document.body.classList.add('drawer-contribute-open', 'drawer-open');
      setSessionLoading(true);
      fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        .then((res) => res.json())
        .then((body) => setSession(body?.authenticated ? (body.session as FanSession) : null))
        .catch(() => setSession(null))
        .finally(() => setSessionLoading(false));
    };
    window.addEventListener(CONTRIBUTE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONTRIBUTE_OPEN_EVENT, onOpen);
  }, [resetForms, choosePlayer, status.kind, player?.playerId]);

  // Back from signing in: check again.
  useEffect(() => {
    const refresh = () => {
      fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        .then((res) => res.json())
        .then((body) => setSession(body?.authenticated ? (body.session as FanSession) : null))
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

  // ---- What can be sent for the chosen season --------------------------
  const seasonForItems: Season | null = aboutSchool
    ? null
    : season || (manualPlayer && manualYear ? { key: 'manual', year: Number(manualYear), stage: 'hs', team: school?.name || '', level: '', label: '', current: true } : null);
  const photoTypes = PHOTO_TYPES.filter((t) =>
    aboutSchool ? t.seasons === 'school'
      : t.seasons === 'any' || (t.seasons === 'hs' && seasonForItems?.stage === 'hs') || (t.seasons === 'current' && seasonForItems?.current)
  );
  const dataKinds = DATA_KINDS.filter((k) =>
    aboutSchool ? k.seasons === 'school' : k.seasons === 'any' || (k.seasons === 'hs' && seasonForItems?.stage === 'hs')
  );

  const togglePhoto = (id: PhotoPurpose) => setPhotos((cur) => {
    const next = { ...cur };
    if (id in next) { const p = next[id]; if (p) URL.revokeObjectURL(p.preview); delete next[id]; } else next[id] = null;
    return next;
  });
  const choosePhotoFile = (id: PhotoPurpose) => { pickFor.current = id; fileInput.current?.click(); };
  const onFile = (files: FileList | null) => {
    const id = pickFor.current;
    const file = files?.[0];
    if (fileInput.current) fileInput.current.value = '';
    if (!id || !file) return;
    setPhotos((cur) => {
      const old = cur[id];
      if (old) URL.revokeObjectURL(old.preview);
      return { ...cur, [id]: { file, preview: URL.createObjectURL(file), crop: null, state: 'ready' } };
    });
    setStatus({ kind: 'idle' });
  };
  const setCrop = useCallback((id: PhotoPurpose, crop: Crop) => {
    setPhotos((cur) => (cur[id] ? { ...cur, [id]: { ...cur[id]!, crop } } : cur));
  }, []);
  const toggleData = (id: DataKind) => setData((cur) => {
    const next = { ...cur };
    if (id in next) delete next[id]; else next[id] = '';
    return next;
  });

  const who = () => ({
    playerId: aboutSchool ? '' : player?.playerId || '',
    playerName: aboutSchool ? '' : player?.displayName || (manualPlayer ? manualName.trim() : ''),
    hsid: aboutSchool ? school?.hsid || '' : player?.schoolId || school?.hsid || '',
  });

  const needWho = (): string | null => {
    if (aboutSchool) return school ? null : 'Pick the high school.';
    if (!player && !(manualPlayer && manualName.trim() && school)) return 'Pick the player (or type his name and pick his high school).';
    if (!seasonForItems) return 'Pick the season.';
    return null;
  };

  // Photos go one at a time, so each can fail or succeed on its own.
  const sendPhotos = async () => {
    const problem = needWho();
    if (problem) return setStatus({ kind: 'error', text: problem });
    const checked = (Object.keys(photos) as PhotoPurpose[]).filter((id) => photoTypes.some((t) => t.id === id));
    if (!checked.length) return setStatus({ kind: 'error', text: 'Check the kind of photo you have.' });
    const empty = checked.find((id) => !photos[id]);
    if (empty) return setStatus({ kind: 'error', text: `Choose the photo for ${PHOTO_TYPES.find((t) => t.id === empty)?.label}.` });
    const todo = checked.filter((id) => photos[id]!.state !== 'sent');
    setStatus({ kind: 'sending', text: 'Sending…' });
    const token = await idToken();
    const w = who();
    let failed = 0;
    for (const id of todo) {
      const pick = photos[id]!;
      setPhotos((cur) => ({ ...cur, [id]: { ...cur[id]!, state: 'sending', message: undefined } }));
      try {
        // Logos keep their transparency; phone photos are shrunk first
        // (same proportions, so the crop still lines up).
        const blob = id === 'school_logo' && pick.file.size <= CONTRIBUTE_MAX_PHOTO_BYTES ? pick.file : await shrinkPhoto(pick.file);
        const form = new FormData();
        if (token) form.set('idToken', token);
        form.set('photo', blob, pick.file.name);
        form.set('purpose', id);
        form.set('playerId', w.playerId);
        form.set('playerName', w.playerName);
        form.set('hsid', w.hsid);
        if (seasonForItems) {
          form.set('year', String(seasonForItems.year));
          form.set('season', JSON.stringify({ team: seasonForItems.team, level: seasonForItems.level, label: seasonForItems.label }));
        }
        if (pick.crop) form.set('crop', JSON.stringify(pick.crop));
        form.set('note', note.trim());
        form.set('pageUrl', window.location.href);
        const res = await fetch('/api/contribute/photo', { method: 'POST', body: form, credentials: 'include' });
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setPhotos((cur) => ({ ...cur, [id]: { ...cur[id]!, state: 'ready' } }));
          setStatus({ kind: 'error', confirm: true });
          return;
        }
        if (!res.ok) throw new Error(body?.error || 'Not sent.');
        setPhotos((cur) => ({ ...cur, [id]: { ...cur[id]!, state: 'sent' } }));
      } catch (error) {
        failed++;
        setPhotos((cur) => ({ ...cur, [id]: { ...cur[id]!, state: 'error', message: error instanceof Error ? error.message : 'Not sent.' } }));
      }
    }
    setStatus(failed ? { kind: 'error', text: `${failed} photo${failed === 1 ? '' : 's'} didn't go through. Try again.` } : { kind: 'done' });
  };

  const post = async (body: Record<string, unknown>) => {
    setStatus({ kind: 'sending', text: 'Sending…' });
    try {
      const token = await idToken();
      const res = await fetch('/api/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, idToken: token || undefined, pageUrl: window.location.href }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.status === 401) return setStatus({ kind: 'error', confirm: true });
      if (!res.ok) throw new Error(out?.error || 'That could not be sent.');
      setStatus({ kind: 'done' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'That could not be sent.' });
    }
  };

  const sendData = () => {
    const problem = needWho();
    if (problem) return setStatus({ kind: 'error', text: problem });
    const items = (Object.keys(data) as DataKind[])
      .filter((k) => dataKinds.some((d) => d.id === k))
      .map((k) => ({ kind: k, text: String(data[k] || '').trim() }));
    if (!items.length) return setStatus({ kind: 'error', text: 'Check what you have.' });
    const blank = items.find((i) => !i.text);
    if (blank) return setStatus({ kind: 'error', text: `Fill in "${DATA_KINDS.find((k) => k.id === blank.kind)?.label}".` });
    return post({
      kind: 'data',
      items,
      source: source.trim(),
      season: seasonForItems ? { year: seasonForItems.year, team: seasonForItems.team, label: seasonForItems.label } : null,
      ...who(),
    });
  };

  const submit = () => {
    if (!signedIn) return openAccountDrawer('signin');
    if (tab === 'photo') return sendPhotos();
    if (tab === 'data') return sendData();
    if (tab === 'tip') {
      if (!/^https?:\/\/\S+\.\S+/i.test(tipUrl.trim())) return setStatus({ kind: 'error', text: 'Paste the link to the story.' });
      return post({ kind: 'tip', url: tipUrl.trim(), why: tipWhy.trim(), playerId: player?.playerId || '', playerName: player?.displayName || '', hsid: player?.schoolId || '' });
    }
    if (!mp.name.trim()) return setStatus({ kind: 'error', text: "Type the player's name." });
    if (!school) return setStatus({ kind: 'error', text: 'Pick his high school.' });
    return post({ kind: 'missing', ...mp, hsid: school.hsid });
  };

  if (!portalReady) return null;

  const fanName = String(session?.firstName || '').trim();
  const fanKind = session?.isSuperfan || session?.plan === 'superfan' ? 'SuperFan' : 'Fan';
  const hubName = [hubSchool?.name, hubSchool?.location ? `(${hubSchool.location})` : ''].filter(Boolean).join(' ');
  const firstName = (player?.displayName || manualName || '').split(' ')[0] || 'him';
  const playerFlow = tab === 'photo' || tab === 'data';
  const pendingPhotos = (Object.keys(photos) as PhotoPurpose[]).filter((id) => photoTypes.some((t) => t.id === id) && photos[id]?.state !== 'sent').length;
  const sendLabel = !signedIn ? 'Sign in to send' : sending ? 'Sending…' : tab === 'photo' ? (pendingPhotos > 1 ? `Send ${pendingPhotos} photos` : 'Send photo') : 'Send';

  return createPortal(
    <aside className="yat-drawer yat-drawer-right yat-contribute-drawer" id="drawerContribute" aria-label="Contribute to YAT?STATS" aria-hidden={!open}>
      <div className="ycd-header">
        <div>
          <div className="ycd-kicker">Connect &amp; Contribute</div>
          <h3 className="ycd-title">{player && playerFlow && !aboutSchool ? `Help us complete ${player.displayName}` : `Help build ${hubSchool?.name || 'YAT?STATS'}`}</h3>
          {signedIn ? (
            <p className="ycd-hello">
              Hello {fanName || 'there'}! Thank you for being a contributing <b>{fanKind}</b> of the {hubName || 'YAT?STATS'} Community Hub.
            </p>
          ) : null}
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
            <p className="ycd-done-title">Thank you{fanName ? `, ${fanName}` : ''}!</p>
            <p className="ycd-muted">We review everything before it goes on the site. You&apos;re helping build the most complete record of Where they YAT now.</p>
            <div className="ycd-actions">
              <button type="button" className="ycd-btn ycd-btn-primary" onClick={resetForms}>Send more</button>
              <button type="button" className="ycd-btn" onClick={close}>Done</button>
            </div>
          </div>
        ) : playerFlow ? (
          <div className="ycd-main">
            {/* Who and when */}
            <div className="ycd-col">
              <div className="ycd-switch" role="radiogroup" aria-label="This is about">
                <button type="button" role="radio" aria-checked={!aboutSchool} className={!aboutSchool ? 'is-on' : ''} onClick={() => { setAboutSchool(false); setStatus({ kind: 'idle' }); }}>A player</button>
                <button type="button" role="radio" aria-checked={aboutSchool} className={aboutSchool ? 'is-on' : ''} onClick={() => { setAboutSchool(true); setStatus({ kind: 'idle' }); }}>Our school</button>
              </div>

              {aboutSchool ? (
                <div className="ycd-field">
                  <div className="ycd-label"><span className="ycd-step">1</span> Which high school?</div>
                  <SchoolPicker value={school} onChange={setSchool} />
                </div>
              ) : (
                <>
                  <div className="ycd-field">
                    <div className="ycd-label"><span className="ycd-step">1</span> Which player?</div>
                    {manualPlayer ? (
                      <div className="ycd-stack">
                        <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="His full name" />
                        <SchoolPicker value={school} onChange={setSchool} />
                        <button type="button" className="ycd-link ycd-small" onClick={() => setManualPlayer(false)}>Search instead</button>
                      </div>
                    ) : (
                      <>
                        <PlayerPicker value={player} onChange={choosePlayer} onMissing={() => { setTab('missing'); setStatus({ kind: 'idle' }); }} />
                        {!player ? (
                          <button type="button" className="ycd-link ycd-small" onClick={() => { setManualPlayer(true); loadSeasons(null); }}>Can&apos;t find him? Type his name</button>
                        ) : null}
                      </>
                    )}
                  </div>

                  {(player || manualPlayer) && (
                    <div className="ycd-field">
                      <div className="ycd-label"><span className="ycd-step">2</span> Which season?</div>
                      {manualPlayer ? (
                        <select value={manualYear} onChange={(e) => setManualYear(e.target.value ? Number(e.target.value) : '')} aria-label="Year">
                          <option value="">Year</option>
                          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      ) : seasonsError ? (
                        <div className="ycd-error">{seasonsError}</div>
                      ) : !seasons ? (
                        <div className="ycd-muted ycd-small">Loading his seasons…</div>
                      ) : seasons.length === 0 ? (
                        <div className="ycd-muted ycd-small">We don&apos;t have any seasons for him yet. Use Update Data to tell us where he played.</div>
                      ) : (
                        <div className="ycd-seasons" role="listbox" aria-label="Seasons">
                          {seasons.map((s) => (
                            <button type="button" key={s.key} role="option" aria-selected={s.key === seasonKey}
                              className={`ycd-season${s.key === seasonKey ? ' is-on' : ''}`} onClick={() => setSeasonKey(s.key)}>
                              <b>{s.year}</b>
                              <span>{s.team}</span>
                              <small>{s.label}{s.current ? ' · Current' : ''}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {player && info?.profileUrl ? (
                    <p className="ycd-memories">
                      * Looking to add personal memories of {firstName}? We encourage you to post those moments on{' '}
                      {info.name || player.displayName}&apos;s profile page, on his Career Path Timeline. Stories there let you
                      tell what happened and let others like, comment, share and tag. Just click the Polaroid icon at the bottom
                      left of his timeline. <a href={`${info.profileUrl}#ppTab-upload`}>Go to {info.name || player.displayName}&apos;s profile page</a>
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {/* What they have */}
            <div className="ycd-col">
              {(aboutSchool ? school : seasonForItems) ? (
                <>
                  <div className="ycd-label">
                    <span className="ycd-step">{aboutSchool ? 2 : 3}</span>{' '}
                    {aboutSchool
                      ? `What do you have for ${school?.name || 'the school'}?`
                      : `What do you have from ${seasonForItems!.year}${seasonForItems!.team ? ` · ${seasonForItems!.team}` : ''}${seasonForItems!.label ? ` (${seasonForItems!.label})` : ''}?`}
                  </div>

                  {tab === 'photo' ? (
                    <div className="ycd-checks">
                      {photoTypes.map((t) => {
                        const on = t.id in photos;
                        const pick = photos[t.id];
                        return (
                          <div className={`ycd-check${on ? ' is-on' : ''}${pick ? ` is-${pick.state}` : ''}`} key={t.id}>
                            <label className="ycd-check-head">
                              <input type="checkbox" checked={on} onChange={() => togglePhoto(t.id)} disabled={pick?.state === 'sent'} />
                              <span><b>{t.prefix}</b> · {t.label}</span>
                            </label>
                            {on ? (
                              <div className="ycd-check-body">
                                <div className="ycd-muted ycd-small">{t.spec}</div>
                                {pick ? (
                                  <div className="ycd-photo">
                                    {t.aspect && pick.state !== 'sent' ? (
                                      <PhotoCropper src={pick.preview} aspect={t.aspect} onChange={(c) => setCrop(t.id, c)} />
                                    ) : (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img className="ycd-preview" src={pick.preview} alt="" />
                                    )}
                                    <div className="ycd-small">
                                      {pick.state === 'sent' ? 'Sent. Thank you!' : pick.state === 'sending' ? 'Sending…' : pick.state === 'error' ? <span className="ycd-error">{pick.message}</span> : null}
                                    </div>
                                    {pick.state !== 'sent' ? <button type="button" className="ycd-link ycd-small" onClick={() => choosePhotoFile(t.id)}>Choose a different photo</button> : null}
                                  </div>
                                ) : (
                                  <button type="button" className="ycd-add" onClick={() => choosePhotoFile(t.id)}>
                                    <i className="ri-image-add-line" aria-hidden="true" /><span>Upload photo</span>
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files)} />
                      <div className="ycd-field">
                        <label className="ycd-label" htmlFor="ycdNote">Anything we should know? (optional)</label>
                        <textarea id="ycdNote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who took it, the game or event, who else is in it…" />
                      </div>
                    </div>
                  ) : (
                    <div className="ycd-checks">
                      {dataKinds.map((k) => {
                        const on = k.id in data;
                        return (
                          <div className={`ycd-check${on ? ' is-on' : ''}`} key={k.id}>
                            <label className="ycd-check-head">
                              <input type="checkbox" checked={on} onChange={() => toggleData(k.id)} />
                              <span><b>{k.label}</b></span>
                            </label>
                            {on ? (
                              <div className="ycd-check-body">
                                <textarea rows={3} value={data[k.id] || ''} onChange={(e) => setData((cur) => ({ ...cur, [k.id]: e.target.value }))} placeholder={k.hint} aria-label={k.label} />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      <div className="ycd-field">
                        <label className="ycd-label" htmlFor="ycdSource">Link that shows it (optional)</label>
                        <input id="ycdSource" type="url" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://" />
                      </div>
                    </div>
                  )}

                  {status.kind === 'error' && status.confirm ? (
                    <FanConfirm email={session?.email} onConfirmed={() => { void submit(); }} />
                  ) : status.kind === 'error' ? (
                    <div className="ycd-error">{status.text}</div>
                  ) : null}
                  <div className="ycd-actions">
                    <button type="button" className="ycd-btn ycd-btn-primary" onClick={submit} disabled={sending}>{sendLabel}</button>
                  </div>
                  <div className="ycd-muted ycd-small">We review everything before it goes on the site.</div>
                </>
              ) : (
                <div className="ycd-placeholder">
                  <i className={tabIcon(tab)} aria-hidden="true" />
                  <span>{aboutSchool ? 'Pick the high school' : player || manualPlayer ? 'Pick the season' : 'Pick the player'}, and we&apos;ll show you what you can send.</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="ycd-narrow">
            {tab === 'missing' ? (
              <>
                <div className="ycd-muted ycd-small">Played at the next level and not on YAT?STATS? Tell us who he is and we&apos;ll add him.</div>
                <div className="ycd-field">
                  <label className="ycd-label" htmlFor="ycdMpName">His name</label>
                  <input id="ycdMpName" type="text" value={mp.name} onChange={(e) => setMp({ ...mp, name: e.target.value })} placeholder="First and last name" />
                </div>
                <div className="ycd-field">
                  <div className="ycd-label">His high school</div>
                  <SchoolPicker value={school} onChange={setSchool} />
                </div>
                <div className="ycd-pair">
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
                <div className="ycd-pair">
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
                  <label className="ycd-label" htmlFor="ycdMpNotes">Other (optional)</label>
                  <textarea id="ycdMpNotes" rows={3} value={mp.notes} onChange={(e) => setMp({ ...mp, notes: e.target.value })} placeholder="A link to his stats or a story about him helps." />
                </div>
              </>
            ) : (
              <>
                <div className="ycd-field">
                  <div className="ycd-label">Who is it about? (optional)</div>
                  <PlayerPicker value={player} onChange={choosePlayer} onMissing={() => { setTab('missing'); setStatus({ kind: 'idle' }); }} />
                </div>
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
              <button type="button" className="ycd-btn ycd-btn-primary" onClick={submit} disabled={sending}>{sendLabel}</button>
            </div>
            <div className="ycd-muted ycd-small">We review everything before it goes on the site.</div>
          </div>
        )}
      </div>

      <style jsx global>{`
        body.drawer-contribute-open #drawerContribute { transform: translateX(0); }
        body.drawer-contribute-open .yat-drawer-mask { opacity: 1; pointer-events: auto; }
        /* Full width on phones; most of the screen on bigger ones. */
        .yat-contribute-drawer { width: 100vw; max-width: 100vw; }
        @media (min-width: 700px) { .yat-contribute-drawer { width: min(92vw, 1180px); } }
        .ycd-header { position: relative; isolation: isolate; overflow: hidden; flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 16px 12px; border-bottom: 1px solid var(--line); }
        .ycd-header::before { content: ""; position: absolute; z-index: -1; top: 50%; right: -6%; width: min(420px, 62%); aspect-ratio: 1637/1281; transform: translateY(-50%); background: url("/img/ys-crest.png") center/contain no-repeat; opacity: .15; pointer-events: none; }
        body.light-theme .ycd-header::before { filter: invert(1); opacity: .09; }
        .ycd-kicker { color: #FFD700; font: 500 14px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
        body.light-theme .ycd-kicker { color: #9a6f00; }
        .ycd-title { margin: 6px 0 0 !important; padding: 0 !important; font: 600 20px/1.05 Oswald, sans-serif !important; letter-spacing: .04em; }
        .ycd-hello { margin: 8px 0 0; font-size: 13px; line-height: 1.45; max-width: 640px; opacity: .85; }
        .ycd-close { position: static !important; flex: none; }
        .ycd-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 12px 16px 0; flex-shrink: 0; }
        .ycd-tab { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 58px; padding: 8px 4px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; opacity: .7; cursor: pointer; font: 500 12px/1.05 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; text-align: center; }
        .ycd-tab i { font-size: 19px; }
        .ycd-tab.is-active { opacity: 1; border-color: #FFD700; color: #FFD700; background: rgba(255,215,0,.08); }
        body.light-theme .ycd-tab.is-active { color: #9a6f00; border-color: #9a6f00; }
        .ycd-body { flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; padding: 14px 16px 32px; }
        .ycd-main { display: grid; grid-template-columns: 1fr; gap: 20px; }
        @media (min-width: 900px) { .ycd-main { grid-template-columns: minmax(300px, 380px) 1fr; gap: 28px; } }
        .ycd-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .ycd-narrow { display: flex; flex-direction: column; gap: 14px; max-width: 640px; }
        .ycd-muted { opacity: .65; }
        .ycd-small { font-size: 12px; line-height: 1.4; }
        .ycd-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .ycd-stack { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
        .ycd-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ycd-label { font: 500 14px/1.15 Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; }
        .ycd-step { display: inline-grid; place-items: center; width: 20px; height: 20px; margin-right: 4px; border-radius: 50%; background: #FFD700; color: #000; font-size: 13px; vertical-align: 1px; }
        .yat-contribute-drawer select, .yat-contribute-drawer textarea, .yat-contribute-drawer input[type="search"],
        .yat-contribute-drawer input[type="text"], .yat-contribute-drawer input[type="url"] {
          width: 100%; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,.06);
          color: var(--ink); padding: 10px 12px; font-family: inherit; font-size: 14px; line-height: 1.45;
        }
        .yat-contribute-drawer textarea { resize: vertical; }
        .ycd-gate { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 12px; border: 1px solid rgba(255,215,0,.5); border-radius: 8px; background: rgba(255,215,0,.07); font-size: 13px; }
        .ycd-link { border: 0; background: none; padding: 0; color: #FFD700; font: inherit; text-decoration: underline; cursor: pointer; text-align: left; }
        body.light-theme .ycd-link { color: #9a6f00; }
        .ycd-switch { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 3px; align-self: flex-start; }
        .ycd-switch button { border: 0; background: transparent; color: inherit; padding: 6px 14px; border-radius: 999px; cursor: pointer; font: 500 13px/1 Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; opacity: .7; }
        .ycd-switch button.is-on { background: #FFD700; color: #000; opacity: 1; }
        .ycd-chosen { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid rgba(255,215,0,.6); border-radius: 8px; background: rgba(255,215,0,.06); }
        .ycd-chosen img { width: 34px; height: 34px; object-fit: contain; flex: none; }
        .ycd-chosen-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
        .ycd-chosen-text small { opacity: .65; font-size: 12px; }
        .ycd-results.yat-gs-results { max-height: none; overflow: visible; }
        .ycd-results .yat-gs-result { width: 100%; text-align: left; font: inherit; }
        .ycd-seasons { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; padding-right: 2px; }
        .ycd-season { display: grid; grid-template-columns: 46px 1fr; grid-template-rows: auto auto; column-gap: 8px; align-items: baseline; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
        .ycd-season b { grid-row: span 2; font: 500 18px/1 Oswald, sans-serif; color: #FFD700; }
        body.light-theme .ycd-season b { color: #9a6f00; }
        .ycd-season span { font-size: 13px; font-weight: 600; }
        .ycd-season small { font-size: 11px; opacity: .65; }
        .ycd-season.is-on { border-color: #FFD700; background: rgba(255,215,0,.1); }
        .ycd-memories { margin: 0; font-size: 12px; line-height: 1.5; opacity: .8; }
        .ycd-memories a { color: #FFD700; }
        body.light-theme .ycd-memories a { color: #9a6f00; }
        .ycd-checks { display: flex; flex-direction: column; gap: 8px; }
        .ycd-check { border: 1px solid var(--line); border-radius: 8px; }
        .ycd-check.is-on { border-color: rgba(255,215,0,.7); }
        .ycd-check.is-sent { border-color: rgba(80,200,120,.8); }
        .ycd-check.is-error { border-color: #ff6b6b; }
        .ycd-check-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; font-size: 14px; }
        .ycd-check-head input { width: 18px; height: 18px; accent-color: #FFD700; flex: none; }
        .ycd-check-head b { font-weight: 700; }
        .ycd-check-body { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px 40px; }
        .ycd-photo { display: flex; flex-direction: column; gap: 6px; }
        .ycd-preview { max-width: 240px; max-height: 260px; object-fit: contain; border-radius: 6px; background: rgba(255,255,255,.05); }
        .ycd-add { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; padding: 10px 14px; border: 1px dashed var(--line); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font: 500 14px/1 Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; }
        .ycd-add i { font-size: 20px; }
        .ycd-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 180px; padding: 24px; border: 1px dashed var(--line); border-radius: 10px; text-align: center; opacity: .7; font-size: 14px; }
        .ycd-placeholder i { font-size: 30px; }
        .ycd-error { color: #ff6b6b; font-size: 13px; }
        .ycd-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .ycd-btn { min-height: 44px; padding: 0 22px; border-radius: 8px; border: 1px solid #FFD700; background: transparent; color: #FFD700; font: 500 15px/1 Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; cursor: pointer; }
        .ycd-btn-primary { background: #FFD700; color: #000; }
        body.light-theme .ycd-btn:not(.ycd-btn-primary) { border-color: #9a6f00; color: #9a6f00; }
        .ycd-btn:disabled { opacity: .55; cursor: default; }
        .ycd-done p { margin: 0 0 8px; line-height: 1.45; }
        .ycd-done-title { font: 600 20px/1.1 Oswald, sans-serif; letter-spacing: .04em; }
      `}</style>
    </aside>,
    document.body
  );
}
