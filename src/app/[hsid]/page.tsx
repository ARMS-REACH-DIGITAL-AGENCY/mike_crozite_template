// src/app/[hsid]/page.tsx
// YAT?STATS — Dynamic school microsite
// Design: Matches hamilton.yatstats.com prototype exactly
//   - Global header: hamburger + user + theme-toggle | nav-pairs | YAT?STATS wordmark
//   - School row: crest | city/state | school name | tagline (Bebas Neue)
//   - Hero strip: rotating taglines + search/filter icons
//   - Card grid: player photo bg, gradient shade, chips, name in Bebas Neue, varsity dots,
//     LAST 3 GAMES pill, NEXT GAME pill, "WHERE YAT THESE DAYS?" link
//   - Card back: back-nav tabs (STATS/NEWS/SOCIAL/MENTOR/GALLERY), stats grid
//   - Left drawer: search + nav links
//   - Right drawer: filters (name, level, grad class)
//   - Account drawer
//   - Theme toggle: dark/light (localStorage)
//   - Sponsor footer: fixed at bottom

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  getSchoolByHsid,
  getActiveRosterByHsid,
  getAllTimeRosterByHsid,
  getSchoolByUrl,
} from "@/lib/db";
import AccountDrawer from "@/components/AccountDrawer";
import SafeImage from "@/components/SafeImage";
import { getFirebaseConfigJSON } from "@/lib/firebase-config";

export const runtime = "nodejs";

function fmt(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "" || value === "--") return "--";
  const DECIMAL = ["AVG","OBP","SLG","OPS","ERA","WHIP","H9","BB9","K9","KBB","K/9","K/BB"];
  const k = key.toUpperCase();
  if (DECIMAL.includes(k)) {
    const num = parseFloat(String(value));
    if (isNaN(num)) return String(value);
    const decimals = k === "ERA" || k === "WHIP" ? 2 : 3;
    const str = num.toFixed(decimals);
    if (["AVG","OBP","SLG","OPS"].includes(k) && num < 1 && num >= 0) return str.substring(1);
    return str;
  }
  if (k === "IP") { const n = parseFloat(String(value)); return isNaN(n) ? String(value) : n.toFixed(1); }
  return String(value);
}

function parseDraft(raw: string | null): string {
  if (!raw) return "";
  const parts = raw.split("-");
  if (parts.length >= 3) return `${parts[0]} · Rd ${parts[1]} · #${parts[2]}${parts[3] ? " · " + parts[3] : ""}`;
  return raw;
}

function levelLabel(level: string): string {
  const map: Record<string,string> = {
    "MLB":"MLB","TRIPLE-A":"AAA","AAA":"AAA","DOUBLE-A":"AA","AA":"AA",
    "HIGH-A":"A+","A+":"A+","LOW-A":"A","A":"A","A-":"A-","Indy":"INDY",
    "NCAA":"NCAA","JrCollege":"JUCO","NAIA":"NAIA","Rk":"RK",
  };
  return map[level] || (level ? level.toUpperCase() : "");
}

function levelClass(lvl: string): string {
  if (lvl === "MLB") return "chip-mlb";
  if (lvl === "AAA") return "chip-aaa";
  if (lvl === "AA") return "chip-aa";
  if (lvl === "A+") return "chip-aplus";
  if (["A","A-","RK"].includes(lvl)) return "chip-a";
  if (lvl === "INDY") return "chip-indy";
  if (lvl === "NCAA") return "chip-ncaa";
  return "chip-other";
}

function gradClass(p: Record<string,unknown>): string {
  if (p.draft_info) { const yr = String(p.draft_info).split("-")[0]; if (yr && /^\d{4}$/.test(yr)) return yr; }
  if (p.playyears) { const years = String(p.playyears).split(",").map((y: string) => y.trim()).filter(Boolean); if (years.length) return years[0]; }
  return "";
}

function varsityDots(p: Record<string,unknown>): string[] {
  if (!p.playyears) return [];
  return String(p.playyears).split(",").map((y: string) => y.trim().slice(-2)).filter(Boolean).slice(0, 6);
}

export async function generateMetadata({ params }: { params: Promise<{ hsid: string }> }): Promise<Metadata> {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const school = host ? await getSchoolByUrl(`https://${host}`) : await getSchoolByHsid(hsid);
  const name = (school as Record<string,unknown>)?.hsname as string || "Your School";
  const loc = (school as Record<string,unknown>)?.hslocation as string || "";
  return {
    title: `WHERE THEY YAT? – ${name.toUpperCase()} | YAT?STATS`,
    description: `Track active and all-time baseball alumni from ${name} (${loc}).`,
  };
}

