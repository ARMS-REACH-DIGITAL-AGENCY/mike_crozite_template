"use client";
// src/components/yatstats/FunZone.tsx
// Interactive six-tab FunZone area on the back of the player flip card.
//
// Tabs: Schedule | Stats | News | Social | Connect | Upload
// Default active tab: Stats
//
// YATI MASCOT ASSET RULE:
//   - Use ONLY the production S3 asset: https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/YaTi.png
//   - Do NOT generate, redraw, crop, or substitute any other image.
//   - The callout bubble is rendered in CSS/HTML — NOT baked into the image.
//   - The callout text changes dynamically by active tab.
//
// All tab state is local — no navigation occurs on tab click.
// Stats tab is fully functional from props passed by PlayerCardBack.
// Schedule, News, Social, Connect, Upload use compact fallback teasers
// (no new data pipeline or cross-file dependencies).

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
      return `See ${firstName}'s Full Season Schedule & Game Log on his profile page.`;
    case "stats":
      return `See more detailed STATS on ${firstName}'s player profile page.`;
    case "news":
      return `Read all of ${firstName}'s recent NEWS stories on his profile page.`;
    case "social":
      return `Share a #YATABOY post with ${firstName}'s fans, family & friends.`;
    case "connect":
      return `CONNECT with ${firstName} through our MENTORSHIP MARKETPLACE`;
    case "upload":
      return `UPLOAD your favorite memories to ${firstName}'s baseball Career Path timeline`;
  }
}

// ─── YaTi CTA block ───────────────────────────────────────────────────────────
// The mascot image is the exact production S3 asset.
// The speech bubble is rendered entirely in CSS/HTML — not part of the image.
// The callout text changes dynamically based on the active tab.

function YatiCta({
  ctaText,
  profileHref,
}: {
  ctaText: string;
  profileHref: string;
}) {
  return (
    <div className="fz-yati-row">
      {/* Speech bubble — rendered in code, not baked into the image */}
      <a href={profileHref} className="fz-bubble-link">
        <div className="fz-bubble">
          <span className="fz-bubble-text">{ctaText}</span>
          {/* Bubble tail pointing toward the mascot (left side) */}
          <span className="fz-bubble-tail" aria-hidden="true" />
        </div>
      </a>
      {/* YaTi mascot — exact production S3 asset, never substituted */}
      <img
        src={YATI_MASCOT_URL}
        alt="YaTi mascot"
        className="fz-yati-img"
        draggable={false}
      />
    </div>
  );
}

// ─── Tab panel renderers ──────────────────────────────────────────────────────

