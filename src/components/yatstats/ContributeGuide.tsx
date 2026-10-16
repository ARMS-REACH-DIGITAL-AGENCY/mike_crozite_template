'use client';

// Connect & Contribute is a transaction desk, not a marketing landing page.
// The same four-field visual hierarchy as the player-profile News list:
// destination graphic, action name, one instruction, and one click to begin.
// All photo cards open the existing image flow with the correct slot preselected.

import { useContext, useEffect, useRef, useState } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import {
  PHOTO_TYPES, SPONSOR_INTERESTS, openContribute, openConnectInquiry, CONNECT_INQUIRY_EVENT,
  type ContributeOpen, type PhotoPurpose, type SponsorInterest,
} from '@/lib/contribute';

const PHOTO_DETAILS: Partial<Record<PhotoPurpose, string>> = Object.fromEntries(
  PHOTO_TYPES.map((p) => [p.id, p.spec])
);

export type ThumbKind = 'front' | 'headshot' | 'back' | 'timeline' | 'logos' |
  'news' | 'missing' | 'data' | 'profile' | 'banner' | 'bracket' | 'business' | 'video';

export type DeskCard = {
  id: string;
  eyebrow: string;
  title: string;
  instruction: string;
  thumb: ThumbKind;
  action: string;
  detail: ContributeOpen;
  help?: PhotoPurpose;
};
export type SponsorCard = {
  id: string;
  eyebrow: string;
  title: string;
  instruction: string;
  thumb: ThumbKind;
  interest?: SponsorInterest;
  action: string;
  soon?: boolean;
};

export const CONTRIBUTIONS: DeskCard[] = [
  { id: 'cc-photo', eyebrow: 'FLIP CARD · FRONT', title: 'High School Photo', instruction: 'Add a high school-era photo to the front of an alumnus\'s flip card.', thumb: 'front', action: 'UPLOAD PHOTO', detail: { tab: 'photo', photoType: 'flip_card' }, help: 'flip_card' },
  { id: 'cc-headshot', eyebrow: 'GALLERY · PROFILE', title: 'Player Headshot', instruction: 'Send a face-and-shoulders photo for a player or a specific season.', thumb: 'headshot', action: 'UPLOAD HEADSHOT', detail: { tab: 'photo', photoType: 'headshot' }, help: 'headshot' },
  { id: 'cc-action', eyebrow: 'FLIP CARD · BACK', title: 'Current Action Photo', instruction: 'Add a current-season action photo to the back of a player\'s flip card.', thumb: 'back', action: 'UPLOAD ACTION PHOTO', detail: { tab: 'photo', photoType: 'back_hero' }, help: 'back_hero' },
  { id: 'cc-timeline', eyebrow: 'PLAYER PROFILE · CAREER PATH', title: 'Career Timeline Photo', instruction: 'Add a playing-days photo to a specific year of an alumnus\'s career.', thumb: 'timeline', action: 'UPLOAD TIMELINE PHOTO', detail: { tab: 'photo', photoType: 'timeline_hero' }, help: 'timeline_hero' },
  { id: 'cc-logo', eyebrow: 'SCHOOL & TEAM ARTWORK', title: 'School or Team Logo', instruction: 'Supply a missing or corrected logo for a school or college/pro team.', thumb: 'logos', action: 'UPLOAD LOGO', detail: { tab: 'photo', photoType: 'school_logo' }, help: 'school_logo' },
  { id: 'cc-tip', eyebrow: 'ACTIVE ALUMNI NEWS', title: 'News Tip', instruction: 'Paste a link to a player story, award, signing, or call-up.', thumb: 'news', action: 'SEND LINK', detail: { tab: 'tip' } },
  { id: 'cc-missing', eyebrow: 'ALL-TIME NEXT-LEVEL LIST', title: 'Missing Alumni', instruction: 'Tell us who is missing, their class year, and where they played.', thumb: 'missing', action: 'ADD ALUMNUS', detail: { tab: 'missing' } },
  { id: 'cc-data', eyebrow: 'ROSTER & PLAYER RECORDS', title: 'Correct Information', instruction: 'Update graduation years, playing history, or school and player details.', thumb: 'data', action: 'SUBMIT CORRECTION', detail: { tab: 'data' } },
];

