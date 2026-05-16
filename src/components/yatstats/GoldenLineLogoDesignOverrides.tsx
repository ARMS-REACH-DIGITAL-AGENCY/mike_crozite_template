'use client';

import { useEffect } from 'react';

const CARD_H = 100;
const CTA_CARD_W = 118;
const EDGE_GUTTER = 0;
const CLOSED_GAP = 0;
const EXPANDED_GAP = 76;
const MIN_PHOTO_W = 34;
const MAX_PHOTO_W = 210;
const SEASON_LOGO_W = 100;
const OUTFIELD_YELLOW = '#ffd200';
const YELLOW_LINE_W = 2.5;

function isExpanded() {
  return Boolean(document.querySelector('#playerCareerImages.zt-expanded'));
}

function getGap() {
  return isExpanded() ? EXPANDED_GAP : CLOSED_GAP;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getMomentWidth(moment: HTMLElement) {
  const value = Number(moment.dataset.ztCardW || moment.style.getPropertyValue('--zt-card-w').replace('px', ''));
  if (Number.isFinite(value) && value > 0) return value;
  if (moment.classList.contains('zt-prompt')) return CTA_CARD_W;
  if (moment.classList.contains('zt-season')) return SEASON_LOGO_W;
  return 58;
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
      const aspect = w / h;
      const isPortraitSource = aspect < 0.9 && !isSeason;
      const isLandscapeSource = aspect > 1.12 && !isSeason;
      const cardW = isSeason ? SEASON_LOGO_W : clamp(Math.round(CARD_H * aspect), MIN_PHOTO_W, MAX_PHOTO_W);

      wrap.classList.toggle('zt-source-portrait', isPortraitSource);
      wrap.classList.toggle('zt-source-landscape', isLandscapeSource);
      moment.classList.toggle('zt-moment-portrait', isPortraitSource);
      moment.classList.toggle('zt-moment-landscape', isLandscapeSource);
      moment.classList.toggle('zt-moment-squareish', !isPortraitSource && !isLandscapeSource && !isSeason);
      moment.dataset.ztCardW = String(cardW);
      moment.style.setProperty('--zt-card-w', `${cardW}px`);
      card.style.setProperty('--zt-card-w', `${cardW}px`);
      card.style.width = `${cardW}px`;
      wrap.style.setProperty('--zt-logo-bg-url', `url("${img.currentSrc || img.src}")`);
    };

    if (img.complete) apply();
    img.addEventListener('load', apply, { once: true });
  });
}

function layoutGoldenLine() {
  const root = document.getElementById('playerCareerImages');
  const canvas = root?.querySelector<HTMLElement>('.zt-canvas-images');
  const prompt = canvas?.querySelector<HTMLElement>('.zt-img-moment.zt-prompt');
  if (!root || !canvas) return;

  const gap = getGap();
  const moments = Array.from(canvas.querySelectorAll<HTMLElement>('.zt-img-moment:not(.zt-prompt)'));
  const uploads = Array.from(canvas.querySelectorAll<HTMLElement>('.zt-upload-slot'));

  let promptCenter = CTA_CARD_W / 2;
  if (prompt) {
    prompt.style.left = '0px';
    prompt.style.width = `${CTA_CARD_W}px`;
    prompt.style.marginLeft = '0';
    prompt.style.transform = 'none';
    prompt.style.setProperty('--zt-card-w', `${CTA_CARD_W}px`);
    prompt.dataset.ztCardW = String(CTA_CARD_W);
    promptCenter = CTA_CARD_W / 2;
    const promptCard = prompt.querySelector<HTMLElement>('.zt-img-card');
    if (promptCard) {
      promptCard.style.width = `${CTA_CARD_W}px`;
      promptCard.style.setProperty('--zt-card-w', `${CTA_CARD_W}px`);
    }
  }

  let leftEdge = CTA_CARD_W + EDGE_GUTTER;
  const centers: number[] = [promptCenter];
  const widths: number[] = [CTA_CARD_W];

  moments.forEach((moment) => {
    const w = getMomentWidth(moment);
    const card = moment.querySelector<HTMLElement>('.zt-img-card');
    widths.push(w);
    const center = leftEdge + w / 2;
    centers.push(center);
    moment.style.left = `${center}px`;
    moment.style.width = `${w}px`;
    moment.style.marginLeft = '0';
    moment.style.transform = 'translateX(-50%)';
    moment.style.setProperty('--zt-card-w', `${w}px`);
    if (card) {
      card.style.width = `${w}px`;
      card.style.setProperty('--zt-card-w', `${w}px`);
    }
    leftEdge += w + gap;
  });

  const canvasWidth = Math.max(leftEdge + EDGE_GUTTER, root.clientWidth || 320);
  canvas.style.width = `${canvasWidth}px`;

  uploads.forEach((button, index) => {
    const left = centers[index] != null && centers[index + 1] != null
      ? (centers[index] + centers[index + 1]) / 2
      : centers[index] != null
        ? centers[index] + (widths[index] || 58) / 2 + gap / 2
        : CTA_CARD_W;
    button.style.left = `${left}px`;
    button.style.marginLeft = '0';
  });
}

