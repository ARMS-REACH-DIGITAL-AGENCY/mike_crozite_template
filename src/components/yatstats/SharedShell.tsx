// src/components/yatstats/SharedShell.tsx

'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import GlobalTopbar from './shell/GlobalTopbar';
import SchoolContextBar from './shell/SchoolContextBar';
import InteractionStrip from './shell/InteractionStrip';
import MetadataRow from './shell/MetadataRow';
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

    const observer = new MutationObserver(syncSection);
    document.querySelectorAll('.yat-section').forEach((section) => {
      observer.observe(section, { attributes: true, attributeFilter: ['class'] });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', syncSection);
      window.removeEventListener('popstate', syncSection);
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

        <div className={`yat-row4-shell${activeSection === 'fantasy' && !isPlayerProfile && !row4Content ? ' yat-row4-off' : ''}`}>
          {row4Content
            ? row4Content
            : activeSection === 'fantasy' && !isPlayerProfile
              // The Fantasy Bracket Tourney tab has no row 4: row 3's
              // timeline picks the round, the scores ticker is in row 6,
              // and row 5 gets the height.
              ? null
              : profilePlayerId
              // The player profile's thin year-tick timeline (the old
              // variant="line" row) is now folded into the taller
              // variant="images" strip in row 3 above -- one row instead of
              // two, per ZoomableCareerTimeline.tsx's own row3/row4 height
              // override. Rendering nothing here (rather than a second,
              // now-redundant ZoomableCareerTimeline instance) also drops a
              // duplicate season-stats/uploads fetch this page no longer needs.
              ? null
              : (
                  <MetadataRow
                    isPlayerProfile={isPlayerProfile}
                    isGallery={isGallery}
                    schoolMeta={schoolMeta}
                  />
                )}
        </div>

        <div className="yat-row5-shell">{children}</div>
      </main>

      <footer className="yat-row6-shell yat-footer">
        {activeSection === 'fantasy' && !isPlayerProfile
          // The bracket tab: the scores ticker, with the sponsor ads in it.
          ? <BracketTicker hsid={hsid} />
          : <SponsorBanner hsid={hsid} />}
      </footer>
    </>
  );
}
