"use client";

import { useEffect } from "react";

const MW_VIDEO_URL = "https://themw.com/news/2026/03/23/grand-canyon-at-nevada-7/";

function norm(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchesNevadaOrGcu(player: Record<string, unknown>) {
  const haystack = norm([
    player.current_team_name,
    player.currentTeamName,
    player.team_name,
    player.current_org_or_conference_name,
    player.currentOrgOrConferenceName,
    player.level_label,
    player.display_name,
  ].filter(Boolean).join(" "));

  const isNevada =
    haystack.includes("university of nevada") ||
    haystack.includes("nevada reno") ||
    haystack.includes("reno wolf pack") ||
    haystack.includes("nevada wolf pack");

  const isGcu =
    haystack.includes("grand canyon") ||
    haystack.includes("gcu antelopes") ||
    haystack.includes("grand canyon university");

  return isNevada || isGcu;
}

function buildCard(displayName: string) {
  const firstName = String(displayName || "this player").trim().split(/\s+/)[0] || "this player";
  const wrapper = document.createElement("div");
  wrapper.className = "fz-team-video-card";
  wrapper.setAttribute("data-yat-team-video", "mw-grand-canyon-nevada");
  wrapper.innerHTML = `
    <a class="fz-team-video-link" href="${MW_VIDEO_URL}" target="_blank" rel="noopener noreferrer">
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
  `;
  document.head.appendChild(style);
}

export default function FeaturedTeamNewsInjector({ player }: { player: Record<string, unknown> }) {
  useEffect(() => {
    if (!matchesNevadaOrGcu(player)) return;

    const displayName = String(player.display_name || `${player.firstname || ""} ${player.lastname || ""}`.trim() || "this player");
    ensureStyles();

    let cancelled = false;

    function injectIfNewsActive() {
      if (cancelled) return;
      const root = document.querySelector(`[data-player-card-id="${String(player.playerid || "")}"]`) || document;
      const panel = root.querySelector(".fz-panel") as HTMLElement | null;
      const activeNews = root.querySelector(".fz-tab-btn.fz-tab-active .ri-newspaper-line");
      if (!panel || !activeNews) return;
      if (panel.querySelector('[data-yat-team-video="mw-grand-canyon-nevada"]')) return;
      panel.prepend(buildCard(displayName));
    }

    const interval = window.setInterval(injectIfNewsActive, 250);
    document.addEventListener("click", injectIfNewsActive, true);
    injectIfNewsActive();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("click", injectIfNewsActive, true);
    };
  }, [player]);

  return null;
}