function enableDragScroll() {
  const scroller = document.querySelector<HTMLElement>('#playerCareerImages .zt-window-images');
  if (!scroller || scroller.dataset.dragScrollBound === 'true') return;
  scroller.dataset.dragScrollBound = 'true';
  scroller.tabIndex = 0;
  scroller.setAttribute('aria-label', 'Career timeline image strip. Drag horizontally or use left and right arrow keys.');

  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  scroller.addEventListener('mousedown', (event) => {
    if ((event.target as HTMLElement).closest('button')) return;
    isDown = true;
    scroller.classList.add('zt-dragging');
    startX = event.pageX - scroller.offsetLeft;
    scrollLeft = scroller.scrollLeft;
  });

  window.addEventListener('mouseup', () => {
    isDown = false;
    scroller.classList.remove('zt-dragging');
  });

  scroller.addEventListener('mouseleave', () => {
    isDown = false;
    scroller.classList.remove('zt-dragging');
  });

  scroller.addEventListener('mousemove', (event) => {
    if (!isDown) return;
    event.preventDefault();
    const x = event.pageX - scroller.offsetLeft;
    scroller.scrollLeft = scrollLeft - (x - startX);
  });

  scroller.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    scroller.scrollLeft += event.deltaY;
  }, { passive: false });

  scroller.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      scroller.scrollBy({ left: 120, behavior: 'smooth' });
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scroller.scrollBy({ left: -120, behavior: 'smooth' });
    }
  });
}

function refreshGoldenLine() {
  classifyTimelineImages();
  enableDragScroll();
  requestAnimationFrame(layoutGoldenLine);
  window.setTimeout(layoutGoldenLine, 80);
  window.setTimeout(layoutGoldenLine, 220);
}

export default function GoldenLineLogoDesignOverrides() {
  useEffect(() => {
    refreshGoldenLine();

    const observer = new MutationObserver(() => refreshGoldenLine());
    const root = document.getElementById('playerCareerImages') || document.body;
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class'] });

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
        --zt-cta-w: ${CTA_CARD_W}px;
        --zt-outfield-yellow: ${OUTFIELD_YELLOW};
        --zt-line-w: ${YELLOW_LINE_W}px;
      }

      /* Connected yellow timeline only after the CTA card. */
      #playerCareerImages::before {
        content: '' !important;
        position: absolute !important;
        left: var(--zt-cta-w) !important;
        right: 0 !important;
        bottom: 0 !important;
        height: var(--zt-line-w) !important;
        z-index: 1 !important;
        background: var(--zt-outfield-yellow) !important;
        pointer-events: none !important;
      }

      #playerCareerImages::after {
        content: 'drag timeline • use arrow keys' !important;
        position: absolute !important;
        right: 10px !important;
        bottom: 8px !important;
        z-index: 60 !important;
        color: rgba(255,255,255,.54) !important;
        font: 800 8px/1 Oswald, Arial, sans-serif !important;
        letter-spacing: .08em !important;
        text-transform: uppercase !important;
        pointer-events: none !important;
        opacity: .72 !important;
      }

      #playerCareerImages .zt-prompt {
        left: 0 !important;
        top: 0 !important;
        width: var(--zt-cta-w) !important;
        height: 100% !important;
        min-width: var(--zt-cta-w) !important;
        transform: none !important;
        z-index: 30 !important;
      }

      #playerCareerImages .zt-prompt .zt-img-card {
        width: var(--zt-cta-w) !important;
        height: 100% !important;
        min-width: var(--zt-cta-w) !important;
        background: #080808 !important;
        border: 0 !important;
        border-right: 1px solid rgba(255,255,255,.25) !important;
        box-shadow: none !important;
      }

      #playerCareerImages .zt-window-images,
      #playerCareerStrip .zt-window {
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scrollbar-width: none !important;
      }

      #playerCareerImages .zt-window-images {
        padding-left: 0 !important;
        padding-bottom: 0 !important;
        box-sizing: border-box !important;
        cursor: grab !important;
      }

      #playerCareerImages .zt-window-images.zt-dragging {
        cursor: grabbing !important;
        user-select: none !important;
      }

      #playerCareerImages .zt-window-images::-webkit-scrollbar,
      #playerCareerStrip .zt-window::-webkit-scrollbar {
        display: none !important;
        height: 0 !important;
      }

      #playerCareerImages .zt-canvas-images {
        height: ${CARD_H}px !important;
      }

      #playerCareerImages .zt-img-moment:not(.zt-prompt),
      #playerCareerImages .zt-img-card {
        width: var(--zt-card-w, auto) !important;
        height: ${CARD_H}px !important;
        min-width: 0 !important;
        top: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }

      #playerCareerImages .zt-img-card {
        border: 0 !important;
        border-bottom: var(--zt-line-w) solid var(--zt-outfield-yellow) !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }

      #playerCareerImages .zt-prompt .zt-img-card {
        border-bottom: 0 !important;
      }

      #playerCareerImages .zt-img-card::after,
      #playerCareerImages .zt-img-card .zt-image-wrap::before {
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
        background: transparent !important;
      }

      #playerCareerImages .zt-img-card .zt-image-wrap img {
        position: relative !important;
        z-index: 2 !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        object-fit: cover !important;
        object-position: center center !important;
        background: transparent !important;
      }

      #playerCareerImages .zt-img-card .zt-image-wrap-season img {
        object-fit: contain !important;
        background: transparent !important;
      }

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

      #playerCareerImages .zt-upload-slot::after {
        content: '' !important;
        position: absolute !important;
        left: 50% !important;
        bottom: -39px !important;
        width: var(--zt-line-w) !important;
        height: 14px !important;
        transform: translateX(-50%) !important;
        background: var(--zt-outfield-yellow) !important;
        pointer-events: none !important;
      }
    `}</style>
  );
}
