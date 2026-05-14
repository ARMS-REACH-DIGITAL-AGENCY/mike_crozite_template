'use client';

import { useEffect } from 'react';

const TILE_W = 134;
const CTA_CARD_W = 118;
const EDGE_GUTTER = 13;
const CLOSED_GAP = 0;
const EXPANDED_GAP = 76;

function isExpanded() {
  return Boolean(document.querySelector('#playerCareerImages.zt-expanded'));
}

function getGap() {
  return isExpanded() ? EXPANDED_GAP : CLOSED_GAP;
}

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

      const isSeason = wrap.classList.contains('zt-image-wrap-season');
      const isPortraitSource = w / h < 0.9 && !isSeason;

      wrap.classList.toggle('zt-source-portrait', isPortraitSource);
      wrap.classList.toggle('zt-source-landscape', !isPortraitSource);
      moment.classList.toggle('zt-moment-portrait', isPortraitSource);
      moment.classList.toggle('zt-moment-landscape', !isPortraitSource);
      moment.style.setProperty('--zt-card-w', `${TILE_W}px`);
      card.style.setProperty('--zt-card-w', `${TILE_W}px`);
      wrap.style.setProperty('--zt-logo-bg-url', `url("${img.currentSrc || img.src}")`);
    };

    if (img.complete) apply();
    img.addEventListener('load', apply, { once: true });
  });
}

function layoutGoldenLine() {
  const root = document.getElementById('playerCareerImages');
  const canvas = root?.querySelector<HTMLElement>('.zt-canvas-images');
  if (!root || !canvas) return;

  const gap = getGap();
  const moments = Array.from(canvas.querySelectorAll<HTMLElement>('.zt-img-moment:not(.zt-prompt)'));
  const uploads = Array.from(canvas.querySelectorAll<HTMLElement>('.zt-upload-slot'));

  let leftEdge = CTA_CARD_W + EDGE_GUTTER;
  const centers: number[] = [];

  moments.forEach((moment) => {
    const center = leftEdge + TILE_W / 2;
    centers.push(center);
    moment.style.left = `${center}px`;
    moment.style.width = `${TILE_W}px`;
    moment.style.marginLeft = '0';
    moment.style.transform = 'translateX(-50%)';
    moment.style.setProperty('--zt-card-w', `${TILE_W}px`);
    leftEdge += TILE_W + gap;
  });

  const canvasWidth = Math.max(leftEdge + EDGE_GUTTER, root.clientWidth || 320);
  canvas.style.width = `${canvasWidth}px`;

  uploads.forEach((button, index) => {
    const left = centers[index] != null && centers[index + 1] != null
      ? (centers[index] + centers[index + 1]) / 2
      : centers[index] != null
        ? centers[index] + TILE_W / 2 + gap / 2
        : CTA_CARD_W + EDGE_GUTTER / 2;
    button.style.left = `${left}px`;
    button.style.marginLeft = '0';
  });
}

function refreshGoldenLine() {
  classifyTimelineImages();
  requestAnimationFrame(layoutGoldenLine);
  window.setTimeout(layoutGoldenLine, 80);
}

export default function GoldenLineLogoDesignOverrides() {
  useEffect(() => {
    refreshGoldenLine();

    const observer = new MutationObserver(() => refreshGoldenLine());
    const root = document.getElementById('playerCareerImages') || document.body;
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'style'] });

    window.addEventListener('load', refreshGoldenLine);
    window.addEventListener('resize', refreshGoldenLine);
    window.addEventListener('yat:career-timeline-zoom', refreshGoldenLine as EventListener);

    return () => {
      observer.disconnect();
      window.removeEventListener('load', refreshGoldenLine);
      window.removeEventListener('resize', refreshGoldenLine);
      window.removeEventListener('yat:career-timeline-zoom', refreshGoldenLine as EventListener);
    };
  }, []);

  return (
    <style jsx global>{`
      #playerCareerImages {
        --zt-tile-w: ${TILE_W}px;
        --zt-cta-w: ${CTA_CARD_W}px;
      }

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

      #playerCareerImages .zt-window-images,
      #playerCareerStrip .zt-window {
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scrollbar-width: thin !important;
        scrollbar-color: rgba(210,180,92,.75) rgba(0,0,0,.18) !important;
      }

      #playerCareerImages .zt-window-images {
        padding-left: 0 !important;
        box-sizing: border-box !important;
      }

      #playerCareerImages .zt-window-images::-webkit-scrollbar,
      #playerCareerStrip .zt-window::-webkit-scrollbar {
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

      #playerCareerImages .zt-img-moment:not(.zt-prompt),
      #playerCareerImages .zt-img-card {
        width: var(--zt-tile-w) !important;
        height: 100% !important;
        top: 0 !important;
        background: #fff !important;
        box-shadow: none !important;
      }

      #playerCareerImages .zt-img-card {
        border-left-width: 0 !important;
        border-right-width: 0 !important;
        overflow: hidden !important;
      }

      #playerCareerImages .zt-img-card::after {
        content: none !important;
        display: none !important;
      }

      #playerCareerImages .zt-img-card .zt-image-wrap {
        position: relative !important;
        isolation: isolate !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        background: #fff !important;
      }

      #playerCareerImages .zt-img-card .zt-image-wrap::before {
        content: '' !important;
        position: absolute !important;
        inset: -18% !important;
        z-index: 0 !important;
        background-image: var(--zt-logo-bg-url) !important;
        background-repeat: no-repeat !important;
        background-position: center !important;
        background-size: cover !important;
        opacity: .20 !important;
        filter: blur(1px) saturate(1.05) contrast(1.04) !important;
        pointer-events: none !important;
      }

      #playerCareerImages .zt-img-card .zt-image-wrap-season::before {
        content: none !important;
        display: none !important;
      }

      #playerCareerImages .zt-img-card .zt-image-wrap img {
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

      #playerCareerImages .zt-img-card .zt-image-wrap-season img {
        background: #fff !important;
      }

      /* Image captions were too noisy at this size; keep the card visual clean. */
      #playerCareerImages .zt-card-overlay,
      #playerCareerImages .zt-season-caption {
        display: none !important;
      }

      #playerCareerImages .zt-upload-slot {
        width: 28px !important;
        min-width: 28px !important;
        height: 28px !important;
        padding: 0 !important;
        border-radius: 0 !important;
        border: 1px solid rgba(255,255,255,.45) !important;
        background: rgba(0,0,0,.68) !important;
        color: #fff !important;
        font-size: 0 !important;
        line-height: 1 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        transform: translate(-50%, -50%) !important;
        z-index: 12 !important;
      }

      #playerCareerImages .zt-upload-slot::before {
        content: '+' !important;
        font: 900 19px/1 Oswald, Arial, sans-serif !important;
        color: #fff !important;
      }
    `}</style>
  );
}
