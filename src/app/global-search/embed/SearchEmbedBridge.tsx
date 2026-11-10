"use client";

import { useEffect } from "react";

// Only minimal UI state crosses the frame; searches and personal data stay in
// the existing microsite origin and follow the existing API/auth paths.
export default function SearchEmbedBridge() {
  useEffect(() => {
    // All links from the shared search renderer open the full school/player
    // destination instead of trapping navigation inside the splash iframe.
    const base = document.createElement("base");
    base.target = "_top";
    document.head.appendChild(base);

    const input = document.getElementById("gsInput") as HTMLInputElement | null;
    const drawer = document.getElementById("drawerLeft");
    const notify = (expanded: boolean) => {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "yatstats-search-embed-state", expanded }, "*");
      }
    };

    const onFocus = (event: FocusEvent) => {
      if (event.target === input) notify(true);
    };
    const onInput = (event: Event) => {
      if (event.target === input) notify(true);
    };
    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("[data-search-mode]")) notify(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        input?.blur();
        notify(false);
      }
    };
    drawer?.addEventListener("focusin", onFocus);
    drawer?.addEventListener("input", onInput, true);
    drawer?.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    notify(false);

    return () => {
      drawer?.removeEventListener("focusin", onFocus);
      drawer?.removeEventListener("input", onInput, true);
      drawer?.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      base.remove();
    };
  }, []);

  return null;
}
