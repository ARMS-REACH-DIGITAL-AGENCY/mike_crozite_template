'use client';

// Connect & Contribute is a transaction desk, not a marketing landing page.
// The same four-field visual hierarchy as the player-profile News list:
// destination graphic, action name, one instruction, and one click to begin.
// All photo cards open the existing image flow with the correct slot preselected.

import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SchoolContext } from '@/context/SchoolContext';
import ContributeSearch from '@/components/yatstats/ContributeSearch';
import type { ContributePlayer } from '@/lib/contribute';
import { FlipCardFront, FlipCardBack, Headshot, TimelineSlide, ProofStyles, type ProofPlayer } from '@/components/yatstats/ContributeProof';
import {
  PHOTO_TYPES, SPONSOR_INTERESTS, openContribute, openConnectInquiry, CONNECT_INQUIRY_EVENT,
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
  { id: 'cc-photo', eyebrow: 'HIGH SCHOOL · FLIP CARD FRONT', title: 'High School Photo', instruction: 'Share a high school-era photo for the front of an alumnus\'s flip card.', thumb: 'front', action: 'UPLOAD HIGH SCHOOL PHOTO', detail: { tab: 'photo', photoType: 'flip_card' }, help: 'flip_card' },
  { id: 'cc-headshot', eyebrow: 'CURRENT SEASON · ROW 3', title: 'Current Player Headshot', instruction: 'Current-year face-and-shoulders portrait with eyes aligned for the player gallery.', thumb: 'headshot', action: 'UPLOAD CURRENT HEADSHOT', detail: { tab: 'photo', photoType: 'headshot' }, help: 'headshot' },
  { id: 'cc-action', eyebrow: 'CURRENT SEASON · FLIP CARD BACK', title: 'Current Action Photo', instruction: 'Action photo from the current season for the back of the alumni flip card.', thumb: 'back', action: 'UPLOAD ACTION PHOTO', detail: { tab: 'photo', photoType: 'back_hero' }, help: 'back_hero' },
  { id: 'cc-timeline', eyebrow: 'PAST SEASONS · CAREER PATH', title: 'Career Path Year Photo', instruction: 'A bust or action photo representing that specific career year on the timeline — NOT a fan memory post.', thumb: 'timeline', action: 'UPLOAD CAREER PHOTO', detail: { tab: 'photo', photoType: 'timeline_hero' }, help: 'timeline_hero' },
  { id: 'cc-logo', eyebrow: 'SCHOOL / CURRENT TEAM', title: 'School or Current Team Logo', instruction: 'Provide a missing or corrected high school crest or current team logo.', thumb: 'logos', action: 'UPLOAD TEAM LOGO', detail: { tab: 'photo', photoType: 'school_logo' }, help: 'school_logo' },
  { id: 'cc-tip', eyebrow: 'ACTIVE ALUMNI NEWS', title: 'Active Player News Tip', instruction: 'Paste a published link to a real player story, award, signing or call-up.', thumb: 'news', action: 'SEND NEWS LINK', detail: { tab: 'tip' } },
  { id: 'cc-data', eyebrow: 'PLAYER DETAILS', title: 'Player Information Updates', instruction: 'Help correct player information, school details or playing history.', thumb: 'data', action: 'SUBMIT CORRECTION', detail: { tab: 'data' } },
];

const SPONSORSHIPS: SponsorCard[] = [
  { id: 'cc-player', eyebrow: 'PLAYER ↔ FAN VIDEO EXCHANGE', title: 'Personal Video Exchange', instruction: 'Request a video message from an active or retired alumnus. This program is in development.', thumb: 'video', action: 'REQUEST VIDEO INFORMATION', interest: 'video' },
];

// Real baseball and existing YAT?STATS artwork instead of invented iconography.
// These are illustrative examples, never passed off as the selected player's image.
const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
// Row/left-rail art also accepts dedicated files. Originals are retained in
// the image error handlers until each replacement is uploaded by the owner.
// Owner-supplied PNG cutouts. These paths are intentionally stable;
// each falls back to its existing art until the new file is uploaded.
const CONTRIBUTION_THUMBS: Partial<Record<ThumbKind, string>> = {
  front: '/img/contribute/rail_high_school.png',
  headshot: '/img/contribute/rail_headshots.png',
  back: '/img/contribute/rail_action_pics.png',
  timeline: '/img/contribute/rail_yearly_pics.png',
  logos: '/img/contribute/rail_school_logos.png',
};
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
  const { src, position } = THUMB_IMAGES[kind];
  const replacement = CONTRIBUTION_THUMBS[kind];
  const icon = kind === 'data' ? 'ri-bar-chart-2-line' : kind === 'news' ? 'ri-newspaper-line' : '';
  if (icon) {
    return <span className="ccd-thumb ccd-thumb-standard-icon" aria-hidden="true"><i className={icon} /></span>;
  }
  return (
    <span className={`ccd-thumb ccd-thumb-${kind} ccd-thumb-contained`} aria-hidden="true">
      <span className="ccd-thumb-photo">
        <img loading="lazy" src={replacement || src} alt=""
          style={{objectFit: replacement ? 'contain' : 'cover', objectPosition: position || 'center'}}
          onError={(event) => {
            const img = event.currentTarget;
            if (replacement && img.dataset.replacementFallback !== 'true') {
              img.dataset.replacementFallback = 'true'; img.src = src;
            } else if (!img.src.endsWith('/img/connect-contribute-portal.png')) {
              img.src = '/img/connect-contribute-portal.png';
            }
          }} />
      </span>
    </span>
  );
}


const PLACEMENT_CAPTIONS: Record<ThumbKind, string> = {
  front: 'Alumni flip card · front',
  headshot: 'Row 3 player gallery headshot',
  back: 'Alumni flip card · back',
  timeline: 'Player profile · Career Path Timeline',
  logos: 'School identity · site header and search',
  news: 'Active alumni news feed',
  missing: 'All-time next-level alumni list',
  data: 'Player and school records',
  profile: 'Partner placement · alumni profile',
  banner: 'Partner placement · school hub',
  bracket: 'Partner placement · fantasy bracket',
  business: 'Hometown alumni business showcase',
  video: 'Personalized alumni video · planned',
};

