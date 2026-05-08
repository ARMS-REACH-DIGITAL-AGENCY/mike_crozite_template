'use client';

import { useEffect } from 'react';

type ProfileMeta = {
  playerId: string;
  hsid: string;
  displayName: string;
  statusLabel: string;
  currentTeamName: string;
  levelLabel: string;
  position: string;
  batsThrows: string;
  heightWeight: string;
  classOf: string;
};

function esc(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function chip(value: string, label: string, extraClass = '') {
  return `
    <div class="pp-meta-chip ${extraClass}">
      <span class="pp-mc-val">${esc(value || '--')}</span>
      <span class="pp-mc-lbl">${esc(label)}</span>
    </div>
  `;
}

function fallbackReturnUrl(meta: ProfileMeta) {
  return `/${encodeURIComponent(meta.hsid)}?view=active&player=${encodeURIComponent(meta.playerId)}#player-${encodeURIComponent(meta.playerId)}`;
}

export default function ProfilePageEnhancer({ meta }: { meta: ProfileMeta }) {
  useEffect(() => {
    const row4 = document.querySelector('.yat-row4-shell') as HTMLElement | null;
    if (row4) {
      row4.innerHTML = `
        <div class="pp-meta-chips" aria-label="Player bio metadata">
          ${chip(meta.statusLabel, 'Status', meta.statusLabel.toUpperCase() === 'ACTIVE' ? 'pp-meta-active' : '')}
          ${chip(meta.currentTeamName, 'Current Team')}
          ${chip(meta.levelLabel, 'Level')}
          ${chip(meta.position, 'Position')}
          ${chip(meta.batsThrows, 'B/T')}
          ${chip(meta.heightWeight || meta.classOf, meta.heightWeight ? 'H/W' : 'Class')}
        </div>
      `;
      row4.classList.add('yat-row4-profile-populated');
    }

    const returnUrl = (() => {
      try {
        const saved = sessionStorage.getItem('yat:lastFlipCardReturnUrl') || '';
        if (saved && saved.includes(`#player-${meta.playerId}`)) return saved;
      } catch {}
      return fallbackReturnUrl(meta);
    })();

    document.querySelectorAll<HTMLAnchorElement>('a[aria-label="Back to Flip Card"], a[title="Back to Flip Card"]').forEach((link) => {
      link.href = returnUrl;
      link.setAttribute('data-return-to-flip-card', 'true');
    });
  }, [meta]);

  return (
    <style jsx global>{`
      .yat-row4-profile-populated {
        display: flex;
        align-items: stretch;
        padding: 0 !important;
      }

      .pp-meta-chips {
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        border-top: 1px solid rgba(255,255,255,.08);
        border-bottom: 1px solid rgba(255,255,255,.08);
      }

      .pp-meta-chip {
        display: flex;
        min-width: 0;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 7px 6px 6px;
        border-right: 1px solid rgba(255,255,255,.08);
        text-align: center;
      }

      .pp-meta-chip:first-child {
        border-left: 1px solid rgba(255,255,255,.08);
      }

      .pp-mc-val {
        display: block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--fg, #f4f4f4);
        font: 700 clamp(13px, 1.45vw, 22px)/1 "Bebas Neue", sans-serif;
        letter-spacing: .04em;
        text-transform: uppercase;
      }

      .pp-mc-lbl {
        color: rgba(255,255,255,.7);
        font: 300 9px/1.1 Oswald, sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .pp-meta-active .pp-mc-val { color: #20d67b; }

      body.light-theme .pp-mc-lbl { color: rgba(0,0,0,.58); }

      @media (max-width: 760px) {
        .pp-meta-chips { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .pp-meta-chip { min-height: 28px; padding: 4px 5px; }
        .pp-mc-val { font-size: 12px; }
        .pp-mc-lbl { font-size: 7px; }
      }
    `}</style>
  );
}