export const SPONSORSHIPS: SponsorCard[] = [
  { id: 'cc-profile-sponsor', eyebrow: 'PLAYER PROFILE', title: 'Sponsor a Player Profile', instruction: 'Request a business placement on an alumnus\'s profile.', thumb: 'profile', action: 'REQUEST PLACEMENT', interest: 'profile' },
  { id: 'cc-fans', eyebrow: 'SCHOOL HUB', title: 'Sponsor This School', instruction: 'Request a banner or featured placement on this school\'s hub.', thumb: 'banner', action: 'REQUEST PLACEMENT', interest: 'title' },
  { id: 'cc-bracket-sponsor', eyebrow: 'FANTASY BRACKET', title: 'Sponsor the Bracket', instruction: 'Request a placement in the school-versus-school fantasy competition.', thumb: 'bracket', action: 'REQUEST PLACEMENT', interest: 'bracket' },
  { id: 'cc-alumni', eyebrow: 'ALUMNI PROFILE', title: 'Promote Your Alumni Business', instruction: 'Request business details and branding on your alumni profile.', thumb: 'business', action: 'REQUEST PLACEMENT', interest: 'alumni' },
  { id: 'cc-player', eyebrow: 'PERSONAL VIDEO REQUESTS', title: 'Message From an Alumnus', instruction: 'Personalized player videos are planned; ask to hear when requests open.', thumb: 'video', action: 'REQUEST UPDATES', interest: 'video' },
];

// Real baseball and existing YAT?STATS artwork instead of invented iconography.
// These are illustrative examples, never passed off as the selected player's image.
const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
export const THUMB_IMAGES: Record<ThumbKind, { src: string; label: string; position?: string }> = {
  front: { src: `${S3}/players/then/180827.jpg`, label: 'HIGH SCHOOL' },
  headshot: { src: `${S3}/players/now/225132.jpg`, label: 'HEADSHOT', position: 'center 24%' },
  back: { src: `${S3}/players/back-card/180827.webp`, label: 'ACTION PHOTO', position: 'center 30%' },
  timeline: { src: `${S3}/players/then/225132.jpg`, label: 'CAREER PATH' },
  logos: { src: `${S3}/schools/5004.png`, label: 'TEAM ARTWORK' },
  news: { src: '/img/connect-contribute-portal.png', label: 'NEWS' },
  missing: { src: '/img/az_state_champ_roster.webp', label: 'ALL-TIME ALUMNI' },
  data: { src: '/img/connect-contribute-portal.png', label: 'PLAYER RECORDS' },
  profile: { src: `${S3}/players/now/180827.jpg`, label: 'PLAYER PROFILE' },
  banner: { src: '/img/splash-partner-demo.svg', label: 'SPONSORSHIP' },
  bracket: { src: `${S3}/players/back-card/225132.webp`, label: 'FANTASY BRACKET' },
  business: { src: `${S3}/players/now/180827.jpg`, label: 'ALUMNI' },
  video: { src: `${S3}/players/now/225132.jpg`, label: 'VIDEO MESSAGE' },
};
function Thumb({ kind }: { kind: ThumbKind }) {
  const { src, label, position } = THUMB_IMAGES[kind];
  const [cutoutAvailable, setCutoutAvailable] = useState(true);
  if (kind === 'headshot') {
    // Reuse Row 3's actual transparent cutout. The same portrait is drawn
    // twice at precisely the same size and position: inside the circular
    // crop, then ONLY the 16px above its rim. There is no second full image
    // slapped over the circle. On failure, show the regular cropped headshot.
    const cutout = `${S3}/players/now-cutouts/225132.png`;
    const photo = cutoutAvailable ? cutout : src;
    return (
      <span className="ccd-thumb ccd-thumb-headshot" aria-hidden="true">
        <span className="ccd-headshot-ring">
          <img className={cutoutAvailable ? 'ccd-headshot-cutout' : 'ccd-headshot-fallback'}
            loading="lazy" src={photo} alt=""
            onError={(event) => {
              if (cutoutAvailable) setCutoutAvailable(false);
              else if (!event.currentTarget.src.endsWith('/img/connect-contribute-portal.png'))
                event.currentTarget.src = '/img/connect-contribute-portal.png';
            }} />
        </span>
        {cutoutAvailable ? (
          <img className="ccd-headshot-above" src={cutout} loading="lazy" alt=""
            onError={() => setCutoutAvailable(false)} />
        ) : null}
        <span className="ccd-thumb-label">HEADSHOT</span>
      </span>
    );
  }
  return (
    <span className={`ccd-thumb ccd-thumb-${kind}`} aria-hidden="true">
      {/* Native img avoids Next remote image configuration for S3 originals. */}
      <img loading="lazy" src={src} alt="" style={position ? { objectPosition: position } : undefined}
        onError={(e) => {
          const img = e.currentTarget;
          // Fallback is site artwork, not a glyph, sticker, or stick figure.
          if (!img.src.endsWith('/img/connect-contribute-portal.png')) img.src = '/img/connect-contribute-portal.png';
        }} />
      <span className="ccd-thumb-label">{label}</span>
    </span>
  );
}

