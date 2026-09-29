// src/lib/analytics.ts
// One place every fan action is reported from. track() sends the event to
// Google Analytics (and, as they're added, the other tags), so an action is
// counted the same way everywhere.
//
// Google Analytics only loads on the live yatstats.com sites (see
// AnalyticsTags), never on Vercel preview links or localhost, so testing
// doesn't count as traffic. Page views are sent here, not by GA itself, so
// each one carries the school, page type, player and tab it was about.
//
// No names, emails or other personal details are sent: ids and labels only.

export const GA_MEASUREMENT_ID = 'G-WQHT9SNHLC';

type Params = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    yatTrack?: (event: string, params?: Params) => void;
  }
}

export function isLiveHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'yatstats.com' || host.endsWith('.yatstats.com');
}

function clean(params: Params): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

// The school the current page belongs to (set by AnalyticsSchool inside the
// school layout; cleared on pages that aren't a school's).
let school: { school_id: string; school_name: string } | null = null;

export function setAnalyticsSchool(next: { id: string; name: string } | null) {
  school = next ? { school_id: next.id, school_name: next.name } : null;
}

export type PageContext = {
  page_type: string;
  player_id?: string;
  profile_tab?: string;
};

// What kind of page a path is. School sites are served both at
// /{hsid}/... and, on a school's own subdomain, without the hsid.
export function pageContext(pathname: string, hash = ''): PageContext {
  const player = pathname.match(/\/player\/([^/?#]+)/);
  if (player) {
    const tab = hash.startsWith('#ppTab-') ? hash.slice('#ppTab-'.length) : 'upload';
    return { page_type: 'player_profile', player_id: decodeURIComponent(player[1]), profile_tab: tabName(tab) };
  }
  if (/\/news(\/|$)/.test(pathname)) return { page_type: 'news' };
  if (/^\/superfan/.test(pathname)) return { page_type: 'superfan' };
  if (/^\/school-not-live/.test(pathname)) return { page_type: 'school_not_live' };
  return { page_type: school ? 'school_home' : 'site_home' };
}

// The profile's tab ids are older than their labels.
export function tabName(id: string): string {
  return ({ upload: 'stories', influence: 'stories', schedule: 'game_log' } as Record<string, string>)[id] || id;
}

function gtag(...args: unknown[]) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag(...args);
}

// Called on every route change (AnalyticsPageViews).
export function trackPageView(pathname: string, hash: string) {
  const context = pageContext(pathname, hash);
  const shared = clean({ ...school, ...context, content_group: context.page_type });
  // Every later event on this page carries the same school/page/player.
  gtag('set', shared);
  gtag('event', 'page_view', {
    ...shared,
    page_location: window.location.href,
    page_path: pathname,
    page_title: document.title,
  });
}

export function track(event: string, params: Params = {}) {
  if (typeof window === 'undefined') return;
  const context = pageContext(window.location.pathname, window.location.hash);
  gtag('event', event, clean({ ...school, ...context, ...params }));
}

// For the older inline scripts that can't import this module.
if (typeof window !== 'undefined') window.yatTrack = track;
