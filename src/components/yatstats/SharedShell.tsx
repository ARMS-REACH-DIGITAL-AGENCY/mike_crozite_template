// src/components/yatstats/SharedShell.tsx

'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import GlobalTopbar from './shell/GlobalTopbar';
import SchoolContextBar from './shell/SchoolContextBar';
import InteractionStrip from './shell/InteractionStrip';
import MetadataRow from './shell/MetadataRow';
import ClubhouseFooter from './shell/ClubhouseFooter';
import PageMessageStrip from './shell/PageMessageStrip';
import ZoomableCareerTimeline from './ZoomableCareerTimeline';
import TimelineCleanup from './TimelineCleanup';
import GalleryFilterController from './GalleryFilterController';
import Row3MirrorGuard from './Row3MirrorGuard';
import SponsorBanner from './SponsorBanner';
import FantasyTimeline from '../bracket/FantasyTimeline';
import BracketTicker from '../bracket/BracketTicker';

type StripPlayer = {
  id: string;
  name: string;
  image?: string;
  nowImage?: string;
  thenImage?: string;
  fallbackImage?: string;
  imageFit?: 'cover' | 'contain';
  status?: string;
};

type SchoolMeta = {
  activeAlumni: number | null;
  mlb: number | null;
  natRank: number | null;
  stateRank: string | null;
  allTime: number | null;
  draftedRatio: string | null;
  currentRosterSize?: number | null;
  collegeCommits?: number | null;
  overallRecord?: string | null;
  regionRecord?: string | null;
};

const VALID_SECTIONS = new Set([
  'active', 'news', 'alltime', 'current', 'fantasy', 'mentor', 'partner', 'about', 'faq',
]);

const GALLERY_SECTIONS = new Set(['active', 'alltime', 'news', 'current']);
const SECTION_ANCHORS: Record<string, string[]> = {
  partner: ['WHO?', 'WHAT?', 'WHEN?', 'WHERE?', 'WHY?', 'HOW?'],
  about: ['ABOUT', 'OUR MISSION', 'HOW IT WORKS', 'SCHOOLS', 'PLAYERS', 'FANS'],
  faq: ['ABOUT', 'PLAYERS', 'STORIES', 'CONTRIBUTE', 'SUPER FANS', 'FANTASY', 'CONTACT'],
};

