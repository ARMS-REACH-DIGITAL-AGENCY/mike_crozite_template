"use client";

import { useEffect } from "react";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";
const ROW_HEIGHT = 100;
const ANCHOR_WIDTH = 178;
const PHOTO_WIDTH = 58;
const SEASON_WIDTH = 134;
const PROMPT_WIDTH = 118;
const GAP = 0;
const OUTFIELD_YELLOW = "#ffd200";

function getPlayerIdFromPath() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/\/player\/([^/]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function cardWidth(node: HTMLElement) {
  if (node.classList.contains("zt-journey-moment")) return ANCHOR_WIDTH;
  if (node.classList.contains("zt-season")) return SEASON_WIDTH;
  if (node.classList.contains("zt-prompt")) return PROMPT_WIDTH;
  return PHOTO_WIDTH;
}

export default function CareerTimelineCtaOverrides() {
  useEffect(() => {
    let frame = 0;

    function rewriteAnchor() {
      const playerId = getPlayerIdFromPath();
      const cutoutSrc = playerId ? `${S3_BASE}/players/cutouts/${encodeURIComponent(playerId)}.png` : "";
      const anchors = Array.from(document.querySelectorAll<HTMLElement>(".zt-journey-wrap"));

      anchors.forEach((anchor) => {
        if (anchor.dataset.yatStaticAnchor === "1") return;
        anchor.dataset.yatStaticAnchor = "1";
        anchor.innerHTML = "";

        const bg = document.createElement("img");
        bg.className = "zt-career-anchor-bg";
        bg.src = "/img/career-path-default.png";
        bg.alt = "";
        bg.setAttribute("aria-hidden", "true");
        anchor.appendChild(bg);

        if (cutoutSrc) {
          const cutout = document.createElement("img");
          cutout.className = "zt-career-anchor-cutout";
          cutout.src = cutoutSrc;
          cutout.alt = "";
          cutout.setAttribute("aria-hidden", "true");
          cutout.onerror = () => {
            cutout.style.display = "none";
          };
          anchor.appendChild(cutout);
        }
      });
    }

    function syncTimelineRow() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        rewriteAnchor();

        const shell = document.querySelector<HTMLElement>(".zt-shell-images");
        const canvas = document.querySelector<HTMLElement>(".zt-window-images .zt-canvas-images");
        if (!shell || !canvas) return;

        shell.style.height = `${ROW_HEIGHT}px`;
        shell.style.minHeight = `${ROW_HEIGHT}px`;
        shell.style.maxHeight = `${ROW_HEIGHT}px`;
        canvas.style.height = `${ROW_HEIGHT}px`;
        canvas.style.minHeight = `${ROW_HEIGHT}px`;
        canvas.style.maxHeight = `${ROW_HEIGHT}px`;
        canvas.style.left = "0px";
        canvas.style.marginLeft = "0px";
        canvas.style.paddingLeft = "0px";

        const moments = Array.from(canvas.querySelectorAll<HTMLElement>(".zt-img-moment"));
        let cursor = 0;

        moments.forEach((moment) => {
          const width = cardWidth(moment);
          const card = moment.querySelector<HTMLElement>(".zt-img-card");
          const wrap = moment.querySelector<HTMLElement>(".zt-image-wrap");

          moment.style.top = "0px";
          moment.style.height = `${ROW_HEIGHT}px`;
          moment.style.width = `${width}px`;
          moment.style.minWidth = `${width}px`;
          moment.style.left = `${cursor + width / 2}px`;

          if (card) {
            card.style.width = `${width}px`;
            card.style.minWidth = `${width}px`;
            card.style.height = `${ROW_HEIGHT}px`;
          }

          if (wrap) {
            wrap.style.width = `${width}px`;
            wrap.style.minWidth = `${width}px`;
            wrap.style.height = `${ROW_HEIGHT}px`;
          }

          cursor += width + GAP;
        });

        canvas.style.width = `${Math.max(cursor, window.innerWidth || 320)}px`;
      });
    }

    const observer = new MutationObserver(syncTimelineRow);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "src"],
    });

    window.addEventListener("resize", syncTimelineRow);
    document.addEventListener("load", syncTimelineRow, true);
    syncTimelineRow();
    window.setTimeout(syncTimelineRow, 250);
    window.setTimeout(syncTimelineRow, 900);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", syncTimelineRow);
      document.removeEventListener("load", syncTimelineRow, true);
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

      .zt-img-moment {
        top: 0 !important;
        height: ${ROW_HEIGHT}px !important;
      }

      .zt-img-card {
        height: ${ROW_HEIGHT}px !important;
        box-sizing: border-box !important;
      }

      .zt-journey-moment,
      .zt-journey-moment .zt-img-card {
        width: ${ANCHOR_WIDTH}px !important;
        min-width: ${ANCHOR_WIDTH}px !important;
      }

      .zt-journey-wrap,
      .zt-career-anchor-wrap {
        position: relative !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        isolation: isolate !important;
        background: #000 !important;
      }

      .zt-journey-wrap::after {
        display: none !important;
        content: none !important;
      }

      .zt-career-anchor-bg {
        position: absolute !important;
        inset: 0 !important;
        z-index: 1 !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: contain !important;
        object-position: left center !important;
        background: #000 !important;
      }

      .zt-career-anchor-cutout {
        position: absolute !important;
        left: 0 !important;
        bottom: 0 !important;
        z-index: 2 !important;
        display: block !important;
        width: auto !important;
        height: 100% !important;
        max-width: 48% !important;
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

      .zt-img-moment.zt-upload img,
      .zt-img-moment.zt-archive:not(.zt-journey-moment) img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        object-position: center center !important;
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
