// src/components/yatstats/shell/SchoolContextBar.tsx
'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { highSchoolTeamLabel } from '@/lib/playerUtils';
import { SchoolContext } from '@/context/SchoolContext';
import { PlayerProfileContext } from '@/context/PlayerProfileContext';
import { CREST_FALLBACK_PATH } from '@/lib/schoolAssets';
import { openStoryDrawer } from '@/lib/storyDrawer';

interface SchoolContextBarProps {
  isPlayerProfile: boolean;
  isGallery: boolean;
  isNews: boolean;
  activeSection: string;
}

function joinSchoolUrl(base: string, suffix = ''): string {
  const cleanBase = String(base || '').replace(/\/$/, '');
  return cleanBase ? `${cleanBase}${suffix}` : suffix || '/';
}

function getVisibleGallerySection(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('.yat-section.visible'))
    .find((section) => ['sec-active', 'sec-alltime', 'sec-current'].includes(section.id)) || null;
}

function getVisibleGalleryCards(): HTMLElement[] {
  const visibleSection = getVisibleGallerySection();
  if (!visibleSection) return [];

  return Array.from(visibleSection.querySelectorAll<HTMLElement>('.yat-card[data-playerid]')).filter((card) => {
    const wrapper = card.closest<HTMLElement>('[data-player-card-wrap="true"]');
    return card.style.display !== 'none' && (!wrapper || wrapper.style.display !== 'none');
  });
}

function scrollThumbnailToPlayer(playerId: string) {
  const visibleSection = getVisibleGallerySection();
  if (!visibleSection || !playerId) return;

  const safePlayerId = typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(playerId)
    : playerId.replace(/[^a-zA-Z0-9_-]/g, '');

  const target = visibleSection.querySelector<HTMLElement>(`.yat-card[data-playerid="${safePlayerId}"]`)
    || visibleSection.querySelector<HTMLElement>(`#player-${safePlayerId}`);

  if (!target) return;

  const wrapper = target.closest<HTMLElement>('[data-player-card-wrap="true"]');
  if (wrapper) {
    wrapper.style.display = '';
    wrapper.hidden = false;
    wrapper.classList.remove('is-hidden');
  }

  target.style.display = '';
  target.hidden = false;
  target.classList.remove('is-hidden');
  target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
}

function applyTheme(theme: 'light' | 'dark') {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  document.documentElement.classList.toggle('light-theme', isLight);
  localStorage.setItem('yat-theme', theme);

  const button = document.getElementById('theme-toggle');
  const icon = button?.querySelector('i');
  if (icon) icon.className = isLight ? 'ri-moon-line' : 'ri-sun-line';
}

const SECTION_LABELS: Record<string, string> = {
  active: 'ACTIVE BASEBALL ALUMNI',
  news: 'ACTIVE ALUMNI NEWS',
  alltime: 'ALL-TIME NEXT-LEVEL LIST',
  current: highSchoolTeamLabel(),
  fantasy: 'FANTASY BRACKET TOURNEY',
  mentor: 'CONNECT & CONTRIBUTE PORTAL',
  partner: 'PARTNERSHIP PROGRAM',
};

export default function SchoolContextBar({
  isPlayerProfile,
  isGallery,
  isNews,
  activeSection,
}: SchoolContextBarProps) {
  const schoolData = useContext(SchoolContext);
  const playerProfile = useContext(PlayerProfileContext);
  const pathname = usePathname();
  const [allCardsFlipped, setAllCardsFlipped] = useState(false);
  const playerRouteMatch = pathname.match(/\/player\/([^/]+)(?:\/([^/?#]+))?/);
  const profilePlayerId = playerRouteMatch ? playerRouteMatch[1] : null;
  const storyOpenOwner = useMemo(() => Symbol(`profile-story-open:${profilePlayerId || 'none'}`), [profilePlayerId]);
  const slugDerivedName = playerRouteMatch?.[2]
    ? playerRouteMatch[2].split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : '';
  const resolvedPlayerName = playerProfile?.playerName || slugDerivedName;
  const resolvedPlayerSchoolUrl = playerProfile?.playerSchoolUrl;

  useEffect(() => {
    const savedTheme = localStorage.getItem('yat-theme') === 'light' ? 'light' : 'dark';
    applyTheme(savedTheme);

    const button = document.getElementById('theme-toggle');
    if (!button) return;

    const handleThemeClick = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
      applyTheme(nextTheme);
    };

    button.addEventListener('click', handleThemeClick);
    return () => button.removeEventListener('click', handleThemeClick);
  }, []);

  // Row 3 headshot clicks are intentionally not handled here.
  // InteractionStrip owns React-rendered slots; Row3MirrorGuard owns synthetic slots.

  const getPageLabel = () => {
    if (isPlayerProfile) {
      // Deliberately generic, not the player's name: this row-2 breadcrumb
      // is the page's actual identity -- the "Career Path Timeline" is
      // just one element ON this page, not what the page itself is --
      // matching the ACTIVE ALUMNI NEWS / ALL-TIME LIST pattern used by
      // every other section label below. The player's name belongs in
      // row 3, inside the Career Path Timeline carousel itself (see
      // .zt-persist-id in ZoomableCareerTimeline.tsx), not duplicated
      // here too -- per direct feedback, resolvedPlayerName (computed
      // above) is the right way to resolve it, just not the right place
      // to show it.
      return 'ALUMNI PROFILE PAGE';
    }

    return SECTION_LABELS[activeSection] || activeSection.toUpperCase();
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
        {isPlayerProfile && profilePlayerId && (
          <button
            type="button"
            className="yat-profile-story-cta"
            aria-label={`Share a story on ${resolvedPlayerName || 'this player'}'s Career Path Timeline`}
            title="Share a story"
            onClick={() => openStoryDrawer({ playerId: profilePlayerId, year: null }, storyOpenOwner)}
          >
            <i className="ri-upload-cloud-2-line" aria-hidden="true" />
            <span>Share a story<span className="yat-profile-story-name"> on {resolvedPlayerName ? resolvedPlayerName.split(' ')[0] : 'this player'}&apos;s Career Path</span></span>
          </button>
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

      <style jsx>{`
        .yat-profile-story-cta {
          display:inline-flex; align-items:center; justify-content:center; gap:8px;
          min-height:42px; max-width:190px; padding:6px 11px;
          border:1px solid rgba(255,255,255,.34); border-radius:7px;
          background:rgba(0,0,0,.16); color:#fff; cursor:pointer;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
          font:700 10px/1.15 var(--yat-font-ui,Arial,sans-serif);
          letter-spacing:.025em; text-transform:uppercase; text-align:left;
          transition:background .16s ease,border-color .16s ease,opacity .16s ease;
        }
        .yat-profile-story-cta:hover,.yat-profile-story-cta:focus-visible {
          background:rgba(255,255,255,.065); border-color:rgba(255,255,255,.65); outline:none;
        }
        .yat-profile-story-cta i { flex:none; color:#fff; font-size:24px; line-height:1; font-weight:400; }
        .yat-profile-story-cta span { display:block; }
        @media (max-width:620px) {
          .yat-profile-story-cta { width:138px; max-width:138px; min-height:46px; padding:6px 8px; gap:7px; font-size:9px; line-height:1.2; }
          .yat-profile-story-cta i { font-size:22px; }
          .yat-profile-story-name { display:block !important; }
        }
      `}</style>
    </div>
  );
}