function SchedulePanel({ player }: { player: Record<string, unknown> }) {
  const nextGame = player.next_game_text || player.next_game || null;
  const g1 = player.last_game_1 || player.game_log_1 || null;
  const g2 = player.last_game_2 || player.game_log_2 || null;
  const g3 = player.last_game_3 || player.game_log_3 || null;
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
}: FunZoneProps) {
  const [activeTab, setActiveTab] = useState<TabId>("stats");

  const imageId = String(player.playerid || "");
  const slug = String(player.slug || "");
  const firstName = String(player.firstname || player.first_name || "").split(" ")[0] || "this player";
  const profileHref = `/${resolvedHsid}/player/${imageId}/${slug}`;
  const ctaText = getCta(activeTab, firstName);

  // Suppress unused-variable warnings for props used only in sub-panels
  void isPitcher;
  void isAllTime;

  return (
    <div className="yat-fun-zone fz-root">
      {/* YaTi mascot + code-rendered speech bubble — CTA changes with active tab */}
      <YatiCta ctaText={ctaText} profileHref={profileHref} />

      {/* Six-icon tab strip */}
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

      {/* Dynamic lower panel */}
      <div className="fz-panel">
        {activeTab === "schedule" && <SchedulePanel player={player} />}
        {activeTab === "stats"    && <StatsPanel stats={stats} statBarLabel={statBarLabel} />}
        {activeTab === "news"     && <NewsPanel player={player} />}
        {activeTab === "social"   && <SocialPanel player={player} />}
        {activeTab === "connect"  && <ConnectPanel player={player} />}
        {activeTab === "upload"   && <UploadPanel player={player} />}
      </div>

      {/* Inline styles scoped to FunZone — no global stylesheet changes */}
      <style>{`
        .fz-root{display:flex;flex-direction:column;flex:1 1 0;min-height:0;overflow:hidden;background:var(--card-bg,#1a1a1a);border-top:1px solid var(--line,rgba(255,255,255,.1))}

        /* YaTi mascot row */
        .fz-yati-row{display:flex;align-items:flex-end;gap:4px;padding:4px 8px 0;border-bottom:1px solid var(--line,rgba(255,255,255,.1));flex-shrink:0;min-height:52px}
        .fz-yati-img{width:36px;height:auto;object-fit:contain;flex-shrink:0;display:block;margin-bottom:0}

        /* Speech bubble — rendered in code, tail points left toward mascot */
        .fz-bubble-link{flex:1;text-decoration:none;display:flex;align-items:center;min-width:0}
        .fz-bubble{position:relative;background:#fff;color:#111;border-radius:8px;padding:5px 8px;flex:1;min-width:0}
        .fz-bubble-text{font:700 8.5px/1.35 Oswald,sans-serif;letter-spacing:.02em;text-transform:uppercase;display:block;word-break:break-word}
        /* Tail: right-pointing triangle on the right edge of the bubble, toward the mascot */
        .fz-bubble-tail{position:absolute;right:-7px;top:50%;transform:translateY(-50%);width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:7px solid #fff}

        /* Tab strip */
        .fz-tab-strip{display:flex;justify-content:space-around;align-items:stretch;border-bottom:1px solid var(--line,rgba(255,255,255,.1));flex-shrink:0}
        .fz-tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:5px 2px 4px;background:none;border:none;border-bottom:2px solid transparent;color:var(--muted,#9e9e9e);cursor:pointer;transition:color .15s,border-color .15s;min-width:0}
        .fz-tab-btn i{font-size:13px;line-height:1}
        .fz-tab-label{font:700 7px "Bebas Neue",sans-serif;letter-spacing:.07em;text-transform:uppercase;line-height:1;white-space:nowrap}
        .fz-tab-btn.fz-tab-active{color:var(--fg,#f2f2f2);border-bottom-color:var(--fg,#f2f2f2)}
        .fz-tab-btn:hover:not(.fz-tab-active){color:var(--fg,#f2f2f2)}

        /* Panel */
        .fz-panel{flex:1 1 0;overflow-y:auto;min-height:0;padding:6px 8px 8px}

        /* Stats panel — reuses existing yat-stats-bar / yat-stats-grid / yat-stat classes */
        .fz-stats{display:flex;flex-direction:column;gap:0}

        /* Schedule panel */
        .fz-schedule{display:flex;flex-direction:column;gap:6px}
        .fz-sched-block{display:flex;flex-direction:column;gap:2px}
        .fz-sched-pill{display:inline-block;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:2px 7px;font:700 8px Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#9e9e9e);margin-bottom:1px}
        .fz-sched-val{font:300 10px/1.3 Oswald,sans-serif;color:var(--fg,#f2f2f2);padding-left:2px}

        /* News teaser */
        .fz-news-teaser{display:flex;flex-direction:column;gap:4px}
        .fz-news-label{font:700 8px Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#9e9e9e)}
        .fz-news-title{font:700 11px/1.3 "Bebas Neue",sans-serif;letter-spacing:.03em;color:var(--fg,#f2f2f2)}

        /* Social panel */
        .fz-social{display:flex;flex-direction:column;gap:5px}
        .fz-social-tag{font:700 16px "Bebas Neue",sans-serif;letter-spacing:.06em;color:var(--fg,#f2f2f2)}
        .fz-social-sub{font:300 9px Oswald,sans-serif;color:var(--muted,#9e9e9e)}
        .fz-social-links{display:flex;flex-direction:column;gap:4px;margin-top:2px}
        .fz-social-link{display:flex;align-items:center;gap:5px;font:400 10px Oswald,sans-serif;color:var(--muted,#9e9e9e);text-decoration:none;padding:4px 6px;border-radius:6px;border:1px solid var(--line,rgba(255,255,255,.1))}
        .fz-social-link:hover{color:var(--fg,#f2f2f2);border-color:rgba(255,255,255,.25)}
        .fz-social-link i{font-size:12px}

        /* Placeholder (Schedule/News/Connect/Upload fallback) */
        .fz-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:10px 4px;text-align:center;height:100%}
        .fz-ph-icon{font-size:22px;opacity:.2}
        .fz-ph-text{font:300 9px/1.4 Oswald,sans-serif;color:var(--muted,#9e9e9e);max-width:160px}
        .fz-ph-text strong{font-weight:600;color:var(--fg,#f2f2f2)}
      `}</style>
    </div>
  );
}
