'use client';

import { useLayoutEffect } from 'react';

const PLAYER_GALLERY_SECTIONS = new Set(['active', 'alltime', 'current']);

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

function syncRow3VisualOrder(): void {
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

  const visiblePlayerIds = Array.from(
    blockFiveSection.querySelectorAll<HTMLElement>('.yat-card[data-playerid]')
  )
    .filter(isCardVisible)
    .map((card) => String(card.dataset.playerid || '').trim())
    .filter(Boolean);

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

    slot.style.order = String(
      blockFiveIndex === undefined
        ? visiblePlayerIds.length + fallbackIndex
        : blockFiveIndex
    );
  });

  strip.dataset.row5Synced = 'true';
}

export default function Row3MirrorGuard() {
  useLayoutEffect(() => {
    let frame = 0;

    const scheduleSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncRow3VisualOrder);
    };

    // The server-rendered strip is intentionally hidden until this first
    // synchronous pass stamps the exact visible Block 5 order onto Block 3.
    syncRow3VisualOrder();

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
        attributeFilter: ['style', 'hidden', 'class'],
      });
    }

    const strip = getReactOwnedStrip();
    const stripInner = strip?.querySelector('.gallery-strip-inner');
    const stripObserver = new MutationObserver(() => {
      // Legacy YatInteractivity code can still append the same nodes in its
      // older graduating-class order. CSS flex order is immediately restamped
      // from Block 5 so that direct DOM movement cannot change the visual order.
      syncRow3VisualOrder();
    });

    if (strip) {
      stripObserver.observe(strip, {
        attributes: true,
        attributeFilter: ['data-active-section'],
      });
    }

    if (stripInner) {
      stripObserver.observe(stripInner, {
        childList: true,
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
