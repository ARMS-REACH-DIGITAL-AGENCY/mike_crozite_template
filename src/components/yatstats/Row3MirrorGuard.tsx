'use client';

import { useLayoutEffect } from 'react';
import { getOriginalForCardCopy } from '@/lib/playerImage';

const PLAYER_GALLERY_SECTIONS = new Set(['active', 'alltime', 'current']);
const UNCOMMITTED_BADGE_URL = '/img/uncommitted.png';
const HEADSHOT_FALLBACK_URL = '/img/headshot-silhouette.png';
const PLAYER_NOW_CUTOUT_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now-cutouts';

function getVisibleSectionKey(): string {
  const visibleSection = Array.from(document.querySelectorAll<HTMLElement>('.yat-section.visible'))
    .find((section) => section.id.startsWith('sec-'));

  if (visibleSection) return visibleSection.id.replace(/^sec-/, '').toLowerCase();

  const hash = window.location.hash || '';
  if (hash.startsWith('#sec-')) return hash.replace(/^#sec-/, '').toLowerCase();

  return 'active';
}

function isCardVisible(card: HTMLElement): boolean {
  const wrapper = card.closest<HTMLElement>('[data-player-card-wrap="true"]');

  return !card.hidden
    && card.style.display !== 'none'
    && (!wrapper || (!wrapper.hidden && wrapper.style.display !== 'none'));
}

function getReactOwnedStrip(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '.gallery-strip[data-react-mirrors-row5="true"]'
  );
}

function clean(value: string | undefined): string {
  const text = String(value || '').trim();
  return text && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'undefined' ? text : '';
}

function playerNameFromCard(card: HTMLElement): string {
  return String(card.dataset.name || '').trim().replace(/\s+/g, ' ');
}

function lastNameFromCard(card: HTMLElement): string {
  const parts = playerNameFromCard(card).split(' ').filter(Boolean);
  return parts.length ? parts[parts.length - 1].toUpperCase() : '';
}

function sectionImage(card: HTMLElement, sectionKey: string): { src: string; fallback: string } {
  if (sectionKey === 'current') {
    return {
      src: clean(card.dataset.thumbnailCurrent) || UNCOMMITTED_BADGE_URL,
      fallback: clean(card.dataset.thumbnailCurrentFallback) || UNCOMMITTED_BADGE_URL,
    };
  }

  return {
    src: `${PLAYER_NOW_CUTOUT_BASE}/${encodeURIComponent(String(card.dataset.playerid || '').trim())}.png`,
    fallback: HEADSHOT_FALLBACK_URL,
  };
}

function row3AnchorBottom(): number {
  const row1 = document.querySelector<HTMLElement>('.yat-row1-shell');
  const row2 = document.querySelector<HTMLElement>('.yat-row2-shell');
  const row3 = document.querySelector<HTMLElement>('.yat-row3-shell');
  if (!row3) return 0;
  // Use measured header heights, not CSS variables or the row's transient
  // pre-sticky viewport position. All coordinates are viewport Y pixels.
  return (row1?.getBoundingClientRect().height ?? 0)
    + (row2?.getBoundingClientRect().height ?? 0)
    + row3.getBoundingClientRect().height;
}

function alignPlayerBelowRow3(card: HTMLElement): void {
  const position = () => {
    const delta = card.getBoundingClientRect().top - row3AnchorBottom() - 8;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
  };
  position();
  // A single post-layout correction handles the sticky transition itself.
  requestAnimationFrame(position);
}

