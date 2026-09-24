'use client';

import { useEffect } from 'react';

const TAB_IDS = ['ppTab-schedule', 'ppTab-stats', 'ppTab-news', 'ppTab-social', 'ppTab-connect', 'ppTab-upload'];

type StoriesApiMoment = {
  id?: string | number;
  title?: string | null;
  image_url?: string | null;
  image_data_url?: string | null;
};

function esc(value: unknown) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function normalizeHash(value?: string | null) {
  const hash = value || window.location.hash || '#ppTab-stats';
  if (hash === '#ppTab-influence') return '#ppTab-upload';
  return TAB_IDS.includes(hash.replace('#', '')) ? hash : '#ppTab-stats';
}

// Per direct instruction: this tab no longer collects an upload at all --
// that now happens exclusively through the Career Path Timeline's own
// Polaroid-triggered modal (ZoomableCareerTimeline.tsx's MomentUploadModal),
// which is already sign-in-gated on its own. This tab just shows what's
// already been shared, so it's never gated on sign-in itself -- viewing a
// public feed doesn't require an account, only contributing to it does.
function buildStoriesLoading() {
  return `<div class="stories-placeholder"><i class="ri-gallery-line" aria-hidden="true"></i><div>Loading memories...</div></div>`;
}

function buildStoriesEmpty(playerName: string) {
  const firstNameOnly = String(playerName || 'this player').split(' ')[0] || 'this player';
  return `<div class="stories-placeholder"><i class="ri-gallery-line" aria-hidden="true"></i><div>No memories shared yet. Look for the Polaroid on ${esc(firstNameOnly)}'s Career Path Timeline to add the first one.</div></div>`;
}

function buildStoriesGrid(moments: StoriesApiMoment[]) {
  const tiles = moments
    .map((moment) => {
      const src = moment.image_url || moment.image_data_url;
      if (!src || moment.id == null) return '';
      return `<div class="stories-tile" data-moment-id="${esc(String(moment.id))}"><img src="${esc(src)}" alt="${esc(moment.title || 'Fan memory')}" loading="lazy" /></div>`;
    })
    .filter(Boolean)
    .join('');
  return `<div class="stories-grid">${tiles}</div>`;
}

async function loadStoriesPanel(playerId: string, playerName: string) {
  const panel = document.getElementById('ppTab-upload') as HTMLElement | null;
  if (!panel) return;

  try {
    const res = await fetch(`/api/player-moments?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Stories fetch failed: ${res.status}`);
    const data = await res.json();
    const moments: StoriesApiMoment[] = Array.isArray(data?.moments) ? data.moments : [];
    panel.innerHTML = moments.length ? buildStoriesGrid(moments) : buildStoriesEmpty(playerName);
  } catch (error) {
    console.error('Stories fetch error:', error);
    panel.innerHTML = buildStoriesEmpty(playerName);
  }
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
    if (tab.getAttribute('href') === '#ppTab-influence') {
      tab.href = '#ppTab-upload';
    }
    // Relabeled unconditionally (not just when migrating off the old
    // #ppTab-influence href above) -- per direct instruction, renamed to
    // Stories now that this tab shows shared memories instead of
    // collecting an upload. The internal id/hash stays "ppTab-upload"
    // (never fan-facing) since renaming it would touch every reference
    // to it across this file and ZoomableCareerTimeline.tsx for no
    // visible difference.
    if (normalizeHash(tab.getAttribute('href')) === '#ppTab-upload') {
      tab.innerHTML = '<i class="ri-gallery-line" aria-hidden="true"></i><span>Stories</span>';
    }
    tab.classList.toggle('pp-fz-tab-active', normalizeHash(tab.getAttribute('href')) === hash);
  });

  if (window.location.hash === '#ppTab-influence') history.replaceState(null, '', `${window.location.pathname}${window.location.search}#ppTab-upload`);
}

