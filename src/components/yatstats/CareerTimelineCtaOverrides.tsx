"use client";

import { useEffect } from "react";

const CLOSED_ZOOM = 1;
const FULL_ZOOM = 3.2;
const EXPANDED_CLASS = "zt-expanded";
const ZOOM_EVENT = "yat:career-timeline-zoom";
const PREFILL_EVENT = "yat:golden-line-prefill";

function inferYearFromMoment(moment: Element | null) {
  const title = moment?.getAttribute("title") || "";
  const match = title.match(/\b(19|20)\d{2}\b/);
  return match?.[0] || "";
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

    function openUpload(year: string) {
      try {
        if (year) {
          sessionStorage.setItem("yat:goldenLinePrefillYear", year);
          sessionStorage.setItem("yat:goldenLinePrefillDate", `${year}-07-01`);
        }
      } catch {}
      window.location.hash = "ppTab-upload";
      window.dispatchEvent(new CustomEvent(PREFILL_EVENT, { detail: { year: year ? Number(year) : undefined } }));
    }

    function syncFirstUploadSlot() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const shell = document.querySelector(".zt-shell-images") as HTMLElement | null;
        const canvas = document.querySelector(".zt-window-images .zt-canvas-images") as HTMLElement | null;
        const prompt = canvas?.querySelector(".zt-img-moment.zt-prompt") as HTMLElement | null;
        const firstMoment = prompt?.nextElementSibling as HTMLElement | null;
        let slot = canvas?.querySelector(".zt-pre-first-upload-slot") as HTMLButtonElement | null;

        if (!shell?.classList.contains(EXPANDED_CLASS) || !canvas || !prompt || !firstMoment) {
          slot?.remove();
          return;
        }

        if (!slot) {
          slot = document.createElement("button");
          slot.type = "button";
          slot.className = "zt-pre-first-upload-slot";
          slot.textContent = "+";
          slot.setAttribute("aria-label", "Upload a memory before the first timeline photo");
          canvas.appendChild(slot);
        }

        const canvasRect = canvas.getBoundingClientRect();
        const promptRect = prompt.getBoundingClientRect();
        const firstRect = firstMoment.getBoundingClientRect();
        const left = Math.round(((promptRect.right + firstRect.left) / 2) - canvasRect.left);
        const year = inferYearFromMoment(firstMoment);

        slot.style.left = `${Math.max(0, left)}px`;
        slot.dataset.prefillYear = year;
        slot.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          openUpload(slot?.dataset.prefillYear || "");
        };
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
      window.setTimeout(syncFirstUploadSlot, 40);
    }

    const observer = new MutationObserver(syncFirstUploadSlot);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("resize", syncFirstUploadSlot);
    window.addEventListener("scroll", syncFirstUploadSlot, true);
    window.addEventListener(ZOOM_EVENT, syncFirstUploadSlot as EventListener);
    window.addEventListener("yat:career-timeline-scroll", syncFirstUploadSlot as EventListener);
    syncFirstUploadSlot();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("resize", syncFirstUploadSlot);
      window.removeEventListener("scroll", syncFirstUploadSlot, true);
      window.removeEventListener(ZOOM_EVENT, syncFirstUploadSlot as EventListener);
      window.removeEventListener("yat:career-timeline-scroll", syncFirstUploadSlot as EventListener);
      document.querySelectorAll(".zt-pre-first-upload-slot").forEach((node) => node.remove());
    };
  }, []);

  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt {
        transform: translateX(calc(-50% + 82px)) !important;
        overflow: visible !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
      }

      .zt-window-images .zt-canvas-images > .zt-upload-slot:first-child {
        transform: translate(calc(-50% + 82px), -50%) !important;
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

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt + .zt-img-moment,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt + .zt-img-moment .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt + .zt-img-moment .zt-image-wrap,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt + .zt-img-moment img {
        margin-left: 0 !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive {
        width: auto !important;
        min-width: 0 !important;
        overflow: visible !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-image-wrap,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-image-wrap {
        width: auto !important;
        min-width: 0 !important;
        height: 100% !important;
        background: transparent !important;
        border: 2px solid rgba(255,255,255,.72) !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload img,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive img {
        width: auto !important;
        max-width: none !important;
        height: 100% !important;
        object-fit: contain !important;
        object-position: center center !important;
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-upload .zt-card-overlay,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-archive .zt-card-overlay {
        display: none !important;
      }

      .zt-pre-first-upload-slot {
        position: absolute !important;
        top: 50% !important;
        transform: translate(-50%, -50%) !important;
        z-index: 20 !important;
        width: 32px !important;
        height: 32px !important;
        padding: 0 !important;
        border: 1px solid rgba(255,255,255,.68) !important;
        background: rgba(0,0,0,.80) !important;
        color: #fff !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        font: 900 23px/1 Oswald, sans-serif !important;
        box-shadow: 0 2px 10px rgba(0,0,0,.42) !important;
        cursor: pointer !important;
      }

      .zt-pre-first-upload-slot:hover {
        border-color: #fff !important;
        background: rgba(0,0,0,.94) !important;
      }
    ` }} />
  );
}
