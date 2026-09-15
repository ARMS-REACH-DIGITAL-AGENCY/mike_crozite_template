'use client';

import { useEffect } from 'react';

const MESSAGE_SOURCE = 'yatstats-microsite';
const MAX_EMBED_ZOOM = 3;

function isAllowedParentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;

    if (url.hostname === 'yatstats.com' || url.hostname === 'www.yatstats.com') {
      return true;
    }

    return (
      url.hostname.startsWith('armsreach-') &&
      url.hostname.endsWith('-arms-reach-digital-agency.vercel.app')
    );
  } catch {
    return false;
  }
}

function clickFirst(selectors: string[]): boolean {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) continue;
    element.click();
    return true;
  }
  return false;
}

function activateHash(hash: string): boolean {
  const clicked = clickFirst([
    `a[href="#${hash}"]`,
    `button[data-target="#${hash}"]`,
    `[data-tab-target="#${hash}"]`,
  ]);
  if (clicked) return true;

  const target = document.getElementById(hash);
  if (!target) return false;

  if (window.location.hash !== `#${hash}`) {
    window.location.hash = hash;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

function runTourAction(action: string): boolean {
  switch (action) {
    case 'openSearch':
      return clickFirst(['#openSearch']);
    case 'openFilters':
      return clickFirst(['#openFilters']);
    case 'openSort':
      return clickFirst(['#openSort']);
    case 'flipAll':
      return clickFirst(['#flipAllCards']);
    case 'openFavorites':
      return clickFirst(['#openFavorites']);
    case 'openLogin':
    case 'openAccount':
      return clickFirst(['#btnAccount']);
    case 'openStats':
      return activateHash('ppTab-stats');
    case 'openNews':
      return activateHash('ppTab-news');
    case 'openSocial':
      return activateHash('ppTab-social');
    case 'openConnect':
      return activateHash('ppTab-connect');
    case 'openUpload':
      return activateHash('ppTab-upload');
    case 'openSchedule':
      return activateHash('ppTab-schedule');
    case 'openGoldenTimeline': {
      const timeline = document.getElementById('playerCareerImages');
      if (!timeline) return false;
      timeline.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
    case 'openAllTime':
      return clickFirst(['a[href="#sec-alltime"]', '[data-tab="alltime"]']);
    case 'openPartners':
      return clickFirst(['a[href="#sec-partner"]', '[data-tab="partner"]']);
    default:
      return false;
  }
}

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

function touchMidpoint(a: Touch, b: Touch) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

export default function YatTourBridge() {
  useEffect(() => {
    if (window.parent === window) return;

    let parentOrigin = '';
    let currentEmbedZoom = 1;
    let pinchStart: { distance: number; x: number; y: number } | null = null;
    let panStart: { x: number; y: number; moved: boolean } | null = null;
    let lastTapAt = 0;

    try {
      const referrerOrigin = document.referrer ? new URL(document.referrer).origin : '';
      if (isAllowedParentOrigin(referrerOrigin)) parentOrigin = referrerOrigin;
    } catch {
      parentOrigin = '';
    }

    const postToParent = (type: string, payload: Record<string, unknown> = {}) => {
      if (!parentOrigin || window.parent === window) return;
      window.parent.postMessage(
        {
          source: MESSAGE_SOURCE,
          type,
          ...payload,
        },
        parentOrigin,
      );
    };

    const reportLocation = (reason: string) => {
      postToParent('YAT_LOCATION', {
        href: window.location.href,
        origin: window.location.origin,
        reason,
      });
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (!isAllowedParentOrigin(event.origin)) return;

      parentOrigin = event.origin;
      const data = event.data || {};

      if (data.type === 'YAT_TOUR_HELLO') {
        postToParent('YAT_TOUR_ACK', {
          action: 'hello',
          success: true,
          href: window.location.href,
        });
        reportLocation('hello');
        return;
      }

      if (data.type === 'YAT_REQUEST_LOCATION') {
        reportLocation('request');
        return;
      }

      if (data.type === 'YAT_EMBED_ZOOM_STATE') {
        const nextZoom = Number(data.zoom);
        if (Number.isFinite(nextZoom)) {
          currentEmbedZoom = Math.max(1, Math.min(MAX_EMBED_ZOOM, nextZoom));
        }
        return;
      }

      if (data.type !== 'YAT_TOUR_ACTION' || typeof data.action !== 'string') return;

      const success = runTourAction(data.action);
      postToParent('YAT_TOUR_ACK', {
        action: data.action,
        success,
        href: window.location.href,
      });

      window.setTimeout(() => reportLocation(`action:${data.action}`), 80);
    };

    const onPopState = () => reportLocation('popstate');
    const onHashChange = () => reportLocation('hashchange');
    const onPageShow = () => reportLocation('pageshow');

    const gestureStyle = document.createElement('style');
    gestureStyle.id = 'yat-tour-embedded-gesture-style';
    gestureStyle.textContent = `
      html, body {
        touch-action: pan-x pan-y !important;
        overscroll-behavior: contain !important;
      }
    `;
    document.head.appendChild(gestureStyle);

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        const a = event.touches[0];
        const b = event.touches[1];
        const mid = touchMidpoint(a, b);
        pinchStart = {
          distance: Math.max(1, touchDistance(a, b)),
          x: mid.x,
          y: mid.y,
        };
        panStart = null;
        event.preventDefault();
        postToParent('YAT_EMBED_GESTURE', {
          phase: 'start',
          centerX: mid.x / Math.max(1, window.innerWidth),
          centerY: mid.y / Math.max(1, window.innerHeight),
        });
        return;
      }

      if (event.touches.length === 1 && currentEmbedZoom > 1.001) {
        const touch = event.touches[0];
        panStart = { x: touch.clientX, y: touch.clientY, moved: false };
        postToParent('YAT_EMBED_PAN', { phase: 'start' });
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (pinchStart && event.touches.length >= 2) {
        const a = event.touches[0];
        const b = event.touches[1];
        const mid = touchMidpoint(a, b);
        const scale = touchDistance(a, b) / pinchStart.distance;
        event.preventDefault();
        postToParent('YAT_EMBED_GESTURE', {
          phase: 'change',
          scale,
          centerX: mid.x / Math.max(1, window.innerWidth),
          centerY: mid.y / Math.max(1, window.innerHeight),
          deltaX: mid.x - pinchStart.x,
          deltaY: mid.y - pinchStart.y,
        });
        return;
      }

      if (panStart && currentEmbedZoom > 1.001 && event.touches.length === 1) {
        const touch = event.touches[0];
        const dx = touch.clientX - panStart.x;
        const dy = touch.clientY - panStart.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panStart.moved = true;
        if (panStart.moved) event.preventDefault();
        postToParent('YAT_EMBED_PAN', {
          phase: 'change',
          deltaX: dx,
          deltaY: dy,
        });
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (pinchStart && event.touches.length < 2) {
        postToParent('YAT_EMBED_GESTURE', { phase: 'end' });
        pinchStart = null;
      }

      if (panStart && event.touches.length === 0) {
        const wasTap = !panStart.moved;
        panStart = null;
        postToParent('YAT_EMBED_PAN', { phase: 'end' });

        if (wasTap && currentEmbedZoom > 1.001) {
          const now = Date.now();
          if (now - lastTapAt < 320) {
            event.preventDefault();
            postToParent('YAT_EMBED_ZOOM_RESET');
            lastTapAt = 0;
          } else {
            lastTapAt = now;
          }
        }
      }
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: false, capture: true });

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const patchedPushState: History['pushState'] = function (...args) {
      const result = originalPushState.apply(window.history, args);
      window.setTimeout(() => reportLocation('pushState'), 0);
      return result;
    };

    const patchedReplaceState: History['replaceState'] = function (...args) {
      const result = originalReplaceState.apply(window.history, args);
      window.setTimeout(() => reportLocation('replaceState'), 0);
      return result;
    };

    window.history.pushState = patchedPushState;
    window.history.replaceState = patchedReplaceState;

    reportLocation('mount');

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', onTouchEnd, true);
      gestureStyle.remove();

      if (window.history.pushState === patchedPushState) {
        window.history.pushState = originalPushState;
      }
      if (window.history.replaceState === patchedReplaceState) {
        window.history.replaceState = originalReplaceState;
      }
    };
  }, []);

  return null;
}
