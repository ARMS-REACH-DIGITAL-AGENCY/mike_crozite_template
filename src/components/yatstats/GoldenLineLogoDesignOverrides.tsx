'use client';

import { useEffect } from 'react';

const CARD_H = 100;
const CTA_CARD_W = 118;
const CLOSED_GAP = 0;
const EXPANDED_GAP = 76;
const MIN_PHOTO_W = 34;
const MAX_PHOTO_W = 210;
const SEASON_LOGO_W = 100;
const OUTFIELD_YELLOW = '#ffd200';
const YELLOW_LINE_W = 2;

function uploadTabIsActive() {
  return window.location.hash === '#ppTab-upload';
}

function normalizeExpandedState() {
  const root = document.getElementById('playerCareerImages');
  document.body.classList.toggle('yat-golden-line-upload-mode', uploadTabIsActive());
  if (!root) return;
  root.classList.toggle('zt-expanded', uploadTabIsActive());
  root.classList.toggle('zt-closed', !uploadTabIsActive());
}

function isExpanded() {
  return uploadTabIsActive() && Boolean(document.querySelector('#playerCareerImages.zt-expanded'));
}

function getGap() {
  return isExpanded() ? EXPANDED_GAP : CLOSED_GAP;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isUploadControl(element: HTMLElement) {
  if (element.classList.contains('zt-upload-slot')) return true;
  if (!element.classList.contains('zt-upload')) return false;
  const hasImage = Boolean(element.querySelector('img'));
  const hasPromptCard = Boolean(element.querySelector('.zt-prompt-card'));
  return !hasImage || hasPromptCard;
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
    if (!img || !moment || !card || isUploadControl(moment)) return;

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
      card.style.height = `${CARD_H}px`;
    };

    if (img.complete) apply();
    img.addEventListener('load', apply, { once: true });
  });
}

