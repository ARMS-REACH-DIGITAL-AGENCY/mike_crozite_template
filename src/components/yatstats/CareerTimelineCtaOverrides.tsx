"use client";

import { useEffect } from "react";

const CLOSED_ZOOM = 1;
const FULL_ZOOM = 3.2;
const EXPANDED_CLASS = "zt-expanded";
const ZOOM_EVENT = "yat:career-timeline-zoom";
const STRIP_HEIGHT = 84;
const PROMPT_WIDTH = 118;
const PHOTO_WIDTH = 58;
const OUTFIELD_YELLOW = "#ffd200";

export default function CareerTimelineCtaOverrides() {
  useEffect(() => {
    let frame = 0;

    function setTimelineZoom(zoom: number) {
      try {
        sessionStorage.setItem("yat:careerTimelineZoom", String(zoom));
      } catch {}
      window.dispatchEvent(new CustomEvent(ZOOM_EVENT, { detail: { zoom, source: "career-cta-override" } }));
    }

    function syncClosedMontage() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const shell = document.querySelector(".zt-shell-images") as HTMLElement | null;
        const canvas = document.querySelector(".zt-window-images .zt-canvas-images") as HTMLElement | null;
        if (!shell || !canvas || shell.classList.contains(EXPANDED_CLASS)) return;

        const moments = Array.from(canvas.querySelectorAll(".zt-img-moment")) as HTMLElement[];
        let cursor = 0;

        moments.forEach((moment) => {
          const isPrompt = moment.classList.contains("zt-prompt");
          const isPhoto = moment.classList.contains("zt-upload") || moment.classList.contains("zt-archive");
          const card = moment.querySelector(".zt-img-card") as HTMLElement | null;
          const wrap = moment.querySelector(".zt-image-wrap") as HTMLElement | null;
          const img = moment.querySelector("img") as HTMLImageElement | null;

          const width = isPrompt ? PROMPT_WIDTH : isPhoto ? PHOTO_WIDTH : PHOTO_WIDTH;
          const center = cursor + width / 2;

          moment.style.left = `${center}px`;
          moment.style.width = `${width}px`;
          moment.style.minWidth = `${width}px`;
          moment.style.height = `${STRIP_HEIGHT}px`;

          if (card) {
            card.style.width = `${width}px`;
            card.style.minWidth = `${width}px`;
            card.style.height = `${STRIP_HEIGHT}px`;
          }

          if (wrap) {
            wrap.style.width = `${width}px`;
            wrap.style.minWidth = `${width}px`;
            wrap.style.height = `${STRIP_HEIGHT}px`;
          }

          if (img && isPhoto) {
            img.style.width = "100%";
            img.style.height = "100%";
          }

          cursor += width;
        });

        canvas.style.width = `${Math.max(cursor, window.innerWidth || 320)}px`;
        canvas.style.height = `${STRIP_HEIGHT}px`;
      });
    }

    function onDocumentClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const prompt = target?.closest(".zt-img-moment.zt-prompt") as HTMLElement | null;
      if (!prompt) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

      const shell = prompt.closest(".zt-shell-images") as HTMLElement | null;
      const shouldClose = Boolean(shell?.classList.contains(EXPANDED_CLASS));
      setTimelineZoom(shouldClose ? CLOSED_ZOOM : FULL_ZOOM);
      window.setTimeout(syncClosedMontage, 80);
    }

    const observer = new MutationObserver(syncClosedMontage);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "src"] });

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("resize", syncClosedMontage);
    window.addEventListener(ZOOM_EVENT, syncClosedMontage as EventListener);
    document.addEventListener("load", syncClosedMontage, true);
    syncClosedMontage();
    window.setTimeout(syncClosedMontage, 250);
    window.setTimeout(syncClosedMontage, 1000);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("resize", syncClosedMontage);
      window.removeEventListener(ZOOM_EVENT, syncClosedMontage as EventListener);
      document.removeEventListener("load", syncClosedMontage, true);
      document.querySelectorAll(".zt-pre-first-upload-slot").forEach((node) => node.remove());
    };
  }, []);

  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .zt-shell-images,
      .zt-window-images,
      .zt-canvas-images {
        height: ${STRIP_HEIGHT}px !important;
        min-height: ${STRIP_HEIGHT}px !important;
        max-height: ${STRIP_HEIGHT}px !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment {
        top: 0 !important;
        height: ${STRIP_HEIGHT}px !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt {
        width: ${PROMPT_WIDTH}px !important;
        min-width: ${PROMPT_WIDTH}px !important;
        transform: translateX(-50%) !important;
        overflow: hidden !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-card {
        height: ${STRIP_HEIGHT}px !important;
        border: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-img-card {
        border-bottom: 4px solid ${OUTFIELD_YELLOW} !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt .zt-prompt-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-season .zt-img-card {
        border-bottom: 0 !important;
      }

      .zt-img-card:has(.zt-prompt-card),
      .zt-img-moment.zt-prompt .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt .zt-img-card {
        width: ${PROMPT_WIDTH}px !important;
        min-width: ${PROMPT_WIDTH}px !important;
        padding: 0 !important;
        margin: 0 !important;
        background: transparent !important;
        overflow: hidden !important;
      }

      .zt-img-moment.zt-prompt .zt-img-card::before,
      .zt-img-moment.zt-prompt .zt-img-card::after {
        display: none !important;
        content: none !important;
      }

      .zt-img-card .zt-prompt-card,
      .zt-prompt-card {
        position: relative !important;
        isolation: isolate !important;
        overflow: hidden !important;
        display: block !important;
        width: 100% !important;
        height: ${STRIP_HEIGHT}px !important;
        min-width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
        transform: none !important;
        background-color: transparent !important;
        background-image: url('/img/career-path-default.jpg') !important;
        background-size: 100% 100% !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
      }

      .zt-img-card .zt-prompt-card b,
      .zt-img-card .zt-prompt-card strong,
      .zt-img-card .zt-prompt-card i,
      .zt-prompt-card b,
      .zt-prompt-card strong,
      .zt-prompt-card i,
      .zt-img-card .zt-prompt-card::before,
      .zt-prompt-card::before,
      .zt-img-card .zt-prompt-card::after,
      .zt-prompt-card::after {
        display: none !important;
        content: none !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive {
        width: ${PHOTO_WIDTH}px !important;
        min-width: ${PHOTO_WIDTH}px !important;
        overflow: hidden !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-image-wrap,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-image-wrap {
        position: relative !important;
        display: block !important;
        width: ${PHOTO_WIDTH}px !important;
        min-width: ${PHOTO_WIDTH}px !important;
        height: ${STRIP_HEIGHT}px !important;
        background: #090909 !important;
        background-image: none !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-image-wrap::before,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-image-wrap::after,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-image-wrap::before,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-image-wrap::after {
        display: none !important;
        content: none !important;
        background: none !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload img,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive img {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        min-width: 100% !important;
        max-width: none !important;
        height: 100% !important;
        min-height: 100% !important;
        object-fit: cover !important;
        object-position: center center !important;
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
        background: transparent !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-card-overlay,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-card-overlay {
        display: none !important;
      }

      .zt-shell-line .zt-line {
        display: none !important;
      }

      .zt-shell-line .zt-line-pin:not(.zt-line-prompt) {
        display: none !important;
      }

      .zt-shell-line .zt-line-prompt {
        top: 44% !important;
        width: 10px !important;
        height: 18px !important;
      }

      .zt-shell-line .zt-line-prompt span {
        display: block !important;
        width: 2px !important;
        height: 18px !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: ${OUTFIELD_YELLOW} !important;
        box-shadow: none !important;
      }
    ` }} />
  );
}
