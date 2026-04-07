"use client";
// src/components/yatstats/FunZone.tsx
// Interactive six-tab FunZone area on the back of the player flip card.
//
// Layout order (matches approved visual target):
//   1. CTA strip  — YaTi mascot (left) + speech bubble (right), dynamic per tab
//   2. Tab strip  — six icon/label tabs in a single row
//   3. Content panel — active tab content, no internal scroll
//
// Tabs: Schedule | Stats | News | Social | Connect | Upload
// Default active tab: Stats
//
// YATI MASCOT ASSET RULE:
//   - Use ONLY: https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/YaTi.png
//   - Speech bubble rendered in CSS/HTML — NOT baked into the image.
//   - Callout text changes dynamically by active tab.
//
// SERIALIZATION RULE:
//   - Do NOT accept function props from the Server Component parent.
//   - All stat values arrive as pre-formatted strings from PlayerCardBack.tsx.
//
// SCROLL RULE:
//   - No overflow-y:auto or internal scrollbars anywhere in this component.
//   - Content expands naturally; page scrolls if needed.
//
// RESPONSIVE VERTICAL SYSTEM:
//   All sizing uses cqi (container query inline-size) units — the container is
//   established on .yat-back-cq in PlayerCardBack.tsx. This means all sizing
//   is relative to the CARD WIDTH, not the viewport.
//   fz-root is flex:1 min-height:0 — fills remaining card height after the hero.
//   CTA strip and tab strip use flex-shrink:1 with clamp(cqi) — they tighten first.
//   fz-panel is flex:1 min-height:0 — gets whatever space remains after CTA + tabs.

import { useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const YATI_MASCOT_URL = "https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/YaTi.png";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatItem {
  k: string;
  v: string; // pre-formatted by PlayerCardBack (Server Component)
}

interface FunZoneProps {
  player: Record<string, unknown>;
  isPitcher: boolean;
  isAllTime: boolean;
  resolvedHsid: string;
  stats: StatItem[]; // values are pre-formatted strings — no fmt function needed
  statBarLabel: string;
  /** Pre-computed display name from PlayerCardBack (Server Component) */
  displayName: string;
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = "schedule" | "stats" | "news" | "social" | "connect" | "upload";

interface Tab {
  id: TabId;
  label: string;
  icon: string; // remixicon class
}

const TABS: Tab[] = [
  { id: "schedule", label: "Schedule", icon: "ri-calendar-line" },
  { id: "stats",    label: "Stats",    icon: "ri-bar-chart-2-line" },
  { id: "news",     label: "News",     icon: "ri-newspaper-line" },
  { id: "social",   label: "Social",   icon: "ri-share-line" },
  { id: "connect",  label: "Connect",  icon: "ri-group-line" },
  { id: "upload",   label: "Upload",   icon: "ri-upload-cloud-line" },
];

// ─── CTA copy per tab ─────────────────────────────────────────────────────────

function getCta(tab: TabId, firstName: string): string {
  switch (tab) {
    case "schedule":
      return `See ${firstName}'s full season schedule & game log on his profile page.`;
    case "stats":
      return `See more detailed stats on ${firstName}'s player profile page.`;
    case "news":
      return `Read all of ${firstName}'s recent news stories on his profile page.`;
    case "social":
      return `Share a #YATABOY post with ${firstName}'s fans, family & friends.`;
    case "connect":
      return `Connect with ${firstName} through our Mentorship Marketplace.`;
    case "upload":
      return `Upload your favorite memories to ${firstName}'s Career Path timeline.`;
  }
}

// ─── YaTi CTA strip ───────────────────────────────────────────────────────────

function YatiCta({
  ctaText,
  profileHref,
}: {
  ctaText: string;
  profileHref: string;
}) {
  return (
    <div className="fz-cta-strip">
      {/* YaTi mascot — exact production S3 asset, never substituted */}
      <img
        src={YATI_MASCOT_URL}
        alt="YaTi mascot"
        className="fz-yati-img"
        draggable={false}
      />
      {/* Speech bubble — rendered in code, tail points left toward mascot */}
      <a href={profileHref} className="fz-bubble-link">
        <div className="fz-bubble">
          <span className="fz-bubble-text">{ctaText}</span>
          {/* Bubble tail — left-pointing triangle on the left edge, toward YaTi */}
          <span className="fz-bubble-tail" aria-hidden="true" />
        </div>
      </a>
    </div>
  );
}

// ─── Tab panel renderers ──────────────────────────────────────────────────────

function SchedulePanel({ player }: { player: Record<string, unknown> }) {
  const nextGame = player.next_game_text || player.next_game_date || null;
  const g1 = player.lg1_line || null;
  const g2 = player.lg2_line || null;
  const g3 = player.lg3_line || null;
  const hasSchedule = nextGame || g1 || g2 || g3;

  if (!hasSchedule) {
    return (
      <div className="fz-placeholder">
        <i className="ri-calendar-line fz-ph-icon" />
        <div className="fz-ph-text">Full schedule available on the player profile page.</div>
      </div>
    );
  }

  return (
    <div className="fz-schedule">
      {nextGame && (
        <div className="fz-sched-block">
          <div className="fz-sched-pill">NEXT GAME</div>
          <div className="fz-sched-val">{String(nextGame)}</div>
        </div>
      )}
      {(g1 || g2 || g3) && (
        <div className="fz-sched-block">
          <div className="fz-sched-pill">LAST 3 GAMES</div>
          {g1 && <div className="fz-sched-val">{String(g1)}</div>}
          {g2 && <div className="fz-sched-val">{String(g2)}</div>}
          {g3 && <div className="fz-sched-val">{String(g3)}</div>}
        </div>
      )}
    </div>
  );
}

function StatsPanel({
  stats,
  statBarLabel,
}: {
  stats: StatItem[];
  statBarLabel: string;
}) {
  return (
    <div className="fz-stats">
      <div className="yat-stats-bar">{statBarLabel}</div>
      <div className="yat-stats-grid">
        {stats.map(({ k, v }) => (
          <div key={k} className="yat-stat">
            <div className="yat-stat-label">{k}</div>
            <div className="yat-stat-val">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewsPanel({ player }: { player: Record<string, unknown> }) {
  const headline = player.latest_headline || player.news_headline || null;

  if (!headline) {
    return (
      <div className="fz-placeholder">
        <i className="ri-newspaper-line fz-ph-icon" />
        <div className="fz-ph-text">Latest headlines available on the player profile page.</div>
      </div>
    );
  }

  return (
    <div className="fz-news-teaser">
      <div className="fz-news-label">LATEST HEADLINE</div>
      <div className="fz-news-title">{String(headline)}</div>
    </div>
  );
}

function SocialPanel({ player }: { player: Record<string, unknown> }) {
  const xHandle = player.x_handle || player.twitter_handle || null;
  const igHandle = player.ig_handle || player.instagram_handle || null;
  const firstName = String(player.firstname || player.first_name || "").split(" ")[0] || "this player";

  return (
    <div className="fz-social">
      <div className="fz-social-tag">#YATABOY</div>
      <div className="fz-social-sub">Show some love for {firstName}!</div>
      <div className="fz-social-links">
        {xHandle && (
          <a
            href={`https://x.com/${String(xHandle).replace(/^@/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="fz-social-link"
          >
            <i className="ri-twitter-x-line" /> @{String(xHandle).replace(/^@/, "")}
          </a>
        )}
        {igHandle && (
          <a
            href={`https://instagram.com/${String(igHandle).replace(/^@/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="fz-social-link"
          >
            <i className="ri-instagram-line" /> @{String(igHandle).replace(/^@/, "")}
          </a>
        )}
        {!xHandle && !igHandle && (
          <div className="fz-ph-text">Social links available on the player profile page.</div>
        )}
      </div>
    </div>
  );
}

function ConnectPanel({ player }: { player: Record<string, unknown> }) {
  const firstName = String(player.firstname || player.first_name || "").split(" ")[0] || "this player";
  return (
    <div className="fz-placeholder">
      <i className="ri-group-line fz-ph-icon" />
      <div className="fz-ph-text">
        Connect with {firstName} through the{" "}
        <strong>Mentorship Marketplace</strong> on the player profile page.
      </div>
    </div>
  );
}

function UploadPanel({ player }: { player: Record<string, unknown> }) {
  const firstName = String(player.firstname || player.first_name || "").split(" ")[0] || "this player";
  return (
    <div className="fz-placeholder">
      <i className="ri-upload-cloud-line fz-ph-icon" />
      <div className="fz-ph-text">
        Upload your favorite memories to {firstName}&apos;s{" "}
        <strong>Career Path timeline</strong> on the player profile page.
      </div>
    </div>
  );
}

// ─── FunZone component ────────────────────────────────────────────────────────

export default function FunZone({
  player,
  isPitcher,
  isAllTime,
  resolvedHsid,
  stats,
  statBarLabel,
  displayName,
}: FunZoneProps) {
  const [activeTab, setActiveTab] = useState<TabId>("stats");

  const imageId = String(player.playerid || "");
  const slug = String(player.slug || "");
  const firstName = displayName.split(" ")[0] || "this player";
  const profileHref = `/${resolvedHsid}/player/${imageId}/${slug}`;
  const ctaText = getCta(activeTab, firstName);

  // Suppress unused-variable warnings for props used only in sub-panels
  void isPitcher;
  void isAllTime;

  return (
    <div className="fz-root">
      {/*
        1. CTA strip — YaTi (left) + speech bubble (right)
           flex-shrink:1 — yields padding before the content panel.
      */}
      <YatiCta ctaText={ctaText} profileHref={profileHref} />

      {/*
        2. Six-icon tab strip
           flex-shrink:1 — yields padding before content panel does.
      */}
      <nav className="fz-tab-strip" aria-label="FunZone tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`fz-tab-btn${activeTab === tab.id ? " fz-tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            type="button"
          >
            <i className={tab.icon} aria-hidden="true" />
            <span className="fz-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/*
        3. Active content panel — flex:1 min-height:0
           Gets all remaining vertical space after CTA + tab strips.
           No internal scroll; content expands naturally.
      */}
      <div className="fz-panel">
        {activeTab === "schedule" && <SchedulePanel player={player} />}
        {activeTab === "stats"    && <StatsPanel stats={stats} statBarLabel={statBarLabel} />}
        {activeTab === "news"     && <NewsPanel player={player} />}
        {activeTab === "social"   && <SocialPanel player={player} />}
        {activeTab === "connect"  && <ConnectPanel player={player} />}
        {activeTab === "upload"   && <UploadPanel player={player} />}
      </div>

      {/* Inline styles scoped to FunZone — no global stylesheet changes */}
      {/* All sizing uses cqi (container query inline-size) units.
          The container is .yat-back-cq established in PlayerCardBack.tsx.
          cqi = % of card width — ensures proportional sizing at any card width. */}
      <style>{`
        /* ── Root ─────────────────────────────────────────────────────── */
        .fz-root{
          display:flex;
          flex-direction:column;
          flex:1;
          min-height:0;
          background:var(--card-bg,#1a1a1a);
          border-top:1px solid var(--line,rgba(255,255,255,.1));
        }

        /* ── CTA strip ────────────────────────────────────────────────── */
        /* All padding/gap/font use cqi so they scale with card width */
        .fz-cta-strip{
          display:flex;
          align-items:center;
          gap:clamp(3px,1.5cqi,8px);
          padding:clamp(3px,1.2cqi,7px) clamp(4px,2cqi,10px) clamp(3px,1.2cqi,7px) clamp(4px,1.5cqi,8px);
          border-bottom:1px solid var(--line,rgba(255,255,255,.1));
          background:var(--card-bg,#1a1a1a);
          flex-shrink:1;
        }
        .fz-yati-img{
          width:clamp(24px,8cqi,44px);
          height:auto;
          object-fit:contain;
          flex-shrink:0;
          display:block;
          align-self:flex-end;
        }

        /* Speech bubble */
        .fz-bubble-link{
          flex:1;
          text-decoration:none;
          display:flex;
          align-items:center;
          min-width:0;
        }
        .fz-bubble{
          position:relative;
          background:#fff;
          color:#111;
          border-radius:8px;
          padding:clamp(3px,1.2cqi,7px) clamp(4px,2cqi,10px);
          flex:1;
          min-width:0;
          margin-left:clamp(4px,1.5cqi,9px);
        }
        .fz-bubble-text{
          font:700 clamp(6px,2.2cqi,9px)/1.4 Oswald,sans-serif;
          letter-spacing:.03em;
          text-transform:uppercase;
          display:block;
          word-break:break-word;
          color:#111;
        }
        /* Tail: left-pointing triangle on the left edge of the bubble */
        .fz-bubble-tail{
          position:absolute;
          left:-7px;
          top:50%;
          transform:translateY(-50%);
          width:0;
          height:0;
          border-top:6px solid transparent;
          border-bottom:6px solid transparent;
          border-right:7px solid #fff;
        }

        /* ── Tab strip ────────────────────────────────────────────────── */
        .fz-tab-strip{
          display:flex;
          justify-content:space-around;
          align-items:stretch;
          border-bottom:2px solid var(--line,rgba(255,255,255,.1));
          flex-shrink:1;
          background:var(--card-bg,#1a1a1a);
        }
        .fz-tab-btn{
          flex:1;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:clamp(1px,.5cqi,3px);
          padding:clamp(3px,1.2cqi,7px) 1px clamp(2px,1cqi,5px);
          background:none;
          border:none;
          border-bottom:2px solid transparent;
          margin-bottom:-2px;
          color:var(--muted,#9e9e9e);
          cursor:pointer;
          transition:color .15s,border-color .15s;
          min-width:0;
        }
        .fz-tab-btn i{
          font-size:clamp(9px,3.2cqi,14px);
          line-height:1;
        }
        .fz-tab-label{
          font:700 clamp(5px,1.8cqi,7.5px) "Bebas Neue",sans-serif;
          letter-spacing:.07em;
          text-transform:uppercase;
          line-height:1;
          white-space:nowrap;
        }
        .fz-tab-btn.fz-tab-active{
          color:var(--fg,#f2f2f2);
          border-bottom-color:var(--fg,#f2f2f2);
        }
        .fz-tab-btn:hover:not(.fz-tab-active){color:var(--fg,#f2f2f2)}

        /* ── Content panel ────────────────────────────────────────────── */
        /* flex:1 min-height:0 — gets all remaining space after CTA + tab strips.
           NO overflow-y:auto — content expands naturally, page scrolls if needed. */
        .fz-panel{
          flex:1;
          min-height:0;
          padding:clamp(4px,1.8cqi,10px) clamp(5px,2.5cqi,12px) clamp(5px,2.5cqi,14px);
          background:var(--card-bg,#1a1a1a);
        }

        /* ── Stats panel ──────────────────────────────────────────────── */
        .fz-stats{display:flex;flex-direction:column;gap:0}

        /* ── Schedule panel ───────────────────────────────────────────── */
        .fz-schedule{display:flex;flex-direction:column;gap:8px}
        .fz-sched-block{display:flex;flex-direction:column;gap:3px}
        .fz-sched-pill{
          display:inline-block;
          background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.12);
          border-radius:10px;
          padding:2px 8px;
          font:700 clamp(6px,1.8cqi,8px) Oswald,sans-serif;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:var(--muted,#9e9e9e);
          margin-bottom:1px;
        }
        .fz-sched-val{
          font:300 clamp(8px,2.5cqi,11px)/1.3 Oswald,sans-serif;
          color:var(--fg,#f2f2f2);
          padding-left:2px;
        }

        /* ── News teaser ──────────────────────────────────────────────── */
        .fz-news-teaser{display:flex;flex-direction:column;gap:4px}
        .fz-news-label{
          font:700 clamp(6px,1.8cqi,8px) Oswald,sans-serif;
          letter-spacing:.1em;
          text-transform:uppercase;
          color:var(--muted,#9e9e9e);
        }
        .fz-news-title{
          font:700 clamp(9px,3cqi,12px)/1.3 "Bebas Neue",sans-serif;
          letter-spacing:.03em;
          color:var(--fg,#f2f2f2);
        }

        /* ── Social panel ─────────────────────────────────────────────── */
        .fz-social{display:flex;flex-direction:column;gap:6px}
        .fz-social-tag{
          font:700 clamp(12px,4.5cqi,18px) "Bebas Neue",sans-serif;
          letter-spacing:.06em;
          color:var(--fg,#f2f2f2);
        }
        .fz-social-sub{
          font:300 clamp(7px,2.2cqi,10px) Oswald,sans-serif;
          color:var(--muted,#9e9e9e);
        }
        .fz-social-links{display:flex;flex-direction:column;gap:5px;margin-top:2px}
        .fz-social-link{
          display:flex;
          align-items:center;
          gap:6px;
          font:400 clamp(7px,2.2cqi,10px) Oswald,sans-serif;
          color:var(--muted,#9e9e9e);
          text-decoration:none;
          padding:5px 8px;
          border-radius:6px;
          border:1px solid var(--line,rgba(255,255,255,.1));
        }
        .fz-social-link:hover{color:var(--fg,#f2f2f2);border-color:rgba(255,255,255,.25)}
        .fz-social-link i{font-size:clamp(9px,3cqi,13px)}

        /* ── Placeholder (fallback for empty tabs) ────────────────────── */
        .fz-placeholder{
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:6px;
          padding:clamp(6px,3cqi,18px) 8px;
          text-align:center;
        }
        .fz-ph-icon{font-size:clamp(14px,5cqi,26px);opacity:.2}
        .fz-ph-text{
          font:300 clamp(7px,2.2cqi,10px)/1.45 Oswald,sans-serif;
          color:var(--muted,#9e9e9e);
          max-width:180px;
        }
        .fz-ph-text strong{font-weight:600;color:var(--fg,#f2f2f2)}
      `}</style>
    </div>
  );
}
