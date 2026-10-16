'use client';

import { useEffect } from 'react';
import { CONTRIBUTE_OPTIONS, openContribute, scrollToContributeSection } from '@/lib/contribute';

// A page anchor is not a gallery tab. This route-owned rail remains present
// when the video section changes the hash to #sec-video.
export function ContributePortalRail() {
  return (
    <nav className="cc-portal-rail" aria-label="Connect and contribute shortcuts" data-portal-row3="true">
      {CONTRIBUTE_OPTIONS.map((option) => {
        const artwork = (
          <>
            <span className="cc-portal-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                {option.id === 'video' ? <><rect x="3" y="5" width="12" height="14" rx="2" /><path d="m15 10 6-4v12l-6-4" /></> :
                  option.id === 'photo' ? <><path d="M6 17a4 4 0 0 1-.8-7.9A7 7 0 0 1 18.6 9 4 4 0 0 1 18 17" /><path d="M12 21V11m-4 4 4-4 4 4" /></> :
                  option.id === 'data' ? <><path d="M3 21h18" /><path d="M4 21V11h4v10M10 21V4h4v17M16 21v-7h4v7" /></> :
                  <><rect x="4" y="3" width="13" height="18" rx="1" /><path d="M17 8h4v11a2 2 0 0 1-2 2H6M7 7h7M7 11h7M7 15h4M7 18h7" /></>}
              </svg>
            </span>
            <span className="cc-portal-label">{option.short}</span>
          </>
        );
        return option.id === 'video' ? (
          <a key={option.id} href="#sec-video" className="cc-portal-shortcut" onClick={(event) => {
            event.preventDefault();
            scrollToContributeSection('sec-video');
          }}>{artwork}</a>
        ) : (
          <button key={option.id} type="button" className="cc-portal-shortcut"
            onClick={() => openContribute({ tab: option.tab || 'photo' })}>{artwork}</button>
        );
      })}
    </nav>
  );
}