function layoutGoldenLine() {
  normalizeExpandedState();

  const root = document.getElementById('playerCareerImages');
  const canvas = root?.querySelector<HTMLElement>('.zt-canvas-images');
  const prompt = canvas?.querySelector<HTMLElement>('.zt-img-moment.zt-prompt');
  if (!root || !canvas) return;

  const gap = getGap();
  const allMoments = Array.from(canvas.querySelectorAll<HTMLElement>('.zt-img-moment'));
  const moments = allMoments.filter((moment) => !moment.classList.contains('zt-prompt') && !isUploadControl(moment));
  const uploadControls = [
    ...allMoments.filter(isUploadControl),
    ...Array.from(canvas.querySelectorAll<HTMLElement>('.zt-upload-slot')),
  ];
  const seams: number[] = [];

  canvas.style.height = `${CARD_H}px`;
  canvas.style.minHeight = `${CARD_H}px`;
  canvas.style.maxHeight = `${CARD_H}px`;

  if (prompt) {
    prompt.style.left = '0px';
    prompt.style.top = '0px';
    prompt.style.width = `${CTA_CARD_W}px`;
    prompt.style.height = `${CARD_H}px`;
    prompt.style.marginLeft = '0';
    prompt.style.transform = 'none';
    prompt.style.setProperty('--zt-card-w', `${CTA_CARD_W}px`);
    prompt.dataset.ztCardW = String(CTA_CARD_W);
    const promptCard = prompt.querySelector<HTMLElement>('.zt-img-card');
    if (promptCard) {
      promptCard.style.width = `${CTA_CARD_W}px`;
      promptCard.style.height = `${CARD_H}px`;
      promptCard.style.setProperty('--zt-card-w', `${CTA_CARD_W}px`);
    }
  }

  let leftEdge = CTA_CARD_W;
  seams.push(leftEdge);

  moments.forEach((moment) => {
    const w = getMomentWidth(moment);
    const card = moment.querySelector<HTMLElement>('.zt-img-card');
    const wrap = moment.querySelector<HTMLElement>('.zt-image-wrap');
    const img = moment.querySelector<HTMLImageElement>('img');
    moment.style.left = `${leftEdge}px`;
    moment.style.width = `${w}px`;
    moment.style.height = `${CARD_H}px`;
    moment.style.marginLeft = '0';
    moment.style.transform = 'none';
    moment.style.setProperty('--zt-card-w', `${w}px`);
    moment.style.top = '0px';
    if (card) {
      card.style.width = `${w}px`;
      card.style.height = `${CARD_H}px`;
      card.style.setProperty('--zt-card-w', `${w}px`);
    }
    if (wrap) {
      wrap.style.width = '100%';
      wrap.style.height = '100%';
    }
    if (img) {
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = wrap?.classList.contains('zt-image-wrap-season') ? 'contain' : 'cover';
    }
    leftEdge += w;
    seams.push(leftEdge + gap / 2);
    leftEdge += gap;
  });

  const canvasWidth = Math.max(leftEdge, root.clientWidth || 320);
  canvas.style.width = `${canvasWidth}px`;

  uploadControls.forEach((button, index) => {
    const left = seams[index] ?? CTA_CARD_W;
    button.style.left = `${left}px`;
    button.style.top = `${CARD_H / 2}px`;
    button.style.marginLeft = '0';
    button.style.transform = 'translate(-50%, -50%)';
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
  normalizeExpandedState();
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
    window.addEventListener('hashchange', refreshGoldenLine);
    window.addEventListener('yat:career-timeline-zoom', refreshGoldenLine as EventListener);

    return () => {
      observer.disconnect();
      window.removeEventListener('load', refreshGoldenLine);
      window.removeEventListener('resize', refreshGoldenLine);
      window.removeEventListener('hashchange', refreshGoldenLine);
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

      #playerCareerImages::before,
      #playerCareerImages::after {
        content: none !important;
        display: none !important;
      }

      #playerCareerImages,
      #playerCareerImages .zt-shell-images,
      #playerCareerImages .zt-window-images,
      #playerCareerImages .zt-canvas-images,
      #playerCareerImages .zt-img-moment,
      #playerCareerImages .zt-img-card,
      #playerCareerImages .zt-image-wrap {
        height: ${CARD_H}px !important;
        min-height: ${CARD_H}px !important;
        max-height: ${CARD_H}px !important;
      }

      body:not(.yat-golden-line-upload-mode) #playerCareerStrip,
      body:not(.yat-golden-line-upload-mode) .yat-row4-shell {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
      }

      #playerCareerImages .zt-prompt {
        left: 0 !important;
        top: 0 !important;
        width: var(--zt-cta-w) !important;
        height: ${CARD_H}px !important;
        min-width: var(--zt-cta-w) !important;
        transform: none !important;
        z-index: 30 !important;
      }

      #playerCareerImages .zt-prompt .zt-img-card {
        width: var(--zt-cta-w) !important;
        height: ${CARD_H}px !important;
        min-width: var(--zt-cta-w) !important;
        background: #080808 !important;
        border: 0 !important;
        box-shadow: none !important;
      }

      #playerCareerImages .zt-window-images {
        overflow-x: auto !important;
        overflow-y: hidden !important;
        padding-left: 0 !important;
        padding-bottom: 0 !important;
        box-sizing: border-box !important;
        cursor: grab !important;
        scrollbar-width: none !important;
      }

      #playerCareerImages .zt-window-images.zt-dragging {
        cursor: grabbing !important;
        user-select: none !important;
      }

      #playerCareerImages .zt-window-images::-webkit-scrollbar {
        display: none !important;
        height: 0 !important;
      }

      #playerCareerImages .zt-img-moment:not(.zt-prompt),
      #playerCareerImages .zt-img-card {
        width: var(--zt-card-w, auto) !important;
        min-width: 0 !important;
        top: 0 !important;
        background: transparent !important;
        border: 0 !important;
      }

      #playerCareerImages .zt-img-moment:not(.zt-prompt) {
        transform: none !important;
        margin-left: 0 !important;
      }

      #playerCareerImages .zt-img-card {
        box-sizing: border-box !important;
        overflow: hidden !important;
        box-shadow: inset 0 calc(-1 * var(--zt-line-w)) 0 var(--zt-outfield-yellow) !important;
      }

      #playerCareerImages .zt-prompt .zt-img-card,
      #playerCareerImages .zt-img-moment.zt-upload:not(:has(img)) .zt-img-card,
      #playerCareerImages .zt-img-moment.zt-upload:has(.zt-prompt-card) .zt-img-card {
        border: 0 !important;
        box-shadow: none !important;
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

      body:not(.yat-golden-line-upload-mode) #playerCareerImages .zt-upload-slot,
      body:not(.yat-golden-line-upload-mode) #playerCareerImages .zt-img-moment.zt-upload:not(:has(img)),
      body:not(.yat-golden-line-upload-mode) #playerCareerImages .zt-img-moment.zt-upload:has(.zt-prompt-card) {
        display: none !important;
      }

      #playerCareerImages .zt-img-moment.zt-upload:not(:has(img)),
      #playerCareerImages .zt-img-moment.zt-upload:has(.zt-prompt-card),
      #playerCareerImages .zt-upload-slot {
        width: 28px !important;
        min-width: 28px !important;
        height: 28px !important;
        min-height: 28px !important;
        max-height: 28px !important;
        padding: 0 !important;
        border-radius: 0 !important;
        border: 1px solid rgba(255,255,255,.45) !important;
        background: rgba(0,0,0,.68) !important;
        color: #fff !important;
        font-size: 0 !important;
        line-height: 1 !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 12 !important;
        box-shadow: none !important;
      }

      #playerCareerImages.zt-expanded .zt-img-moment.zt-upload:not(:has(img)),
      #playerCareerImages.zt-expanded .zt-img-moment.zt-upload:has(.zt-prompt-card),
      #playerCareerImages.zt-expanded .zt-upload-slot {
        display: inline-flex !important;
      }

      #playerCareerImages .zt-img-moment.zt-upload:not(:has(img))::before,
      #playerCareerImages .zt-img-moment.zt-upload:has(.zt-prompt-card)::before,
      #playerCareerImages .zt-upload-slot::before {
        content: '+' !important;
        font: 900 19px/1 Oswald, Arial, sans-serif !important;
        color: #fff !important;
      }

      #playerCareerImages.zt-expanded .zt-img-moment.zt-upload:not(:has(img))::after,
      #playerCareerImages.zt-expanded .zt-img-moment.zt-upload:has(.zt-prompt-card)::after,
      #playerCareerImages.zt-expanded .zt-upload-slot::after {
        content: '' !important;
        position: absolute !important;
        left: 50% !important;
        bottom: -37px !important;
        width: ${EXPANDED_GAP}px !important;
        height: 16px !important;
        transform: translateX(-50%) !important;
        background:
          linear-gradient(var(--zt-outfield-yellow), var(--zt-outfield-yellow)) center bottom / 100% var(--zt-line-w) no-repeat,
          linear-gradient(var(--zt-outfield-yellow), var(--zt-outfield-yellow)) center bottom / var(--zt-line-w) 14px no-repeat !important;
        pointer-events: none !important;
      }
    `}</style>
  );
}
