"use client";

import { useEffect } from "react";

type FeaturedTeamNewsInjectorProps = {
  player?: Record<string, unknown>;
  hsid?: string;
};

type FeaturedMedia = {
  id: string;
  url: string;
  embedUrl: string;
  badge: string;
  title: string;
  subtitle: string;
  body: string;
  source: string;
  accent?: "red" | "gold";
  target?: "news" | "schedule";
};

const MW_VIDEO_URL = "https://themw.com/news/2026/03/23/grand-canyon-at-nevada-7/";
const NFHS_HAMILTON_URL = "https://www.nfhsnetwork.com/events/aia/gam63324ef372";
const MILB_ACES_AVIATORS_GAMEDAY_URL = "https://www.milb.com/gameday/aviators-vs-aces/2026/05/16/815148/live";

function norm(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textOf(value: unknown) {
  return String(value || "").trim();
}

function firstNameOf(displayName: string) {
  return String(displayName || "this player").trim().split(/\s+/)[0] || "this player";
}

function playerDisplayName(player: Record<string, unknown>) {
  return textOf(player.display_name) || textOf(player.displayName) || `${textOf(player.firstname)} ${textOf(player.lastname)}`.trim() || "this player";
}

function playerSearchText(player: Record<string, unknown>) {
  return norm([
    player.current_team_name,
    player.currentTeamName,
    player.team_name,
    player.current_org_or_conference_name,
    player.currentOrgOrConferenceName,
    player.orgConferenceName,
    player.level_label,
    player.levelLabel,
    player.display_name,
  ].filter(Boolean).join(" "));
}

function isAcesOrAviatorsPlayer(player: Record<string, unknown>) {
  const haystack = playerSearchText(player);
  return (
    haystack.includes("reno aces") ||
    haystack.includes("aces") ||
    haystack.includes("las vegas aviators") ||
    haystack.includes("aviators")
  );
}

function isNevadaOrGcuPlayer(player: Record<string, unknown>) {
  const haystack = playerSearchText(player);

  return (
    haystack.includes("university of nevada") ||
    haystack.includes("nevada reno") ||
    haystack.includes("reno wolf pack") ||
    haystack.includes("nevada wolf pack") ||
    haystack.includes("grand canyon") ||
    haystack.includes("gcu antelopes") ||
    haystack.includes("grand canyon university")
  );
}

function isHamiltonCurrentTeamPlayer(player: Record<string, unknown>, fallbackHsid?: string) {
  const hsid = textOf(player.hsid || player.schoolId || player.school_id || fallbackHsid);
  const haystack = norm([
    player.hsname,
    player.schoolName,
    player.high_school,
    player.current_team_name,
    player.currentTeamName,
    player.team_name,
    player.level_label,
    player.display_level_label,
    player.level,
    player.highlevel,
    player.current_level,
    player.current_level_label,
    player.status_label,
    player.display_status_label,
    player.team_affiliation_status,
    player.display_name,
    player.class_year,
    player.grad_year,
    player.graduation_year,
  ].filter(Boolean).join(" "));

  const isHamilton =
    hsid === "5004" ||
    haystack.includes("hamilton high school") ||
    haystack.includes("hamilton huskies");

  const isCurrentHighSchoolTeam =
    haystack.includes("high school") ||
    haystack.includes("2026 high school team") ||
    haystack.includes("current team") ||
    haystack.includes("current hs") ||
    haystack.includes(" hs ") ||
    (haystack.includes("2026") && haystack.includes("hamilton"));

  return isHamilton && isCurrentHighSchoolTeam;
}

function mediaForPlayer(player: Record<string, unknown>, hsid?: string): FeaturedMedia | null {
  if (isAcesOrAviatorsPlayer(player)) {
    return {
      id: "milb-aces-aviators-815148",
      url: MILB_ACES_AVIATORS_GAMEDAY_URL,
      embedUrl: MILB_ACES_AVIATORS_GAMEDAY_URL,
      badge: "YAT?STATS LIVE",
      title: "Aviators vs Aces",
      subtitle: "MiLB Gameday Feed",
      body: "Open the live MiLB Gameday feed for this Aces/Aviators matchup.",
      source: "MiLB Gameday",
      accent: "gold",
      target: "schedule",
    };
  }

  if (isHamiltonCurrentTeamPlayer(player, hsid)) {
    return {
      id: "nfhs-hamilton-game-63324ef372",
      url: NFHS_HAMILTON_URL,
      embedUrl: NFHS_HAMILTON_URL,
      badge: "LIVE STREAM",
      title: "Hamilton Live Game Stream",
      subtitle: "Featured FunZone News Video",
      body: "Watch the Hamilton game live on NFHS Network.",
      source: "NFHS Network",
      accent: "gold",
      target: "news",
    };
  }

  if (isNevadaOrGcuPlayer(player)) {
    return {
      id: "mw-grand-canyon-nevada",
      url: MW_VIDEO_URL,
      embedUrl: MW_VIDEO_URL,
      badge: "VIDEO STREAM",
      title: "Grand Canyon at Nevada",
      subtitle: "Featured FunZone News Video",
      body: "Mountain West stream featuring this player's current-team matchup.",
      source: "Mountain West",
      accent: "red",
      target: "news",
    };
  }

  return null;
}

function htmlAttr(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildStreamCard(displayName: string, media: FeaturedMedia, variant: "flip" | "profile") {
  const firstName = firstNameOf(displayName);
  const body = media.body.replace("this player's", `${firstName}'s`);
  const wrapper = document.createElement("div");
  wrapper.className = `fz-featured-stream-card fz-featured-stream-${variant}`;
  wrapper.setAttribute("data-yat-team-video", media.id);
  wrapper.innerHTML = `
    <div class="fz-stream-frame-card ${media.accent === "gold" ? "fz-stream-gold" : "fz-stream-red"}">
      <div class="fz-stream-topline">
        <span class="fz-stream-badge">${media.badge}</span>
        <strong>${media.title}</strong>
      </div>
      <div class="fz-stream-subtitle">${media.subtitle}</div>
      <div class="fz-stream-window">
        <iframe
          src="${media.embedUrl}"
          title="${media.title}"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
        ></iframe>
        <a class="fz-stream-open-overlay" href="${media.url}" target="_blank" rel="noopener noreferrer">
          <span>Open Feed</span>
        </a>
      </div>
      <div class="fz-stream-footer">
        <span>${body}</span>
        <a href="${media.url}" target="_blank" rel="noopener noreferrer">Open Feed</a>
      </div>
    </div>
  `;
  return wrapper;
}

function openYatLiveModal(media: FeaturedMedia) {
  const existing = document.getElementById("yat-live-modal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "yat-live-modal";
  overlay.className = "yat-live-modal";
  overlay.innerHTML = `
    <div class="yat-live-backdrop" data-yat-live-close="true"></div>
    <section class="yat-live-shell" role="dialog" aria-modal="true" aria-label="YAT?STATS LIVE">
      <header class="yat-live-header">
        <div>
          <span>${htmlAttr(media.badge)}</span>
          <strong>${htmlAttr(media.title)}</strong>
        </div>
        <button type="button" class="yat-live-close" data-yat-live-close="true" aria-label="Close YAT live module">×</button>
      </header>
      <div class="yat-live-frame-wrap">
        <iframe
          src="${htmlAttr(media.embedUrl)}"
          title="${htmlAttr(media.title)}"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
      <footer class="yat-live-footer">
        <span>YAT?STATS LIVE browser window • ${htmlAttr(media.source)}</span>
        <a href="${htmlAttr(media.url)}" target="_blank" rel="noopener noreferrer">Open source</a>
      </footer>
    </section>
  `;

  overlay.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.getAttribute("data-yat-live-close") === "true") overlay.remove();
  });

  document.body.appendChild(overlay);
}