export default function ProfileFunZoneStabilizer({ playerId, hsid, playerName }: { playerId: string; hsid: string; playerName: string }) {
  void hsid; // no longer used here -- was only ever passed through to the now-removed upload form.

  useEffect(() => {
    const panel = document.getElementById('ppTab-upload') as HTMLElement | null;
    if (panel && panel.getAttribute('data-stories-loaded') !== 'true') {
      panel.setAttribute('data-stories-loaded', 'true');
      panel.innerHTML = buildStoriesLoading();
      void loadStoriesPanel(playerId, playerName);
    }
    activate(window.location.hash);

    const onClick = (event: MouseEvent) => {
      const tab = (event.target as HTMLElement | null)?.closest?.('.pp-fz-tab') as HTMLAnchorElement | null;
      if (!tab) return;
      const hash = normalizeHash(tab.getAttribute('href'));
      event.preventDefault();
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
      activate(hash);
    };

    // Fired by ZoomableCareerTimeline.tsx when a fan clicks an already-
    // uploaded moment's small thumbnail on the timeline -- per direct
    // instruction, that click should jump here and scroll the matching
    // photo into view, not open a modal on the timeline itself.
    const onViewStory = (event: Event) => {
      const momentId = (event as CustomEvent).detail?.momentId;
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#ppTab-upload`);
      activate('#ppTab-upload');
      window.setTimeout(() => {
        const tile = momentId ? document.querySelector(`[data-moment-id="${CSS.escape(String(momentId))}"]`) : null;
        if (!tile) return;
        tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tile.classList.add('stories-tile-highlight');
        window.setTimeout(() => tile.classList.remove('stories-tile-highlight'), 1800);
      }, 80);
    };

    // Fired by MomentUploadModal on a successful submit -- refreshes this
    // grid live so a fan's own upload shows up here without a full page
    // reload, same event name the (unused) GoldenLineUploadPanel.tsx
    // already established for this purpose.
    const onUploaded = () => { void loadStoriesPanel(playerId, playerName); };

    const onHash = () => activate(window.location.hash);
    document.addEventListener('click', onClick, true);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('yat:view-story', onViewStory);
    window.addEventListener('yat:golden-line-uploaded', onUploaded);
    const observer = new MutationObserver(onHash);
    const zone = document.getElementById('playerFunZone');
    if (zone) observer.observe(zone, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('yat:view-story', onViewStory);
      window.removeEventListener('yat:golden-line-uploaded', onUploaded);
      observer.disconnect();
    };
  }, [playerId, playerName]);

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
    .stories-placeholder { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; height:100%; text-align:center; padding:24px; color:rgba(255,255,255,.55); }
    .stories-placeholder i { font-size:28px; opacity:.4; }
    .stories-placeholder div { font:400 13px/1.5 system-ui,sans-serif; max-width:320px; }
    .stories-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); gap:8px; }
    .stories-tile { aspect-ratio:1; border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.05); transition:box-shadow .3s, border-color .3s; }
    .stories-tile img { width:100%; height:100%; object-fit:cover; display:block; }
    .stories-tile-highlight { border-color:#d2b45c; box-shadow:0 0 0 3px rgba(210,180,92,.55); }
    @media (max-width:760px) {
      #playerFunZone { --profile-tabs-h:48px; height:calc(100dvh - var(--row1-h,34px) - var(--row2-h,48px) - var(--row3-h,100px) - var(--row4-h,56px) - var(--footerH,76px)) !important; min-height:300px !important; overflow:hidden !important; }
      #playerFunZone > .pp-fz-panel { position:absolute !important; inset:0 0 var(--profile-tabs-h) 0 !important; overflow:auto !important; padding:6px 6px 8px !important; }
      #playerFunZone .pp-fz-tabs-shell { position:absolute !important; bottom:0 !important; height:var(--profile-tabs-h) !important; z-index:10010 !important; overflow:hidden !important; }
      #playerFunZone .pp-fz-tabs { height:var(--profile-tabs-h) !important; padding:0 3px !important; }
      #playerFunZone .pp-fz-tab { height:var(--profile-tabs-h) !important; padding:2px 1px 1px !important; gap:1px !important; }
      #playerFunZone .pp-fz-tab i { font-size:18px !important; }
      #playerFunZone .pp-fz-tab span { font-size:7px !important; letter-spacing:.03em !important; }
      .stories-grid { grid-template-columns:repeat(auto-fill,minmax(72px,1fr)); }
    }
  `}</style>;
}
