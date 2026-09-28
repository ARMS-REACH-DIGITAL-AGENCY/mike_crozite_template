'use client';

import { useEffect } from 'react';

const TAB_IDS = ['ppTab-schedule', 'ppTab-stats', 'ppTab-news', 'ppTab-social', 'ppTab-connect', 'ppTab-upload'];

function normalizeHash(value?: string | null) {
  const hash = value || window.location.hash || '#ppTab-stats';
  if (hash === '#ppTab-influence') return '#ppTab-upload';
  return TAB_IDS.includes(hash.replace('#', '')) ? hash : '#ppTab-stats';
}

// The Stories tab (#ppTab-upload) is filled by StoriesFeed. The old upload
// form this file used to inject there is gone: stories are added only from
// the Polaroid on the Career Path Timeline (StoryDrawer).

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
    if (tab.getAttribute('href') === '#ppTab-influence') {
      tab.href = '#ppTab-upload';
      tab.innerHTML = '<i class="ri-upload-cloud-line" aria-hidden="true"></i><span>Stories</span>';
    }
    tab.classList.toggle('pp-fz-tab-active', normalizeHash(tab.getAttribute('href')) === hash);
  });

  if (window.location.hash === '#ppTab-influence') history.replaceState(null, '', `${window.location.pathname}${window.location.search}#ppTab-upload`);
}

export default function ProfileFunZoneStabilizer({ playerId, hsid, playerName }: { playerId: string; hsid: string; playerName: string }) {
  useEffect(() => {
    activate(window.location.hash);

    const onClick = (event: MouseEvent) => {
      const tab = (event.target as HTMLElement | null)?.closest?.('.pp-fz-tab') as HTMLAnchorElement | null;
      if (!tab) return;
      const hash = normalizeHash(tab.getAttribute('href'));
      event.preventDefault();
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
      activate(hash);
    };

    const onHash = () => activate(window.location.hash);
    document.addEventListener('click', onClick, true);
    window.addEventListener('hashchange', onHash);
    const observer = new MutationObserver(onHash);
    const zone = document.getElementById('playerFunZone');
    if (zone) observer.observe(zone, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('hashchange', onHash);
      observer.disconnect();
    };
  }, [playerId, hsid, playerName]);

  return <style jsx global>{`
    .pp-funzone-outer, #playerFunZone { background:#070707 !important; }
    #playerFunZone { --profile-tabs-h:54px; position:relative !important; height:calc(100dvh - var(--row1-h,36px) - var(--row2-h,54px) - var(--row3-h,100px) - var(--row4-h,56px) - var(--footerH,76px)) !important; min-height:300px !important; overflow:hidden !important; display:block !important; padding-bottom:0 !important; }
    #playerFunZone > .pp-fz-panel { position:absolute !important; inset:0 0 var(--profile-tabs-h) 0 !important; display:none !important; visibility:hidden !important; overflow:auto !important; overscroll-behavior:contain !important; background:radial-gradient(circle at 50% 0%, rgba(255,255,255,.045), transparent 38%), #070707 !important; color:#f4f4f4 !important; padding:8px 8px 10px !important; }
    #playerFunZone > .pp-fz-panel.pp-fz-panel-active { display:block !important; visibility:visible !important; }
    #playerFunZone > .pp-fz-panel[hidden] { display:none !important; }
    #playerFunZone .pp-fz-tabs-shell { position:absolute !important; left:0 !important; right:0 !important; bottom:0 !important; height:var(--profile-tabs-h) !important; z-index:40 !important; background:rgba(7,7,7,.98) !important; border-top:1px solid rgba(255,255,255,.12) !important; box-shadow:0 -6px 16px rgba(0,0,0,.42) !important; overflow:hidden !important; }
    #playerFunZone .pp-fz-tabs { height:100% !important; display:grid !important; grid-template-columns:repeat(6,minmax(0,1fr)) !important; margin:0 auto !important; padding:0 4px !important; }
    #playerFunZone .pp-fz-tab { position:relative !important; display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; gap:2px !important; padding:3px 1px 2px !important; color:rgba(255,255,255,.72) !important; text-decoration:none !important; min-width:0 !important; }
    #playerFunZone .pp-fz-tab::before, #playerFunZone .pp-fz-tab::after, #playerFunZone .pp-fz-tab-default::before, #playerFunZone .pp-fz-tab-default::after { display:none !important; opacity:0 !important; }
    #playerFunZone .pp-fz-tab.pp-fz-tab-active { color:#fff !important; }
    #playerFunZone .pp-fz-tab.pp-fz-tab-active::before { content:'' !important; display:block !important; opacity:1 !important; position:absolute !important; left:18% !important; right:18% !important; top:0 !important; height:2px !important; background:#d2b45c !important; }
    #playerFunZone .pp-fz-tab i { font-size:20px !important; line-height:1 !important; }
    #playerFunZone .pp-fz-tab span { font:900 8px/1 Oswald,sans-serif !important; letter-spacing:.04em !important; text-transform:uppercase !important; overflow:hidden !important; text-overflow:ellipsis !important; white-space:nowrap !important; max-width:100% !important; }
    @media (max-width:760px) {
      #playerFunZone { --profile-tabs-h:48px; height:calc(100dvh - var(--row1-h,34px) - var(--row2-h,48px) - var(--row3-h,100px) - var(--row4-h,56px) - var(--footerH,76px)) !important; min-height:300px !important; overflow:hidden !important; }
      #playerFunZone > .pp-fz-panel { position:absolute !important; inset:0 0 var(--profile-tabs-h) 0 !important; overflow:auto !important; padding:6px 6px 8px !important; }
      #playerFunZone .pp-fz-tabs-shell { position:absolute !important; bottom:0 !important; height:var(--profile-tabs-h) !important; z-index:10010 !important; overflow:hidden !important; }
      #playerFunZone .pp-fz-tabs { height:var(--profile-tabs-h) !important; padding:0 3px !important; }
      #playerFunZone .pp-fz-tab { height:var(--profile-tabs-h) !important; padding:2px 1px 1px !important; gap:1px !important; }
      #playerFunZone .pp-fz-tab i { font-size:18px !important; }
      #playerFunZone .pp-fz-tab span { font-size:7px !important; letter-spacing:.03em !important; }
    }
  `}</style>;
}
