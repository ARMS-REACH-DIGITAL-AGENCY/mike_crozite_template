'use client';

// Row 4 of the Connect & Contribute Portal, top to bottom: the three ways to
// connect (the paid ones), then the four ways to contribute. Row 3's icons
// and the account drawer's list scroll here; each section shows where on the
// site it lands (mockups built from the same pieces as the photo proof, with
// a red marker where help is needed) and ends with the button that opens its
// drawer from the left. Opening a drawer asks a fan who isn't signed in to
// join first (ContributeDrawer).

import { useContext, useState, type ReactNode } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import {
  CONTRIBUTE_OPTIONS,
  PHOTO_TYPES,
  SPONSOR_INTERESTS,
  openContribute,
  type ContributeTab,
  type SponsorInterest,
} from '@/lib/contribute';

const option = (id: string) => CONTRIBUTE_OPTIONS.find((o) => o.id === id)!;
const PARTNERS_URL = 'https://yatstats.com/partners/';

type Photo = { src: string; name: string };

// A real action photo, full width, with a bold label over its bottom left.
function Tile({ photo, children, as = 'h3' }: { photo: Photo; children: ReactNode; as?: 'h2' | 'h3' }) {
  const Title = as;
  return (
    <div className="ccg-tile" style={{ backgroundImage: `url("${photo.src}")` }}>
      <Title className="ccg-tile-title">{children}</Title>
      <small className="ccg-tile-credit">{photo.name}</small>
    </div>
  );
}

function Section({ id, title, soon, photo, children }: { id: string; title: string; soon?: boolean; photo?: Photo; children: ReactNode }) {
  const o = option(id);
  if (photo) {
    return (
      <section className="ccg-sec has-photo" id={o.section}>
        <Tile photo={photo}>{title}</Tile>
        <div className="ccg-body">
          {soon ? <div className="ccg-soon">Coming soon</div> : null}
          {children}
        </div>
      </section>
    );
  }
  return (
    <section className="ccg-sec" id={o.section}>
      <div className="ccg-icon"><i className={o.icon} aria-hidden="true" /></div>
      <div className="ccg-body">
        <h3>{title}{soon ? <span className="ccg-soon">Coming soon</span> : null}</h3>
        {children}
      </div>
    </section>
  );
}

function OpenDrawer({ tab, children }: { tab: ContributeTab; children: ReactNode }) {
  return <button type="button" className="ccg-btn" onClick={() => openContribute({ tab })}>{children}</button>;
}

// "Contact the YAT?STATS Partner Program Team": an ARMS lead, tagged with
// what they're interested in and this school.
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

function Offer({ title, price, children, visual, interest, onInquire }: {
  title: string; price?: boolean; children: ReactNode; visual?: ReactNode; interest: SponsorInterest; onInquire: (i: SponsorInterest) => void;
}) {
  return (
    <div className="ccg-offer">
      <div className="ccg-offer-text">
        <h4>{price ? <span className="ccg-cash">$$$</span> : null}{title}{price ? <span className="ccg-cash">$$$</span> : null}</h4>
        {children}
        <div className="ccg-actions">
          <button type="button" className="ccg-btn" onClick={() => onInquire(interest)}>I&apos;m interested</button>
          <span className="ccg-muted ccg-small">Buy online: coming soon</span>
        </div>
      </div>
      {visual ? <div className="ccg-offer-visual">{visual}</div> : null}
    </div>
  );
}

// Real pieces of this school's site for the sections to show (built on the
// server by the page: this school's own flip cards, PlayerCard).
export type GuideExamples = { photo?: ReactNode; data?: ReactNode; missing?: ReactNode; alumni?: ReactNode; photos?: { src: string; name: string }[] };

