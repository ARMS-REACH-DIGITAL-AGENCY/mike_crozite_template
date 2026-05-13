'use client';

import { useEffect } from 'react';

function text(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeKey(year: string, team: string) {
  return `${year}::${team.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

function findTimelineRoot(range: HTMLInputElement, timelineButtons: HTMLButtonElement[]) {
  let node: HTMLElement | null = range.parentElement;
  let best: HTMLElement | null = null;
  while (node && node !== document.body) {
    const count = timelineButtons.filter((button) => node?.contains(button)).length;
    if (count >= Math.min(6, timelineButtons.length)) best = node;
    node = node.parentElement;
  }
  return best || range.parentElement;
}

function enhanceProfileChrome() {
  const activeHash = window.location.hash || '#ppTab-stats';

  document.querySelectorAll<HTMLAnchorElement>('#playerFunZone .pp-fz-tab').forEach((tab) => {
    const href = tab.getAttribute('href') || '';
    tab.classList.remove('pp-fz-tab-default');
    tab.classList.toggle('pp-fz-tab-active', href === activeHash);
  });

  const levelByYearTeam = new Map<string, string>();
  const firstStatsTable = document.querySelector<HTMLTableElement>('#ppTab-stats table, .psi-table');
  if (firstStatsTable) {
    firstStatsTable.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
      const year = text(cells[0]?.textContent);
      const team = text(cells[1]?.textContent);
      const level = text(cells[3]?.textContent || cells[2]?.textContent);
      if (/^\d{4}$/.test(year) && team && level) {
        levelByYearTeam.set(normalizeKey(year, team), level);
      }
    });
  }

  const timelineCards = Array.from(document.querySelectorAll<HTMLButtonElement>('button[title]')).filter((button) => {
    const title = button.getAttribute('title') || '';
    return /^(HS|\d{4}|Add)\s+—\s+/.test(title) || /Profile headshot|High school card/i.test(title);
  });

  const yearCards = timelineCards.filter((button) => /^\d{4}\s+—\s+/.test(button.getAttribute('title') || ''));
  const range = document.querySelector<HTMLInputElement>('input[aria-label="Zoom timeline"]');
  if (range && timelineCards.length) {
    const root = findTimelineRoot(range, timelineCards);
    root?.classList.add('yat-golden-timeline-root');
    range.closest('label, div')?.classList.add('yat-timeline-zoom');
  }

  timelineCards.forEach((button) => {
    const title = button.getAttribute('title') || '';
    button.classList.add('yat-timeline-card');

    if (/^Add\s+—\s+/i.test(title)) {
      button.classList.add('yat-timeline-primary-cta');
      button.innerHTML = '<span class="ytc-kicker">Add a moment in time</span><span class="ytc-team">Career Path Timeline</span><span class="ytc-level">+</span>';
      return;
    }

    if (/High school card|Profile headshot/i.test(title)) {
      button.classList.add('yat-timeline-photo-card');
      return;
    }

    const match = title.match(/^(\d{4})\s+—\s+(.+)$/);
    if (!match) return;
    const year = match[1];
    const rawTeam = match[2].trim();
    const level = levelByYearTeam.get(normalizeKey(year, rawTeam)) || '';
    button.innerHTML = `<span class="ytc-year">${year}</span><span class="ytc-team">${rawTeam}</span>${level ? `<span class="ytc-level">${level}</span>` : ''}`;
  });

  const originalUploads = Array.from(document.querySelectorAll<HTMLButtonElement>('button[title^="Upload a memory around"]'));
  originalUploads.forEach((button) => {
    button.classList.add('yat-hidden-upload-marker');
    button.setAttribute('aria-hidden', 'true');
    button.tabIndex = -1;
  });

  yearCards.forEach((card, index) => {
    if (index === 0) return;
    const parent = card.parentElement;
    if (!parent) return;
    const previous = card.previousElementSibling as HTMLElement | null;
    if (previous?.classList.contains('yat-between-upload')) return;
    const year = (card.getAttribute('title') || '').match(/^(\d{4})/)?.[1] || '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'yat-between-upload';
    button.title = year ? `Upload a memory before ${year}` : 'Upload a memory between timeline moments';
    button.textContent = '+';
    button.addEventListener('click', () => {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#ppTab-upload`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      document.querySelector<HTMLAnchorElement>('#playerFunZone .pp-fz-tab[href="#ppTab-upload"]')?.click();
    });
    parent.insertBefore(button, card);
  });
}

