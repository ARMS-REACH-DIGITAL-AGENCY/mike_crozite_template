// Embeddable version of the existing microsite Global Search.
// Intentionally mounts the SAME SearchDrawerTabs component and APIs used in
// the school drawer; this route does not duplicate search queries or renderers.
import type { Metadata } from "next";
import SearchDrawerTabs from "@/components/yatstats/SearchDrawerTabs";
import AccountDrawer from "@/components/yatstats/AccountDrawer";
import YatStyles from "@/components/yatstats/YatStyles";
import SearchEmbedBridge from "./SearchEmbedBridge";

export const metadata: Metadata = {
  title: "Search the YAT?STATS Database",
  robots: { index: false, follow: false },
};

export default function GlobalSearchEmbedPage() {
  return (
    <>
      <YatStyles />
      <div id="drawerLeft" className="yat-drawer yat-drawer-left yat-embedded-search" aria-label="Search the YAT?STATS database">
        <div className="yat-drawer-content yat-left-search-content">
          <div className="yat-search-drawer-title" id="gsTitle">SEARCH THE YAT?STATS DATABASE</div>
          <div className="yat-search-drawer-sub">
            Browse by the player&apos;s name, the high school he attended, or by his current college or professional team
          </div>
          <div className="yat-gs-input-wrap">
            <input
              id="gsInput"
              type="search"
              className="yat-gs-input"
              placeholder="Search by name, school, or team..."
              autoComplete="off"
              aria-label="Search YAT?STATS"
              aria-controls="gsResults"
              aria-autocomplete="list"
            />
            <i className="ri-search-line yat-gs-input-icon" aria-hidden="true" />
          </div>
          <div id="gsResults" className="yat-gs-results" role="listbox" aria-label="Search results" aria-live="polite" aria-atomic="true" />
        </div>
      </div>
      <div className="yat-drawer-mask" id="drawerMask" />
      <AccountDrawer subdomain="" />
      <SearchDrawerTabs />
      <SearchEmbedBridge />
      <style>{`
        /* Same shell variables, original SearchDrawerTabs renderer and original
           translucent left-drawer surface used by DrawerLayoutOverrides. */
        html,body{width:100%;height:100%;min-height:0;overflow:hidden}
        body{padding-bottom:0!important;background:transparent!important}
        #drawerLeft.yat-embedded-search{
          --yat-bracket-accent:#ffb21c;
          position:absolute!important;inset:0!important;left:0!important;
          width:100%!important;max-width:none!important;height:100%!important;
          transform:none!important;display:flex;flex-direction:column;
          overflow:hidden;border:0!important;border-radius:0!important;
          background:rgba(6,6,6,.57)!important;
          backdrop-filter:blur(3px)!important;
          -webkit-backdrop-filter:blur(3px)!important;
          color:var(--ink);box-shadow:none;
        }
        #drawerLeft.yat-embedded-search .yat-left-search-content{
          display:flex;flex:1 1 auto;flex-direction:column;
          height:100%;min-height:0;overflow:hidden;
          padding:clamp(14px,2.2vh,20px) 20px 10px;gap:0;
        }
        /* Same display fonts and dimensions as GlobalTopbar search drawer. */
        #drawerLeft .yat-search-drawer-title{
          max-width:100%;min-width:0;margin:0 0 8px;padding-right:42px;
          font:800 clamp(21px,2vw,25px)/1.05 var(--yat-font-compact);
          letter-spacing:.015em;text-transform:uppercase;white-space:normal;
          color:var(--ink);
        }
        #drawerLeft .yat-search-drawer-sub{
          margin:0 0 12px;color:var(--muted);
          font:400 12px/1.4 var(--yat-font-ui);
          letter-spacing:0;text-transform:none;
        }
        #drawerLeft .yat-gs-input-wrap{margin-bottom:10px;position:relative;display:flex;align-items:center;flex:0 0 auto}
        #drawerLeft .yat-gs-input-wrap i{position:absolute;right:11px;left:auto;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.78;z-index:2}
        #drawerLeft .yat-gs-input{
          width:100%;min-height:42px;
          padding:9px 38px 9px 12px!important;
          font:400 14px/1.35 var(--yat-font-ui)!important;
          letter-spacing:0!important;text-transform:none!important;
          background:var(--card-bg);color:var(--fg);
          border:1px solid var(--line);border-radius:6px;
        }
        #drawerLeft .yat-gs-input:focus{outline:2px solid var(--line);outline-offset:2px}
        #drawerLeft .yat-gs-input::placeholder{font:400 13px/1.35 var(--yat-font-ui);opacity:.8}
        #drawerLeft .yat-search-mode-tabs{flex:0 0 auto}
        #drawerLeft .yat-search-mode-buttons{margin:10px 0 14px}
        #drawerLeft .yat-gs-results{
          flex:1 1 auto;min-height:0;max-height:none!important;
          overflow-y:auto;overscroll-behavior:contain;
          padding:0 2px 10px 0;scrollbar-color:#555 transparent;
        }
        #drawerLeft .yat-bracket-symbol{
          display:block;width:24px;height:24px;flex:none;background-color:currentColor;
          -webkit-mask:url('/img/nav/fantasy-bracket.png') center/contain no-repeat;
          mask:url('/img/nav/fantasy-bracket.png') center/contain no-repeat;
        }
        @media(max-width:779px){
          #drawerLeft.yat-embedded-search{width:100vw!important;max-width:100vw!important}
        }
      `}</style>
    </>
  );
}