function Transaction({ item }: { item: DeskCard }) {
  const [showPlacement, setShowPlacement] = useState(false);
  const openUpload = () => openContribute(item.detail);
  return (
    <article className="ccd-item" id={item.id}>
      <div className="ccd-item-layout">
        <button type="button" className="ccd-image-button" onClick={openUpload}
          aria-label={item.action + ': ' + item.title}>
          <Thumb kind={item.thumb} />
        </button>
        <div className="ccd-item-copy">
          <span className="ccd-eyebrow">{item.eyebrow}</span>
          <button type="button" className="ccd-title-button" onClick={openUpload}>{item.title}</button>
          <span className="ccd-summary">{item.instruction}</span>
          <div className="ccd-item-actions">
            <button type="button" className="ccd-action-button" onClick={openUpload}>
              {item.action} <i className="ri-arrow-right-line" aria-hidden="true" />
            </button>
            {item.help ? (
              <button type="button" className="ccd-placement-button"
                aria-expanded={showPlacement} aria-controls={`ccd-placement-${item.id}`}
                onClick={() => setShowPlacement((previous) => !previous)}>
                {showPlacement ? 'HIDE DETAILS' : 'SEE PLACEMENT'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {item.help && showPlacement ? (
        <div id={`ccd-placement-${item.id}`} className="ccd-placement-details">
          <p>{PHOTO_DETAILS[item.help]}</p>
          <button type="button" onClick={openUpload}>Start upload <i className="ri-arrow-right-line" aria-hidden="true" /></button>
        </div>
      ) : null}
    </article>
  );
}

export function SponsorInquiry({ interest, onClose }: { interest: SponsorInterest; onClose: () => void }) {
  const school = useContext(SchoolContext);
  const [form, setForm] = useState({ name: '', email: '', phone: '', business: '', message: '', website: '' });
  const [choice, setChoice] = useState<SponsorInterest>(interest);
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; text?: string }>({ kind: 'idle' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (state.kind === 'sent') {
    return (
      <div className="ccg-form">
        <p className="ccg-form-done">Thank you{form.name ? `, ${form.name.split(' ')[0]}` : ''}! The YAT?STATS Partner Program Team will be in touch.</p>
        <button type="button" className="ccg-link" onClick={onClose}>Close</button>
      </div>
    );
  }

  return (
    <form
      className="ccg-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ kind: 'sending' });
        try {
          const res = await fetch('/api/contribute/sponsor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, interest: choice, hsid: school?.hsid || '', schoolName: school?.hsName || '', pageUrl: window.location.href }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body?.error || 'That did not go through.');
          setState({ kind: 'sent' });
        } catch (error) {
          setState({ kind: 'error', text: error instanceof Error ? error.message : 'That did not go through.' });
        }
      }}
    >
      <div className="ccg-form-title">{interest === 'video' ? 'Ask about personalized player videos' : 'Contact the YAT?STATS Partner Program Team'}</div>
      <label>I&apos;m interested in
        <select value={choice} onChange={(e) => setChoice(e.target.value as SponsorInterest)}>
          {Object.entries(SPONSOR_INTERESTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <div className="ccg-form-row">
        <label>Name<input required value={form.name} onChange={set('name')} autoComplete="name" /></label>
        <label>Business<input value={form.business} onChange={set('business')} autoComplete="organization" /></label>
      </div>
      <div className="ccg-form-row">
        <label>Email<input required type="email" value={form.email} onChange={set('email')} autoComplete="email" /></label>
        <label>Phone<input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" /></label>
      </div>
      <label>Anything we should know?<textarea rows={3} value={form.message} onChange={set('message')} /></label>
      <input className="ccg-hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} aria-hidden="true" />
      {state.kind === 'error' ? <p className="ccg-form-error">{state.text}</p> : null}
      <div className="ccg-actions">
        <button type="submit" className="ccg-btn" disabled={state.kind === 'sending'}>{state.kind === 'sending' ? 'Sending…' : 'Send'}</button>
        <button type="button" className="ccg-link" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}


export default function ContributeGuide({ schoolName }: { schoolName: string }) {
  const [inquiry, setInquiry] = useState<{ id: string; interest: SponsorInterest } | null>(null);
  const [view, setView] = useState<'contribute' | 'connect'>('contribute');
  const hub = schoolName || 'your school';
  const handledShareLink = useRef(false);
  const inquiryCloseButton = useRef<HTMLButtonElement>(null);

  // Row 3 shortcuts and portal transaction rows open the same left drawer.
  useEffect(() => {
    const onInquiry = (event: Event) => {
      const interest = (event as CustomEvent<SponsorInterest>).detail;
      if (!interest || !(interest in SPONSOR_INTERESTS)) return;
      setInquiry({ id: interest, interest });
      setView('connect');
    };
    window.addEventListener(CONNECT_INQUIRY_EVENT, onInquiry);
    return () => window.removeEventListener(CONNECT_INQUIRY_EVENT, onInquiry);
  }, []);

  useEffect(() => {
    if (!inquiry) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inquiryCloseButton.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInquiry(null);
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener('keydown', onEscape);
    };
  }, [inquiry]);

  // Shareable, prefilled upload links for school outreach, e.g.
  // /connect-contribute?upload=flip_card&playerId=180827.
  // A fan can go straight to the right form without searching for the
  // school, the player, or the destination. An invalid player falls
  // back safely to the normal player search.
  useEffect(() => {
    if (handledShareLink.current) return;
    handledShareLink.current = true;
    const params = new URLSearchParams(window.location.search);
    const rawType = params.get('upload') || params.get('photoType');
    const photoType = PHOTO_TYPES.find((type) => type.id === rawType)?.id;
    const action = params.get('contribute');
    if (!photoType && !['tip', 'missing', 'data', 'photo'].includes(String(action || ''))) return;
    const tab = photoType || action === 'photo' ? 'photo' : action === 'tip' || action === 'missing' || action === 'data' ? action : 'photo';
    const playerId = String(params.get('playerId') || '').trim();
    const open = (player?: ContributeOpen['player']) => {
      requestAnimationFrame(() => openContribute({ tab, photoType, ...(player ? { player } : {}) }));
    };
    if (!playerId || !/^(?:YAT)?\d+$/i.test(playerId)) { open(); return; }
    fetch(`/api/contribute/seasons?playerId=${encodeURIComponent(playerId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const p = data?.player;
        if (!p?.name || !p?.hsid) return open();
        open({
          playerId,
          displayName: String(p.name),
          schoolId: String(p.hsid),
          schoolName: String(p.schoolName || hub),
        });
      })
      .catch(() => open());
  }, [hub]);

  // Links from the player gallery, account drawer and Row 3 must reveal
  // the right mobile tab even when visitors arrive with an existing hash.
  useEffect(() => {
    const selectFromHash = () => {
      const target = window.location.hash.slice(1);
      if (!target) return;
      const connect = target === 'cc-connect' || SPONSORSHIPS.some((card) => card.id === target);
      const contribute = target === 'cc-contribute' || CONTRIBUTIONS.some((card) => card.id === target);
      if (connect) setView('connect');
      if (contribute) setView('contribute');
    };
    const selectFromShortcut = () => selectFromHash();
    selectFromHash();
    window.addEventListener('hashchange', selectFromHash);
    window.addEventListener('yat-contribute-navigate', selectFromShortcut);
    return () => {
      window.removeEventListener('hashchange', selectFromHash);
      window.removeEventListener('yat-contribute-navigate', selectFromShortcut);
    };
  }, []);

  return (
    <div className="ccd">
      <h1 className="ccd-visually-hidden">Connect &amp; Contribute</h1>
      <nav className="ccd-mobile-switch" role="tablist" aria-label="Connect and Contribute">
        <button id="ccd-tab-contribute" type="button" role="tab" aria-controls="cc-contribute" aria-selected={view === 'contribute'} className={view === 'contribute' ? 'is-on' : ''} onClick={() => setView('contribute')}>CONTRIBUTE</button>
        <button id="ccd-tab-connect" type="button" role="tab" aria-controls="cc-connect" aria-selected={view === 'connect'} className={view === 'connect' ? 'is-on' : ''} onClick={() => setView('connect')}>CONNECT</button>
      </nav>

      <div className="ccd-columns">
        <section className={`ccd-column ccd-connect${view === 'connect' ? ' is-active' : ''}`} id="cc-connect" aria-label="Connect transactions">
          <header className="ccd-column-heading">
            <h2>CONNECT</h2>
            <p>Business placements and player experiences.</p>
          </header>
          <div className="ccd-list">
            {SPONSORSHIPS.map((item) => (
              <article id={item.id} className="ccd-item" key={item.id}>
                <button type="button" className="ccd-item-main" onClick={() => item.interest && openConnectInquiry(item.interest)} aria-haspopup={item.interest ? 'dialog' : undefined}>
                  <Thumb kind={item.thumb} />
                  <span className="ccd-item-copy">
                    <span className="ccd-eyebrow">{item.eyebrow}</span>
                    <strong className="ccd-title">{item.title}</strong>
                    <span className="ccd-summary">{item.instruction}</span>
                    <span className="ccd-action">{item.action} <i className="ri-arrow-right-line" aria-hidden="true" /></span>
                  </span>
                </button>
              </article>
            ))}
          </div>
          <p className="ccd-footnote">Sponsorship requests go to the Partner Program team. Online checkout is not active yet.</p>
        </section>

        <section className={`ccd-column ccd-contribute${view === 'contribute' ? ' is-active' : ''}`} id="cc-contribute" aria-label="Contribute content and information">
          <header className="ccd-column-heading">
            <h2>CONTRIBUTE</h2>
            <p>Photos, history, updates, and news.</p>
          </header>
          <div className="ccd-list">
            {CONTRIBUTIONS.map((item) => <Transaction item={item} key={item.id} />)}
          </div>
          <p className="ccd-footnote">If you see a silhouette, a missing name, or an incorrect detail, you can help complete the record.</p>
        </section>
      </div>

      {inquiry ? (
        <div className="ccd-inquiry-overlay">
          <button type="button" className="ccd-inquiry-backdrop" aria-label="Close Connect inquiry" onClick={() => setInquiry(null)} />
          <aside className="ccd-inquiry-panel" role="dialog" aria-modal="true" aria-label={SPONSOR_INTERESTS[inquiry.interest]}>
            <header className="ccd-inquiry-heading">
              <div><span>CONNECT</span><strong>{SPONSOR_INTERESTS[inquiry.interest]}</strong></div>
              <button ref={inquiryCloseButton} type="button" onClick={() => setInquiry(null)} aria-label="Close inquiry">×</button>
            </header>
            <SponsorInquiry key={inquiry.id} interest={inquiry.interest} onClose={() => setInquiry(null)} />
          </aside>
        </div>
      ) : null}

      <style jsx global>{`
        .ccd { width:100%; max-width:1160px; margin:0 auto; padding:12px 20px 60px; color:var(--sb-ink); font-family:var(--yat-font-ui); }
        .ccd-visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        .ccd-kicker { font:700 10px/1.2 var(--yat-font-ui); letter-spacing:.11em; color:var(--sb-text); }
        .ccd-heading h1 { margin:5px 0 2px; font:800 clamp(25px,3.4vw,38px)/1 var(--yat-font-compact); text-transform:uppercase; letter-spacing:.015em; }
        .ccd-heading h1 span { color:var(--sb-text); }
        .ccd-heading p { margin:7px 0 0; font-size:12px; color:var(--sb-ink-muted); }
        .ccd-school { font:700 11px/1.4 var(--yat-font-compact); color:var(--sb-ink-muted); text-transform:uppercase; text-align:right; white-space:nowrap; }
        .ccd-columns { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:28px; margin-top:8px; align-items:start; }
        .ccd-column { min-width:0; }
        .ccd-column-heading { padding:5px 0 9px; border:0; }
        .ccd-column-heading h2 { margin:0; font:800 23px/1 var(--yat-font-compact); letter-spacing:.04em; }
        .ccd-column-heading p { margin:5px 0 0; color:var(--sb-ink-muted); font-size:12px; }
        .ccd-contribute .ccd-column-heading { border-bottom-color:var(--sb-accent, #d99a28); }
        .ccd-list { display:flex; flex-direction:column; }
        .ccd-item { min-width:0; padding:0; border:0; scroll-margin-top:215px; }
        /* News-style whitespace separates listings, without horizontal rules. */
        .ccd-item + .ccd-item { margin-top:14px; }
        .ccd-item-main, .ccd-item-layout { display:grid; width:100%; grid-template-columns:86px minmax(0,1fr); gap:12px; align-items:center; padding:9px 3px; border:0; background:none; text-align:left; font:inherit; color:inherit; }
        .ccd-item-main { cursor:pointer; }
        .ccd-item-main:hover .ccd-title, .ccd-item-main:focus-visible .ccd-title { text-decoration:underline; text-underline-offset:2px; }
        .ccd-item-main:focus-visible,.ccd-image-button:focus-visible,.ccd-title-button:focus-visible,.ccd-action-button:focus-visible,.ccd-placement-button:focus-visible { outline:2px solid #ddd; outline-offset:2px; }
        .ccd-item-main:disabled { cursor:default; opacity:.63; }
        .ccd-image-button { display:block; appearance:none; background:none; padding:0; border:0; cursor:pointer; }
        .ccd-item-copy { display:flex; flex-direction:column; min-width:0; align-items:flex-start; }
        .ccd-eyebrow { color:#aeb0b3; font:800 9px/1.18 var(--yat-font-ui); letter-spacing:.025em; margin-bottom:2px; }
        .ccd-title,.ccd-title-button { font:800 15px/1.15 var(--yat-font-ui); letter-spacing:-.02em; color:#fff; }
        .ccd-title-button { display:block; padding:0; border:0; background:none; text-align:left; cursor:pointer; }
        .ccd-title-button:hover { text-decoration:underline; }
        .ccd-summary { margin-top:4px; font:400 12px/1.34 var(--yat-font-ui); color:#c0c1c3; }
        .ccd-action { margin-top:5px; font:800 10px/1.2 var(--yat-font-ui); color:#fff; letter-spacing:.025em; }
        .ccd-action i { font-size:12px; vertical-align:-1px; }
        .ccd-item-actions { display:flex; width:100%; min-width:0; justify-content:space-between; align-items:baseline; gap:6px; margin-top:7px; }
        .ccd-action-button,.ccd-placement-button { appearance:none; background:none; border:0; padding:0; white-space:nowrap; cursor:pointer; }
        .ccd-action-button { display:inline-flex; align-items:center; gap:3px; color:#fff; font:800 10px/1.3 var(--yat-font-ui); letter-spacing:.01em; }
        .ccd-action-button i { font-size:12px; }
        .ccd-placement-button { color:#b9b9b9; font:600 9px/1.3 var(--yat-font-ui); letter-spacing:.02em; }
        .ccd-placement-button:hover { color:#fff; text-decoration:underline; }
        .ccd-placement-details { margin:2px 3px 4px 101px; padding:10px 12px; background:#1b1b1b; border-radius:3px; color:#ddd; font:400 11px/1.4 var(--yat-font-ui); }
        .ccd-placement-details p { margin:0 0 7px; }
        .ccd-placement-details button { border:0; padding:0; color:#fff; background:none; cursor:pointer; font:700 11px/1.3 var(--yat-font-ui); }
        .ccd-thumb { height:72px; width:86px; position:relative; overflow:hidden; border-radius:3px; display:block; background:#171717; border:1px solid #3b3b3b; color:#fff; }
        .ccd-thumb img { width:100%; height:100%; display:block; object-fit:cover; filter:saturate(.83); }
        .ccd-thumb-label { position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent,rgba(0,0,0,.88)); padding:12px 4px 4px; font:800 7px/1.1 var(--yat-font-ui); color:#fff; letter-spacing:.035em; text-shadow:0 1px 2px #000; }
        .ccd-thumb-logos img, .ccd-thumb-banner img { object-fit:contain; padding:5px; }
        /* Exact Row 3 crop geometry: the circle masks the LOWER portrait;
           only the transparent 16px ABOVE its top edge is drawn outside. */
        .ccd-thumb-headshot {
          --ccd-headshot-size:60px; --ccd-headshot-rise:16px;
          height:calc(var(--ccd-headshot-size) + var(--ccd-headshot-rise));
          overflow:visible; border:0; border-radius:0; background:transparent;
        }
        .ccd-headshot-ring {
          position:absolute; z-index:1; bottom:0; left:50%; transform:translateX(-50%);
          display:block; width:var(--ccd-headshot-size); height:var(--ccd-headshot-size);
          box-sizing:border-box; overflow:hidden; border-radius:50%;
          background:#151515; border:2px solid #ddd;
        }
        .ccd-headshot-ring img.ccd-headshot-cutout {
          position:absolute; bottom:-2px; left:50%; transform:translateX(-50%);
          width:calc(var(--ccd-headshot-size) + var(--ccd-headshot-rise));
          height:calc(var(--ccd-headshot-size) + var(--ccd-headshot-rise));
          max-width:none; object-fit:contain; object-position:center bottom; filter:none;
        }
        .ccd-headshot-ring img.ccd-headshot-fallback {
          width:100%; height:100%; object-fit:cover; object-position:center 24%; filter:none;
        }
        .ccd-thumb-headshot .ccd-headshot-above {
          position:absolute; z-index:2; bottom:0; left:50%; transform:translateX(-50%);
          display:block; width:calc(var(--ccd-headshot-size) + var(--ccd-headshot-rise));
          height:calc(var(--ccd-headshot-size) + var(--ccd-headshot-rise));
          max-width:none; object-fit:contain; object-position:center bottom; filter:none;
          /* Mask off everything inside/below the circle's top. */
          clip-path:inset(0 0 var(--ccd-headshot-size) 0);
          pointer-events:none;
        }
        .ccd-thumb-headshot .ccd-thumb-label {
          position:absolute; z-index:3; left:11px; right:11px; bottom:0;
          border-radius:0 0 30px 30px; text-align:center;
        }
        .ccd-footnote { padding:10px 3px; color:var(--sb-ink-muted); font-size:11px; line-height:1.5; }
        /* Monochrome editorial desk: no scoreboard green or gold. */
        .ccd { color:#f7f7f7 !important; background:#090909 !important; }
        .ccd-columns { color:#f7f7f7; }
        .ccd-column-heading { border:0 !important; }
        .ccd-eyebrow { color:#aeb0b3 !important; }
        .ccd-summary,.ccd-footnote { color:#c0c1c3 !important; }
        .ccd-action,.ccd-action-button { color:#fff !important; }
        .ccd-item { border:0 !important; }
        .ccd-title { color:#fff; }
        .ccd-item-main:hover { background:#161616; }
        .ccd .ccg-form { background:#161616; border-color:#464646; }
        .ccd .ccg-form input,.ccd .ccg-form textarea,.ccd .ccg-form select { background:#0c0c0c; color:#fff; border-color:#555; }
        .ccd .ccg-btn { background:#fff; color:#080808; border-color:#fff; }
        .ccd .ccg-link { color:#fff; }
        .ccd-mobile-switch { display:none; }
        .ccd .ccg-form { display:flex; flex-direction:column; gap:9px; padding:14px; margin:0 0 15px; border:1px solid var(--sb-card-border); border-radius:5px; background:var(--sb-card-bg); }
        .ccd .ccg-form-title { font:800 14px/1.2 var(--yat-font-ui); }
        .ccd .ccg-form label { display:flex; flex-direction:column; gap:4px; flex:1 1 170px; min-width:0; font-size:11px; }
        .ccd .ccg-form-row { display:flex; flex-wrap:wrap; gap:8px; }
        .ccd .ccg-form input, .ccd .ccg-form select, .ccd .ccg-form textarea { width:100%; border:1px solid var(--sb-card-border); background:var(--bg,#111); color:var(--sb-ink); padding:8px; border-radius:4px; font:400 13px var(--yat-font-ui); }
        .ccd .ccg-hp { position:absolute; left:-9999px; width:1px; height:1px; }
        .ccd .ccg-form-error { color:#ff6b6b; margin:0; font-size:12px; }
        .ccd .ccg-btn { background:var(--sb-panel); color:#fff; border:1px solid var(--sb-rim); font:700 12px var(--yat-font-ui); padding:8px 12px; border-radius:4px; cursor:pointer; }
        .ccd .ccg-link { color:var(--sb-text); background:none; border:none; font-size:12px; text-decoration:underline; cursor:pointer; }
        .ccd .ccg-actions { display:flex; gap:12px; align-items:center; }
        .ccd-inquiry-overlay { position:fixed; inset:0; z-index:2147483201; color:#fff; }
        .ccd-inquiry-backdrop { position:absolute; inset:0; border:0; background:#000b; cursor:pointer; width:100%; height:100%; }
        .ccd-inquiry-panel { position:absolute; inset:0 auto 0 0; display:flex; flex-direction:column; overflow:auto; width:min(100%,440px); max-height:100dvh; padding:15px 18px 22px; background:#0b0b0b; border-right:1px solid #555; box-shadow:10px 0 45px #0008; }
        .ccd-inquiry-heading { display:flex; align-items:start; justify-content:space-between; gap:12px; margin:0 0 12px; padding:3px 0 13px; border-bottom:1px solid #444; }
        .ccd-inquiry-heading div { display:flex; flex-direction:column; gap:5px; }
        .ccd-inquiry-heading span { color:#bbb; font:700 11px/1.2 var(--yat-font-compact); letter-spacing:.08em; }
        .ccd-inquiry-heading strong { color:#fff; font:700 22px/1.2 var(--yat-font-compact); }
        .ccd-inquiry-heading button { color:#fff; background:none; border:0; padding:0 5px; font:400 30px/1 var(--yat-font-ui); cursor:pointer; }
        .ccd .ccd-inquiry-panel .ccg-form { background:#111; border:1px solid #444; color:#fff; }
        .ccd .ccd-inquiry-panel .ccg-form input,.ccd .ccd-inquiry-panel .ccg-form textarea,.ccd .ccd-inquiry-panel .ccg-form select { background:#080808; border:1px solid #555; color:#fff; }
        .ccd .ccd-inquiry-panel .ccg-btn { background:#fff; border:1px solid #fff; color:#080808; }
        .ccd .ccd-inquiry-panel .ccg-link { color:#fff; }
        @media (prefers-reduced-motion: no-preference) { .ccd-inquiry-panel { animation:ccd-inquiry-enter .18s ease-out; } }
        @keyframes ccd-inquiry-enter { from { transform:translateX(-15px); opacity:.6; } to { transform:translateX(0); opacity:1; } }
        @media (max-width:760px) {
          .ccd { padding:5px 11px 80px; }
          .ccd-columns { display:block; margin-top:1px; }
          .ccd-column { display:none; width:100%; }
          .ccd-column.is-active { display:block; }
          .ccd-column-heading { display:none; }
          .ccd-mobile-switch { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-start; gap:6px; padding:3px 0 5px; }
          .ccd-mobile-switch button { flex:0 0 auto; width:auto; min-height:30px; text-align:center; border:1px solid #777; border-radius:18px; padding:5px 12px; background:#0b0b0b; cursor:pointer; color:#fff; font:700 12px/1 var(--yat-font-compact); letter-spacing:.015em; }
          .ccd-mobile-switch button.is-on { background:#fff; border-color:#fff; color:#070707; box-shadow:none; }
          .ccd-mobile-switch button:focus-visible { outline:2px solid var(--sb-text); outline-offset:2px; }
          .ccd-list { border:0; }
          .ccd-item-main,.ccd-item-layout { grid-template-columns:76px minmax(0,1fr); gap:10px; padding:9px 2px; }
          .ccd-item + .ccd-item { margin-top:12px; }
          .ccd-thumb { width:76px; height:66px; }
          .ccd-thumb-headshot { --ccd-headshot-size:58px; --ccd-headshot-rise:13px; }
          .ccd-placement-details { margin-left:88px; }
          .ccd-title,.ccd-title-button { font-size:14px; }
          .ccd-summary { font-size:11.5px; line-height:1.3; }
          .ccd-action-button { font-size:9.2px; }
          .ccd-placement-button { font-size:8.8px; }
        }
      `}</style>
    </div>
  );
}
