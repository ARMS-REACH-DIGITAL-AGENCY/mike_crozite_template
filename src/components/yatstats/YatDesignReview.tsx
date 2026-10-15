'use client';

import { useContext, useEffect, useState, type ReactNode } from 'react';
import { SchoolContext } from '@/context/SchoolContext';

// Approval-only site blueprints. No sponsor placement is sold, no paid
// transaction is performed, and no production content is changed here.
const SCREENS = [
  { id: 'overview', label: 'Site Map', family: 'Overview', title: 'YAT?STATS Experience Map', about: 'Stories and Stats! Connect. Contribute. Reminisce.' },
  { id: 'splash', label: 'Splash & Title', family: 'School Hub', title: 'Splash Page & Title Recognition', about: 'Premium school-level presence at first contact.' },
  { id: 'galleries', label: 'Galleries & Row 5', family: 'School Hub', title: 'Alumni Galleries & Sponsor a Team', about: 'The three Title Sponsor flip-card locations plus the All-Time Team package.' },
  { id: 'news', label: 'Active Alumni News', family: 'School Hub', title: 'Active Alumni News', about: 'Unfiltered on arrival; selecting a Row 3 alumnus filters the same feed.' },
  { id: 'active-profile', label: 'Active Profile', family: 'Player Profile', title: 'Active Alumni Player Profile', about: 'Live Game Log, news, video invitation and Career Path Timeline.' },
  { id: 'retired-profile', label: 'Retired Profile', family: 'Player Profile', title: 'Retired Alumni Player Profile', about: 'Where They YAT NOW?, archived playing-career news and fan connections.' },
  { id: 'contribute', label: 'Connect & Contribute', family: 'Community', title: 'Connect & Contribute Portal', about: 'One video exchange on Connect; history and player updates on Contribute.' },
  { id: 'partner', label: 'Partner Program & Rate Card', family: 'Partnership', title: 'Partnership Program & Rate Card', about: 'Five packages, every media location and the evidence needed to set pricing.' },
  { id: 'bracket', label: 'Fantasy Bracket', family: 'Competition', title: 'Fantasy Bracket & Partner Inventory', about: 'Stat panels on the left, scoreboard to the right and inventory when panels close.' },
  { id: 'communications', label: 'Fan Correspondence', family: 'Partnership', title: 'Title Sponsor in Fan Updates', about: 'School-to-fan favorite-player alerts, announcements and updates.' },
] as const;

export type ReviewScreen = (typeof SCREENS)[number]['id'];

type PackageId = 'title' | 'active-profile' | 'retired-profile' | 'bracket' | 'alltime-team';

type PartnerPackage = {
  id: PackageId;
  name: string;
  descriptor: string;
  inventory: string[];
  desktop: string;
  mobile: string;
  metrics: string;
};

const PACKAGES: PartnerPackage[] = [
  {
    id: 'title',
    name: 'Title Sponsor',
    descriptor: 'One school-wide package spanning first impression, alumni galleries, news and correspondence.',
    inventory: [
      'School splash page recognition',
      'Sponsor flip card (front AND back) in the Active Quick Flip Gallery',
      'The same front/back sponsor flip card in the All-Time Quick Flip Gallery',
      'The same front/back sponsor flip card in the Current Team Flip Gallery',
      'Active Alumni News page advertising tower or mobile news row',
      'School-to-fan correspondence: favorite-player alerts, news, announcements and updates',
    ],
    desktop: 'Splash recognition + gallery cards + vertical news tower + fan correspondence',
    mobile: 'Splash recognition + gallery cards + a news-row unit + fan correspondence',
    metrics: 'Unique school reach, gallery exposure/flips, viewable news impressions, delivered fan messages, attributable visits',
  },
  {
    id: 'active-profile',
    name: 'Player Profile Partner — Active',
    descriptor: 'An association with a specific active alumnus and the fans who follow his next-level career.',
    inventory: [
      'Right-side partner tower alongside the player News tab',
      'Right-side partner tower alongside the player Connect tab',
      'Right-side partner tower alongside the player Stories / Career Path tab',
    ],
    desktop: 'Right-side tower for News, Connect and Stories',
    mobile: 'Horizontal ad row within each eligible profile tab',
    metrics: 'Eligible profile sessions, tab views, viewable ad impressions, partner clicks, qualified responses',
  },
  {
    id: 'retired-profile',
    name: 'Player Profile Partner — Retired',
    descriptor: 'Same profile inventory as Active, with a proposed former Next Level alumnus discount.',
    inventory: [
      'Right-side partner tower alongside archived career News',
      'Right-side partner tower alongside player video Connect',
      'Right-side partner tower alongside Stories / Career Path',
      'The retired alumni Where They YAT NOW? content is the editorial draw, not additional promised ad inventory',
    ],
    desktop: 'Right-side tower for archived News, Connect and Stories',
    mobile: 'Horizontal ad row within each eligible profile tab',
    metrics: 'Retired-player profile sessions, archived-story views, viewable impressions, clicks, community engagement',
  },
  {
    id: 'bracket',
    name: 'Fantasy Bracket Partner',
    descriptor: 'A tournament sponsor beside the main scoreboard while statistical panels are closed.',
    inventory: [
      'Brand placement in available scoreboard-side space only when stat panels are closed',
      'No visibility is promised while left-side statistical panels occupy that space',
      'Tablet/mobile placement and inventory need viewport validation before pricing',
    ],
    desktop: 'Scoreboard-side sponsorship space when both stats drawers are closed',
    mobile: 'Responsive placement to be confirmed in device testing',
    metrics: 'Bracket sessions, time with stat panels closed, viewable unit impressions, clicks, repeat tournament audience',
  },
  {
    id: 'alltime-team',
    name: 'All-Time Sponsor a Team',
    descriptor: 'One combined package: team banner and Row 5 YaTi promotion on the All-Time experience.',
    inventory: [
      'Sponsor-a-Team logo/banner associated with the All-Time team selection',
      'Same-page Row 5 YaTi callout with partner offers, specials or messaging',
    ],
    desktop: 'Team banner and matching Row 5 offer callout',
    mobile: 'Stacked sponsor banner and accompanying YaTi offer module',
    metrics: 'Team/year views, banner viewable impressions, offer impressions, offer/CTA clicks, qualified leads',
  },
];

