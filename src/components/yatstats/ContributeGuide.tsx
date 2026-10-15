'use client';

// Connect & Contribute is a transaction desk, not a marketing landing page.
// The same four-field visual hierarchy as the player-profile News list:
// destination graphic, action name, one instruction, and one click to begin.
// All photo cards open the existing image flow with the correct slot preselected.

import { useContext, useEffect, useRef, useState } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import {
  PHOTO_TYPES, SPONSOR_INTERESTS, openContribute,
  type ContributeOpen, type PhotoPurpose, type SponsorInterest,
} from '@/lib/contribute';

const PHOTO_DETAILS: Partial<Record<PhotoPurpose, string>> = Object.fromEntries(
  PHOTO_TYPES.map((p) => [p.id, p.spec])
);

type ThumbKind = 'front' | 'headshot' | 'back' | 'timeline' | 'logos' |
  'news' | 'missing' | 'data' | 'profile' | 'banner' | 'bracket' | 'business' | 'video';

type DeskCard = {
  id: string;
  eyebrow: string;
  title: string;
  instruction: string;
  thumb: ThumbKind;
  action: string;
  detail: ContributeOpen;
  help?: PhotoPurpose;
};
type SponsorCard = {
  id: string;
  eyebrow: string;
  title: string;
  instruction: string;
  thumb: ThumbKind;
  interest?: SponsorInterest;
  action: string;
  soon?: boolean;
};

const CONTRIBUTIONS: DeskCard[] = [
  { id: 'cc-photo', eyebrow: 'FLIP CARD · FRONT', title: 'High School Photo', instruction: 'Add a high school-era photo to the front of an alumnus\'s flip card.', thumb: 'front', action: 'UPLOAD PHOTO', detail: { tab: 'photo', photoType: 'flip_card' }, help: 'flip_card' },
  { id: 'cc-headshot', eyebrow: 'GALLERY · PROFILE', title: 'Player Headshot', instruction: 'Send a face-and-shoulders photo for a player or a specific season.', thumb: 'headshot', action: 'UPLOAD HEADSHOT', detail: { tab: 'photo', photoType: 'headshot' }, help: 'headshot' },
  { id: 'cc-action', eyebrow: 'FLIP CARD · BACK', title: 'Current Action Photo', instruction: 'Add a current-season action photo to the back of a player\'s flip card.', thumb: 'back', action: 'UPLOAD ACTION PHOTO', detail: { tab: 'photo', photoType: 'back_hero' }, help: 'back_hero' },
  { id: 'cc-timeline', eyebrow: 'PLAYER PROFILE · CAREER PATH', title: 'Career Timeline Photo', instruction: 'Add a playing-days photo to a specific year of an alumnus\'s career.', thumb: 'timeline', action: 'UPLOAD TIMELINE PHOTO', detail: { tab: 'photo', photoType: 'timeline_hero' }, help: 'timeline_hero' },
  { id: 'cc-logo', eyebrow: 'SCHOOL & TEAM ARTWORK', title: 'School or Team Logo', instruction: 'Supply a missing or corrected logo for a school or college/pro team.', thumb: 'logos', action: 'UPLOAD LOGO', detail: { tab: 'photo', photoType: 'school_logo' }, help: 'school_logo' },
  { id: 'cc-tip', eyebrow: 'ACTIVE ALUMNI NEWS', title: 'News Tip', instruction: 'Paste a link to a player story, award, signing, or call-up.', thumb: 'news', action: 'SEND LINK', detail: { tab: 'tip' } },
  { id: 'cc-missing', eyebrow: 'ALL-TIME NEXT-LEVEL LIST', title: 'Missing Alumni', instruction: 'Tell us who is missing, their class year, and where they played.', thumb: 'missing', action: 'ADD ALUMNUS', detail: { tab: 'missing' } },
  { id: 'cc-data', eyebrow: 'ROSTER & PLAYER RECORDS', title: 'Correct Information', instruction: 'Update graduation years, playing history, or school and player details.', thumb: 'data', action: 'SUBMIT CORRECTION', detail: { tab: 'data' } },
];

