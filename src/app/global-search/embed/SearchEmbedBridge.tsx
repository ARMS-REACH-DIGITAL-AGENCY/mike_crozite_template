"use client";
import { useEffect } from "react";

// This route runs the EXACT shared microsite SearchDrawerTabs. The landing
// page only opens/closes its frame; none of the search cards are duplicated.
export default function SearchEmbedBridge() {
  useEffect(() => {
    const base = document.createElement("base");
    base.target = "_top";
    document.head.appendChild(base);
    const input = document.getElementById("gsInput") as HTMLInputElement | null;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      input?.blur();
      if (window.parent !== window) {
        window.parent.postMessage({ type: "yatstats-search-drawer-close" }, "*");
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      base.remove();
    };
  }, []);
  return null;
}
