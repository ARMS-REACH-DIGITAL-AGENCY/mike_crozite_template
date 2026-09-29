'use client';

// src/components/analytics/Analytics.tsx
// AnalyticsPageViews (root layout): one page_view per route, carrying the
// school, page type, player and tab (see lib/analytics.ts).
// AnalyticsSchool (school layout): tells analytics which school the page
// belongs to. It's a child of the root layout, so its effect runs before
// the page view is sent.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { setAnalyticsSchool, track, trackPageView } from '@/lib/analytics';

// Clicks inside the older inline-script features (global search, flip
// cards) and links out to news sources, caught in one place.
function onClick(event: MouseEvent) {
  const target = event.target as Element | null;
  if (!target?.closest) return;
  const result = target.closest('.yat-gs-result');
  if (result) {
    const term = (document.getElementById('gsInput') as HTMLInputElement | null)?.value || '';
    track('search_select', { result_type: result.classList.contains('yat-gs-player') ? 'player' : 'school', search_query: term.trim().slice(0, 60) });
    return;
  }
  const source = target.closest<HTMLAnchorElement>('.pp-news-modal-source, .news-full-story-btn, .yat-news-back-source');
  if (source) {
    let host = '';
    try { host = new URL(source.href).hostname; } catch {}
    track('news_outbound_click', { news_host: host });
    return;
  }
  const card = target.closest<HTMLElement>('.yat-card');
  if (card && !target.closest('a, button')) track('flip_card', { card_playerid: card.dataset.playerid || '' });
}

export function AnalyticsPageViews() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) trackPageView(pathname, window.location.hash);
  }, [pathname]);
  useEffect(() => {
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return null;
}

export function AnalyticsSchool({ hsid, hsname }: { hsid: string; hsname: string }) {
  useEffect(() => {
    setAnalyticsSchool({ hsid, hsname });
    return () => setAnalyticsSchool(null);
  }, [hsid, hsname]);
  return null;
}
