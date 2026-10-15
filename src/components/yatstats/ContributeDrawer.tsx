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
import ContributePhotoFlow from '@/components/yatstats/ContributePhotoFlow';
import ContributeSearch from '@/components/yatstats/ContributeSearch';
import {
  CONTRIBUTE_OPTIONS,
  CONTRIBUTE_OPEN_EVENT,
  DATA_KINDS,
  PLAYER_LEVELS,
  type ContributeOpen,
  type ContributePlayer,
  type ContributeSchool,
  type ContributeTab,
  type DataKind,
  type PhotoPurpose,
  type Season,
  tabIcon,
  yearsOfHisLife,
} from '@/lib/contribute';

type FanSession = { uid?: string; email?: string; firstName?: string | null; plan?: string | null; isSuperfan?: boolean };
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

// The chosen player, as the same card Global Search shows him.
function ChosenPlayer({ player, onChange }: { player: ContributePlayer; onChange: () => void }) {
  const crest = player.crestUrl || (player.schoolId ? `${S3}/schools/${player.schoolId}.png` : CREST_FALLBACK);
  return (
    <div className="ycd-chosen-wrap">
      <div className="yat-search-card yat-search-player-result ycd-chosen-player">
        <span aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="yat-search-thumb yat-search-player-headshot" src={`${S3}/players/now/${encodeURIComponent(player.playerId)}.jpg`} alt="" onError={(e) => { e.currentTarget.src = '/img/headshot-silhouette.png'; }} />
        <span className="yat-search-player-text-link">
          <strong>{player.displayName}</strong>
          {player.schoolName ? <small className="yat-search-hs-line">{player.schoolName}</small> : null}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="yat-search-thumb yat-search-player-hs-logo" src={crest} alt="" onError={(e) => { e.currentTarget.src = CREST_FALLBACK; }} />
      </div>
      <button type="button" className="ycd-link ycd-small" onClick={onChange}>Change player</button>
    </div>
  );
}

function ChosenSchool({ school, onChange }: { school: ContributeSchool; onChange: () => void }) {
  return (
    <div className="ycd-chosen-wrap">
      <div className="ycd-chosen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${S3}/schools/${school.hsid}.png`} alt="" onError={(e) => { e.currentTarget.src = CREST_FALLBACK; }} />
        <span className="ycd-chosen-text"><b>{school.name}</b>{school.location ? <small>{school.location}</small> : null}</span>
      </div>
      <button type="button" className="ycd-link ycd-small" onClick={onChange}>Change school</button>
    </div>
  );
}

// Pick a school: the shared search, schools only.
function SchoolPicker({ value, onChange }: { value: ContributeSchool | null; onChange: (s: ContributeSchool | null) => void }) {
  return value ? <ChosenSchool school={value} onChange={() => onChange(null)} /> : <ContributeSearch mode="school" onSchool={onChange} />;
}

