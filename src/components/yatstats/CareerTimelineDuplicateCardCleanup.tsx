'use client';

import { useEffect } from 'react';

function removeDuplicateJourneyCard() {
  document
    .querySelectorAll<HTMLElement>('#playerCareerImages .zt-img-moment.zt-journey-moment')
    .forEach((node) => node.remove());

  window.dispatchEvent(new CustomEvent('yat:career-timeline-zoom', { detail: { source: 'journey-cleanup' } }));
}

export default function CareerTimelineDuplicateCardCleanup() {
  useEffect(() => {
    removeDuplicateJourneyCard();
    const root = document.getElementById('playerCareerImages') || document.body;
    const observer = new MutationObserver(() => removeDuplicateJourneyCard());
    observer.observe(root, { childList: true, subtree: true });
    window.setTimeout(removeDuplicateJourneyCard, 80);
    window.setTimeout(removeDuplicateJourneyCard, 240);
    return () => observer.disconnect();
  }, []);

  return (
    <style jsx global>{`
      #playerCareerImages .zt-img-moment.zt-journey-moment {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `}</style>
  );
}