export default async function SchoolPage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const school = (host ? await getSchoolByUrl(`https://${host}`) : await getSchoolByHsid(hsid)) as Record<string,unknown> | null;
  if (!school) redirect("https://yatstats.com");

  const resolvedHsid = String(school.hsid ?? hsid);
  const [activeRoster, allTimeRoster] = await Promise.all([
    getActiveRosterByHsid(resolvedHsid),
    getAllTimeRosterByHsid(resolvedHsid),
  ]);

  const schoolName = (String(school.hsname || "")).toUpperCase();
  const location = (String(school.hslocation || "")).toUpperCase();
  const nickname = (String(school.nickname || "")).toUpperCase();
  const tagline = nickname || "ACTIVE BASEBALL ALUMNI";
  const crestUrl = `https://hamilton.yatstats.com/assets/img/schools/${resolvedHsid}.png`;

  const navItems = [
    { thin: "WHERE THEY", bold: "YAT?", tab: "active" },
    { thin: "ACTIVE ALUMNI", bold: "NEWS", tab: "news" },
    { thin: "NEXT-LEVEL", bold: "ALL-TIME LIST", tab: "alltime" },
    { thin: "THE", bold: "CURRENT TEAM", tab: "team" },
    { thin: "MENTORSHIP", bold: "MARKETPLACE", tab: "mentor" },
    { thin: "PCD ACTION", bold: "PARTNER PROGRAM", tab: "partner" },
    { thin: "", bold: "FAQ'S", tab: "faq" },
  ];

  const gradClasses = Array.from(new Set(
    [...(activeRoster as Record<string,unknown>[]), ...(allTimeRoster as Record<string,unknown>[])].map((p) => gradClass(p)).filter(Boolean)
  )).sort().reverse();

  // Extract subdomain for GHL tagging
  const ROOT_DOMAIN = "yatstats.com";
  const subdomainPart = host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1));
  const subdomain = subdomainPart.split(".")[0] || hsid || "unknown";

  return (
    <>
      <style>{`
        :root{--bg:#0c0c0c;--fg:#f2f2f2;--muted:#c4c4c4;--ink:#e8e8e8;--line:rgba(255,255,255,.08);--card-bg:#171717;--header-bg:#000;--drawer-bg:rgba(10,10,10,.95);--shade-end:rgba(0,0,0,.95);--hamSmall:13px;--hamBig:20px;--hamBigger:24px;--tagGrey:#cfd2d6;--crestH:clamp(42px,6.3vw,74px);--footerH:clamp(56px,8vh,77px);--green:#00e676;--gold:#ffc107;--blue:#42a5f5;--purple:#ce93d8;--orange:#ff9800}
        body.light-theme{--bg:#f4f4f4;--fg:#121212;--muted:#555;--ink:#222;--line:rgba(0,0,0,.1);--card-bg:#fff;--header-bg:#fff;--drawer-bg:rgba(255,255,255,.97);--tagGrey:#555;--shade-end:rgba(0,0,0,.85)}
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth}
        body{background:var(--bg);color:var(--fg);font-family:Oswald,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:var(--footerH);transition:background-color .3s,color .3s}
        body.drawer-open{overflow:hidden}
        a{color:inherit;text-decoration:none}
        .yat-container{max-width:1400px;margin:0 auto;padding:0 16px}
        .yat-header{position:sticky;top:0;z-index:50;background:var(--header-bg);transition:background-color .3s}
        .yat-topbar{display:flex;align-items:center;justify-content:space-between;padding:8px 0}
        .yat-left-icons{display:flex;align-items:center;gap:8px;margin-left:4px}
        .yat-icon-btn{background:none;border:none;color:var(--fg);opacity:.92;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0 2px;cursor:pointer}
        .yat-icon-btn i{font-size:20px}
        .yat-icon-btn:focus{outline:2px solid var(--fg);outline-offset:2px}
        .yat-topnav{display:flex;gap:18px;align-items:center}
        .yat-nav-pair{white-space:nowrap;cursor:pointer}
        .yat-nav-pair .thin{font:300 var(--hamSmall) Oswald,sans-serif;letter-spacing:.02em;color:#cfd2d6;margin-right:2px}
        body.light-theme .yat-nav-pair .thin{color:var(--muted)}
        .yat-nav-pair .bold{font:400 var(--hamSmall) "Bebas Neue",sans-serif}
        .yat-wordmark-wrap{display:flex;align-items:center;justify-content:flex-end;min-width:120px}
        .yat-wordmark{font:400 clamp(18px,3.2vw,26px) "Bebas Neue",sans-serif;letter-spacing:.06em;color:var(--fg);white-space:nowrap}
        body.light-theme .yat-wordmark{color:#000}
        @media(max-width:1200px){.yat-topnav{display:none!important}}
        .yat-hr{border-top:1px solid var(--line)}
        .yat-schoolrow{display:flex;align-items:center;gap:12px;padding:6px 16px}
        .yat-crest{height:var(--crestH);width:auto;object-fit:contain;display:block;flex-shrink:0}
        .yat-schooltext{line-height:1}
        .yat-schooltext .small{font:300 var(--hamSmall)/1 Oswald;letter-spacing:.12em;color:var(--muted)}
        .yat-schooltext .big1{font:400 var(--hamBig)/1 "Bebas Neue",sans-serif;letter-spacing:.04em}
        .yat-schooltext .big2{font:400 var(--hamBigger)/1 "Bebas Neue",sans-serif;letter-spacing:.04em;margin-top:-2px}
        .yat-hero{padding:2px 0}
        .yat-hero-grid{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:4px 0}
        .yat-hero-left{display:flex;flex-direction:column;gap:4px}
        .yat-hero-right{display:flex;gap:10px}
        .yat-tag-duo{position:relative;height:1.8em;font-size:var(--hamBig)}
        .yat-tag-swap{position:absolute;left:0;top:0;right:0;opacity:0;animation:yatswap 6s infinite;white-space:nowrap}
        .yat-tag-swap:nth-child(1){animation-delay:0s}
        .yat-tag-swap:nth-child(2){animation-delay:3s}
        .yat-tag-grey{font:300 1em Oswald,sans-serif;letter-spacing:.02em;color:var(--tagGrey)}
        body.light-theme .yat-tag-grey{color:var(--muted)}
        .yat-tag-bold{font:400 1em "Bebas Neue",sans-serif}
        @keyframes yatswap{0%{opacity:0}5%{opacity:1}45%{opacity:1}50%{opacity:0}100%{opacity:0}}
        .yat-crumbs{font:300 calc(var(--hamSmall)*.85)/1 Oswald;letter-spacing:.02em;color:var(--muted);text-transform:uppercase;margin-top:3px}
        .yat-chip{display:inline-block;font:700 9px/1 Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.5);color:#fff}
        body.light-theme .yat-chip{border-color:rgba(0,0,0,.2);background:rgba(0,0,0,.08);color:#222}
        .chip-mlb{background:rgba(0,230,118,.15);border-color:#00e676;color:#00e676}
        .chip-aaa{background:rgba(255,193,7,.12);border-color:#ffc107;color:#ffc107}
        .chip-aa{background:rgba(66,165,245,.12);border-color:#42a5f5;color:#42a5f5}
        .chip-aplus{background:rgba(206,147,216,.12);border-color:#ce93d8;color:#ce93d8}
        .chip-a{background:rgba(255,152,0,.1);border-color:#ff9800;color:#ff9800}
        .chip-indy{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.25);color:#ccc}
        .chip-ncaa{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.15);color:#aaa}
        .chip-other{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);color:#888}
        .chip-sm{font-size:8px;padding:2px 5px}
        .front-chip{background:rgba(0,0,0,.55);color:#fff;border-radius:6px;padding:2px 6px;font-weight:700;font-family:Oswald,sans-serif;border:1px solid rgba(255,255,255,.2);text-transform:uppercase;font-size:10px}
        .yat-section{display:none}
        .yat-section.visible{display:block}
        .yat-sec-header{display:flex;align-items:center;justify-content:space-between;padding:24px 16px 12px;border-bottom:1px solid var(--line)}
        .yat-sec-title{font:400 22px "Bebas Neue",sans-serif;letter-spacing:.02em}
        .yat-sec-sub{font:300 12px Oswald,sans-serif;color:var(--muted);margin-top:2px}
        .yat-legend{display:flex;gap:6px;flex-wrap:wrap}
        .yat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px;padding:20px 16px}
        .yat-card{position:relative;background:var(--card-bg);border:1px solid var(--line);overflow:hidden;transition:transform .3s cubic-bezier(.2,.7,.2,1);perspective:1000px;aspect-ratio:1/1.4}
        .yat-card:hover{transform:translateY(-4px);border-color:rgba(255,255,255,.2)}
        .yat-card-inner{position:relative;width:100%;height:100%;transition:transform .6s;transform-style:preserve-3d}
        .yat-card.is-flipped .yat-card-inner{transform:rotateY(180deg)}
        .yat-card-front,.yat-card-back{position:absolute;width:100%;height:100%;backface-visibility:hidden;overflow:hidden}
        .yat-card-back{transform:rotateY(180deg);background:#1a1a1a;display:flex;flex-direction:column}
        .yat-photo-bg{position:absolute;inset:0;background-size:cover;background-position:center;transition:transform .5s}
        .yat-card:hover .yat-photo-bg{transform:scale(1.05)}
        .yat-shade{position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,var(--shade-end) 95%)}
        .yat-card-content{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:16px;pointer-events:none}
        .yat-card-content > *{pointer-events:auto}
        .yat-card-top{position:absolute;top:12px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:flex-start}
        .yat-name{font:400 28px "Bebas Neue",sans-serif;line-height:.9;letter-spacing:.02em;margin-bottom:4px}
        .yat-dots{display:flex;gap:3px;margin-bottom:8px}
        .yat-dot{width:6px;height:6px;border-radius:50%;background:var(--green);opacity:.8}
        .yat-pills{display:flex;gap:6px;margin-bottom:10px}
        .yat-pill{font:700 9px Oswald,sans-serif;padding:3px 8px;border-radius:12px;background:rgba(255,255,255,.1);color:var(--muted);text-transform:uppercase}
        .yat-pill.active{background:rgba(0,230,118,.2);color:var(--green)}
        .yat-where-link{font:400 11px "Bebas Neue",sans-serif;letter-spacing:.05em;color:var(--green);display:inline-flex;align-items:center;gap:4px}
        .yat-back-header{padding:12px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px}
        .yat-back-crest{width:32px;height:32px;object-fit:contain}
        .yat-back-name{font:400 18px "Bebas Neue",sans-serif}
        .yat-back-details{font:300 10px Oswald,sans-serif;color:var(--muted);margin-top:1px}
        .yat-back-nav{display:flex;border-bottom:1px solid var(--line)}
        .yat-back-nav-btn{flex:1;background:none;border:none;color:var(--muted);font:400 11px "Bebas Neue",sans-serif;padding:8px 0;cursor:pointer;transition:color .2s}
        .yat-back-nav-btn.active{color:var(--fg);box-shadow:inset 0 -2px 0 var(--fg)}
        .yat-fun-zone{flex:1;overflow-y:auto;padding:12px}
        .yat-stats-bar{background:rgba(255,255,255,.05);padding:4px 8px;font:700 9px Oswald,sans-serif;letter-spacing:.05em;margin-bottom:8px}
        .yat-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        .yat-stat{text-align:center}
        .yat-stat-label{font:300 9px Oswald,sans-serif;color:var(--muted);text-transform:uppercase}
        .yat-stat-val{font:400 14px "Bebas Neue",sans-serif}
        .yat-back-draft{padding:8px 12px;font:300 10px Oswald,sans-serif;border-top:1px solid var(--line);color:var(--muted)}
        .yat-table-wrap{width:100%;overflow-x:auto;padding:0 16px 40px}
        .yat-table{width:100%;border-collapse:collapse;font-family:Oswald,sans-serif;font-size:13px}
        .yat-table th{text-align:left;padding:12px 8px;border-bottom:2px solid var(--line);font-weight:400;color:var(--muted);text-transform:uppercase;font-size:11px}
        .yat-table td{padding:10px 8px;border-bottom:1px solid var(--line)}
        .yat-table tr:hover{background:rgba(255,255,255,.02)}
        .yat-table .num{text-align:right;font-family:"Bebas Neue",sans-serif;font-size:15px}
        .yat-table .hi{color:var(--green)}
        .yat-active-dot{display:inline-block;width:6px;height:6px;background:var(--green);border-radius:50%;margin-right:6px}
        .yat-placeholder{padding:60px 20px;text-align:center;max-width:500px;margin:0 auto}
        .yat-placeholder-icon{font-size:48px;margin-bottom:16px;opacity:.5}
        .yat-placeholder-title{font:400 28px "Bebas Neue",sans-serif;margin-bottom:8px}
        .yat-placeholder-body{font:300 14px Oswald,sans-serif;color:var(--muted);line-height:1.6}
        .yat-footer{position:fixed;bottom:0;left:0;right:0;height:var(--footerH);background:var(--header-bg);border-top:1px solid var(--line);display:flex;align-items:center;justify-content:center;z-index:40}
        .yat-footer a{display:flex;flex-direction:column;align-items:center;line-height:1.1}
        .yat-footer .sponsor-text{font:300 10px Oswald,sans-serif;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
        .yat-footer .sponsor-name{font:400 18px "Bebas Neue",sans-serif;letter-spacing:.02em}
        .yat-drawer{position:fixed;top:0;bottom:0;width:min(360px,85vw);background:var(--drawer-bg);backdrop-filter:blur(12px);z-index:100;transition:transform .3s cubic-bezier(.2,.7,.2,1);padding:20px 0}
        .yat-drawer-left{left:0;transform:translateX(-100%);border-right:1px solid var(--line)}
        .yat-drawer-right{right:0;transform:translateX(100%);border-left:1px solid var(--line)}
        body.drawer-left-open .yat-drawer-left{transform:translateX(0)}
        body.drawer-right-open .yat-drawer-right{transform:translateX(0)}
        body.drawer-account-open #drawerAccount{transform:translateX(0)}
        .yat-drawer-mask{position:fixed;inset:0;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .3s;z-index:90}
        body.drawer-open .yat-drawer-mask{opacity:1;pointer-events:auto}
        .yat-close-btn{position:absolute;top:16px;right:16px}
        .yat-drawer h3{font:400 24px "Bebas Neue",sans-serif;padding:0 20px;margin-bottom:20px}
        .yat-drawer-content{padding:0 20px;overflow-y:auto;height:calc(100% - 60px)}
        .yat-nav-list{list-style:none}
        .yat-nav-item{margin-bottom:4px}
        .yat-nav-link{display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;transition:background .2s}
        .yat-nav-link:hover{background:rgba(255,255,255,.05)}
        .yat-nav-link i{font-size:20px;color:var(--muted)}
        .yat-search-box{position:relative;margin-bottom:20px}
        .yat-search-box i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted)}
        .yat-search-input{width:100%;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:8px;padding:10px 10px 10px 40px;color:var(--fg);font:300 14px Oswald,sans-serif}
        .yat-filter-group{margin-bottom:24px}
        .yat-filter-label{font:400 14px "Bebas Neue",sans-serif;color:var(--muted);margin-bottom:12px;display:block;letter-spacing:.05em}
        .yat-filter-options{display:flex;flex-direction:column;gap:8px}
        .yat-filter-opt{display:flex;align-items:center;gap:10px;cursor:pointer;font:300 13px Oswald,sans-serif}
        .yat-filter-opt input{accent-color:var(--green)}
        .yat-empty{padding:40px 20px;text-align:center;opacity:.5}
        .yat-empty-icon{font-size:32px;margin-bottom:12px}
        .yat-empty-title{font:400 18px "Bebas Neue",sans-serif}
        .yat-empty-sub{font:300 12px Oswald,sans-serif}
      `}</style>

      <div className="yat-drawer-mask" id="drawerMask" />

      {/* LEFT DRAWER */}
      <aside className="yat-drawer yat-drawer-left" id="drawerLeft">
        <button className="yat-icon-btn yat-close-btn" id="closeLeft"><i className="ri-close-line" /></button>
        <h3>MENU</h3>
        <div className="yat-drawer-content">
          <div className="yat-search-box">
            <i className="ri-search-line" />
            <input type="text" className="yat-search-input" id="playerSearch" placeholder="Search players..." />
          </div>
          <div id="liveResults" />
          <nav className="yat-nav-list">
            {navItems.map((item) => (
              <li key={item.tab} className="yat-nav-item">
                <a href="#" className="yat-nav-link" data-tab={item.tab}>
                  <div className="yat-nav-pair">
                    <span className="thin">{item.thin}</span>
                    <span className="bold">{item.bold}</span>
                  </div>
                </a>
              </li>
            ))}
          </nav>
        </div>
      </aside>

      {/* RIGHT DRAWER (FILTERS) */}
      <aside className="yat-drawer yat-drawer-right" id="drawerFilters">
        <button className="yat-icon-btn yat-close-btn" id="closeFilters"><i className="ri-close-line" /></button>
        <h3>FILTERS</h3>
        <div className="yat-drawer-content" id="filters">
          <div className="yat-filter-group">
            <label className="yat-filter-label">SEARCH BY NAME</label>
            <input type="text" className="yat-search-input" id="filterName" placeholder="Enter name..." style={{paddingLeft:"12px"}} />
          </div>
          <div className="yat-filter-group" id="filterLevels">
            <label className="yat-filter-label">LEVEL</label>
            <div className="yat-filter-options">
              {["MLB","AAA","AA","A+","A","INDY","NCAA","JUCO"].map((lvl) => (
                <label key={lvl} className="yat-filter-opt">
                  <input type="checkbox" value={lvl} defaultChecked /> {lvl}
                </label>
              ))}
            </div>
          </div>
          <div className="yat-filter-group" id="filterGradClass">
            <label className="yat-filter-label">GRAD CLASS</label>
            <div className="yat-filter-options">
              {gradClasses.map((gc) => (
                <label key={gc} className="yat-filter-opt">
                  <input type="checkbox" value={gc} defaultChecked /> {gc}
                </label>
              ))}
            </div>
          </div>
          <button id="filtersReset" style={{width:"100%",padding:"12px",background:"rgba(255,255,255,.05)",border:"1px solid var(--line)",borderRadius:"8px",color: "var(--muted)",fontFamily:'"Bebas Neue",sans-serif',fontSize:"14px",letterSpacing:".1em",cursor:"pointer"}}>RESET FILTERS</button>
        </div>
      </aside>

      {/* ACCOUNT DRAWER */}
      <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
        <button className="yat-icon-btn yat-close-btn" id="closeAccount"><i className="ri-close-line" /></button>
        <h3>ACCOUNT</h3>
        <AccountDrawer subdomain={subdomain} />
      </aside>

      <header className="yat-header">
        <div className="yat-container">
          <div className="yat-topbar">
            <div className="yat-left-icons">
              <button className="yat-icon-btn" id="btnMenu"><i className="ri-menu-line" /></button>
              <button className="yat-icon-btn" id="btnAccount"><i className="ri-user-line" /></button>
              <button className="yat-icon-btn" id="theme-toggle"><i className="ri-sun-line" /></button>
            </div>
            <nav className="yat-topnav">
              {navItems.slice(0, 6).map((item) => (
                <a key={item.tab} href="#" className="yat-nav-pair" data-tab={item.tab}>
                  <span className="thin">{item.thin}</span>
                  <span className="bold">{item.bold}</span>
                </a>
              ))}
            </nav>
            <div className="yat-wordmark-wrap">
              <span className="yat-wordmark">YAT?STATS</span>
            </div>
          </div>
        </div>
        <div className="yat-hr" />
        <div className="yat-schoolrow">
          <SafeImage src={crestUrl} alt={schoolName} className="yat-crest" />
          <div className="yat-schooltext">
            <div className="small">{location}</div>
            <div className="big1">{schoolName}</div>
            <div className="big2">{tagline}</div>
          </div>
        </div>
        <div className="yat-hr" />
        <div className="yat-hero">
          <div className="yat-container">
            <div className="yat-hero-grid">
              <div className="yat-hero-left">
                <div className="yat-tag-duo">
                  <div className="yat-tag-swap">
                    <span className="yat-tag-grey">WHERE THEY</span> <span className="yat-tag-bold">YAT?</span>
                  </div>
                  <div className="yat-tag-swap">
                    <span className="yat-tag-grey">ACTIVE ALUMNI</span> <span className="yat-tag-bold">NEWS</span>
                  </div>
                </div>
                <div className="yat-crumbs">HOME / {schoolName} / {tagline}</div>
              </div>
              <div className="yat-hero-right">
                <button className="yat-icon-btn" id="openSearch"><i className="ri-search-line" /></button>
                <button className="yat-icon-btn" id="openFilters"><i className="ri-filter-3-line" /></button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content">

        {/* ACTIVE ALUMNI */}
        <section id="sec-active" className="yat-section visible">
          <div className="yat-sec-header">
            <div>
              <div className="yat-sec-title">{(activeRoster as unknown[]).length} Active Alumni · {schoolName}</div>
              <div className="yat-sec-sub">Players with 2025 stats · Sorted by career peak level</div>
            </div>
            <div className="yat-legend">
              {(["MLB","AAA","AA","A+","A","INDY","NCAA","JUCO"] as const).map((lbl) => (
                <span key={lbl} className={`yat-chip chip-sm ${levelClass(lbl)}`}>{lbl}</span>
              ))}
            </div>
          </div>
          <div className="yat-grid" id="active-grid">
            {(activeRoster as Record<string,unknown>[]).length === 0 ? (
              <div className="yat-empty">
                <div className="yat-empty-icon">⚾</div>
                <div className="yat-empty-title">No active players found</div>
                <div className="yat-empty-sub">Check back once the 2026 season begins</div>
              </div>
            ) : (activeRoster as Record<string,unknown>[]).map((p) => {
              const lvl = levelLabel(String(p.level || ""));
              const lvlCls = levelClass(lvl);
              const isPitcher = p.is_pitcher === true;
              const gc = gradClass(p);
              const dots = varsityDots(p);
              const draft = parseDraft(p.draft_info as string | null);
              const statYear = isPitcher ? p.pitch_year : p.stat_year;
              const fn = String(p.firstname || "").toLowerCase().replace(/[^a-z0-9]/g, "_");
              const ln = String(p.lastname  || "").toLowerCase().replace(/[^a-z0-9]/g, "_");
              const photoUrl = `https://hamilton.yatstats.com/assets/img/now_players/${fn}_${ln}.jpg`;
              const batterStats = [
                {k:"AVG",v:p.avg},{k:"OBP",v:p.obp},{k:"SLG",v:p.slg},{k:"OPS",v:p.ops},
                {k:"HR",v:p.hr},{k:"RBI",v:p.rbi},{k:"H",v:p.h},{k:"AB",v:p.ab},
                {k:"R",v:p.r},{k:"SB",v:p.sb},{k:"2B",v:p["2b"]},{k:"BB",v:p.bb},
              ];
              const pitcherStats = [
                {k:"ERA",v:p.era},{k:"WHIP",v:p.whip},{k:"IP",v:p.ip},
                {k:"W-L",v:(p.w!==null&&p.l!==null)?`${p.w}-${p.l}`:"--"},
                {k:"K",v:p.ko},{k:"BB",v:p.pbb},{k:"K/9",v:p.k9},{k:"K/BB",v:p.kbb},
                {k:"H/9",v:p.h9},{k:"BB/9",v:p.bb9},{k:"SV",v:p.saves},{k:"G",v:p.pg},
              ];
              const stats = isPitcher ? pitcherStats : batterStats;
              return (
                <article key={String(p.playerid)} className="yat-card" data-name={String(p.display_name || `${p.firstname} ${p.lastname}`).toLowerCase()} data-level={lvl} data-gradclass={gc}>
                  <div className="yat-card-inner">
                    <div className="yat-card-front">
                      <div className="yat-photo-bg" style={{backgroundImage:`url(${photoUrl}), url('https://hamilton.yatstats.com/assets/img/now_players/default.jpg')`}} />
                      <div className="yat-shade" />
                      <div className="yat-card-top">
                        <span className={`yat-chip ${lvlCls}`}>{lvl}</span>
                        {gc && <span className="yat-chip chip-other">{gc}</span>}
                      </div>
                      <div className="yat-card-content">
                        <div className="yat-name">{String(p.display_name || `${p.firstname} ${p.lastname}`)}</div>
                        <div className="yat-dots">
                          {dots.map((d,idx)=><div key={idx} className="yat-dot" title={`'${d}`} />)}
                        </div>
                        <div className="yat-pills">
                          <div className="yat-pill active">LAST 3 GAMES</div>
                          <div className="yat-pill">NEXT GAME</div>
                        </div>
                        <a href="#" className="yat-where-link">WHERE YAT THESE DAYS? <i className="ri-arrow-right-line" /></a>
                      </div>
                    </div>
                    <div className="yat-card-back">
                      <div className="yat-back-header">
                        <SafeImage src={crestUrl} alt="" className="yat-back-crest" />
                        <div>
                          <div className="yat-back-name">{String(p.display_name || `${p.firstname} ${p.lastname}`)}</div>
                          <div className="yat-back-details">
                            {[p.position,p.height||null,p.weight?`${p.weight} lbs`:null,p.bats&&p.throws?`B/T ${p.bats}/${p.throws}`:null].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </div>
                      <div className="yat-back-nav">
                        <button className="yat-back-nav-btn active" data-content="stats">STATS</button>
                        <button className="yat-back-nav-btn" data-content="news">NEWS</button>
                        <button className="yat-back-nav-btn" data-content="social">SOCIAL</button>
                        <button className="yat-back-nav-btn" data-content="mentor">MENTOR</button>
                        <button className="yat-back-nav-btn" data-content="gallery">GALLERY</button>
                      </div>
                      <div className="yat-fun-zone">
                        <div className="yat-stats-bar">{statYear ? `${statYear} ` : ""}{isPitcher ? "PITCHING" : "BATTING"}</div>
                        <div className="yat-stats-grid">
                          {stats.map(({k,v}) => (
                            <div key={k} className="yat-stat">
                              <div className="yat-stat-label">{k}</div>
                              <div className="yat-stat-val">{fmt(k,v)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {draft && <div className="yat-back-draft"><strong>Draft:</strong> {draft}</div>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ALL-TIME LIST */}
        <section id="sec-alltime" className="yat-section">
          <div className="yat-sec-header">
            <div>
              <div className="yat-sec-title">{(allTimeRoster as unknown[]).length} All-Time Alumni · {schoolName}</div>
              <div className="yat-sec-sub">Every player ever tagged to this school</div>
            </div>
          </div>
          <div className="yat-table-wrap">
            <table className="yat-table">
              <thead>
                <tr>
                  <th>#</th><th>Player</th><th>Level</th><th>Pos</th><th>Years</th><th>Draft</th>
                  <th className="num">AVG</th><th className="num">OBP</th><th className="num">SLG</th><th className="num">OPS</th>
                  <th className="num">HR</th><th className="num">RBI</th>
                  <th className="num">ERA</th><th className="num">WHIP</th><th className="num">IP</th><th className="num">K</th>
                </tr>
              </thead>
              <tbody>
                {(allTimeRoster as Record<string,unknown>[]).map((p, i) => {
                  const lvl = levelLabel(String(p.level || ""));
                  const lvlCls = levelClass(lvl);
                  const draft = p.draft_info ? parseDraft(p.draft_info as string) : "";
                  return (
                    <tr key={String(p.playerid)}>
                      <td style={{color:"var(--muted)",fontSize:"10px"}}>{i+1}</td>
                      <td>{!!p.is_active_2025 && <span className="yat-active-dot" title="Active 2025" />}<strong>{String(p.display_name || `${p.firstname} ${p.lastname}`)}</strong></td>
                      <td><span className={`yat-chip chip-sm ${lvlCls}`}>{lvl}</span></td>
                      <td style={{color:"var(--muted)",fontSize:"11px"}}>{String(p.position||"--")}</td>
                      <td className="num">{String(p.playyears||"--")}</td>
                      <td className="num" style={{fontSize:"9px",maxWidth:"120px",overflow:"hidden",textOverflow:"ellipsis"}}>{draft||"--"}</td>
                      <td className={`num${p.avg?" hi":""}`}>{fmt("AVG",p.avg)}</td>
                      <td className="num">{fmt("OBP",p.obp)}</td>
                      <td className="num">{fmt("SLG",p.slg)}</td>
                      <td className="num">{fmt("OPS",p.ops)}</td>
                      <td className="num">{p.hr!=null?String(p.hr):"--"}</td>
                      <td className="num">{p.rbi!=null?String(p.rbi):"--"}</td>
                      <td className={`num${p.era?" hi":""}`}>{fmt("ERA",p.era)}</td>
                      <td className="num">{fmt("WHIP",p.whip)}</td>
                      <td className="num">{fmt("IP",p.ip)}</td>
                      <td className="num">{p.ko!=null?String(p.ko):"--"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* NEWS */}
        <section id="sec-news" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">📰</div>
            <div className="yat-placeholder-title">Alumni News Coming Soon</div>
            <div className="yat-placeholder-body">Integrating with <strong style={{color:"var(--fg)"}}>Webz.io</strong> to automatically surface news for every active alumni.</div>
          </div>
        </section>

        {/* CURRENT TEAM */}
        <section id="sec-team" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">🏟️</div>
            <div className="yat-placeholder-title">Current Team Roster</div>
            <div className="yat-placeholder-body">The current {schoolName} varsity roster will appear here once the season begins.</div>
          </div>
        </section>

        {/* MENTOR */}
        <section id="sec-mentor" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">🤝</div>
            <div className="yat-placeholder-title">Mentorship Marketplace</div>
            <div className="yat-placeholder-body">Connect with {schoolName} alumni for mentorship, NIL guidance, and career development. Coming soon.</div>
          </div>
        </section>

        {/* PARTNER */}
        <section id="sec-partner" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">🤝</div>
            <div className="yat-placeholder-title">PCD Action Partner Program</div>
            <div className="yat-placeholder-body">
              Sponsorship and partnership opportunities for brands wanting to connect with the YAT?STATS network.
              <br /><br />
              <a href="mailto:sponsor@yatstats.com" style={{display:"inline-block",background:"#00e676",color:"#000",fontFamily:'"Bebas Neue",Oswald,sans-serif',fontSize:"14px",letterSpacing:".1em",padding:"10px 24px",borderRadius:"4px"}}>Get In Touch</a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="sec-faq" className="yat-section">
          <div className="yat-placeholder">
            <div className="yat-placeholder-icon">❓</div>
            <div className="yat-placeholder-title">FAQ&apos;s</div>
            <div className="yat-placeholder-body">Frequently asked questions about YAT?STATS, how data is sourced, and how to get your school listed. Coming soon.</div>
          </div>
        </section>

      </main>

      {/* SPONSOR FOOTER */}
      <footer className="yat-footer">
        <a href="https://yatstats.com/sponsors" target="_blank" rel="noopener">
          <span className="sponsor-text">Presented by</span>
          <span className="sponsor-name">AMERICAN SOLUTIONS FOR BUSINESS</span>
        </a>
      </footer>

      {/* CLIENT INTERACTIVITY */}
      <script dangerouslySetInnerHTML={{__html:`
        window.__firebase_config = ${getFirebaseConfigJSON()};
      `}} />
      <script type="module" dangerouslySetInnerHTML={{__html:`
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
        import {
          getAuth,
          createUserWithEmailAndPassword,
          signInWithEmailAndPassword,
          signOut,
          onAuthStateChanged,
          signInAnonymously
        } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

        window.firebaseAuth = {
          getAuth,
          createUserWithEmailAndPassword,
          signInWithEmailAndPassword,
          signOut,
          onAuthStateChanged,
          signInAnonymously
        };

        try {
          const firebaseConfig = JSON.parse(window.__firebase_config || '{}');
          const app = initializeApp(firebaseConfig);
          window.auth = getAuth(app);

          onAuthStateChanged(window.auth, user => {
            document.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user } }));
          });

          await signInAnonymously(window.auth);
        } catch (e) {
          console.error("Firebase initialization error:", e);
        }
      `}} />
      <script dangerouslySetInnerHTML={{__html:`
(function(){
  function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');}
  var saved=localStorage.getItem('yat-theme');
  if(saved==='light')document.body.classList.add('light-theme');
  var btn=document.getElementById('theme-toggle');
  if(btn){
    btn.addEventListener('click',function(){
      var isLight=document.body.classList.toggle('light-theme');
      localStorage.setItem('yat-theme',isLight?'light':'dark');
      var ic=btn.querySelector('i');
      if(ic)ic.className=isLight?'ri-moon-line':'ri-sun-line';
    });
    if(saved==='light'){var ic=btn.querySelector('i');if(ic)ic.className='ri-moon-line';}
  }
  document.addEventListener('click',function(e){
    var card=e.target.closest('.yat-card');
    if(!card)return;
    if(e.target.closest('a')||e.target.closest('button'))return;
    card.classList.toggle('is-flipped');
  });
  document.addEventListener('click',function(e){
    var link=e.target.closest('.yat-back-nav-btn');
    if(!link)return;
    e.stopPropagation();
    var card=link.closest('.yat-card');
    if(!card)return;
    card.querySelectorAll('.yat-back-nav-btn').forEach(function(l){l.classList.remove('active');});
    link.classList.add('active');
    var content=link.dataset.content;
    var fz=card.querySelector('.yat-fun-zone');
    if(!fz)return;
    if(content==='stats'){fz.innerHTML=fz.getAttribute('data-stats-html')||fz.innerHTML;}
    else{var labels={news:'ALUMNI NEWS',social:'SOCIAL MEDIA',mentor:'MENTORSHIP MARKETPLACE',gallery:'TIMELINE GALLERY'};fz.innerHTML='<div class="yat-stats-bar">'+(labels[content]||content.toUpperCase())+'</div><div style="padding:20px;text-align:center;opacity:.5;font:300 12px Oswald,sans-serif">Coming soon</div>';}
  });
  function showSection(tabId){
    document.querySelectorAll('.yat-section').forEach(function(s){s.classList.remove('visible');});
    var sec=document.getElementById('sec-'+tabId);
    if(sec)sec.classList.add('visible');
  }
  document.addEventListener('click',function(e){
    var pair=e.target.closest('[data-tab]');
    if(!pair)return;
    var tab=pair.dataset.tab;
    if(!tab)return;
    e.preventDefault();
    showSection(tab);
    document.body.classList.remove('drawer-left-open','drawer-right-open','drawer-account-open','drawer-open');
  });
  var btnMenu=document.getElementById('btnMenu');
  var closeLeft=document.getElementById('closeLeft');
  if(btnMenu)btnMenu.addEventListener('click',function(){document.body.classList.toggle('drawer-left-open');document.body.classList.toggle('drawer-open');document.body.classList.remove('drawer-right-open','drawer-account-open');});
  if(closeLeft)closeLeft.addEventListener('click',function(){document.body.classList.remove('drawer-left-open','drawer-open');});
  var openFilters=document.getElementById('openFilters');
  var closeFilters=document.getElementById('closeFilters');
  var filtersReset=document.getElementById('filtersReset');
  var filtersReset2=document.getElementById('filtersReset2');
  if(openFilters)openFilters.addEventListener('click',function(){document.body.classList.toggle('drawer-right-open');document.body.classList.toggle('drawer-open');document.body.classList.remove('drawer-left-open','drawer-account-open');});
  if(closeFilters)closeFilters.addEventListener('click',function(){document.body.classList.remove('drawer-right-open','drawer-open');});
  var btnAccount=document.getElementById('btnAccount');
  var closeAccount=document.getElementById('closeAccount');
  if(btnAccount)btnAccount.addEventListener('click',function(){document.body.classList.toggle('drawer-account-open');document.body.classList.toggle('drawer-open');document.body.classList.remove('drawer-left-open','drawer-right-open');});
  if(closeAccount)closeAccount.addEventListener('click',function(){document.body.classList.remove('drawer-account-open','drawer-open');});
  var mask=document.getElementById('drawerMask');
  if(mask)mask.addEventListener('click',function(){document.body.classList.remove('drawer-left-open','drawer-right-open','drawer-account-open','drawer-open');});
  var openSearch=document.getElementById('openSearch');
  if(openSearch)openSearch.addEventListener('click',function(){document.body.classList.add('drawer-left-open','drawer-open');document.body.classList.remove('drawer-right-open','drawer-account-open');var inp=document.getElementById('playerSearch');if(inp)setTimeout(function(){inp.focus();},300);});
  var searchInput=document.getElementById('playerSearch');
  var liveResults=document.getElementById('liveResults');
  if(searchInput&&liveResults){
    searchInput.addEventListener('input',function(){
      var q=this.value.toLowerCase().trim();
      var results='';
      if(q.length>=2){
        document.querySelectorAll('.yat-card[data-name]').forEach(function(card){
          var name=card.getAttribute('data-name')||'';
          if(name.includes(q)){
            var nameEl=card.querySelector('.yat-name');
            var dn=escHtml(nameEl?nameEl.textContent:name);
            results+='<div class="yat-live-hit"><span style="font:400 14px \\'Bebas Neue\\',sans-serif">'+dn+'</span></div>';
          }
        });
      }
      liveResults.innerHTML=results||(q.length>=2?'<div style="padding:10px;opacity:.5;font-size:12px">No results</div>':'');
    });
  }
  function applyFilters(){
    var nf=((document.getElementById('filterName')||{}).value||'').toLowerCase().trim();
    var lc=Array.from(document.querySelectorAll('#filterLevels input:checked')).map(function(i){return i.value;});
    var gc=Array.from(document.querySelectorAll('#filterGradClass input:checked')).map(function(i){return i.value;});
    document.querySelectorAll('.yat-card[data-name]').forEach(function(card){
      var name=card.getAttribute('data-name')||'';
      var level=card.getAttribute('data-level')||'';
      var g=card.getAttribute('data-gradclass')||'';
      var show=true;
      if(nf&&!name.includes(nf))show=false;
      if(lc.length&&!lc.includes(level))show=false;
      if(gc.length&&!gc.includes(g))show=false;
      card.style.display=show?'':'none';
    });
  }
  document.addEventListener('change',function(e){if(e.target.closest('#filters'))applyFilters();});
  document.addEventListener('input',function(e){if(e.target.id==='filterName')applyFilters();});
  if(filtersReset)filtersReset.addEventListener('click',function(){document.querySelectorAll('#filters input').forEach(function(i){if(i.type==='checkbox')i.checked=false;else i.value='';});applyFilters();});
  if(filtersReset2)filtersReset2.addEventListener('click',function(){document.querySelectorAll('#filters input').forEach(function(i){if(i.type==='checkbox')i.checked=false;else i.value='';});applyFilters();});
  document.querySelectorAll('.yat-fun-zone').forEach(function(fz){fz.setAttribute('data-stats-html',fz.innerHTML);});
})();
      `}} />
    </>
  );
}
