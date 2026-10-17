"use client";
// src/components/yatstats/FunZone.tsx
// Interactive six-tab FunZone area on the back of the player flip card.
//
// Layout order:
// 1. CTA strip - YaTi mascot on the left and speech bubble on the right.
// 2. Tab strip - six icon/label tabs in a single row.
// 3. Content panel - active tab content, no internal scroll.
//
// Tabs: Game Log | Stats | News | Social | Connect | Upload
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
import type { ReactNode } from "react";
import { installFunZoneSwipe } from "./funZoneSwipe";

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
  /**
   * Pre-rendered PlayerSevenDaySnapshot (an async Server Component) from
   * PlayerCardBack - rendered here rather than imported directly since this
   * file is a Client Component and can't itself render an async Server
   * Component, only receive one as already-rendered children/a prop.
   */
  scheduleSnapshot?: ReactNode;
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
  uuid?: string | null;
  title?: string | null;
  tease?: NewsTease | null;
  headline?: string | null;
  summary?: string | null;
  displayHeadline?: string | null;
  displayRecap?: string | null;
  displaySourceLabel?: string | null;
  publishedAt?: string | null;
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
  { id: "schedule", label: "Game Log", icon: "ri-calendar-line" },
  { id: "stats",    label: "Stats",    icon: "ri-bar-chart-2-line" },
  { id: "news",     label: "News",     icon: "ri-newspaper-line" },
  { id: "social",   label: "Social",   icon: "ri-share-line" },
  { id: "connect",  label: "Connect",  icon: "ri-group-line" },
  { id: "upload",   label: "Stories",  icon: "ri-upload-cloud-line" },
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
      return `Connect with ${firstName} through our Connect & Contribute Portal.`;
    case "upload":
      return `See and share stories about ${firstName} on his player profile page.`;
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

function SchedulePanel({ scheduleSnapshot }: { scheduleSnapshot?: ReactNode }) {
  if (!scheduleSnapshot) {
    return (
      <div className="fz-placeholder">
        <i className="ri-calendar-line fz-ph-icon" />
        <div className="fz-ph-text">Full schedule &amp; game log available on the player profile page.</div>
      </div>
    );
  }

  return <>{scheduleSnapshot}</>;
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
  const [featuredNews, setFeaturedNews] = useState<NewsTease[]>([]);
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
        const res = await fetch(`/api/news/${resolvedHsid}?player=${playerId}&limit=2`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`News fetch failed: ${res.status}`);
        }

        const data = await res.json();
const posts: NewsApiPost[] = Array.isArray(data?.posts) ? data.posts.slice(0, 2) : [];

