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

// Editorial mini-previews, modeled on the actual site placement rather than
// generic baseball photographs. The gold area is the part the upload replaces.
function Thumb({ kind }: { kind: ThumbKind }) {
  if (kind === 'front') return <span className="ccd-thumb ccd-front" aria-hidden="true"><span className="ccd-preview-cap">FLIP CARD / FRONT</span><span className="ccd-front-photo"><i className="ri-user-3-fill" /></span><span className="ccd-preview-caption">HS PHOTO</span><span className="ccd-outline" /></span>;
  if (kind === 'headshot') return <span className="ccd-thumb ccd-head" aria-hidden="true"><span className="ccd-preview-cap">ROW 3 / PROFILE</span><span className="ccd-head-line"><span /><span className="ccd-head-target"><i className="ri-user-3-fill" /></span><span /></span><span className="ccd-preview-caption">HEADSHOT</span></span>;
  if (kind === 'back') return <span className="ccd-thumb ccd-back" aria-hidden="true"><span className="ccd-back-hero"><i className="ri-run-line" /><span className="ccd-outline" /></span><span className="ccd-back-stats">G&nbsp; &nbsp; AVG&nbsp; &nbsp; HR</span><span className="ccd-preview-caption">FLIP CARD / BACK</span></span>;
  if (kind === 'timeline') return <span className="ccd-thumb ccd-timeline" aria-hidden="true"><span className="ccd-preview-cap">CAREER PATH</span><span className="ccd-timeline-image"><i className="ri-user-star-line" /></span><span className="ccd-timeline-rail">2017 ━━━ 2018</span></span>;
  if (kind === 'logos') return <span className="ccd-thumb ccd-logo" aria-hidden="true"><span className="ccd-preview-cap">SCHOOL / TEAM</span><span className="ccd-logo-target"><i className="ri-shield-star-line" /></span><span className="ccd-preview-caption">LOGO</span></span>;
  const icons: Record<Exclude<ThumbKind, 'front' | 'headshot' | 'back' | 'timeline' | 'logos'>, string> = {
    news: 'ri-newspaper-line', missing: 'ri-user-search-line', data: 'ri-edit-box-line',
    profile: 'ri-id-card-line', banner: 'ri-layout-bottom-2-line',
    bracket: 'ri-trophy-line', business: 'ri-store-2-line', video: 'ri-video-chat-line',
  };
  return <span className="ccd-thumb ccd-icon-thumb" aria-hidden="true"><i className={icons[kind]} /><span className="ccd-preview-caption">{kind === 'banner' ? 'SCHOOL HUB' : kind === 'bracket' ? 'FANTASY' : kind.toUpperCase()}</span></span>;
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

  return (
    <div className="ccd">
      <header className="ccd-heading">
        <div>
          <span className="ccd-kicker">YAT?STATS / COMMUNITY DESK</span>
          <h1>Connect <span>&amp;</span> Contribute</h1>
          <p>Choose what you want to do. We&apos;ll take you straight to it.</p>
        </div>
        <span className="ccd-school">{hub}</span>
      </header>

      <nav className="ccd-mobile-switch" aria-label="Connect and Contribute sections">
        <a href="#cc-contribute" className={view === 'contribute' ? 'is-on' : ''} onClick={() => setView('contribute')}>CONTRIBUTE</a>
        <a href="#cc-connect" className={view === 'connect' ? 'is-on' : ''} onClick={() => setView('connect')}>CONNECT</a>
      </nav>

      <div className="ccd-columns">
        <section className="ccd-column ccd-connect" id="cc-connect" aria-label="Connect transactions">
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

        <section className="ccd-column ccd-contribute" id="cc-contribute" aria-label="Contribute content and information">
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
        .ccd-heading { display:flex; justify-content:space-between; align-items:flex-end; gap:18px; padding:4px 0 20px; border-bottom:1px solid var(--sb-card-border); }
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
        .ccd-thumb { height:72px; width:86px; overflow:hidden; border-radius:4px; position:relative; display:flex; flex-direction:column; justify-content:center; align-items:center; border:1px solid #3b4148; background:#0c1216; color:#fff; isolation:isolate; }
        .ccd-preview-cap { position:absolute; left:4px; top:4px; font:700 6px/1 var(--yat-font-ui); letter-spacing:.03em; color:#e8e8e8; }
        .ccd-preview-caption { position:absolute; bottom:4px; left:5px; font:800 7px/1 var(--yat-font-ui); letter-spacing:.045em; color:#efad26; text-shadow:0 1px #000; }
        .ccd-front-photo { display:flex; width:47%; height:78%; align-items:center; justify-content:center; background:linear-gradient(145deg,#243c38,#101617); border:2px solid #e9ab2b; margin-top:8px; }
        .ccd-front-photo i { font-size:35px; color:#81928d; }
        .ccd-head-line { display:flex; gap:4px; align-items:center; margin-top:6px; }
        .ccd-head-line > span { border:1px solid #a3a8ad; border-radius:50%; width:15px; height:15px; opacity:.4; }
        .ccd-head-line .ccd-head-target { display:grid; place-items:center; width:36px; height:36px; border:2px solid #e9ab2b; opacity:1; font-size:20px; }
        .ccd-back-hero { position:absolute; left:4px; right:4px; top:5px; height:37px; border-radius:2px; display:grid; place-items:center; background:linear-gradient(115deg,#171c1a,#416859); border:2px solid #e9ab2b; }
        .ccd-back-hero i { font-size:27px; }
        .ccd-back-stats { position:absolute; top:48px; width:100%; font:700 7px/1 var(--yat-font-ui); text-align:center; opacity:.9; }
        .ccd-timeline { background:linear-gradient(135deg,#192b29,#040706); }
        .ccd-timeline-image { height:37px; width:42px; display:grid; place-items:center; margin-bottom:5px; border:2px solid #e9ab2b; font-size:26px; }
        .ccd-timeline-rail { position:absolute; bottom:4px; left:4px; font:700 7px/1 var(--yat-font-ui); color:#efad26; }
        .ccd-logo-target { display:grid; place-items:center; width:42px; height:42px; border:2px dashed #e9ab2b; border-radius:50%; font-size:27px; }
        .ccd-icon-thumb { background:radial-gradient(circle at 50% 25%,#344038,#111315); }
        .ccd-icon-thumb > i { font-size:32px; color:#efad26; }
        .ccd-help { margin:-3px 0 12px 101px; color:var(--sb-ink-muted); font-size:11px; line-height:1.45; }
        .ccd-help summary { display:list-item; cursor:pointer; color:var(--sb-text); font:700 10px/1.4 var(--yat-font-ui); }
        .ccd-help p { margin:6px 0; }
        .ccd-help button { background:transparent; color:var(--sb-text); font:700 11px var(--yat-font-ui); border:0; cursor:pointer; padding:2px 0; text-decoration:underline; }
        .ccd-footnote { padding:10px 3px; color:var(--sb-ink-muted); font-size:11px; line-height:1.5; }
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
          .ccd-heading { align-items:flex-start; padding-bottom:12px; }
          .ccd-school { display:none; }
          .ccd-columns { display:flex; flex-direction:column; gap:25px; margin-top:8px; }
          .ccd-contribute { order:1; width:100%; }
          .ccd-connect { order:2; width:100%; }
          .ccd-mobile-switch { display:flex; gap:8px; padding:8px 0; }
          .ccd-mobile-switch a { flex:1; text-align:center; border:1px solid var(--sb-card-border); border-radius:4px; padding:7px; text-decoration:none; color:var(--sb-ink); font:800 11px var(--yat-font-ui); }
          .ccd-mobile-switch a.is-on { border-color:var(--sb-text); color:var(--sb-text); }
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
