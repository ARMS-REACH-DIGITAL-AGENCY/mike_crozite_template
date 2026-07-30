'use client';

import { useLayoutEffect } from 'react';

const PLAYER_GALLERY_SECTIONS = new Set(['active', 'alltime', 'current']);
const UNCOMMITTED_BADGE_URL = '/img/uncommitted.png';

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
  return text && text !== 'null' && text !== 'undefined' ? text : '';
}

function syncRow3VisualOrderAndImages(): void {
  const strip = getReactOwnedStrip();
  if (!strip) return;

  const sectionKey = getVisibleSectionKey();
  const stripInner = strip.querySelector<HTMLElement>('.gallery-strip-inner');

  if (!stripInner || !PLAYER_GALLERY_SECTIONS.has(sectionKey)) {
    strip.dataset.row5Synced = 'true';
    return;
  }

  const blockFiveSection = document.getElementById(`sec-${sectionKey}`);
  if (!blockFiveSection) {
    strip.dataset.row5Synced = 'true';
    return;
  }

  const visibleCards = Array.from(
    blockFiveSection.querySelectorAll<HTMLElement>('.yat-card[data-playerid]')
  ).filter(isCardVisible);

  const visiblePlayerIds = visibleCards
    .map((card) => String(card.dataset.playerid || '').trim())
    .filter(Boolean);

  const cardByPlayerId = new Map(
    visibleCards.map((card) => [String(card.dataset.playerid || '').trim(), card])
  );

  const orderByPlayerId = new Map(
    visiblePlayerIds.map((playerId, index) => [playerId, index])
  );

  const slots = Array.from(
    stripInner.querySelectorAll<HTMLElement>(
      '.gallery-slot-link[data-playerid], .gallery-current-slot-link[data-playerid]'
    )
  );

  slots.forEach((slot, fallbackIndex) => {
    const playerId = String(slot.dataset.playerid || '').trim();
    const blockFiveIndex = orderByPlayerId.get(playerId);
    const card = cardByPlayerId.get(playerId);

    slot.style.order = String(
      blockFiveIndex === undefined
        ? visiblePlayerIds.length + fallbackIndex
        : blockFiveIndex
    );

    const image = slot.querySelector<HTMLImageElement>('.gallery-slot-img');
    if (!image || !card) return;

    const desiredSrc = sectionKey === 'current'
      ? clean(card.dataset.thumbnailCurrent) || UNCOMMITTED_BADGE_URL
      : sectionKey === 'alltime'
        ? clean(card.dataset.thumbnailThen)
        : clean(card.dataset.thumbnailNow);

    const fallbackSrc = sectionKey === 'current'
      ? clean(card.dataset.thumbnailCurrentFallback) || UNCOMMITTED_BADGE_URL
      : sectionKey === 'alltime'
        ? clean(card.dataset.thumbnailThenFallback)
        : clean(card.dataset.thumbnailNowFallback);

    image.dataset.guardDesiredSrc = desiredSrc;
    image.dataset.guardFallbackSrc = fallbackSrc;

    if (desiredSrc && image.getAttribute('src') !== desiredSrc) {
      image.dataset.extensionFallbackApplied = '';
      image.dataset.fallbackApplied = '';
      image.setAttribute('src', desiredSrc);
    }

    slot.classList.toggle('gallery-current-slot-link', sectionKey === 'current');
    slot.classList.toggle('gallery-slot-link', sectionKey !== 'current');
    image.classList.toggle('gallery-slot-img--contain', sectionKey === 'current');
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
        attributeFilter: ['style', 'hidden', 'class', 'data-thumbnail-current'],
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
        attributeFilter: ['src', 'class'],
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
    `}</style>
  );
}
