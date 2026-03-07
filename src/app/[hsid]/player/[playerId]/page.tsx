// src/app/[hsid]/player/[playerId]/page.tsx
// YAT?STATS — Player Profile Page
// Dynamic route: /{hsid}/player/{playerId}

import { Metadata } from "next";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import AccountDrawer from "@/components/AccountDrawer";
import {
  getSchoolByHsid,
  getSchoolByUrl,
  getPlayerById,
  getPlayerSchool,
  getPlayerBattingStats,
  getPlayerPitchingStats,
  getPlayerCareerBatting,
  getPlayerCareerPitching,
} from "@/lib/db";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  const player = await getPlayerById(String(playerId));
  const playerName = player
    ? `${player.firstname || ""} ${player.lastname || ""}`.trim()
    : "Player";
  return {
    title: `${playerName.toUpperCase()} | YAT?STATS - Player Profile`,
    description: `Full career stats and profile for ${playerName}.`,
  };
}

// ---------------------------------------------------------------------------
// Helper: format stat value
// ---------------------------------------------------------------------------
function fmt(v: any, decimals = 0): string {
  if (v === null || v === undefined || v === "" || v === "--") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (decimals > 0) return n.toFixed(decimals);
  return String(n);
}

function fmtAvg(v: any): string {
  if (v === null || v === undefined || v === "" || v === "--") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toFixed(3).replace(/^0/, "");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string }>;
}) {
  const { playerId } = await params;

  // Resolve school from subdomain host header
  const headersList = await headers();
  const host = headersList.get("host") || "";
  // Get school from player's hsid linkage as primary, host as fallback
  const playerSchoolLink = await getPlayerSchool(String(playerId));
  const playerHsid = playerSchoolLink?.hsid ? String(playerSchoolLink.hsid) : null;
  const school = (
    playerHsid
      ? await getSchoolByHsid(playerHsid)
      : host
        ? await getSchoolByUrl(`https://${host}`)
        : null
  ) as Record<string, unknown> | null;
  if (!school) redirect("https://yatstats.com");

  const resolvedHsid = String(school.hsid ?? "");
  const schoolName = String(school.hsname || "").toUpperCase();
  const location = String(school.hslocation || "").toUpperCase();

  // Resolve player
  const player = await getPlayerById(playerId);
  if (!player) notFound();

  const playerSchool = playerSchoolLink;
  const [battingSeasons, pitchingSeasons, careerBatting, careerPitching] =
    await Promise.all([
      getPlayerBattingStats(playerId),
      getPlayerPitchingStats(playerId),
      getPlayerCareerBatting(playerId),
      getPlayerCareerPitching(playerId),
    ]);

  const firstName = (player.firstname || "").trim();
  const lastName = (player.lastname || "").trim();
  const displayName = `${firstName} ${lastName}`.trim() || playerId;
  const pos = player.position || "--";
  const ht = player.height || "--";
  const wt = player.weight || "--";
  const bt = `${player.bats || "-"}/${player.throws || "-"}`;
  const level = (player.career_highlevel || "--").toUpperCase();
  const college = player.college || "N/A";
  const draftInfo = player.draft_info || "N/A";
  const playYears = player.playyears || "";

  // Determine if primarily a pitcher
  const isPitcher =
    pitchingSeasons.length > 0 &&
    (battingSeasons.length === 0 || pitchingSeasons.length >= battingSeasons.length);

  // Determine active status
  const latestYear = Math.max(
    ...battingSeasons.map((s: any) => Number(s.year) || 0),
    ...pitchingSeasons.map((s: any) => Number(s.year) || 0),
    0
  );
  const isActive = latestYear >= 2025;
  const statusLabel = isActive ? `ACTIVE ${latestYear}` : level.includes("RETIRED") ? "RETIRED" : draftInfo !== "N/A" ? "RETIRED-DRAFTED" : "RETIRED";

  // Grad class from playyears
  const gcMatch = playYears.match(/\d{4}/);
  const gradClass = gcMatch ? gcMatch[0] : "--";

  const crestUrl = getSchoolCrestUrl(resolvedHsid);
  const playerImgBase = `https://hamilton.yatstats.com/assets/img/players/${playerId}`;

  // Extract subdomain for GHL tagging
  const ROOT_DOMAIN = "yatstats.com";
  const subdomain = host.replace(`.${ROOT_DOMAIN}`, "").replace(ROOT_DOMAIN, "") || resolvedHsid;

  const navItems = [
    { thin: "WHERE THEY", bold: "YAT?", tab: "active" },
    { thin: "ACTIVE ALUMNI", bold: "NEWS", tab: "news" },
    { thin: "NEXT-LEVEL", bold: "ALL-TIME LIST", tab: "alltime" },
    { thin: "THE", bold: "CURRENT TEAM", tab: "team" },
    { thin: "MENTORSHIP", bold: "MARKETPLACE", tab: "mentor" },
    { thin: "PCD ACTION", bold: "PARTNER PROGRAM", tab: "partner" },
    { thin: "", bold: "FAQ'S", tab: "faq" },
  ];

  // Build career stats grid for the profile
  const careerBattingGrid = careerBatting
    ? [
        { k: "AVG", v: fmtAvg(careerBatting.avg) },
        { k: "OBP", v: fmtAvg(careerBatting.obp) },
        { k: "HR", v: fmt(careerBatting.hr) },
        { k: "RBI", v: fmt(careerBatting.rbi) },
        { k: "H", v: fmt(careerBatting.h) },
        { k: "R", v: fmt(careerBatting.r) },
        { k: "SB", v: fmt(careerBatting.sb) },
        { k: "BB", v: fmt(careerBatting.bb) },
        { k: "AB", v: fmt(careerBatting.ab) },
        { k: "2B", v: fmt(careerBatting["2b"]) },
        { k: "3B", v: fmt(careerBatting["3b"]) },
        { k: "G", v: fmt(careerBatting.g) },
      ]
    : [];

  const careerPitchingGrid = careerPitching
    ? [
        { k: "ERA", v: fmt(careerPitching.era, 2) },
        { k: "K/9", v: fmt(careerPitching.k9, 2) },
        { k: "K/BB", v: fmt(careerPitching.kbb, 2) },
        { k: "WHIP", v: fmt(careerPitching.whip, 2) },
        { k: "IP", v: fmt(careerPitching.ip, 1) },
        { k: "ER", v: fmt(careerPitching.er) },
        { k: "KO", v: fmt(careerPitching.ko) },
        { k: "BB", v: fmt(careerPitching.bb) },
        { k: "GP", v: fmt(careerPitching.g) },
        { k: "W-L", v: `${fmt(careerPitching.w)}-${fmt(careerPitching.l)}` },
        { k: "SAVES", v: fmt(careerPitching.saves) },
        { k: "FIP", v: "--" },
      ]
    : [];

  const careerGrid = isPitcher ? careerPitchingGrid : careerBattingGrid;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@200..700&display=swap" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{__html:`
        :root{--bg:#0d0d0d;--fg:#f5f5f5;--muted:#999;--line:rgba(255,255,255,.08);--header-bg:rgba(13,13,13,.97);--crestH:60px}
        body.light-theme{--bg:#f5f5f5;--fg:#111;--muted:#666;--line:rgba(0,0,0,.08);--header-bg:rgba(245,245,245,.97)}
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:var(--bg);color:var(--fg);font-family:Oswald,system-ui,sans-serif;-webkit-font-smoothing:antialiased;transition:background-color .3s,color .3s}
        a{color:inherit;text-decoration:none}
        .yat-container{max-width:1400px;margin:0 auto;padding:0 16px}
        .yat-header{position:sticky;top:0;z-index:50;background:var(--header-bg);transition:background-color .3s}
        .yat-topbar{display:flex;align-items:center;justify-content:space-between;padding:8px 0}
        .yat-left-icons{display:flex;align-items:center;gap:8px;margin-left:4px}
        .yat-icon-btn{background:none;border:none;color:var(--fg);opacity:.92;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0 2px;cursor:pointer}
        .yat-icon-btn i{font-size:20px}
        .yat-topnav{display:flex;gap:18px;align-items:center}
        .yat-nav-pair{white-space:nowrap;cursor:pointer}
        .yat-nav-pair .thin{font:300 11px Oswald,sans-serif;letter-spacing:.02em;color:#cfd2d6;margin-right:2px}
        body.light-theme .yat-nav-pair .thin{color:var(--muted)}
        .yat-nav-pair .bold{font:400 11px "Bebas Neue",sans-serif}
        .yat-wordmark-wrap{display:flex;align-items:center;justify-content:flex-end;min-width:120px}
        @media(max-width:1200px){.yat-topnav{display:none!important}}
        .yat-hr{border-top:1px solid var(--line)}
        .yat-schoolrow{display:flex;align-items:center;gap:12px;padding:6px 16px;max-width:1400px;margin:0 auto}
        .yat-crest{height:var(--crestH);width:auto;object-fit:contain;display:block;flex-shrink:0}
        .yat-schooltext{line-height:1}
        .yat-schooltext .small{font:300 11px/1 Oswald;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
        .yat-schooltext .big1{font:700 18px/1.1 "Bebas Neue",sans-serif;letter-spacing:.04em;text-transform:uppercase}
        .yat-schooltext .big2{font:700 22px/1.1 "Bebas Neue",sans-serif;letter-spacing:.04em;text-transform:uppercase;margin-top:0}

        /* FAVORITES HERO */
        .fav-hero{padding:12px 16px;max-width:1400px;margin:0 auto}
        .fav-hero h2{font:400 clamp(18px,3vw,24px)/1 "Bebas Neue",sans-serif;letter-spacing:.04em}
        .fav-hero h2 .bold{font-weight:700}
        .fav-hero .fav-actions{display:flex;gap:16px;margin-top:6px;font:300 12px/1 Oswald,sans-serif;letter-spacing:.04em;color:var(--muted)}
        .fav-hero .fav-actions a{display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--muted);transition:color .2s}
        .fav-hero .fav-actions a:hover{color:gold}
        .fav-hero .fav-actions .star{color:gold;font-size:16px}

        /* PLAYER PROFILE */
        .profile-card{max-width:1000px;margin:20px auto;padding:0 16px}
        .profile-header{display:flex;gap:20px;align-items:flex-start;padding:20px;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:8px}
        body.light-theme .profile-header{background:rgba(0,0,0,.02)}
        .profile-photo{width:120px;height:150px;object-fit:cover;border-radius:6px;flex-shrink:0;position:relative}
        .profile-photo img{width:100%;height:100%;object-fit:cover;border-radius:6px}
        .profile-photo .crest-badge{position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:32px;height:32px;object-fit:contain;border-radius:4px;background:var(--bg);padding:2px}
        .profile-info{flex:1}
        .profile-info .player-name{font:700 28px/1 "Bebas Neue",sans-serif;letter-spacing:.04em;text-transform:uppercase}
        .profile-info .player-team{font:300 13px/1.3 Oswald,sans-serif;color:var(--muted);margin-top:4px}
        .profile-info .player-meta{font:300 12px/1.3 Oswald,sans-serif;color:var(--muted);margin-top:4px}
        .profile-info .player-chips{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
        .profile-info .chip{font:700 10px/1 "Bebas Neue",sans-serif;padding:3px 8px;border-radius:4px;letter-spacing:.06em}
        .chip-level{background:#1a6b3c;color:#fff}
        .chip-status{background:rgba(255,255,255,.1);color:var(--fg);border:1px solid var(--line)}
        .chip-class{background:rgba(255,255,255,.06);color:var(--muted);border:1px solid var(--line)}

        /* TABS */
        .profile-tabs{display:flex;gap:0;border-bottom:2px solid var(--line);margin-top:20px;max-width:1000px;margin-left:auto;margin-right:auto;padding:0 16px}
        .profile-tab{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.06em;padding:10px 16px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .2s,border-color .2s;white-space:nowrap}
        .profile-tab.active{color:var(--fg);border-bottom-color:var(--fg)}
        .profile-tab:hover{color:var(--fg)}

        /* STATS GRID */
        .stats-section{max-width:1000px;margin:0 auto;padding:20px 16px}
        .stats-title{font:700 14px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;text-align:center;padding:10px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:6px 6px 0 0}
        body.light-theme .stats-title{background:rgba(0,0,0,.03)}
        .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-top:none}
        .stats-grid .stat-cell{text-align:center;padding:12px 8px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
        .stats-grid .stat-cell:nth-child(4n){border-right:none}
        .stat-cell .stat-label{font:300 10px/1 Oswald,sans-serif;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
        .stat-cell .stat-value{font:700 20px/1 "Bebas Neue",sans-serif;margin-top:4px}

        /* SEASON TABLE */
        .season-table{width:100%;border-collapse:collapse;margin-top:16px;font:300 12px/1.4 Oswald,sans-serif}
        .season-table th{font:700 10px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;padding:8px 6px;text-align:center;border-bottom:2px solid var(--line);color:var(--muted);text-transform:uppercase;white-space:nowrap}
        .season-table td{padding:6px;text-align:center;border-bottom:1px solid var(--line);white-space:nowrap}
        .season-table tr:hover{background:rgba(255,255,255,.03)}
        body.light-theme .season-table tr:hover{background:rgba(0,0,0,.03)}

        /* TAB CONTENT */
        .tab-content{display:none}
        .tab-content.active{display:block}

        /* COMING SOON */
        .coming-soon{text-align:center;padding:40px 20px;opacity:.5;font:300 14px Oswald,sans-serif}

        /* FOOTER */
        .yat-footer{text-align:center;padding:20px 16px;margin-top:40px;border-top:1px solid var(--line)}
        .yat-footer .sponsor-label{font:300 10px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
        .yat-footer .sponsor-name{font:700 14px/1.2 "Bebas Neue",sans-serif;letter-spacing:.04em;margin-top:4px}

        /* DRAWER */
        .yat-drawer{position:fixed;top:0;width:280px;height:100vh;background:var(--bg);z-index:100;padding:20px;overflow-y:auto;transition:transform .3s;border-right:1px solid var(--line)}
        .yat-drawer-left{left:0;transform:translateX(-100%)}
        .yat-drawer-right{right:0;transform:translateX(100%);border-right:none;border-left:1px solid var(--line)}
        body.drawer-left-open .yat-drawer-left{transform:translateX(0)}
        body.drawer-account-open #drawerAccount{transform:translateX(0)}
        body.drawer-open{overflow:hidden}
        .yat-close-btn{position:absolute;top:12px;right:12px}
        .drawer-mask{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:90}
        body.drawer-left-open .drawer-mask,body.drawer-account-open .drawer-mask{display:block}

        @media(max-width:600px){
          .profile-header{flex-direction:column;align-items:center;text-align:center}
          .profile-info .player-chips{justify-content:center}
          .stats-grid{grid-template-columns:repeat(2,1fr)}
          .profile-tabs{overflow-x:auto;-webkit-overflow-scrolling:touch}
        }
        `}} />
      </head>
      <body>
        {/* HEADER */}
        <header className="yat-header" id="site-header">
          <div className="yat-container yat-topbar">
            <div className="yat-left-icons">
              <a href={`/${resolvedHsid}`} className="yat-icon-btn" aria-label="Back to school"><i className="ri-arrow-left-line" /></a>
              <button className="yat-icon-btn" id="btnMenu" aria-label="Menu"><i className="ri-menu-line" /></button>
              <button className="yat-icon-btn" id="btnAccount" aria-label="Account"><i className="ri-user-3-line" /></button>
              <button className="yat-icon-btn" id="theme-toggle" aria-label="Toggle Theme"><i className="ri-sun-line" /></button>
            </div>
            <nav className="yat-topnav" aria-label="Top Navigation">
              {navItems.map((item) => (
                <a key={item.tab} href={`/${resolvedHsid}#sec-${item.tab}`} className="yat-nav-pair" data-tab={item.tab}>
                  {item.thin && <span className="thin">{item.thin} </span>}
                  <span className="bold">{item.bold}</span>
                </a>
              ))}
            </nav>
            <div className="yat-wordmark-wrap">
              <a href="https://home.yatstats.com" style={{textDecoration:'none',display:'flex',alignItems:'center',gap:'6px'}}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png" alt="YAT?STATS" style={{height:'28px',width:'auto',filter:'invert(1)'}} />
              </a>
            </div>
          </div>
          <div className="yat-hr" />
          <div className="yat-schoolrow">
          <SafeImage className="yat-crest" src={crestUrl} alt={`${schoolName} crest`} />
            <div className="yat-schooltext">
              <div className="small">{location}</div>
              <div className="big1">{schoolName}</div>
              <div className="big2">ACTIVE BASEBALL ALUMNI</div>
            </div>
          </div>
          <div className="yat-hr" />
        </header>

        {/* FAVORITES HERO */}
        <div className="fav-hero">
          <h2>FOLLOW YOUR <span className="bold">FAVORITES</span> <span style={{color:'gold',fontSize:'1.2em'}}>&#9733;</span></h2>
          <div className="fav-actions">
            <a id="btnFanFav"><span className="star">&#9733;</span> ADD FAN FAVORITE</a>
            <span style={{opacity:.3}}>|</span>
            <a id="btnSuperFav"><span className="star">&#9733;</span> ADD TO SUPERFAN DASHBOARD</a>
          </div>
        </div>
        <div className="yat-hr" style={{maxWidth:'1400px',margin:'0 auto'}} />

        {/* DRAWER MASK */}
        <div className="drawer-mask" id="drawerMask" />

        {/* LEFT DRAWER */}
        <aside className="yat-drawer yat-drawer-left" id="drawerLeft">
          <button className="yat-icon-btn yat-close-btn" id="closeLeft"><i className="ri-close-line" /></button>
          <h3 style={{font:'700 14px "Bebas Neue",sans-serif',letterSpacing:'.08em',marginBottom:'12px'}}>NAVIGATION</h3>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            <a href={`/${resolvedHsid}`} style={{font:'300 14px Oswald,sans-serif',padding:'6px 0',borderBottom:'1px solid var(--line)'}}>← BACK TO {schoolName}</a>
            {navItems.map((item) => (
              <a key={item.tab} href={`/${resolvedHsid}#sec-${item.tab}`} style={{font:'300 14px Oswald,sans-serif',padding:'6px 0',borderBottom:'1px solid var(--line)'}}>
                {item.thin ? `${item.thin} ` : ""}{item.bold}
              </a>
            ))}
          </div>
        </aside>

        {/* ACCOUNT DRAWER */}
        <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
          <button className="yat-icon-btn yat-close-btn" id="closeAccount"><i className="ri-close-line" /></button>
          <h3 style={{font:'700 14px "Bebas Neue",sans-serif',letterSpacing:'.08em',marginBottom:'12px'}}>ACCOUNT</h3>
          <AccountDrawer subdomain={subdomain} />
        </aside>

        {/* PLAYER PROFILE CARD */}
        <div className="profile-card">
          <div className="profile-header">
            <div className="profile-photo">
              <SafeImage
                className="profile-img"
                src={`${playerImgBase}.jpg`}
                alt={displayName}
                fallbackSrc={`${playerImgBase}.png`}
                placeholderSrc="/img/player-silhouette.png"
                style={{width:'100%',height:'100%',objectFit:'cover' as const,borderRadius:'6px'}}
              />
              <SafeImage
                className="crest-badge"
                src={crestUrl}
                alt=""
                fallbackSrc="/img/yatstats-logo-circle.png"
                placeholderSrc="/img/yatstats-logo-circle.png"
              />
            </div>
            <div className="profile-info">
              <div className="player-name">{displayName}</div>
              <div className="player-team">
                {playerSchool ? `${playerSchool.hsname}` : schoolName}
              </div>
              <div className="player-meta">
                {level} &bull; {statusLabel}
                {gradClass !== "--" && ` • Class of ${gradClass}`}
                {playYears && ` • ${playYears}`}
              </div>
              <div className="player-meta" style={{marginTop:'8px'}}>
                Position: {pos}<br />
                Vitals: H: {ht} | W: {wt} | B/T: {bt}<br />
                Draft: {draftInfo}<br />
                Colleges: {college}
              </div>
              <div className="player-chips">
                <span className="chip chip-level">{level}</span>
                <span className="chip chip-status">{statusLabel}</span>
                {gradClass !== "--" && <span className="chip chip-class">CLASS OF {gradClass}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="profile-tabs">
          <div className="profile-tab active" data-profile-tab="stats">SEASON &amp; CAREER STATS</div>
          <div className="profile-tab" data-profile-tab="news">NEWS &amp; VIDEOS</div>
          <div className="profile-tab" data-profile-tab="social">SOCIAL MEDIA</div>
          <div className="profile-tab" data-profile-tab="mentor">MENTORSHIP MARKETPLACE</div>
          <div className="profile-tab" data-profile-tab="gallery">PHOTO GALLERY</div>
        </div>

        {/* TAB: STATS */}
        <div className="tab-content active" id="tab-stats">
          <div className="stats-section">
            <div className="stats-title">CAREER STATS</div>
            <div className="stats-grid">
              {careerGrid.map((s, i) => (
                <div key={i} className="stat-cell">
                  <div className="stat-label">{s.k}</div>
                  <div className="stat-value">{s.v}</div>
                </div>
              ))}
            </div>

            {/* Season-by-season batting */}
            {battingSeasons.length > 0 && (
              <>
                <h3 style={{font:'700 14px "Bebas Neue",sans-serif',letterSpacing:'.08em',marginTop:'24px',textAlign:'center'}}>SEASON-BY-SEASON BATTING</h3>
                <div style={{overflowX:'auto'}}>
                  <table className="season-table">
                    <thead>
                      <tr>
                        <th>YEAR</th><th>LVL</th><th>G</th><th>AB</th><th>R</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th><th>SB</th><th>BB</th><th>SO</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {battingSeasons.map((s: any, i: number) => (
                        <tr key={i}>
                          <td>{s.year}</td>
                          <td>{(s.level || "--").toUpperCase()}</td>
                          <td>{fmt(s.g)}</td>
                          <td>{fmt(s.ab)}</td>
                          <td>{fmt(s.r)}</td>
                          <td>{fmt(s.h)}</td>
                          <td>{fmt(s["2b"])}</td>
                          <td>{fmt(s["3b"])}</td>
                          <td>{fmt(s.hr)}</td>
                          <td>{fmt(s.rbi)}</td>
                          <td>{fmt(s.sb)}</td>
                          <td>{fmt(s.bb)}</td>
                          <td>{fmt(s.so)}</td>
                          <td>{fmtAvg(s.avg)}</td>
                          <td>{fmtAvg(s.obp)}</td>
                          <td>{fmtAvg(s.slg)}</td>
                          <td>{fmtAvg(s.ops)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Season-by-season pitching */}
            {pitchingSeasons.length > 0 && (
              <>
                <h3 style={{font:'700 14px "Bebas Neue",sans-serif',letterSpacing:'.08em',marginTop:'24px',textAlign:'center'}}>SEASON-BY-SEASON PITCHING</h3>
                <div style={{overflowX:'auto'}}>
                  <table className="season-table">
                    <thead>
                      <tr>
                        <th>YEAR</th><th>LVL</th><th>G</th><th>GS</th><th>W</th><th>L</th><th>SV</th><th>IP</th><th>ER</th><th>KO</th><th>BB</th><th>ERA</th><th>WHIP</th><th>K/9</th><th>K/BB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pitchingSeasons.map((s: any, i: number) => (
                        <tr key={i}>
                          <td>{s.year}</td>
                          <td>{(s.level || "--").toUpperCase()}</td>
                          <td>{fmt(s.g)}</td>
                          <td>{fmt(s.gs)}</td>
                          <td>{fmt(s.w)}</td>
                          <td>{fmt(s.l)}</td>
                          <td>{fmt(s.saves)}</td>
                          <td>{fmt(s.ip, 1)}</td>
                          <td>{fmt(s.er)}</td>
                          <td>{fmt(s.ko)}</td>
                          <td>{fmt(s.bb)}</td>
                          <td>{fmt(s.era, 2)}</td>
                          <td>{fmt(s.whip, 2)}</td>
                          <td>{fmt(s.k9, 2)}</td>
                          <td>{fmt(s.kbb, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {draftInfo !== "N/A" && (
              <div style={{textAlign:'center',marginTop:'16px',font:'300 12px Oswald,sans-serif',color:'var(--muted)'}}>
                Draft: {draftInfo}
              </div>
            )}
          </div>
        </div>

        {/* TAB: NEWS */}
        <div className="tab-content" id="tab-news">
          <div className="stats-section">
            <div className="coming-soon">NEWS &amp; VIDEO CLIPS — Coming soon</div>
          </div>
        </div>

        {/* TAB: SOCIAL */}
        <div className="tab-content" id="tab-social">
          <div className="stats-section">
            <div className="coming-soon">SOCIAL MEDIA — Coming soon</div>
          </div>
        </div>

        {/* TAB: MENTOR */}
        <div className="tab-content" id="tab-mentor">
          <div className="stats-section">
            <div className="coming-soon">MENTORSHIP MARKETPLACE — Coming soon</div>
          </div>
        </div>

        {/* TAB: GALLERY */}
        <div className="tab-content" id="tab-gallery">
          <div className="stats-section">
            <div className="coming-soon">PHOTO GALLERY — Coming soon</div>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="yat-footer">
          <div className="sponsor-label">PRESENTED BY</div>
          <div className="sponsor-name">AMERICAN SOLUTIONS FOR BUSINESS</div>
        </footer>

        {/* CLIENT INTERACTIVITY */}
        <script dangerouslySetInnerHTML={{__html:`
(function(){
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
  /* Tab switching */
  document.querySelectorAll('.profile-tab').forEach(function(tab){
    tab.addEventListener('click',function(){
      document.querySelectorAll('.profile-tab').forEach(function(t){t.classList.remove('active');});
      document.querySelectorAll('.tab-content').forEach(function(c){c.classList.remove('active');});
      tab.classList.add('active');
      var target=tab.getAttribute('data-profile-tab');
      var content=document.getElementById('tab-'+target);
      if(content)content.classList.add('active');
    });
  });
  /* Drawer toggles */
  var btnMenu=document.getElementById('btnMenu');
  var closeLeft=document.getElementById('closeLeft');
  if(btnMenu)btnMenu.addEventListener('click',function(){document.body.classList.toggle('drawer-left-open');document.body.classList.toggle('drawer-open');document.body.classList.remove('drawer-account-open');});
  if(closeLeft)closeLeft.addEventListener('click',function(){document.body.classList.remove('drawer-left-open','drawer-open');});
  var btnAccount=document.getElementById('btnAccount');
  var closeAccount=document.getElementById('closeAccount');
  if(btnAccount)btnAccount.addEventListener('click',function(){document.body.classList.toggle('drawer-account-open');document.body.classList.toggle('drawer-open');document.body.classList.remove('drawer-left-open');});
  if(closeAccount)closeAccount.addEventListener('click',function(){document.body.classList.remove('drawer-account-open','drawer-open');});
  var mask=document.getElementById('drawerMask');
  if(mask)mask.addEventListener('click',function(){document.body.classList.remove('drawer-left-open','drawer-account-open','drawer-open');});
  /* Favorites buttons */
  var playerId='${playerId}';
  var playerName='${displayName.replace(/'/g, "\\'")}';
  function addFavorite(type){
    var user=JSON.parse(localStorage.getItem('yat-user')||'null');
    if(!user||!user.contactId){
      alert('Please sign in first to add favorites. Click the account icon in the top bar.');
      document.body.classList.add('drawer-account-open','drawer-open');
      return;
    }
    if(type==='superfan'&&!user.isSuperFan){
      alert('SuperFan access is required to add players to your SuperFan Dashboard. Upgrade your account to unlock global player tracking!');
      return;
    }
    fetch('/api/favorites',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contactId:user.contactId,playerId:playerId,playerName:playerName,type:type})
    }).then(function(r){return r.json();}).then(function(data){
      if(data.success){
        alert(playerName+' has been added to your '+(type==='superfan'?'SuperFan Dashboard':'Fan Favorites')+'!');
      } else {
        alert('Error: '+(data.error||'Could not add favorite'));
      }
    }).catch(function(){alert('Network error. Please try again.');});
  }
  var btnFanFav=document.getElementById('btnFanFav');
  var btnSuperFav=document.getElementById('btnSuperFav');
  if(btnFanFav)btnFanFav.addEventListener('click',function(){addFavorite('fan');});
  if(btnSuperFav)btnSuperFav.addEventListener('click',function(){addFavorite('superfan');});
  /* Favicon fallback */
  var favLink=document.querySelector('link[rel="icon"][type="image/png"]');
  if(favLink){
    var favImg=new Image();
    favImg.onerror=function(){favLink.href='/img/yatstats-logo-circle.png';};
    favImg.src=favLink.href;
  }
})();
        `}} />
      </body>
    </html>
  );
}
