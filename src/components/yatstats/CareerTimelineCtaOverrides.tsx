"use client";

import { useEffect } from "react";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";
const ROW_HEIGHT = 100;
const ANCHOR_WIDTH = 178;
const PHOTO_WIDTH = 58;
const SEASON_WIDTH = 134;
const PROMPT_WIDTH = 118;
const OUTFIELD_YELLOW = "#ffd200";

function playerIdFromPath() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/\/player\/([^/]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export default function CareerTimelineCtaOverrides() {
  useEffect(() => {
    let frame = 0;

    function syncAnchorSources() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const playerId = playerIdFromPath();
        const cutoutSrc = playerId ? `${S3_BASE}/players/cutouts/${encodeURIComponent(playerId)}.png` : "";

        document.querySelectorAll<HTMLElement>(".zt-journey-moment").forEach((card) => {
          const wrap = card.querySelector<HTMLElement>(".zt-journey-wrap");
          const bg = card.querySelector<HTMLImageElement>(".zt-journey-bg");
          const player = card.querySelector<HTMLImageElement>(".zt-journey-player");
          const copy = card.querySelector<HTMLElement>(".zt-journey-copy");

          card.style.width = `${ANCHOR_WIDTH}px`;
          card.style.minWidth = `${ANCHOR_WIDTH}px`;
          if (wrap) wrap.style.backgroundImage = "url('/img/career-path-default.png')";
          if (bg && bg.src !== `${window.location.origin}/img/career-path-default.png`) bg.src = "/img/career-path-default.png";
          if (player && cutoutSrc && player.src !== cutoutSrc) player.src = cutoutSrc;
          if (copy && copy.dataset.yatCopyProbe !== "1") {
            copy.dataset.yatCopyProbe = "1";
            copy.innerHTML = '<span class="zt-journey-quote"><span>Old McDonald</span><span>had a farm</span><span>eieiooh</span></span><span class="zt-journey-banner">COPY SOURCE PROBE</span>';
          }
        });
      });
    }

    const observer = new MutationObserver(syncAnchorSources);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "class", "style"] });
    window.addEventListener("resize", syncAnchorSources);
    document.addEventListener("load", syncAnchorSources, true);
    syncAnchorSources();
    window.setTimeout(syncAnchorSources, 250);
    window.setTimeout(syncAnchorSources, 1000);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", syncAnchorSources);
      document.removeEventListener("load", syncAnchorSources, true);
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

      .zt-img-card :global(.zt-journey-wrap),
      .zt-journey-wrap {
        position: relative !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        isolation: isolate !important;
        background-color: #000 !important;
        background-image: url('/img/career-path-default.png') !important;
        background-repeat: no-repeat !important;
        background-position: left center !important;
        background-size: 100% 100% !important;
      }

      .zt-img-card :global(.zt-journey-bg),
      .zt-journey-bg {
        position: absolute !important;
        inset: 0 !important;
        z-index: 1 !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: fill !important;
        object-position: left center !important;
        filter: none !important;
        transform: none !important;
      }

      .zt-img-card :global(.zt-journey-wrap)::after,
      .zt-journey-wrap::after,
      .zt-img-card :global(.zt-journey-swoosh),
      .zt-img-card :global(.zt-journey-logo),
      .zt-img-card :global(.zt-journey-fallback),
      .zt-journey-swoosh,
      .zt-journey-logo,
      .zt-journey-fallback {
        display: none !important;
        content: none !important;
      }

      .zt-img-card :global(.zt-journey-copy),
      .zt-journey-copy {
        position: absolute !important;
        z-index: 9 !important;
        right: 5px !important;
        top: 8px !important;
        width: 58% !important;
        display: block !important;
        color: #fff !important;
        text-align: center !important;
        text-shadow: 0 2px 5px rgba(0,0,0,.85) !important;
        pointer-events: none !important;
      }

      .zt-img-card :global(.zt-journey-quote),
      .zt-journey-quote {
        display: block !important;
        font-family: Georgia, 'Times New Roman', serif !important;
        font-weight: 900 !important;
        font-size: 17px !important;
        line-height: .92 !important;
      }

      .zt-img-card :global(.zt-journey-quote span),
      .zt-journey-quote span {
        display: block !important;
      }

      .zt-img-card :global(.zt-journey-banner),
      .zt-journey-banner {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin-top: 4px !important;
        padding: 3px 5px !important;
        color: #111 !important;
        background: #ffd200 !important;
        font: 900 7px/1 Georgia, 'Times New Roman', serif !important;
        white-space: nowrap !important;
      }

      .zt-img-card :global(.zt-journey-player),
      .zt-journey-player {
        position: absolute !important;
        left: 0 !important;
        bottom: 0 !important;
        z-index: 3 !important;
        display: block !important;
        width: auto !important;
        height: 100% !important;
        max-width: 52% !important;
        object-fit: contain !important;
        object-position: left bottom !important;
        filter: drop-shadow(0 5px 7px rgba(0,0,0,.75)) !important;
        pointer-events: none !important;
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
