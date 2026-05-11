"use client";

import { useEffect, useRef } from "react";

const LIVE_FEED = {
  title: "NAIA Opening Round Live Feed",
  subtitle: "Georgia Gwinnett vs Talladega",
  embedUrl: "https://www.youtube.com/embed/live_stream?channel=UC_adDX1a74YUXjJ5JIQVjGQ&autoplay=1&mute=1&playsinline=1&rel=0",
  watchUrl: "https://www.youtube.com/@GGC_Athletics/live",
};

const FEATURED_PLAYER_NAMES = new Set([
  "shane anderson",
]);

function normalize(value: string) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function shouldShowLiveVideo(displayName: string, teamName: string) {
  const name = normalize(displayName);
  const team = normalize(teamName);

  if (FEATURED_PLAYER_NAMES.has(name)) return true;
  if (team.includes("georgia gwinnett")) return true;
  if (team.includes("ggc")) return true;
  if (team.includes("gwinnett")) return true;
  if (team.includes("grizzlies") && team.includes("gwinnett")) return true;

  return false;
}

function ensureStyles() {
  if (document.getElementById("yat-flip-live-video-css")) return;

  const style = document.createElement("style");
  style.id = "yat-flip-live-video-css";
  style.textContent = `
    .fz-live-video-card {
      width: 100%;
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: linear-gradient(135deg, rgba(18,18,18,.94), rgba(4,4,4,.96));
      border: 1px solid rgba(30,22,14,.38);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
    }
    .fz-live-video-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: clamp(4px,1.5cqi,8px) clamp(5px,2cqi,10px);
      border-bottom: 1px solid rgba(245,200,90,.35);
      background: linear-gradient(90deg, rgba(245,200,90,.18), rgba(245,200,90,.04));
      flex-shrink: 0;
    }
    .fz-live-video-badge {
      color: #fff;
      background: #d71920;
      padding: 3px 6px;
      font: 900 clamp(5px,1.8cqi,8px)/1 Oswald, sans-serif;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    .fz-live-video-title {
      color: #f5c85a;
      font: 900 clamp(8px,2.8cqi,12px)/1 Oswald, sans-serif;
      letter-spacing: .08em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .fz-live-video-subtitle {
      color: rgba(255,255,255,.78);
      font: 700 clamp(6px,2.1cqi,9px)/1 Oswald, sans-serif;
      letter-spacing: .08em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 4px 7px;
      border-bottom: 1px solid rgba(245,200,90,.18);
      background: rgba(0,0,0,.22);
    }
    .fz-live-video-frame {
      position: relative;
      flex: 1;
      min-height: 0;
      background: #050505;
    }
    .fz-live-video-frame iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
    .fz-live-video-actions {
      display: flex;
      justify-content: flex-end;
      padding: clamp(4px,1.2cqi,7px) clamp(5px,1.8cqi,9px);
      border-top: 1px solid rgba(245,200,90,.22);
      flex-shrink: 0;
    }
    .fz-live-video-actions a {
      color: #f5c85a;
      text-decoration: none;
      border: 1px solid rgba(245,200,90,.42);
      padding: 4px 7px;
      font: 900 clamp(5px,1.8cqi,8px)/1 Oswald, sans-serif;
      letter-spacing: .1em;
      text-transform: uppercase;
      background: rgba(245,200,90,.08);
    }
  `;
  document.head.appendChild(style);
}

export default function FlipCardLiveVideoInjector({
  displayName,
  teamName,
}: {
  displayName: string;
  teamName: string;
}) {
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!shouldShowLiveVideo(displayName, teamName)) return;

    ensureStyles();

    const root = rootRef.current;
    const card = root?.closest(".yat-back-cq");
    if (!card) return;

    const apply = () => {
      const activeBtn = Array.from(card.querySelectorAll(".fz-tab-btn"))
        .find((btn) => btn.classList.contains("fz-tab-active"));
      const activeLabel = activeBtn?.textContent?.trim().toLowerCase() || "";
      if (activeLabel !== "news") return;

      const panel = card.querySelector(".fz-panel") as HTMLElement | null;
      if (!panel || panel.dataset.liveVideoApplied === normalize(displayName)) return;

      panel.dataset.liveVideoApplied = normalize(displayName);
      panel.innerHTML = `
        <div class="fz-live-video-card">
          <div class="fz-live-video-head">
            <span class="fz-live-video-badge">LIVE</span>
            <span class="fz-live-video-title">${LIVE_FEED.title}</span>
          </div>
          <div class="fz-live-video-subtitle">${LIVE_FEED.subtitle}</div>
          <div class="fz-live-video-frame">
            <iframe
              src="${LIVE_FEED.embedUrl}"
              title="${LIVE_FEED.title}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
          </div>
          <div class="fz-live-video-actions">
            <a href="${LIVE_FEED.watchUrl}" target="_blank" rel="noopener noreferrer">Open Live Feed</a>
          </div>
        </div>
      `;
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(card, { subtree: true, attributes: true, childList: true });

    return () => observer.disconnect();
  }, [displayName, teamName]);

  return <span ref={rootRef} hidden />;
}
