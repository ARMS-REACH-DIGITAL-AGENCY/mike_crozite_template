// src/components/yatstats/shell/SchoolContextBar.tsx
// Renders Row 2 of the shared shell (sticky identity bar).
// On player profile pages, extracts playerId directly from the URL pathname
// (same pattern SharedShell uses for CareerStrip) and renders FavoriteButton
// next to the search icon. No prop-threading or context required.

'use client';

import { useContext } from 'react';
import { usePathname } from 'next/navigation';
import { SchoolContext } from '@/context/SchoolContext';
import { PlayerProfileContext } from '@/context/PlayerProfileContext';
import { CREST_FALLBACK_PATH } from '@/lib/schoolAssets';
import FavoriteButton from '@/components/yatstats/FavoriteButton';

interface SchoolContextBarProps {
  isPlayerProfile: boolean;
  isGallery: boolean;
  isNews: boolean;
}

function formatSlugToLabel(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.toUpperCase())
    .join(' ');
}

export default function SchoolContextBar({
  isPlayerProfile,
  isGallery,
  isNews,
}: SchoolContextBarProps) {
  const schoolData = useContext(SchoolContext);
  const playerProfile = useContext(PlayerProfileContext);
  const pathname = usePathname();
  // Extract playerId and slug from URL: /{hsid}/player/{playerId}/{slug}
  const playerRouteMatch = pathname.match(/\/player\/([^/]+)(?:\/([^/?#]+))?/);
  const profilePlayerId = playerRouteMatch ? playerRouteMatch[1] : null;
  // Derive player display name: prefer context (set by nested layout), fall back to URL slug
  const slugDerivedName = playerRouteMatch?.[2]
    ? playerRouteMatch[2].split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : '';
  const resolvedPlayerName = playerProfile?.playerName || slugDerivedName;

  const getPageLabel = () => {
    if (isPlayerProfile) {
      const segments = pathname.split('/').filter(Boolean);
      const slug = segments[segments.length - 1] || '';
      return slug ? formatSlugToLabel(slug) : 'PLAYER PROFILE';
    }

    if (isNews) return 'ACTIVE ALUMNI NEWS';
    if (isGallery) return 'ACTIVE BASEBALL ALUMNI';

    return '';
  };

  return (
    <div className="yat-schoolrow">
      <a href={`/${schoolData?.hsid || ''}`} aria-label="Go to school microsite homepage">
        <img
          src={schoolData?.crestUrl || CREST_FALLBACK_PATH}
          alt={`${schoolData?.hsName || 'School'} crest`}
          className="yat-crest"
          onError={(e) => {
            e.currentTarget.src = CREST_FALLBACK_PATH;
          }}
        />
      </a>

      <div className="yat-schooltext">
        <div className="small">{schoolData?.hsLocation || '...'}</div>
        <div className="big1">{schoolData?.hsName || '...'}</div>
        <div id="yatSectionLabel" className="big2">
          {getPageLabel()}
        </div>
      </div>

      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <button id="openSearch" className="yat-icon-btn" aria-label="Open global search">
          <i className="ri-search-line" />
        </button>

        {/* FavoriteButton Ã¢â‚¬â€ rendered in Row 2 on player profile pages only */}
        {isPlayerProfile && profilePlayerId && (
          <FavoriteButton
            playerId={profilePlayerId}
            playerName={resolvedPlayerName}
            playerHsid={schoolData?.hsid ?? ''}
          />
        )}

        {isGallery && (
          <>
            <button
              id="flipAllCards"
              className="yat-icon-btn"
              aria-label="Flip all cards to stats"
              aria-pressed="false"
              title="Flip all cards to stats"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                opacity: 1,
              }}
            >
              <img
                data-flip-all-icon="true"
                src="/img/flip-all-icon.review.png"
                alt=""
                aria-hidden="true"
                style={{
                  width: '30px',
                  height: '30px',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </button>
            <button id="openFilters" className="yat-icon-btn" aria-label="Open filters">
              <i className="ri-filter-3-line" />
            </button>
            <button id="filtersReset2" className="yat-icon-btn" aria-label="Reset filters">
              <i className="ri-restart-line" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