function Examples({ caption, children }: { caption: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <figure className="ccg-shot ccg-real">
      <div className="ccg-cards">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export default function ContributeGuide({ schoolName, examples = {} }: { schoolName: string; examples?: GuideExamples }) {
  const hub = schoolName || 'your school';
  // The section photos, in page order (reused when there are fewer).
  const photos = examples.photos || [];
  const pic = (i: number): Photo | undefined => (photos.length ? photos[i % photos.length] : undefined);

  // One inquiry form open at a time, under the offer that opened it.
  const [inquiry, setInquiry] = useState<{ at: string; interest: SponsorInterest } | null>(null);
  const inquire = (at: string) => (interest: SponsorInterest) => setInquiry({ at, interest });
  const inquiryForm = (at: string) => inquiry?.at === at
    ? <SponsorInquiry key={`${at}-${inquiry.interest}`} interest={inquiry.interest} onClose={() => setInquiry(null)} />
    : null;

  return (
    <div className="ccg">
      <header className="ccg-intro">
        {pic(0) ? <Tile photo={pic(0)!} as="h2">Connect &amp; Contribute</Tile> : <h2>Connect &amp; Contribute Portal</h2>}
        <p>
          Connect with the players, fans and alumni of {hub}, and help complete their stories. Every next-level alum gets a
          flip card, a profile and a Career Path Timeline, and the people who know them best can fill in what&apos;s missing.
        </p>
      </header>

      <div className="ccg-group">Connect</div>

      <Section id="player" title="Connect With Players" photo={pic(1)} soon>
        <p>
          Players will record a short hello for the Connect tab of their profile. From there you&apos;ll be able to request a
          personal video: a birthday shout-out, an answer to your question, or his take on a video of your swing or your
          delivery.
        </p>
      </Section>

      <Section id="fans" title="Connect With Fans" photo={pic(2)}>
        <div className="ccg-offer">
          <div className="ccg-offer-text">
            <h4>Hey Players, Give Back to Your Hometown Fans <span className="ccg-soon">Coming soon</span></h4>
            <p>
              The people who watched you play in high school are still following you. Record a short hello for your
              profile&apos;s Connect tab, and answer the requests that come in: a birthday shout-out for a young player, a
              question about the next level, a look at a swing or a delivery. It takes a few minutes and means the world
              to the kid on the other end.
            </p>
          </div>
        </div>

        <Offer title="Co-Brand Title Sponsor" price interest="title" onInquire={inquire('title')}>
          <p>
            Put your business on {hub}&apos;s YAT?STATS, next to the players and stories the town already follows.
            Sponsorships help keep the hub running and growing.
          </p>
          <div className="ccg-benefits">
            <b>Multiple touch points:</b>
            <ul>
              <li>Sponsor Flip Card</li>
              <li>Email and SMS messages</li>
              <li>Fan Updates branding</li>
              <li>Splash Page</li>
            </ul>
          </div>
          <p className="ccg-small">
            See every opportunity at <a href={PARTNERS_URL} target="_blank" rel="noreferrer">yatstats.com/partners</a>.
          </p>
        </Offer>
        {inquiryForm('title')}

        <Offer title="Active Alumni Profile Sponsor" price interest="profile" onInquire={inquire('profile')}>
          <p>Sponsor an active alum&apos;s profile page: your business on the page his hometown fans visit all season.</p>
        </Offer>
        {inquiryForm('profile')}

        <Offer title="Bracket Ticket Message" price interest="bracket" onInquire={inquire('bracket')}>
          <p>Your message in the Fantasy Bracket Tourney, in front of the fans playing along every week.</p>
        </Offer>
        {inquiryForm('bracket')}
      </Section>

      <Section id="alumni" title="Connect With Fellow Alumni" photo={pic(3)}>
        <p>
          <b>Where YAT now?</b> If you played at the next level, your profile page can say where you are today. Add how to
          reach you, personally or for your business, your social handles, and the photo on the back of your flip card, so
          teammates, coaches and fans can find you. You can sponsor your own profile page, too.
        </p>
        <Examples caption="Your flip card: tap it to see the back">{examples.alumni}</Examples>
        <div className="ccg-actions">
          <button type="button" className="ccg-btn" onClick={() => inquire('alumni')('alumni')}>Update my profile</button>
          <span className="ccg-muted ccg-small">Sponsor your own page: buy online coming soon</span>
        </div>
        {inquiryForm('alumni')}
      </Section>

      <div className="ccg-group">Contribute</div>

      <Section id="photo" title="Photos" photo={pic(4)}>
        <p>
          A silhouette where a photo should be means we don&apos;t have one yet. The high school photo on the front of his
          flip card is the hardest to find and the one we need most: try a family album, a yearbook or a team
          photographer&apos;s files.
        </p>
        <Examples caption={`${hub} alumni still missing their high school photo`}>{examples.photo}</Examples>
        <details className="ccg-details">
          <summary>Every kind of photo we take</summary>
          <ul className="ccg-list">{PHOTO_TYPES.map((t) => <li key={t.id}><b>{t.prefix} · {t.label}</b> {t.spec}</li>)}</ul>
        </details>
        <OpenDrawer tab="photo">Send a photo</OpenDrawer>
      </Section>

      <Section id="data" title="Update Data" photo={pic(5)}>
        <p>
          Stats come from our official stat provider, so we don&apos;t take stat changes. Everything else about him, tell us:
          his graduation year, height and weight, position, bats and throws, honors, a team or league we don&apos;t list.
        </p>
        <Examples caption="Everything on his card that isn't a stat, you can correct">{examples.data}</Examples>
        <OpenDrawer tab="data">Update player info</OpenDrawer>
      </Section>

      <Section id="missing" title="Missing Next-Level Alumni" photo={pic(6)}>
        <p>
          If he played college, pro or independent ball after high school, he belongs on {hub}&apos;s YAT?STATS. Tell us
          who he is, his class and where he played, and we&apos;ll add him.
        </p>
        <Examples caption="The All-Time Next-Level List">{examples.missing}</Examples>
        <OpenDrawer tab="missing">Add a missing alum</OpenDrawer>
      </Section>

      <Section id="tip" title="News Tip" photo={pic(7)}>
        <p>
          A call-up, an award, a big game, a feature story. Send us the link. One tip can show up in Active Alumni News, on
          his profile and on his flip card.
        </p>
        <OpenDrawer tab="tip">Send a news tip</OpenDrawer>
      </Section>

      <p className="ccg-memories">
        * Looking to share personal memories of a player? Post them on his profile page, on his Career Path Timeline:
        click the Polaroid icon at the bottom left of the timeline. Stories there let you tell what happened, and let
        others like, comment, share and tag.
      </p>

      <style jsx global>{`
        .ccg { max-width: 1040px; margin: 0 auto; padding: 18px 16px 56px; display: flex; flex-direction: column; gap: 22px; font-family: var(--yat-font-ui); color: var(--sb-ink); }
        .ccg h2 { margin: 0; font: 700 22px/1.15 var(--yat-font-compact); letter-spacing: .005em; }
        .ccg-intro p { margin: 6px 0 0; font-size: 14px; line-height: 1.55; max-width: 760px; color: var(--sb-ink-muted); }
        .ccg-muted { opacity: .7; }
        .ccg-body a, .ccg-intro a { color: var(--sb-text); text-decoration: underline; text-underline-offset: 2px; }
        .ccg-small { font-size: 12px; }
        .ccg-group { margin: 26px 0 0; padding: 0 0 8px; border-bottom: 2px solid var(--sb-head); color: var(--sb-text); font: 700 13px/1 var(--yat-font-ui); letter-spacing: .14em; text-transform: uppercase; }
        .ccg-sec { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; padding: 12px; border: 1px solid var(--sb-card-border); border-radius: 7px; background: var(--sb-card-bg);
          scroll-margin-top: calc(var(--row1-h, 56px) + var(--row2-h, 56px) + 96px); }
        @media (max-width: 560px) { .ccg-sec:not(.has-photo) .ccg-shots, .ccg-sec:not(.has-photo) .ccg-offer, .ccg-sec:not(.has-photo) .ccg-form, .ccg-sec:not(.has-photo) .ccg-real { margin-left: -44px; } }
        .ccg-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 6px; border: 1px solid var(--sb-rim); background: var(--sb-panel); color: #fff; font-size: 17px; }
        .ccg-body { min-width: 0; }
        .ccg-body h3 { margin: 4px 0 6px; font: 700 20px/1.15 var(--yat-font-compact); letter-spacing: .005em; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .ccg-body h4 { margin: 0 0 6px; font: 700 17px/1.15 var(--yat-font-compact); letter-spacing: .005em; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ccg-body p { margin: 0 0 10px; font-size: 14px; line-height: 1.55; color: var(--sb-ink-muted); }
        .ccg-soon { font: 600 11px/1 var(--yat-font-ui); letter-spacing: .05em; text-transform: uppercase; color: var(--sb-ink-muted); opacity: .8; }
        .ccg-cash { color: var(--sb-accent); font-weight: 700; }
        .ccg-list { margin: 8px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.5; }
        .ccg-list li { margin-bottom: 4px; }
        .ccg-list b { margin-right: 4px; }
        .ccg-details { margin: 0 0 12px; font-size: 13px; }
        .ccg-details summary { cursor: pointer; font: 600 11px/1.3 var(--yat-font-ui); letter-spacing: .05em; text-transform: uppercase; color: var(--sb-ink-muted); }
        .ccg-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0; border: 0; background: none; color: var(--sb-text); font: 700 16px/1 var(--yat-font-compact); letter-spacing: .03em; text-transform: uppercase; cursor: pointer; }
        .ccg-btn::after { content: '›'; font-size: 20px; line-height: 1; transform: translateY(-1px); opacity: .8; }
        .ccg-btn:hover { text-decoration: underline; text-underline-offset: 3px; }
        .ccg-btn:disabled { opacity: .6; cursor: default; }
        .ccg-link { background: none; border: 0; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; font-size: 13px; }
        .ccg-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 4px; }
        .ccg-memories { margin: 4px 0 0; font-size: 13px; line-height: 1.5; opacity: .8; }
        /* The visual tour */
        .ccg-shots { display: flex; flex-wrap: wrap; gap: 16px; margin: 6px 0 14px; align-items: flex-start; }
        .ccg-shot { margin: 0; display: flex; flex-direction: column; gap: 6px; max-width: 100%; }
        .ccg-shot-frame { padding: 10px; border: 1px solid var(--sb-card-border); border-radius: 7px; background: rgba(255,255,255,.03); display: flex; justify-content: center; }
        .ccg-shot figcaption { font: 600 11px/1.2 var(--yat-font-ui); letter-spacing: .05em; text-transform: uppercase; color: var(--sb-ink-muted); opacity: .8; }
        .ccg-need { position: absolute; z-index: 3; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none; }
        .ccg-need-dot { width: 16px; height: 16px; border-radius: 50%; background: #e11d2e; border: 2px solid #fff; box-shadow: 0 0 0 0 rgba(225,29,46,.6); animation: ccgPulse 1.6s ease-out infinite; }
        .ccg-need-label { padding: 3px 7px; border-radius: 6px; background: #e11d2e; color: #fff; font: 700 11px/1.1 var(--yat-font-compact); letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; }
        @keyframes ccgPulse { 70% { box-shadow: 0 0 0 12px rgba(225,29,46,0); } 100% { box-shadow: 0 0 0 0 rgba(225,29,46,0); } }
        @media (prefers-reduced-motion: reduce) { .ccg-need-dot { animation: none; } }
          background: linear-gradient(160deg, #2a2f36, #0b0c0e); color: #fff; font-size: 12px; font-style: italic; }
        .ccg-offer { display: flex; flex-wrap: wrap; gap: 14px; padding: 10px 12px; margin: 0 0 10px; border: 1px solid var(--sb-card-border); border-radius: 7px; background: rgba(0,0,0,.12); }
        .ccg-offer-text { flex: 1 1 300px; min-width: 0; }
        .ccg-offer-visual { flex: 0 1 auto; }
        .ccg-benefits { font-size: 13px; margin-bottom: 8px; color: var(--sb-ink-muted); }
        .ccg-benefits ul { margin: 4px 0 0; padding-left: 18px; line-height: 1.5; }
        /* Real action photos with a bold label (the section headers) */
        .ccg-tile { position: relative; overflow: hidden; height: clamp(190px, 34vw, 360px); border-radius: 10px; background: #111 center 30% / cover no-repeat; }
        .ccg-tile::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.82), rgba(0,0,0,.18) 55%, rgba(0,0,0,0)); }
        .ccg-tile-title { position: absolute; z-index: 1; left: 18px; right: 18px; bottom: 16px; margin: 0 !important; color: #fff; font: 800 clamp(30px, 6.4vw, 56px)/.92 var(--yat-font-compact) !important; letter-spacing: .01em !important; text-transform: uppercase; text-shadow: 0 2px 10px rgba(0,0,0,.35); }
        .ccg-tile-credit { position: absolute; z-index: 1; right: 12px; top: 10px; color: rgba(255,255,255,.75); font: 600 10px/1 var(--yat-font-ui); letter-spacing: .08em; text-transform: uppercase; }
        .ccg-intro .ccg-tile { margin-bottom: 16px; height: clamp(220px, 42vw, 440px); }
        .ccg-sec.has-photo { display: block; padding: 0; border: 0; background: none; margin-top: 18px; }
        .ccg-sec.has-photo .ccg-body { padding: 18px 2px 0; max-width: 820px; }
        .ccg-sec.has-photo .ccg-soon { margin-bottom: 8px; }
        /* This school's real flip cards (PlayerCard) */
        .ccg-real { margin: 8px 0 12px; }
        .ccg-cards { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
        .ccg-card { position: relative; width: min(220px, calc(50% - 6px)); }
        .ccg-card .yat-card { width: 100%; }
        .ccg-card-empty { aspect-ratio: 5 / 7; display: grid; place-items: center; border: 2px dashed #e11d2e; border-radius: 10px; color: #e11d2e; font: 700 44px/1 var(--yat-font-compact); }
        .ccg-card .ccg-need { z-index: 5; }
        /* The Partner Program inquiry */
        .ccg-form { display: flex; flex-direction: column; gap: 8px; padding: 12px; margin: 0 0 10px; border: 1px solid var(--sb-card-border); border-radius: 7px; background: var(--sb-card-bg); max-width: 640px; }
        .ccg-form-title { font: 700 14px/1.2 var(--yat-font-compact); letter-spacing: .04em; text-transform: uppercase; }
        .ccg-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; flex: 1 1 200px; }
        .ccg-form-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .ccg-form input, .ccg-form select, .ccg-form textarea { padding: 7px 9px; border-radius: 5px; font-family: var(--yat-font-ui); border: 1px solid var(--line); background: var(--bg, #000); color: inherit; font-size: 14px; }
        .ccg-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
        .ccg-form-error { color: #dc2626; margin: 0; font-size: 13px; }
        .ccg-form-done { margin: 0; font-size: 14px; }
      `}</style>
    </div>
  );
}
