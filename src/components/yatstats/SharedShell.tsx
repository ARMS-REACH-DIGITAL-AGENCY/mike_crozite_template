// src/components/yatstats/SharedShell.tsx

'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import GlobalTopbar from './shell/GlobalTopbar';
import SchoolContextBar from './shell/SchoolContextBar';
import InteractionStrip from './shell/InteractionStrip';
import MetadataRow from './shell/MetadataRow';

type StripPlayer = {
  id: string;
  name: string;
  image?: string;
};

type SchoolMeta = {
  activeAlumni: number | null;
  mlb: number | null;
  natRank: number | null;
  stateRank: number | null;
  allTime: number | null;
  draftedRatio: string | null;
};

export default function SharedShell({
  children,
  hsid,
  players = [],
  schoolMeta,
}: {
  children: ReactNode;
  hsid: string;
  players?: StripPlayer[];
  schoolMeta: SchoolMeta;
}) {
  const pathname = usePathname();

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
        {/* ROW 3 */}
        <div className="yat-row3-shell">
          <InteractionStrip
            isPlayerProfile={isPlayerProfile}
            isGallery={isGallery}
            isNews={isNews}
            players={players}
          />
        </div>

        {/* ROW 4 */}
        <div className="yat-row4-shell">
          <MetadataRow
            isPlayerProfile={isPlayerProfile}
            isGallery={isGallery}
            schoolMeta={schoolMeta}
          />
        </div>

        {/* ROW 5 */}
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
