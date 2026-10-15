'use client';

import { MouseEvent, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { preload } from 'react-dom';
import { getOriginalForCardCopy } from '@/lib/playerImage';
import { CONTRIBUTE_OPTIONS, contributeSectionHref, openContribute, scrollToContributeSection } from '@/lib/contribute';
import { SchoolContext } from '@/context/SchoolContext';
import { getTitlePartner } from '@/lib/titlePartners';

const HEADSHOT_FALLBACK_SRC = '/img/headshot-silhouette.png';
const ALL_TIME_TEAM_YEARS = Array.from({ length: 28 }, (_, index) => String(1999 + index));
const YAT_ASSETS_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const PLAYER_NOW_BASE = `${YAT_ASSETS_BASE}/players/now`;
const PLAYER_NOW_CUTOUT_BASE = `${YAT_ASSETS_BASE}/players/now-cutouts`;
const PLAYER_THEN_BASE = `${YAT_ASSETS_BASE}/players/then`;
const UNCOMMITTED_BADGE_SRC = '/img/uncommitted.jpg';
const isUncommittedBadge = (src: string): boolean => /\/uncommitted\.(?:png|webp|jpe?g)(?:[?#]|$)/i.test(src);
const PLAYER_GALLERY_SECTIONS = new Set(['active', 'alltime', 'current']);

type Player = {
  id: string;
  name: string;
  image?: string | null;
  nowImage?: string | null;
  thenImage?: string | null;
  currentImage?: string | null;
  fallbackImage?: string | null;
  imageFit?: 'cover' | 'contain';
  status?: string | null;
  isPitcher?: boolean;
};

type TeamSeasonResult = {
  seasonYear: number;
  achievement: string;
  wins: number;
  losses: number;
  seasonNote: string | null;
  displayLine1: string | null;
  displayLine2: string | null;
};

type InteractionStripProps = {
  isPlayerProfile?: boolean;
  isGallery?: boolean;
  isNews?: boolean;
  players?: Player[];
  teamSeasonResults?: TeamSeasonResult[];
  // The tab and team year the server rendered (a ?team=2017 link opens on
  // All-Time with 2017 picked). The first render must match the server's, so
  // the URL is read after mounting, never while rendering.
  initialSection?: string;
  initialTeamYear?: string | null;
};

function getLastName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1].toUpperCase() : '';
}

function cleanSrc(value?: string | null): string {
  const text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return '';
  return text;
}

function getExtensionFallbackSrc(value?: string | null): string {
  const src = cleanSrc(value);
  if (!src) return '';
  // A card-size copy that hasn't been made yet: try the original photo.
  const original = getOriginalForCardCopy(src);
  if (original) return original;
  if (/\.jpe?g(?=($|[?#]))/i.test(src)) return src.replace(/\.jpe?g(?=($|[?#]))/i, '.png');
  if (/\.png(?=($|[?#]))/i.test(src)) return src.replace(/\.png(?=($|[?#]))/i, '.jpg');
  return '';
}

function normalizeStatus(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

function isHighSchoolStatus(value?: string | null): boolean {
  const status = normalizeStatus(value);
  return status === 'HIGH SCHOOL' || status === 'COMMIT' || status === 'UNCOMMITTED';
}

function getCurrentSection(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'active';

  const hash = window.location.hash || '';
  if (hash.startsWith('#sec-')) return hash.replace(/^#sec-/, '') || 'active';

  const visible = document.querySelector<HTMLElement>('.yat-section.visible');
  if (visible?.id?.startsWith('sec-')) return visible.id.replace(/^sec-/, '') || 'active';

  return 'active';
}

function escapeSelector(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function isCardVisible(card: HTMLElement): boolean {
  const wrapper = card.closest<HTMLElement>('[data-player-card-wrap="true"]');
  return !card.hidden
    && card.style.display !== 'none'
    && (!wrapper || (!wrapper.hidden && wrapper.style.display !== 'none'));
}

function alignPlayerBelowRow3(card: HTMLElement): void {
  // Align to the actual bottom of the sticky headshot row, not a diagnostic Y coordinate.
  // Read the rendered geometry so responsive row heights are respected.
  const rail = document.querySelector<HTMLElement>('.gallery-strip[data-react-mirrors-row5="true"]');
  const rowBottom = rail?.getBoundingClientRect().bottom;
  const targetY = Math.max(0, rowBottom ?? 166) + 8;
  const position = () => {
    const delta = card.getBoundingClientRect().top - targetY;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
  };
  position();
  requestAnimationFrame(position);
}

function scrollToPlayerCard(playerId: string, sectionKey: string) {
  if (typeof document === 'undefined') return;

  const safeId = String(playerId || '').trim();
  if (!safeId) return;

  const section = document.getElementById(`sec-${sectionKey}`);
  const escapedId = escapeSelector(safeId);
  const target = section?.querySelector<HTMLElement>(`.yat-card[data-playerid="${escapedId}"]`)
    || section?.querySelector<HTMLElement>(`#player-${escapedId}`);

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
  alignPlayerBelowRow3(target);
}

function fallbackPlayersForSection(section: string, players: Player[]): Player[] {
  if (section === 'current') {
    return players.filter((player) => isHighSchoolStatus(player.status));
  }

  if (section === 'alltime') {
    return players.filter((player) => !isHighSchoolStatus(player.status)).map((player) => ({
      ...player,
      image: cleanSrc(player.nowImage) || cleanSrc(player.image),
      imageFit: 'cover',
    }));
  }

  if (section === 'active' || section === 'news') {
    return players
      .filter((player) => {
        const status = normalizeStatus(player.status);
        return !isHighSchoolStatus(status) && status !== 'RETIRED';
      })
      .map((player) => ({
        ...player,
        image: cleanSrc(player.nowImage) || cleanSrc(player.image),
        imageFit: 'cover',
      }));
  }

  return [];
}

function readPlayersFromVisibleBlockFive(
  section: string,
  playersById: Map<string, Player>
): Player[] {
  if (!PLAYER_GALLERY_SECTIONS.has(section)) return [];

  const targetSection = document.getElementById(`sec-${section}`);
  if (!targetSection) return [];

  const seen = new Set<string>();
  const result: Player[] = [];

  targetSection.querySelectorAll<HTMLElement>('.yat-card[data-playerid]').forEach((card) => {
    if (!isCardVisible(card)) return;

    const id = String(card.dataset.playerid || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);

    const source = playersById.get(id);
    const rawName = String(source?.name || card.dataset.name || '').trim();
    const name = rawName || `Player ${id}`;
    const nowImage = cleanSrc(card.dataset.thumbnailNow)
      || cleanSrc(source?.nowImage)
      || `${PLAYER_NOW_BASE}/${encodeURIComponent(id)}.jpg`;
    const thenImage = cleanSrc(card.dataset.thumbnailThen)
      || cleanSrc(source?.thenImage)
      || `${PLAYER_THEN_BASE}/${encodeURIComponent(id)}.jpg`;
    const currentImage = cleanSrc(card.dataset.thumbnailCurrent)
      || cleanSrc(source?.currentImage)
      || cleanSrc(source?.image)
      || UNCOMMITTED_BADGE_SRC;

    const isCurrent = section === 'current';
    const isAllTime = section === 'alltime';
    const selectedImage = isCurrent ? currentImage : nowImage;
    const fallbackImage = isCurrent
      ? cleanSrc(card.dataset.thumbnailCurrentFallback) || UNCOMMITTED_BADGE_SRC
      : cleanSrc(card.dataset.thumbnailNowFallback) || cleanSrc(source?.fallbackImage) || HEADSHOT_FALLBACK_SRC;

    result.push({
      id,
      name,
      image: selectedImage,
      nowImage,
      thenImage,
      currentImage,
      fallbackImage,
      imageFit: isCurrent ? 'contain' : 'cover',
      status: normalizeStatus(card.dataset.status || source?.status),
      isPitcher: source?.isPitcher,
    });
  });

  return result;
}

function playerSignature(players: Player[]): string {
  return players.map((player) => `${player.id}:${cleanSrc(player.image)}:${player.imageFit || 'cover'}`).join('|');
}

export default function InteractionStrip({
  isPlayerProfile = false,
  isGallery = false,
  isNews = false,
  players = [],
  teamSeasonResults = [],
  initialSection = 'active',
  initialTeamYear = null,
}: InteractionStripProps) {
  // The All-Time year baseballs load with the page, so the tab opens on
  // them rather than on bare numbers.
  preload('/img/roster_year_ball.webp', { as: 'image' });
  // The All-Time row's right-hand sign: the school's sponsor, or an open
  // spot that links to the portal's sponsor section.
  const schoolForSponsor = useContext(SchoolContext);
  const sponsorHsid = String(schoolForSponsor?.hsid || '');
  const sponsor = sponsorHsid ? getTitlePartner(sponsorHsid) : null;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeSection, setActiveSection] = useState(initialSection);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedRosterYear, setSelectedRosterYear] = useState<string | null>(initialTeamYear);
  const [sectionPlayers, setSectionPlayers] = useState<Player[]>(() =>
    fallbackPlayersForSection(initialSection, players)
  );

  const playersById = useMemo(
    () => new Map(players.map((player) => [String(player.id), player])),
    [players]
  );

  // The Connect & Contribute Portal: the same strip, a circle per option
  // (its icon where a headshot would be) instead of players.
  const isContribute = activeSection === 'mentor' && !isPlayerProfile;
  const showPlayerStrip = isGallery || isNews || PLAYER_GALLERY_SECTIONS.has(activeSection) || activeSection === 'news' || isContribute;
  const showProfilePlaceholder = isPlayerProfile;
  const isCurrentTeamTab = activeSection === 'current';

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el || !showPlayerStrip) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let frame = 0;

    const syncFromPage = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const section = getCurrentSection();
        setActiveSection(section);
        const allTimeSection = document.getElementById('sec-alltime');
        setSelectedRosterYear(
          section === 'alltime' ? allTimeSection?.dataset.alltimeTeamYearFilter || null : null
        );

        // Alumni News uses the same active-alumni headshots as the flip-card
        // gallery, but as filters. Resolve its roster from the active gallery
        // first so client-side navigation doesn't depend on a news-only list
        // that may not be populated until a full refresh.
        const nextPlayers = section === 'news'
          ? fallbackPlayersForSection('active', players)
          : PLAYER_GALLERY_SECTIONS.has(section)
            ? readPlayersFromVisibleBlockFive(section, playersById)
            : fallbackPlayersForSection(section, players);

        const resolvedPlayers = nextPlayers.length
          ? nextPlayers
          : fallbackPlayersForSection(section, players);

        setSectionPlayers((current) =>
          playerSignature(current) === playerSignature(resolvedPlayers) ? current : resolvedPlayers
        );

        window.setTimeout(updateScrollState, 0);
      });
    };

    syncFromPage();
    window.addEventListener('hashchange', syncFromPage);
    window.addEventListener('popstate', syncFromPage);
    window.addEventListener('yat:section-changed', syncFromPage);
    window.addEventListener('yat:gallery-filtered', syncFromPage as EventListener);
    document.addEventListener('click', syncFromPage, true);

    const observer = new MutationObserver(syncFromPage);
    document.querySelectorAll('.yat-section').forEach((section) => {
      observer.observe(section, { attributes: true, attributeFilter: ['class'] });
    });

    const rowFive = document.querySelector('.yat-row5-shell');
    if (rowFive) {
      observer.observe(rowFive, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'hidden', 'class'],
      });
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', syncFromPage);
      window.removeEventListener('popstate', syncFromPage);
      window.removeEventListener('yat:section-changed', syncFromPage);
      window.removeEventListener('yat:gallery-filtered', syncFromPage as EventListener);
      document.removeEventListener('click', syncFromPage, true);
      observer.disconnect();
    };
  }, [players, playersById]);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el || !showPlayerStrip) return;

    el.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [sectionPlayers.length, showPlayerStrip, isCurrentTeamTab]);

  const scrollByAmount = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el || !showPlayerStrip) return;

    el.scrollBy({
      left: direction === 'left' ? -(el.clientWidth * 0.8) : el.clientWidth * 0.8,
      behavior: 'smooth',
    });
  };

  const handleSlotClick = (event: MouseEvent<HTMLAnchorElement>, playerId: string) => {
    event.preventDefault();
    const selected = event.currentTarget;
    const rail = selected.closest('.gallery-strip-inner');
    rail?.querySelectorAll('.gallery-slot.is-active').forEach((slot) => { slot.classList.remove('is-active'); slot.removeAttribute('aria-current'); });
    setSelectedPlayerId(playerId);
    selected.classList.add('is-active');
    selected.setAttribute('aria-current', 'true');

    // On the News tab a headshot filters the news cards to that player
    // (NewsGallery listens; clicking the same one again shows everyone).
    // Player gallery pages use the same thumbnail as an anchor to the
    // matching block-five card.
    if (activeSection === 'news') {
      window.dispatchEvent(new CustomEvent('yat:news-player-filter', { detail: { playerId } }));
      return;
    }
    if (PLAYER_GALLERY_SECTIONS.has(activeSection)) {
      scrollToPlayerCard(playerId, activeSection);
    }
  };

  // The address bar names the team being looked at (?team=2017), so the
  // page's own link opens on it too.
  const syncTeamParam = (year: string) => {
    const params = new URLSearchParams(window.location.search);
    if (year) params.set('team', year); else params.delete('team');
    const query = params.toString();
    history.replaceState(history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  };

  const handleAllTimeYearClick = (year: string) => {
    const nextYear = selectedRosterYear === year ? '' : year;
    setSelectedRosterYear(nextYear || null);
    syncTeamParam(nextYear);
    window.dispatchEvent(new CustomEvent('yat:alltime-team-year-filter', { detail: { year: nextYear } }));
  };

  const handleAllTimeResetClick = () => {
    setSelectedRosterYear(null);
    syncTeamParam('');
    window.dispatchEvent(new CustomEvent('yat:alltime-team-year-filter', { detail: { year: '', reset: true } }));
  };

  // A shared team link (?team=2017) opens the All-Time list; the gallery's
  // filter script picks the season once the list is set up. The strip
  // follows whichever year is picked, from here or from there.
  useEffect(() => {
    // Tell the splash (app/layout.tsx) the page is ready: on a team link,
    // once the strip is on that year and the first card's photo is in (no
    // silhouette standing in for it); otherwise as soon as this has mounted.
    let readySent = false;
    const ready = () => window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (readySent) return;
      const send = () => {
        if (readySent) return;
        readySent = true;
        window.dispatchEvent(new Event('yat:page-ready'));
      };
      const firstCard = Array.from(document.querySelectorAll<HTMLElement>('#alltime-grid > *')).find((card) => card.style.display !== 'none');
      const photo = initialTeamYear ? firstCard?.querySelector<HTMLImageElement>('img.yat-bg-photo') : null;
      if (!photo || photo.complete) { send(); return; }
      photo.loading = 'eager';
      photo.addEventListener('load', send, { once: true });
      photo.addEventListener('error', send, { once: true });
      window.setTimeout(send, 2000);
    }));
    const year = new URLSearchParams(window.location.search).get('team') || '';
    if (ALL_TIME_TEAM_YEARS.includes(year)) {
      if (window.location.hash !== '#sec-alltime') history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}#sec-alltime`);
      document.querySelector<HTMLElement>(`.alltime-year-badge[data-team-year="${year}"]`)?.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' });
    }
    ready();
    const onYear = (event: Event) => {
      const detail = (event as CustomEvent<{ year?: unknown }>).detail;
      const picked = String(detail?.year || '');
      setSelectedRosterYear(picked || null);
      if (picked) {
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLElement>(`.alltime-year-badge[data-team-year="${picked}"]`)?.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' });
        });
      }
    };
    window.addEventListener('yat:alltime-team-year-filter', onYear);
    return () => window.removeEventListener('yat:alltime-team-year-filter', onYear);
  }, []);

  const shouldRenderPlaceholder = !showPlayerStrip && !showProfilePlaceholder;
  const allTimeCount = players.length;
  const teamSeasonResultsByYear = new Map(
    teamSeasonResults.map((result) => [String(result.seasonYear), result])
  );

  return (
    <>
      <style jsx>{`
        .gallery-slot-link,
        .gallery-current-slot-link {
          display: block;
          text-decoration: none;
          color: inherit;
        }

        .alltime-year-badge {
          appearance: none;
          -webkit-appearance: none;
          padding: 0;
          color: inherit;
          cursor: pointer;
        }

        .alltime-year-badge:focus-visible {
          outline: 2px solid #f5c542;
          outline-offset: -2px;
          border-radius: 50%;
        }

        .alltime-year-badge.is-active .alltime-year-badge-media {
          border-color: #f5c542;
          box-shadow: 0 0 0 2px rgba(245, 197, 66, .72);
        }

        .gallery-slot-media {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #000;
        }

        .gallery-current-slot-link .gallery-slot-media {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
        }

        :global(body.light-theme) .gallery-current-slot-link .gallery-slot-media {
          background: #fff;
        }

        .gallery-slot-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .gallery-slot-img--contain {
          object-fit: contain;
          object-position: center center;
          padding: 5px;
          background: #050505;
        }

        .gallery-current-slot-link .gallery-slot-img--contain {
          object-fit: contain;
          object-position: center center;
          padding: 6px;
          background: transparent;
        }

        .gallery-current-slot-link .gallery-slot-media--uncommitted {
          border-radius: 50%;
          background: transparent;
        }
        .gallery-current-slot-link .gallery-slot-media--uncommitted .gallery-slot-img--contain {
          width: 100%; height: 100%; padding: 0; object-fit: cover; border-radius: 50%;
        }

        .gallery-slot-gradient {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 50%;
          z-index: 1;
          pointer-events: none;
          background: linear-gradient(to top, rgba(0,0,0,.8) 0%, rgba(0,0,0,.65) 18%, rgba(0,0,0,.45) 34%, rgba(0,0,0,.2) 44%, rgba(0,0,0,0) 100%);
        }

        .gallery-slot-name-overlay {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 4px;
          z-index: 2;
          text-align: center;
          font-size: 10px;
          line-height: 1;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: #fff;
          text-shadow: 0 1px 3px rgba(0,0,0,.95);
          pointer-events: none;
          padding: 0 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      <style jsx global>{`
        /* Give every player-card gallery the same 8px cushion below the row-3 rail. */
        #sec-active, #sec-alltime, #sec-current { border-top:8px solid transparent; }
        /* Compact alumni portrait rail: thin neutral separators, surnames below portraits. */
        .gallery-strip[data-react-mirrors-row5="true"] { background:#0a0a0a; border:0; height:84px; min-height:84px; padding:0 6px; }
        body.light-theme .gallery-strip[data-react-mirrors-row5="true"] { background:#fff; }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-strip-inner { height:84px; min-height:84px; gap:3px; align-items:center; padding:4px 54px 4px 54px; box-sizing:border-box; }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot {
          flex:0 0 64px; width:64px; min-width:64px; height:73px; display:flex;
          flex-direction:column; align-items:center; justify-content:center;
          gap:2px; border:0; border-radius:0; background:transparent;
          overflow:visible; box-shadow:none; margin:0; text-decoration:none;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot + .gallery-slot { margin-left:0; }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot-media {
          width:60px; height:60px; flex:0 0 60px; border:1px solid #c7c7c7;
          border-radius:50%; overflow:hidden; background:transparent;
          box-shadow:none; position:relative;
        }
        body.light-theme .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot-media { border-color:#d1d1d1; }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-year-badge-media {
          background:radial-gradient(circle at 38% 30%, #fff 0%, #fff 48%, #f5f5f5 76%, #e5e5e5 100%);
          box-shadow:inset 0 1px 9px rgba(0,0,0,.09), inset 0 -3px 7px rgba(0,0,0,.06);
        }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] { height:84px; min-height:84px; }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .gallery-strip-inner { height:84px; min-height:84px; }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-year-badge { flex:0 0 64px; width:64px; min-width:64px; height:73px; }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-year-badge:not(.alltime-year-reset-badge) .alltime-year-badge-media {
          display:flex; flex:0 0 60px; width:60px; height:60px; box-sizing:border-box;
          align-items:center; justify-content:center; padding:7px; color:#171717;
        }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .alltime-distance-marker {
          position:absolute; left:7px; top:8px; transform:none; z-index:7;
          display:flex; flex-direction:column; justify-content:center; align-items:center;
          width:65px; height:42px; border:1px solid #c8c5b9; border-radius:2px;
          background:#f4f1e9; color:#733648; cursor:pointer; box-shadow:0 1px 5px #0005;
        }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .alltime-distance-title {
          position:absolute; top:49px; left:0; width:100%; color:#e2c34b; display:flex; flex-direction:column; align-items:stretch; font:800 8px/1 Oswald,sans-serif; letter-spacing:0; text-align:center; white-space:nowrap;
        }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .alltime-distance-title span:first-child { font-size:15px; line-height:1; letter-spacing:.5px; transform:scaleX(1.1); transform-origin:center; }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .alltime-distance-count {
          font:900 27px/1 Oswald,sans-serif;
        }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .gallery-strip-inner {
          padding-left:82px !important;
          -webkit-mask-image:linear-gradient(to right,transparent 0px,transparent 48px,black 94px,black 87%,transparent 100%);
          mask-image:linear-gradient(to right,transparent 0px,transparent 48px,black 94px,black 87%,transparent 100%);
        }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] { background:#16472f; border-top:4px solid #dfc24d; }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .gallery-strip-inner { background:linear-gradient(160deg,#246b48,#123b29); }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-year-badge:not(.alltime-year-reset-badge) .alltime-year-badge-media {
          background:transparent url('/img/roster_year_ball.webp') center / contain no-repeat;
          border:0; border-radius:0; box-shadow:none; color:#532a39;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-year-badge.alltime-state-champion .alltime-year-badge-media {
          background-image:url('/img/az_state_champ_roster.webp'); color:#fff;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-team-year-number {
          font:900 22px/1 Oswald,sans-serif; display:block; text-shadow:0 1px 2px #7776;
        }
        /* Outfield plaques: match Hamilton's raised condensed lettering and vertical hierarchy. */
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-season-record { color:#e2c34b !important; font-weight:800 !important; font-size:10px !important; }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-team-stats { height:100%; }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-champ-layout,
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-ball-layout {
          display:flex; flex-direction:column; justify-content:center; width:100%; height:100%;
          font-family:Impact,'Arial Narrow',sans-serif; font-stretch:condensed; font-weight:900;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-champ-layout {
          color:#f7f5ef; text-align:right; align-items:flex-end; padding:5px 4px 5px 0; box-sizing:border-box;
          text-shadow:0 1px 1px #777,1px 2px 1px #333;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-champ-heading {
          display:flex; justify-content:flex-end; align-items:baseline; align-self:flex-end; gap:2px; line-height:.88;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-champ-record {
          font:700 5px/1 Arial,sans-serif; white-space:nowrap;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-champ-state {
          font-size:14px; line-height:.91; letter-spacing:-.4px;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-champ-champions {
          font-size:12px; line-height:.93; letter-spacing:-.35px;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-champ-year {
          font-size:18px; line-height:1.08; letter-spacing:-.5px;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-ball-layout {
          color:#65424b; text-align:center; padding:6px 2px 3px;
          text-shadow:0 1px 1px #ffffffa8;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-ball-record {
          display:none;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-ball-note {
          font-family:Oswald,'Arial Narrow',sans-serif; font-weight:400; font-size:7px; line-height:1; letter-spacing:-.15px; flex:1; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; padding-bottom:2px; overflow:hidden; width:100%;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-ball-note > span { display:block; width:100%; white-space:nowrap; overflow:hidden; text-overflow:clip; text-align:center; flex:0 0 auto; line-height:1; }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-ball-year {
          font-size:17px; line-height:1.05;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-team-stats {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          width:100%; max-height:100%; overflow:hidden; text-align:center;
          font:600 6.7px/1.08 Oswald, sans-serif; letter-spacing:0; text-transform:none;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-team-achievement { display:block; width:100%; overflow-wrap:anywhere; }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-team-note {
          display:block; width:100%; margin-top:1px; font-size:5.8px; font-style:italic;
          line-height:1.05; overflow-wrap:anywhere;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-team-record {
          display:block; margin-top:2px; font:700 8px/1 Oswald, sans-serif; white-space:nowrap;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-team-stats--missing { font-size:7px; line-height:1.15; }
        body.light-theme .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot-img[data-silhouette-fallback="true"] { filter:invert(1); }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot-img {
          display:block; width:100%; height:100%; object-fit:contain;
          object-position:center center; border-radius:50%; background:transparent; padding:0;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot-img--contain { object-fit:contain; padding:0; background:transparent; }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot-gradient { display:none; }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot-name-overlay {
          position:static; display:block; flex:0 0 11px; width:100%; height:11px;
          min-height:0; padding:0; background:transparent; color:#e5e5e5;
          font:300 9px/1 Oswald, sans-serif; letter-spacing:0; line-height:11px; text-transform:uppercase;
          text-align:center; text-shadow:none; white-space:nowrap;
          overflow:hidden; text-overflow:ellipsis; pointer-events:none;
        }
        body.light-theme .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot-name-overlay { color:#555; }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot:hover,
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot:focus,
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot.is-active { box-shadow:none; }
        /* Fade the full portrait and label near either edge, like the ticker. */
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-strip-inner {
          -webkit-mask-image:linear-gradient(to right,black 0%,black 87%,transparent 100%);
          mask-image:linear-gradient(to right,black 0%,black 87%,transparent 100%);
        }
        /* All-Time wall: fade plaques into the wall's green, never the page's white.
           Keep this after the shared portrait mask so it wins the cascade. */
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"],
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .gallery-strip-inner {
          background:#16472f !important;
        }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .gallery-strip-inner {
          -webkit-mask-image:linear-gradient(to right,transparent 0,transparent 52px,#000 105px,#000 calc(100% - 58px),transparent 100%);
          mask-image:linear-gradient(to right,transparent 0,transparent 52px,#000 105px,#000 calc(100% - 58px),transparent 100%);
        }
        /* Right-justify all three lines within the plaque, with room for CHAMPS. */
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-state-champion .alltime-champ-layout {
          padding:4px 1px 3px 0; align-items:flex-end; text-align:right;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-state-champion .alltime-champ-layout > span {
          align-self:flex-end; text-align:right; max-width:100%; white-space:nowrap;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-state-champion .alltime-champ-champions {
          font-size:10px; letter-spacing:-.55px;
        }
        /* The fixed sign's two-line descriptor ends at the same baseline as records. */
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .alltime-distance-title {
          top:46px; line-height:1; gap:0;
        }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .alltime-distance-title span:first-child {
          font-size:12px; transform:none; letter-spacing:.1px;
        }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .alltime-distance-title span:last-child {
          font-size:8px; letter-spacing:-.2px;
        }
        /* Replace dark arrow blocks with small theme-matched translucent chevrons. */
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-strip-arrow {
          z-index:3; background:rgba(20,20,20,.25); color:#ddd; border:0;
          width:22px; box-shadow:none; opacity:.7;
        }
        body.light-theme .gallery-strip[data-react-mirrors-row5="true"] .gallery-strip-arrow {
          background:rgba(255,255,255,.25); color:#555;
        }
        /* The selected portrait drops slightly instead of rising into the top crop. */
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot { transform:translateY(0); transition:transform .18s ease; }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot.is-active,
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot[aria-current="true"],
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot:focus-visible { transform:translateY(3px); }
        /* Move the portrait and surname together using only the parent slot transform. */
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot-media {
          transform:none !important;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot.is-active .gallery-slot-name-overlay,
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot[aria-current="true"] .gallery-slot-name-overlay {
          color:#d2b45c !important;
          text-shadow:0 0 5px rgba(210,180,92,.28);
        }
        .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot.alltime-year-reset-badge {
          flex:0 0 108px; width:108px; min-width:108px;
          height:73px;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-year-reset-badge .alltime-year-badge-media {
          width:60px; height:60px; flex:0 0 60px;
        }
        .gallery-strip[data-react-mirrors-row5="true"] .alltime-year-reset-label {
          display:block; width:108px; height:11px; flex:0 0 11px;
          color:#e5e5e5; font:300 9px/11px Oswald, sans-serif;
          letter-spacing:0; text-align:center; white-space:nowrap;
        }


        @media(max-width:600px) {
          .gallery-strip[data-react-mirrors-row5="true"] { padding-left:6px; padding-right:0; }
          .gallery-strip[data-react-mirrors-row5="true"] .gallery-strip-inner { gap:3px; }
          .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot { flex-basis:64px; width:64px; }
          .gallery-strip[data-react-mirrors-row5="true"] .gallery-slot-media {
            width:60px;
            height:60px;
            flex-basis:auto; aspect-ratio:1;
          }
          .gallery-strip[data-react-mirrors-row5="true"] .alltime-year-badge { flex-basis:64px; width:64px; min-width:64px; }
          .gallery-strip[data-react-mirrors-row5="true"] .alltime-year-badge:not(.alltime-year-reset-badge) .alltime-year-badge-media {
            flex:0 0 60px; width:60px; height:60px; aspect-ratio:1;
          }
        }
        /* The All-Time row's sponsor sign, on the fence at the right, mirroring
           the All-Time sign on the left. */
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .gallery-strip-inner {
          padding-right:82px !important;
          -webkit-mask-image:linear-gradient(to right,transparent 0px,transparent 48px,black 94px,black calc(100% - 94px),transparent calc(100% - 48px),transparent 100%);
          mask-image:linear-gradient(to right,transparent 0px,transparent 48px,black 94px,black calc(100% - 94px),transparent calc(100% - 48px),transparent 100%);
        }
        .gallery-strip[data-active-section="alltime"][data-react-mirrors-row5="true"] .gallery-strip-arrow.right { right:78px; }
        .alltime-sponsor-sign { position:absolute; right:7px; top:8px; z-index:7; width:65px; height:42px; display:block; color:inherit; text-decoration:none; }
        .alltime-sponsor-board { display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; box-sizing:border-box; padding:3px;
          border:1px solid #c8c5b9; border-radius:2px; background:#f4f1e9; color:#733648; box-shadow:0 1px 5px #0005; overflow:hidden; }
        .alltime-sponsor-board img { max-width:100%; max-height:100%; object-fit:contain; }
        .alltime-sponsor-board b { font:900 12px/1.05 Oswald,sans-serif; letter-spacing:.2px; }
        .alltime-sponsor-sign.is-open .alltime-sponsor-board { border-style:dashed; border-color:#733648; }
        .alltime-sponsor-sign.is-open:hover .alltime-sponsor-board { background:#fffbe9; }
        .alltime-sponsor-title { position:absolute; top:46px; left:0; width:100%; display:flex; flex-direction:column; align-items:stretch; color:#e2c34b; font:800 8px/1 Oswald,sans-serif; text-align:center; white-space:nowrap; }
        .alltime-sponsor-title span:first-child { font-size:12px; letter-spacing:.1px; }
        .gallery-contribute-slot { border: 0; background: none; padding: 0; color: inherit; font: inherit; cursor: pointer; }
        .gallery-strip .gallery-contribute-media { display: block; overflow:hidden; background:#101010 !important; border:2px solid #bdbdbd; box-shadow:none; border-radius:50%; }
        .gallery-strip .gallery-contribute-media img { width:100%; height:100%; display:block; object-fit:cover; object-position:center 24%; filter:saturate(.75); }
        .gallery-contribute-slot:hover .gallery-contribute-media img, .gallery-contribute-slot:focus-visible .gallery-contribute-media img { transform:scale(1.05); }
        .gallery-contribute-slot .gallery-slot-name-overlay { color:#f5f5f5; }
      `}</style>      <div className="gallery-strip" data-active-section={activeSection} data-react-mirrors-row5="true">
        {showPlayerStrip && (
          <button
            type="button"
            className={`gallery-strip-arrow left ${!canScrollLeft ? 'hidden' : ''}`}
            onClick={() => scrollByAmount('left')}
            aria-label="Scroll left"
          >
            ‹
          </button>
        )}

        {showPlayerStrip && activeSection === 'alltime' && (
          <button type="button" className="alltime-distance-marker" onClick={handleAllTimeResetClick}
            aria-label={`Show All-Time List, ${allTimeCount} alumni`} title="Show all-time alumni">
            <strong className="alltime-distance-count">{allTimeCount}</strong>
            <span className="alltime-distance-title"><span>ALL-TIME</span><span>NEXT LEVEL LIST</span></span>
          </button>
        )}
        {showPlayerStrip && activeSection === 'alltime' && (
          sponsor ? (
            <span className="alltime-sponsor-sign" title={sponsor.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <span className="alltime-sponsor-board"><img src={sponsor.logoUrl} alt={sponsor.name} /></span>
              <span className="alltime-sponsor-title"><span>PROUD</span><span>SPONSOR</span></span>
            </span>
          ) : (
            <a className="alltime-sponsor-sign is-open" href={sponsorHsid ? contributeSectionHref(sponsorHsid, 'cc-fans') : '#'} aria-label="Sponsor this spot" title="Put your business here">
              <span className="alltime-sponsor-board"><b>YOUR</b><b>BUSINESS</b></span>
              <span className="alltime-sponsor-title"><span>SPONSOR</span><span>THIS SPOT</span></span>
            </a>
          )
        )}
        <div ref={showPlayerStrip ? scrollRef : null} className="gallery-strip-inner">
          {showPlayerStrip ? (
            activeSection === 'alltime' ? (
              <>
                {ALL_TIME_TEAM_YEARS.map((year) => {
                  const isSelected = selectedRosterYear === year;
                  const stats = teamSeasonResultsByYear.get(year);
                  const displayLines = [stats?.displayLine1 || stats?.achievement || '', stats?.displayLine2 || stats?.seasonNote || ''];
                  const isChampion = /\bstate\s+champ(?:ion)?s?\b/i.test([stats?.achievement,stats?.seasonNote].filter(Boolean).join(' '));
                  const isRunnerUp = /\b(state\s+)?runner.up\b/i.test([stats?.achievement,stats?.seasonNote].filter(Boolean).join(' '));
                  const statsLabel = stats
                    ? `${stats.achievement}${stats.seasonNote ? `; ${stats.seasonNote}` : ''} (${stats.wins}-${stats.losses})`
                    : 'season stats not provided yet';
                  return (
                    <button
                      key={`alltime-year-${year}`}
                      type="button"
                      className={`gallery-slot alltime-year-badge${isChampion ? ' alltime-state-champion' : ''}${isRunnerUp ? ' alltime-state-runnerup' : ''}${isSelected ? ' is-active' : ''}`}
                      data-team-year={year}
                      aria-label={`${year} team: ${statsLabel}. Filter All-Time alumni to team year ${year}`}
                      aria-pressed={isSelected}
                      title={`${year} Team — ${statsLabel}. Click to filter alumni.`}
                      onClick={() => handleAllTimeYearClick(year)}
                    >
                      <div className="gallery-slot-media alltime-year-badge-media">
                        <span className={`alltime-team-stats${stats ? '' : ' alltime-team-stats--missing'}`}>
                          {isChampion ? (
                            <span className="alltime-champ-layout">
                              <span className="alltime-champ-heading">
                                
                                <span className="alltime-champ-state">STATE</span>
                              </span>
                              <span className="alltime-champ-champions">CHAMPS</span>
                              <span className="alltime-champ-year">{year}</span>
                            </span>
                          ) : (
                            <span className="alltime-ball-layout">
                              
                              <span className="alltime-ball-note"><><span>{displayLines[0]}</span><span>{displayLines[1]}</span></></span>
                              <span className="alltime-ball-year">{year}</span>
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="gallery-slot-name-overlay alltime-season-record" aria-hidden="true">{stats?.wins != null && stats?.losses != null ? `(${stats.wins}-${stats.losses})` : ""}</span>
                    </button>
                  );
                })}
              </>
            ) : isContribute ? (
              CONTRIBUTE_OPTIONS.map((option) => (
                <button
                  key={`contribute-${option.id}`}
                  type="button"
                  className="gallery-slot gallery-slot-link gallery-contribute-slot"
                  title={option.label}
                  aria-label={option.label}
                  // Contribution icons open their forms directly. Connect icons
                  // still scroll to the portal's separate paid offerings.
                  onClick={() => option.tab
                    ? openContribute({ tab: option.tab })
                    : scrollToContributeSection(option.section)}
                >
                  <div className="gallery-slot-media gallery-contribute-media">
                    <img
                      loading="lazy"
                      alt=""
                      src={({
                        player: 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/180827.jpg',
                        fans: '/img/splash-partner-demo.svg',
                        alumni: 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/225132.jpg',
                        photo: 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/180827.jpg',
                        data: '/img/az_state_champ_roster.webp',
                        missing: '/img/az_state_champ_roster.webp',
                        tip: '/img/connect-contribute-portal.png',
                      } as Record<string,string>)[option.id] || '/img/connect-contribute-portal.png'}
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (!img.src.endsWith('/img/connect-contribute-portal.png')) img.src = '/img/connect-contribute-portal.png';
                      }}
                    />
                  </div>
                  <div className="gallery-slot-name-overlay">{option.short}</div>
                </button>
              ))
            ) : sectionPlayers.map((player) => {
              const lastName = getLastName(player.name);
              const fallbackSrc = isCurrentTeamTab ? (cleanSrc(player.fallbackImage) || UNCOMMITTED_BADGE_SRC) : HEADSHOT_FALLBACK_SRC;
              const nowSrc = cleanSrc(player.nowImage)
                || `${PLAYER_NOW_BASE}/${encodeURIComponent(player.id)}.jpg`;
              const thenSrc = cleanSrc(player.thenImage)
                || `${PLAYER_THEN_BASE}/${encodeURIComponent(player.id)}.jpg`;
              const currentSrc = cleanSrc(player.currentImage) || UNCOMMITTED_BADGE_SRC;
              const displaySrc = isCurrentTeamTab
                ? currentSrc
                : activeSection === 'news' ? (cleanSrc(player.nowImage) || cleanSrc(player.image) || nowSrc) : `${PLAYER_NOW_CUTOUT_BASE}/${encodeURIComponent(player.id)}.png`;
              const uncommittedBadge = isCurrentTeamTab && isUncommittedBadge(currentSrc);
              const status = normalizeStatus(player.status);
              const imageFit = player.imageFit === 'contain' ? 'contain' : 'cover';
              const linkClassName = isCurrentTeamTab
                ? 'gallery-slot gallery-current-slot-link'
                : 'gallery-slot gallery-slot-link';

              return (
                <a
                  key={`${activeSection}-${player.id}`}
                  href={`#player-${encodeURIComponent(player.id)}`}
                  className={`${linkClassName}${selectedPlayerId === player.id ? ' is-active' : ''}`}
                  data-playerid={player.id}
                  data-status={status}
                  data-default-hidden={status === 'RETIRED' ? 'retired' : undefined}
                  title={player.name}
                  onClick={(event) => handleSlotClick(event, player.id)}
                >
                  <div className={`gallery-slot-media${uncommittedBadge ? ' gallery-slot-media--uncommitted' : ''}`}>
                    <img
                      src={displaySrc}
                      alt={player.name}
                      loading={activeSection === "news" ? "eager" : "lazy"}
                      decoding="async"
                      className={imageFit === 'contain' ? 'gallery-slot-img gallery-slot-img--contain' : 'gallery-slot-img'}
                      data-now-src={nowSrc}
                      data-then-src={thenSrc}
                      data-current-src={currentSrc}
                      onError={(event) => {
                        const image = event.currentTarget;

                        if (isCurrentTeamTab && image.dataset.extensionFallbackApplied !== 'true') {
                          const alternateSrc = getExtensionFallbackSrc(image.getAttribute('src'));
                          if (alternateSrc && alternateSrc !== image.getAttribute('src')) {
                            image.dataset.extensionFallbackApplied = 'true';
                            image.src = alternateSrc;
                            return;
                          }
                        }

                        if (activeSection === 'news' && image.dataset.nowFallbackApplied !== 'true' && nowSrc !== image.getAttribute('src')) {
                          image.dataset.nowFallbackApplied = 'true';
                          image.src = nowSrc;
                          return;
                        }
                        if (image.dataset.fallbackApplied === 'true') return;
                        image.dataset.fallbackApplied = 'true';
                         image.dataset.silhouetteFallback = 'true';
                        image.src = fallbackSrc;
                      }}
                    />
                    {!isCurrentTeamTab && <div className="gallery-slot-gradient" />}
                  </div>
                  {lastName ? <div className="gallery-slot-name-overlay">{lastName}</div> : null}
                </a>
              );
            })
          ) : (
            <div
              aria-hidden="true"
              data-shell-placeholder={shouldRenderPlaceholder ? 'true' : undefined}
              style={{ width: '100%', minHeight: '100%' }}
            />
          )}
        </div>

        {showPlayerStrip && (
          <button
            type="button"
            className={`gallery-strip-arrow right ${!canScrollRight ? 'hidden' : ''}`}
            onClick={() => scrollByAmount('right')}
            aria-label="Scroll right"
          >
            ›
          </button>
        )}
      </div>
    </>
  );
}
