"use client";

import { useEffect } from "react";

const CLOSED_ZOOM = 1;
const FULL_ZOOM = 3.2;
const EXPANDED_CLASS = "zt-expanded";
const ZOOM_EVENT = "yat:career-timeline-zoom";

export default function CareerTimelineCtaOverrides() {
  useEffect(() => {
    function setTimelineZoom(zoom: number) {
      try {
        sessionStorage.setItem("yat:careerTimelineZoom", String(zoom));
      } catch {}
      window.dispatchEvent(new CustomEvent(ZOOM_EVENT, { detail: { zoom, source: "career-cta-override" } }));
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
    }

    document.addEventListener("click", onDocumentClick, true);

    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      document.querySelectorAll(".zt-pre-first-upload-slot").forEach((node) => node.remove());
    };
  }, []);

  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt {
        transform: translateX(-50%) !important;
        overflow: visible !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
      }

      .zt-img-card:has(.zt-prompt-card),
      .zt-img-moment.zt-prompt .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt .zt-img-card {
        border: 0 !important;
        border-color: transparent !important;
        box-shadow: none !important;
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
        height: 100% !important;
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

      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload,
      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive {
        width: 58px !important;
        min-width: 58px !important;
        overflow: hidden !important;
      }

      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-img-card,
      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-img-card,
      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-image-wrap,
      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-image-wrap {
        width: 58px !important;
        min-width: 58px !important;
        height: 100% !important;
        background: #090909 !important;
        border: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }

      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload img,
      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive img {
        width: 100% !important;
        max-width: none !important;
        height: 100% !important;
        object-fit: cover !important;
        object-position: center center !important;
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      .zt-expanded .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-img-card,
      .zt-expanded .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-img-card,
      .zt-expanded .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-image-wrap,
      .zt-expanded .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-image-wrap {
        height: 100% !important;
        background: #090909 !important;
        border: 2px solid rgba(255,255,255,.72) !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }

      .zt-expanded .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload img,
      .zt-expanded .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive img {
        width: 100% !important;
        max-width: none !important;
        height: 100% !important;
        object-fit: cover !important;
        object-position: center center !important;
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-card-overlay,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-card-overlay {
        display: none !important;
      }
    ` }} />
  );
}