const SPONSORSHIPS: SponsorCard[] = [
  { id: 'cc-profile-sponsor', eyebrow: 'PLAYER PROFILE', title: 'Sponsor a Player Profile', instruction: 'Request a business placement on an alumnus\'s profile.', thumb: 'profile', action: 'REQUEST PLACEMENT', interest: 'profile' },
  { id: 'cc-fans', eyebrow: 'SCHOOL HUB', title: 'Sponsor This School', instruction: 'Request a banner or featured placement on this school\'s hub.', thumb: 'banner', action: 'REQUEST PLACEMENT', interest: 'title' },
  { id: 'cc-bracket-sponsor', eyebrow: 'FANTASY BRACKET', title: 'Sponsor the Bracket', instruction: 'Request a placement in the school-versus-school fantasy competition.', thumb: 'bracket', action: 'REQUEST PLACEMENT', interest: 'bracket' },
  { id: 'cc-alumni', eyebrow: 'ALUMNI PROFILE', title: 'Promote Your Alumni Business', instruction: 'Request business details and branding on your alumni profile.', thumb: 'business', action: 'REQUEST PLACEMENT', interest: 'alumni' },
  { id: 'cc-player', eyebrow: 'PERSONAL VIDEO REQUESTS', title: 'Message From an Alumnus', instruction: 'Personalized player videos are planned but not available to order yet.', thumb: 'video', action: 'COMING SOON', soon: true },
];

// Real baseball and existing YAT?STATS artwork instead of invented iconography.
// These are illustrative examples, never passed off as the selected player's image.
const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const THUMB_IMAGES: Record<ThumbKind, { src: string; label: string; position?: string }> = {
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
  return (
    <article className="ccd-item" id={item.id}>
      <button className="ccd-item-main" type="button" onClick={() => openContribute(item.detail)} aria-label={item.action + ': ' + item.title}>
        <Thumb kind={item.thumb} />
        <span className="ccd-item-copy">
          <span className="ccd-eyebrow">{item.eyebrow}</span>
          <strong className="ccd-title">{item.title}</strong>
          <span className="ccd-summary">{item.instruction}</span>
          <span className="ccd-action">{item.action} <i className="ri-arrow-right-line" aria-hidden="true" /></span>
        </span>
      </button>
      {item.help ? (
        <details className="ccd-help">
          <summary>Where does this photo go?</summary>
          <p>{PHOTO_DETAILS[item.help]}</p>
          <button type="button" onClick={() => openContribute(item.detail)}>Open upload</button>
        </details>
      ) : null}
    </article>
  );
}

