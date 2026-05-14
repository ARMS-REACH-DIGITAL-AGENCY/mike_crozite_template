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
      /* Golden Line default cards: 7:5 landscape, no gutters, slight closed-state overlap. */
      #playerCareerImages {
        --zt-landscape-card-w: 134px;
        --zt-first-card-left-edge: 13px;
      }

      #playerCareerImages.zt-closed .zt-img-moment {
        width: var(--zt-landscape-card-w) !important;
      }

      #playerCareerImages.zt-closed .zt-img-card {
        width: var(--zt-landscape-card-w) !important;
        border-left-width: 0 !important;
        border-right-width: 0 !important;
        box-shadow: -12px 0 18px rgba(0,0,0,.24) !important;
      }

      #playerCareerImages.zt-closed .zt-img-moment:first-of-type,
      #playerCareerImages.zt-closed .zt-img-moment:first-child {
        transform: translateX(-66%) !important;
      }

      #playerCareerImages.zt-closed .zt-img-moment + .zt-img-moment .zt-img-card::after {
        content: '' !important;
        position: absolute !important;
        inset: 0 auto 0 0 !important;
        width: 24px !important;
        z-index: 8 !important;
        background: linear-gradient(90deg, rgba(0,0,0,.22), rgba(0,0,0,0)) !important;
        pointer-events: none !important;
      }

      /* Team-logo cards: clean logo on white. No watermark until transparent assets exist. */
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
        content: none !important;
        display: none !important;
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
        background: #fff !important;
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
