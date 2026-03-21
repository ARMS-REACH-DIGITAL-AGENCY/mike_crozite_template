// src/components/yatstats/SharedShell.tsx

'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

// Import sub-components for each row
import GlobalTopbar from './shell/GlobalTopbar';
import SchoolContextBar from './shell/SchoolContextBar';
import InteractionStrip from './shell/InteractionStrip';
import MetadataRow from './shell/MetadataRow';

type StripPlayer = {
  id: string;
  name: string;
  image?: string;
};

export default function SharedShell({
  children,
  hsid,
  players = [],
}: {
  children: ReactNode;
  hsid: string;
  players?: StripPlayer[];
}) {
  const pathname = usePathname();

  // Treat BOTH /player/ and /profile/ as player profile pages
  const isPlayerProfile =
    pathname.includes('/player/') || pathname.includes('/profile/');
  const isNews = pathname.includes('/news');
  const isGallery = !isPlayerProfile && !isNews;

  return (
    <>
      <header id="site-header" className="yat-header">
        <GlobalTopbar />
        <SchoolContextBar
          isPlayerProfile={isPlayerProfile}
          isGallery={isGallery}
          isNews={isNews}
        />
      </header>

      <main>
        <InteractionStrip
          isPlayerProfile={isPlayerProfile}
          isGallery={isGallery}
          isNews={isNews}
          players={players}
        />
        <MetadataRow
          isPlayerProfile={isPlayerProfile}
          isGallery={isGallery}
        />

        <div className="yat-page-content-row">
          {children}
        </div>
      </main>

      <footer className="yat-footer">
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