export default function ProfileFunZoneCleanupStyles() {
  useEffect(() => {
    enhanceProfileChrome();
    const onHash = () => enhanceProfileChrome();
    window.addEventListener('hashchange', onHash);
    const observer = new MutationObserver(() => enhanceProfileChrome());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('hashchange', onHash);
      observer.disconnect();
    };
  }, []);

  return (
    <style jsx global>{`
      /* Bottom FUNZONE tabs: only the active tab gets an indicator. */
      #playerFunZone .pp-fz-tab-default::before,
      #playerFunZone .pp-fz-tab-default::after,
      #playerFunZone .pp-fz-tab:not(.pp-fz-tab-active)::before,
      #playerFunZone .pp-fz-tab:not(.pp-fz-tab-active)::after {
        content: none !important;
        display: none !important;
        opacity: 0 !important;
      }

      #playerFunZone .pp-fz-tabs {
        width: 100% !important;
        display: grid !important;
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        align-items: center !important;
        justify-items: center !important;
        place-items: center !important;
      }

      #playerFunZone .pp-fz-tab {
        width: 100% !important;
        min-width: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        gap: 3px !important;
        padding: 0 !important;
      }

      #playerFunZone .pp-fz-tab i {
        font-size: 19px !important;
        line-height: 1 !important;
      }

      #playerFunZone .pp-fz-tab span {
        font: 900 10px/1 Oswald, sans-serif !important;
        letter-spacing: .08em !important;
      }

      #playerFunZone .pp-fz-tab.pp-fz-tab-active::before {
        content: '' !important;
        display: block !important;
        opacity: 1 !important;
        position: absolute !important;
        left: 24% !important;
        right: 24% !important;
        top: 0 !important;
        height: 3px !important;
        background: #d2b45c !important;
      }

      /* Block 3 Golden Line pass. */
      .yat-golden-timeline-root {
        position: relative !important;
        isolation: isolate !important;
        padding-bottom: 8px !important;
      }

      .yat-golden-timeline-root::after {
        content: '' !important;
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        height: 3px !important;
        background: #d2a13c !important;
        box-shadow: 0 0 10px rgba(210, 161, 60, .45) !important;
        z-index: 0 !important;
      }

      .yat-timeline-zoom {
        position: absolute !important;
        left: 30px !important;
        bottom: -31px !important;
        width: 170px !important;
        z-index: 6 !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }

      .yat-timeline-zoom input[type='range'] {
        width: 112px !important;
      }

      .yat-timeline-card {
        position: relative !important;
        z-index: 2 !important;
        display: inline-flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 2px !important;
        min-width: 72px !important;
        min-height: 76px !important;
        padding: 7px 6px !important;
        white-space: normal !important;
        text-align: center !important;
        overflow: hidden !important;
      }

      .yat-timeline-primary-cta {
        min-width: 138px !important;
        min-height: 82px !important;
        border-color: rgba(210, 180, 92, .9) !important;
      }

      .ytc-kicker,
      .ytc-year {
        display: block !important;
        font: 900 13px/.95 Oswald, sans-serif !important;
        letter-spacing: .08em !important;
        text-transform: uppercase !important;
        color: #fff !important;
      }

      .ytc-team {
        display: -webkit-box !important;
        -webkit-line-clamp: 2 !important;
        -webkit-box-orient: vertical !important;
        max-width: 100% !important;
        overflow: hidden !important;
        font: 900 9px/1.05 Oswald, sans-serif !important;
        letter-spacing: .04em !important;
        text-transform: uppercase !important;
        color: rgba(255,255,255,.92) !important;
      }

      .ytc-level {
        display: block !important;
        font: 900 8px/1 Oswald, sans-serif !important;
        letter-spacing: .1em !important;
        text-transform: uppercase !important;
        color: rgba(255,255,255,.74) !important;
      }

      .yat-hidden-upload-marker {
        display: none !important;
      }

      .yat-between-upload {
        position: relative !important;
        z-index: 3 !important;
        width: 22px !important;
        height: 22px !important;
        min-width: 22px !important;
        min-height: 22px !important;
        border-radius: 50% !important;
        border: 1px solid rgba(210, 180, 92, .9) !important;
        background: #050505 !important;
        color: #d2b45c !important;
        font: 900 15px/1 Oswald, sans-serif !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin: 0 5px !important;
      }

      @media (max-width: 760px) {
        #playerFunZone .pp-fz-tab i { font-size: 18px !important; }
        #playerFunZone .pp-fz-tab span { font-size: 9px !important; }
        .yat-timeline-card { min-width: 66px !important; }
        .yat-timeline-primary-cta { min-width: 116px !important; }
        .yat-timeline-zoom { left: 12px !important; width: 150px !important; }
      }
    `}</style>
  );
}