function wireSyntheticSlot(slot: HTMLElement) {
  if (slot.dataset.row3SyntheticWired === 'true') return;
  slot.dataset.row3SyntheticWired = 'true';

  slot.addEventListener('click', (event) => {
    const playerId = String(slot.dataset.playerid || '').trim();
    if (!playerId) return;

    const sectionKey = getVisibleSectionKey();
    const section = document.getElementById(`sec-${sectionKey}`);
    const card = section?.querySelector<HTMLElement>(`.yat-card[data-playerid="${playerId}"]`);
    if (!card) return;

    event.preventDefault();
    slot.closest('.gallery-strip-inner')?.querySelectorAll('.gallery-slot.is-active').forEach((item) => {
      item.classList.remove('is-active');
      item.removeAttribute('aria-current');
    });
    slot.classList.add('is-active');
    slot.setAttribute('aria-current', 'true');
    alignPlayerBelowRow3(card);
  });

  const image = slot.querySelector<HTMLImageElement>('.gallery-slot-img');
  if (image && image.dataset.row3SyntheticErrorWired !== 'true') {
    image.dataset.row3SyntheticErrorWired = 'true';
    image.addEventListener('error', () => {
      // configureSlot's onerror (set on every slot, and it runs first) owns
      // the fallback chain, including trying the original photo; acting
      // here too would overwrite what it just chose.
      if (image.onerror) return;
      const fallback = clean(image.dataset.guardFallbackSrc);
      if (!fallback || image.dataset.guardFallbackApplied === 'true') return;
      image.dataset.guardFallbackApplied = 'true';
      image.src = fallback;
    });
  }
}

function createSyntheticSlot(template: HTMLElement | null): HTMLElement {
  if (template) {
    const clone = template.cloneNode(true) as HTMLElement;
    clone.removeAttribute('hidden');
    clone.style.display = '';
    clone.style.order = '';
    clone.dataset.row3Synthetic = 'true';
    clone.dataset.row3SyntheticWired = '';
    clone.removeAttribute('data-default-hidden');
    return clone;
  }

  const slot = document.createElement('a');
  slot.className = 'gallery-slot gallery-slot-link';
  slot.dataset.row3Synthetic = 'true';

  const media = document.createElement('div');
  media.className = 'gallery-slot-media';

  const image = document.createElement('img');
  image.className = 'gallery-slot-img';

  const gradient = document.createElement('div');
  gradient.className = 'gallery-slot-gradient';

  const label = document.createElement('div');
  label.className = 'gallery-slot-name-overlay';

  media.append(image, gradient);
  slot.append(media, label);
  return slot;
}

function configureSlot(
  slot: HTMLElement,
  card: HTMLElement,
  sectionKey: string,
  visualOrder: number
) {
  const playerId = String(card.dataset.playerid || '').trim();
  const playerName = playerNameFromCard(card);
  const lastName = lastNameFromCard(card);
  const status = String(card.dataset.status || '').trim();
  const { src, fallback } = sectionImage(card, sectionKey);
  const isCurrent = sectionKey === 'current';

  slot.dataset.playerid = playerId;
  slot.dataset.status = status;
  slot.dataset.row3MirrorVisible = 'true';
  slot.removeAttribute('data-default-hidden');
  slot.setAttribute('href', `#player-${encodeURIComponent(playerId)}`);
  slot.setAttribute('title', playerName || `Player ${playerId}`);

  if (slot.hidden) slot.hidden = false;
  if (slot.style.display === 'none') slot.style.display = '';
  if (slot.style.order !== String(visualOrder)) slot.style.order = String(visualOrder);

  slot.classList.add('gallery-slot');
  slot.classList.toggle('gallery-current-slot-link', isCurrent);
  slot.classList.toggle('gallery-slot-link', !isCurrent);

  const image = slot.querySelector<HTMLImageElement>('.gallery-slot-img');
  if (image) {
    // Only (re)point the image when the photo this slot should show has
    // actually changed (different player or tab). This sync re-runs on
    // every src change in the strip, so it used to see a slot sitting on
    // its fallback silhouette, "correct" it back to the missing photo, and
    // loop -- fail, silhouette, reset, fail -- every frame for every
    // player without a photo: the flashing row 3 slots, and a silhouette
    // that never stayed put.
    const desiredChanged = image.dataset.guardDesiredSrc !== src;
    image.alt = playerName || `Player ${playerId}`;
    image.dataset.guardDesiredSrc = src;
    image.dataset.guardFallbackSrc = fallback;
    if (desiredChanged) image.dataset.guardFallbackApplied = '';
    image.classList.toggle('gallery-slot-img--contain', isCurrent);

    image.onerror = () => {
      // A card-size copy that hasn't been made yet: try the original photo
      // before the generic fallback.
      const original = isCurrent ? getOriginalForCardCopy(image.getAttribute('src')) : '';
      if (original) {
        image.setAttribute('src', original);
        return;
      }
      const guardedFallback = clean(image.dataset.guardFallbackSrc);
      if (guardedFallback && image.getAttribute('src') !== guardedFallback) {
        image.setAttribute('src', guardedFallback);
      }
    };
    // It may have failed before this handler existed (a team logo's WebP
    // copy that the converter hasn't built yet fails fast): catch up now.
    if (image.getAttribute('src') && image.complete && image.naturalWidth === 0) {
      image.onerror(new Event('error'));
    }

    image.loading = 'lazy';
    image.decoding = 'async';
    if (src && desiredChanged && image.getAttribute('src') !== src) {
      image.dataset.extensionFallbackApplied = 'true';
      image.dataset.fallbackApplied = 'true';
      image.setAttribute('src', src);
    }
  }

  const gradient = slot.querySelector<HTMLElement>('.gallery-slot-gradient');
  if (gradient) gradient.style.display = isCurrent ? 'none' : '';

  const label = slot.querySelector<HTMLElement>('.gallery-slot-name-overlay');
  if (label) label.textContent = lastName;

  if (slot.dataset.row3Synthetic === 'true') wireSyntheticSlot(slot);
}

