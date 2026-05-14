'use client';

import { useEffect } from 'react';

function classifyTimelineImages() {
  document.querySelectorAll<HTMLElement>('#playerCareerImages .zt-image-wrap').forEach((wrap) => {
    const img = wrap.querySelector<HTMLImageElement>('img');
    const moment = wrap.closest<HTMLElement>('.zt-img-moment');
    const card = wrap.closest<HTMLElement>('.zt-img-card');
    if (!img || !moment || !card) return;

    const apply = () => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (!w || !h) return;

      const ratio = w / h;
      const isSeason = wrap.classList.contains('zt-image-wrap-season');
      const targetWidth = isSeason || ratio >= 0.9 ? 134 : 58;

      wrap.classList.toggle('zt-source-portrait', ratio < 0.9 && !isSeason);
      wrap.classList.toggle('zt-source-landscape', ratio >= 0.9 || isSeason);
      moment.classList.toggle('zt-moment-portrait', ratio < 0.9 && !isSeason);
      moment.classList.toggle('zt-moment-landscape', ratio >= 0.9 || isSeason);
      moment.style.setProperty('--zt-card-w', `${targetWidth}px`);
      card.style.setProperty('--zt-card-w', `${targetWidth}px`);
      wrap.style.setProperty('--zt-logo-bg-url', `url("${img.currentSrc || img.src}")`);
    };

    if (img.complete) apply();
    img.addEventListener('load', apply, { once: true });
  });
}

export default function GoldenLineLogoDesignOverrides() {
  useEffect(() => {
    classifyTimelineImages();

    const observer = new MutationObserver(() => classifyTimelineImages());
    const root = document.getElementById('playerCareerImages') || document.body;
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'style'] });

    window.addEventListener('load', classifyTimelineImages);
    window.addEventListener('yat:career-timeline-zoom', classifyTimelineImages as EventListener);

    return () => {
      observer.disconnect();
      window.removeEventListener('load', classifyTimelineImages);
      window.removeEventListener('yat:career-timeline-zoom', classifyTimelineImages as EventListener);
    };
  }, []);

  return (
    <style jsx global>{`
      #playerCareerImages {
        --zt-landscape-card-w: 134px;
        --zt-portrait-card-w: 58px;
        --zt-cta-w: 118px;
      }

      /* Keep the Add Moment CTA as a fixed left-hand card, not a moving timeline item. */
      #playerCareerImages .zt-prompt {
        left: 0 !important;
        top: 0 !important;
        width: var(--zt-cta-w) !important;
        height: 100% !important;
        transform: none !important;
        z-index: 30 !important;
      }

      #playerCareerImages .zt-prompt .zt-img-card {
        width: var(--zt-cta-w) !important;
        height: 100% !important;
        background: #080808 !important;
        border-right: 1px solid rgba(255,255,255,.25) !important;
        box-shadow: none !important;
      }

      /* Leave space for the fixed CTA so the image timeline starts beside it. */
      #playerCareerImages .zt-window-images {
        padding-left: var(--zt-cta-w) !important;
        box-sizing: border-box !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scrollbar-width: thin !important;
        scrollbar-color: rgba(210,180,92,.75) rgba(0,0,0,.18) !important;
      }

      #playerCareerImages .zt-window-images::-webkit-scrollbar {
        display: block !important;
        height: 8px !important;
      }

      #playerCareerImages .zt-window-images::-webkit-scrollbar-track {
        background: rgba(0,0,0,.14) !important;
      }

      #playerCareerImages .zt-window-images::-webkit-scrollbar-thumb {
        background: rgba(210,180,92,.78) !important;
        border-radius: 999px !important;
      }

      #playerCareerStrip .zt-window {
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scrollbar-width: thin !important;
        scrollbar-color: rgba(210,180,92,.75) rgba(0,0,0,.18) !important;
      }

      #playerCareerStrip .zt-window::-webkit-scrollbar {
        display: block !important;
        height: 8px !important;
      }

      #playerCareerStrip .zt-window::-webkit-scrollbar-track {
        background: rgba(0,0,0,.14) !important;
      }

      #playerCareerStrip .zt-window::-webkit-scrollbar-thumb {
        background: rgba(210,180,92,.78) !important;
        border-radius: 999px !important;
      }

      /* Every visible image card keeps its own proportion. Season/logo cards are 7:5; portrait cards stay 5:7. */
      #playerCareerImages .zt-img-moment:not(.zt-prompt) {
        width: var(--zt-card-w, var(--zt-portrait-card-w)) !important;
        top: 0 !important;
        height: 100% !important;
      }

      #playerCareerImages .zt-img-moment.zt-season {
        width: var(--zt-landscape-card-w) !important;
        --zt-card-w: var(--zt-landscape-card-w) !important;
      }

      #playerCareerImages .zt-img-card {
        width: var(--zt-card-w, var(--zt-portrait-card-w)) !important;
        height: 100% !important;
        background: #fff !important;
      }

      #playerCareerImages .zt-season .zt-img-card {
        width: var(--zt-landscape-card-w) !important;
      }

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

      #playerCareerImages .zt-img-card .zt-image-wrap-archive img,
      #playerCareerImages .zt-img-card .zt-image-wrap-upload img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
      }

      #playerCareerImages .zt-closed .zt-img-card {
        border-left-width: 0 !important;
        border-right-width: 0 !important;
        box-shadow: -12px 0 18px rgba(0,0,0,.24) !important;
      }

      #playerCareerImages .zt-closed .zt-img-moment:not(.zt-prompt) + .zt-img-moment:not(.zt-prompt) .zt-img-card::after,
      #playerCareerImages.zt-closed .zt-img-moment:not(.zt-prompt) + .zt-img-moment:not(.zt-prompt) .zt-img-card::after {
        content: '' !important;
        position: absolute !important;
        inset: 0 auto 0 0 !important;
        width: 24px !important;
        z-index: 8 !important;
        background: linear-gradient(90deg, rgba(0,0,0,.22), rgba(0,0,0,0)) !important;
        pointer-events: none !important;
      }

      #playerCareerImages .zt-prompt .zt-img-card::after {
        content: none !important;
        display: none !important;
      }
    `}</style>
  );
}