const CONTRIBUTIONS = [
  { id: 'hs-photo', name: 'High School Photo', tag: 'PAST / FRONT FLIP CARD', detail: 'Replace a missing high school-era photo on the front of the alumni flip card.' },
  { id: 'current-headshot', name: 'Current Year Headshot', tag: 'ROW 3 / ACTIVE GALLERY', detail: 'Current-season face-and-shoulders photo; use the eyes-on-guide alignment.' },
  { id: 'current-action', name: 'Current Action Photo', tag: 'BACK FLIP CARD / THIS YEAR', detail: 'Current-season action shot for the wide image on the back of the flip card.' },
  { id: 'career-photo', name: 'Career Path Hero Photo', tag: 'PLAYER PROFILE / PAST YEARS', detail: 'A full bust or action photograph from the selected career year for the Career Path Timeline.' },
  { id: 'team-crest', name: 'School or Current Team Logo', tag: 'SCHOOL IDENTITY / TEAM ART', detail: 'Send a missing or corrected high school crest or current team logo.' },
  { id: 'news-tip', name: 'Active Player News Tip', tag: 'NEWS / STORY LINK', detail: 'Share a link to a real news story, milestone, signing or award.' },
  { id: 'player-update', name: 'Player Information Updates', tag: 'PROFILE / VERIFIED DATA', detail: 'Submit corrected player details and other relevant information.' },
] as const;

type ContributionId = (typeof CONTRIBUTIONS)[number]['id'];

const NEWS_PLACEHOLDERS = [
  'Alumni milestone or career update',
  'College and professional season news',
  'A hometown connection worth sharing',
  'Player recognition and community update',
];

