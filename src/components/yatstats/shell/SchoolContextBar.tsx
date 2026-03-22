// src/components/yatstats/shell/SchoolContextBar.tsx
// Renders Row 2 of the shared shell

'use client';

import { useContext } from 'react';
import { usePathname } from 'next/navigation';
import { SchoolContext } from '@/context/SchoolContext';
import { CREST_FALLBACK_PATH } from '@/lib/schoolAssets';

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
  const pathname = usePathname();

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

        {isGallery && (
          <>
            <button id="openFilters" className="yat-icon-btn" aria-label="Open filters">
              <i className="ri-filter-3-line" />
            </button>
            <button id="filtersReset2" className="yat-icon-btn" aria-label="Reset filters">
              <i className="ri-restart-line" />
            </button>
          </>
        )}

        {isPlayerProfile && (
          <button id="btnFanFav" className="yat-icon-btn" aria-label="Favorite this player">
            <i className="ri-heart-add-line" />
          </button>
        )}
      </div>
    </div>
  );
}