function buildScheduleBanner(media: FeaturedMedia) {
  const wrapper = document.createElement("div");
  wrapper.className = "fz-gameday-banner";
  wrapper.setAttribute("data-yat-team-video", media.id);
  wrapper.innerHTML = `
    <button class="fz-gameday-banner-link" type="button" data-yat-live-open="${htmlAttr(media.id)}">
      <span class="fz-gameday-kicker">${media.badge}</span>
      <strong>${media.title}</strong>
      <span>${media.subtitle} - tap to open the YAT?STATS LIVE module</span>
    </button>
  `;
  const button = wrapper.querySelector("[data-yat-live-open]");
  button?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openYatLiveModal(media);
  });
  return wrapper;
}

function ensureStyles() {
  if (document.getElementById("yat-team-video-news-style")) return;
  const style = document.createElement("style");
  style.id = "yat-team-video-news-style";
  style.textContent = `
    .fz-featured-stream-card{width:100%;margin:0 0 clamp(7px,2.2cqi,13px);}
    .fz-stream-frame-card{border:1px solid rgba(207,176,86,.46);background:linear-gradient(180deg,#1b160f 0%,#090806 100%);box-shadow:0 5px 16px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.08);color:#f8f2df;padding:clamp(6px,2.2cqi,12px);}
    .fz-stream-topline{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:clamp(7px,2.2cqi,12px);border-bottom:1px solid rgba(207,176,86,.42);padding-bottom:clamp(5px,1.6cqi,9px);}
    .fz-stream-badge{display:inline-flex;align-items:center;justify-content:center;min-height:clamp(18px,5.8cqi,28px);padding:0 clamp(7px,2.3cqi,13px);background:#df1e24;color:white;font:900 clamp(7px,2.2cqi,11px)/1 Oswald,sans-serif;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;}
    .fz-stream-gold .fz-stream-badge{background:#d4b15c;color:#111;}
    .fz-stream-topline strong{font:900 clamp(13px,4.7cqi,23px)/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#f1cf62;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .fz-stream-subtitle{border-bottom:1px solid rgba(255,255,255,.12);padding:clamp(5px,1.6cqi,8px) 0;color:rgba(255,255,255,.82);font:900 clamp(8px,2.8cqi,13px)/1 Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;}
    .fz-stream-window{position:relative;aspect-ratio:16/9;margin-top:clamp(7px,2.4cqi,12px);background:radial-gradient(circle at 50% 35%,rgba(210,180,92,.16),transparent 32%),#050505;overflow:hidden;border:1px solid rgba(255,255,255,.09);}
    .fz-stream-window iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#050505;}
    .fz-stream-open-overlay{position:absolute;right:clamp(6px,2cqi,10px);bottom:clamp(6px,2cqi,10px);display:inline-flex;align-items:center;justify-content:center;min-height:clamp(24px,6cqi,34px);padding:0 clamp(10px,3cqi,16px);border:1px solid rgba(207,176,86,.72);background:rgba(8,6,4,.72);color:#f1cf62;text-decoration:none;font:900 clamp(8px,2.4cqi,12px)/1 Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;}
    .fz-stream-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:clamp(6px,1.8cqi,10px);color:rgba(255,255,255,.72);font:700 clamp(7px,2.1cqi,10px)/1.25 Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase;}
    .fz-stream-footer span{min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .fz-stream-footer a{flex:0 0 auto;color:#f1cf62;text-decoration:none;border:1px solid rgba(207,176,86,.54);padding:clamp(4px,1.3cqi,7px) clamp(7px,2cqi,11px);}
    .fz-gameday-banner{width:100%;margin:0 0 clamp(7px,2.2cqi,13px);}
    .fz-gameday-banner-link{display:grid;width:100%;text-align:left;gap:clamp(2px,.8cqi,4px);padding:clamp(7px,2.4cqi,12px);border:1px solid rgba(207,176,86,.56);border-radius:clamp(6px,1.8cqi,10px);background:linear-gradient(135deg,#161109,#2a2114 55%,rgba(212,177,92,.25));color:#f8f2df;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.08);cursor:pointer;}
    .fz-gameday-kicker{font:900 clamp(7px,2.2cqi,10px)/1 Oswald,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#d4b15c;}
    .fz-gameday-banner strong{font:900 clamp(13px,4.4cqi,21px)/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;}
    .fz-gameday-banner span:last-child{font:700 clamp(7px,2.2cqi,10px)/1.25 Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.76);}
    .yat-live-modal{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:clamp(12px,3vw,34px);}
    .yat-live-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(4px);}
    .yat-live-shell{position:relative;width:min(1180px,96vw);height:min(760px,88vh);display:flex;flex-direction:column;border:1px solid rgba(212,177,92,.62);border-radius:18px;overflow:hidden;background:#080705;box-shadow:0 28px 80px rgba(0,0,0,.62), inset 0 1px 0 rgba(255,255,255,.08);}
    .yat-live-header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px 10px;border-bottom:1px solid rgba(212,177,92,.42);background:linear-gradient(90deg,#171109,#2c2113);color:#fff;}
    .yat-live-header div{display:flex;min-width:0;flex-direction:column;gap:3px;}
    .yat-live-header span{font:900 11px/1 Oswald,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#d4b15c;}
    .yat-live-header strong{font:900 clamp(22px,4vw,42px)/.95 "Bebas Neue",Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;}
    .yat-live-close{width:42px;height:42px;border:1px solid rgba(212,177,92,.46);border-radius:999px;background:rgba(0,0,0,.25);color:#f8f2df;font:300 32px/1 system-ui,sans-serif;cursor:pointer;}
    .yat-live-frame-wrap{position:relative;flex:1;min-height:0;background:#050505;}
    .yat-live-frame-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#050505;}
    .yat-live-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-top:1px solid rgba(212,177,92,.35);background:#100d09;color:rgba(255,255,255,.72);font:800 11px/1.2 Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;}
    .yat-live-footer a{color:#f1cf62;text-decoration:none;border:1px solid rgba(212,177,92,.45);padding:7px 10px;white-space:nowrap;}
    .fz-featured-stream-profile{max-width:820px;margin:0 auto 18px;}
    .fz-featured-stream-profile .fz-stream-frame-card{padding:14px;}
    .fz-featured-stream-profile .fz-stream-topline strong{font-size:clamp(24px,5vw,44px);}
    .fz-featured-stream-profile .fz-stream-subtitle{font-size:clamp(13px,2.4vw,18px);}
    .fz-featured-stream-profile .fz-stream-footer{font-size:clamp(11px,1.8vw,14px);}
  `;
  document.head.appendChild(style);
}

