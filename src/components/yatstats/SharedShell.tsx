// src/components/yatstats/SharedShell.tsx

'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import GlobalTopbar from './shell/GlobalTopbar';
import SchoolContextBar from './shell/SchoolContextBar';
import InteractionStrip from './shell/InteractionStrip';
import MetadataRow from './shell/MetadataRow';
import CareerStrip from './CareerStrip';

type StripPlayer = {
  id: string;
  name: string;
  image?: string;
};

type SchoolMeta = {
  activeAlumni: number | null;
  mlb: number | null;
  natRank: number | null;
  stateRank: string | null;
  allTime: number | null;
  draftedRatio: string | null;
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

  // Extract playerId directly from the pathname — no middleware or context needed.
  // Pattern: /{hsid}/player/{playerId}/{slug}
  const playerRouteMatch = pathname.match(/\/player\/([^/]+)(?:\/|$)/);
  const profilePlayerId = playerRouteMatch ? playerRouteMatch[1] : null;

  const isPlayerProfile =
    pathname.includes('/player/') || pathname.includes('/profile/');
  const isNews = pathname.includes('/news');
  const isGallery = !isPlayerProfile && !isNews;

  return (
    <>
      {/* ROW 1 */}
      <div className="yat-row1-shell">
        <GlobalTopbar />
      </div>

      {/* ROW 2 */}
      <div className="yat-row2-shell">
        <SchoolContextBar
          isPlayerProfile={isPlayerProfile}
          isGallery={isGallery}
          isNews={isNews}
        />
      </div>

      <main>
        {/* ROW 3 — career/gallery strip */}
        <div className="yat-row3-shell">
          {row3Content
            ? row3Content
            : profilePlayerId
            ? <CareerStrip playerId={profilePlayerId} />
            : (
                <InteractionStrip
                  isPlayerProfile={isPlayerProfile}
                  isGallery={isGallery}
                  isNews={isNews}
                  players={players}
                />
              )}
        </div>

        {/* ROW 4 — metadata chips */}
        <div className="yat-row4-shell">
          {row4Content ? row4Content : (
            <MetadataRow
              isPlayerProfile={isPlayerProfile}
              isGallery={isGallery}
              schoolMeta={schoolMeta}
            />
          )}
        </div>

        {/* ROW 5 — page body (FunZone on profile pages) */}
        <div className="yat-row5-shell">
          {children}
        </div>
      </main>

      {/* ROW 6 */}
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
