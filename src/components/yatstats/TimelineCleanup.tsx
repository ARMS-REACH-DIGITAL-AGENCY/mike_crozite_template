'use client';

import { useEffect } from 'react';

function numberFromStyle(value: string | null) {
  const n = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function momentSortKey(el: HTMLElement, index: number) {
  const title = el.getAttribute('title') || el.textContent || '';
  const yearMatch = title.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  if (el.classList.contains('zt-journey-moment')) return -100000;
  if (el.classList.contains('zt-prompt')) return -99999;
  if (/profile headshot/i.test(title)) return 99999;
  if (Number.isFinite(year)) return Number(year) * 100 + index;
  return 50000 + index;
}

function widthOf(el: HTMLElement) {
  const inlineWidth = numberFromStyle(el.style.width);
  if (inlineWidth > 0) return inlineWidth;
  const measured = el.getBoundingClientRect().width;
  return measured > 0 ? measured : 58;
}

function reorderImageTimeline(canvas: HTMLElement) {
  const shell = canvas.closest('.zt-shell-images');
  const isExpanded = shell?.classList.contains('zt-expanded');
  const gap = isExpanded ? 76 : -10;
  const gutter = 13;

  const moments = Array.from(canvas.querySelectorAll<HTMLElement>('.zt-img-moment'));
  if (moments.length < 2) return;

  const ordered = moments
    .map((el, index) => ({ el, index, key: momentSortKey(el, index), width: widthOf(el) }))
    .sort((a, b) => a.key - b.key || a.index - b.index);

  let left = gutter;
  const centers: number[] = [];
  for (const item of ordered) {
    const center = left + item.width / 2;
    centers.push(center);
    item.el.style.left = `${center}px`;
    item.el.style.width = `${item.width}px`;
    left += item.width + gap;
  }

  const totalWidth = Math.max(320, left + gutter);
  canvas.style.width = `${totalWidth}px`;

  const slots = Array.from(canvas.querySelectorAll<HTMLElement>('.zt-upload-slot'));
  slots.forEach((slot, index) => {
    const leftCenter = centers[index];
    const rightCenter = centers[index + 1];
    if (Number.isFinite(leftCenter) && Number.isFinite(rightCenter)) {
      slot.style.left = `${(leftCenter + rightCenter) / 2}px`;
    }
  });
}

export default function TimelineCleanup() {
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'yat-timeline-cleanup-style';
    style.textContent = `
      .zt-card-overlay { display: none !important; }
    `;
    if (!document.getElementById(style.id)) document.head.appendChild(style);

    let raf = 0;
    const clean = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        document.querySelectorAll<HTMLElement>('.zt-canvas-images').forEach(reorderImageTimeline);
      });
    };

    clean();
    const interval = window.setInterval(clean, 700);
    window.addEventListener('resize', clean);
    window.addEventListener('yat:career-timeline-zoom', clean as EventListener);
    window.addEventListener('yat:career-timeline-scroll', clean as EventListener);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(interval);
      window.removeEventListener('resize', clean);
      window.removeEventListener('yat:career-timeline-zoom', clean as EventListener);
      window.removeEventListener('yat:career-timeline-scroll', clean as EventListener);
    };
  }, []);

  return null;
}