function SponsorInquiry({ interest, onClose }: { interest: SponsorInterest; onClose: () => void }) {
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
      <div className="ccg-form-title">Contact the YAT?STATS Partner Program Team</div>
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
                <button type="button" className="ccd-item-main" disabled={item.soon} onClick={() => item.interest && setInquiry((prev) => prev?.id === item.id ? null : { id: item.id, interest: item.interest! })} aria-expanded={item.interest ? inquiry?.id === item.id : undefined}>
                  <Thumb kind={item.thumb} />
                  <span className="ccd-item-copy">
                    <span className="ccd-eyebrow">{item.eyebrow}</span>
                    <strong className="ccd-title">{item.title}</strong>
                    <span className="ccd-summary">{item.instruction}</span>
                    <span className="ccd-action">{item.action} {!item.soon && <i className="ri-arrow-right-line" aria-hidden="true" />}</span>
                  </span>
                </button>
                {item.interest && inquiry?.id === item.id ? (
                  <SponsorInquiry key={item.id} interest={inquiry.interest} onClose={() => setInquiry(null)} />
                ) : null}
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

      <style jsx global>{`
        .ccd { width:100%; max-width:1160px; margin:0 auto; padding:18px 20px 60px; color:var(--sb-ink); font-family:var(--yat-font-ui); }
        .ccd-visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        .ccd-kicker { font:700 10px/1.2 var(--yat-font-ui); letter-spacing:.11em; color:var(--sb-text); }
        .ccd-heading h1 { margin:5px 0 2px; font:800 clamp(25px,3.4vw,38px)/1 var(--yat-font-compact); text-transform:uppercase; letter-spacing:.015em; }
        .ccd-heading h1 span { color:var(--sb-text); }
        .ccd-heading p { margin:7px 0 0; font-size:12px; color:var(--sb-ink-muted); }
        .ccd-school { font:700 11px/1.4 var(--yat-font-compact); color:var(--sb-ink-muted); text-transform:uppercase; text-align:right; white-space:nowrap; }
        .ccd-columns { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:28px; margin-top:18px; align-items:start; }
        .ccd-column { min-width:0; }
        .ccd-column-heading { padding:7px 0 11px; border-bottom:2px solid var(--sb-text); }
        .ccd-column-heading h2 { margin:0; font:800 23px/1 var(--yat-font-compact); letter-spacing:.04em; }
        .ccd-column-heading p { margin:5px 0 0; color:var(--sb-ink-muted); font-size:12px; }
        .ccd-contribute .ccd-column-heading { border-bottom-color:var(--sb-accent, #d99a28); }
        .ccd-list { display:flex; flex-direction:column; }
        .ccd-item { min-width:0; padding:0; border-bottom:1px solid var(--sb-card-border); scroll-margin-top:215px; }
        .ccd-item-main { display:grid; width:100%; grid-template-columns:86px minmax(0,1fr); gap:12px; align-items:center; padding:14px 3px; border:0; background:none; text-align:left; cursor:pointer; font:inherit; color:inherit; }
        .ccd-item-main:hover .ccd-title, .ccd-item-main:focus-visible .ccd-title { text-decoration:underline; text-underline-offset:2px; }
        .ccd-item-main:focus-visible { outline:2px solid var(--sb-text); outline-offset:-2px; }
        .ccd-item-main:disabled { cursor:default; opacity:.63; }
        .ccd-item-copy { display:flex; flex-direction:column; min-width:0; align-items:flex-start; }
        .ccd-eyebrow { color:#cb940f; font:800 9px/1.2 var(--yat-font-ui); letter-spacing:.045em; margin-bottom:3px; }
        .ccd-title { font:800 15px/1.15 var(--yat-font-ui); letter-spacing:-.025em; }
        .ccd-summary { margin-top:4px; font:400 12px/1.37 var(--yat-font-ui); color:var(--sb-ink-muted); }
        .ccd-action { margin-top:5px; font:800 10px/1.3 var(--yat-font-ui); color:var(--sb-text); letter-spacing:.025em; }
        .ccd-action i { font-size:12px; vertical-align:-1px; }
        .ccd-thumb { height:72px; width:86px; position:relative; overflow:hidden; border-radius:3px; display:block; background:#171717; border:1px solid #3b3b3b; color:#fff; }
        .ccd-thumb img { width:100%; height:100%; display:block; object-fit:cover; filter:saturate(.83); }
        .ccd-thumb-label { position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent,rgba(0,0,0,.88)); padding:12px 4px 4px; font:800 7px/1.1 var(--yat-font-ui); color:#fff; letter-spacing:.035em; text-shadow:0 1px 2px #000; }
        .ccd-thumb-logos img, .ccd-thumb-banner img { object-fit:contain; padding:5px; }
        .ccd-help { margin:-3px 0 12px 101px; color:var(--sb-ink-muted); font-size:11px; line-height:1.45; }
        .ccd-help summary { display:list-item; cursor:pointer; color:var(--sb-text); font:700 10px/1.4 var(--yat-font-ui); }
        .ccd-help p { margin:6px 0; }
        .ccd-help button { background:transparent; color:var(--sb-text); font:700 11px var(--yat-font-ui); border:0; cursor:pointer; padding:2px 0; text-decoration:underline; }
        .ccd-footnote { padding:10px 3px; color:var(--sb-ink-muted); font-size:11px; line-height:1.5; }
        /* Monochrome editorial desk: no scoreboard green or gold. */
        .ccd { color:#f7f7f7 !important; background:#090909 !important; }
        .ccd-columns { color:#f7f7f7; }
        .ccd-column-heading { border-bottom-color:#f1f1f1 !important; }
        .ccd-eyebrow { color:#aeb0b3 !important; }
        .ccd-summary,.ccd-footnote { color:#c0c1c3 !important; }
        .ccd-action,.ccd-help summary,.ccd-help button { color:#fff !important; }
        .ccd-item { border-bottom-color:#3d3d3d !important; }
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
        @media (max-width:760px) {
          .ccd { padding:12px 11px 80px; }
          .ccd-columns { display:block; margin-top:5px; }
          .ccd-column { display:none; width:100%; }
          .ccd-column.is-active { display:block; }
          .ccd-column-heading { display:none; }
          .ccd-mobile-switch { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:3px 0 8px; }
          .ccd-mobile-switch button { min-height:46px; text-align:center; border:1px solid #777; border-radius:3px; padding:10px 8px; background:#0b0b0b; cursor:pointer; color:#fff; font:800 16px/1 var(--yat-font-compact); letter-spacing:.035em; }
          .ccd-mobile-switch button.is-on { background:#fff; border-color:#fff; color:#070707; box-shadow:none; }
          .ccd-mobile-switch button:focus-visible { outline:2px solid var(--sb-text); outline-offset:2px; }
          .ccd-list { border-top:1px solid var(--sb-card-border); }
          .ccd-item-main { grid-template-columns:76px minmax(0,1fr); gap:10px; padding:11px 2px; }
          .ccd-thumb { width:76px; height:66px; }
          .ccd-help { margin-left:88px; }
          .ccd-title { font-size:14px; }
          .ccd-summary { font-size:11.5px; }
        }
      `}</style>
    </div>
  );
}
