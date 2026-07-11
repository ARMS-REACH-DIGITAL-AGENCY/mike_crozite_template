// src/components/yatstats/shell/SchoolContextBar.tsx
'use client';

import { useContext, useState } from 'react';
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
  return slug.split('-').filter(Boolean).map((part) => part.toUpperCase()).join(' ');
}

function joinSchoolUrl(base: string, suffix = ''): string {
  const cleanBase = String(base || '').replace(/\/$/, '');
  return cleanBase ? `${cleanBase}${suffix}` : suffix || '/';
}

function playerFlipCardHref(playerSchoolUrl: string | undefined, playerHsid: string, playerId: string): string {
  const base = playerSchoolUrl || `/${encodeURIComponent(playerHsid)}`;
  return joinSchoolUrl(base, `?view=active&player=${encodeURIComponent(playerId)}#player-${encodeURIComponent(playerId)}`);
}

function getVisibleGalleryCards(): HTMLElement[] {
  const visibleSection = Array.from(document.querySelectorAll<HTMLElement>('.yat-section.visible'))
    .find((section) => section.id === 'sec-active' || section.id === 'sec-alltime' || section.id === 'sec-current');

  if (!visibleSection) return [];

  return Array.from(visibleSection.querySelectorAll<HTMLElement>('.yat-card[data-playerid]')).filter((card) => {
    const wrapper = card.closest<HTMLElement>('[data-player-card-wrap="true"]');
    return card.style.display !== 'none' && (!wrapper || wrapper.style.display !== 'none');
  });
}

export default function SchoolContextBar({ isPlayerProfile, isGallery, isNews }: SchoolContextBarProps) {
  const schoolData = useContext(SchoolContext);
  const playerProfile = useContext(PlayerProfileContext);
  const pathname = usePathname();
  const [allCardsFlipped, setAllCardsFlipped] = useState(false);
  const playerRouteMatch = pathname.match(/\/player\/([^/]+)(?:\/([^/?#]+))?/);
  const profilePlayerId = playerRouteMatch ? playerRouteMatch[1] : null;
  const slugDerivedName = playerRouteMatch?.[2]
    ? playerRouteMatch[2].split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : '';
  const resolvedPlayerName = playerProfile?.playerName || slugDerivedName;
  const resolvedPlayerHsid = playerProfile?.playerHsid || schoolData?.hsid || '';
  const resolvedPlayerSchoolUrl = playerProfile?.playerSchoolUrl;

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

  const schoolHomeHref = isPlayerProfile && resolvedPlayerSchoolUrl
    ? joinSchoolUrl(resolvedPlayerSchoolUrl)
    : `/${schoolData?.hsid || ''}`;

  const handleFlipAll = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const nextState = !allCardsFlipped;
    getVisibleGalleryCards().forEach((card) => card.classList.toggle('is-flipped', nextState));
    setAllCardsFlipped(nextState);
  };

  return (
    <div className="yat-schoolrow">
      <a href={schoolHomeHref} aria-label="Go to school microsite homepage">
        <img src={schoolData?.crestUrl || CREST_FALLBACK_PATH} alt={`${schoolData?.hsName || 'School'} crest`} className="yat-crest" onError={(e) => { e.currentTarget.src = CREST_FALLBACK_PATH; }} />
      </a>
      <div className="yat-schooltext">
        <div className="small">{schoolData?.hsLocation || '...'}</div>
        <div className="big1">{schoolData?.hsName || '...'}</div>
        <div id="yatSectionLabel" className="big2">{getPageLabel()}</div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isPlayerProfile && profilePlayerId && resolvedPlayerHsid && (
          <a href={playerFlipCardHref(resolvedPlayerSchoolUrl, resolvedPlayerHsid, profilePlayerId)} className="yat-icon-btn" aria-label="Back to Flip Card" title="Back to Flip Card" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            <img src="/img/flip-card-return-icon.png" alt="" aria-hidden="true" style={{ width: '20px', height: '20px', objectFit: 'contain', display: 'block' }} />
          </a>
        )}
        {isPlayerProfile && profilePlayerId && (
          <FavoriteButton playerId={profilePlayerId} playerName={resolvedPlayerName} playerHsid={resolvedPlayerHsid} />
        )}
        {isGallery && (
          <>
            <button id="flipAllCards" className="yat-icon-btn" aria-label={allCardsFlipped ? 'Flip all cards to front' : 'Flip all cards to stats'} aria-pressed={allCardsFlipped} title={allCardsFlipped ? 'Flip all cards to front' : 'Flip all cards to stats'} onClick={handleFlipAll} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', padding: 0, border: 'none', background: 'transparent', color: 'inherit', opacity: 1 }}>
              <img data-flip-all-icon="true" src="/img/flip-all-icon.review.png" alt="" aria-hidden="true" style={{ width: '20px', height: '20px', objectFit: 'contain', display: 'block', transform: allCardsFlipped ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
            </button>
            <button id="openSort" className="yat-icon-btn" aria-label="Open sort"><i className="ri-sort-desc" /></button>
            <button id="openFilters" className="yat-icon-btn" aria-label="Open filters"><i className="ri-filter-3-line" /></button>
            <button id="filtersReset2" className="yat-icon-btn" aria-label="Reset filters"><i className="ri-restart-line" /></button>
          </>
        )}
      </div>
    </div>
  );
}
