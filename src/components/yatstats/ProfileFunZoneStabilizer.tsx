'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { tabName, track } from '@/lib/analytics';

const TAB_IDS = ['ppTab-schedule', 'ppTab-stats', 'ppTab-news', 'ppTab-social', 'ppTab-connect', 'ppTab-upload'];

// The Fun Zone icon row. Rendered straight into <body> and pinned at the bottom of the viewport instead of above
// the former footer ad, so it's always on screen and page content can never
// scroll under it (inside the profile page's containers a position:fixed
// element is pinned to the page section instead of the screen).
const DOCK_TABS = [
  { id: 'ppTab-schedule', icon: 'ri-calendar-line', label: 'Game Log' },
  { id: 'ppTab-stats', icon: 'ri-bar-chart-2-line', label: 'Stats' },
  { id: 'ppTab-news', icon: 'ri-newspaper-line', label: 'News' },
  { id: 'ppTab-social', icon: 'ri-share-line', label: 'Social' },
  { id: 'ppTab-connect', icon: 'ri-group-line', label: 'Connect' },
  { id: 'ppTab-upload', icon: 'ri-upload-cloud-line', label: 'Stories' },
];

// Swiping the Fun Zone left/right moves to the next/previous tab. A swipe
// that starts in something that scrolls sideways (the stats table) scrolls
// that first and only changes tab once it's already at its edge.
const SWIPE_MIN_PX = 60;

