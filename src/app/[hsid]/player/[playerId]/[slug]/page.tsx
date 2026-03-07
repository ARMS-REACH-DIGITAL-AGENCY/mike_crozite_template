// src/app/[hsid]/player/[playerId]/[slug]/page.tsx
// YAT?STATS — Player Profile Page
// Dynamic route: /{hsid}/player/{playerId}/{slug}

import { Metadata } from "next";
import { headers } from "next/headers";
import { redirect, notFound, permanentRedirect } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import AccountDrawer from "@/components/AccountDrawer";
import { toPlayerSlug } from "@/lib/slug";
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
  params: Promise<{ hsid: string; playerId: string; slug: string }>;
}): Promise<Metadata> {
  try {
    const { playerId } = await params;
    const player = await getPlayerById(String(playerId));
    const playerName = player
      ? `${player.firstname || ""} ${player.lastname || ""}`.trim()
      : "Player";
    return {
      title: `${playerName.toUpperCase()} | YAT?STATS - Player Profile`,
      description: `Full career stats and profile for ${playerName}.`,
    };
  } catch {
    return {
      title: "Player Profile | YAT?STATS",
      description: "Player profile on YAT?STATS.",
    };
  }
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

type BattingSeason = {
  year: string | number;
  team_name?: string;
  level?: string;
  g?: any;
  ab?: any;
  r?: any;
  h?: any;
  "2b"?: any;
  "3b"?: any;
  hr?: any;
  rbi?: any;
  sb?: any;
  bb?: any;
  so?: any;
  avg?: any;
  obp?: any;
  slg?: any;
  ops?: any;
  draft_info?: string;
};

type PitchingSeason = {
  year: string | number;
  team_name?: string;
  level?: string;
  g?: any;
  gs?: any;
  w?: any;
  l?: any;
  saves?: any;
  ip?: any;
  er?: any;
  ko?: any;
  bb?: any;
  era?: any;
  whip?: any;
  k9?: any;
  kbb?: any;
  draft_info?: string;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ hsid: string; playerId: string; slug: string }>;
}) {
  const { hsid, playerId, slug } = await params;

  // Resolve school from subdomain host header
  const headersList = await headers();
  const host = headersList.get("host") || "";
  // Get school from player's hsid linkage as primary, host and URL params as fallback
  const playerSchoolLink = await getPlayerSchool(String(playerId));
  const playerHsid = playerSchoolLink?.hsid ? String(playerSchoolLink.hsid) : null;
  let school: Record<string, unknown> | null = null;
  if (playerHsid) school = (await getSchoolByHsid(playerHsid)) as Record<string, unknown> | null;
  if (!school && host) school = (await getSchoolByUrl(`https://${host}`)) as Record<string, unknown> | null;
  if (!school) school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
  if (!school) redirect("https://yatstats.com");

  const resolvedHsid = String(school?.hsid ?? hsid);
  const schoolName = String(school.hsname || "").toUpperCase();
  const location = String(school.hslocation || "").toUpperCase();

  // Resolve player
  const player = await getPlayerById(playerId);
  if (!player) notFound();
  const canonicalSlug = toPlayerSlug(player.firstname, player.lastname);
  if (slug !== canonicalSlug) permanentRedirect(`/${hsid}/player/${playerId}/${canonicalSlug}`);

  const playerSchool = playerSchoolLink;
  const [battingSeasons, pitchingSeasons, careerBatting, careerPitching] =
    (await Promise.all([
      getPlayerBattingStats(playerId),
      getPlayerPitchingStats(playerId),
      getPlayerCareerBatting(playerId),
      getPlayerCareerPitching(playerId),
    ])) as [BattingSeason[], PitchingSeason[], any, any];

  const firstName = (player.firstname || "").trim();
  const lastName = (player.lastname || "").trim();
  const displayName = `${firstName} ${lastName}`.trim() || playerId;
  const pos = player.position || "--";
  const ht = player.height || "--";
  const wt = player.weight || "--";
  const bt = `${player.bats || "-"}/${player.throws || "-"}`;
  const level = (player.career_highlevel || "--").toUpperCase();
  const college = player.college || "N/A";
  // draft_info and playyears don't exist in tbc_players_raw; derive from season stats
  const draftInfo =
    ([...battingSeasons, ...pitchingSeasons]).find((s) => s.draft_info)?.draft_info || "N/A";
  const playYears = "";

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
  const playerNowImg = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${playerId}.jpg`;
  const playerThenImg = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/${playerId}.jpg`;

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

  // Career level ladder — ordered progression for the timeline
  const LEVEL_ORDER = ["HS", "COLL", "ROK", "SS", "A", "A+", "AA", "AAA", "MLB", "IND"];
  const allSeasonLevels = new Set(
    [...battingSeasons, ...pitchingSeasons]
      .map((s: any) => (s.level || "").toUpperCase().trim())
      .filter(Boolean)
  );
  const levelLadder = [
    ...LEVEL_ORDER.filter((l) => allSeasonLevels.has(l)),
    ...[...allSeasonLevels].filter((l) => !LEVEL_ORDER.includes(l)).sort(),
  ];
  // Peak level comes from career_highlevel; mark that stop as gold in the timeline
  const peakLevel = level.replace(/[^A-Z0-9+]/g, "").toUpperCase() || (levelLadder[levelLadder.length - 1] ?? "");

  // Helper: CSS class suffix for a career level string
  function levelClass(lv: string): string {
    return `level-${(lv || "").toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
  }

  return (
    <>
      <style>{`
        :root{--bg:#0d0d0d;--fg:#f5f5f5;--muted:#999;--line:rgba(255,255,255,.08);--header-bg:rgba(13,13,13,.97);--crestH:60px;--logo-filter:invert(1);--card-bg:#1a1a1a}
        body.light-theme{--bg:#f4f4f4;--fg:#121212;--muted:#555;--line:rgba(0,0,0,.1);--header-bg:rgba(244,244,244,.97);--logo-filter:none;--card-bg:#fff}
        *{margin:0;padding:0;box-sizing:border-box}
        html{scroll-behavior:smooth}
        body{background:var(--bg);color:var(--fg);font-family:Oswald,system-ui,sans-serif;-webkit-font-smoothing:antialiased;transition:background-color .3s,color .3s}
        a{color:inherit;text-decoration:none}
        .yat-container{max-width:1100px;margin:0 auto;padding:0 16px}
        /* HEADER */
        .yat-header{position:sticky;top:0;z-index:50;background:var(--header-bg);backdrop-filter:blur(8px);transition:background-color .3s}
        .yat-topbar{display:flex;align-items:center;justify-content:space-between;padding:8px 0}
        .yat-left-icons{display:flex;align-items:center;gap:8px;margin-left:4px}
        .yat-icon-btn{background:none;border:none;color:var(--fg);opacity:.9;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0 2px;cursor:pointer}
        .yat-icon-btn i{font-size:20px}
        .yat-topnav{display:flex;gap:18px;align-items:center}
        .yat-nav-pair{white-space:nowrap;cursor:pointer;text-decoration:none}
        .yat-nav-pair .thin{font:300 11px Oswald,sans-serif;letter-spacing:.02em;color:var(--muted);margin-right:2px}
        .yat-nav-pair .bold{font:400 11px "Bebas Neue",sans-serif}
        .yat-wordmark-wrap{display:flex;align-items:center;justify-content:flex-end;min-width:120px}
        @media(max-width:1200px){.yat-topnav{display:none!important}}
        .yat-hr{border-top:1px solid var(--line)}
        .yat-schoolrow{display:flex;align-items:center;gap:12px;padding:6px 16px;max-width:1100px;margin:0 auto}
        .yat-crest{height:var(--crestH);width:auto;object-fit:contain;display:block;flex-shrink:0}
        .yat-schooltext{line-height:1}
        .yat-schooltext .small{font:300 11px/1 Oswald;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
        .yat-schooltext .big1{font:700 18px/1.1 "Bebas Neue",sans-serif;letter-spacing:.04em;text-transform:uppercase}
        .yat-schooltext .big2{font:700 22px/1.1 "Bebas Neue",sans-serif;letter-spacing:.04em;text-transform:uppercase}
        /* HERO */
        .player-hero{background:linear-gradient(160deg,#07071a 0%,#0d0d1f 50%,#07071a 100%);padding:28px 0 0;position:relative;overflow:hidden}
        body.light-theme .player-hero{background:linear-gradient(160deg,#dde0f5 0%,#e8eaf6 50%,#dde0f5 100%)}
        .player-hero::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#ffd166,#ff9800,#ffd166);opacity:.75}
        .hero-inner{max-width:1100px;margin:0 auto;padding:0 16px;display:flex;gap:24px;align-items:flex-end}
        .hero-photo-col{flex-shrink:0;position:relative;align-self:flex-end}
        .hero-photo{width:160px;height:200px;object-fit:cover;object-position:top;border-radius:8px 8px 0 0;display:block;border:2px solid rgba(255,255,255,.12);border-bottom:none}
        body.light-theme .hero-photo{border-color:rgba(0,0,0,.1)}
        .hero-crest-badge{position:absolute;top:-8px;right:-8px;width:34px;height:34px;border-radius:50%;background:var(--bg);padding:3px;border:1px solid var(--line);object-fit:contain;display:block}
        .hero-info-col{flex:1;padding-bottom:16px;min-width:0}
        .hero-school-link{font:300 11px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;margin-bottom:8px;display:inline-flex;align-items:center;gap:3px;transition:color .2s}
        .hero-school-link:hover{color:var(--fg)}
        .hero-name{font:700 clamp(30px,5vw,56px)/1 "Bebas Neue",sans-serif;letter-spacing:.02em;text-transform:uppercase;word-break:break-word}
        .hero-vitals{font:300 13px/1 Oswald,sans-serif;color:var(--muted);margin-top:10px;display:flex;flex-wrap:wrap;align-items:center}
        .hero-vitals .sep{margin:0 8px;opacity:.3;user-select:none}
        .hero-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
        .chip{font:700 10px/1 "Bebas Neue",sans-serif;padding:4px 10px;border-radius:4px;letter-spacing:.06em;display:inline-block}
        .chip-level{background:#1a6b3c;color:#fff}
        .chip-mlb{background:#002D72;color:#fff}
        .chip-aaa{background:#c8102e;color:#fff}
        .chip-aa{background:#e31937;color:#fff}
        .chip-a{background:#ff6900;color:#fff}
        .chip-ind{background:#6a0dad;color:#fff}
        .chip-status{background:rgba(255,255,255,.1);color:var(--fg);border:1px solid var(--line)}
        body.light-theme .chip-status{background:rgba(0,0,0,.07);border-color:rgba(0,0,0,.12)}
        .hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
        .fav-btn-hero{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid rgba(255,255,255,.22);border-radius:999px;font:700 11px/1 "Bebas Neue",sans-serif;letter-spacing:.06em;cursor:pointer;background:none;color:var(--fg);transition:all .2s;white-space:nowrap}
        body.light-theme .fav-btn-hero{border-color:rgba(0,0,0,.18)}
        .fav-btn-hero i{font-size:14px;transition:color .2s;color:gold}
        .fav-btn-hero:hover{background:rgba(255,209,102,.12);border-color:rgba(255,209,102,.5)}
        .fav-btn-hero.active{background:gold;color:#000;border-color:gold}
        .fav-btn-hero.active i{color:#000}
        /* BIO STRIP */
        .bio-strip{background:var(--card-bg);border-bottom:1px solid var(--line)}
        .bio-inner{max-width:1100px;margin:0 auto;padding:12px 16px;display:flex;flex-wrap:wrap;gap:6px 20px;align-items:center}
        .bio-item{display:flex;flex-direction:column;gap:2px}
        .bio-label{font:300 9px/1 Oswald,sans-serif;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
        .bio-value{font:500 13px/1 Oswald,sans-serif}
        .bio-sep{width:1px;height:28px;background:var(--line);flex-shrink:0}
        /* TABS */
        .profile-tabs{display:flex;gap:0;border-bottom:2px solid var(--line);max-width:1100px;margin:24px auto 0;padding:0 16px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .profile-tabs::-webkit-scrollbar{display:none}
        .profile-tab{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;padding:10px 18px;cursor:pointer;color:var(--muted);border-bottom:3px solid transparent;margin-bottom:-2px;transition:color .2s,border-color .2s;white-space:nowrap;flex-shrink:0}
        .profile-tab.active{color:var(--fg);border-bottom-color:gold}
        .profile-tab:hover:not(.active){color:var(--fg)}
        /* STATS */
        .stats-section{max-width:1100px;margin:0 auto;padding:20px 16px}
        .stats-title{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;text-align:center;padding:10px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:6px 6px 0 0;color:var(--muted);text-transform:uppercase}
        body.light-theme .stats-title{background:rgba(0,0,0,.03)}
        .stats-grid{display:grid;grid-template-columns:repeat(6,1fr);border:1px solid var(--line);border-top:none;margin-bottom:16px}
        @media(max-width:660px){.stats-grid{grid-template-columns:repeat(3,1fr)}}
        .stat-cell{text-align:center;padding:14px 8px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
        .stats-grid .stat-cell:nth-child(6n){border-right:none}
        @media(max-width:660px){.stats-grid .stat-cell:nth-child(6n){border-right:1px solid var(--line)}.stats-grid .stat-cell:nth-child(3n){border-right:none}}
        .stat-label{font:300 9px/1 Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
        .stat-value{font:700 22px/1 "Bebas Neue",sans-serif;margin-top:6px}
        .season-note{text-align:center;font:300 12px/1.3 Oswald,sans-serif;color:var(--muted);margin:8px 0}
        /* TABLES */
        .table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:0 0 6px 6px;margin-top:4px}
        .season-table{width:100%;border-collapse:collapse;font:300 12px/1.4 Oswald,sans-serif}
        .season-table th{font:700 10px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;padding:8px 6px;text-align:center;border-bottom:2px solid var(--line);color:var(--muted);text-transform:uppercase;white-space:nowrap;background:rgba(255,255,255,.02)}
        body.light-theme .season-table th{background:rgba(0,0,0,.03)}
        .season-table td{padding:8px 6px;text-align:center;border-bottom:1px solid var(--line);white-space:nowrap}
        .season-table tr:last-child td{border-bottom:none}
        .season-table tbody tr:hover{background:rgba(255,209,102,.05)}
        /* TAB CONTENT */
        .tab-content{display:none}
        .tab-content.active{display:block}
        .coming-soon{text-align:center;padding:48px 20px;color:var(--muted);font:300 14px/1.5 Oswald,sans-serif}
        .coming-soon i{font-size:36px;display:block;margin-bottom:12px;opacity:.4}
        /* MODAL */
        .fav-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:60}
        .fav-modal{background:var(--card-bg);border:1px solid var(--line);border-radius:16px;padding:24px;max-width:380px;width:90%;color:var(--fg);box-shadow:0 20px 40px rgba(0,0,0,.4);position:relative}
        .fav-modal h3{font:700 20px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;margin-bottom:8px}
        .fav-modal p{font:300 13px/1.5 Oswald,sans-serif;color:var(--muted);margin-bottom:16px}
        .fav-modal-actions{display:flex;flex-direction:column;gap:8px}
        .fav-modal-actions button{padding:11px 14px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--fg);font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;cursor:pointer;transition:background .15s}
        body.light-theme .fav-modal-actions button{background:rgba(0,0,0,.04)}
        .fav-modal-actions button.cta{background:gold;color:#000;border-color:gold}
        .fav-modal-close{position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:20px;line-height:1}
        /* FOOTER */
        .yat-footer{text-align:center;padding:24px 16px;margin-top:40px;border-top:1px solid var(--line)}
        .yat-footer .sponsor-label{font:300 10px/1 Oswald,sans-serif;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
        .yat-footer .sponsor-name{font:700 15px/1.2 "Bebas Neue",sans-serif;letter-spacing:.04em;margin-top:4px}
        /* DRAWERS */
        .yat-drawer{position:fixed;top:0;width:290px;height:100vh;background:var(--header-bg);z-index:100;padding:24px 20px;overflow-y:auto;transition:transform .3s cubic-bezier(.4,0,.2,1);border-right:1px solid var(--line)}
        .yat-drawer-left{left:0;transform:translateX(-100%)}
        .yat-drawer-right{right:0;transform:translateX(100%);border-right:none;border-left:1px solid var(--line)}
        body.drawer-left-open .yat-drawer-left{transform:translateX(0)}
        body.drawer-account-open #drawerAccount{transform:translateX(0)}
        body.drawer-open{overflow:hidden}
        .yat-close-btn{position:absolute;top:12px;right:12px;background:none;border:none;color:var(--fg);cursor:pointer;font-size:22px;display:flex;align-items:center;opacity:.7}
        .yat-close-btn:hover{opacity:1}
        .drawer-mask{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:90}
        body.drawer-left-open .drawer-mask,body.drawer-account-open .drawer-mask{display:block}
        .drawer-nav-link{display:block;font:300 14px/1 Oswald,sans-serif;padding:10px 0;border-bottom:1px solid var(--line);transition:color .2s}
        .drawer-nav-link:hover{color:gold}
        @media(max-width:640px){
          .hero-inner{flex-direction:column;align-items:center;text-align:center}
          .hero-info-col{padding-bottom:12px}
          .hero-vitals,.hero-badges,.hero-actions{justify-content:center}
          .hero-photo{width:140px;height:175px}
        }
        /* OVERVIEW TAB */
        .overview-section{max-width:1100px;margin:0 auto;padding:20px 16px}
        .ov-card{background:var(--card-bg);border:1px solid var(--line);border-radius:8px;padding:18px 20px;margin-bottom:16px}
        .ov-card-title{font:700 11px/1 "Bebas Neue",sans-serif;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--line)}
        .overview-grid{display:grid;grid-template-columns:1fr 2fr;gap:16px;margin-bottom:16px}
        @media(max-width:700px){.overview-grid{grid-template-columns:1fr}}
        .ov-bio-list{display:flex;flex-direction:column;gap:0}
        .ov-bio-row{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--line)}
        .ov-bio-row:last-child{border-bottom:none}
        .ov-bio-key{font:300 11px/1 Oswald,sans-serif;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;flex-shrink:0;margin-right:8px}
        .ov-bio-val{font:500 13px/1 Oswald,sans-serif;text-align:right}
        /* LEVEL LADDER */
        .level-ladder-wrap{margin-bottom:16px}
        .level-ladder{display:flex;align-items:flex-start;gap:0;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
        .level-ladder::-webkit-scrollbar{display:none}
        .level-stop{display:flex;flex-direction:column;align-items:center;position:relative;min-width:56px}
        .level-line-wrap{display:flex;align-items:center;width:100%;position:relative;height:20px}
        .level-dot{width:12px;height:12px;border-radius:50%;background:var(--line);border:2px solid var(--muted);flex-shrink:0;transition:background .2s}
        .level-stop.peak .level-dot{background:gold;border-color:gold;width:16px;height:16px}
        .level-connector{flex:1;height:2px;background:var(--line)}
        .level-stop:last-child .level-connector{display:none}
        .level-name{font:700 9px/1 "Bebas Neue",sans-serif;letter-spacing:.06em;margin-top:6px;color:var(--muted);white-space:nowrap}
        .level-stop.peak .level-name{color:gold}
        /* THEN & NOW PHOTOS */
        .then-now-wrap{margin-bottom:16px}
        .then-now-photos{display:flex;gap:16px;margin-top:4px}
        .then-now-photo-item{display:flex;flex-direction:column;align-items:center;gap:8px;flex:1;max-width:200px}
        .then-now-img{width:100%;max-width:180px;height:auto;aspect-ratio:4/5;object-fit:cover;object-position:top;border-radius:6px;border:1px solid var(--line);display:block}
        .then-now-label{font:700 10px/1 "Bebas Neue",sans-serif;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
        /* CAREER LOG TABLE */
        .career-log-title{font:700 12px/1 "Bebas Neue",sans-serif;letter-spacing:.1em;padding:10px 14px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:6px 6px 0 0;color:var(--muted);text-transform:uppercase;display:flex;align-items:center;gap:8px}
        body.light-theme .career-log-title{background:rgba(0,0,0,.03)}
        .career-log .year-cell{font:700 12px/1 Oswald,sans-serif;color:var(--fg)}
        .career-log .team-cell{font:400 11px/1.3 Oswald,sans-serif;color:var(--muted);text-align:left;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .career-log tbody tr.level-row{border-left:3px solid transparent}
        .career-log tbody tr.level-mlb{border-left-color:#1d6fa4}
        .career-log tbody tr.level-aaa{border-left-color:#c8102e}
        .career-log tbody tr.level-aa{border-left-color:#e07b39}
        .career-log tbody tr[class*="level-a"]{border-left-color:#f5a623}
        .career-log tbody tr.level-ind{border-left-color:#6a0dad}
        .career-log tbody tr.level-coll{border-left-color:#2ecc71}
        .career-log tbody tr.level-rok{border-left-color:#27ae60}
        .career-log tbody .career-totals-row{background:rgba(255,209,102,.08);font-weight:700}
        body.light-theme .career-log tbody .career-totals-row{background:rgba(255,209,102,.12)}
        .career-log tbody .career-totals-row td{font:700 12px/1.4 Oswald,sans-serif;border-top:2px solid rgba(255,209,102,.3)}
        .career-log tbody .career-totals-row .year-cell{color:gold}
        .log-section{margin-bottom:20px}
      `}</style>

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
              <a key={item.tab} href={`/${resolvedHsid}#sec-${item.tab}`} className="yat-nav-pair">
                {item.thin && <span className="thin">{item.thin} </span>}
                <span className="bold">{item.bold}</span>
              </a>
            ))}
          </nav>
          <div className="yat-wordmark-wrap">
            <a href="https://home.yatstats.com" style={{textDecoration:'none',display:'flex',alignItems:'center'}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png" alt="YAT?STATS" style={{height:'28px',width:'auto',filter:'var(--logo-filter)'}} />
            </a>
          </div>
        </div>
        <div className="yat-hr" />
        <div className="yat-schoolrow">
          <SafeImage className="yat-crest" src={crestUrl} alt={`${schoolName} crest`} />
          <div className="yat-schooltext">
            <div className="small">{location}</div>
            <div className="big1">{schoolName}</div>
            <div className="big2">{displayName}</div>
          </div>
        </div>
        <div className="yat-hr" />
      </header>

      {/* DRAWER MASK */}
      <div className="drawer-mask" id="drawerMask" />

      {/* LEFT DRAWER */}
      <aside className="yat-drawer yat-drawer-left" id="drawerLeft">
        <button className="yat-icon-btn yat-close-btn" id="closeLeft"><i className="ri-close-line" /></button>
        <h3 style={{font:'700 16px "Bebas Neue",sans-serif',letterSpacing:'.1em',marginBottom:'16px',paddingTop:'8px'}}>NAVIGATION</h3>
        <div style={{display:'flex',flexDirection:'column'}}>
          <a href={`/${resolvedHsid}`} className="drawer-nav-link">&#8592; BACK TO {schoolName}</a>
          {navItems.map((item) => (
            <a key={item.tab} href={`/${resolvedHsid}#sec-${item.tab}`} className="drawer-nav-link">
              {item.thin ? `${item.thin} ` : ""}{item.bold}
            </a>
          ))}
        </div>
      </aside>

      {/* ACCOUNT DRAWER */}
      <aside className="yat-drawer yat-drawer-right" id="drawerAccount">
        <button className="yat-icon-btn yat-close-btn" id="closeAccount"><i className="ri-close-line" /></button>
        <h3 style={{font:'700 16px "Bebas Neue",sans-serif',letterSpacing:'.1em',marginBottom:'16px',paddingTop:'8px'}}>ACCOUNT</h3>
        <AccountDrawer subdomain={subdomain} />
      </aside>

      {/* HERO */}
      <section className="player-hero">
        <div className="hero-inner">
          <div className="hero-photo-col">
            <SafeImage
              className="hero-photo"
              src={playerNowImg}
              alt={displayName}
              fallbackSrc={playerThenImg}
              placeholderSrc="/img/player-silhouette.png"
              style={{width:'160px',height:'200px',objectFit:'cover' as const,objectPosition:'top',borderRadius:'8px 8px 0 0',display:'block'}}
            />
            <SafeImage
              className="hero-crest-badge"
              src={crestUrl}
              alt={schoolName}
              fallbackSrc="/img/yatstats-logo-circle.png"
              placeholderSrc="/img/yatstats-logo-circle.png"
            />
          </div>
          <div className="hero-info-col">
            <a href={`/${resolvedHsid}`} className="hero-school-link">
              <i className="ri-arrow-left-s-line" />
              {playerSchool ? String(playerSchool.hsname || schoolName) : schoolName}
            </a>
            <div className="hero-name">{displayName}</div>
            <div className="hero-vitals">
              {pos !== "--" && <span>{pos}</span>}
              {pos !== "--" && <span className="sep">|</span>}
              <span>B/T: {bt}</span>
              {ht !== "--" && <><span className="sep">|</span><span>H: {ht}</span></>}
              {wt !== "--" && <><span className="sep">|</span><span>W: {wt}</span></>}
              {college !== "N/A" && <><span className="sep">|</span><span>{college}</span></>}
            </div>
            <div className="hero-badges">
              <span className={`chip chip-level chip-${level.toLowerCase().replace(/[^a-z0-9]/g,'-')}`}>{level}</span>
              <span className="chip chip-status">{statusLabel}</span>
              {gradClass !== "--" && <span className="chip chip-status">CLASS OF {gradClass}</span>}
            </div>
            <div className="hero-actions">
              <button id="btnFanFav" className="fav-btn-hero" data-type="fan">
                <i className="ri-star-line" /> ADD FAN FAVORITE
              </button>
              <button id="btnSuperFav" className="fav-btn-hero" data-type="superfan">
                <i className="ri-star-fill" /> SUPERFAN DASHBOARD
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* BIO STRIP */}
      <div className="bio-strip">
        <div className="bio-inner">
          {pos !== "--" && <>
            <div className="bio-item">
              <span className="bio-label">Position</span>
              <span className="bio-value">{pos}</span>
            </div>
            <div className="bio-sep" />
          </>}
          {ht !== "--" && <>
            <div className="bio-item">
              <span className="bio-label">Height</span>
              <span className="bio-value">{ht}</span>
            </div>
            <div className="bio-sep" />
          </>}
          {wt !== "--" && <>
            <div className="bio-item">
              <span className="bio-label">Weight</span>
              <span className="bio-value">{wt} lbs</span>
            </div>
            <div className="bio-sep" />
          </>}
          {bt !== "-/-" && <>
            <div className="bio-item">
              <span className="bio-label">Bats / Throws</span>
              <span className="bio-value">{bt}</span>
            </div>
            <div className="bio-sep" />
          </>}
          {draftInfo !== "N/A" && <>
            <div className="bio-item">
              <span className="bio-label">Draft</span>
              <span className="bio-value">{draftInfo}</span>
            </div>
            <div className="bio-sep" />
          </>}
          {college !== "N/A" && (
            <div className="bio-item">
              <span className="bio-label">College</span>
              <span className="bio-value">{college}</span>
            </div>
          )}
        </div>
      </div>

      {/* TABS */}
      <div className="profile-tabs" role="tablist">
        <div role="tab" className="profile-tab active" data-profile-tab="overview" tabIndex={0}>OVERVIEW</div>
        <div role="tab" className="profile-tab" data-profile-tab="stats" tabIndex={0}>CAREER STATS</div>
        <div role="tab" className="profile-tab" data-profile-tab="news" tabIndex={0}>NEWS &amp; VIDEOS</div>
        <div role="tab" className="profile-tab" data-profile-tab="social" tabIndex={0}>SOCIAL MEDIA</div>
        <div role="tab" className="profile-tab" data-profile-tab="mentor" tabIndex={0}>MENTORSHIP MARKETPLACE</div>
        <div role="tab" className="profile-tab" data-profile-tab="gallery" tabIndex={0}>PHOTO GALLERY</div>
      </div>

      {/* TAB: OVERVIEW */}
      <div className="tab-content active" id="tab-overview" role="tabpanel">
        <div className="overview-section">

          {/* Two-column: Bio + Career Highlights */}
          <div className="overview-grid">
            {/* Bio Card */}
            <div className="ov-card">
              <div className="ov-card-title">BIO</div>
              <div className="ov-bio-list">
                {pos !== "--" && <div className="ov-bio-row"><span className="ov-bio-key">Position</span><span className="ov-bio-val">{pos}</span></div>}
                {ht !== "--" && <div className="ov-bio-row"><span className="ov-bio-key">Height</span><span className="ov-bio-val">{ht}</span></div>}
                {wt !== "--" && <div className="ov-bio-row"><span className="ov-bio-key">Weight</span><span className="ov-bio-val">{wt} lbs</span></div>}
                {bt !== "-/-" && <div className="ov-bio-row"><span className="ov-bio-key">Bats / Throws</span><span className="ov-bio-val">{bt}</span></div>}
                <div className="ov-bio-row"><span className="ov-bio-key">High School</span><span className="ov-bio-val">{playerSchool ? String(playerSchool.hsname || schoolName) : schoolName}</span></div>
                {college !== "N/A" && <div className="ov-bio-row"><span className="ov-bio-key">College</span><span className="ov-bio-val">{college}</span></div>}
                {draftInfo !== "N/A" && <div className="ov-bio-row"><span className="ov-bio-key">Draft</span><span className="ov-bio-val">{draftInfo}</span></div>}
                <div className="ov-bio-row"><span className="ov-bio-key">Career High</span><span className="ov-bio-val">{level}</span></div>
                <div className="ov-bio-row"><span className="ov-bio-key">Status</span><span className="ov-bio-val">{statusLabel}</span></div>
              </div>
            </div>

            {/* Career Highlights */}
            <div className="ov-card">
              <div className="ov-card-title">CAREER HIGHLIGHTS</div>
              {careerGrid.length > 0 ? (
                <div className="stats-grid" style={{border:'none',marginBottom:0}}>
                  {careerGrid.map((s, i) => (
                    <div key={i} className="stat-cell" style={{border:'1px solid var(--line)',borderRadius:'4px'}}>
                      <div className="stat-label">{s.k}</div>
                      <div className="stat-value">{s.v}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="season-note">No career statistics available.</div>
              )}
            </div>
          </div>

          {/* Career Path — level progression timeline */}
          {levelLadder.length > 0 && (
            <div className="ov-card level-ladder-wrap">
              <div className="ov-card-title">CAREER PATH</div>
              <div className="level-ladder">
                {levelLadder.map((lvl, i) => (
                  <div key={lvl} className={`level-stop${lvl === peakLevel ? ' peak' : ''}`}>
                    <div className="level-line-wrap">
                      <div className="level-dot" />
                      {i < levelLadder.length - 1 && <div className="level-connector" />}
                    </div>
                    <div className="level-name">{lvl}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* THEN & NOW */}
          <div className="ov-card then-now-wrap">
            <div className="ov-card-title">THEN &amp; NOW</div>
            <div className="then-now-photos">
              <div className="then-now-photo-item">
                <SafeImage
                  className="then-now-img"
                  src={playerThenImg}
                  alt={`${displayName} — THEN`}
                  fallbackSrc="/img/player-silhouette.png"
                  placeholderSrc="/img/player-silhouette.png"
                  style={{width:'100%',maxWidth:'180px',aspectRatio:'4/5',objectFit:'cover' as const,objectPosition:'top',borderRadius:'6px',display:'block'}}
                />
                <div className="then-now-label">THEN</div>
              </div>
              <div className="then-now-photo-item">
                <SafeImage
                  className="then-now-img"
                  src={playerNowImg}
                  alt={`${displayName} — NOW`}
                  fallbackSrc={playerThenImg}
                  placeholderSrc="/img/player-silhouette.png"
                  style={{width:'100%',maxWidth:'180px',aspectRatio:'4/5',objectFit:'cover' as const,objectPosition:'top',borderRadius:'6px',display:'block'}}
                />
                <div className="then-now-label">NOW</div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* TAB: CAREER STATS (Baseball Reference–style career log) */}
      <div className="tab-content" id="tab-stats" role="tabpanel">
        <div className="overview-section">

          {battingSeasons.length > 0 && (
            <div className="log-section">
              <div className="career-log-title"><i className="ri-bar-chart-2-line" /> BATTING</div>
              <div className="table-wrap" style={{borderRadius:'0 0 6px 6px',borderTop:'none'}}>
                <table className="season-table career-log">
                  <thead>
                    <tr>
                      <th>YEAR</th><th>TEAM</th><th>LVL</th><th>G</th><th>AB</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th><th>R</th><th>SB</th><th>BB</th><th>SO</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {battingSeasons.map((b: BattingSeason, i: number) => (
                      <tr key={i} className={`level-row ${levelClass(b.level||'')}`}>
                        <td className="year-cell">{b.year}</td>
                        <td className="team-cell">{b.team_name || '--'}</td>
                        <td>{(b.level||'--').toUpperCase()}</td>
                        <td>{fmt(b.g)}</td><td>{fmt(b.ab)}</td><td>{fmt(b.h)}</td>
                        <td>{fmt(b["2b"])}</td><td>{fmt(b["3b"])}</td><td>{fmt(b.hr)}</td>
                        <td>{fmt(b.rbi)}</td><td>{fmt(b.r)}</td><td>{fmt(b.sb)}</td>
                        <td>{fmt(b.bb)}</td><td>{fmt(b.so)}</td>
                        <td>{fmtAvg(b.avg)}</td><td>{fmtAvg(b.obp)}</td>
                        <td>{fmtAvg(b.slg)}</td><td>{fmtAvg(b.ops)}</td>
                      </tr>
                    ))}
                    {careerBatting && (
                      <tr className="career-totals-row">
                        <td className="year-cell">CAREER</td>
                        <td>—</td>
                        <td>—</td>
                        <td>{fmt(careerBatting.g)}</td><td>{fmt(careerBatting.ab)}</td><td>{fmt(careerBatting.h)}</td>
                        <td>{fmt(careerBatting["2b"])}</td><td>{fmt(careerBatting["3b"])}</td><td>{fmt(careerBatting.hr)}</td>
                        <td>{fmt(careerBatting.rbi)}</td><td>{fmt(careerBatting.r)}</td><td>{fmt(careerBatting.sb)}</td>
                        <td>{fmt(careerBatting.bb)}</td><td>{fmt(careerBatting.so)}</td>
                        <td>{fmtAvg(careerBatting.avg)}</td><td>{fmtAvg(careerBatting.obp)}</td>
                        <td>{fmtAvg(careerBatting.slg)}</td><td>{fmtAvg(careerBatting.ops)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pitchingSeasons.length > 0 && (
            <div className="log-section">
              <div className="career-log-title"><i className="ri-baseball-line" /> PITCHING</div>
              <div className="table-wrap" style={{borderRadius:'0 0 6px 6px',borderTop:'none'}}>
                <table className="season-table career-log">
                  <thead>
                    <tr>
                      <th>YEAR</th><th>TEAM</th><th>LVL</th><th>G</th><th>GS</th><th>W</th><th>L</th><th>SV</th><th>IP</th><th>ER</th><th>KO</th><th>BB</th><th>ERA</th><th>WHIP</th><th>K/9</th><th>K/BB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pitchingSeasons.map((p: PitchingSeason, i: number) => (
                      <tr key={i} className={`level-row ${levelClass(p.level||'')}`}>
                        <td className="year-cell">{p.year}</td>
                        <td className="team-cell">{p.team_name || '--'}</td>
                        <td>{(p.level||'--').toUpperCase()}</td>
                        <td>{fmt(p.g)}</td><td>{fmt(p.gs)}</td><td>{fmt(p.w)}</td><td>{fmt(p.l)}</td>
                        <td>{fmt(p.saves)}</td><td>{fmt(p.ip, 1)}</td><td>{fmt(p.er)}</td>
                        <td>{fmt(p.ko)}</td><td>{fmt(p.bb)}</td>
                        <td>{fmt(p.era, 2)}</td><td>{fmt(p.whip, 2)}</td>
                        <td>{fmt(p.k9, 2)}</td><td>{fmt(p.kbb, 2)}</td>
                      </tr>
                    ))}
                    {careerPitching && (
                      <tr className="career-totals-row">
                        <td className="year-cell">CAREER</td>
                        <td>—</td>
                        <td>—</td>
                        <td>{fmt(careerPitching.g)}</td><td>{fmt(careerPitching.gs)}</td>
                        <td>{fmt(careerPitching.w)}</td><td>{fmt(careerPitching.l)}</td>
                        <td>{fmt(careerPitching.saves)}</td><td>{fmt(careerPitching.ip, 1)}</td>
                        <td>{fmt(careerPitching.er)}</td><td>{fmt(careerPitching.ko)}</td>
                        <td>{fmt(careerPitching.bb)}</td>
                        <td>{fmt(careerPitching.era, 2)}</td><td>{fmt(careerPitching.whip, 2)}</td>
                        <td>{fmt(careerPitching.k9, 2)}</td><td>{fmt(careerPitching.kbb, 2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {battingSeasons.length === 0 && pitchingSeasons.length === 0 && (
            <div className="season-note" style={{padding:'40px 0'}}>No career statistics available.</div>
          )}

          {draftInfo !== "N/A" && (
            <div className="season-note">Draft: {draftInfo}</div>
          )}
        </div>
      </div>

      {/* TAB: NEWS */}
      <div className="tab-content" id="tab-news" role="tabpanel">
        <div className="stats-section">
          <div className="coming-soon">
            <i className="ri-newspaper-line" />
            NEWS &amp; VIDEO CLIPS — Coming soon
          </div>
        </div>
      </div>

      {/* TAB: SOCIAL */}
      <div className="tab-content" id="tab-social" role="tabpanel">
        <div className="stats-section">
          <div className="coming-soon">
            <i className="ri-share-line" />
            SOCIAL MEDIA — Coming soon
          </div>
        </div>
      </div>

      {/* TAB: MENTOR */}
      <div className="tab-content" id="tab-mentor" role="tabpanel">
        <div className="stats-section">
          <div className="coming-soon">
            <i className="ri-team-line" />
            MENTORSHIP MARKETPLACE — Coming soon
          </div>
        </div>
      </div>

      {/* TAB: GALLERY */}
      <div className="tab-content" id="tab-gallery" role="tabpanel">
        <div className="stats-section">
          <div className="coming-soon">
            <i className="ri-image-line" />
            PHOTO GALLERY — Coming soon
          </div>
        </div>
      </div>

      {/* FAVORITES MODAL */}
      <div className="fav-modal-mask" id="favModalMask" role="dialog" aria-modal="true">
        <div className="fav-modal">
          <button className="fav-modal-close" id="favModalClose" aria-label="Close modal">&times;</button>
          <h3>Pick your experience</h3>
          <p>FREE users can browse. Register as a FAN to save favorites. Upgrade to SUPERFAN for the full dashboard.</p>
          <div className="fav-modal-actions">
            <button id="favContinue">Continue Free</button>
            <button id="favRegister" className="cta">Register as Fan</button>
            <button id="favUpgrade">Upgrade to SuperFan</button>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="yat-footer">
        <a href="https://peteismyagent.com/products" target="_blank" rel="noopener noreferrer">
          <div className="sponsor-label">PRESENTED BY</div>
          <div className="sponsor-name">AMERICAN SOLUTIONS FOR BUSINESS</div>
        </a>
      </footer>

      {/* CLIENT INTERACTIVITY */}
      <script dangerouslySetInnerHTML={{__html:`
(function(){
  /* Theme */
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
  /* Profile tab switching */
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
  /* Favorites */
  var playerId='${playerId}';
  var playerName='${displayName.replace(/'/g, "\\'")}';
  var favMask=document.getElementById('favModalMask');
  function openFavModal(){if(favMask){favMask.style.display='flex';}}
  function closeFavModal(){if(favMask){favMask.style.display='none';}}
  var btnFanFav=document.getElementById('btnFanFav');
  var btnSuperFav=document.getElementById('btnSuperFav');
  function setFavState(btn,active){if(!btn)return;if(active){btn.classList.add('active');}else{btn.classList.remove('active');}}
  function addFavorite(type){
    var user=null;
    try{user=JSON.parse(localStorage.getItem('yat-user')||'null');}catch(e){console.warn('Invalid stored user',e);localStorage.removeItem('yat-user');}
    if(!user||!user.contactId){openFavModal();return;}
    if(type==='superfan'&&!user.isSuperFan){openFavModal();return;}
    fetch('/api/favorites',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contactId:user.contactId,playerId:playerId,playerName:playerName,type:type})
    }).then(function(r){return r.json();}).then(function(data){
      if(data&&data.success){
        if(type==='superfan')setFavState(btnSuperFav,true);
        if(type==='fan')setFavState(btnFanFav,true);
        alert(playerName+' added to your '+(type==='superfan'?'SuperFan Dashboard':'Fan Favorites')+'.');
      }else{
        alert('Error: '+(data&&data.error?data.error:'Could not add favorite'));
      }
    }).catch(function(){alert('Network error. Please try again.');});
  }
  if(btnFanFav)btnFanFav.addEventListener('click',function(){addFavorite('fan');});
  if(btnSuperFav)btnSuperFav.addEventListener('click',function(){addFavorite('superfan');});
  var favClose=document.getElementById('favModalClose');
  var favContinue=document.getElementById('favContinue');
  var favRegister=document.getElementById('favRegister');
  var favUpgrade=document.getElementById('favUpgrade');
  if(favClose)favClose.addEventListener('click',closeFavModal);
  if(favMask)favMask.addEventListener('click',function(e){if(e.target===favMask)closeFavModal();});
  if(favContinue)favContinue.addEventListener('click',closeFavModal);
  if(favRegister)favRegister.addEventListener('click',function(){window.location.href='/api/auth/register';});
  if(favUpgrade)favUpgrade.addEventListener('click',function(){window.location.href='/api/auth/register?plan=superfan';});
})();
      `}} />
    </>
  );
}
