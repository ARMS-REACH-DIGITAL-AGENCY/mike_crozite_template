'use client';

import { useEffect } from 'react';

const TAB_IDS = [
  'ppTab-schedule',
  'ppTab-stats',
  'ppTab-news',
  'ppTab-social',
  'ppTab-connect',
  'ppTab-upload',
];

function normalizeHash(value?: string | null) {
  const hash = value || window.location.hash || '#ppTab-stats';
  if (hash === '#ppTab-influence') return '#ppTab-upload';
  if (TAB_IDS.includes(hash.replace('#', ''))) return hash;
  return '#ppTab-stats';
}

function activate(hashValue?: string | null) {
  const zone = document.getElementById('playerFunZone');
  if (!zone) return;

  const hash = normalizeHash(hashValue);
  const activeId = hash.replace('#', '');

  TAB_IDS.forEach((id) => {
    const panel = document.getElementById(id) as HTMLElement | null;
    if (!panel) return;
    const isActive = id === activeId;
    panel.classList.toggle('pp-fz-panel-active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    panel.hidden = !isActive;
  });

  document.querySelectorAll<HTMLAnchorElement>('.pp-fz-tab').forEach((tab) => {
    const href = normalizeHash(tab.getAttribute('href'));
    if (tab.getAttribute('href') === '#ppTab-influence') {
      tab.href = '#ppTab-upload';
      tab.innerHTML = '<i class="ri-upload-cloud-line" aria-hidden="true"></i><span>Upload</span>';
    }
    tab.classList.toggle('pp-fz-tab-active', href === hash);
  });

  if (window.location.hash === '#ppTab-influence') {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#ppTab-upload`);
  }
}

export default function ProfileFunZoneStabilizer() {
  useEffect(() => {
    activate(window.location.hash);

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const tab = target?.closest?.('.pp-fz-tab') as HTMLAnchorElement | null;
      if (!tab) return;
      const hash = normalizeHash(tab.getAttribute('href'));
      event.preventDefault();
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
      activate(hash);
    };

    const onHash = () => activate(window.location.hash);
    document.addEventListener('click', onClick, true);
    window.addEventListener('hashchange', onHash);

    const observer = new MutationObserver(() => activate(window.location.hash));
    const zone = document.getElementById('playerFunZone');
    if (zone) observer.observe(zone, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('hashchange', onHash);
      observer.disconnect();
    };
  }, []);

  return (
    <style jsx global>{`
      .pp-funzone-outer,
      #playerFunZone {
        background: #070707 !important;
      }

      #playerFunZone {
        --profile-tabs-h: 88px;
        position: relative !important;
        height: calc(100dvh - var(--row1-h, 36px) - var(--row2-h, 54px) - var(--row3-h, 100px) - var(--row4-h, 56px) - var(--footerH, 76px)) !important;
        min-height: 330px !important;
        overflow: hidden !important;
        display: block !important;
      }

      #playerFunZone > .pp-fz-panel {
        position: absolute !important;
        inset: 0 0 var(--profile-tabs-h) 0 !important;
        display: none !important;
        visibility: hidden !important;
        overflow: auto !important;
        overscroll-behavior: contain !important;
        background: radial-gradient(circle at 50% 0%, rgba(255,255,255,.045), transparent 38%), #070707 !important;
        color: #f4f4f4 !important;
        padding-bottom: 18px !important;
      }

      #playerFunZone > .pp-fz-panel.pp-fz-panel-active {
        display: block !important;
        visibility: visible !important;
      }

      #playerFunZone > .pp-fz-panel[hidden] {
        display: none !important;
      }

      #playerFunZone .pp-fz-tabs-shell {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        height: var(--profile-tabs-h) !important;
        z-index: 40 !important;
        background: rgba(7,7,7,.96) !important;
        border-top: 1px solid rgba(255,255,255,.12) !important;
      }

      #playerFunZone .pp-fz-tabs {
        height: 100% !important;
        display: grid !important;
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
      }

      #playerFunZone .pp-fz-tab {
        position: relative !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        color: rgba(255,255,255,.72) !important;
        text-decoration: none !important;
      }

      #playerFunZone .pp-fz-tab::before,
      #playerFunZone .pp-fz-tab::after,
      #playerFunZone .pp-fz-tab-default::before,
      #playerFunZone .pp-fz-tab-default::after {
        display: none !important;
        opacity: 0 !important;
      }

      #playerFunZone .pp-fz-tab.pp-fz-tab-active {
        color: #fff !important;
      }

      #playerFunZone .pp-fz-tab.pp-fz-tab-active::before {
        content: '' !important;
        display: block !important;
        opacity: 1 !important;
        position: absolute !important;
        left: 12% !important;
        right: 12% !important;
        top: 0 !important;
        height: 3px !important;
        background: #d2b45c !important;
      }

      #playerFunZone .pp-fz-tab i {
        font-size: 28px !important;
        line-height: 1 !important;
      }

      #playerFunZone .pp-fz-tab span {
        font: 900 12px/1 Oswald, sans-serif !important;
        letter-spacing: .08em !important;
        text-transform: uppercase !important;
      }

      @media (max-width: 760px) {
        #playerFunZone {
          --profile-tabs-h: 94px;
          height: calc(100dvh - var(--row1-h, 34px) - var(--row2-h, 48px) - var(--row3-h, 100px) - var(--row4-h, 56px) - var(--footerH, 76px)) !important;
          min-height: 360px !important;
        }

        #playerFunZone .pp-fz-tab i {
          font-size: 31px !important;
        }

        #playerFunZone .pp-fz-tab span {
          font-size: 12px !important;
        }
      }
    `}</style>
  );
}