// Pick a player: the shared search.
function PlayerPicker({ value, onChange }: { value: ContributePlayer | null; onChange: (p: ContributePlayer | null) => void }) {
  return value ? <ChosenPlayer player={value} onChange={() => onChange(null)} /> : <ContributeSearch onPlayer={onChange} />;
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
  // The portal's target (document.body) exists only once mounted.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const [data, setData] = useState<Partial<Record<DataKind, string>>>({});
  const [source, setSource] = useState('');
  // The Photos drawer (ContributePhotoFlow): the kind of photo an entry
  // point asked for, and a key that starts it fresh for a new entry point.
  const [photoType, setPhotoType] = useState<PhotoPurpose | undefined>(undefined);
  const [photoFlowKey, setPhotoFlowKey] = useState(0);
  // Missing Next-Level Alumni / News Tip
  const [mp, setMp] = useState({ name: '', gradYear: '', position: '', level: '', team: '', notes: '' });
  const [tipUrl, setTipUrl] = useState('');
  const [tipWhy, setTipWhy] = useState('');

  const signedIn = Boolean(session?.uid && session?.email);
  const sending = status.kind === 'sending';
  // Every year of his life, newest first (the same list as the Photo
  // drawer), plus "Other": a year and a team or league we don't list.
  const [other, setOther] = useState<{ year: number | ''; team: string }>({ year: '', team: '' });
  const years = seasons ? yearsOfHisLife(seasons, info?.classOf ?? null, THIS_YEAR) : null;
  const season: Season | null = seasonKey === 'other'
    ? (other.year ? { key: 'other', year: Number(other.year), stage: 'other', team: other.team.trim(), level: '', label: 'Other', current: false } : null)
    : years?.find((s) => s.key === seasonKey) || null;

  const sessionRef = useRef<FanSession | null>(null);
  const pendingOpen = useRef(false);

  // Slide in from the left, over everything else (the account drawer
  // included, when the fan just signed in from it).
  const show = useCallback(() => {
    setOpen(true);
    document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-sort-open', 'drawer-account-open', 'drawer-favorites-open', 'drawer-story-open');
    document.body.classList.add('drawer-contribute-open', 'drawer-open');
    const account = document.getElementById('drawerAccount');
    account?.classList.remove('open', 'is-open', 'active');
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    document.body.classList.remove('drawer-contribute-open');
    if (!document.body.className.match(/drawer-(left|right|sort|account|favorites|story)-open/)) document.body.classList.remove('drawer-open');
  }, []);

  const resetForms = useCallback(() => {
    setData({});
    setSource(''); setTipUrl(''); setTipWhy('');
    setMp({ name: '', gradYear: '', position: '', level: '', team: '', notes: '' });
    setStatus({ kind: 'idle' });
  }, []);

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
      // Each photo entry point starts fresh, with the correct destination.
      // Do not reuse a player or logo from the previous contributor's form.
      if (d.tab === 'photo' || d.photoType) {
        setPhotoType(d.photoType);
        setPhotoFlowKey((k) => k + 1);
        if (d.player === undefined) choosePlayer(null);
        setSchool(d.school || hubSchool);
      }
      if (d.player !== undefined && d.player?.playerId !== player?.playerId) choosePlayer(d.player);
      if (d.school) setSchool(d.school);
      const wantsSchool = d.photoType === 'school_logo' || (d.dataKind ? DATA_KINDS.find((k) => k.id === d.dataKind)?.seasons === 'school' : false);
      setAboutSchool(Boolean(wantsSchool));
      if (d.dataKind) setData((cur) => (d.dataKind! in cur ? cur : { ...cur, [d.dataKind!]: '' }));
      // Visitors can select their photo and preview the result without
      // creating an account. Sign-in happens only at submission.
      show();
      setSessionLoading(true);
      fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        .then((res) => res.json())
        .then((body) => {
          const next = body?.authenticated ? (body.session as FanSession) : null;
          setSession(next);
          sessionRef.current = next;
          // Keep the drawer open while anonymous; the submit action
          // takes the visitor through authentication when necessary.
        })
        .catch(() => { setSession(null); })
        .finally(() => setSessionLoading(false));
    };
    window.addEventListener(CONTRIBUTE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONTRIBUTE_OPEN_EVENT, onOpen);
  }, [resetForms, choosePlayer, show, status.kind, player?.playerId, hubSchool?.hsid]);

  // Back from joining or logging in: check again, and open the drawer they
  // asked for before they had to sign in.
  useEffect(() => {
    const refresh = () => {
      fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        .then((res) => res.json())
        .then((body) => {
          const next = body?.authenticated ? (body.session as FanSession) : null;
          setSession(next);
          sessionRef.current = next;
          if (next?.uid && pendingOpen.current) {
            pendingOpen.current = false;
            show();
          }
        })
        .catch(() => {});
    };
    const forget = () => { sessionRef.current = null; setSession(null); };
    window.addEventListener('yat-auth-success', refresh);
    window.addEventListener('yat-sign-out', forget);
    return () => { window.removeEventListener('yat-auth-success', refresh); window.removeEventListener('yat-sign-out', forget); };
  }, [show]);

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
  const dataKinds = DATA_KINDS.filter((k) =>
    aboutSchool ? k.seasons === 'school' : k.seasons === 'any' || (k.seasons === 'hs' && seasonForItems?.stage === 'hs')
  );

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
  const hubName = [hubSchool?.name?.toUpperCase(), hubSchool?.location ? `(${hubSchool.location.toUpperCase()})` : ''].filter(Boolean).join(' ');
  const firstName = (player?.displayName || manualName || '').split(' ')[0] || 'him';
  const playerFlow = tab === 'photo' || tab === 'data';
  const sendLabel = !signedIn ? 'Sign in to send' : sending ? 'Sending…' : 'Send';

  return createPortal(
    <aside className="yat-drawer yat-drawer-left yat-contribute-drawer" id="drawerContribute" aria-label="Contribute to YAT?STATS" aria-hidden={!open}>
      <div className="ycd-header">
        <div>
          <h3 className="ycd-title"><i className={tabIcon(tab)} aria-hidden="true" /> {tab === 'photo' ? 'Photo Contribution' : TABS.find((t) => t.id === tab)?.label}</h3>
          {signedIn ? (
            <p className="ycd-hello">
              Hello {fanName || 'there'}! Thank you for being a <b>{fanKind} Contributor</b> of <b>{hubName || 'YAT?STATS'}</b>.
            </p>
          ) : null}
        </div>
        <button type="button" className="yat-icon-btn ycd-close" onClick={close} aria-label="Close"><i className="ri-close-line" /></button>
      </div>


      <div className="ycd-body">
        {!sessionLoading && !signedIn ? (
          <div className="ycd-gate">
            <span>Get started now. A free account is only needed when you submit.</span>
            <button type="button" className="ycd-link" onClick={() => openAccountDrawer('signin')}>Sign in</button>
            <span className="ycd-muted">or</span>
            <button type="button" className="ycd-link" onClick={() => openAccountDrawer('register')}>Join free</button>
          </div>
        ) : null}

        {tab === 'photo' ? (
          <ContributePhotoFlow
            key={photoFlowKey}
            hubSchool={hubSchool}
            signedIn={signedIn}
            email={session?.email}
            initialPlayer={player}
            initialType={photoType}
            onSignIn={() => { pendingOpen.current = true; openAccountDrawer('signin'); }}
            onClose={close}
          />
        ) : status.kind === 'done' ? (
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
                        <PlayerPicker value={player} onChange={choosePlayer} />
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
                      ) : (
                        <>
                          <div className="ycd-seasons" role="listbox" aria-label="Seasons">
                            {(years || []).map((s) => (
                              <button type="button" key={s.key} role="option" aria-selected={s.key === seasonKey}
                                className={`ycd-season${s.key === seasonKey ? ' is-on' : ''}${s.team ? '' : ' is-plain'}`} onClick={() => setSeasonKey(s.key)}>
                                <b>{s.year}</b>
                                <span>{s.team || s.label || '\u00a0'}</span>
                                <small>{s.team ? `${s.label}${s.current ? ' · Current' : ''}` : ''}</small>
                              </button>
                            ))}
                            <button type="button" role="option" aria-selected={seasonKey === 'other'}
                              className={`ycd-season${seasonKey === 'other' ? ' is-on' : ''}`} onClick={() => setSeasonKey('other')}>
                              <b>Other</b>
                              <span>A year or team that isn&apos;t listed</span>
                              <small>Fall league, summer ball, travel team…</small>
                            </button>
                          </div>
                          {seasonKey === 'other' ? (
                            <div className="ycd-pair">
                              <select value={other.year} onChange={(e) => setOther((o) => ({ ...o, year: e.target.value ? Number(e.target.value) : '' }))} aria-label="Year">
                                <option value="">Year…</option>
                                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                              </select>
                              <input type="text" value={other.team} onChange={(e) => setOther((o) => ({ ...o, team: e.target.value }))} placeholder="Team or league" maxLength={120} />
                            </div>
                          ) : null}
                        </>
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

                  {(
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
                  <PlayerPicker value={player} onChange={choosePlayer} />
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
        /* Full screen, like the Fantasy Bracket's stat drawer: every side
           drawer is held to the side-drawer width (DrawerLayoutOverrides,
           !important), so the id beats it; above the site's floating
           buttons, so nothing covers it. The content stays a readable width. */
        #drawerContribute.yat-drawer { width: 100vw !important; max-width: 100vw !important; left: 0; right: 0; z-index: 2147483200; border-right: 0; }
        #drawerContribute .ycd-header, #drawerContribute .ycd-body { width: 100%; max-width: 1240px; margin-left: auto; margin-right: auto; }
        .ycd-header { position: relative; isolation: isolate; overflow: hidden; flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 14px 10px; border-bottom: 1px solid var(--line); }
        .ycd-header::before { content: ""; position: absolute; z-index: -1; top: 50%; right: -6%; width: min(420px, 62%); aspect-ratio: 1637/1281; transform: translateY(-50%); background: url("/img/ys-crest.png") center/contain no-repeat; opacity: .15; pointer-events: none; }
        body.light-theme .ycd-header::before { filter: invert(1); opacity: .09; }
        .ycd-kicker { color: var(--sb-text); font: 600 12px/1 var(--yat-font-compact); letter-spacing: .1em; text-transform: uppercase; }
        .ycd-title { margin: 0 !important; padding: 0 !important; font: 700 22px/1.15 var(--yat-font-compact) !important; letter-spacing: .005em; }
        .ycd-title i { display: inline-grid; place-items: center; width: 24px; height: 24px; margin-right: 6px; border-radius: 5px; background: var(--sb-panel); border: 1px solid var(--sb-rim); color: #fff; font-size: 13px; vertical-align: 2px; }
        .ycd-sub { margin-top: 4px; font: 600 12px/1.2 var(--yat-font-compact); letter-spacing: .04em; text-transform: uppercase; opacity: .8; }
        .ycd-chosen-wrap { display: flex; flex-direction: column; gap: 6px; }
        .ycd-chosen-player { border-color: var(--sb-green-hi) !important; }
        .ycd-hello { margin: 6px 0 0; font: 400 12.5px/1.45 var(--yat-font-ui); max-width: 720px; color: var(--sb-ink-muted); }
        .ycd-close { position: static !important; flex: none; }
        .ycd-body { flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; padding: 12px 14px 28px; font-family: var(--yat-font-ui); font-size: 13px; }
        .ycd-main { display: grid; grid-template-columns: 1fr; gap: 20px; }
        @media (min-width: 900px) { .ycd-main { grid-template-columns: minmax(300px, 380px) 1fr; gap: 28px; } }
        .ycd-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .ycd-narrow { display: flex; flex-direction: column; gap: 14px; max-width: 640px; }
        .ycd-muted { opacity: .65; }
        .ycd-small { font-size: 12px; line-height: 1.4; }
        .ycd-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .ycd-stack { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
        .ycd-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ycd-label { font: 700 17px/1.2 var(--yat-font-compact); letter-spacing: .005em; }
        .ycd-step { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 3px; margin-right: 6px; border-radius: 4px; background: var(--sb-panel); border: 1px solid var(--sb-rim); color: #fff; font: 700 11px/1 var(--yat-font-compact); vertical-align: 1px; }
        .yat-contribute-drawer select, .yat-contribute-drawer textarea, .yat-contribute-drawer input[type="search"],
        .yat-contribute-drawer input[type="text"], .yat-contribute-drawer input[type="url"] {
          width: 100%; border: 1px solid var(--sb-card-border); border-radius: 5px; background: rgba(255,255,255,.05);
          color: var(--ink); padding: 7px 9px; font-family: var(--yat-font-ui); font-size: 13px; line-height: 1.4;
        }
        .yat-contribute-drawer textarea { resize: vertical; }
        .ycd-gate { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 12px; border: 1px solid var(--sb-card-border); border-radius: 7px; background: var(--sb-card-bg); font-size: 12.5px; }
        .ycd-link { border: 0; background: none; padding: 0; color: var(--sb-text); font: inherit; text-decoration: underline; cursor: pointer; text-align: left; }
        .ycd-switch { display: inline-flex; border: 1px solid var(--sb-card-border); border-radius: 6px; padding: 2px; align-self: flex-start; }
        .ycd-switch button { border: 0; background: transparent; color: inherit; padding: 5px 12px; border-radius: 4px; cursor: pointer; font: 600 12px/1 var(--yat-font-compact); letter-spacing: .07em; text-transform: uppercase; opacity: .7; }
        .ycd-switch button.is-on { background: var(--sb-panel); color: var(--sb-cream); box-shadow: inset 0 0 0 1px var(--sb-rim); opacity: 1; }
        .ycd-chosen { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--sb-green-hi); border-radius: 6px; background: var(--sb-green-soft); }
        .ycd-chosen img { width: 34px; height: 34px; object-fit: contain; flex: none; }
        .ycd-chosen-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
        .ycd-chosen-text small { opacity: .65; font-size: 12px; }
        .ycd-results.yat-gs-results { max-height: none; overflow: visible; }
        .ycd-results .yat-gs-result { width: 100%; text-align: left; font: inherit; }
        .ycd-seasons { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; padding-right: 2px; }
        .ycd-season { display: grid; grid-template-columns: 46px 1fr; grid-template-rows: auto auto; column-gap: 8px; align-items: baseline; padding: 6px 9px; border: 1px solid var(--sb-card-border); border-radius: 6px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
        .ycd-season b { grid-row: span 2; font: 600 15px/1 var(--yat-font-compact); color: var(--sb-text); }
        .ycd-season span { font: 700 13px/1.2 var(--yat-font-compact); text-transform: uppercase; letter-spacing: .02em; }
        .ycd-season small { font-size: 11px; opacity: .65; }
        .ycd-season.is-plain span { opacity: .75; }
        .ycd-season.is-on { border-color: var(--sb-green-hi); background: var(--sb-green-soft); }
        .ycd-memories { margin: 0; font-size: 12px; line-height: 1.5; opacity: .8; }
        .ycd-memories a { color: var(--sb-text); }
        .ycd-checks { display: flex; flex-direction: column; gap: 8px; }
        .ycd-check { border: 1px solid var(--line); border-radius: 8px; }
        .ycd-check.is-on { border-color: var(--sb-green-hi); }
        .ycd-check.is-sent { border-color: rgba(80,200,120,.8); }
        .ycd-check.is-error { border-color: #ff6b6b; }
        .ycd-check-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; font-size: 14px; }
        .ycd-check-head input { width: 18px; height: 18px; accent-color: var(--sb-green-hi); flex: none; }
        .ycd-check-head b { font-weight: 700; }
        .ycd-check-body { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px 40px; }
        .ycd-photo { display: flex; flex-direction: column; gap: 6px; }
        .ycd-preview { max-width: 240px; max-height: 260px; object-fit: contain; border-radius: 6px; background: rgba(255,255,255,.05); }
        .ycd-add { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; padding: 10px 14px; border: 1px dashed var(--line); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font: 600 12px/1 var(--yat-font-compact); letter-spacing: .07em; text-transform: uppercase; }
        .ycd-add i { font-size: 20px; }
        .ycd-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 180px; padding: 24px; border: 1px dashed var(--line); border-radius: 10px; text-align: center; opacity: .7; font-size: 14px; }
        .ycd-placeholder i { font-size: 30px; }
        .ycd-error { color: #ff6b6b; font-size: 13px; }
        .ycd-ok { color: #3ddc84; font-weight: 600; }
        .ycd-proof { display: flex; flex-direction: column; gap: 12px; }
        .ycd-proof-head { font: 700 20px/1.15 var(--yat-font-compact); color: var(--sb-ink); }
        .ycd-proof-item { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--sb-card-border); border-radius: 7px; }
        .ycd-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .ycd-btn { min-height: 32px; padding: 0 14px; border-radius: 5px; border: 1px solid var(--sb-green-hi); background: transparent; color: var(--sb-text); font: 600 13px/1 var(--yat-font-compact); letter-spacing: .07em; text-transform: uppercase; cursor: pointer; }
        .ycd-btn-primary { background: var(--sb-panel); border-color: var(--sb-rim); color: #fff; }
        .ycd-btn:disabled { opacity: .55; cursor: default; }
        .ycd-done p { margin: 0 0 8px; line-height: 1.45; }
        .ycd-done-title { font: 700 15px/1.1 var(--yat-font-compact); letter-spacing: .04em; }
      `}</style>
    </aside>,
    document.body
  );
}
