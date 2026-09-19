"use client";
// src/components/yatstats/FunZone.tsx
// Interactive six-tab FunZone area on the back of the player flip card.
//
// Layout order:
// 1. CTA strip - YaTi mascot on the left and speech bubble on the right.
// 2. Tab strip - six icon/label tabs in a single row.
// 3. Content panel - active tab content, no internal scroll.
//
// Tabs: Schedule | Stats | News | Social | Connect | Upload
// Default active tab: Stats
//
// YATI MASCOT ASSET RULE:
// - Use only: https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/YaTi.png
// - Speech bubble is rendered in CSS/HTML, not baked into the image.
// - Callout text changes dynamically by active tab.
//
// SERIALIZATION RULE:
// - Do not accept function props from the Server Component parent.
// - All stat values arrive as pre-formatted strings from PlayerCardBack.tsx.
//
// SCROLL RULE:
// - No overflow-y:auto or internal scrollbars anywhere in this component.
// - Content expands naturally; page scrolls if needed.
//
// RESPONSIVE VERTICAL SYSTEM:
// - All sizing uses cqi units from .yat-back-cq in PlayerCardBack.tsx.
// - fz-root fills remaining card height after the hero.
// - CTA strip and tab strip tighten first.
// - fz-panel gets whatever space remains after CTA and tabs.

import { useEffect, useRef, useState } from "react";

// Constants

const YATI_MASCOT_URL = "https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/YaTi.png";

// Types

interface StatItem {
  k: string;
  v: string; // pre-formatted by PlayerCardBack (Server Component)
}

interface StatBucket {
  label: string;
  stats: StatItem[];
}

interface FunZoneProps {
  player: Record<string, unknown>;
  isPitcher: boolean;
  isAllTime: boolean;
  resolvedHsid: string;
  stats: StatItem[]; // values are pre-formatted strings - no fmt function needed
  statBarLabel: string;
  statBuckets?: StatBucket[];
  /** Pre-computed display name from PlayerCardBack (Server Component) */
  displayName: string;
  /**
   * The school's real canonical URL (school_success.microsite_url, e.g.
   * "https://hamilton.az.yatstats.com"), resolved server-side by whichever
   * page rendered this card - PlayerCardBack has no DB access itself. Falls
   * back to the bare https://yatstats.com/{hsid} form only if a school
   * record wasn't resolved (should be rare).
   */
  shareBaseUrl?: string | null;
  /** Raw school display name (school_success.hsname, e.g. "El Capitan" - no "High School" suffix), for the share message. */
  schoolName?: string | null;
  /** School location (school_success.hslocation, e.g. "Lakeside, CA"), for the share message. */
  schoolLocation?: string | null;
}

interface NewsTease {
  badge?: string;
  headline?: string;
  body?: string;
  footer?: string;
  imageUrl?: string;
  newsCardId?: string;
}

interface NewsApiPost {
  tease?: NewsTease | null;
  headline?: string | null;
  summary?: string | null;
  imageUrl?: string | null;
  id?: string | number | null;
}


// Tab definitions

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

// CTA copy per tab

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

// YaTi CTA strip

function YatiCta({
  ctaText,
  profileHref,
}: {
  ctaText: string;
  profileHref: string;
}) {
  return (
    <div className="fz-cta-strip">
      {/* YaTi mascot - exact production S3 asset, never substituted */}
      <img
        src={YATI_MASCOT_URL}
        alt="YaTi mascot"
        className="fz-yati-img"
        draggable={false}
      />
      {/* Speech bubble - rendered in code, tail points left toward mascot */}
      <a href={profileHref} className="fz-bubble-link">
        <div className="fz-bubble">
          <span className="fz-bubble-text">{ctaText}</span>
          {/* Bubble tail - left-pointing triangle on the left edge, toward YaTi */}
          <span className="fz-bubble-tail" aria-hidden="true" />
        </div>
      </a>
    </div>
  );
}

// Tab panel renderers

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

