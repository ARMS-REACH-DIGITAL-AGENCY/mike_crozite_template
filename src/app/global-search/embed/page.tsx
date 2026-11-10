// Embeddable version of the existing microsite Global Search.
// Intentionally mounts the SAME SearchDrawerTabs component and APIs used in
// the school drawer; this route does not duplicate search queries or renderers.
import type { Metadata } from "next";
import SearchDrawerTabs from "@/components/yatstats/SearchDrawerTabs";
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
      <div id="drawerLeft" className="yat-embedded-search" aria-label="Search the YAT?STATS database">
        <div className="yat-drawer-content yat-left-search-content">
          <div className="yat-search-drawer-title" id="gsTitle">SEARCH THE YAT?STATS DATABASE</div>
          <div className="yat-search-drawer-sub">
            Browse by the player&apos;s name, high school, or current college or professional team
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
            <span className="yat-embed-search-icon" aria-hidden="true">⌕</span>
          </div>
          <div id="gsResults" className="yat-gs-results" role="listbox" aria-label="Search results" aria-live="polite" aria-atomic="true" />
        </div>
      </div>
      <SearchDrawerTabs />
      <SearchEmbedBridge />
      <style>{`
        html, body { width:100%; height:100%; min-height:0; overflow:hidden; }
        body { padding-bottom:0 !important; background:transparent !important; }
        #drawerLeft.yat-embedded-search {
          --yat-bracket-accent:#ffb21c;
          width:100%; height:100%; min-height:0; overflow:hidden;
          background:rgba(8,8,8,.96); color:var(--fg,#f2f2f2);
          border:1px solid rgba(255,255,255,.17); border-radius:14px;
          box-shadow:0 12px 36px rgba(0,0,0,.48);
        }
        #drawerLeft.yat-embedded-search .yat-left-search-content {
          display:flex; flex-direction:column; height:100%; min-height:0;
          padding:15px 16px 12px; overflow:hidden;
        }
        #drawerLeft .yat-search-drawer-title {
          color:var(--fg); font:800 clamp(16px,2.3vw,21px)/1.12 Oswald,sans-serif;
          text-transform:uppercase; letter-spacing:.015em;
        }
        #drawerLeft .yat-search-drawer-sub {
          color:var(--muted); margin:5px 0 10px;
          font:400 11px/1.3 var(--yat-font-ui,Archivo,Arial,sans-serif);
        }
        #drawerLeft .yat-gs-input-wrap { position:relative; display:flex; align-items:center; flex:0 0 auto; }
        #drawerLeft .yat-gs-input {
          min-height:42px; width:100%; padding:9px 40px 9px 12px;
          font:400 14px/1.3 var(--yat-font-ui,Archivo,Arial,sans-serif);
          color:var(--fg); background:var(--card-bg); border:1px solid var(--line);
        }
        #drawerLeft .yat-gs-input:focus { outline:2px solid var(--line); outline-offset:2px; }
        #drawerLeft .yat-embed-search-icon {
          position:absolute; right:13px; top:50%; transform:translateY(-50%);
          font:700 23px/1 Oswald,sans-serif; color:var(--muted); pointer-events:none;
        }
        #drawerLeft .yat-search-mode-tabs { flex:0 0 auto; }
        #drawerLeft .yat-search-mode-buttons { margin:9px 0 9px; }
        #drawerLeft .yat-gs-results {
          flex:1 1 auto; min-height:0; max-height:none; overflow:auto;
          overscroll-behavior:contain; padding:0 2px 10px 0;
          scrollbar-color:#555 transparent;
        }
        #drawerLeft .yat-bracket-symbol {
          display:block; width:24px; height:24px; background-color:currentColor;
          -webkit-mask:url('/img/nav/fantasy-bracket.png') center / contain no-repeat;
          mask:url('/img/nav/fantasy-bracket.png') center / contain no-repeat;
        }
        @media (max-width:520px) {
          #drawerLeft.yat-embedded-search .yat-left-search-content {padding:12px 10px 8px;}
          #drawerLeft .yat-search-drawer-title {font-size:16px;}
          #drawerLeft .yat-search-drawer-sub {font-size:10px;}
          #drawerLeft .yat-search-mode-btn {font-size:10px!important;}
        }
      `}</style>
    </>
  );
}
