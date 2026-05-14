'use client';

import { useEffect } from 'react';

const PORTRAIT_CARD_W = 69;
const LANDSCAPE_CARD_W = 134;
const CTA_CARD_W = 118;

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
      const isPortraitCard = ratio < 0.9 && !isSeason;
      const targetWidth = isPortraitCard ? PORTRAIT_CARD_W : LANDSCAPE_CARD_W;

      wrap.classList.toggle('zt-source-portrait', isPortraitCard);
      wrap.classList.toggle('zt-source-landscape', !isPortraitCard);
      moment.classList.toggle('zt-moment-portrait', isPortraitCard);
      moment.classList.toggle('zt-moment-landscape', !isPortraitCard);
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
        --zt-landscape-card-w: ${LANDSCAPE_CARD_W}px;
        --zt-portrait-card-w: ${PORTRAIT_CARD_W}px;
        --zt-cta-w: ${CTA_CARD_W}px;
      }

      /* CTA is a fixed left utility card, not part of the scrolling/zooming timeline. */
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

      #playerCareerImages .zt-window-images {
        padding-left: 0 !important;
        box-sizing: border-box !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scrollbar-width: thin !important;
        scrollbar-color: rgba(210,180,92,.75) rgba(0,0,0,.18) !important;
      }

      /* Move only the timeline items to the right of the fixed CTA. */
      #playerCareerImages .zt-img-moment:not(.zt-prompt) {
        margin-left: var(--zt-cta-w) !important;
      }

      #playerCareerImages .zt-window-images::-webkit-scrollbar {
        display: block !important;
        height: 8px !important;
      }

      #playerCareerImages .zt-window-images::-webkit-scrollbar-track,
      #playerCareerStrip .zt-window::-webkit-scrollbar-track {
        background: rgba(0,0,0,.14) !important;
      }

      #playerCareerImages .zt-window-images::-webkit-scrollbar-thumb,
      #playerCareerStrip .zt-window::-webkit-scrollbar-thumb {
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

      /* Cards keep their own proportions in both closed and expanded states. */
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
        box-shadow: none !important;
      }

      #playerCareerImages .zt-season .zt-img-card {
        width: var(--zt-landscape-card-w) !important;
      }

      #playerCareerImages .zt-moment-portrait .zt-img-card {
        width: var(--zt-portrait-card-w) !important;
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

      /* The overlap/dissolve experiment is removed to preserve baseball-card dimensions. */
      #playerCareerImages .zt-img-card::after {
        content: none !important;
        display: none !important;
      }
    `}</style>
  );
}
