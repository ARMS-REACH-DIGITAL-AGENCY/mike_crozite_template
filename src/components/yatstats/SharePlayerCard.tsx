"use client";

import { useState } from "react";

/**
 * Share the front flip card shown in the current gallery. The view+player
 * query is consumed by the existing revealRequestedPlayerCard code, and
 * server metadata renders the same player for link-preview crawlers.
 */
export default function SharePlayerCard({
  playerId,
  playerName,
  shareBaseUrl,
}: {
  playerId: string;
  playerName: string;
  shareBaseUrl?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function share(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const card = event.currentTarget.closest(".yat-card");
    const section = card?.closest(".yat-section");
    const view = section?.id === "sec-current" ? "current"
      : section?.id === "sec-alltime" ? "alltime" : "active";
    const base = (shareBaseUrl || window.location.origin).replace(/\/$/, "");
    const url = base + "/?view=" + encodeURIComponent(view)
      + "&player=" + encodeURIComponent(playerId) + "#player-" + encodeURIComponent(playerId);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: playerName + " | YAT?STATS", url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        window.prompt("Copy link to player card:", url);
      }
    }
  }

  return (
    <button type="button" className="yat-player-card-share" onClick={share}
      onPointerDown={e => e.stopPropagation()}
      aria-label={"Share " + playerName + "'s flip card"}
      title={"Share " + playerName + "'s flip card"}>
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <path d="m8.7 13.5 6.6 4M15.3 6.5l-6.6 4"/>
      </svg>
      <span className="yat-share-label">{copied ? "COPIED" : "SHARE"}</span>
      <style jsx>{`
        .yat-player-card-share {
          position: absolute;
          z-index: 15;
          right: 6%;
          top: 13%;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px;
          background: rgba(0,0,0,.78);
          border: 1px solid rgba(255,255,255,.72);
          border-radius: 16px;
          color: white;
          font: 800 11px/1 system-ui, sans-serif;
          letter-spacing: .03em;
          cursor: pointer;
          touch-action: manipulation;
        }
        .yat-player-card-share:focus-visible {
          outline: 3px solid #fff;
          outline-offset: 3px;
        }
      `}</style>
    </button>
  );
}