const normalizedTeases: NewsTease[] = posts.map((post) => ({
  badge:
    post.tease?.badge ??
    (post.displaySourceLabel ? "YAT?STATS NEWS" : undefined),
  headline:
    post.tease?.headline ??
    post.displayHeadline ??
    post.headline ??
    post.title ??
    undefined,
  body:
    post.tease?.body ??
    post.displayRecap ??
    post.summary ??
    undefined,
  footer:
    post.tease?.footer ??
    ([
      post.displaySourceLabel,
      post.publishedAt
        ? new Date(post.publishedAt).toLocaleDateString("en-US", {
            month: "numeric",
            day: "numeric",
            year: "numeric",
          })
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined),
  imageUrl: post.tease?.imageUrl ?? post.imageUrl ?? undefined,
  newsCardId:
    post.tease?.newsCardId ??
    post.uuid ??
    (post.id != null ? String(post.id) : undefined),
}));

if (!cancelled) {
  setFeaturedNews(normalizedTeases);
}
      } catch (error) {
        console.error("FunZone news fetch error:", error);
        if (!cancelled) {
  setFeaturedNews([]);
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

  if (featuredNews.length === 0) {
    return (
      <div className="fz-placeholder">
        <i className="ri-newspaper-line fz-ph-icon" />
        <div className="fz-ph-text">Latest headlines available on the player profile page.</div>
      </div>
    );
  }

  const slug = String(player.slug || "");
const profileHref = `/${resolvedHsid}/player/${playerId}/${slug}#ppTab-news`;

return (
  <div className="fz-news-list">
    {featuredNews.map((story, index) => {
      const storyHref = story.newsCardId
        ? `/${resolvedHsid}/player/${playerId}/${slug}?story=${encodeURIComponent(story.newsCardId)}#ppTab-news`
        : profileHref;

      return (
        <article className="fz-news-featured" key={story.newsCardId || `${story.headline || "news"}-${index}`}>
          {story.imageUrl ? (
            <a href={storyHref} className="fz-news-thumb-link">
              <img
                src={story.imageUrl}
                alt={story.headline || "Latest news"}
                className="fz-news-thumb"
              />
            </a>
          ) : (
            <a href={storyHref} className="fz-news-thumb-link">
              <div className="fz-news-thumb fz-news-thumb-fallback">
                NEWS
              </div>
            </a>
          )}

          <div className="fz-news-copy">
            {story.badge && (
              <div className="fz-news-label">{story.badge}</div>
            )}

            {story.headline && (
              <a href={storyHref} className="fz-news-title-link">
                <div className="fz-news-title">{story.headline}</div>
              </a>
            )}

            {story.body && (
              <div className="fz-news-body">{story.body}</div>
            )}

            {story.footer && (
              <div className="fz-news-footer">{story.footer}</div>
            )}
          </div>
        </article>
      );
    })}
  </div>
);
}
// Facebook's sharer.php no longer accepts pre-filled text/tags at all
// (deprecated for spam reasons around 2018) - a Facebook share can only
// carry the URL itself, whose link preview then comes from that page's own
// Open Graph tags, so the @handle below only actually "tags" YAT?STATS on
// X, where it's a plain mention inside the tweet text.
const YAT_STATS_X_HANDLE = "yat_stats";


type SocialIconKind = "facebook" | "x" | "instagram" | "text" | "email" | "copy" | "check";
// All share actions use a consistent, unbadged and self-contained vector mark.
function SocialActionIcon({ kind }: { kind: SocialIconKind }) {
  if (kind === "facebook") return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M14.4 21v-7.9h2.66l.4-3.12H14.4V8c0-.91.25-1.53 1.54-1.53h1.64V3.68a22.6 22.6 0 0 0-2.39-.12c-2.38 0-4.01 1.45-4.01 4.12v2.3H8.5v3.12h2.68V21h3.22Z" /></svg>
  );
  if (kind === "x") return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M17.5 3H21l-7.5 8.57L22.2 21h-6.78l-5.32-6.95L4 21H.5l8.04-9.18L.2 3h6.95l4.82 6.35L17.5 3Zm-1.2 16.36h1.88L6.12 4.55H4.1L16.3 19.36Z" /></svg>
  );
  if (kind === "instagram") return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.4" cy="6.7" r=".9" fill="currentColor" stroke="none" /></svg>
  );
  if (kind === "text") return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 15.7a3 3 0 0 1-3 3H9l-4.5 3v-4.2a3 3 0 0 1-2-2.8V6.5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9.2Z" /><path d="M7 9h9M7 13h6" /></svg>
  );
  if (kind === "email") return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
  );
  if (kind === "check") return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 12.5 5 5 10-11" /></svg>
  );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
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

  // Some school records already include "High School" in their names.
  // Length tiers are computed on the server too for unhydrated favorite cards.
  const schoolBase = schoolName.trim();
  const schoolFullName = !schoolBase ? "" :
    /(?:high school|secondary school|preparatory school|prep school|academy)$/i.test(schoolBase)
      ? schoolBase : `${schoolBase} High School`;
  const nameClass = fullName.length > 38 ? " fz-social-name-longest" :
    fullName.length > 26 ? " fz-social-name-long" : "";
  const schoolClass = schoolFullName.length > 58 ? " fz-social-school-longest" :
    schoolFullName.length > 35 ? " fz-social-school-long" : "";

  const shareText =
    schoolName && formattedLocation
      ? [
          `Hey Alumni of ${schoolFullName} in ${formattedLocation}...`,
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

  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fullPostText = `${shareText}\n${shareUrl}`;

  function handleCopyPost() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(fullPostText).then(() => {
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }


  return (
    <div className="fz-social">
      <div className="fz-social-bar">
        <span className="fz-social-bar-label">SHARE THE JOURNEY</span>
        <span className="fz-social-hashtag" title={"#" + hashtag}>#{hashtag}</span>
      </div>
      <div className="fz-social-grid">
        <div className="fz-social-message-cell">
          <span className="fz-social-kicker">ALUMNI SPOTLIGHT</span>
          <strong className={"fz-social-player-name" + nameClass} title={fullName}>{fullName}</strong>
          {schoolFullName ? <span className={"fz-social-school" + schoolClass} title={schoolFullName}>{schoolFullName}</span> : null}
          {formattedLocation ? <span className="fz-social-location">{formattedLocation}</span> : null}
          <p className="fz-social-message-text">See where they <strong>YAT</strong> now. Share the story.</p>
        </div>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fz-social-cell"
          aria-label="Share on Facebook"
        >
          <SocialActionIcon kind="facebook" />
          <span className="fz-social-action-label">Facebook</span>
        </a>
        <a
          href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fz-social-cell"
          aria-label="Share on X"
        >
          <SocialActionIcon kind="x" />
          <span className="fz-social-action-label">X</span>
        </a>
        {/* A real <a href>, not a button+window.open - Instagram has no web
            share/compose intent, so this just opens the app/site the same
            way Facebook/X's plain links do (works via plain navigation with
            zero JS, including on a cross-school card that never hydrates).
            The onClick copy-to-clipboard is a bonus that only fires where
            React did mount; data-copy-text covers the non-hydrated case via
            attachFunZoneShareListener. Grouped with Facebook/X (the actual
            social platforms) on the top row, ahead of the plain-utility
            actions below. */}
        <a
          href="https://www.instagram.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="fz-social-cell"
          data-copy-text={fullPostText}
          onClick={handleCopyPost}
          aria-label="Copy caption and open Instagram"
        >
          <SocialActionIcon kind="instagram" />
          <span className="fz-social-action-label">Instagram</span>
        </a>
        <a href={`sms:?&body=${encodedSmsBody}`} className="fz-social-cell" aria-label="Share by text">
          <SocialActionIcon kind="text" />
          <span className="fz-social-action-label">Text</span>
        </a>
        <a
          href={`mailto:?subject=${encodedEmailSubject}&body=${encodedSmsBody}`}
          className="fz-social-cell"
          aria-label="Share by email"
        >
          <SocialActionIcon kind="email" />
          <span className="fz-social-action-label">Email</span>
        </a>
        <button
          type="button"
          className={`fz-social-cell fz-social-cell-primary${copied ? " copied" : ""}`}
          data-copy-text={fullPostText}
          onClick={handleCopyPost}
          aria-label={copied ? "Copied" : "Copy post text"}
        >
          <SocialActionIcon kind={copied ? "check" : "copy"} />
          <span className="fz-social-action-label">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}

// Not a dynamic layout - the whole panel is the approved Connect &
// Contribute Portal graphic (the exact "Coming Soon" design that was signed off
// on), used as-is as one big graphic button linking to the marketplace
// section on the profile page. No per-player text, no responsive
// typography to fit into the fixed card height - just the image.
function ConnectPanel({ profileHref }: { profileHref: string }) {
  return (
    <a className="fz-connect" href={profileHref} aria-label="Learn more about the Connect & Contribute Portal">
      <img
        src="/img/connect-contribute-coming-soon.jpg"
        alt="Connect & Contribute Portal - Coming Soon. Real Players. Real Conversations. A Brighter Tomorrow."
        className="fz-connect-graphic"
      />
    </a>
  );
}

// The Stories tab: what the Career Path timeline is, and a link to the
// profile page, where the stories and the upload live.
function UploadPanel({ player, profileHref }: { player: Record<string, unknown>; profileHref: string }) {
  const firstName = String(player.firstname || player.first_name || "").split(" ")[0] || "this player";
  return (
    <a className="fz-placeholder" href={profileHref}>
      <i className="ri-upload-cloud-line fz-ph-icon" />
      <div className="fz-ph-text">
        Photos and memories fans share about {firstName} appear on his{" "}
        <strong>Career Path timeline</strong>, placed by year, and in the{" "}
        <strong>Stories</strong> tab of his player profile page.
      </div>
    </a>
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
  scheduleSnapshot,
}: FunZoneProps) {
  const [activeTab, setActiveTab] = useState<TabId>("stats");
  const [activeStatsIndex, setActiveStatsIndex] = useState(0);
  // Swipe left/right on the card back to change tab (one listener for the
  // whole page, installed by whichever card mounts first).
  useEffect(() => installFunZoneSwipe(), []);
  const resolvedStatBuckets =
    statBuckets && statBuckets.length > 0
      ? statBuckets
      : [{ label: statBarLabel, stats }];
  const activeStatsBucket = resolvedStatBuckets[Math.min(activeStatsIndex, resolvedStatBuckets.length - 1)];

  // Reset during render (not in an effect) when the bucket count changes,
  // to avoid the extra render pass a useEffect-based reset would cause.
  const [prevStatBucketsLength, setPrevStatBucketsLength] = useState(resolvedStatBuckets.length);
  if (resolvedStatBuckets.length !== prevStatBucketsLength) {
    setPrevStatBucketsLength(resolvedStatBuckets.length);
    setActiveStatsIndex(0);
  }

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
  //
  // A share should land back on THIS card (the school roster page,
  // scrolled/highlighted to this player), not the separate full profile
  // page - YatInteractivity.tsx's revealRequestedPlayerCard() already does
  // exactly that, matching the same ?view=<section>&player=<id>#player-<id>
  // pattern already used elsewhere (FavoritesDrawer/ProfilePageEnhancer/
  // SearchDrawerTabs) to deep-link into a card. ?player= (not just the
  // #hash) is required because getRequestedPlayerId() reads it as the
  // primary signal and only falls back to the hash if it's missing - and a
  // #hash alone never reaches the server, so link-preview crawlers
  // (Facebook, iMessage, SMS) could never see it to build the player-
  // specific preview image below. view= must match the section this card
  // actually lives in (active vs. all-time), or retryRevealRequestedPlayerCard()
  // switches to the wrong section and the card is never found. "name" is
  // along for the human-readable URL only (ignored by the lookup, which is
  // by id) - the trailing #player-<id> hash is redundant with ?player= for
  // the script's own logic, but lets the browser jump straight to the card
  // via native same-page anchor behavior even before any JS has run.
  const shareUrl = `${shareBaseUrl || `https://yatstats.com/${resolvedHsid}`}/?view=${isAllTime ? "alltime" : "active"}&player=${encodeURIComponent(imageId)}${slug ? `&name=${encodeURIComponent(slug)}` : ""}#player-${encodeURIComponent(imageId)}`;
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
        <SchedulePanel scheduleSnapshot={scheduleSnapshot} />
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
        <ConnectPanel profileHref={profileHref} />
      </div>
      <div
        className={`fz-panel${activeTab === "upload" ? " fz-panel-active" : ""}`}
        data-fz-tab="upload"
      >
        <UploadPanel player={player} profileHref={profileHref} />
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

        /* -- News teaser ------------------------------------------------ */
        
        .fz-news-list{
          display:flex;
          flex-direction:column;
          gap:clamp(5px,1.3cqi,8px);
          width:100%;
          min-width:0;
        }
        .fz-news-featured{
          display:flex;
          gap:clamp(5px,1.8cqi,10px);
          align-items:flex-start;
          min-width:0;
          padding:clamp(5px,1.45cqi,8px);
          border:1px solid rgba(30,22,14,.18);
          border-radius:clamp(5px,1.4cqi,8px);
          background:rgba(255,255,255,.18);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.22);
        }
        .fz-news-thumb-link{
          flex:0 0 auto;
          text-decoration:none;
        }
        .fz-news-thumb{
          display:block;
          width:clamp(44px,15cqi,68px);
          height:clamp(58px,19cqi,88px);
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
          gap:clamp(2px,.7cqi,4px);
          min-width:0;
          flex:1;
          justify-content:flex-start;
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
          font:700 clamp(9px,3cqi,13px)/1.12 "Bebas Neue",sans-serif;
          letter-spacing:.03em;
          color:rgba(30,22,14,0.9);
        }
        .fz-news-body{
          font:400 clamp(7px,2.15cqi,10px)/1.35 var(--yat-news-font);
          color:rgba(30,22,14,.82);
          display:-webkit-box;
          -webkit-line-clamp:2;
          -webkit-box-orient:vertical;
          overflow:hidden;
        }
        .fz-news-footer{
          font:700 clamp(6px,2cqi,9px) Oswald,sans-serif;
          letter-spacing:.06em;
          text-transform:uppercase;
          color:rgba(30,22,14,0.5);
        }


        /* Social-only responsive redesign. Uses the same two fonts as
           Connect & Contribute; no styling bleeds into the Stats tab. */
        .fz-social {
          display:flex; flex-direction:column; width:100%; height:100%;
          min-height:0; gap:clamp(4px,1.2cqi,8px);
          color:#233c31; font-family:var(--yat-font-ui,Archivo,Arial,sans-serif);
        }
        .fz-social-bar {
          min-width:0; min-height:clamp(21px,6cqi,33px); flex:0 0 auto;
          display:flex; align-items:center; justify-content:space-between;
          gap:clamp(4px,1.5cqi,8px); padding:clamp(4px,1.2cqi,7px) clamp(7px,2cqi,12px);
          background:#193c31; color:#fffaf0; border-radius:clamp(4px,1.2cqi,8px);
        }
        .fz-social-bar-label {
          flex:0 1 auto; min-width:0; white-space:nowrap;
          font:800 clamp(9px,2.7cqi,14px)/1.1 var(--yat-font-compact,"Barlow Condensed",sans-serif);
          letter-spacing:.06em;
        }
        .fz-social-hashtag {
          flex:0 1 auto; min-width:0; max-width:52%;
          white-space:nowrap; text-align:right; overflow:hidden;
          text-overflow:ellipsis; color:#f2d48a;
          font:700 clamp(8px,2.25cqi,12px)/1.1 var(--yat-font-ui,Archivo,Arial,sans-serif);
          letter-spacing:-.02em;
        }
        .fz-social-grid {
          display:grid; width:100%; min-width:0; min-height:0; flex:1;
          grid-template-columns:repeat(3,minmax(0,1fr));
          grid-template-rows:minmax(0,1.7fr) repeat(2,minmax(0,1fr));
          gap:clamp(4px,1.4cqi,9px);
        }
        .fz-social-message-cell {
          grid-column:1/-1; grid-row:1;
          display:flex; flex-direction:column; justify-content:center;
          align-items:flex-start; min-width:0; min-height:0; overflow:hidden;
          gap:clamp(2px,.7cqi,5px); padding:clamp(7px,2cqi,14px);
          background:rgba(255,252,244,.84);
          border:1px solid rgba(31,49,39,.16);
          border-left:clamp(3px,.8cqi,5px) solid #bd9141;
          border-radius:clamp(5px,1.4cqi,10px);
        }
        .fz-social-kicker {
          flex:0 0 auto; color:#8c6b32; letter-spacing:.12em;
          font:800 clamp(8px,2.3cqi,12px)/1.1 var(--yat-font-compact,"Barlow Condensed",sans-serif);
        }
        .fz-social-player-name {
          display:block; min-width:0; max-width:100%; color:#142c22;
          font:800 clamp(12px,4.5cqi,23px)/1.1 var(--yat-font-ui,Archivo,Arial,sans-serif);
          letter-spacing:-.04em; overflow-wrap:anywhere; text-wrap:balance;
        }
        .fz-social-player-name.fz-social-name-long {
          font-size:clamp(10px,3.7cqi,19px);
        }
        .fz-social-player-name.fz-social-name-longest {
          font-size:clamp(9px,3.05cqi,16px);
        }
        .fz-social-school {
          display:block; min-width:0; max-width:100%; color:#454d43;
          font:700 clamp(9px,2.85cqi,14px)/1.1 var(--yat-font-compact,"Barlow Condensed",sans-serif);
          letter-spacing:.015em; overflow-wrap:anywhere;
        }
        .fz-social-school.fz-social-school-long {
          font-size:clamp(8px,2.45cqi,12px);
        }
        .fz-social-school.fz-social-school-longest {
          font-size:clamp(7px,2.15cqi,11px);
        }
        .fz-social-location {
          color:#69736c; font:500 clamp(8px,2cqi,11px)/1.1 var(--yat-font-ui,Archivo,Arial,sans-serif);
          overflow-wrap:anywhere;
        }
        .fz-social-message-text {
          margin:clamp(1px,.6cqi,4px) 0 0; color:#606b62;
          font:500 clamp(9px,2.2cqi,12px)/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif);
        }
        .fz-social-message-text strong { color:#193c31; font-weight:800; }
        .fz-social-cell {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:clamp(2px,.7cqi,5px); min-width:0; min-height:0;
          padding:clamp(3px,.9cqi,7px) 2px;
          border:1px solid rgba(35,61,47,.22);
          border-radius:clamp(5px,1.5cqi,9px);
          background:rgba(255,253,248,.77);
          color:#254537; text-decoration:none; cursor:pointer;
          transition:background-color .12s ease,border-color .12s ease;
        }
        .fz-social-cell svg {
          display:block; flex:0 0 auto; width:clamp(16px,5.2cqi,28px);
          height:clamp(16px,5.2cqi,28px);
        }
        .fz-social-action-label {
          display:block; max-width:100%; overflow:hidden; white-space:nowrap;
          text-overflow:ellipsis; color:inherit;
          font:700 clamp(8px,2.05cqi,11px)/1.1 var(--yat-font-ui,Archivo,Arial,sans-serif);
          letter-spacing:-.025em;
        }
        .fz-social-cell:hover {
          background:#fffdf8; border-color:rgba(25,60,49,.65); text-decoration:none;
        }
        .fz-social-cell:focus-visible { outline:2px solid #246b4e; outline-offset:-2px; }
        .fz-social-cell-primary {
          background:#193c31; color:#fff9ef; border-color:#193c31;
        }
        .fz-social-cell-primary:hover { background:#275944; color:#fff; }
        .fz-social-cell-primary.copied { background:#287247; border-color:#287247; }
        @container yat-back (max-width:390px) {
          .fz-social-message-text { display:none; }
          .fz-social-message-cell { gap:clamp(2px,.5cqi,4px); }
        }
        @container yat-back (max-width:300px) {
          .fz-social-kicker,.fz-social-location { display:none; }
          .fz-social-grid { gap:3px; }
          .fz-social-message-cell { padding:4px 6px; }
          .fz-social-bar { gap:3px; }
          .fz-social-cell { gap:1px; }
        }

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
        a.fz-placeholder{text-decoration:none;color:inherit;height:100%}
        .fz-ph-icon{font-size:clamp(14px,5cqi,26px);opacity:.25;color:rgba(30,22,14,0.7)}
        .fz-ph-text{
          font:300 clamp(7px,2.2cqi,10px)/1.45 Oswald,sans-serif;
          color:rgba(30,22,14,0.6);
          max-width:180px;
        }
        .fz-ph-text strong{font-weight:600;color:rgba(30,22,14,0.85)}

        /* -- Connect / Connect & Contribute Portal panel ---------------------- */
        /* One big graphic button - no dynamic text, no responsive type. */
        .fz-connect{
          display:block;
          width:100%;
          height:100%;
        }
        .fz-connect-graphic{
          display:block;
          width:100%;
          height:100%;
          object-fit:contain;
        }
      `}</style>
    </div>
  );
}
