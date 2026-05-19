"use client";

import { useEffect } from "react";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";
const ROW_HEIGHT = 100;
const ANCHOR_WIDTH = 232;
const PHOTO_WIDTH = 58;
const SEASON_WIDTH = 134;
const PROMPT_WIDTH = 118;
const OUTFIELD_YELLOW = "#ffd200";

function playerIdFromPath() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/\/player\/([^/]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function replaceJourneyCard() {
  const playerId = playerIdFromPath();
  const cutoutSrc = playerId ? `${S3_BASE}/players/cutouts/${encodeURIComponent(playerId)}.png` : "";

  document.querySelectorAll<HTMLElement>(".zt-journey-wrap").forEach((wrap) => {
    if (wrap.dataset.yatAnchorVersion === "static-v2") return;
    wrap.dataset.yatAnchorVersion = "static-v2";
    wrap.innerHTML = "";

    const bg = document.createElement("img");
    bg.className = "zt-career-anchor-bg";
    bg.src = "/img/career-path-default.png";
    bg.alt = "";
    bg.setAttribute("aria-hidden", "true");
    wrap.appendChild(bg);

    if (cutoutSrc) {
      const cutout = document.createElement("img");
      cutout.className = "zt-career-anchor-cutout";
      cutout.src = cutoutSrc;
      cutout.alt = "";
      cutout.setAttribute("aria-hidden", "true");
      cutout.onerror = () => { cutout.style.display = "none"; };
      wrap.appendChild(cutout);
    }
  });
}

export default function CareerTimelineCtaOverrides() {
  useEffect(() => {
    const timers = [0, 150, 400, 900, 1800].map((ms) => window.setTimeout(replaceJourneyCard, ms));
    window.addEventListener("resize", replaceJourneyCard);
    document.addEventListener("load", replaceJourneyCard, true);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", replaceJourneyCard);
      document.removeEventListener("load", replaceJourneyCard, true);
    };
  }, []);

  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .zt-shell-images,
      .zt-window-images,
      .zt-canvas-images {
        height: ${ROW_HEIGHT}px !important;
        min-height: ${ROW_HEIGHT}px !important;
        max-height: ${ROW_HEIGHT}px !important;
      }

      .zt-window-images,
      .zt-canvas-images {
        margin-left: 0 !important;
        padding-left: 0 !important;
      }

      .zt-img-moment,
      .zt-img-card {
        height: ${ROW_HEIGHT}px !important;
        box-sizing: border-box !important;
      }

      .zt-journey-moment,
      .zt-journey-moment .zt-img-card {
        width: ${ANCHOR_WIDTH}px !important;
        min-width: ${ANCHOR_WIDTH}px !important;
      }

      .zt-journey-wrap {
        position: relative !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        isolation: isolate !important;
        background: #000 !important;
      }

      .zt-career-anchor-bg {
        position: absolute !important;
        inset: 0 !important;
        z-index: 1 !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: fill !important;
        object-position: left center !important;
      }

      .zt-career-anchor-cutout {
        position: absolute !important;
        left: 0 !important;
        bottom: 0 !important;
        z-index: 2 !important;
        display: block !important;
        width: auto !important;
        height: 100% !important;
        max-width: 52% !important;
        object-fit: contain !important;
        object-position: left bottom !important;
        filter: drop-shadow(0 5px 7px rgba(0,0,0,.75)) !important;
        pointer-events: none !important;
      }

      .zt-journey-bg,
      .zt-journey-player,
      .zt-journey-copy,
      .zt-journey-swoosh,
      .zt-journey-logo,
      .zt-journey-fallback {
        display: none !important;
      }

      .zt-img-moment.zt-upload,
      .zt-img-moment.zt-archive:not(.zt-journey-moment) {
        width: ${PHOTO_WIDTH}px !important;
        min-width: ${PHOTO_WIDTH}px !important;
        overflow: hidden !important;
      }

      .zt-img-moment.zt-upload .zt-img-card,
      .zt-img-moment.zt-archive:not(.zt-journey-moment) .zt-img-card,
      .zt-img-moment.zt-upload .zt-image-wrap,
      .zt-img-moment.zt-archive:not(.zt-journey-moment) .zt-image-wrap {
        width: ${PHOTO_WIDTH}px !important;
        min-width: ${PHOTO_WIDTH}px !important;
        height: ${ROW_HEIGHT}px !important;
        overflow: hidden !important;
        background: #090909 !important;
      }

      .zt-img-moment.zt-upload img,
      .zt-img-moment.zt-archive:not(.zt-journey-moment) img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        object-position: center center !important;
      }

      .zt-img-moment.zt-season,
      .zt-img-moment.zt-season .zt-img-card {
        width: ${SEASON_WIDTH}px !important;
        min-width: ${SEASON_WIDTH}px !important;
      }

      .zt-img-moment.zt-prompt,
      .zt-img-moment.zt-prompt .zt-img-card {
        width: ${PROMPT_WIDTH}px !important;
        min-width: ${PROMPT_WIDTH}px !important;
      }

      .zt-img-card {
        border-bottom: 4px solid ${OUTFIELD_YELLOW} !important;
      }

      .zt-journey-moment .zt-img-card,
      .zt-prompt .zt-img-card {
        border-bottom: 0 !important;
      }

      .zt-shell-line .zt-line,
      .zt-shell-line .zt-line-pin:not(.zt-line-prompt) {
        display: none !important;
      }
    ` }} />
  );
}
