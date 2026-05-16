"use client";

import { useEffect } from "react";

const CLOSED_ZOOM = 1;
const FULL_ZOOM = 3.2;
const EXPANDED_CLASS = "zt-expanded";
const ZOOM_EVENT = "yat:career-timeline-zoom";

function clampWidth(width: number) {
  if (!Number.isFinite(width) || width <= 0) return 58;
  return Math.max(34, Math.min(220, Math.round(width)));
}

function getNaturalMontageWidth(moment: HTMLElement) {
  const img = moment.querySelector("img") as HTMLImageElement | null;
  const card = moment.querySelector(".zt-img-card") as HTMLElement | null;
  const height = Math.max(1, card?.clientHeight || moment.clientHeight || 84);

  if (!img || !img.naturalWidth || !img.naturalHeight) return 58;
  return clampWidth(height * (img.naturalWidth / img.naturalHeight));
}

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
          const isPhoto = moment.classList.contains("zt-upload") || moment.classList.contains("zt-archive");
          const isPrompt = moment.classList.contains("zt-prompt");
          const card = moment.querySelector(".zt-img-card") as HTMLElement | null;
          const wrap = moment.querySelector(".zt-image-wrap") as HTMLElement | null;

          const baseWidth = isPrompt ? 118 : isPhoto ? getNaturalMontageWidth(moment) : (moment.offsetWidth || 58);
          const width = clampWidth(baseWidth);
          const center = cursor + width / 2;

          moment.style.left = `${center}px`;
          moment.style.width = `${width}px`;
          moment.style.minWidth = `${width}px`;

          if (card) {
            card.style.width = `${width}px`;
            card.style.minWidth = `${width}px`;
          }
          if (wrap) {
            wrap.style.width = `${width}px`;
            wrap.style.minWidth = `${width}px`;
          }

          cursor += width;
        });

        canvas.style.width = `${Math.max(cursor, window.innerWidth || 320)}px`;
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
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt {
        transform: translateX(-50%) !important;
        overflow: visible !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-card {
        border-top: 0 !important;
        border-left: 0 !important;
        border-right: 0 !important;
        border-bottom: 4px solid #ffd200 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt .zt-prompt-card {
        border-bottom: 0 !important;
      }

      .zt-img-card:has(.zt-prompt-card),
      .zt-img-moment.zt-prompt .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt .zt-img-card {
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
        overflow: hidden !important;
      }

      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-img-card,
      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-img-card,
      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-image-wrap,
      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-image-wrap {
        position: relative !important;
        display: block !important;
        height: 100% !important;
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

      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload img,
      .zt-closed .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive img {
        position: relative !important;
        width: auto !important;
        min-width: 0 !important;
        max-width: none !important;
        height: 100% !important;
        min-height: 100% !important;
        object-fit: contain !important;
        object-position: center center !important;
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
        background: transparent !important;
      }

      .zt-expanded .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload img,
      .zt-expanded .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive img {
        width: 100% !important;
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