function dedupeSlots(slots: HTMLElement[]): Map<string, HTMLElement> {
  const slotByPlayerId = new Map<string, HTMLElement>();

  slots.forEach((slot) => {
    const playerId = String(slot.dataset.playerid || '').trim();
    if (!playerId) return;

    const existing = slotByPlayerId.get(playerId);
    if (!existing) {
      slotByPlayerId.set(playerId, slot);
      return;
    }

    const existingSynthetic = existing.dataset.row3Synthetic === 'true';
    const currentSynthetic = slot.dataset.row3Synthetic === 'true';

    if (existingSynthetic && !currentSynthetic) {
      existing.remove();
      slotByPlayerId.set(playerId, slot);
      return;
    }

    if (currentSynthetic) slot.remove();
    else {
      slot.hidden = true;
      slot.style.display = 'none';
    }
  });

  return slotByPlayerId;
}

function syncRow3VisualOrderAndImages(): void {
  const strip = getReactOwnedStrip();
  if (!strip) return;

  const sectionKey = getVisibleSectionKey();
  const stripInner = strip.querySelector<HTMLElement>('.gallery-strip-inner');

  strip.dataset.activeSection = sectionKey;

  if (!stripInner || !PLAYER_GALLERY_SECTIONS.has(sectionKey)) {
    strip.dataset.row5Synced = 'true';
    return;
  }

  const blockFiveSection = document.getElementById(`sec-${sectionKey}`);
  if (!blockFiveSection) {
    strip.dataset.row5Synced = 'true';
    return;
  }

  // Cross-school Super Fan favorites (data-superfan-synthetic="true") are
  // included here so row 3 actually mirrors row 5. They used to be
  // excluded because they were once mounted via a React portal and this
  // guard's plain DOM writes could conflict with React's reconciliation -
  // that's no longer how they're built (FavoritesDrawer injects them via
  // innerHTML, same as any other DOM), so there's nothing React-owned left
  // to avoid touching.
  const visibleCards = Array.from(
    blockFiveSection.querySelectorAll<HTMLElement>('.yat-card[data-playerid]')
  ).filter(isCardVisible);

  const visiblePlayerIds = visibleCards
    .map((card) => String(card.dataset.playerid || '').trim())
    .filter(Boolean);
  const visiblePlayerIdSet = new Set(visiblePlayerIds);

  const initialSlots = Array.from(
    stripInner.querySelectorAll<HTMLElement>(
      '.gallery-slot-link[data-playerid], .gallery-current-slot-link[data-playerid]'
    )
  );

  const template = initialSlots.find((slot) => slot.dataset.row3Synthetic !== 'true')
    || initialSlots[0]
    || null;
  const slotByPlayerId = dedupeSlots(initialSlots);

  visibleCards.forEach((card, index) => {
    const playerId = String(card.dataset.playerid || '').trim();
    if (!playerId) return;

    let slot = slotByPlayerId.get(playerId);
    if (!slot) {
      slot = createSyntheticSlot(template);
      stripInner.appendChild(slot);
      slotByPlayerId.set(playerId, slot);
    }

    configureSlot(slot, card, sectionKey, index);
  });

  Array.from(
    stripInner.querySelectorAll<HTMLElement>(
      '.gallery-slot-link[data-playerid], .gallery-current-slot-link[data-playerid]'
    )
  ).forEach((slot) => {
    const playerId = String(slot.dataset.playerid || '').trim();
    const shouldShow = visiblePlayerIdSet.has(playerId);

    slot.removeAttribute('data-default-hidden');

    if (shouldShow) {
      slot.dataset.row3MirrorVisible = 'true';
      if (slot.hidden) slot.hidden = false;
      if (slot.style.display === 'none') slot.style.display = '';
    } else {
      delete slot.dataset.row3MirrorVisible;
      if (!slot.hidden) slot.hidden = true;
      if (slot.style.display !== 'none') slot.style.display = 'none';
    }
  });

  strip.dataset.row5Synced = 'true';
}

