"use client";

const ROW_HEIGHT = 100;
const ANCHOR_WIDTH = 178;
const PHOTO_WIDTH = 58;
const SEASON_WIDTH = 134;
const PROMPT_WIDTH = 118;
const OUTFIELD_YELLOW = "#ffd200";

export default function CareerTimelineCtaOverrides() {
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

      .zt-img-card :global(.zt-journey-wrap)::after,
      .zt-journey-wrap::after,
      .zt-img-card :global(.zt-journey-bg),
      .zt-img-card :global(.zt-journey-copy),
      .zt-img-card :global(.zt-journey-swoosh),
      .zt-img-card :global(.zt-journey-logo),
      .zt-img-card :global(.zt-journey-fallback),
      .zt-journey-bg,
      .zt-journey-copy,
      .zt-journey-swoosh,
      .zt-journey-logo,
      .zt-journey-fallback {
        display: none !important;
        content: none !important;
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
