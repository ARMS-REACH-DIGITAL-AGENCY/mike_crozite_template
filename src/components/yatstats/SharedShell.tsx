// src/components/yatstats/SharedShell.tsx

'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import GlobalTopbar from './shell/GlobalTopbar';
import SchoolContextBar from './shell/SchoolContextBar';
import InteractionStrip from './shell/InteractionStrip';
import MetadataRow from './shell/MetadataRow';
import ZoomableCareerTimeline from './ZoomableCareerTimeline';

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

  const playerRouteMatch = pathname.match(/\/player\/([^/]+)(?:\/|$)/);
  const profilePlayerId = playerRouteMatch ? playerRouteMatch[1] : null;

  const isPlayerProfile =
    pathname.includes('/player/') || pathname.includes('/profile/');
  const [isNews, setIsNews] = (typeof window !== 'undefined') 
    ? [window.location.hash === '#sec-news', () => {}] 
    : [false, () => {}];
  const isGallery = !isPlayerProfile;

  return (
    <>
      <div className="yat-row1-shell">
        <GlobalTopbar hsid={hsid} />
      </div>

      <div className="yat-row2-shell">
        <SchoolContextBar
          isPlayerProfile={isPlayerProfile}
          isGallery={isGallery}
          isNews={isNews}
        />
      </div>

      <main>
        <div className="yat-row3-shell">
          {row3Content
            ? row3Content
            : profilePlayerId
            ? <div className="yat-profile-meta-row-host" aria-label="Player profile metadata" />
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
            ? <ZoomableCareerTimeline playerId={profilePlayerId} />
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
          href="https://www.armsreachdigital.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="sponsor-text">Powered By</span>
          <span className="sponsor-name">ARMS REACH</span>
        </a>
      </footer>
    </>
  );
}
