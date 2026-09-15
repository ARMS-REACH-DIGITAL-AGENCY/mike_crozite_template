'use client';

import { useEffect } from 'react';

const MESSAGE_SOURCE = 'yatstats-microsite';

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

export default function YatTourBridge() {
  useEffect(() => {
    if (window.parent === window) return;

    let parentOrigin = '';

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

    window.addEventListener('message', onMessage);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('pageshow', onPageShow);

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
