"use client";

import { useEffect, useRef } from "react";

const LIVE_FEED = {
  title: "NAIA Opening Round Live Feed",
  subtitle: "Georgia Gwinnett vs Talladega",
  videoId: "YljqG6zA3-E",
  embedUrl: "https://www.youtube.com/embed/YljqG6zA3-E?autoplay=0&mute=0&playsinline=1&rel=0&controls=1&modestbranding=1",
  playUrl: "https://www.youtube.com/embed/YljqG6zA3-E?autoplay=1&mute=0&playsinline=1&rel=0&controls=1&modestbranding=1",
  watchUrl: "https://www.youtube.com/live/YljqG6zA3-E",
};

const FEATURED_PLAYER_NAMES = new Set(["shane anderson"]);

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
    .fz-root { position: relative; }
    .fz-live-video-host {
      position: absolute;
      z-index: 18;
      left: clamp(5px, 2.5cqi, 12px);
      right: clamp(5px, 2.5cqi, 12px);
      top: clamp(54px, 18cqi, 92px);
      bottom: clamp(35px, 12cqi, 58px);
      display: none;
      min-height: 0;
    }
    .fz-live-video-host.is-news-active,
    .fz-live-video-host.is-mini-player { display: block; }
    .fz-live-video-host.is-mini-player {
      left: auto;
      top: auto;
      right: clamp(8px, 3cqi, 14px);
      bottom: clamp(42px, 13cqi, 64px);
      width: min(54%, 230px);
      height: min(37%, 145px);
      box-shadow: 0 12px 30px rgba(0,0,0,.55), 0 0 0 1px rgba(245,200,90,.35);
    }
    .fz-live-video-card {
      width: 100%;
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: linear-gradient(135deg, rgba(18,18,18,.96), rgba(4,4,4,.98));
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
    .fz-live-video-host.is-mini-player .fz-live-video-title { display: none; }
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
    .fz-live-video-host.is-mini-player .fz-live-video-subtitle,
    .fz-live-video-host.is-mini-player .fz-live-video-actions { display: none; }
    .fz-live-video-frame {
      position: relative;
      flex: 1;
      min-height: 0;
      background: #050505;
      cursor: pointer;
    }
    .fz-live-video-frame iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      z-index: 1;
    }
    .fz-live-video-play-overlay {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: grid;
      place-items: center;
      background: linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.38));
      border: 0;
      padding: 0;
      pointer-events: auto;
      cursor: pointer;
    }
    .fz-live-video-play-button {
      width: clamp(44px, 18cqi, 76px);
      height: clamp(44px, 18cqi, 76px);
      display: grid;
      place-items: center;
      border: 2px solid rgba(245,200,90,.88);
      border-radius: 999px;
      background: rgba(0,0,0,.72);
      color: #f5c85a;
      box-shadow: 0 0 22px rgba(245,200,90,.24), 0 10px 30px rgba(0,0,0,.56);
    }
    .fz-live-video-play-button::before {
      content: "";
      width: 0;
      height: 0;
      margin-left: 4px;
      border-top: clamp(10px, 4cqi, 16px) solid transparent;
      border-bottom: clamp(10px, 4cqi, 16px) solid transparent;
      border-left: clamp(15px, 6cqi, 24px) solid currentColor;
    }
    .fz-live-video-frame.is-playing .fz-live-video-play-overlay { display: none; }
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
    const funZone = card?.querySelector(".fz-root") as HTMLElement | null;
    if (!card || !funZone) return;

    let host = funZone.querySelector(".fz-live-video-host") as HTMLElement | null;

    if (!host) {
      host = document.createElement("div");
      host.className = "fz-live-video-host";
      host.dataset.liveVideoOwner = normalize(displayName);
      host.innerHTML = `
        <div class="fz-live-video-card">
          <div class="fz-live-video-head">
            <span class="fz-live-video-badge">LIVE</span>
            <span class="fz-live-video-title">${LIVE_FEED.title}</span>
          </div>
          <div class="fz-live-video-subtitle">${LIVE_FEED.subtitle}</div>
          <div class="fz-live-video-frame" data-video-id="${LIVE_FEED.videoId}">
            <iframe
              src="${LIVE_FEED.embedUrl}"
              title="${LIVE_FEED.title}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
            <button class="fz-live-video-play-overlay" type="button" aria-label="Play live feed">
              <span class="fz-live-video-play-button"></span>
            </button>
          </div>
          <div class="fz-live-video-actions">
            <a href="${LIVE_FEED.watchUrl}" target="_blank" rel="noopener noreferrer">Open Live Feed</a>
          </div>
        </div>
      `;
      funZone.appendChild(host);

      const frame = host.querySelector(".fz-live-video-frame") as HTMLElement | null;
      const iframe = host.querySelector("iframe") as HTMLIFrameElement | null;
      const overlay = host.querySelector(".fz-live-video-play-overlay") as HTMLButtonElement | null;
      overlay?.addEventListener("click", () => {
        if (!frame || !iframe) return;
        document.querySelectorAll<HTMLIFrameElement>(".fz-live-video-frame.is-playing iframe").forEach((otherIframe) => {
          if (otherIframe !== iframe) otherIframe.src = LIVE_FEED.embedUrl;
        });
        document.querySelectorAll<HTMLElement>(".fz-live-video-frame.is-playing").forEach((otherFrame) => {
          if (otherFrame !== frame) otherFrame.classList.remove("is-playing");
        });
        iframe.src = LIVE_FEED.playUrl;
        frame.classList.add("is-playing");
        host?.classList.add("has-started");
      });
    }

    const syncVisibility = () => {
      const activeBtn = Array.from(card.querySelectorAll(".fz-tab-btn"))
        .find((btn) => btn.classList.contains("fz-tab-active"));
      const activeLabel = activeBtn?.textContent?.trim().toLowerCase() || "";
      const frame = host?.querySelector(".fz-live-video-frame") as HTMLElement | null;
      const isPlaying = Boolean(frame?.classList.contains("is-playing"));

      host?.classList.toggle("is-news-active", activeLabel === "news");
      host?.classList.toggle("is-mini-player", activeLabel !== "news" && isPlaying);
    };

    syncVisibility();
    const observer = new MutationObserver(syncVisibility);
    observer.observe(card, { subtree: true, attributes: true, childList: true });

    return () => observer.disconnect();
  }, [displayName, teamName]);

  return <span ref={rootRef} hidden />;
}