function scrollsSideways(start: EventTarget | null, stop: Element, dx: number) {
  for (let el = start as HTMLElement | null; el && el !== stop; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const overflowX = getComputedStyle(el).overflowX;
    if (overflowX !== 'auto' && overflowX !== 'scroll') continue;
    // Finger moving left (dx < 0) scrolls the content right.
    if (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
    if (dx > 0 && el.scrollLeft > 1) return true;
  }
  return false;
}

// A profile opens on Stories unless the link names a tab (the flip card's
// "go to profile" link opens on the tab the fan was looking at).
function normalizeHash(value?: string | null) {
  const hash = value || window.location.hash || '#ppTab-upload';
  if (hash === '#ppTab-influence') return '#ppTab-upload';
  return TAB_IDS.includes(hash.replace('#', '')) ? hash : '#ppTab-upload';
}

// The Stories tab (#ppTab-upload) is filled by StoriesFeed. The old upload
// form this file used to inject there is gone: stories are added only from
// the Polaroid on the Career Path Timeline (StoryDrawer).

// The tab last shown, so switching tabs is reported once (the page view
// already carries the tab the profile opened on).
let shownTab: string | null = null;

function activate(hashValue?: string | null) {
  const zone = document.getElementById('playerFunZone');
  if (!zone) return;
  const hash = normalizeHash(hashValue);
  const activeId = hash.replace('#', '');
  if (shownTab && shownTab !== activeId) track('profile_tab_view', { profile_tab: tabName(activeId.replace('ppTab-', '')) });
  shownTab = activeId;

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

const noopSubscribe = () => () => {};

function goToTab(hash: string) {
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  activate(hash);
}

export default function ProfileFunZoneStabilizer({ playerId, hsid, playerName }: { playerId: string; hsid: string; playerName: string }) {
  // False during the server render, true once in the browser (the dock
  // needs document.body).
  const dockReady = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    activate(window.location.hash);

    const onClick = (event: MouseEvent) => {
      const tab = (event.target as HTMLElement | null)?.closest?.('.pp-fz-tab') as HTMLAnchorElement | null;
      if (!tab) return;
      event.preventDefault();
      goToTab(normalizeHash(tab.getAttribute('href')));
    };

    let touchStart: { x: number; y: number; target: EventTarget | null } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      const t = event.touches[0];
      touchStart = event.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, target: event.target } : null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const zone = document.getElementById('playerFunZone');
      const t = event.changedTouches[0];
      const start = touchStart;
      touchStart = null;
      if (!zone || !start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (scrollsSideways(start.target, zone, dx)) return;
      const current = TAB_IDS.indexOf(normalizeHash().replace('#', ''));
      const next = current + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= TAB_IDS.length) return;
      goToTab(`#${TAB_IDS[next]}`);
    };

    const onHash = () => activate(window.location.hash);
    document.addEventListener('click', onClick, true);
    window.addEventListener('hashchange', onHash);
    const observer = new MutationObserver(onHash);
    const zone = document.getElementById('playerFunZone');
    if (zone) observer.observe(zone, { childList: true, subtree: true });
    zone?.addEventListener('touchstart', onTouchStart, { passive: true });
    zone?.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('hashchange', onHash);
      observer.disconnect();
      zone?.removeEventListener('touchstart', onTouchStart);
      zone?.removeEventListener('touchend', onTouchEnd);
    };
  }, [playerId, hsid, playerName, dockReady]);

  const dock = dockReady
    ? createPortal(
        <div className="pp-fz-dock">
          <nav className="pp-fz-dock-tabs" aria-label="Player profile tabs">
            {DOCK_TABS.map((tab) => (
              <a key={tab.id} href={`#${tab.id}`} className="pp-fz-tab">
                <i className={tab.icon} aria-hidden="true" />
                <span>{tab.label}</span>
              </a>
            ))}
          </nav>
        </div>,
        document.body
      )
    : null;

  return <>{dock}<style jsx global>{`
    .pp-funzone-outer, #playerFunZone { background:#070707 !important; }
    #playerFunZone { --profile-tabs-h:54px; position:relative !important; height:calc(100dvh - var(--row1-h,36px) - var(--row2-h,54px) - var(--row3-h,100px) - var(--row4-h,56px)) !important; min-height:300px !important; overflow:hidden !important; display:block !important; padding-bottom:0 !important; }
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
    #playerFunZone .pp-fz-tab span { font:700 8px/1 var(--yat-font-ui,"Archivo",Arial,sans-serif) !important; letter-spacing:.01em !important; text-transform:none !important; overflow:hidden !important; text-overflow:ellipsis !important; white-space:nowrap !important; max-width:100% !important; }
    @media (max-width:760px) {
      #playerFunZone { --profile-tabs-h:48px; height:calc(100dvh - var(--row1-h,34px) - var(--row2-h,48px) - var(--row3-h,100px) - var(--row4-h,56px)) !important; min-height:300px !important; overflow:hidden !important; }
      #playerFunZone > .pp-fz-panel { position:absolute !important; inset:0 0 var(--profile-tabs-h) 0 !important; overflow:auto !important; padding:6px 6px 8px !important; }
      #playerFunZone .pp-fz-tabs-shell { position:absolute !important; bottom:0 !important; height:var(--profile-tabs-h) !important; z-index:10010 !important; overflow:hidden !important; }
      #playerFunZone .pp-fz-tabs { height:var(--profile-tabs-h) !important; padding:0 3px !important; }
      #playerFunZone .pp-fz-tab { height:var(--profile-tabs-h) !important; padding:2px 1px 1px !important; gap:1px !important; }
      #playerFunZone .pp-fz-tab i { font-size:18px !important; }
      #playerFunZone .pp-fz-tab span { font-size:7px !important; letter-spacing:.03em !important; }
    }

    /* The pinned icon row (see DOCK_TABS). The Fun Zone keeps the same
       space free at its bottom (--profile-tabs-h), which the dock covers. */
    :root { --pp-dock-h:var(--yat-dock-h,76px); }
    body #playerFunZone { --profile-tabs-h:var(--pp-dock-h) !important; }
    body .pp-fz-dock { position:fixed; left:0; right:0; bottom:0; height:var(--pp-dock-h); z-index:60; background:rgba(7,7,7,.98); border-top:1px solid rgba(255,255,255,.12); box-shadow:0 -6px 16px rgba(0,0,0,.42); }
    body .pp-fz-dock .pp-fz-dock-tabs { box-sizing:border-box; height:100%; width:100%; max-width:760px; margin:0 auto; padding:0 max(6px, env(safe-area-inset-left)); display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); }
    body .pp-fz-dock .pp-fz-tab { position:relative !important; box-sizing:border-box !important; width:auto !important; min-width:0 !important; max-width:none !important; height:100% !important; margin:0 !important; padding:6px 2px 5px !important; display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; gap:5px !important; color:rgba(255,255,255,.66) !important; text-decoration:none !important; border:0 !important; background:transparent !important; -webkit-tap-highlight-color:transparent; }
    body .pp-fz-dock .pp-fz-tab::before, body .pp-fz-dock .pp-fz-tab::after { content:none !important; display:none !important; }
    body .pp-fz-dock .pp-fz-tab i { font-size:22px !important; line-height:1 !important; margin:0 !important; }
    body .pp-fz-dock .pp-fz-tab span { display:block !important; max-width:100% !important; overflow:hidden !important; text-overflow:ellipsis !important; white-space:nowrap !important; font:700 clamp(9px, 2.5vw, 11px)/1 var(--yat-font-ui,"Archivo",Arial,sans-serif) !important; letter-spacing:0 !important; text-transform:none !important; }
    body .pp-fz-dock .pp-fz-tab:hover { color:#fff !important; }
    body .pp-fz-dock .pp-fz-tab.pp-fz-tab-active { color:#fff !important; }
    body .pp-fz-dock .pp-fz-tab.pp-fz-tab-active::before { content:'' !important; display:block !important; position:absolute !important; left:22% !important; right:22% !important; top:0 !important; height:3px !important; border-radius:0 0 2px 2px; background:#d2b45c !important; }
    body .pp-fz-dock .pp-fz-tab.pp-fz-tab-active i { color:#d2b45c !important; }
    @media (max-width:760px) { :root { --pp-dock-h:var(--yat-dock-h,76px); } }
  `}</style></>;
}
