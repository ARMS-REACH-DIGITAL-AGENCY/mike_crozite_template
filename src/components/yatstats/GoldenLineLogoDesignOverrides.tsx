'use client';

import { useEffect } from 'react';

function applyLogoBackgroundVars() {
  document.querySelectorAll<HTMLElement>('.zt-image-wrap-season').forEach((wrap) => {
    const img = wrap.querySelector<HTMLImageElement>('img');
    const src = img?.currentSrc || img?.src || '';
    if (!src) return;
    wrap.style.setProperty('--zt-logo-bg-url', `url("${src}")`);
  });
}

export default function GoldenLineLogoDesignOverrides() {
  useEffect(() => {
    applyLogoBackgroundVars();

    const observer = new MutationObserver(() => applyLogoBackgroundVars());
    const root = document.getElementById('playerCareerImages') || document.body;
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

    window.addEventListener('load', applyLogoBackgroundVars);
    window.addEventListener('yat:career-timeline-zoom', applyLogoBackgroundVars as EventListener);

    return () => {
      observer.disconnect();
      window.removeEventListener('load', applyLogoBackgroundVars);
      window.removeEventListener('yat:career-timeline-zoom', applyLogoBackgroundVars as EventListener);
    };
  }, []);

  return (
    <style jsx global>{`
      /* Golden Line team-logo cards: clean logo on white with same logo screened back as a 10% fill. */
      #playerCareerImages .zt-img-card .zt-image-wrap-season {
        position: relative !important;
        isolation: isolate !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        background: #fff !important;
      }

      #playerCareerImages .zt-img-card .zt-image-wrap-season::before {
        content: '' !important;
        position: absolute !important;
        inset: -22% !important;
        z-index: 0 !important;
        background-image: var(--zt-logo-bg-url) !important;
        background-repeat: no-repeat !important;
        background-position: center !important;
        background-size: 235% auto !important;
        opacity: .10 !important;
        filter: grayscale(.15) contrast(1.08) saturate(1.15) !important;
        pointer-events: none !important;
      }

      #playerCareerImages .zt-img-card .zt-image-wrap-season img {
        position: relative !important;
        z-index: 2 !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        object-fit: contain !important;
        object-position: center center !important;
        background: transparent !important;
      }

      #playerCareerImages .zt-img-card {
        height: 100% !important;
        background: #fff !important;
      }

      #playerCareerImages .zt-img-moment {
        top: 0 !important;
        height: 100% !important;
      }

      #playerCareerImages .zt-prompt .zt-img-card {
        background: #080808 !important;
      }
    `}</style>
  );
}
