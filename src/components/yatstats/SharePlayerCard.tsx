"use client";

import { useState } from "react";

export default function SharePlayerCard({ playerId, playerName, hsid }: { playerId: string; playerName: string; hsid?: string }) {
  const [copied, setCopied] = useState(false);
  async function share(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const numericSchool = /^\\d+$/.test(hsid || "") && window.location.pathname.startsWith("/" + hsid);
    const path = (numericSchool ? "/" + hsid : "") + "/c/" + encodeURIComponent(playerId);
    const url = window.location.origin + path;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: playerName + " | YAT?STATS" });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      } catch {
        window.prompt("Copy player link", url);
      }
    }
  }
  return <button type="button" onClick={share} onPointerDown={event => event.stopPropagation()}
    aria-label={"Share " + playerName + "'s flip card"}
    title={"Share " + playerName + "'s flip card"}
    style={{position:"absolute",left: "7%",top:"13%",zIndex:12,display:"flex",alignItems:"center",gap:5,padding:"6px 9px",borderRadius:16,border:"1px solid rgba(255,255,255,.7)",background:"rgba(0,0,0,.75)",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 13.5 6.6 4M15.3 6.5l-6.6 4"/></svg>
    {copied ? "COPIED" : "SHARE"}
  </button>;
}