export default function Row3MirrorGuard() {
  useLayoutEffect(() => {
    let frame = 0;
    let syncing = false;

    const runSync = () => {
      if (syncing) return;
      syncing = true;
      syncRow3VisualOrderAndImages();
      syncing = false;
    };

    const scheduleSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(runSync);
    };

    runSync();

    window.addEventListener('hashchange', scheduleSync);
    window.addEventListener('popstate', scheduleSync);
    window.addEventListener('yat:gallery-filtered', scheduleSync as EventListener);

    const sectionObserver = new MutationObserver(scheduleSync);
    document.querySelectorAll('.yat-section').forEach((section) => {
      sectionObserver.observe(section, {
        attributes: true,
        attributeFilter: ['class'],
      });
    });

    const rowFive = document.querySelector('.yat-row5-shell');
    const rowFiveObserver = new MutationObserver(scheduleSync);
    if (rowFive) {
      rowFiveObserver.observe(rowFive, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          'style',
          'hidden',
          'class',
          'data-thumbnail-now',
          'data-thumbnail-then',
          'data-thumbnail-current',
        ],
      });
    }

    const strip = getReactOwnedStrip();
    const stripInner = strip?.querySelector('.gallery-strip-inner');
    const stripObserver = new MutationObserver(scheduleSync);

    if (strip) {
      stripObserver.observe(strip, {
        attributes: true,
        attributeFilter: ['data-active-section'],
      });
    }

    if (stripInner) {
      stripObserver.observe(stripInner, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src', 'class', 'style', 'hidden', 'data-default-hidden'],
      });
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', scheduleSync);
      window.removeEventListener('popstate', scheduleSync);
      window.removeEventListener('yat:gallery-filtered', scheduleSync as EventListener);
      sectionObserver.disconnect();
      rowFiveObserver.disconnect();
      stripObserver.disconnect();
    };
  }, []);

  return (
    <style jsx global>{`
      .gallery-strip[data-react-mirrors-row5="true"]:not([data-row5-synced="true"]) .gallery-strip-inner {
        visibility: hidden;
      }

      .gallery-strip[data-react-mirrors-row5="true"] [data-row3-synthetic="true"] .gallery-slot-media {
        position:relative; width:60px; height:60px; flex:0 0 60px;
        overflow:hidden; border-radius:50%; border:1px solid #c7c7c7;
        background:transparent;
      }
      .gallery-strip[data-react-mirrors-row5="true"] [data-row3-synthetic="true"] .gallery-slot-img {
        display:block; width:100%; height:100%; object-fit:contain; padding:0;
        border-radius:50%; background:transparent;
      }
      .gallery-strip[data-react-mirrors-row5="true"] [data-row3-synthetic="true"] .gallery-slot-gradient { display:none; }
      .gallery-strip[data-react-mirrors-row5="true"] [data-row3-synthetic="true"] .gallery-slot-name-overlay {
        position:static; display:block; flex:0 0 12px; width:100%; height:12px;
        padding:0; background:transparent; color:#e5e5e5;
        font:300 9px/1 Oswald,sans-serif; letter-spacing:0;
        text-align:center; text-shadow:none; text-transform:uppercase;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      body.light-theme .gallery-strip[data-react-mirrors-row5="true"] [data-row3-synthetic="true"] .gallery-slot-name-overlay { color:#555; }
    `}</style>
  );
}
