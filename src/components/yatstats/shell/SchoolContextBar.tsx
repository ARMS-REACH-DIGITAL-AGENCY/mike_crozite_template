
// src/components/yatstats/shell/SchoolContextBar.tsx
// Renders Row 2 of the shared shell.

'use client';

import { useContext } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import { CREST_FALLBACK_PATH } from '@/lib/schoolAssets';

interface SchoolContextBarProps {
  isPlayerProfile: boolean;
  isGallery: boolean;
  isNews: boolean;
}

export default function SchoolContextBar({ isPlayerProfile, isGallery, isNews }: SchoolContextBarProps) {
  const schoolData = useContext(SchoolContext);

  // This will be replaced with dynamic data from the page context later
  const getPageLabel = () => {
    if (isPlayerProfile) return 'PLAYER PROFILE'; // Placeholder, will be player name
    if (isNews) return 'ACTIVE ALUMNI NEWS';
    if (isGallery) return 'ACTIVE BASEBALL ALUMNI';
    return '';
  };

  return (
    <div className="yat-school-row">
      <div className="yat-school-info">
        <img
          src={schoolData?.crestUrl || CREST_FALLBACK_PATH}
          alt={`${schoolData?.hsName || 'School'} crest`}
          className="yat-school-crest"
          onError={(e) => { e.currentTarget.src = CREST_FALLBACK_PATH; }}
        />
        <div className="yat-school-text">
          <div className="yat-school-loc">{schoolData?.hsLocation || '...'}</div>
          <div className="yat-school-name">{schoolData?.hsName || '...'}</div>
          <div id="yatSectionLabel" className="yat-school-page-label">{getPageLabel()}</div>
        </div>
      </div>

      <div className="yat-school-actions">
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