function normalizeSection(value: string): string {
  const section = String(value || '').replace(/^#?sec-/, '').trim().toLowerCase();
  return VALID_SECTIONS.has(section) ? section : 'active';
}

function readRequestedSection(): string {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 'active';

  // The Connect & Contribute Portal is its own page (/connect-contribute).
  if (/\/connect-contribute\/?$/.test(window.location.pathname)) return 'mentor';

  const hash = window.location.hash || '';
  if (hash.startsWith('#sec-')) return normalizeSection(hash);

  const visible = document.querySelector<HTMLElement>('.yat-section.visible');
  if (visible?.id?.startsWith('sec-')) return normalizeSection(visible.id);

  return 'active';
}

function applyVisibleSection(section: string) {
  document.querySelectorAll<HTMLElement>('.yat-section').forEach((candidate) => {
    candidate.classList.toggle('visible', candidate.id === `sec-${section}`);
  });
}

export default function SharedShell({
  children,
  hsid,
  players = [],
  schoolMeta,
  row3Content,
  row4Content,
}: {
  children: ReactNode;
  hsid: string;
  players?: StripPlayer[];
  schoolMeta: SchoolMeta;
  row3Content?: ReactNode;
  row4Content?: ReactNode;
}) {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState('active');
  const playerRouteMatch = pathname.match(/\/player\/([^/]+)(?:\/|$)/);
  const profilePlayerId = playerRouteMatch ? playerRouteMatch[1] : null;
  const isPlayerProfile = pathname.includes('/player/') || pathname.includes('/profile/');
  const isNews = activeSection === 'news';
  const isGallery = !isPlayerProfile && GALLERY_SECTIONS.has(activeSection);

  useEffect(() => {
    if (isPlayerProfile) return;

    let frame = 0;
    const syncSection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const requestedSection = readRequestedSection();
        applyVisibleSection(requestedSection);
        setActiveSection(requestedSection);
        // The section is applied: drop the first-paint mark set in
        // app/layout.tsx (after React has rendered rows 3-4 for it).
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            document.documentElement.removeAttribute('data-yat-sec');
          });
        });
      });
    };

    syncSection();
    window.addEventListener('hashchange', syncSection);
    window.addEventListener('popstate', syncSection);
    window.addEventListener('yat:section-changed', syncSection);

    const observer = new MutationObserver(syncSection);
    document.querySelectorAll('.yat-section').forEach((section) => {
      observer.observe(section, { attributes: true, attributeFilter: ['class'] });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', syncSection);
      window.removeEventListener('popstate', syncSection);
      window.removeEventListener('yat:section-changed', syncSection);
      observer.disconnect();
    };
  }, [isPlayerProfile]);

  return (
    <>
      <TimelineCleanup />
      {!isPlayerProfile && <GalleryFilterController />}
      {!isPlayerProfile && <Row3MirrorGuard />}

      <div className={`yat-row1-shell${isPlayerProfile ? ' pp-hero-row' : ''}`}>
        <GlobalTopbar hsid={hsid} />
      </div>

      <div className={`yat-row2-shell${isPlayerProfile ? ' pp-hero-row' : ''}`}>
        <SchoolContextBar
          isPlayerProfile={isPlayerProfile}
          isGallery={isGallery}
          isNews={isNews}
          activeSection={activeSection}
        />
      </div>

      <main>
        <div className="yat-row3-shell">
          {row3Content
            ? row3Content
            : activeSection === 'fantasy' && !isPlayerProfile
              // The Fantasy Bracket Tourney tab: the school's season, a
              // slide per week, where a profile has its Career Path Timeline.
              ? <FantasyTimeline />
              : SECTION_ANCHORS[activeSection] && !isPlayerProfile
              ? <nav className="yat-section-anchor-strip" aria-label={activeSection === 'faq' ? 'FAQ topics' : activeSection === 'partner' ? 'Partnership questions' : 'About sections'}>
                  {SECTION_ANCHORS[activeSection].map((label, i) => <button type="button" key={label} onClick={() => {
                    const section = document.getElementById(`sec-${activeSection}`);
                    const headings = Array.from(section?.querySelectorAll<HTMLElement>('h2,h3') || []);
                    const normalized = label.replace(/[?]/g, '').toLowerCase();
                    const match = headings.find(h => h.textContent?.toLowerCase().includes(normalized)) || headings[i];
                    match?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}>{label}</button>)}
                </nav>
              : profilePlayerId
              ? (
                  <div className="yat-profile-career-strip" style={{ display: 'block', width: '100%' }} aria-label="Golden Line event images">
                    <ZoomableCareerTimeline playerId={profilePlayerId} variant="images" />
                  </div>
                )
              : (
                  <InteractionStrip
                    isPlayerProfile={isPlayerProfile}
                    isGallery={isGallery}
                    isNews={isNews}
                    players={players}
                  />
                )}
        </div>

        {/* The former Row 5 gallery is now visual Row 4. Keep legacy class for existing gallery styling. */}
        <div className="yat-row5-shell yat-visual-row4-gallery">{children}</div>
      </main>

      {!isPlayerProfile && <footer className={`yat-row6-shell yat-footer yat-clubhouse-footer`}>
        <div className="yat-unified-footer">
          <div className="yat-unified-footer-art" aria-hidden="true" />
          <PageMessageStrip hsid={hsid} pageKey={activeSection} activeAlumni={schoolMeta.activeAlumni} />
          <div className="yat-unified-footer-ticker">
            {activeSection === 'fantasy'
              ? <BracketTicker hsid={hsid} />
              : <ClubhouseFooter activeAlumni={schoolMeta.activeAlumni} />}
          </div>
        </div>
        <style jsx global>{`
          .yat-section-anchor-strip{height:84px;display:flex;align-items:center;gap:12px;overflow-x:auto;padding:8px 24px;scrollbar-width:thin;background:var(--bg,#111)}
          .yat-section-anchor-strip button{flex:0 0 auto;min-width:68px;height:60px;padding:8px 12px;border:1px solid #777;border-radius:32px;background:transparent;color:var(--fg,#fff);font:700 12px Oswald,Arial,sans-serif;cursor:pointer}
          .yat-section-anchor-strip button:hover,.yat-section-anchor-strip button:focus-visible{border-color:#e7b738;color:#e7b738}
          .yat-unified-footer{width:100%;height:100%;display:flex;flex-direction:column;min-height:0;position:relative;isolation:isolate;overflow:visible}
          .yat-unified-footer-art{position:absolute;z-index:8;pointer-events:none;bottom:0;left:0;width:clamp(64px,10vw,110px);height:calc(100% + 12px);background-image:var(--yat-footer-campaign-image,url("https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/YaTi.png"));background-position:left bottom;background-repeat:no-repeat;background-size:contain;filter:drop-shadow(0 1px 2px #0005)}
          @media(max-width:640px){.yat-unified-footer-art{width:clamp(55px,12vw,76px);height:calc(100% + 12px)}}
          .yat-unified-footer-ticker{flex:1;min-height:0;width:100%;position:relative}
          .yat-unified-footer-ticker .yat-clubhouse,.yat-unified-footer-ticker .ybt-footer-stack{height:100%;width:100%}
          .yat-unified-footer-ticker .yat-clubhouse-nav{height:100%}
        `}</style>
      </footer>}
    </>
  );
}
