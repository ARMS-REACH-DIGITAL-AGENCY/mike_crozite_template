"use client";

import { useEffect } from "react";

const MW_PAGE_URL = "https://themw.com/news/2026/03/23/grand-canyon-at-nevada-7/";

// Use a true video-player/embed URL here if Mountain West exposes one.
// The news page URL is not a player URL, so iframeing it shows the whole site.
const MW_EMBED_URL = "";

function norm(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesNevadaOrGcu(player: Record<string, unknown>) {
  const haystack = norm([
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

function firstNameOf(displayName: string) {
  return String(displayName || "this player").trim().split(/\s+/)[0] || "this player";
}

function buildBannerCard(displayName: string, variant: "flip" | "profile") {
  const firstName = firstNameOf(displayName);
  const wrapper = document.createElement("div");
  wrapper.className = `fz-team-video-card fz-team-video-${variant}`;
  wrapper.setAttribute("data-yat-team-video", "mw-grand-canyon-nevada");
  wrapper.innerHTML = `
    <a class="fz-team-video-link" href="${MW_PAGE_URL}" target="_blank" rel="noopener noreferrer">
      <div class="fz-team-video-thumb">
        <span class="fz-team-video-play">▶</span>
      </div>
      <div class="fz-team-video-copy">
        <div class="fz-team-video-label">VIDEO STREAM</div>
        <div class="fz-team-video-title">Grand Canyon at Nevada</div>
        <div class="fz-team-video-body">Watch the Mountain West stream featuring ${firstName}'s current-team matchup.</div>
      </div>
    </a>
  `;
  return wrapper;
}

function buildEmbedCard(displayName: string) {
  const firstName = firstNameOf(displayName);
  const wrapper = document.createElement("div");
  wrapper.className = "fz-featured-stream-card fz-featured-stream-flip";
  wrapper.setAttribute("data-yat-team-video", "mw-grand-canyon-nevada");
  wrapper.innerHTML = `
    <div class="fz-stream-frame-card">
      <div class="fz-stream-topline">
        <span class="fz-stream-badge">VIDEO STREAM</span>
        <strong>Grand Canyon at Nevada</strong>
      </div>
      <div class="fz-stream-subtitle">Featured FunZone News Video</div>
      <div class="fz-stream-window">
        <iframe
          src="${MW_EMBED_URL}"
          title="Grand Canyon at Nevada video stream"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
      <div class="fz-stream-footer">
        <span>Mountain West stream featuring ${firstName}'s current-team matchup.</span>
        <a href="${MW_PAGE_URL}" target="_blank" rel="noopener noreferrer">Open Video</a>
      </div>
    </div>
  `;
  return wrapper;
}

function buildFlipCard(displayName: string) {
  return MW_EMBED_URL ? buildEmbedCard(displayName) : buildBannerCard(displayName, "flip");
}

function ensureStyles() {
  if (document.getElementById("yat-team-video-news-style")) return;
  const style = document.createElement("style");
  style.id = "yat-team-video-news-style";
  style.textContent = `
    .fz-team-video-card{margin-bottom:clamp(5px,1.8cqi,10px);}
    .fz-team-video-link{display:flex;gap:clamp(6px,2cqi,11px);align-items:stretch;text-decoration:none;color:inherit;padding:clamp(6px,2cqi,11px);border:1px solid rgba(30,22,14,.18);border-radius:clamp(6px,1.8cqi,10px);background:rgba(255,255,255,.34);box-shadow:inset 0 1px 0 rgba(255,255,255,.42),0 1px 2px rgba(30,22,14,.10);}
    .fz-team-video-thumb{position:relative;flex:0 0 clamp(54px,19cqi,88px);min-height:clamp(52px,18cqi,84px);border-radius:clamp(4px,1.2cqi,7px);overflow:hidden;background:linear-gradient(135deg,#17120c,#2b2117 52%,#d5b45d);box-shadow:0 1px 4px rgba(0,0,0,.22);}
    .fz-team-video-thumb::before{content:'MW';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:900 clamp(15px,5.5cqi,26px)/1 Oswald,sans-serif;letter-spacing:.08em;color:rgba(255,255,255,.92);}
    .fz-team-video-play{position:absolute;right:5px;bottom:4px;width:clamp(15px,4.8cqi,24px);height:clamp(15px,4.8cqi,24px);display:flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(0,0,0,.72);color:#f4d06b;font:900 clamp(7px,2.4cqi,11px)/1 system-ui,sans-serif;}
    .fz-team-video-copy{min-width:0;display:flex;flex-direction:column;gap:clamp(2px,.8cqi,4px);justify-content:center;}
    .fz-team-video-label{font:800 clamp(6px,1.9cqi,9px)/1 Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:rgba(30,22,14,.58);}
    .fz-team-video-title{font:900 clamp(11px,3.8cqi,17px)/1.08 "Bebas Neue",Oswald,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:rgba(20,14,9,.94);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .fz-team-video-body{font:600 clamp(7px,2.1cqi,10px)/1.25 Oswald,sans-serif;letter-spacing:.03em;text-transform:uppercase;color:rgba(30,22,14,.68);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .fz-team-video-profile{max-width:820px;margin:0 auto 18px;}
    .fz-team-video-profile .fz-team-video-link{padding:14px;border-color:rgba(207,176,86,.42);background:rgba(255,255,255,.055);}
    .fz-team-video-profile .fz-team-video-thumb{flex-basis:110px;min-height:90px;}
    .fz-team-video-profile .fz-team-video-title{font-size:clamp(20px,4vw,36px);color:#f1cf62;}
    .fz-team-video-profile .fz-team-video-body{font-size:clamp(11px,2vw,15px);color:rgba(255,255,255,.72);}
    .fz-featured-stream-card{width:100%;margin:0 0 clamp(7px,2.2cqi,13px);}
    .fz-stream-frame-card{border:1px solid rgba(207,176,86,.46);background:linear-gradient(180deg,#1b160f 0%,#090806 100%);box-shadow:0 5px 16px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.08);color:#f8f2df;padding:clamp(6px,2.2cqi,12px);}
    .fz-stream-topline{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:clamp(7px,2.2cqi,12px);border-bottom:1px solid rgba(207,176,86,.42);padding-bottom:clamp(5px,1.6cqi,9px);}
    .fz-stream-badge{display:inline-flex;align-items:center;justify-content:center;min-height:clamp(18px,5.8cqi,28px);padding:0 clamp(7px,2.3cqi,13px);background:#df1e24;color:white;font:900 clamp(7px,2.2cqi,11px)/1 Oswald,sans-serif;letter-spacing:.14em;text-transform:uppercase;}
    .fz-stream-topline strong{font:900 clamp(13px,4.7cqi,23px)/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#f1cf62;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .fz-stream-subtitle{border-bottom:1px solid rgba(255,255,255,.12);padding:clamp(5px,1.6cqi,8px) 0;color:rgba(255,255,255,.82);font:900 clamp(8px,2.8cqi,13px)/1 Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;}
    .fz-stream-window{position:relative;aspect-ratio:16/9;margin-top:clamp(7px,2.4cqi,12px);background:#050505;overflow:hidden;border:1px solid rgba(255,255,255,.09);}
    .fz-stream-window iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#050505;}
    .fz-stream-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:clamp(6px,1.8cqi,10px);color:rgba(255,255,255,.72);font:700 clamp(7px,2.1cqi,10px)/1.25 Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase;}
    .fz-stream-footer span{min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .fz-stream-footer a{flex:0 0 auto;color:#f1cf62;text-decoration:none;border:1px solid rgba(207,176,86,.54);padding:clamp(4px,1.3cqi,7px) clamp(7px,2cqi,11px);}
  `;
  document.head.appendChild(style);
}

export default function FeaturedTeamNewsInjector({ player }: { player: Record<string, unknown> }) {
  useEffect(() => {
    if (!matchesNevadaOrGcu(player)) return;

    const displayName = String(player.display_name || player.displayName || `${player.firstname || ""} ${player.lastname || ""}`.trim() || "this player");
    ensureStyles();

    let cancelled = false;

    function injectFlipCardNews() {
      const playerId = String(player.playerid || player.playerId || "");
      if (!playerId) return;
      const root = document.querySelector(`[data-player-card-id="${playerId}"]`);
      const panel = root?.querySelector(".fz-panel") as HTMLElement | null;
      const activeNews = root?.querySelector(".fz-tab-btn.fz-tab-active .ri-newspaper-line");
      if (!panel || !activeNews) return;
      if (panel.querySelector('[data-yat-team-video="mw-grand-canyon-nevada"]')) return;
      panel.prepend(buildFlipCard(displayName));
    }

    function injectProfileNews() {
      const panel = document.getElementById("ppTab-news") as HTMLElement | null;
      if (!panel) return;
      if (panel.querySelector('[data-yat-team-video="mw-grand-canyon-nevada"]')) return;
      panel.prepend(buildBannerCard(displayName, "profile"));
    }

    function inject() {
      if (cancelled) return;
      injectFlipCardNews();
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
  }, [player]);

  return null;
}
