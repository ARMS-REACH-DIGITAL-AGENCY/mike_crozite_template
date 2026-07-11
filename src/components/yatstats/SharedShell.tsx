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

function readVisibleSection(): string {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 'active';

  const visible = document.querySelector<HTMLElement>('.yat-section.visible');
  if (visible?.id?.startsWith('sec-')) return visible.id.replace(/^sec-/, '') || 'active';

  const hash = window.location.hash || '';
  if (hash.startsWith('#sec-')) return hash.replace(/^#sec-/, '') || 'active';

  return 'active';
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
  const isGallery = !isPlayerProfile;

  useEffect(() => {
    if (isPlayerProfile) return;

    let frame = 0;
    const syncSection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setActiveSection(readVisibleSection());
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

      <div className="yat-row1-shell">
        <GlobalTopbar hsid={hsid} />
      </div>

      <div className="yat-row2-shell">
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

        <div className="yat-row4-shell">
          {row4Content
            ? row4Content
            : profilePlayerId
            ? <ZoomableCareerTimeline playerId={profilePlayerId} variant="line" />
            : (
                <MetadataRow
                  isPlayerProfile={isPlayerProfile}
                  isGallery={isGallery}
                  schoolMeta={schoolMeta}
                />
              )}
        </div>

        <div className="yat-row5-shell">
          {children}
        </div>
      </main>

      <footer className="yat-row6-shell yat-footer">
        <a
          href="https://tpc-git-main-arms-reach-digital-agency.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="sponsor-name">ACTIVATE A $75 SHIP STICKS VOUCHER</span>
          <span className="sponsor-text">COMPLEMENTS OF THE TRAVEL PROTECTION CLUB</span>
        </a>
      </footer>
    </>
  );
}