export default function ContributeViewportLayout() {
  useEffect(() => {
    let frame = 0;
    let last = '';
    let host: HTMLElement | null = null;
    const measure = () => {
      frame = 0;
      const root = document.querySelector<HTMLElement>('#sec-mentor .ccd');
      if (!root) return;
      const viewport = document.documentElement.clientHeight || window.innerHeight;
      const headers = ['.yat-row1-shell', '.yat-row2-shell', '.yat-row3-shell']
        .map((selector) => document.querySelector(selector)?.getBoundingClientRect().bottom || 0);
      const top = Math.ceil(Math.max(0, ...headers)) + 6;
      const footer = document.querySelector('.yat-clubhouse-footer')?.getBoundingClientRect();
      const bottom = footer && footer.height > 0 && footer.top >= 0 && footer.top < viewport
        ? footer.top : viewport - (footer?.height || 72);
      const room = Math.max(180, Math.floor(bottom - top - 8));
      const height = Math.min(460, room);
      const thumb = Math.max(24, Math.min(52, Math.floor(height / 7 - 10)));
      const signature = [top, height, thumb].join(':');
      if (host !== root || signature !== last) {
        root.style.setProperty('--ccdesk-top', `${top}px`);
        root.style.setProperty('--ccdesk-height', `${height}px`);
        root.style.setProperty('--ccdesk-thumb', `${thumb}px`);
        host = root;
        last = signature;
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    for (const selector of ['.yat-row1-shell', '.yat-row2-shell', '.yat-row3-shell', '.yat-clubhouse-footer']) {
      const node = document.querySelector(selector);
      if (node) resize.observe(node);
    }
    // The page is server streamed after the shared shell. Wait for its desk
    // without polling; style changes do not trigger this child-list observer.
    const mounted = new MutationObserver(schedule);
    mounted.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    window.visualViewport?.addEventListener('resize', schedule);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      mounted.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      host?.style.removeProperty('--ccdesk-top');
      host?.style.removeProperty('--ccdesk-height');
      host?.style.removeProperty('--ccdesk-thumb');
    };
  }, []);

  return <style jsx global>{`
    body:has(.cc-portal-rail) { --row3-h:84px; }
    .yat-row3-shell:has(.cc-portal-rail) { height:84px!important; min-height:84px!important; }
    .cc-portal-rail { display:flex;align-items:center;gap:8px;height:84px;width:100%;padding:4px 18px;overflow-x:auto;scrollbar-width:thin;box-sizing:border-box;background:var(--bg,#111);color:var(--fg,#fff); }
    .cc-portal-shortcut { appearance:none;flex:0 0 104px;width:104px;display:flex;flex-direction:column;align-items:center;gap:5px;padding:0;border:0;background:transparent;color:inherit;text-decoration:none;cursor:pointer; }
    .cc-portal-icon { display:grid;place-items:center;width:54px;height:54px;border:1px solid var(--line,#888);border-radius:50%;background:var(--card-bg,transparent); }
    .cc-portal-icon svg { width:28px;height:28px; }
    .cc-portal-label { font:700 10px/12px var(--yat-font-compact,'Barlow Condensed',sans-serif);white-space:nowrap; }
    .cc-portal-shortcut:focus-visible { outline:2px solid currentColor;outline-offset:2px;border-radius:4px; }
    #sec-mentor .ccd {
      --ccdesk-top:calc(var(--row1-h,36px) + var(--row2-h,48px) + 90px);
      --ccdesk-height:min(460px,calc(100dvh - var(--row1-h,36px) - var(--row2-h,48px) - 180px));
      --ccdesk-thumb:44px;
    }
    #sec-mentor .ccd > .ccd-columns { height:var(--ccdesk-height);min-height:0;align-items:stretch;gap:20px;padding-top:0; }
    #sec-mentor .ccd-columns .ccd-workspace,
    #sec-mentor .ccd-columns .ccd-contribute { height:100%;min-height:0; }
    #sec-mentor .ccd-columns .ccd-list { display:grid;grid-template-rows:repeat(7,minmax(0,1fr));gap:2px;height:100%;min-height:0; }
    #sec-mentor .ccd-columns .ccd-item { margin:0;min-height:0;display:flex;align-items:center; }
    #sec-mentor .ccd-columns .ccd-item-layout { grid-template-columns:var(--ccdesk-thumb) minmax(0,1fr);gap:12px;padding:4px 7px;height:100%;min-height:0;box-sizing:border-box; }
    #sec-mentor .ccd-columns .ccd-item-copy { justify-content:center;min-width:0; }
    #sec-mentor .ccd-columns .ccd-eyebrow { font:500 10px/1.15 var(--yat-font-compact,'Barlow Condensed',sans-serif);margin:0 0 3px;letter-spacing:.05em; }
    #sec-mentor .ccd-columns .ccd-title-button { font:800 clamp(13px,1.2vw,16px)/1.14 var(--yat-font-ui,'Archivo',sans-serif);letter-spacing:-.01em; }
    #sec-mentor .ccd-columns .ccd-summary,
    #sec-mentor .ccd-columns .ccd-item-actions,
    #sec-mentor .ccd-columns .ccd-placement-details,
    #sec-mentor .ccd-columns .ccd-footnote { display:none!important; }
    #sec-mentor .ccd-columns .ccd-image-button,
    #sec-mentor .ccd-columns .ccd-thumb,
    #sec-mentor .ccd-columns .ccd-thumb-photo { width:var(--ccdesk-thumb)!important;height:var(--ccdesk-thumb)!important;min-width:0;margin:0;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:visible; }
    #sec-mentor .ccd-columns .ccd-thumb img { width:100%;height:100%;object-fit:contain!important;padding:0!important;border:0;border-radius:0;background:transparent;filter:none; }
    #sec-mentor .ccd-columns .ccd-thumb-standard-icon { display:grid!important;place-items:center; }
    #sec-mentor .ccd-columns .ccd-thumb-standard-icon i { color:var(--fg);font-size:28px; }
    #sec-mentor .ccd-columns > .ccd-preview {
      display:grid;grid-template-rows:auto minmax(0,1fr) auto auto;gap:8px;
      position:sticky;top:var(--ccdesk-top);height:var(--ccdesk-height);max-height:var(--ccdesk-height);
      min-height:0;box-sizing:border-box;overflow:hidden;padding:12px;align-self:start;
    }
    #sec-mentor .ccd-columns > .ccd-preview .ccd-preview-heading { padding:0;margin:0; }
    #sec-mentor .ccd-columns > .ccd-preview .ccd-preview-heading h2 { font-size:18px;line-height:1.15;margin:0; }
    #sec-mentor .ccd-columns > .ccd-preview .ccd-preview-heading > span,
    #sec-mentor .ccd-columns > .ccd-preview .ccd-preview-heading > p,
    #sec-mentor .ccd-columns > .ccd-preview .ccd-real-page-figure figcaption,
    #sec-mentor .ccd-columns > .ccd-preview .ccd-example-label { display:none; }
    #sec-mentor .ccd-columns > .ccd-preview .ccd-example { height:100%;min-height:0;min-width:0; }
    #sec-mentor .ccd-columns > .ccd-preview .ccd-example-stage { height:100%;min-height:0!important;max-height:100%;padding:0;border:0;background:transparent; }
    #sec-mentor .ccd-columns > .ccd-preview .ccd-real-page-figure { height:100%;min-height:0;gap:0; }
    #sec-mentor .ccd-columns > .ccd-preview .ccd-real-page-image { width:100%;height:100%;max-height:100%;object-fit:contain; }
    #sec-mentor .ccd-columns > .ccd-preview .ccd-preview-copy { margin:0;padding:0;font:400 12px/1.35 var(--yat-font-ui,'Archivo',sans-serif); }
    #sec-mentor .ccd-columns > .ccd-preview > .ccd-preview-action { justify-self:start;max-width:100%;white-space:normal; }
    /* Inherit the same width token as the existing site drawers. Only the
       mobile form is full width. The form's fields stay in one column. */
    body #drawerContribute.yat-drawer { position:fixed!important;top:0!important;bottom:0!important;left:auto!important;right:0!important;height:100dvh!important;width:min(100vw,var(--yat-side-drawer-w,360px))!important;max-width:var(--yat-side-drawer-w,360px)!important;box-sizing:border-box;transform:translateX(105%);border-right:0;border-left:1px solid var(--line);z-index:2147483200!important;overflow-x:hidden;overflow-y:auto; }
    body.drawer-contribute-open #drawerContribute.yat-drawer { transform:translateX(0)!important; }
    /* Match the other docked YAT?STATS side drawers above 779px: the
       page is pushed LEFT of this right-hand drawer and remains usable.
       Mobile continues to use the normal full-screen modal overlay. */
    @media (min-width:780px) {
      body.drawer-contribute-open {overflow-y:auto!important;}
      body #drawerContribute.yat-drawer {
        top:calc(var(--row1-h) + var(--row2-h))!important;
        bottom:var(--footerH)!important;
        height:auto!important;
        z-index:64!important;
      }
      body.drawer-contribute-open .yat-drawer-mask {
        display:none!important;opacity:0!important;pointer-events:none!important;
      }
      body.drawer-contribute-open .yat-row3-shell,
      body.drawer-contribute-open .yat-row4-shell,
      body.drawer-contribute-open .yat-row5-shell,
      body.drawer-contribute-open .yat-row6-shell {
        margin-right:var(--yat-side-drawer-w,360px)!important;
        transition:margin-right .22s ease;
      }
    }
    body.drawer-contribute-open .yat-drawer-mask { display:block!important;opacity:1!important;pointer-events:auto!important;z-index:2147483199!important; }
    body #drawerContribute .ycd-main { grid-template-columns:minmax(0,1fr)!important;gap:16px; }
    body #drawerContribute .ycd-header,body #drawerContribute .ycd-body { box-sizing:border-box;max-width:100%;width:100%; }
    body #drawerContribute .ycd-header { position:sticky;top:0;z-index:3;background:var(--bg,#111); }
    @media(max-width:779px) { body #drawerContribute.yat-drawer { width:100vw!important;max-width:100vw!important; } }
    @media(max-width:740px) {
      .cc-portal-rail { padding-inline:8px;gap:4px; }
      .cc-portal-shortcut { flex-basis:86px;width:86px; }
      .cc-portal-label { font-size:9px; }
      #sec-mentor .ccd > .ccd-columns { display:flex;flex-direction:column;gap:12px;height:auto;padding:0 8px!important; }
      #sec-mentor .ccd-columns .ccd-workspace,
      #sec-mentor .ccd-columns .ccd-contribute { height:auto; }
      #sec-mentor .ccd-columns .ccd-list { height:auto;grid-template-rows:repeat(7,minmax(46px,auto));gap:2px; }
      #sec-mentor .ccd-columns .ccd-item-layout { --ccdesk-thumb:36px;gap:10px;padding:4px 5px; }
      #sec-mentor .ccd-columns .ccd-eyebrow { font-size:9px; }
      #sec-mentor .ccd-columns .ccd-title-button { font-size:14px; }
      #sec-mentor .ccd-columns > .ccd-preview { position:static;display:grid!important;grid-template-rows:auto auto auto auto;height:auto;max-height:none;overflow:visible; }
      #sec-mentor .ccd-columns > .ccd-preview .ccd-example { height:min(44svh,330px); }
      #sec-mentor .ccd-columns > .ccd-preview .ccd-preview-copy { font-size:12px; }
    }
    @media(min-width:741px) and (max-height:500px) {
      #sec-mentor .ccd-columns > .ccd-preview { overflow-y:auto;grid-template-rows:auto minmax(80px,1fr) auto auto; }
      #sec-mentor .ccd-columns .ccd-list { min-height:224px; }
      #sec-mentor .ccd-columns .ccd-workspace { overflow-y:auto; }
    }
  `}</style>;
}