function PlaceholderCard({ label, note, className = '', children }: {
  label: string; note?: string; className?: string; children?: ReactNode;
}) {
  return (
    <div className={'ydr-placeholder ' + className}>
      <span className="ydr-placeholder-label">{label}</span>
      {children}
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function TopNav({ active }: { active: string }) {
  return (
    <div className="ydr-topnav" aria-label="Proposed school-site navigation">
      {[
        ['WHERE THEY YAT?', 'home'], ['ALL-TIME LIST', 'alltime'],
        ['HIGH SCHOOL', 'highschool'], ['ACTIVE ALUMNI NEWS', 'news'],
        ['CONNECT & CONTRIBUTE', 'contribute'], ['PARTNERSHIP PROGRAM', 'partner'],
        ['ALUMNI FANTASY', 'bracket'], ['GUIDED TOUR', 'tour'],
      ].map(([name, key]) => (
        <span key={key} className={active === key ? 'ydr-nav-selected' : ''}>{name}</span>
      ))}
    </div>
  );
}

function AdTower({ name, note }: { name: string; note?: string }) {
  return (
    <div className="ydr-ad-unit ydr-ad-tower">
      <span>PARTNER INVENTORY</span>
      <strong>{name}</strong>
      <div className="ydr-ad-logo">LOGO / CREATIVE</div>
      <small>{note || 'Vertical tower · desktop'}</small>
    </div>
  );
}

function AdRow({ name, note }: { name: string; note?: string }) {
  return (
    <div className="ydr-ad-unit ydr-ad-row">
      <div className="ydr-ad-row-mark">BRAND</div>
      <div><span>PARTNER INVENTORY</span><strong>{name}</strong><small>{note || 'Horizontal ad row · mobile'}</small></div>
    </div>
  );
}

function ResponsiveAd({ name, note }: { name: string; note?: string }) {
  return <><div className="ydr-ad-desktop"><AdTower name={name} note={note} /></div><div className="ydr-ad-mobile"><AdRow name={name} note={note} /></div></>;
}

function WireStory({ index, archived = false }: { index: number; archived?: boolean }) {
  return (
    <article className="ydr-story">
      <div className="ydr-story-thumb"><span>STORY IMAGE</span></div>
      <div className="ydr-story-copy">
        <small>{archived ? 'ARCHIVED CAREER NEWS' : 'ACTIVE ALUMNI NEWS'}</small>
        <strong>{archived ? 'Playing-career story from the archives' : NEWS_PLACEHOLDERS[(index - 1) % NEWS_PLACEHOLDERS.length]}</strong>
        <p>Headline row, summary and source · content is a wireframe placeholder.</p>
        <span>READ STORY →</span>
      </div>
    </article>
  );
}

function FlipCard({ mode = 'player', side = 'front', label }: {
  mode?: 'player' | 'title' | 'missing'; side?: 'front' | 'back'; label?: string;
}) {
  const title = mode === 'title' ? 'TITLE SPONSOR' : mode === 'missing' ? 'PHOTO NEEDED' : 'ALUMNI FLIP CARD';
  return (
    <div className="ydr-card-wrap">
      <div className={'ydr-flip-card ydr-card-' + mode}>
        <div className="ydr-flip-photo">
          <span>{mode === 'title' ? 'SPONSOR ART / LOGO' : mode === 'missing' ? 'SILHOUETTE' : 'EXISTING PLAYER PHOTO'}</span>
        </div>
        <div className="ydr-flip-details"><small>{side === 'front' ? 'FRONT' : 'BACK'}</small><strong>{title}</strong>
          <span>{mode === 'title' ? 'Sponsor messaging and link' : mode === 'missing' ? 'Fan can contribute a photo' : 'Real school and career details'}</span></div>
      </div>
      <small>{label || (side === 'front' ? 'FRONT OF FLIP CARD' : 'BACK OF FLIP CARD')}</small>
    </div>
  );
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="ydr-section-heading"><span>{eyebrow}</span><h3>{title}</h3>{children ? <p>{children}</p> : null}</div>;
}

function ScreenOverview({ onNavigate, prefix }: {
  onNavigate: (screen: ReviewScreen) => void; prefix: string;
}) {
  return (
    <>
      <div className="ydr-brand-banner">
        <small>YAT?STATS · HOMETOWN BASEBALL</small>
        <strong>Where They YAT?</strong>
        <h3>Stories and Stats!</h3>
        <p>Connect. Contribute. Reminisce.</p>
      </div>
      <SectionHeading eyebrow="PROPOSED EXPERIENCE" title="Eight touchpoints. One hometown community.">
        These are linked, page-specific wireframes for approval. They do not replace the working site or represent paid inventory already sold.
      </SectionHeading>
      <div className="ydr-journey-grid">
        {SCREENS.filter(screen => screen.id !== 'overview').map((screen, index) => (
          <button key={screen.id} type="button" onClick={() => onNavigate(screen.id)}>
            <small>{String(index + 1).padStart(2, '0')} · {screen.family}</small>
            <strong>{screen.label}</strong>
            <span>{screen.about}</span><b>VIEW WIREFRAME →</b>
          </button>
        ))}
      </div>
      <div className="ydr-note-panel">
        <strong>What stays live?</strong>
        <p>The existing school microsite, alumni flip cards, statistics, player profiles, database, bracket and submission handlers remain unchanged. Review these wireframes first; implement approved page changes separately.</p>
        <a href={prefix}>OPEN CURRENT SCHOOL HUB ↗</a>
      </div>
    </>
  );
}

function ScreenSplash({ schoolName }: { schoolName: string }) {
  return (
    <div className="ydr-wire-page">
      <TopNav active="home" />
      <div className="ydr-splash-hero">
        <div className="ydr-splash-copy">
          <span>{schoolName.toUpperCase()} · HOMETOWN BASEBALL</span>
          <h3>WHERE THEY YAT?</h3><strong>Stories and Stats!</strong><p>Connect. Contribute. Reminisce.</p>
          <div className="ydr-wire-button">EXPLORE OUR ALUMNI →</div>
        </div>
        <div className="ydr-splash-illustration">SCHOOL CREST<br />AND ATHLETE ART</div>
      </div>
      <div className="ydr-splash-partner">
        <span>TITLE SPONSOR RECOGNITION</span><div>PARTNER LOGO + BRAND LINE</div><small>Single school splash; appearance and exclusivity to be approved.</small>
      </div>
      <div className="ydr-splash-lower">
        <PlaceholderCard label="ALUMNI NEWS TEASERS" note="Latest relevant headlines" />
        <PlaceholderCard label="ACTIVE / ALL-TIME GALLERIES" note="Direct discovery paths" />
        <PlaceholderCard label="HOMETOWN HISTORY" note="Championship seasons, memories, friends" />
      </div>
    </div>
  );
}

function ScreenGalleries({ schoolName, gallery, setGallery, prefix }: {
  schoolName: string; gallery: 'active' | 'alltime' | 'current';
  setGallery: (gallery: 'active' | 'alltime' | 'current') => void; prefix: string;
}) {
  const names = { active: 'Active Quick Flip Gallery', alltime: 'All-Time Quick Flip Gallery', current: 'Current Team Flip Gallery' };
  return (
    <div className="ydr-wire-page">
      <TopNav active={gallery === 'alltime' ? 'alltime' : gallery === 'current' ? 'highschool' : 'home'} />
      <div className="ydr-gallery-heading">
        <div><small>{schoolName}</small><h3>{names[gallery]}</h3></div>
        <div className="ydr-toggle" aria-label="Select gallery">
          {(['active','alltime','current'] as const).map(id => <button key={id} className={gallery===id?'selected':''} onClick={()=>setGallery(id)} type="button">{id === 'alltime' ? 'All-Time' : id === 'current' ? 'Current Team' : 'Active'}</button>)}
        </div>
      </div>
      <div className="ydr-row-three">
        <div className="ydr-mini-circle">●</div><div className="ydr-mini-circle">●</div><div className="ydr-mini-circle">●</div><div className="ydr-mini-circle">●</div>
        <span>ROW 3 · ALUMNI / TEAM-YEAR NAVIGATION</span>
      </div>
      {gallery === 'alltime' ? (
        <div className="ydr-alltime-sponsor">
          <div><small>SPONSOR A TEAM · PACKAGE 5</small><strong>TEAM BANNER LOGO</strong></div>
          <div><small>ROW 5 · SAME PACKAGE</small><strong>YaTi MESSAGE / OFFER / CTA</strong></div>
        </div>
      ) : null}
      <div className="ydr-flip-row">
        <FlipCard mode="player" label="REAL ALUMNUS" />
        <FlipCard mode="missing" label="FAN CONTRIBUTION OPPORTUNITY" />
        <FlipCard mode="title" side="front" label="TITLE SPONSOR · FRONT" />
        <FlipCard mode="title" side="back" label="TITLE SPONSOR · BACK" />
      </div>
      <div className="ydr-note-panel">
        <strong>Title Sponsor inventory</strong>
        <p>One branded front-and-back flip-card unit appears in each of the three separate galleries. Measure impressions and flips in each location; do not assume every visit exposes every card.</p>
        <a href={prefix + '#sec-' + (gallery === 'alltime' ? 'alltime' : gallery === 'current' ? 'current' : 'active')}>COMPARE EXISTING GALLERY ↗</a>
      </div>
    </div>
  );
}

function ScreenNews({ schoolName, prefix }: { schoolName: string; prefix: string }) {
  return (
    <div className="ydr-wire-page">
      <TopNav active="news" />
      <div className="ydr-page-head"><small>{schoolName}</small><h3>ACTIVE ALUMNI NEWS</h3><p>All school alumni on load · filter only after a Row 3 selection.</p></div>
      <div className="ydr-row-three ydr-filter-rail">
        <div className="ydr-mini-circle">●</div><div className="ydr-mini-circle">●</div><div className="ydr-mini-circle">●</div>
        <span>SELECT A PLAYER TO FILTER HEADLINES</span>
      </div>
      <div className="ydr-media-two">
        <div className="ydr-news-rows">
          <div className="ydr-feed-title">NEWS FEED <span>UNFILTERED DEFAULT</span></div>
          {NEWS_PLACEHOLDERS.map((_,i)=><WireStory key={i} index={i+1}/>)}
          <AdRow name="TITLE SPONSOR · NEWS" note="Appears as a row when stacked on mobile" />
        </div>
        <ResponsiveAd name="TITLE SPONSOR · NEWS" note="Right-side desktop tower" />
      </div>
      <div className="ydr-note-panel"><strong>Reuse the player-profile News format.</strong><p>One consistent horizontal headline-row component. The player profile starts filtered by player; this school news page does not. Row 3 triggers the optional player filter.</p><a href={prefix+'#sec-news'}>COMPARE EXISTING NEWS ↗</a></div>
    </div>
  );
}

function ProfileContent({ retired, tab }: { retired: boolean; tab: 'now' | 'news' | 'connect' | 'stories' }) {
  if (tab === 'now') return (
    <div className="ydr-profile-contents">
      <SectionHeading eyebrow="RETIRED ALUMNI" title="Where They YAT NOW?">
        Responses to an alumni questionnaire replace the retired player's Game Log / Schedule area.
      </SectionHeading>
      <div className="ydr-where-now">
        {['Where I live now', 'Life and career after playing', 'Family and community', 'Baseball memories', 'What I am doing next'].map(label =>
          <PlaceholderCard key={label} label={label} note="Questionnaire answer / optional player-submitted update" />)}
      </div>
      <div className="ydr-wire-button">SUBMIT / UPDATE MY WHEREABOUTS →</div>
    </div>
  );
  if(tab === 'connect') return (
    <div className="ydr-profile-contents">
      <SectionHeading eyebrow="CONNECT TAB" title="A personal message to the fans">
        Active and retired players can record their own invitation to paid video-message exchanges.
      </SectionHeading>
      <div className="ydr-video-demo"><span>▶</span><strong>PLAYER'S PERSONAL VIDEO INVITATION</strong><small>PLACEHOLDER · NO VIDEO CONNECTED</small></div>
      <div className="ydr-wire-button">REQUEST A VIDEO EXCHANGE →</div>
    </div>
  );
  if(tab === 'stories') return (
    <div className="ydr-profile-contents">
      <SectionHeading eyebrow="STORIES TAB" title="Career Path Timeline">
        Career photos, playing memories and fan contributions placed chronologically.
      </SectionHeading>
      <div className="ydr-timeline">
        <div className="ydr-timeline-step"><small>HIGH SCHOOL</small><div>REAL SEASON IMAGE / MEMORY</div></div>
        <div className="ydr-timeline-step"><small>COLLEGE</small><div>CAREER BUST OR ACTION IMAGE</div></div>
        <div className="ydr-timeline-step"><small>PRO / LATER LIFE</small><div>FAN STORY OR TIMELINE PHOTO</div></div>
      </div>
      <div className="ydr-wire-button">SHARE A PHOTO OR MEMORY →</div>
    </div>
  );
  return (
    <div className="ydr-profile-contents">
      <SectionHeading eyebrow={retired ? 'ARCHIVED NEWS' : 'PLAYER NEWS'} title={retired ? 'Playing-career news archive' : 'Latest player news'}>
        {retired ? 'Stories and milestones from this player’s years on the field.' : 'The same news-row component, prefiltered to this player.'}
      </SectionHeading>
      {[1,2,3].map(i=><WireStory key={i} index={i} archived={retired}/>)}
    </div>
  );
}

function ScreenProfile({ retired, tab, setTab, schoolName, prefix }: {
  retired: boolean; tab: 'now' | 'news' | 'connect' | 'stories';
  setTab:(tab:'now'|'news'|'connect'|'stories')=>void; schoolName:string; prefix:string;
}) {
  const tabs: {id:'now'|'news'|'connect'|'stories';label:string}[] = retired
    ? [{id:'now',label:'Where They YAT NOW?'},{id:'news',label:'Archived News'},{id:'connect',label:'Connect'},{id:'stories',label:'Stories'}]
    : [{id:'now',label:'Game Log / Schedule'},{id:'news',label:'News'},{id:'connect',label:'Connect'},{id:'stories',label:'Stories'}];
  return (
    <div className="ydr-wire-page">
      <TopNav active="home"/>
      <div className="ydr-profile-name"><div className="ydr-profile-avatar">PLAYER<br/>IMAGE</div><div>
        <small>{schoolName} · {retired ? 'RETIRED NEXT-LEVEL ALUMNUS' : 'ACTIVE NEXT-LEVEL ALUMNUS'}</small>
        <h3>PLAYER PROFILE</h3><span>{retired ? 'Historical stats + life after baseball' : 'Current season + career timeline'}</span>
      </div></div>
      <div className="ydr-profile-tabs ydr-sticky-tabs" role="tablist" aria-label="Profile wireframe tab">
        {tabs.map(x=><button key={x.id} role="tab" type="button" className={tab===x.id?'selected':''}
          aria-selected={tab===x.id} onClick={()=>setTab(x.id)}>{x.label}</button>)}
      </div>
      <div className="ydr-media-two">
        {tab === 'now' && !retired ? (
          <div className="ydr-profile-contents">
            <SectionHeading eyebrow="ACTIVE PLAYER" title="Current schedule & game log">
              This retains the live schedule and statistical game lines.
            </SectionHeading>
            <PlaceholderCard label="SCHEDULE / GAME LOG" note="Existing game log rows, standings, game outcomes" className="ydr-schedule-demo" />
          </div>
        ) : <ProfileContent retired={retired} tab={tab} />}
        {(tab==='news'||tab==='connect'||tab==='stories') ? <ResponsiveAd name={(retired?'RETIRED':'ACTIVE')+' PROFILE PARTNER'} note="Same package across News, Connect & Stories" /> : <div className="ydr-context-note">No partner tower included in this package's inventory for the {retired?'Where They YAT NOW?':'Game Log'} tab.</div>}
      </div>
      <div className="ydr-note-panel"><strong>{retired?'Discounted former Next Level alumni profile package':'Active player profile package'}</strong>
        <p>The tower occupies the right of News, Connect and Stories on desktop. The same placement becomes a horizontal ad row on mobile. Retired profile News shows archived playing-career stories.</p>
        {!retired && schoolName.toUpperCase().includes('HAMILTON') ? <a href={prefix+'/player/180827/cody-bellinger#ppTab-news'}>COMPARE EXISTING PLAYER PROFILE ↗</a> : null}
      </div>
    </div>
  );
}

function ContributionExample({ id }: { id: ContributionId }) {
  if (id === 'hs-photo') return <div className="ydr-flip-row ydr-contribute-card-row"><FlipCard mode="player" label="PHOTO PRESENT"/><FlipCard mode="missing" label="PHOTO NEEDED"/></div>;
  if (id === 'current-headshot') return <div className="ydr-headshots-preview"><div>HEADSHOT</div><div>HEADSHOT</div><div className="ydr-empty-headshot">SILHOUETTE<br />PHOTO NEEDED</div></div>;
  if (id === 'current-action') return <PlaceholderCard label="BACK OF FLIP CARD" note="Wide current-season action-photo position" className="ydr-action-slot"/>;
  if (id === 'career-photo') return <div className="ydr-timeline"><div className="ydr-timeline-step"><small>PAST SEASON</small><div>CAREER BUST IMAGE</div></div><div className="ydr-timeline-step"><small>ANOTHER SEASON</small><div>ACTION PHOTO</div></div></div>;
  if (id === 'team-crest') return <div className="ydr-crest-preview"><div>HS<br />CREST</div><div>CURRENT<br />TEAM LOGO</div></div>;
  if (id === 'news-tip') return <div className="ydr-input-preview"><strong>NEWS ARTICLE LINK</strong><div>https://news-site.example/story</div><span>PLAYER · REASON · SOURCE</span></div>;
  return <div className="ydr-input-preview"><strong>PLAYER INFORMATION UPDATE</strong><div>Player · School · Corrected detail</div><span>Verification and review before publishing</span></div>;
}

function ScreenContribute({ tab, setTab, choice, setChoice }: {
  tab:'contribute'|'connect';setTab:(tab:'contribute'|'connect')=>void;
  choice:ContributionId;setChoice:(id:ContributionId)=>void;
}) {
  const current=CONTRIBUTIONS.find(x=>x.id===choice)||CONTRIBUTIONS[0];
  return (
    <div className="ydr-wire-page">
      <TopNav active="contribute"/>
      <div className="ydr-page-head"><small>COMMUNITY DESK</small><h3>CONNECT & CONTRIBUTE</h3><p>Connect. Contribute. Reminisce.</p></div>
      <div className="ydr-content-split">
        <div className="ydr-contribute-list">
          <div className="ydr-tab-strip ydr-sticky-tabs" role="tablist">
            <button className={tab==='contribute'?'selected':''} aria-selected={tab==='contribute'} role="tab" onClick={()=>setTab('contribute')} type="button">CONTRIBUTE</button>
            <button className={tab==='connect'?'selected':''} aria-selected={tab==='connect'} role="tab" onClick={()=>setTab('connect')} type="button">CONNECT</button>
          </div>
          {tab==='connect'?(
            <div className="ydr-connect-column">
              <div className="ydr-video-demo"><span>▶</span><strong>PLAYER ↔ FAN VIDEO EXCHANGE</strong><small>PLACEHOLDER VIDEO</small></div>
              <h4>Watch. Connect. Share a memory.</h4>
              <p>One Connect program for active and retired alumni. Fans can request a paid video message from a player.</p>
              <div className="ydr-wire-button">OPEN VIDEO TRANSACTION DRAWER →</div>
            </div>
          ):(
            <div className="ydr-contribution-choices">
              {CONTRIBUTIONS.map(x=><div key={x.id} className={'ydr-choice'+(x.id===choice?' is-chosen':'')}>
                <div className="ydr-choice-image"><span>{x.name.substring(0,2).toUpperCase()}</span></div>
                <div><small>{x.tag}</small><strong>{x.name}</strong><span>{x.detail}</span>
                  <button onClick={()=>setChoice(x.id)} type="button">SEE PLACEMENT →</button></div>
              </div>)}
            </div>
          )}
        </div>
        <aside className="ydr-placement-viewer">
          {tab==='connect' ? (
            <>
              <small>HOW THE EXCHANGE WORKS</small><h4>Fan-to-player video messages</h4>
              <div className="ydr-video-flow"><div>1. WATCH PLAYER INVITATION</div><div>2. SELECT PLAYER + REQUEST</div><div>3. REVIEW PAYMENT / SUBMISSION</div><div>4. VIDEO RESPONSE DELIVERY</div></div>
              <p>The video payment, upload and messaging transaction will open in a right-side drawer with backdrop and a close X. This is a wireframe, not a checkout.</p>
            </>
          ) : (
            <>
              <small>WHERE THIS CONTRIBUTION APPEARS</small><h4>{current.name}</h4>
              <ContributionExample id={current.id} />
              <p>{current.detail}</p>
              <div className="ydr-wire-button">OPEN CONTRIBUTION DRAWER →</div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function PackagePreview({ item }: { item: PartnerPackage }) {
  if(item.id==='title')return(
    <div className="ydr-partner-examples">
      <PlaceholderCard label="SPLASH PAGE RECOGNITION" note="School first-contact branding"/>
      <div className="ydr-partner-card-pair"><FlipCard mode="title" side="front"/><FlipCard mode="title" side="back"/></div>
      <AdRow name="ACTIVE ALUMNI NEWS" note="News-row version of the desktop tower" />
      <PlaceholderCard label="FAN CORRESPONDENCE BRANDING" note="Favorites, announcements, school updates"/>
    </div>
  );
  if(item.id==='active-profile'||item.id==='retired-profile')return(
    <div className="ydr-partner-examples">
      <div className="ydr-three-tabs"><span>NEWS</span><span>CONNECT</span><span>STORIES</span></div>
      <div className="ydr-content-split ydr-mini-profile">
        <PlaceholderCard label="PLAYER FUNZONE CONTENT" note="Current headlines or archives; video; Career Path"/>
        <AdTower name={item.id==='active-profile'?'ACTIVE PROFILE PARTNER':'RETIRED PROFILE PARTNER'}/>
      </div>
      <AdRow name="MOBILE PROFILE ROW" note="Same creative becomes a horizontal unit"/>
    </div>
  );
  if(item.id==='bracket')return(
    <div className="ydr-partner-examples">
      <div className="ydr-bracket-preview">
        <div><span>STATS DRAWERS CLOSED</span><PlaceholderCard label="BRACKET PARTNER SPACE" note="Visible only while drawers closed"/></div>
        <div><span>SCOREBOARD ANCHORED RIGHT</span><PlaceholderCard label="LIVE TOURNAMENT BOARD"/></div>
      </div>
    </div>
  );
  return(
    <div className="ydr-partner-examples">
      <PlaceholderCard label="ALL-TIME TEAM BANNER" note="Sponsor brand, logo and team-year context"/>
      <div className="ydr-yati-offer"><div>YaTi</div><strong>ROW 5 · OFFER / SPECIAL</strong><small>Same partner package. CTA links to partner offer.</small></div>
    </div>
  );
}

function ScreenPartner({ item, setItem }: { item:PackageId; setItem:(item:PackageId)=>void }) {
  const selected=PACKAGES.find(x=>x.id===item)||PACKAGES[0];
  return(
    <div className="ydr-wire-page">
      <TopNav active="partner"/>
      <div className="ydr-page-head"><small>PARTNERSHIP PROGRAM</small><h3>HOMETOWN PARTNERS. LASTING RECOGNITION.</h3><p>Five packages. Inventory is defined; prices are intentionally blank until audience and conversion evidence is measured.</p></div>
      <div className="ydr-partner-picker">
        <div className="ydr-partner-menu" aria-label="Partner package choices">
          {PACKAGES.map((pkg,i)=><button type="button" key={pkg.id} className={item===pkg.id?'selected':''} onClick={()=>setItem(pkg.id)}>
            <small>PACKAGE {i+1}</small><strong>{pkg.name}</strong><span>PRICE —</span></button>)}
        </div>
        <div className="ydr-partner-details">
          <span>PLACEMENT PREVIEW · {selected.name.toUpperCase()}</span>
          <h4>{selected.name}</h4><p>{selected.descriptor}</p>
          <PackagePreview item={selected}/>
          <div className="ydr-sponsor-slots">
            <strong>Included inventory</strong>
            <ul>{selected.inventory.map((x,i)=><li key={i}>{x}</li>)}</ul>
          </div>
        </div>
      </div>
      <div id="rate-card" className="ydr-rate-section">
        <SectionHeading eyebrow="DRAFT RATE CARD" title="Package inventory and measurement inputs">
          Prices deliberately blank. Scope, delivery and responsive placement details come first.
        </SectionHeading>
        <div className="ydr-table-scroller">
          <table className="ydr-rate-table"><thead><tr><th>Package</th><th>Desktop inventory</th><th>Mobile conversion</th><th>Performance evidence to collect</th><th>Rate</th></tr></thead>
            <tbody>{PACKAGES.map(pkg=><tr key={pkg.id}>
              <th>{pkg.name}</th><td>{pkg.desktop}</td><td>{pkg.mobile}</td><td>{pkg.metrics}</td><td className="ydr-price-empty">________</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="ydr-pricing-method">
          <div>
            <h4>Traffic and touchpoints</h4>
            <p>Track page sessions, unique visitors, eligible unit views, true viewable impressions and average repeat exposures. Do not count every available unit as viewed.</p>
            <strong>Views × viewability × share-of-voice = estimated delivered inventory</strong>
          </div>
          <div>
            <h4>Response and commercial impact</h4>
            <p>Measure partner clicks, qualified inquiry rate and sponsor-reported value per lead. Separate contact activity from verified sales.</p>
            <strong>Clicks × qualified conversion × value per result = response-value estimate</strong>
          </div>
          <div>
            <h4>Brand association and local reach</h4>
            <p>Evaluate school alignment, category scarcity, fan-correspondence exposure, geographic exclusivity only if agreed, and repeat community reach.</p>
            <strong>Use premiums only after scope, fulfillment and attribution are confirmed.</strong>
          </div>
          <div>
            <h4>Rate-setting guardrails</h4>
            <p>Compare delivered media value using relevant local ad CPMs, then account for creative/servicing costs and documented sponsor outcomes. Build conservative, base and upside scenarios using observed traffic, not assumed network reach.</p>
            <strong>Benchmark media value = viewable impressions ÷ 1,000 × comparable CPM.</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenBracket({ mode, setMode }: {
  mode:'both'|'one'|'closed';setMode:(mode:'both'|'one'|'closed')=>void;
}) {
  return(
    <div className="ydr-wire-page">
      <TopNav active="bracket"/>
      <div className="ydr-page-head"><small>REAL ALUMNI STATS · SCHOOL VS SCHOOL</small><h3>ALUMNI FANTASY BRACKET</h3><p>Statistics from college and professional alumni power the high school fantasy matchup.</p></div>
      <div className="ydr-toggle ydr-bracket-options" aria-label="Toggle statistical drawer arrangement">
        <button type="button" className={mode==='both'?'selected':''} onClick={()=>setMode('both')}>BOTH STAT PANELS OPEN</button>
        <button type="button" className={mode==='one'?'selected':''} onClick={()=>setMode('one')}>ONE PANEL OPEN</button>
        <button type="button" className={mode==='closed'?'selected':''} onClick={()=>setMode('closed')}>PANELS CLOSED</button>
      </div>
      <div className={'ydr-bracket-stage ydr-bracket-'+mode}>
        {mode==='both' ? <div className="ydr-bracket-stats">
          <PlaceholderCard label="AWAY TEAM DAILY STATS" note="Leftmost statistical drawer"/>
          <PlaceholderCard label="HOME TEAM DAILY STATS" note="Second statistical drawer"/>
        </div> : mode==='one' ? <div className="ydr-bracket-stats"><PlaceholderCard label="ONE STAT PANEL" note="Daily-stat controls switch between teams"/></div> :
          <div className="ydr-bracket-sponsor"><span>SPONSOR INVENTORY VISIBLE</span><AdTower name="BRACKET PARTNER" note="This space appears when stat panels are closed"/></div>}
        <div className="ydr-scoreboard">
          <span>RIGHT-ANCHORED SCOREBOARD</span><strong>HIGH SCHOOL ALUMNI FANTASY</strong>
          <div className="ydr-matchup"><div>VISITING<br/>HIGH SCHOOL</div><b>VS</b><div>HOME<br/>HIGH SCHOOL</div></div>
          <div className="ydr-score-innings"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div>
          <small>LIVE STATISTICAL RESULTS · NO SIMULATED SCORES</small>
        </div>
      </div>
      <div className="ydr-note-panel"><strong>Viewable inventory, not assumed inventory.</strong><p>When a stats drawer occupies sponsor space, that ad unit is not counted as visible. Wide screens allow two stat panels on the left. Narrower screens show one at a time. Mobile sponsor position requires final UI testing.</p></div>
    </div>
  );
}

function ScreenCommunications({ schoolName }: { schoolName:string }) {
  return (
    <div className="ydr-wire-page">
      <TopNav active="home"/>
      <div className="ydr-page-head"><small>TITLE SPONSOR · SCHOOL TO FANS</small><h3>RECOGNITION IN COMMUNITY UPDATES</h3><p>Sponsor branding accompanies eligible school-to-fan correspondence, not just on-site ads.</p></div>
      <div className="ydr-comms-grid">
        <div className="ydr-email-preview"><span>EMAIL · FAVORITE-PLAYER UPDATE</span><div className="ydr-email-head"><strong>{schoolName}</strong><small>YAT?STATS school community</small></div>
          <div className="ydr-email-body"><h4>Your favorite alumnus has an update</h4><p>Player update, announcement or news headline. Personalization and frequency are examples only.</p><div className="ydr-wire-button">VIEW THE UPDATE →</div></div>
          <div className="ydr-email-brand"><small>IN PARTNERSHIP WITH</small><strong>TITLE SPONSOR NAME + LOGO</strong></div>
        </div>
        <div className="ydr-sms-preview"><span>SMS · ANNOUNCEMENT</span><div className="ydr-message-bubble">[School] alumni update: [news or favorite-player update].<br/><br/>[Short link]<br/><br/>Presented by [Title Sponsor]</div>
          <small>Subject to messaging consent, available format, policy and deliverability.</small></div>
      </div>
      <div className="ydr-note-panel"><strong>Measurement that matters</strong><p>Count eligible contacts, sent/delivered messages and attributable clicks. Deduplicate school fans across email, SMS and onsite inventory; do not treat raw impressions as unique people.</p></div>
    </div>
  );
}

export default function YatDesignReview({ initialScreen = 'overview' }: { initialScreen?: ReviewScreen }) {
  const school = useContext(SchoolContext);
  const schoolName = school?.hsName || 'Your High School';
  const prefix = '/' + String(school?.hsid || '5004');
  const [screen, setScreen] = useState<ReviewScreen>(initialScreen);
  const [gallery, setGallery] = useState<'active'|'alltime'|'current'>('alltime');
  const [profileTab, setProfileTab] = useState<'now'|'news'|'connect'|'stories'>('news');
  const [contributeTab, setContributeTab] = useState<'contribute'|'connect'>('contribute');
  const [contributionChoice, setContributionChoice] = useState<ContributionId>('hs-photo');
  const [packageChoice, setPackageChoice] = useState<PackageId>('title');
  const [bracketMode, setBracketMode] = useState<'both'|'one'|'closed'>('closed');
  const active = SCREENS.find(s=>s.id===screen)||SCREENS[0];

  function navigate(next:ReviewScreen) {
    setScreen(next);
    if(next==='retired-profile')setProfileTab('now');
    if(next==='active-profile')setProfileTab('news');
    if(typeof window!=='undefined') {
      const u=new URL(window.location.href);
      u.searchParams.set('screen',next);
      window.history.pushState({ytDesignReview:next},'',u.toString());
      document.querySelector('.ydr-intro')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
  }
  useEffect(()=>{
    const onPop=()=>{
      const current=new URLSearchParams(window.location.search).get('screen');
      const found=SCREENS.find(x=>x.id===current);
      setScreen(found?.id||'overview');
    };
    window.addEventListener('popstate',onPop);
    return()=>window.removeEventListener('popstate',onPop);
  },[]);

  return (
    <main className="ydr" id="yat-design-review">
      <div className="ydr-intro">
        <div><small>DESIGN APPROVAL PREVIEW · {schoolName.toUpperCase()}</small>
          <h1>YAT?STATS <span>EXPERIENCE WIREFRAMES</span></h1>
          <p>Stories and Stats! <strong>Connect. Contribute. Reminisce.</strong></p></div>
        <div className="ydr-intro-right"><span>PREVIEW ONLY</span><a href={prefix}>RETURN TO CURRENT SITE ↗</a></div>
      </div>
      <div className="ydr-layout">
        <nav className="ydr-rail" aria-label="Select wireframe page">
          <div className="ydr-rail-heading">PAGE WIREFRAMES</div>
          {SCREENS.map((s,i)=><button key={s.id} className={screen===s.id?'is-active':''}
            type="button" aria-current={screen===s.id?'page':undefined} onClick={()=>navigate(s.id)}>
            <span>{String(i).padStart(2,'0')}</span><div><strong>{s.label}</strong><small>{s.family}</small></div></button>)}
          <div className="ydr-rail-note">Choose a screen to see its proposed layout. Prices stay blank until we have measurement data.</div>
        </nav>
        <div className="ydr-main">
          <div className="ydr-screen-meta"><div><span>PAGE WIREFRAME · {active.family.toUpperCase()}</span><h2>{active.title}</h2><p>{active.about}</p></div>
            <span className="ydr-not-live">NOT LIVE / NOT SOLD</span></div>
          {screen==='overview'&&<ScreenOverview onNavigate={navigate} prefix={prefix}/>}
          {screen==='splash'&&<ScreenSplash schoolName={schoolName}/>}
          {screen==='galleries'&&<ScreenGalleries schoolName={schoolName} gallery={gallery} setGallery={setGallery} prefix={prefix}/>}
          {screen==='news'&&<ScreenNews schoolName={schoolName} prefix={prefix}/>}
          {screen==='active-profile'&&<ScreenProfile retired={false} tab={profileTab} setTab={setProfileTab} schoolName={schoolName} prefix={prefix}/>}
          {screen==='retired-profile'&&<ScreenProfile retired tab={profileTab} setTab={setProfileTab} schoolName={schoolName} prefix={prefix}/>}
          {screen==='contribute'&&<ScreenContribute tab={contributeTab} setTab={setContributeTab} choice={contributionChoice} setChoice={setContributionChoice}/>}
          {screen==='partner'&&<ScreenPartner item={packageChoice} setItem={setPackageChoice}/>}
          {screen==='bracket'&&<ScreenBracket mode={bracketMode} setMode={setBracketMode}/>}
          {screen==='communications'&&<ScreenCommunications schoolName={schoolName}/>}
          <footer className="ydr-footer"><span>WIREFRAME / PLACEMENT PLAN · YAT?STATS</span>
            <a href={prefix}>CURRENT SCHOOL HUB ↗</a></footer>
        </div>
      </div>
    </main>
  );
}