// Individual full-resolution owner-supplied screenshots. Place the files in
// public/img/contribute/ (they resolve at /img/contribute/... in the app).
// Files are displayed using contain, with no sprite cropping or stretching.
const REAL_PAGE_IMAGES: Partial<Record<ThumbKind, { file: string; caption: string }>> = {
  front: { file: 'placement-high-school.jpg', caption: 'High school image · alumni flip-card gallery' },
  headshot: { file: 'placement-headshots.jpg', caption: 'Headshots · player gallery and missing portraits' },
  back: { file: 'placement-action-pics.jpg', caption: 'Action pictures · flip-card backs' },
  timeline: { file: 'placement-yearly-pics.jpg', caption: 'Yearly pictures · career timeline image' },
  logos: { file: 'placement-team-logos.jpg', caption: 'School and team logos · site identity' },
  news: { file: 'placement-news-tips.jpg', caption: 'News tips · alumni news feed' },
  data: { file: 'placements_player_updates.jpg', caption: 'Player information updates · verified alumni records' },
};
function RealPageReference({ kind }: { kind: ThumbKind }) {
  const item = REAL_PAGE_IMAGES[kind];
  if (!item) return null;
  return (
    <figure className="ccd-real-page-figure">
      {/* Image intentionally scales as a full photograph, never a crop. */}
      <img className="ccd-real-page-image" src={`/img/contribute/${item.file}`} alt={item.caption}
        onError={(event) => {
          const el = event.currentTarget;
          if (kind === 'data' && !el.dataset.fallback) {
            el.dataset.fallback = 'true';
            el.src = '/img/connect-contribute-portal.png';
          } else el.style.display = 'none';
        }} />
      <figcaption>{item.caption}</figcaption>
    </figure>
  );
}

function PlacementExample({ kind, schoolName, crestUrl, schoolLocation, realFrontExamples }: {
  kind: ThumbKind; schoolName: string; crestUrl?: string; schoolLocation?: string;
  realFrontExamples?: React.ReactNode;
}) {
  const p: ProofPlayer = {
    name: '', classOf: null, currentTeam: '',
    schoolName, schoolLocation: schoolLocation || '',
  };
  const src = THUMB_IMAGES[kind].src;
  let picture: React.ReactNode;
  // Direct, cropped references to real site pages instead of simulated cards.
  if (REAL_PAGE_IMAGES[kind]) picture = <RealPageReference kind={kind} />;
  else if (kind === 'logos' || kind === 'banner') picture = (
    <div className="ccd-example-school">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={crestUrl || S3 + '/schools/5004.png'} alt="" />
      <div><small>{schoolLocation || 'YOUR HOMETOWN'}</small><strong>{schoolName}</strong><span>ACTIVE BASEBALL ALUMNI</span></div>
      {kind === 'banner' ? <aside>FEATURED SCHOOL PARTNER · BANNER SPACE</aside> : null}
    </div>
  );
  else if (kind === 'bracket') picture = (
    <div className="ccd-example-bracket">
      <strong>FANTASY BRACKET</strong>
      <div><span>HOMETOWN<br />ALUMNI</span><b>VS</b><span>RIVAL<br />ALUMNI</span></div>
      <aside>BRACKET PARTNER · SPONSOR PLACEMENT</aside>
      <p>Real college and pro alumni statistics determine results.</p>
    </div>
  );
  else if (kind === 'profile' || kind === 'business') picture = (
    <div className="ccd-example-partner">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
      <div><small>{schoolName} · Alumni profile</small><strong>{kind === 'business' ? 'ALUMNI BUSINESS' : 'PLAYER PROFILE'}</strong></div>
      <aside>PARTNER BRAND · BUSINESS PLACEMENT</aside>
    </div>
  );
  else picture = (
    <div className="ccd-example-news">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
      <div><small>{kind === 'video' ? 'COMING SOON' : 'ACTIVE ALUMNI NEWS'}</small>
        <strong>{kind === 'video' ? 'Personalized alumni videos' : 'Stories and milestones from the next level'}</strong>
        <span>{kind === 'video' ? 'Not yet available for purchase' : 'Shared news tips appear in the alumni news experience.'}</span></div>
    </div>
  );
  return (
    <div className="ccd-example">
      <div className="ccd-example-stage">{picture}</div>
      <small className="ccd-example-label">ACTUAL YAT?STATS SCREENSHOT · CONTRIBUTION DESTINATION</small>
      <ProofStyles />
    </div>
  );
}