function NewsPanel({
  player,
  resolvedHsid,
  isActive,
}: {
  player: Record<string, unknown>;
  resolvedHsid: string;
  isActive: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [featuredNews, setFeaturedNews] = useState<NewsTease | null>(null);
  const hasFetchedRef = useRef(false);

  const playerId = String(player.playerid || "");

  // Every panel is always mounted now (so a card injected as static HTML
  // still has all six tabs' markup to reveal), but this fetch should still
  // only fire once the fan actually opens the News tab, not on every card's
  // initial render - fetching news for every card on a gallery page whether
  // or not anyone looks at it would multiply site-wide request volume.
  useEffect(() => {
    if (!isActive || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    let cancelled = false;

    async function loadNews() {
      if (!resolvedHsid || !playerId) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/news/${resolvedHsid}?player=${playerId}&limit=1`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`News fetch failed: ${res.status}`);
        }

        const data = await res.json();
const firstPost: NewsApiPost | undefined = data?.posts?.[0];

const normalizedTease: NewsTease | null = firstPost
  ? {
      badge: firstPost.tease?.badge ?? undefined,
      headline: firstPost.tease?.headline ?? firstPost.headline ?? undefined,
      body: firstPost.tease?.body ?? firstPost.summary ?? undefined,
      footer: firstPost.tease?.footer ?? undefined,
      imageUrl: firstPost.tease?.imageUrl ?? firstPost.imageUrl ?? undefined,
      newsCardId:
        firstPost.tease?.newsCardId ??
        (firstPost.id != null ? String(firstPost.id) : undefined),
    }
  : null;

if (!cancelled) {
  setFeaturedNews(normalizedTease);
}
      } catch (error) {
        console.error("FunZone news fetch error:", error);
        if (!cancelled) {
  setFeaturedNews(null);
}
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadNews();

    return () => {
      cancelled = true;
    };
  }, [isActive, resolvedHsid, playerId]);

  if (loading) {
    return (
      <div className="fz-placeholder">
        <i className="ri-newspaper-line fz-ph-icon" />
        <div className="fz-ph-text">Loading latest news...</div>
      </div>
    );
  }

  if (!featuredNews) {
    return (
      <div className="fz-placeholder">
        <i className="ri-newspaper-line fz-ph-icon" />
        <div className="fz-ph-text">Latest headlines available on the player profile page.</div>
      </div>
    );
  }

  const slug = String(player.slug || "");
const profileHref = `/${resolvedHsid}/player/${playerId}/${slug}#ppTab-news`;
const featuredNewsHref = featuredNews.newsCardId
  ? `/${resolvedHsid}/player/${playerId}/${slug}#news-card-${featuredNews.newsCardId}`
  : profileHref;

return (
  <div className="fz-news-featured">
    {featuredNews.imageUrl ? (
      <a href={featuredNewsHref} className="fz-news-thumb-link">
        <img
          src={featuredNews.imageUrl}
          alt={featuredNews.headline || "Latest news"}
          className="fz-news-thumb"
        />
      </a>
    ) : (
      <a href={featuredNewsHref} className="fz-news-thumb-link">
        <div className="fz-news-thumb fz-news-thumb-fallback">
          NEWS
        </div>
      </a>
    )}

    <div className="fz-news-copy">
      {featuredNews.badge && (
        <div className="fz-news-label">{featuredNews.badge}</div>
      )}

      {featuredNews.headline && (
        <a href={profileHref} className="fz-news-title-link">
          <div className="fz-news-title">{featuredNews.headline}</div>
        </a>
      )}

      {featuredNews.body && (
        <div className="fz-news-body">{featuredNews.body}</div>
      )}

      {featuredNews.footer && (
        <div className="fz-news-footer">{featuredNews.footer}</div>
      )}
      </div>
    </div>
  );
}
// Facebook's sharer.php no longer accepts pre-filled text/tags at all
// (deprecated for spam reasons around 2018) - a Facebook share can only
// carry the URL itself, whose link preview then comes from that page's own
// Open Graph tags, so the @handle below only actually "tags" YAT?STATS on
// X, where it's a plain mention inside the tweet text.
const YAT_STATS_X_HANDLE = "yat_stats";

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231ZM17.083 19.77h1.833L7.084 4.126H5.117Z" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.35 0-2.63-.31-3.77-.86L3 21l1.86-5.73A8.5 8.5 0 1 1 21 11.5Z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

// The Social tab isn't about the player's own social accounts - it's a
// commercial for YAT?STATS itself: prompt a fan to share this card to their
// own feed with a personalized #YATABOY hashtag. Every link here is a plain
// <a href>, deliberately - no click handler required, so this works
// identically whether the card hydrates normally or is injected as static
// HTML (a cross-school favorite). Icons are inline SVGs rather than an icon
// font, so the real Facebook/X marks always render regardless of font load.
function SocialPanel({
  firstName,
  lastName,
  schoolName,
  schoolLocation,
  shareUrl,
}: {
  firstName: string;
  lastName: string;
  schoolName: string;
  schoolLocation: string;
  shareUrl: string;
}) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "this player";
  const hashtag = `YATABOY${firstName.replace(/[^a-zA-Z0-9]/g, "")}`;
  // school_success.hslocation is stored comma-packed ("Lakeside,CA") -
  // normalize to "Lakeside, CA" for a message meant to be posted publicly.
  const formattedLocation = schoolLocation
    ? schoolLocation.split(",").map((part) => part.trim()).filter(Boolean).join(", ")
    : "";

  const shareText =
    schoolName && formattedLocation
      ? [
          `Hey Alumni of ${schoolName} High School in ${formattedLocation}...`,
          `Do you ever wonder what became of one of your school's best baseball players like ${fullName}?`,
          `Visit @${YAT_STATS_X_HANDLE} to find out`,
          `Where They #YAT and`,
          `What's Their #STATS!`,
          `#${hashtag}`,
        ].join("\n")
      : `Check out ${fullName}'s YAT?STATS player card! Where They #YAT and What's Their #STATS! #${hashtag}`;

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(shareText);
  const encodedSmsBody = encodeURIComponent(`${shareText}\n${shareUrl}`);
  const encodedEmailSubject = encodeURIComponent(`Check out ${fullName} on YAT?STATS`);

  return (
    <div className="fz-social">
      <div className="fz-social-tag">#{hashtag}</div>
      <div className="fz-social-sub">Share {fullName}&apos;s YAT?STATS card with your friends and family.</div>
      <div className="fz-social-links">
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fz-social-link"
        >
          <FacebookIcon />
          <span>Facebook</span>
        </a>
        <a
          href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fz-social-link"
        >
          <XIcon />
          <span>X</span>
        </a>
        <a href={`sms:?&body=${encodedSmsBody}`} className="fz-social-link">
          <TextIcon />
          <span>Text</span>
        </a>
        <a href={`mailto:?subject=${encodedEmailSubject}&body=${encodedSmsBody}`} className="fz-social-link">
          <EmailIcon />
          <span>Email</span>
        </a>
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

// FunZone component

export default function FunZone({
  player,
  isPitcher,
  isAllTime,
  resolvedHsid,
  stats,
  statBarLabel,
  statBuckets,
  displayName,
  shareBaseUrl,
  schoolName,
  schoolLocation,
}: FunZoneProps) {
  const [activeTab, setActiveTab] = useState<TabId>("stats");
  const [activeStatsIndex, setActiveStatsIndex] = useState(0);
  const resolvedStatBuckets =
    statBuckets && statBuckets.length > 0
      ? statBuckets
      : [{ label: statBarLabel, stats }];
  const activeStatsBucket = resolvedStatBuckets[Math.min(activeStatsIndex, resolvedStatBuckets.length - 1)];

  useEffect(() => {
    setActiveStatsIndex(0);
  }, [resolvedStatBuckets.length]);

  const imageId = String(player.playerid || "");
  const slug = String(player.slug || "");
  const firstName = displayName.split(" ")[0] || "this player";
  const lastName = String(player.lastname || player.last_name || displayName.split(" ").slice(1).join(" ") || "");
  // Deep-link to the matching tab on the profile page so the CTA always
  // opens the same tab the user is currently viewing on the flip card.
  const profileHref = `/${resolvedHsid}/player/${imageId}/${slug}#ppTab-${activeTab}`;
  // shareBaseUrl is the school's real canonical URL (school_success.
  // microsite_url, e.g. "https://hamilton.az.yatstats.com"), resolved by
  // the page/route that rendered this card - a bare "yatstats.com/{hsid}"
  // URL 404s in production, the flip card only ever lives on the school's
  // own subdomain. Only fall back to that (still-incorrect but non-empty)
  // form if a school record genuinely couldn't be resolved.
  const shareUrl = `${shareBaseUrl || `https://yatstats.com/${resolvedHsid}`}/player/${imageId}/${slug}`;
  const ctaText = getCta(activeTab, firstName);

  // Suppress unused-variable warnings for props used only in sub-panels
  void isPitcher;
  void isAllTime;

  return (
    <div className="fz-root">
      {/*
        1. CTA strip - YaTi (left) + speech bubble (right)
           flex-shrink:1 - yields padding before the content panel.
      */}
      <YatiCta ctaText={ctaText} profileHref={profileHref} />

      {/*
        2. Content panels - flex:1 min-height:0
           All six are always rendered (a cross-school favorite is injected
           as static HTML fetched from /embed/player-card - React never
           hydrates it, so only markup that already exists in that HTML can
           ever be revealed; a tab whose content only mounted conditionally
           on activeTab would never exist for that card at all). Visibility
           is CSS-only (.fz-panel-active), so plain data-fz-tab + a vanilla
           click listener (added where cross-school cards get injected) can
           drive the same tab switching without React.
           No internal scroll; content expands naturally.
      */}
      <div
        className={`fz-panel${activeTab === "schedule" ? " fz-panel-active" : ""}`}
        data-fz-tab="schedule"
      >
        <SchedulePanel player={player} />
      </div>
      <div
        className={`fz-panel${activeTab === "stats" ? " fz-panel-active" : ""}`}
        data-fz-tab="stats"
      >
        <div className="fz-stats-shell">
          {resolvedStatBuckets.length > 1 && (
            <div className="fz-stat-bucket-tabs" role="tablist" aria-label="Stats level buckets">
              {resolvedStatBuckets.map((bucket, idx) => (
                <button
                  key={`${bucket.label}-${idx}`}
                  type="button"
                  role="tab"
                  aria-selected={activeStatsIndex === idx}
                  className={`fz-stat-bucket-btn${activeStatsIndex === idx ? " active" : ""}`}
                  onClick={() => setActiveStatsIndex(idx)}
                >
                  {bucket.label}
                </button>
              ))}
            </div>
          )}
          <StatsPanel
            stats={activeStatsBucket.stats}
            statBarLabel={activeStatsBucket.label}
          />
        </div>
      </div>
      <div
        className={`fz-panel${activeTab === "news" ? " fz-panel-active" : ""}`}
        data-fz-tab="news"
      >
        <NewsPanel player={player} resolvedHsid={resolvedHsid} isActive={activeTab === "news"} />
      </div>
      <div
        className={`fz-panel${activeTab === "social" ? " fz-panel-active" : ""}`}
        data-fz-tab="social"
      >
        <SocialPanel
          firstName={firstName}
          lastName={lastName}
          schoolName={schoolName || ""}
          schoolLocation={schoolLocation || ""}
          shareUrl={shareUrl}
        />
      </div>
      <div
        className={`fz-panel${activeTab === "connect" ? " fz-panel-active" : ""}`}
        data-fz-tab="connect"
      >
        <ConnectPanel player={player} />
      </div>
      <div
        className={`fz-panel${activeTab === "upload" ? " fz-panel-active" : ""}`}
        data-fz-tab="upload"
      >
        <UploadPanel player={player} />
      </div>

      {/*
        3. Six-icon tab strip - now at the BOTTOM of Block 5
           flex-shrink:1 - yields padding before content panel does.
      */}
      <nav className="fz-tab-strip" aria-label="FunZone tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`fz-tab-btn${activeTab === tab.id ? " fz-tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            data-fz-tab={tab.id}
            type="button"
          >
            <i className={tab.icon} aria-hidden="true" />
            <span className="fz-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Inline styles scoped to FunZone - no global stylesheet changes */}
      {/* All sizing uses cqi (container query inline-size) units.
          The container is .yat-back-cq established in PlayerCardBack.tsx.
          cqi = percent of card width - ensures proportional sizing at any card width. */}
      <style>{`
        /* -- Root ------------------------------------------------------- */
        /* Fully transparent - cardboard texture from yat-back-texture shows through.
           All text uses dark colours for legibility on the light cardboard. */
        .fz-root{
          display:flex;
          flex-direction:column;
          flex:1;
          min-height:0;
          background:transparent;
          border-top:1px solid rgba(30,22,14,0.25);
        }

        /* -- CTA strip -------------------------------------------------- */
        /* All padding/gap/font use cqi so they scale with card width */
        .fz-cta-strip{
          display:flex;
          align-items:center;
          gap:clamp(3px,1.5cqi,8px);
          padding:clamp(3px,1.2cqi,7px) clamp(4px,2cqi,10px) clamp(3px,1.2cqi,7px) clamp(4px,1.5cqi,8px);
          border-bottom:1px solid rgba(30,22,14,0.2);
          background:rgba(30,22,14,0.08);
          flex-shrink:1;
        }
        .fz-yati-img{
          width:clamp(24px,8cqi,44px);
          height:auto;
          object-fit:contain;
          flex-shrink:0;
          display:block;
          align-self:flex-end;
          filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));
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
          background:rgba(255,255,255,0.88);
          color:#1a1208;
          border-radius:8px;
          padding:clamp(3px,1.2cqi,7px) clamp(4px,2cqi,10px);
          flex:1;
          min-width:0;
          margin-left:clamp(4px,1.5cqi,9px);
          border:1px solid rgba(30,22,14,0.15);
        }
        .fz-bubble-text{
          font:700 clamp(6px,2.2cqi,9px)/1.4 Oswald,sans-serif;
          letter-spacing:.03em;
          text-transform:uppercase;
          display:block;
          word-break:break-word;
          color:#1a1208;
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

        /* -- Tab strip -------------------------------------------------- */
        .fz-tab-strip{
          display:flex;
          justify-content:space-around;
          align-items:stretch;
          border-top:2px solid rgba(30,22,14,0.2);
          flex-shrink:1;
          background:rgba(30,22,14,0.07);
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
          border-top:2px solid transparent;
          margin-top:-2px;
          color:rgba(30,22,14,0.45);
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
          color:rgba(30,22,14,0.9);
          border-top-color:rgba(30,22,14,0.8);
        }
        .fz-tab-btn:hover:not(.fz-tab-active){color:rgba(30,22,14,0.7)}

        /* -- Content panel ---------------------------------------------- */
        /* All six panels are always in the DOM (see the comment at their
           render site); only the active one is displayed, so the hidden
           ones take up no layout space and never push the tab strip down. */
        .fz-panel{
          display:none;
        }
        /* flex:1 min-height:0 - gets all remaining space after CTA + tab strips.
           overflow:hidden - clips content to allocated space so it CANNOT push
           the tab strip down at any card width (3-across or 4-across). */
        .fz-panel.fz-panel-active{
          display:block;
          flex:1;
          min-height:0;
          overflow:hidden;
          padding:clamp(4px,1.8cqi,10px) clamp(5px,2.5cqi,12px) clamp(5px,2.5cqi,14px);
          background:transparent;
        }

        .fz-stats-shell{
          display:flex;
          flex-direction:column;
          gap:clamp(4px,1.4cqi,8px);
          height:100%;
          min-height:0;
        }

        .fz-stat-bucket-tabs{
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(0,1fr));
          gap:clamp(2px,.8cqi,5px);
          flex-shrink:0;
        }

        .fz-stat-bucket-btn{
          min-width:0;
          padding:clamp(3px,1cqi,6px) clamp(3px,1cqi,7px);
          border:1px solid rgba(30,22,14,0.18);
          border-radius:clamp(3px,1cqi,6px);
          background:rgba(255,255,255,0.18);
          color:rgba(30,22,14,0.62);
          cursor:pointer;
          font:700 clamp(5px,1.7cqi,8px)/1.05 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.05em;
          text-transform:uppercase;
          white-space:normal;
        }

        .fz-stat-bucket-btn.active{
          background:rgba(255,255,255,0.38);
          color:rgba(0,0,0,0.90);
          border-color:rgba(30,22,14,0.45);
          box-shadow:inset 0 -2px 0 rgba(30,22,14,0.65);
        }

        .fz-stat-bucket-btn:hover:not(.active){
          color:rgba(30,22,14,0.86);
          border-color:rgba(30,22,14,0.32);
        }

        /* -- Stats panel ------------------------------------------------ */
        .fz-stats{
          display:flex;
          flex-direction:column;
          gap:clamp(5px,1.8cqi,10px);
          height:100%;
          min-height:0;
        }

        .yat-stats-bar{
          display:flex;
          align-items:center;
          justify-content:center;
          min-height:clamp(20px,6.5cqi,34px);
          padding:clamp(3px,1cqi,6px) clamp(6px,2cqi,12px);
          border:1px solid rgba(30,22,14,0.22);
          border-radius:clamp(4px,1.2cqi,7px);
          background:rgba(255,255,255,0.16);
          color:rgba(0,0,0,0.88);
          font:700 clamp(9px,3cqi,15px)/1 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.055em;
          text-transform:uppercase;
          box-shadow:inset 0 1px 0 rgba(255,255,255,0.22);
        }

        .yat-stats-grid{
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:clamp(5px,1.7cqi,10px);
          flex:1;
          min-height:0;
        }

        .yat-stat{
          min-width:0;
          min-height:clamp(34px,10cqi,58px);
          display:flex;
          align-items:center;
          justify-content:center;
          gap:clamp(5px,1.8cqi,11px);
          padding:clamp(4px,1.4cqi,8px) clamp(5px,1.8cqi,10px);
          border:1px solid rgba(30,22,14,0.10);
          border-radius:clamp(6px,1.8cqi,10px);
          background:rgba(255,255,255,0.36);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.34),
            0 1px 2px rgba(30,22,14,0.08);
        }

        .yat-stat-label{
          flex:0 0 auto;
          color:rgba(30,22,14,0.70);
          font:400 clamp(9px,2.8cqi,15px)/1 Oswald,sans-serif;
          letter-spacing:.02em;
          text-transform:uppercase;
          white-space:nowrap;
        }

        .yat-stat-val{
          flex:0 0 auto;
          color:rgba(0,0,0,0.90);
          font:700 clamp(16px,5.6cqi,28px)/1 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.02em;
          white-space:nowrap;
        }

        /* -- Schedule panel --------------------------------------------- */
        .fz-schedule{display:flex;flex-direction:column;gap:8px}
        .fz-sched-block{display:flex;flex-direction:column;gap:3px}
        .fz-sched-pill{
          display:inline-block;
          background:rgba(30,22,14,0.08);
          border:1px solid rgba(30,22,14,0.18);
          border-radius:10px;
          padding:2px 8px;
          font:700 clamp(6px,1.8cqi,8px) Oswald,sans-serif;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:rgba(30,22,14,0.55);
          margin-bottom:1px;
        }
        .fz-sched-val{
          font:300 clamp(8px,2.5cqi,11px)/1.3 Oswald,sans-serif;
          color:rgba(30,22,14,0.85);
          padding-left:2px;
        }

        /* -- News teaser ------------------------------------------------ */
        
        .fz-news-featured{
          display:flex;
          gap:clamp(5px,1.8cqi,10px);
          align-items:flex-start;
          min-width:0;
        }
        .fz-news-thumb-link{
          flex:0 0 auto;
          text-decoration:none;
        }
        .fz-news-thumb{
          display:block;
          width:clamp(52px,18cqi,84px);
          height:clamp(72px,24cqi,118px);
          object-fit:cover;
          border-radius:clamp(4px,1cqi,8px);
          border:1px solid rgba(30,22,14,0.18);
          box-shadow:0 1px 3px rgba(0,0,0,0.12);
          background:rgba(30,22,14,0.06);
        }
        .fz-news-thumb-fallback{
          display:flex;
          align-items:center;
          justify-content:center;
          font:700 clamp(8px,2.4cqi,11px) "Bebas Neue",sans-serif;
          letter-spacing:.08em;
          color:rgba(30,22,14,0.55);
        }
        .fz-news-copy{
          display:flex;
          flex-direction:column;
          gap:4px;
          min-width:0;
          flex:1;
        }
        .fz-news-title-link{
          text-decoration:none;
        }
        .fz-news-title-link:hover .fz-news-title{
          text-decoration:underline;
        }
        .fz-news-label{
          font:700 clamp(6px,1.8cqi,8px) Oswald,sans-serif;
          letter-spacing:.1em;
          text-transform:uppercase;
          color:rgba(30,22,14,0.5);
        }
        .fz-news-title{
          font:700 clamp(10px,3.5cqi,14px)/1.2 "Bebas Neue",sans-serif;
          letter-spacing:.03em;
          color:rgba(30,22,14,0.9);
        }
        .fz-news-body{
          font:400 clamp(8px,2.5cqi,11px)/1.4 Oswald,sans-serif;
        }
        .fz-news-footer{
          font:700 clamp(6px,2cqi,9px) Oswald,sans-serif;
          letter-spacing:.06em;
          text-transform:uppercase;
          color:rgba(30,22,14,0.5);
        }


        /* -- Social panel ----------------------------------------------- */
        .fz-social{display:flex;flex-direction:column;gap:clamp(6px,2.2cqi,12px);height:100%;justify-content:center}
        .fz-social-tag{
          font:700 clamp(16px,6cqi,26px) "Bebas Neue",sans-serif;
          letter-spacing:.06em;
          color:rgba(30,22,14,0.9);
        }
        .fz-social-sub{
          font:300 clamp(9px,2.8cqi,13px) Oswald,sans-serif;
          color:rgba(30,22,14,0.65);
        }
        .fz-social-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(6px,2cqi,10px);margin-top:clamp(2px,1cqi,6px)}
        .fz-social-link{
          display:flex;
          align-items:center;
          justify-content:center;
          gap:clamp(6px,2cqi,10px);
          font:600 clamp(11px,3.4cqi,15px) Oswald,sans-serif;
          color:rgba(30,22,14,0.75);
          text-decoration:none;
          min-height:clamp(34px,11cqi,48px);
          padding:clamp(6px,1.8cqi,10px) clamp(8px,2.5cqi,12px);
          border-radius:clamp(6px,1.8cqi,10px);
          border:1px solid rgba(30,22,14,0.24);
          background:rgba(255,255,255,0.22);
        }
        .fz-social-link:hover{color:rgba(30,22,14,0.95);border-color:rgba(30,22,14,0.45);background:rgba(255,255,255,0.4)}
        .fz-social-link svg{flex-shrink:0}

        /* -- Placeholder (fallback for empty tabs) ---------------------- */
        .fz-placeholder{
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:6px;
          padding:clamp(6px,3cqi,18px) 8px;
          text-align:center;
        }
        .fz-ph-icon{font-size:clamp(14px,5cqi,26px);opacity:.25;color:rgba(30,22,14,0.7)}
        .fz-ph-text{
          font:300 clamp(7px,2.2cqi,10px)/1.45 Oswald,sans-serif;
          color:rgba(30,22,14,0.6);
          max-width:180px;
        }
        .fz-ph-text strong{font-weight:600;color:rgba(30,22,14,0.85)}
      `}</style>
    </div>
  );
}
