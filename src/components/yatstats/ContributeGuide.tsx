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
import { FlipCardBack, FlipCardFront, Headshot, ProofStyles, TimelineSlide, type ProofPlayer } from './ContributeProof';

const option = (id: string) => CONTRIBUTE_OPTIONS.find((o) => o.id === id)!;
const PARTNERS_URL = 'https://yatstats.com/partners/';

function Section({ id, title, soon, children }: { id: string; title: string; soon?: boolean; children: ReactNode }) {
  const o = option(id);
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

// A red marker on a mockup: where we need help.
function Need({ children, x = '50%', y = '50%' }: { children: ReactNode; x?: string; y?: string }) {
  return (
    <span className="ccg-need" style={{ left: x, top: y }}>
      <span className="ccg-need-dot" aria-hidden="true" />
      <span className="ccg-need-label">{children}</span>
    </span>
  );
}

function Shot({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="ccg-shot">
      <div className="ccg-shot-frame">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
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

export default function ContributeGuide({ schoolName }: { schoolName: string }) {
  const school = useContext(SchoolContext);
  const hsid = String(school?.hsid || '');
  const crest = hsid ? `https://yatstats-assets.s3.us-west-2.amazonaws.com/schools/${hsid}.png` : '/img/school-placeholder.png';
  const hub = schoolName || 'your school';
  // The mockups' stand-in player.
  const p: ProofPlayer = { name: 'Your Player', classOf: 2019, currentTeam: 'Next-Level Team', schoolName: hub, schoolLocation: school?.hsLocation || '' };

  // One inquiry form open at a time, under the offer that opened it.
  const [inquiry, setInquiry] = useState<{ at: string; interest: SponsorInterest } | null>(null);
  const inquire = (at: string) => (interest: SponsorInterest) => setInquiry({ at, interest });
  const inquiryForm = (at: string) => inquiry?.at === at
    ? <SponsorInquiry key={`${at}-${inquiry.interest}`} interest={inquiry.interest} onClose={() => setInquiry(null)} />
    : null;

  return (
    <div className="ccg">
      <ProofStyles />
      <header className="ccg-intro">
        <h2>Connect &amp; Contribute Portal</h2>
        <p>
          Connect with the players, fans and alumni of {hub}, and help complete their stories. Every next-level alum gets a
          flip card, a profile and a Career Path Timeline, and the people who know them best can fill in what&apos;s missing.
        </p>
      </header>

      <h2 className="ccg-group">Connect</h2>

      <Section id="player" title="Connect with Players" soon>
        <p>
          Players will record a short hello for the Connect tab of their profile. From there you&apos;ll be able to request a
          personal video: a birthday shout-out, an answer to your question, or his take on a video of your swing or your
          delivery.
        </p>
        <div className="ccg-shots">
          <Shot caption="Sample video message">
            <div className="ccg-video">
              <i className="ri-play-circle-fill" aria-hidden="true" />
              <span>&ldquo;Hey, it&apos;s your hometown alum&hellip;&rdquo;</span>
            </div>
          </Shot>
          <Shot caption="Search participating players">
            <div>
              <div className="ccg-search-mock"><i className="ri-search-line" aria-hidden="true" /> Search participating players</div>
              <div className="ccg-muted ccg-small" style={{ marginTop: 8 }}>Request and pay securely with Stripe.</div>
            </div>
          </Shot>
        </div>
      </Section>

      <Section id="fans" title="Connect with Fans">
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

        <Offer
          title="Co-Brand Title Sponsor"
          price
          interest="title"
          onInquire={inquire('title')}
          visual={(
            <Shot caption="Your logo beside the school's, on the splash page">
              <div className="ccg-splash-mock">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/img/yatstats-logo.png" alt="" className="ccg-splash-logo" />
                <div className="ccg-splash-brands">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={crest} alt="" />
                  <span className="ccg-splash-divider" />
                  <span className="ccg-your-logo">YOUR<br />LOGO</span>
                </div>
              </div>
            </Shot>
          )}
        >
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

        <Offer
          title="Active Alumni Profile Sponsor"
          price
          interest="profile"
          onInquire={inquire('profile')}
          visual={(
            <Shot caption="A banner on the player's profile">
              <div className="ccg-banner-mock"><span>YOUR BUSINESS</span><small>proud sponsor of this player&apos;s page</small></div>
            </Shot>
          )}
        >
          <p>Sponsor an active alum&apos;s profile page: your business on the page his hometown fans visit all season.</p>
        </Offer>
        {inquiryForm('profile')}

        <Offer title="Bracket Ticket Message" price interest="bracket" onInquire={inquire('bracket')}>
          <p>Your message in the Fantasy Bracket Tourney, in front of the fans playing along every week.</p>
        </Offer>
        {inquiryForm('bracket')}
      </Section>

      <Section id="alumni" title="Connect with Fellow Alumni">
        <p>
          <b>Where YAT now?</b> If you played at the next level, your profile page can say where you are today. Add how to
          reach you, personally or for your business, your social handles, and the photo on the back of your flip card, so
          teammates, coaches and fans can find you. You can sponsor your own profile page, too.
        </p>
        <div className="ccg-shots">
          <Shot caption="Your contact card at the bottom of your profile">
            <div className="ccg-footer-mock">
              <b>WHERE YAT NOW?</b>
              <span><i className="ri-briefcase-line" aria-hidden="true" /> Your business</span>
              <span><i className="ri-mail-line" aria-hidden="true" /> you@yourbusiness.com</span>
              <span><i className="ri-phone-line" aria-hidden="true" /> (555) 555-0123</span>
              <span className="ccg-socials"><i className="ri-instagram-line" /><i className="ri-twitter-x-line" /><i className="ri-linkedin-box-line" /></span>
            </div>
          </Shot>
          <Shot caption="The back of your flip card">
            <FlipCardBack src="/img/career-path-default.png" crop={null} p={{ ...p, currentTeam: 'Your business' }} />
          </Shot>
        </div>
        <div className="ccg-actions">
          <button type="button" className="ccg-btn" onClick={() => inquire('alumni')('alumni')}>Update my profile</button>
          <span className="ccg-muted ccg-small">Sponsor your own page: buy online coming soon</span>
        </div>
        {inquiryForm('alumni')}
      </Section>

      <h2 className="ccg-group">Contribute</h2>

      <Section id="photo" title="Photos">
        <p>
          A silhouette where a photo should be means we don&apos;t have one yet. The high school photo on the front of his
          flip card is the hardest to find and the one we need most: try a family album, a yearbook or a team
          photographer&apos;s files.
        </p>
        <div className="ccg-shots">
          <Shot caption="Front of his flip card">
            <div className="ccg-mark"><FlipCardFront src="/img/then-batter-silhouette.png" crop={null} p={p} /><Need x="50%" y="38%">No high school photo</Need></div>
          </Shot>
          <Shot caption="His headshot in Row 3">
            <div className="ccg-mark"><Headshot src="/img/headshot-silhouette.png" crop={null} p={p} /><Need x="50%" y="40%">No headshot</Need></div>
          </Shot>
          <Shot caption="A season on his Career Path Timeline">
            <div className="ccg-mark ccg-wide">
              <TimelineSlide
                src="/img/now-batter-silhouette.png"
                crop={null}
                p={p}
                s={{ key: 'x', year: 2021, stage: 'college', team: 'His team', level: 'NCAA D1', label: 'Sophomore', current: false }}
                landscape={false}
              />
              <Need x="42%" y="50%">No 2021 photo</Need>
            </div>
          </Shot>
        </div>
        <details className="ccg-details">
          <summary>Every kind of photo we take</summary>
          <ul className="ccg-list">{PHOTO_TYPES.map((t) => <li key={t.id}><b>{t.prefix} · {t.label}</b> {t.spec}</li>)}</ul>
        </details>
        <OpenDrawer tab="photo">Send a photo</OpenDrawer>
      </Section>

      <Section id="data" title="Update Data">
        <p>
          Our stats come from public sources, and some leagues and box scores never reach us. A missing season, a wrong
          number, the wrong graduation year: tell us, season by season.
        </p>
        <div className="ccg-shots">
          <Shot caption="His stats, season by season">
            <div className="ccg-mark">
              <div className="ccg-stats-mock">
                <div className="is-head"><b>Year</b><span>AVG</span><span>HR</span><span>RBI</span></div>
                {[['2019', '.312', '4', '28'], ['2020', '.298', '2', '19'], ['2021', '–', '–', '–'], ['2022', '.331', '7', '41']].map(([y, a, h, r]) => (
                  <div key={y} className={y === '2021' ? 'is-missing' : ''}><b>{y}</b><span>{a}</span><span>{h}</span><span>{r}</span></div>
                ))}
              </div>
              <Need x="50%" y="70%">2021 season missing</Need>
            </div>
          </Shot>
          <Shot caption="His class year">
            <div className="ccg-mark"><div className="ccg-chip-mock">Class of ????</div><Need x="50%" y="82%">Wrong or missing</Need></div>
          </Shot>
        </div>
        <OpenDrawer tab="data">Update data</OpenDrawer>
      </Section>

      <Section id="missing" title="Missing Next-Level Alumni">
        <p>
          If he played college, pro or independent ball after high school, he belongs on {hub}&apos;s YAT?STATS. Tell us
          who he is, his class and where he played, and we&apos;ll add him.
        </p>
        <div className="ccg-shots">
          <Shot caption="The All-Time Next-Level List">
            <div className="ccg-mark">
              <div className="ccg-gallery-mock">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/img/then-batter-silhouette.png" alt="" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/img/then-pitcher-silhouette.png" alt="" />
                <div className="ccg-empty-card">+</div>
              </div>
              <Need x="83%" y="50%">Who&apos;s missing?</Need>
            </div>
          </Shot>
        </div>
        <OpenDrawer tab="missing">Add a missing alum</OpenDrawer>
      </Section>

      <Section id="tip" title="News Tip">
        <p>
          A call-up, an award, a big game, a feature story. Send us the link. One tip can show up in Active Alumni News, on
          his profile and on his flip card.
        </p>
        <div className="ccg-shots">
          <Shot caption="Active Alumni News">
            <div className="ccg-mark">
              <div className="ccg-news-mock"><small>ACTIVE ALUMNI NEWS</small><b>Your tip could be the next story</b><span /><span /><span /></div>
              <Need x="50%" y="72%">Send us the link</Need>
            </div>
          </Shot>
        </div>
        <OpenDrawer tab="tip">Send a news tip</OpenDrawer>
      </Section>

      <p className="ccg-memories">
        * Looking to share personal memories of a player? Post them on his profile page, on his Career Path Timeline:
        click the Polaroid icon at the bottom left of the timeline. Stories there let you tell what happened, and let
        others like, comment, share and tag.
      </p>

      <style jsx global>{`
        .ccg { max-width: 1040px; margin: 0 auto; padding: 18px 16px 48px; display: flex; flex-direction: column; gap: 14px; }
        .ccg h2 { margin: 0; font: 600 26px/1.05 Oswald, sans-serif; letter-spacing: .03em; text-transform: uppercase; }
        .ccg-intro p { margin: 8px 0 0; font-size: 15px; line-height: 1.55; max-width: 760px; }
        .ccg-muted { opacity: .7; }
        .ccg-small { font-size: 12px; }
        .ccg-group { margin-top: 14px !important; padding-bottom: 6px; border-bottom: 2px solid #FFD700; color: #FFD700; font-size: 22px !important; }
        body.light-theme .ccg-group { color: #9a6f00; border-color: #9a6f00; }
        .ccg-sec { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 14px; padding: 16px 0; border-bottom: 1px solid var(--line);
          scroll-margin-top: calc(var(--row1-h, 56px) + var(--row2-h, 56px) + 96px); }
        @media (max-width: 560px) { .ccg-sec { grid-template-columns: 40px minmax(0, 1fr); gap: 10px; } .ccg-icon { width: 40px; height: 40px; font-size: 19px; } .ccg-sec .ccg-shots, .ccg-sec .ccg-offer, .ccg-sec .ccg-form { margin-left: -50px; } }
        .ccg-icon { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; border: 2px solid #FFD700; color: #FFD700; font-size: 25px; }
        body.light-theme .ccg-icon { border-color: #9a6f00; color: #9a6f00; }
        .ccg-body { min-width: 0; }
        .ccg-body h3 { margin: 4px 0 8px; font: 600 22px/1.1 Oswald, sans-serif; letter-spacing: .03em; text-transform: uppercase; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .ccg-body h4 { margin: 0 0 6px; font: 600 17px/1.15 Oswald, sans-serif; letter-spacing: .03em; text-transform: uppercase; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ccg-body p { margin: 0 0 10px; font-size: 14px; line-height: 1.55; }
        .ccg-soon { padding: 3px 8px; border: 1px solid currentColor; border-radius: 999px; font: 500 11px/1 Oswald, sans-serif; letter-spacing: .08em; opacity: .7; }
        .ccg-cash { color: #16a34a; font-weight: 700; }
        .ccg-list { margin: 8px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.5; }
        .ccg-list li { margin-bottom: 4px; }
        .ccg-list b { margin-right: 4px; }
        .ccg-details { margin: 0 0 12px; font-size: 13px; }
        .ccg-details summary { cursor: pointer; font: 500 14px/1.3 Oswald, sans-serif; letter-spacing: .05em; text-transform: uppercase; opacity: .85; }
        .ccg-btn { min-height: 40px; padding: 0 18px; border-radius: 8px; border: 0; background: #FFD700; color: #000; font: 500 15px/1 Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; cursor: pointer; }
        .ccg-btn:disabled { opacity: .6; cursor: default; }
        .ccg-link { background: none; border: 0; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; font-size: 13px; }
        .ccg-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 4px; }
        .ccg-memories { margin: 4px 0 0; font-size: 13px; line-height: 1.5; opacity: .8; }
        /* The visual tour */
        .ccg-shots { display: flex; flex-wrap: wrap; gap: 16px; margin: 6px 0 14px; align-items: flex-start; }
        .ccg-shot { margin: 0; display: flex; flex-direction: column; gap: 6px; max-width: 100%; }
        .ccg-shot-frame { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.03); display: flex; justify-content: center; }
        .ccg-shot figcaption { font: 500 12px/1.2 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; opacity: .75; }
        .ccg-mark { position: relative; }
        .ccg-mark .ypf-card, .ccg-mark .ypf-back, .ccg-shot-frame > .ypf-back { width: 170px; }
        .ccg-mark .ypf-circle { width: 64px; height: 64px; }
        .ccg-wide { width: min(440px, 76vw); }
        .ccg-need { position: absolute; z-index: 3; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none; }
        .ccg-need-dot { width: 16px; height: 16px; border-radius: 50%; background: #e11d2e; border: 2px solid #fff; box-shadow: 0 0 0 0 rgba(225,29,46,.6); animation: ccgPulse 1.6s ease-out infinite; }
        .ccg-need-label { padding: 3px 7px; border-radius: 6px; background: #e11d2e; color: #fff; font: 600 11px/1.1 Oswald, sans-serif; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; }
        @keyframes ccgPulse { 70% { box-shadow: 0 0 0 12px rgba(225,29,46,0); } 100% { box-shadow: 0 0 0 0 rgba(225,29,46,0); } }
        @media (prefers-reduced-motion: reduce) { .ccg-need-dot { animation: none; } }
        .ccg-video { width: 150px; aspect-ratio: 9 / 16; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 10px; text-align: center;
          background: linear-gradient(160deg, #2a2f36, #0b0c0e); color: #fff; font-size: 12px; font-style: italic; }
        .ccg-video i { font-size: 44px; color: #FFD700; font-style: normal; }
        .ccg-search-mock { width: min(280px, 70vw); padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; opacity: .7; font-size: 13px; }
        .ccg-offer { display: flex; flex-wrap: wrap; gap: 16px; padding: 14px; margin: 0 0 12px; border: 1px solid var(--line); border-radius: 12px; }
        .ccg-offer-text { flex: 1 1 300px; min-width: 0; }
        .ccg-offer-visual { flex: 0 1 auto; }
        .ccg-benefits { font-size: 14px; margin-bottom: 8px; }
        .ccg-benefits ul { margin: 4px 0 0; padding-left: 18px; line-height: 1.5; }
        .ccg-splash-mock { width: 220px; aspect-ratio: 9 / 13; border-radius: 10px; background: radial-gradient(circle at 50% 0, rgba(255,255,255,.22), transparent 45%), #000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; }
        .ccg-splash-logo { width: 78%; height: auto; }
        .ccg-splash-brands { display: flex; align-items: center; gap: 12px; }
        .ccg-splash-brands img { width: 52px; height: 52px; object-fit: contain; }
        .ccg-splash-divider { width: 2px; height: 46px; background: linear-gradient(transparent, rgba(255,255,255,.7), transparent); }
        .ccg-your-logo { display: grid; place-items: center; width: 60px; height: 46px; border: 2px dashed #FFD700; border-radius: 6px; color: #FFD700; font: 600 10px/1.1 Oswald, sans-serif; text-align: center; }
        .ccg-banner-mock { width: min(300px, 70vw); padding: 12px 14px; border-radius: 8px; border: 2px dashed #FFD700; display: flex; flex-direction: column; gap: 2px; }
        .ccg-banner-mock span { font: 700 18px/1 Oswald, sans-serif; letter-spacing: .05em; }
        .ccg-banner-mock small { font-size: 11px; opacity: .75; }
        .ccg-footer-mock { width: min(280px, 70vw); padding: 12px 14px; border-radius: 10px; background: #111; color: #eee; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
        .ccg-footer-mock b { color: #FFD700; font: 600 15px/1 Oswald, sans-serif; letter-spacing: .06em; }
        .ccg-footer-mock i { color: #FFD700; margin-right: 6px; }
        .ccg-socials { display: flex; gap: 10px; font-size: 18px; }
        .ccg-stats-mock { width: 230px; display: flex; flex-direction: column; gap: 4px; font: 500 14px/1 Oswald, sans-serif; }
        .ccg-stats-mock div { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; gap: 6px; padding: 8px 10px; border-radius: 6px; background: rgba(255,255,255,.06); }
        .ccg-stats-mock div.is-head { background: none; padding-block: 2px; font-size: 11px; opacity: .6; }
        .ccg-stats-mock div.is-missing { outline: 2px dashed #e11d2e; }
        .ccg-chip-mock { padding: 14px 20px; margin-bottom: 40px; border: 1px solid var(--line); border-radius: 999px; font: 600 16px/1 Oswald, sans-serif; letter-spacing: .06em; }
        .ccg-gallery-mock { display: flex; gap: 10px; justify-content: center; }
        .ccg-gallery-mock img, .ccg-empty-card { width: 110px; aspect-ratio: 5 / 7; border-radius: 8px; object-fit: cover; background: #1a1a1a; }
        .ccg-empty-card { display: grid; place-items: center; border: 2px dashed #e11d2e; color: #e11d2e; font: 600 40px/1 Oswald, sans-serif; background: transparent; }
        @media (max-width: 560px) { .ccg-gallery-mock img, .ccg-empty-card { width: 24vw; } }
        .ccg-news-mock { width: min(300px, 70vw); padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
        .ccg-news-mock small { color: #FFD700; font: 500 11px/1 Oswald, sans-serif; letter-spacing: .1em; }
        .ccg-news-mock b { font: 600 18px/1.1 Oswald, sans-serif; }
        .ccg-news-mock span { height: 8px; border-radius: 4px; background: rgba(255,255,255,.12); }
        .ccg-news-mock span:last-child { width: 60%; }
        /* The Partner Program inquiry */
        .ccg-form { display: flex; flex-direction: column; gap: 10px; padding: 14px; margin: 0 0 14px; border: 1px solid #FFD700; border-radius: 12px; max-width: 640px; }
        .ccg-form-title { font: 600 16px/1.2 Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
        .ccg-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; flex: 1 1 200px; }
        .ccg-form-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .ccg-form input, .ccg-form select, .ccg-form textarea { padding: 9px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg, #000); color: inherit; font-size: 14px; }
        .ccg-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
        .ccg-form-error { color: #dc2626; margin: 0; font-size: 13px; }
        .ccg-form-done { margin: 0; font-size: 14px; }
      `}</style>
    </div>
  );
}