function Transaction({ item, onPreview, selected, schoolName, crestUrl, schoolLocation }: {
  item: DeskCard; onPreview: (id: string) => void; selected: boolean;
  schoolName: string; crestUrl?: string; schoolLocation?: string;
}) {
  const [showPlacement, setShowPlacement] = useState(false);
  const openUpload = () => openContribute(item.detail);
  return (
    <article className={'ccd-item' + (selected ? ' is-inspected' : '')} id={item.id}
      onMouseEnter={() => onPreview(item.id)} onFocusCapture={() => onPreview(item.id)}>
      <div className="ccd-item-layout">
        <button type="button" className="ccd-image-button" onClick={openUpload}
          aria-label={item.action + ': ' + item.title}><Thumb kind={item.thumb} /></button>
        <div className="ccd-item-copy">
          <span className="ccd-eyebrow">{item.eyebrow}</span>
          <button type="button" className="ccd-title-button" onClick={openUpload}>{item.title}</button>
          <span className="ccd-summary">{item.instruction}</span>
          <div className="ccd-item-actions">
            <button type="button" className="ccd-action-button" onClick={openUpload}>
              {item.action} <i className="ri-arrow-right-line" aria-hidden="true" />
            </button>
            <button type="button" className="ccd-placement-button"
              aria-controls={'ccd-placement-' + item.id} aria-expanded={showPlacement}
              onClick={() => { onPreview(item.id); setShowPlacement(current => !current); }}>
              {showPlacement ? 'LESS' : 'LEARN MORE'}
            </button>
          </div>
        </div>
      </div>
      <div className={`ccd-placement-details${showPlacement ? ' is-expanded' : ''}`} id={'ccd-placement-' + item.id}>
        <div className="ccd-inline-example"><PlacementExample kind={item.thumb}
          schoolName={schoolName} crestUrl={crestUrl} schoolLocation={schoolLocation} /></div>
        <p>{item.help ? PHOTO_DETAILS[item.help] : item.instruction}</p>
        <button type="button" onClick={openUpload}>Start upload <i className="ri-arrow-right-line" aria-hidden="true" /></button>
      </div>
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
      <div className="ccg-form-title">{interest === 'video' ? 'Video exchange request · pilot interest form' : 'Contact the YAT?STATS Partner Program Team'}</div>
      {interest === 'video' ? <p className="ccg-video-notice">Video checkout and delivery are not yet active. Leave your details to register interest in the program.</p> : null}
      <label>I&apos;m interested in
        <select value={choice} onChange={(e) => setChoice(e.target.value as SponsorInterest)}>
          {(interest === 'video' ? ([['video', 'Video message exchange']] as const) : Object.entries(SPONSOR_INTERESTS)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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


export default function ContributeGuide({ schoolName, realFrontExamples }: {
  schoolName: string; realFrontExamples?: React.ReactNode;
}) {
  const [inquiry, setInquiry] = useState<{ id: string; interest: SponsorInterest } | null>(null);
  const [view, setView] = useState<'contribute' | 'connect'>('contribute');
  const [playerApplication, setPlayerApplication] = useState<ContributePlayer | null>(null);
  const [applicant, setApplicant] = useState({name:'',email:'',phone:'',message:'',website:''});
  const [applicationStatus, setApplicationStatus] = useState<{kind:'idle'|'sending'|'sent'|'error';message?:string}>({kind:'idle'});
  const [selectedId, setSelectedId] = useState('cc-photo');
  const school = useContext(SchoolContext);
  const crestUrl = school?.crestUrl || undefined;
  const schoolLocation = school?.hsLocation || undefined;
  const inspect = (id: string) => setSelectedId(id);
  const switchView = (next: 'connect' | 'contribute') => {
    setView(next);
    setSelectedId(next === 'connect' ? SPONSORSHIPS[0].id : CONTRIBUTIONS[0].id);
  };
  const selected = view === 'connect'
    ? SPONSORSHIPS.find(item => item.id === selectedId) || SPONSORSHIPS[0]
    : CONTRIBUTIONS.find(item => item.id === selectedId) || CONTRIBUTIONS[0];
  const hub = schoolName || 'your school';
  const handledShareLink = useRef(false);
  const inquiryCloseButton = useRef<HTMLButtonElement>(null);

  // Row 3 shortcuts and portal transaction rows open the same left drawer.
  useEffect(() => {
    const onInquiry = (event: Event) => {
      const interest = (event as CustomEvent<SponsorInterest>).detail;
      if (!interest || !(interest in SPONSOR_INTERESTS)) return;
      setInquiry({ id: interest, interest });
      document.getElementById('sec-video')?.scrollIntoView({behavior:'smooth',block:'start'});
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
      const connectItem = SPONSORSHIPS.find(card => card.id === target);
      const contributeItem = CONTRIBUTIONS.find(card => card.id === target);
      if (target === 'cc-connect' || connectItem) {
        document.getElementById('sec-video')?.scrollIntoView({behavior:'smooth',block:'start'});
      }
      if (target === 'cc-contribute' || contributeItem) {
        setView('contribute'); setSelectedId(contributeItem?.id || CONTRIBUTIONS[0].id);
      }
    };
    const selectFromShortcut = () => selectFromHash();
    if (window.location.hash === '#sec-video') requestAnimationFrame(() => document.getElementById('sec-video')?.scrollIntoView({behavior:'smooth',block:'start'}));
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
      <div className="ccd-columns">
        <div className="ccd-workspace">
          <section className="ccd-column ccd-contribute" id="cc-contribute"
            aria-label="Contribute photos, player information and news">
            <div className="ccd-list">
              {CONTRIBUTIONS.map(item => <Transaction key={item.id} item={item}
                selected={selected.id === item.id} onPreview={inspect}
                schoolName={hub} schoolLocation={schoolLocation} crestUrl={crestUrl} />)}
            </div>
            <p className="ccd-footnote">If you see a silhouette, a missing name, or an incorrect detail, you can help complete the record.</p>
          </section>
        </div>
        <aside className="ccd-preview" aria-label="Where the selected contribution appears">

              <div className="ccd-preview-heading">
                <span>WHERE THIS GOES</span><h2>{selected.title}</h2>
                <p>{PLACEMENT_CAPTIONS[selected.thumb]}</p>
              </div>
              <PlacementExample kind={selected.thumb} schoolName={hub} schoolLocation={schoolLocation} crestUrl={crestUrl} realFrontExamples={realFrontExamples} />
              <p className="ccd-preview-copy">{'help' in selected && selected.help ? PHOTO_DETAILS[selected.help] : selected.instruction}</p>
              <button type="button" className="ccd-preview-action" onClick={() => {
                if ('detail' in selected) openContribute(selected.detail);
              }}>{selected.action} <i className="ri-arrow-right-line" aria-hidden="true" /></button>
                    </aside>
      </div>

      <section className="ccd-video-section" id="sec-video" aria-label="YAT-A-BOY Player Connect video messages">
        <div className="ccd-video-main">
          <div className="ccd-video-feature">
            <div className="ccd-video-screen" role="img" aria-label="YAT-A-BOY Player Connect coming soon">
              <i className="ri-play-circle-line" aria-hidden="true" />
              <strong>COMING SOON!</strong>
              <span>YAT-A-BOY PLAYER CONNECT</span>
            </div>
            <div className="ccd-video-feature-copy">
              <span className="ccd-eyebrow">YAT-A-BOY · VIDEO MESSAGES</span>
              <h2>Hear from a player. Share your connection.</h2>
              <p>Request a personalized video message from a participating active or retired alumnus. A meaningful way to celebrate birthdays, milestones and the players who inspired your hometown.</p>
              <div className="ccd-video-actions">
                <button type="button" className="ccd-preview-action" onClick={() => document.getElementById('sec-video-request')?.scrollIntoView({behavior:'smooth',block:'center'})}>REQUEST INFORMATION <i className="ri-arrow-right-line" aria-hidden="true" /></button>
                <button type="button" className="ccd-preview-action ccd-buy-now" disabled aria-disabled="true" title="Stripe checkout will be connected when the program launches">BUY NOW · COMING SOON</button>
              </div>
              <small>Checkout is not active. Stripe integration and pricing will be added before launch; no payments are collected here.</small>
            </div>
          </div>
          <div className="ccd-player-signup" id="sec-player-join">
            <span className="ccd-eyebrow">FOR ACTIVE &amp; RETIRED PLAYERS</span>
            <h2>Want to connect with your fans?</h2>
            <p>Join the YAT-A-BOY Player Connect interest list. Fans will be able to request personalized video greetings from participating alumni. Find your YAT?STATS player profile below, then tell us how to reach you.</p>
            {applicationStatus.kind === 'sent' ? (
              <p role="status" className="ccg-form-done">Thanks for your interest. The YAT?STATS team will contact you about participating.</p>
            ) : (
              <form className="ccg-form ccd-player-apply" onSubmit={async event=>{
                event.preventDefault();
                if(!playerApplication){setApplicationStatus({kind:'error',message:'Find and select your player profile first.'});return;}
                setApplicationStatus({kind:'sending'});
                try {
                  const response=await fetch('/api/contribute/sponsor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                    ...applicant,interest:'video_player',playerId:playerApplication.playerId,playerName:playerApplication.displayName,
                    hsid:playerApplication.schoolId || school?.hsid || '',schoolName:playerApplication.schoolName || school?.hsName || '',
                    pageUrl:window.location.href
                  })});
                  const result=await response.json().catch(()=>({}));
                  if(!response.ok)throw new Error(result?.error || 'Unable to send application.');
                  setApplicationStatus({kind:'sent'});
                }catch(error){setApplicationStatus({kind:'error',message:error instanceof Error?error.message:'Unable to send application.'});}
              }}>
                <div className="ccg-form-title">1 · FIND YOUR PLAYER PROFILE</div>
                {playerApplication ? (
                  <div className="ccd-player-chosen"><strong>{playerApplication.displayName}</strong><small>{playerApplication.schoolName || 'YAT?STATS alumni'}</small>
                    <button type="button" onClick={()=>setPlayerApplication(null)}>CHANGE PLAYER</button></div>
                ) : <ContributeSearch mode="player" onPlayer={setPlayerApplication} />}
                <div className="ccg-form-title">2 · LET US KNOW YOU'RE INTERESTED</div>
                <div className="ccg-form-row">
                  <label>Your name<input required autoComplete="name" value={applicant.name} onChange={e=>setApplicant(v=>({...v,name:e.target.value}))} /></label>
                  <label>Email<input required type="email" autoComplete="email" value={applicant.email} onChange={e=>setApplicant(v=>({...v,email:e.target.value}))} /></label>
                </div>
                <div className="ccg-form-row">
                  <label>Phone (optional)<input type="tel" autoComplete="tel" value={applicant.phone} onChange={e=>setApplicant(v=>({...v,phone:e.target.value}))} /></label>
                </div>
                <label>Anything you'd like us to know?<textarea rows={3} value={applicant.message} onChange={e=>setApplicant(v=>({...v,message:e.target.value}))} placeholder="Tell us about your interest in connecting with fans." /></label>
                <input className="ccg-hp" tabIndex={-1} aria-hidden="true" autoComplete="off" value={applicant.website} onChange={e=>setApplicant(v=>({...v,website:e.target.value}))}/>
                {applicationStatus.kind==='error'?<p role="alert" className="ccg-form-error">{applicationStatus.message}</p>:null}
                <button className="ccd-preview-action" type="submit" disabled={applicationStatus.kind==='sending'}>{applicationStatus.kind==='sending'?'SENDING…':'I WANT TO PARTICIPATE →'}</button>
                <small>Submitting your interest does not enroll you in a paid program.</small>
              </form>
            )}
          </div>
        </div>
        <aside className="ccd-preview ccd-video-side" aria-label="How YAT-A-BOY Player Connect works">
          <div className="ccd-preview-heading"><span>CONNECT · VIDEO EXCHANGE</span><h2>Make it personal.</h2>
            <p>Personalized messages from the players who make hometown baseball memorable.</p></div>
          <div className="ccd-video-instructions">
            <div><b>01</b><span><strong>Choose a player</strong><small>Find a participating active or retired alumnus.</small></span></div>
            <div><b>02</b><span><strong>Tell us about your message</strong><small>Share the occasion, recipient and what you would like the player to say.</small></span></div>
            <div><b>03</b><span><strong>Checkout and delivery</strong><small>Complete payment and receive the personal video when the program launches.</small></span></div>
          </div>
          <div className="ccd-video-transaction">
            <h3>YOUR VIDEO REQUEST</h3>
            <label>Player<select disabled defaultValue=""><option value="">Choose a participating player · coming soon</option></select></label>
            <label>Occasion<select disabled defaultValue=""><option value="">Select an occasion · coming soon</option></select></label>
            <label>Recipient<input disabled placeholder="Recipient's name" /></label>
            <label>Message instructions<textarea disabled rows={3} placeholder="What should the player say?" /></label>
            <div className="ccd-video-total"><span>PRICE</span><strong>TO BE ANNOUNCED</strong></div>
            <button type="button" className="ccd-preview-action ccd-buy-now" disabled aria-disabled="true">BUY NOW · STRIPE COMING SOON</button>
            <small>Transaction fields are a preview only. Payment, availability and delivery are not active.</small>
          </div>
          <div className="ccd-video-request" id="sec-video-request">
            <h3>GET NOTIFIED WHEN VIDEO MESSAGES LAUNCH</h3>
            <p>Leave your contact information and we’ll follow up when participating players and checkout are available.</p>
            <SponsorInquiry interest="video" onClose={() => {}} />
          </div>
        </aside>
      </section>

      {inquiry && typeof document !== 'undefined' ? createPortal(
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
      , document.body) : null}

      <style jsx global>{`

        /* Original compact News-style cards and approved font roles remain.
           The surrounding page and forms inherit the shared site theme. */
        /* Remove the shared gallery wrapper's upper inset only on this route.
           Keep Row 3 flush with the portal tabs in either theme. */
        /* The fixed ticker/footer is z-index 40. The generic Row 5 wrapper
           has z-index 45, which obscures it on this page. Keep this portal
           under the footer, without changing player-profile stacking. */
        .yat-row5-shell:has(#sec-mentor) { z-index:5 !important; padding-top:0 !important; }
        #sec-mentor { margin:0 !important; padding:0 !important; }
        #sec-mentor .ccd-columns, #sec-mentor .ccd-workspace { margin-top:0; padding-top:0; }
        #sec-mentor .ccd-column { padding-top:0; }
        .ccd { width:100%; max-width:1160px; margin:0 auto; padding:0 20px 70px; color:var(--fg); background:var(--bg); font-family:var(--yat-font-ui); }
        .ccd-visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        .ccd-columns { display:grid; grid-template-columns:minmax(0,1.06fr) minmax(0,.94fr); gap:28px; align-items:start; }
        .ccd-workspace,.ccd-preview,.ccd-column { min-width:0; }
        /* Folder tabs: recognizable individual hit targets, attached to a shared content edge. */
        .ccd-mobile-switch { position:sticky; z-index:28; top:calc(var(--row1-h) + var(--row2-h) + var(--row3-h)); display:flex; gap:16px; align-items:stretch; padding:0 4px; background:var(--bg); border-bottom:1px solid var(--muted); }
        .ccd-mobile-switch button { appearance:none; flex:0 1 auto; background:var(--card-bg); border:1px solid var(--line); border-bottom:1px solid var(--muted); border-radius:7px 7px 0 0; margin-bottom:-1px; padding:7px 22px 8px; color:var(--muted); cursor:pointer; font:800 19px/1 var(--yat-font-compact); letter-spacing:.035em; transition:background .15s ease,color .15s ease; }
        .ccd-mobile-switch button.is-on { color:var(--fg); background:var(--bg); border-color:var(--muted); border-bottom-color:var(--bg); box-shadow:inset 0 3px 0 var(--fg); }
        .ccd-mobile-switch button:not(.is-on):hover { color:var(--fg); background:var(--card-bg); }
        .ccd-column[hidden] { display:none !important; }
        .ccd-column-heading { padding:3px 4px 3px; }
        .ccd-column-heading p { color:var(--muted); font:400 12px/1.4 var(--yat-font-ui); }
        .ccd-list { display:flex; flex-direction:column; }
        .ccd-item { min-width:0; border-radius:4px; scroll-margin-top:215px; }
        .ccd-item + .ccd-item { margin-top:8px; }
        .ccd-item.is-inspected { background:var(--line); }
        .ccd-item-layout { display:grid; width:100%; grid-template-columns:86px minmax(0,1fr); gap:12px; align-items:center; padding:9px 4px; border:0; background:none; text-align:left; }
        .ccd-image-button { display:block; appearance:none; background:none; padding:0; border:0; cursor:pointer; color:inherit; }
        .ccd-item-copy { display:flex; flex-direction:column; min-width:0; align-items:flex-start; }
        .ccd-eyebrow { color:var(--muted); font:500 11px/1.1 var(--yat-font-compact); letter-spacing:.07em; margin-bottom:3px; }
        .ccd-title-button { display:block; padding:0; border:0; background:none; text-align:left; cursor:pointer; font:800 15px/1.15 var(--yat-font-ui); letter-spacing:-.02em; color:var(--fg); }
        .ccd-title-button:hover { text-decoration:underline; }
        .ccd-summary { margin-top:4px; font:400 12px/1.36 var(--yat-font-ui); color:var(--muted); }
        .ccd-item-actions { display:flex; flex-wrap:wrap; width:100%; min-width:0; justify-content:space-between; align-items:baseline; gap:8px; margin-top:7px; }
        .ccd-action-button,.ccd-placement-button { appearance:none; background:none; border:0; padding:0; white-space:nowrap; cursor:pointer; }
        .ccd-action-button { display:inline-flex; align-items:center; gap:3px; color:var(--fg); font:800 11px/1.25 var(--yat-font-compact); letter-spacing:.04em; }
        .ccd-action-button i { font-size:12px; }
        .ccd-placement-button { color:var(--muted); font:600 10px/1.25 var(--yat-font-compact); letter-spacing:.04em; }
        .ccd-placement-button:hover { color:var(--fg); text-decoration:underline; }
        .ccd-mobile-switch button:focus-visible,.ccd-image-button:focus-visible,.ccd-title-button:focus-visible,.ccd-action-button:focus-visible,.ccd-placement-button:focus-visible,.ccd-preview-action:focus-visible { outline:2px solid var(--fg); outline-offset:3px; }
        .ccd-placement-details { display:none; margin:2px 4px 8px 102px; padding:10px 12px; border:1px solid var(--line); border-radius:4px; background:var(--card-bg); color:var(--fg); font:400 11px/1.4 var(--yat-font-ui); }
        .ccd-placement-details p { margin:0 0 8px; }
        .ccd-placement-details button { background:none; border:0; padding:0; color:var(--fg); cursor:pointer; font:700 11px/1.3 var(--yat-font-ui); }
        .ccd-inline-example { display:none; }
        .ccd-thumb-standard-icon { display:flex !important; align-items:center; justify-content:center; border-radius:50%; width:72px; height:72px; background:var(--card-bg); }
        .ccd-thumb-standard-icon i { font-size:32px; color:var(--fg); }
        .ccd-thumb { height:72px; width:86px; position:relative; overflow:hidden; border-radius:3px; display:block; background:var(--card-bg); border:1px solid var(--line); color:#fff; }
        .ccd-thumb img { width:100%; height:100%; display:block; object-fit:cover; filter:saturate(.83); }
        .ccd-thumb-label { position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent,rgba(0,0,0,.88)); padding:12px 4px 4px; font:800 8px/1.1 var(--yat-font-ui); color:#fff; letter-spacing:.035em; text-shadow:0 1px 2px #000; }
        .ccd-thumb-logos img,.ccd-thumb-banner img { object-fit:contain; padding:5px; }
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

        .ccd-footnote { padding:12px 4px; margin-top:4px; border-top:1px solid var(--line); color:var(--muted); font:400 11px/1.5 var(--yat-font-ui); }
        .ccd-preview { position:sticky; top:calc(var(--row1-h) + var(--row2-h) + var(--row3-h) + 4px); border:1px solid var(--line); border-radius:5px; background:var(--card-bg); padding:16px; }
        .ccd-preview-heading { padding:0 0 13px; }
        .ccd-preview-heading span { color:var(--muted); font:600 11px/1.2 var(--yat-font-compact); letter-spacing:.08em; }
        .ccd-preview-heading h2 { margin:4px 0 4px; color:var(--fg); font:800 20px/1.15 var(--yat-font-ui); letter-spacing:-.01em; text-transform:none; }
        .ccd-preview-heading p { color:var(--muted); font:400 12px/1.35 var(--yat-font-ui); }
        .ccd-preview-copy { padding:12px 0; color:var(--muted); font:400 12px/1.4 var(--yat-font-ui); }
        .ccd-preview-action { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--fg); border-radius:3px; background:var(--fg); color:var(--bg); padding:7px 10px; cursor:pointer; font:700 11px/1.2 var(--yat-font-ui); }
        .ccd-real-page-figure {width:100%;margin:0;display:flex;flex-direction:column;align-items:center;gap:9px;}
        .ccd-real-page-image { display:block; width:100%; height:auto; max-height:460px; object-fit:contain; border-radius:5px; }
        .ccd-real-page-figure figcaption {font:600 12px/1.35 var(--yat-font-ui);color:var(--muted);text-align:center;}
        .ccd-example-stage { min-height:230px; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid var(--line); border-radius:5px; background:var(--bg); padding:14px; }
        .ccd-example-stage :is(.ypf-card,.ypf-back) { width:min(100%,205px); max-height:290px; }
        .ccd-example-stage .ypf-slide { max-width:100%; }
        .ccd-example-stage .ypf-row3 { max-width:100%; }
        .ccd-example-label { display:block; text-align:center; margin-top:5px; color:var(--muted); font:600 9px/1.2 var(--yat-font-compact); letter-spacing:.04em; }
        .ccd-example-school { display:flex; align-items:center; flex-wrap:wrap; gap:15px; width:100%; padding:12px; border:1px solid var(--line); background:var(--card-bg); }
        .ccd-example-school img { width:66px; height:66px; object-fit:contain; flex:0 0 auto; }
        .ccd-example-school > div { display:flex; flex-direction:column; gap:3px; min-width:0; flex:1; }
        .ccd-example-school small { font:400 11px/1.1 Oswald,sans-serif; text-transform:uppercase; color:var(--muted); }
        .ccd-example-school strong { font:700 19px/1.1 "Bebas Neue",sans-serif; }
        .ccd-example-school span { font:600 10px/1 var(--yat-font-ui); }
        .ccd-example-school aside,.ccd-example-bracket aside,.ccd-example-partner aside { width:100%; padding:15px 10px; text-align:center; border:1px dashed var(--muted); border-radius:3px; font:700 11px/1.4 var(--yat-font-ui); }
        .ccd-example-record { width:100%; }
        .ccd-example-record > small { display:block; color:var(--muted); font:600 11px var(--yat-font-compact); }
        .ccd-example-record > strong { display:block; font:800 20px/1.2 var(--yat-font-compact); margin:3px 0 10px; }
        .ccd-example-record div { display:grid; grid-template-columns:1.3fr .65fr 1fr; gap:6px; border-bottom:1px solid var(--line); padding:9px 0; font:600 10px var(--yat-font-ui); }
        .ccd-example-record div:nth-of-type(1) { color:var(--muted); }
        .ccd-example-bracket { width:100%; text-align:center; }
        .ccd-example-bracket > strong { font:800 23px/1 var(--yat-font-compact); }
        .ccd-example-bracket div { display:flex; align-items:center; justify-content:space-around; gap:10px; padding:15px 0; margin:12px 0; border-block:1px solid var(--line); }
        .ccd-example-bracket div span { font:800 17px/1.05 var(--yat-font-compact); }
        .ccd-example-bracket div b { color:var(--muted); font:800 16px var(--yat-font-compact); }
        .ccd-example-bracket p { padding-top:10px; font:400 11px/1.4 var(--yat-font-ui); color:var(--muted); }
        .ccd-example-partner,.ccd-example-news { display:grid; grid-template-columns:40% 1fr; gap:12px; align-items:center; width:100%; }
        .ccd-example-partner img,.ccd-example-news img { width:100%; height:152px; object-fit:cover; border-radius:3px; }
        .ccd-example-partner div,.ccd-example-news div { display:flex; flex-direction:column; gap:8px; }
        .ccd-example-partner small,.ccd-example-news small { color:var(--muted); font:700 10px var(--yat-font-compact); }
        .ccd-example-partner strong,.ccd-example-news strong { font:800 16px/1.18 var(--yat-font-ui); }
        .ccd-example-news span { font:400 12px/1.3 var(--yat-font-ui); color:var(--muted); }
        .ccd-example-partner aside { grid-column:1/-1; }
        .ccg-form,.ccd-inquiry-panel .ccg-form { display:flex; flex-direction:column; gap:9px; padding:14px; margin:0 0 15px; border:1px solid var(--line); border-radius:5px; background:var(--card-bg); color:var(--fg); }
        .ccg-form-title { font:800 14px/1.2 var(--yat-font-ui); }
        .ccg-form label { display:flex; flex-direction:column; gap:4px; flex:1 1 170px; min-width:0; font-size:11px; }
        .ccg-form-row { display:flex; flex-wrap:wrap; gap:8px; }
        .ccg-form input,.ccg-form textarea,.ccg-form select { width:100%; padding:8px; border:1px solid var(--line); border-radius:4px; background:var(--bg); color:var(--fg); font:400 13px var(--yat-font-ui); }
        .ccg-hp { position:absolute; left:-9999px; width:1px; height:1px; }
        .ccg-form-error { color:#e35b5b; margin:0; font-size:12px; }
        .ccg-btn,.ccd-inquiry-panel .ccg-btn { background:var(--fg); color:var(--bg); border:1px solid var(--fg); font:700 12px var(--yat-font-ui); padding:8px 12px; border-radius:4px; cursor:pointer; }
        .ccg-link,.ccd-inquiry-panel .ccg-link { color:var(--fg); background:none; border:0; text-decoration:underline; font:600 12px var(--yat-font-ui); cursor:pointer; }
        .ccg-actions { display:flex; gap:12px; align-items:center; }
        .ccd-inquiry-overlay { position:fixed; inset:0; z-index:2147483201; }
        .ccd-inquiry-backdrop { position:absolute; inset:0; border:0; background:#000b; cursor:pointer; width:100%; height:100%; }
        .ccd-inquiry-panel { position:absolute; inset:0 0 0 auto; z-index:2; display:flex; flex-direction:column; overflow:auto; width:min(100%,440px); max-height:100dvh; padding:15px 18px 22px; background:var(--drawer-bg,rgba(10,10,10,.96)); color:var(--fg); border-left:1px solid var(--line); box-shadow:-10px 0 45px #0008; backdrop-filter:blur(14px); }
        .ccd-inquiry-heading { display:flex; align-items:start; justify-content:space-between; gap:12px; margin:0 0 12px; padding:3px 0 13px; border-bottom:1px solid var(--line); }
        .ccd-inquiry-heading div { display:flex; flex-direction:column; gap:5px; }
        .ccd-inquiry-heading span { color:var(--muted); font:700 11px/1.2 var(--yat-font-compact); letter-spacing:.08em; }
        .ccd-inquiry-heading strong { color:var(--fg); font:700 22px/1.2 var(--yat-font-compact); }
        .ccd-inquiry-heading button { color:var(--fg); background:none; border:0; padding:0 5px; font:400 30px/1 var(--yat-font-ui); cursor:pointer; }
        @media (prefers-reduced-motion:no-preference) { .ccd-inquiry-panel { animation:ccd-inquiry-enter .18s ease-out; } }
        @keyframes ccd-inquiry-enter { from { transform:translateX(15px); opacity:.6; } to { transform:translateX(0); opacity:1; } }

        /* Rectangular images stay completely INSIDE their circular masks.
           Only a verified transparent cutout can extend above the rim. */
        .ccd-thumb-contained {
          display:flex; align-items:center; justify-content:center;
          width:74px; height:74px; margin:0 auto; padding:0;
          border:2px solid #d4d7d7; border-radius:50%;
          overflow:hidden; background:#153c34;
          box-shadow:0 1px 5px rgba(0,0,0,.28);
        }
        .ccd-thumb-contained .ccd-thumb-photo {
          display:block; position:relative; width:100%; height:100%;
          border-radius:50%; overflow:hidden;
        }
        .ccd-thumb-contained .ccd-thumb-photo > img {
          display:block; position:static; width:100%; height:100%; max-width:none;
          object-fit:cover; padding:0; margin:0; border:0; border-radius:0;
          clip-path:none; transform:none; filter:none;
        }
        .ccd-thumb-contained.ccd-thumb-logos .ccd-thumb-photo > img,
        .ccd-thumb-contained.ccd-thumb-banner .ccd-thumb-photo > img {
          object-fit:contain; padding:9px;
        }
        .ccd-thumb-contained .ccd-thumb-label,
        .ccd-thumb-headshot .ccd-thumb-label { display:none; }
        /* Keep the genuine transparent-cutout Row 3 headshot unchanged.
           The lower head remains inside a complete circle; only the 16px
           transparent crown extends above the rim. */
        .ccd-thumb-headshot { margin:0 auto; width:74px; }
        .ccd-thumb-headshot .ccd-headshot-ring { border-color:#d4d7d7; }
        .ccd-real-card-pair {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:100%;align-items:start;justify-items:center;}
        .ccd-real-card-example {display:flex;flex-direction:column;align-items:center;min-width:0;width:100%;gap:6px;}
        .ccd-real-card-example .yat-card {width:100%;max-width:200px;aspect-ratio:5/7;min-width:0;}
        .ccd-real-card-example > span {text-align:center;color:var(--muted);font:700 10px/1.25 var(--yat-font-compact);}
        .ccd-real-card-example .yat-card .yat-front-content{pointer-events:none;}
        .ccd-example-empty-card img {width:100%;height:100%;object-fit:cover;}
        .ccd-example-pair { display:grid; grid-template-columns:1fr 1fr; gap:13px; width:100%; align-items:end; }
        .ccd-example-flip { min-width:0; display:flex; flex-direction:column; gap:8px; align-items:center; }
        .ccd-example-flip .ypf-card { width:100%; max-width:185px; aspect-ratio:5/7; }
        .ccd-example-flip > span { color:var(--muted); font:700 10px var(--yat-font-compact); }
        .ccd-example-empty-card {
          display:flex; align-items:center; justify-content:center;
          width:100%; max-width:185px; aspect-ratio:5/7;
          background:linear-gradient(145deg,#292c30,#111318);
          border:1px solid #555; border-radius:10px;
        }
        .ccd-example-empty-card i { font-size:90px; color:#777; }
        .ccd-example-real-cutout {padding-top:10px;}
        .ccd-example-real-cutout .ccd-thumb-headshot {transform:scale(1.2);transform-origin:center bottom;overflow:visible;margin:0 auto 7px;}
        .ccd-example-real-cutout small {margin-top:0;}
        .ccd-example-headshots { display:flex; justify-content:center; gap:12px; width:100%; }
        .ccd-example-headshot { display:flex; flex-direction:column; align-items:center; gap:7px; min-width:0; }
        .ccd-example-headshot img,.ccd-example-headshot.is-missing i {
          width:90px; height:90px; border:2px solid #ccc;
          border-radius:50%; object-fit:cover; background:#1b1d20;
        }
        .ccd-example-headshot.is-missing i {
          display:flex; align-items:center; justify-content:center;
          color:#777; font-size:60px;
        }
        .ccd-example-headshot small { font:700 10px var(--yat-font-compact); color:var(--muted); }
        .ccd-example-timeline { width:100%; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .ccd-example-timeline .ypf-slide-person { outline:0; border-radius:0; }
        .ccd-example-timeline > span { font:700 10px/1.3 var(--yat-font-compact); color:var(--muted); text-align:center; }
        .ccd-preview .ccd-example-stage { min-height:300px; }
        @media (max-width:740px) {
          /* Compact mobile: Row 3 → tab strip → active content, no bands. */
          #sec-mentor .ccd { padding:0 0 80px; }
          /* Actual contribution rail is 84px tall on small screens.
             A 100px offset exposes a strip of scrolling content. */
          #sec-mentor .ccd-mobile-switch {
            position:sticky;
            top:calc(var(--row1-h) + var(--row2-h) + 84px);
            z-index:28;
            margin:0; padding:0 8px;
            border-radius:0; border-top:0;
            background:var(--bg) !important;
            isolation:isolate;
            box-shadow:0 -1px 0 var(--bg), 0 2px 0 var(--bg);
          }
          #sec-mentor .ccd-mobile-switch button { border-radius:6px 6px 0 0; }
          #sec-mentor .ccd-column-heading { padding:2px 11px 3px; }
          #sec-mentor .ccd-video-feature { padding:0 11px 16px; gap:8px; }
          .ccd { padding:0 11px 80px; }
          .ccd-columns { display:block; }
          .ccd-preview { display:none; }
          .ccd-inline-example { display:block; margin-bottom:10px; }
          .ccd-placement-details { display:block; margin-left:88px; }
          .ccd-placement-button { display:none !important; }
        }
        @media (max-width:500px) {
          /* Keep both labels distinct and visibly separated on narrow phones. */
          .ccd-mobile-switch { justify-content:space-between; gap:20px; padding-left:0; padding-right:0; }
          .ccd-mobile-switch button { font-size:17px; min-width:0; flex:1; padding:8px 8px 9px; text-align:center; }
          .ccd-item-layout { grid-template-columns:76px minmax(0,1fr); gap:10px; padding:9px 2px; }
          .ccd-thumb { width:76px; height:66px; }
          .ccd-thumb-headshot { --ccd-headshot-size:58px; --ccd-headshot-rise:13px; }
          .ccd-title-button { font-size:14px; }
          .ccd-summary { font-size:11.5px; line-height:1.3; }
          .ccd-placement-details { margin-left:0; }
          .ccd-thumb-standard-icon {width:66px;height:66px;}
          .ccd-example-stage { padding:9px; min-height:200px; }
        }


        /* Single contribution desk followed by a scroll-target video program.
           No Connect/Contribute tabs and no video-request drawer. */
        .ccd-mobile-switch,.ccd-column.ccd-connect {display:none!important;}
        .ccd-column.ccd-contribute[hidden] {display:block!important;}
        .ccd-video-section {
          display:grid;grid-template-columns:minmax(0,1.1fr) minmax(310px,1fr);
          align-items:start;gap:24px;margin:45px 0 30px;
          padding:24px 0;border-top:2px solid var(--line);
          scroll-margin-top:calc(var(--row1-h,36px) + var(--row2-h,54px) + var(--row3-h,95px) + 12px);
        }
        .ccd-video-main{display:flex;flex-direction:column;gap:32px;min-width:0;}
        .ccd-video-side{position:sticky;top:calc(var(--row1-h,36px) + var(--row2-h,54px) + var(--row3-h,95px) + 12px);}
        .ccd-video-request{padding-top:16px;margin-top:16px;border-top:1px solid var(--line);scroll-margin-top:140px;}
        .ccd-video-request h3{font:800 17px/1.2 var(--yat-font-compact);margin:0 0 8px;}
        .ccd-video-request p{font:400 12px/1.4 var(--yat-font-ui);color:var(--muted);margin:0 0 12px;}
        .ccd-video-request .ccg-link{display:none;}
        .ccd-video-request .ccg-form{padding:12px;margin:0;}
        .ccd-video-transaction{display:flex;flex-direction:column;gap:11px;margin-top:15px;padding-top:17px;border-top:1px solid var(--line);}
        .ccd-video-transaction h3{font:800 17px/1.1 var(--yat-font-compact);margin:0;}
        .ccd-video-transaction label{display:flex;flex-direction:column;gap:4px;font:700 11px var(--yat-font-ui);}
        .ccd-video-transaction :is(input,select,textarea){width:100%;padding:10px;border:1px solid var(--line);border-radius:3px;background:var(--bg);color:var(--fg);font:400 12px var(--yat-font-ui);opacity:.7;}
        .ccd-video-transaction small{font:400 11px/1.4 var(--yat-font-ui);color:var(--muted);}
        .ccd-video-total{display:flex;justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:12px;font:700 12px var(--yat-font-ui);}
        .ccd-video-actions{display:flex;gap:10px;flex-wrap:wrap;}
        .ccd-buy-now:disabled{opacity:.55;cursor:not-allowed;}
        .ccd-player-signup{padding:18px 0 0;border-top:1px solid var(--line);scroll-margin-top:150px;}
        .ccd-player-signup h2{margin:6px 0;font:800 25px/1.1 var(--yat-font-compact);text-transform:uppercase;}
        .ccd-player-signup>p{max-width:620px;font:400 13px/1.5 var(--yat-font-ui);color:var(--muted);}
        .ccd-player-apply{margin-top:15px;padding:15px;}
        .ccd-player-apply .ycs{min-width:0;}
        .ccd-player-apply .yat-gs-results{max-height:300px!important;overflow-y:auto!important;}
        .ccd-player-apply .yat-search-card{color:var(--fg);}
        .ccd-player-chosen{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--line);padding:10px;}
        .ccd-player-chosen strong{font:800 16px var(--yat-font-compact);}
        .ccd-player-chosen small{font:400 11px var(--yat-font-ui);color:var(--muted);}
        .ccd-player-chosen button{margin-left:auto;background:none;color:var(--fg);border:0;text-decoration:underline;cursor:pointer;font:700 11px var(--yat-font-ui);}
        @media(max-width:980px){.ccd-video-section{grid-template-columns:1fr;gap:15px;margin-top:30px;}.ccd-video-side{display:block;position:static;}.ccd-video-screen{min-height:210px;}}
        @media(max-width:740px){#sec-mentor .ccd{padding-bottom:60px;}.ccd-video-section{margin:25px 10px 20px;padding-top:15px;}.ccd-video-side{display:block!important;}.ccd-player-apply{padding:12px;}.ccd-video-actions{flex-direction:column;align-items:stretch;}}
        /* Real page layout: photos and information in left-hand rail; placement on right.
           No sponsor packages on this page; only the player-video exchange. */
        .ccd-video-feature { display:flex; flex-direction:column; gap:10px; padding:0 2px 20px; }
        .ccd-video-screen { min-height:265px; display:flex; flex-direction:column; gap:12px; align-items:center; justify-content:center; padding:26px 14px; color:#f6f6f6; border:1px solid rgba(255,255,255,.23); border-radius:7px; background:radial-gradient(circle at 50% 45%,#254435 0,#101915 46%,#090b09 95%); text-align:center; }
        .ccd-video-screen i {font-size:54px;line-height:1;}
        .ccd-video-screen strong {font:900 28px/1 var(--yat-font-compact);}
        .ccd-video-screen span {font:700 11px/1.3 var(--yat-font-ui);letter-spacing:.06em; color:#c9cfcb;}
        .ccd-video-feature-copy {display:flex;flex-direction:column;align-items:flex-start;gap:8px;}
        .ccd-video-feature-copy h2 {font:800 24px/1.04 var(--yat-font-compact);text-transform:uppercase;margin:0;}
        .ccd-video-feature-copy p {font:400 13px/1.5 var(--yat-font-ui);color:var(--muted);max-width:460px;}
        .ccd-video-feature-copy small {color:var(--muted);font:500 11px/1.4 var(--yat-font-ui);}
        .ccd-video-instructions {display:flex;flex-direction:column;gap:0;padding:3px 0;border-top:1px solid var(--line);}
        .ccd-video-instructions > div {display:grid;grid-template-columns:33px 1fr;gap:12px;align-items:center;padding:15px 3px;border-bottom:1px solid var(--line);}
        .ccd-video-instructions b {font:800 23px/1 var(--yat-font-compact);color:var(--muted);}
        .ccd-video-instructions > div > span {display:flex;flex-direction:column;gap:5px;}
        .ccd-video-instructions strong {font:800 15px var(--yat-font-ui);}
        .ccd-video-instructions small {font:400 12px/1.4 var(--yat-font-ui);color:var(--muted);}
        .ccd-video-notice {font:500 11px/1.4 var(--yat-font-ui);color:var(--muted);}
        .ccd-thumb-front,.ccd-thumb-back,.ccd-thumb-timeline {border-radius:7px;border:1px solid var(--line);background:#131a17;}
        .ccd-thumb-contained.ccd-thumb-front .ccd-thumb-photo > img,
        .ccd-thumb-contained.ccd-thumb-back .ccd-thumb-photo > img,
        .ccd-thumb-contained.ccd-thumb-timeline .ccd-thumb-photo > img {object-fit:contain;filter:none;}
        @media (min-width:741px) {
          .ccd-thumb-contained.ccd-thumb-front,
          .ccd-thumb-contained.ccd-thumb-back,
          .ccd-thumb-contained.ccd-thumb-timeline {width:78px;height:72px;border-radius:6px;overflow:hidden;}
          .ccd-thumb-contained.ccd-thumb-front .ccd-thumb-photo,
          .ccd-thumb-contained.ccd-thumb-back .ccd-thumb-photo,
          .ccd-thumb-contained.ccd-thumb-timeline .ccd-thumb-photo {border-radius:0;}
        }
      `}</style>
    </div>
  );
}
