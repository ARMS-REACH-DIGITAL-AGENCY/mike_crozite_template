'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * All-Time contains expensive historical career aggregates. The normal
 * school homepage intentionally does not query them until the reader opens
 * the All-Time tab. Use an App Router transition so the existing server
 * gallery, filters, player cards, and team-year links stay unchanged.
 */
export default function AllTimeOnDemandNavigation({ loaded }: { loaded: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (loaded) return;

    const section = document.getElementById('sec-alltime');
    if (!section) return;

    let requested = false;
    const loadWhenSelected = () => {
      if (requested) return;
      if (window.location.hash !== '#sec-alltime' && !section.classList.contains('visible')) return;

      const url = new URL(window.location.href);
      // A server render is already in flight or has already loaded the data.
      if (url.searchParams.get('view') === 'alltime') return;

      requested = true;
      url.searchParams.set('view', 'alltime');
      router.replace(`${url.pathname}${url.search}${url.hash || '#sec-alltime'}`, { scroll: false });
    };

    // Handle direct hashes, deep-linked player cards and every existing
    // navigation entry point without changing their click/scroll behavior.
    loadWhenSelected();
    window.addEventListener('hashchange', loadWhenSelected);
    window.addEventListener('popstate', loadWhenSelected);
    window.addEventListener('yat:section-changed', loadWhenSelected);
    const observer = new MutationObserver(loadWhenSelected);
    observer.observe(section, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', loadWhenSelected);
      window.removeEventListener('popstate', loadWhenSelected);
      window.removeEventListener('yat:section-changed', loadWhenSelected);
    };
  }, [loaded, router]);

  return null;
}