export default function FeaturedTeamNewsInjector({ player = {}, hsid }: FeaturedTeamNewsInjectorProps) {
  useEffect(() => {
    const selectedMedia = mediaForPlayer(player, hsid);
    if (!selectedMedia) return;

    const media: FeaturedMedia = selectedMedia;
    const displayName = playerDisplayName(player);
    ensureStyles();

    let cancelled = false;

    function injectFlipCardNews() {
      if (media.target === "schedule") return;
      const playerId = textOf(player.playerid || player.playerId || "");
      if (!playerId) return;
      const root = document.querySelector(`[data-player-card-id="${playerId}"]`);
      const panel = root?.querySelector(".fz-panel") as HTMLElement | null;
      const activeNews = root?.querySelector(".fz-tab-btn.fz-tab-active .ri-newspaper-line");
      if (!panel || !activeNews) return;
      if (panel.querySelector(`[data-yat-team-video="${media.id}"]`)) return;
      panel.prepend(buildStreamCard(displayName, media, "flip"));
    }

    function injectFlipCardSchedule() {
      if (media.target !== "schedule") return;
      const playerId = textOf(player.playerid || player.playerId || "");
      if (!playerId) return;
      const root = document.querySelector(`[data-player-card-id="${playerId}"]`);
      const panel = root?.querySelector(".fz-panel") as HTMLElement | null;
      const activeSchedule = root?.querySelector(".fz-tab-btn.fz-tab-active .ri-calendar-line");
      if (!panel || !activeSchedule) return;
      if (panel.querySelector(`[data-yat-team-video="${media.id}"]`)) return;
      panel.prepend(buildScheduleBanner(media));
    }

    function injectProfileNews() {
      if (media.target === "schedule") return;
      const panel = document.getElementById("ppTab-news") as HTMLElement | null;
      if (!panel) return;
      if (panel.querySelector(`[data-yat-team-video="${media.id}"]`)) return;
      panel.prepend(buildStreamCard(displayName, media, "profile"));
    }

    function inject() {
      if (cancelled) return;
      injectFlipCardNews();
      injectFlipCardSchedule();
      injectProfileNews();
    }

    const interval = window.setInterval(inject, 250);
    document.addEventListener("click", inject, true);
    inject();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("click", inject, true);
    };
  }, [player, hsid]);

  return null;
}
