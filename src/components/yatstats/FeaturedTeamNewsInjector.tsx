"use client";

import { useEffect } from "react";

const MW_VIDEO_URL = "https://themw.com/news/2026/03/23/grand-canyon-at-nevada-7/";

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

function firstNameOf(displayName: string) {
  return String(displayName || "this player").trim().split(/\s+/)[0] || "this player";
}

function buildStreamCard(displayName: string, variant: "flip" | "profile") {
  const firstName = firstNameOf(displayName);
  const wrapper = document.createElement("div");
  wrapper.className = `fz-featured-stream-card fz-featured-stream-${variant}`;
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
          src="${MW_VIDEO_URL}"
          title="Grand Canyon at Nevada video stream"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
        ></iframe>
        <a class="fz-stream-open-overlay" href="${MW_VIDEO_URL}" target="_blank" rel="noopener noreferrer">
          <span>Open Stream</span>
        </a>
      </div>
      <div class="fz-stream-footer">
        <span>Mountain West stream featuring ${firstName}'s current-team matchup.</span>
        <a href="${MW_VIDEO_URL}" target="_blank" rel="noopener noreferrer">Open Video</a>
      </div>
    </div>
  `;
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
    .fz-stream-badge{display:inline-flex;align-items:center;justify-content:center;min-height:clamp(18px,5.8cqi,28px);padding:0 clamp(7px,2.3cqi,13px);background:#df1e24;color:white;font:900 clamp(7px,2.2cqi,11px)/1 Oswald,sans-serif;letter-spacing:.14em;text-transform:uppercase;}
    .fz-stream-topline strong{font:900 clamp(13px,4.7cqi,23px)/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#f1cf62;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .fz-stream-subtitle{border-bottom:1px solid rgba(255,255,255,.12);padding:clamp(5px,1.6cqi,8px) 0;color:rgba(255,255,255,.82);font:900 clamp(8px,2.8cqi,13px)/1 Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;}
    .fz-stream-window{position:relative;aspect-ratio:16/9;margin-top:clamp(7px,2.4cqi,12px);background:radial-gradient(circle at 50% 35%,rgba(210,180,92,.16),transparent 32%),#050505;overflow:hidden;border:1px solid rgba(255,255,255,.09);}
    .fz-stream-window iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#050505;}
    .fz-stream-open-overlay{position:absolute;right:clamp(6px,2cqi,10px);bottom:clamp(6px,2cqi,10px);display:inline-flex;align-items:center;justify-content:center;min-height:clamp(24px,6cqi,34px);padding:0 clamp(10px,3cqi,16px);border:1px solid rgba(207,176,86,.72);background:rgba(8,6,4,.72);color:#f1cf62;text-decoration:none;font:900 clamp(8px,2.4cqi,12px)/1 Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;}
    .fz-stream-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:clamp(6px,1.8cqi,10px);color:rgba(255,255,255,.72);font:700 clamp(7px,2.1cqi,10px)/1.25 Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase;}
    .fz-stream-footer span{min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .fz-stream-footer a{flex:0 0 auto;color:#f1cf62;text-decoration:none;border:1px solid rgba(207,176,86,.54);padding:clamp(4px,1.3cqi,7px) clamp(7px,2cqi,11px);}
    .fz-featured-stream-profile{max-width:820px;margin:0 auto 18px;}
    .fz-featured-stream-profile .fz-stream-frame-card{padding:14px;}
    .fz-featured-stream-profile .fz-stream-topline strong{font-size:clamp(24px,5vw,44px);}
    .fz-featured-stream-profile .fz-stream-subtitle{font-size:clamp(13px,2.4vw,18px);}
    .fz-featured-stream-profile .fz-stream-footer{font-size:clamp(11px,1.8vw,14px);}
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
      panel.prepend(buildStreamCard(displayName, "flip"));
    }

    function injectProfileNews() {
      const panel = document.getElementById("ppTab-news") as HTMLElement | null;
      if (!panel) return;
      if (panel.querySelector('[data-yat-team-video="mw-grand-canyon-nevada"]')) return;
      panel.prepend(buildStreamCard(displayName, "profile"));
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
