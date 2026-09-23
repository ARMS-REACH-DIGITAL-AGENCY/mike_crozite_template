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
  { id: "schedule", label: "Game Log", icon: "ri-calendar-line" },
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

// Each icon below is a complete, self-contained app-icon badge (rounded-
// square background baked in, not a thin outline meant to inherit a
// surrounding button's color) - a fan recognizes "the blue Facebook square"
// and "the black X square" as icons in their own right, so the badge IS
// the icon rather than a generic glyph sitting inside one.
function FacebookIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#1877F2" />
      <path
        d="M25.5 20.5H22v11h-4.5v-11H14.8v-3.8H17.5v-2.4c0-3.1 1.5-5.6 5.4-5.6 1.6 0 2.8.2 2.8.2v3.7h-1.6c-1.5 0-2.1.9-2.1 2v2.1h3.6l-.5 3.8Z"
        fill="#fff"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#000" />
      <path
        d="M11 11h4.9l4.4 6 4.9-6H29l-7.4 8.9L29.4 29h-4.9l-5-6.6-5.5 6.6H10l7.9-9.4L11 11Z"
        fill="#fff"
      />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#fff" stroke="rgba(30,22,14,0.18)" />
      <path
        d="M9 13.5A3.5 3.5 0 0 1 12.5 10h15A3.5 3.5 0 0 1 31 13.5v7A3.5 3.5 0 0 1 27.5 24H18l-5.2 4v-4h-.3A3.5 3.5 0 0 1 9 20.5v-7Z"
        fill="#2E7DF7"
      />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#1266C4" />
      <rect x="9" y="12" width="22" height="16" rx="2.5" fill="#fff" />
      <path d="m10 13.5 10 7.5 10-7.5" stroke="#1266C4" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <defs>
        <radialGradient id="igGrad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="30%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="100%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect width="40" height="40" rx="9" fill="url(#igGrad)" />
      <rect x="10" y="10" width="20" height="20" rx="6" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="20" cy="20" r="5" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="26" cy="14" r="1.4" fill="#fff" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#fff" stroke="rgba(30,22,14,0.18)" />
      <rect x="16" y="16" width="15" height="15" rx="2.5" fill="none" stroke="#1a1208" strokeWidth="2" />
      <path d="M24 16v-4a2 2 0 0 0-2-2H11a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h4" fill="none" stroke="#1a1208" strokeWidth="2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#1c7a3e" />
      <path d="m11 21 6 6 12-13" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
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

  // Same copy as shareText above, just as JSX with the @handle/#YAT/#STATS
  // tokens pulled into their own spans for the accent color - kept as a
  // second, parallel construction (rather than parsing shareText with a
  // regex) so the plain-text version used for the actual share links can
  // never drift from what's visually shown here as "the message that's
  // going to be posted."
  const messageLines: ReactNode[] =
    schoolName && formattedLocation
      ? [
          <span key="l1">Hey Alumni of {schoolName} High School in {formattedLocation}...</span>,
          <span key="l2">
            Do you ever wonder what became of one of your school&apos;s best baseball players like{" "}
            {fullName}?
          </span>,
          <span key="l3">
            Visit <b className="fz-social-accent">@{YAT_STATS_X_HANDLE}</b> to find out Where They{" "}
            <b className="fz-social-accent">#YAT</b> and What&apos;s Their{" "}
            <b className="fz-social-accent">#STATS</b>!
          </span>,
          <b className="fz-social-accent" key="l4">
            #{hashtag}
          </b>,
        ]
      : [
          <span key="l1">Check out {fullName}&apos;s YAT?STATS player card!</span>,
          <span key="l2">
            Where They <b className="fz-social-accent">#YAT</b> and What&apos;s Their{" "}
            <b className="fz-social-accent">#STATS</b>! <b className="fz-social-accent">#{hashtag}</b>
          </span>,
        ];

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(shareText);
  const encodedSmsBody = encodeURIComponent(`${shareText}\n${shareUrl}`);
  const encodedEmailSubject = encodeURIComponent(`Check out ${fullName} on YAT?STATS`);

  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function copyPostToClipboard() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).then(() => {
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  // Instagram has no web share-intent URL (unlike Facebook's sharer.php or
  // X's intent/tweet) - it deliberately blocks pre-filled sharing via link
  // for spam reasons. navigator.share hands off to the OS share sheet
  // (Instagram included, on a phone that has it installed); where that
  // isn't available (most desktop browsers), fall back to the same
  // copy-to-clipboard so the fan can paste the post into Instagram
  // themselves.
  function handleInstagramShare() {
    if (navigator.share) {
      navigator.share({ text: shareText, url: shareUrl }).catch(() => {});
      return;
    }
    copyPostToClipboard();
  }

  return (
    <div className="fz-social">
      <img className="fz-social-deco" src="/img/social-yat-badge.png" alt="" aria-hidden="true" />

      <div className="fz-social-headline">
        <span className="fz-social-tag">#{hashtag}</span>
        <svg className="fz-social-headline-underline" viewBox="0 0 160 16" preserveAspectRatio="none" aria-hidden="true">
          <path d="M3 11 C 20 6, 45 13, 70 8 S 120 4, 155 9" fill="none" stroke="#2451c9" strokeWidth="7" strokeLinecap="round" />
        </svg>
      </div>

      <div className="fz-social-message">
        {messageLines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        <p className="fz-social-message-url">{shareUrl.replace(/^https?:\/\//, "")}</p>
      </div>

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
        <button type="button" className="fz-social-link" onClick={handleInstagramShare}>
          <InstagramIcon />
          <span>Instagram</span>
        </button>
        <a href={`mailto:?subject=${encodedEmailSubject}&body=${encodedSmsBody}`} className="fz-social-link">
          <EmailIcon />
          <span>Email</span>
        </a>
        <a href={`sms:?&body=${encodedSmsBody}`} className="fz-social-link">
          <TextIcon />
          <span>Text</span>
        </a>
        <button
          type="button"
          className={`fz-social-link${copied ? " copied" : ""}`}
          onClick={copyPostToClipboard}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}

// The Connect tab's whole "Coming Soon" pitch (headline, tagline, body copy,
// three feature rows, CTA, footer line) is a single designed graphic, not
// separately-coded text - a prior attempt to rebuild it as live HTML had to
// silently trim the body paragraph and footer tagline because they didn't
// fit the card's fixed aspect-ratio face. Rendering it as one image with
// object-fit:contain sidesteps that entirely: the graphic scales to
// whatever space is actually available instead of overflowing or getting
// clipped, and the whole thing is one big tappable button to the profile
// page's Connect tab.
function ConnectPanel({ profileHref }: { profileHref: string }) {
  return (
    <a className="fz-connect" href={profileHref}>
      <img
        src="/img/connect-mentorship-marketplace.png"
        alt="Mentorship Marketplace - Coming Soon. Real Players. Real Conversations. A Brighter Tomorrow."
        className="fz-connect-graphic"
      />
    </a>
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
  scheduleSnapshot,
}: FunZoneProps) {
  const [activeTab, setActiveTab] = useState<TabId>("stats");
  const [activeStatsIndex, setActiveStatsIndex] = useState(0);
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
  // The link lands on the school's roster page (not the profile page) and
  // scrolls to this player's own card there, matching the same
  // ?view=<section>&player=<id>#player-<id> pattern already used to deep-
  // link into a card from FavoritesDrawer/ProfilePageEnhancer/SearchDrawerTabs.
  // ?player= is required (not just the #hash) because YatInteractivity's
  // getRequestedPlayerId() reads it as the primary signal and only falls
  // back to the hash if it's missing - and a #hash alone never reaches the
  // server, so it can't drive a future personalized share-preview image.
  // view must match the section this card actually lives in, or
  // retryRevealRequestedPlayerCard() switches to the wrong section and the
  // card is never found - an all-time/career card shared from here would
  // silently fail to reveal if this always said view=active.
  const shareUrl = `${shareBaseUrl || `https://yatstats.com/${resolvedHsid}`}?view=${isAllTime ? "alltime" : "active"}&player=${imageId}#player-${imageId}`;
  const ctaText = getCta(activeTab, firstName);

  // Suppress unused-variable warnings for props used only in sub-panels
  void isPitcher;

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
        .fz-social{
          position:relative;
          display:flex;
          flex-direction:column;
          justify-content:center;
          height:100%;
          gap:clamp(3px,1.1cqi,7px);
        }
        /* Cropped from the approved "#YATABOY" mockup graphic (just the
           hand-scribbled "YAT!" mark, not the "#YATABOY" heading itself -
           that stays live text in .fz-social-tag below so it can carry any
           player's name/length instead of a fixed baked-in word).
           mix-blend-mode:multiply drops the graphic's own flat background
           out against the card's cardboard texture, so it reads as an inked
           watermark rather than a pasted rectangle. */
        .fz-social-deco{
          position:absolute;
          top:clamp(2px,1cqi,6px);
          right:clamp(2px,1cqi,6px);
          width:clamp(46px,19cqi,86px);
          height:auto;
          opacity:.5;
          mix-blend-mode:multiply;
          pointer-events:none;
        }
        .fz-social-headline{
          display:flex;
          flex-direction:column;
          gap:2px;
        }
        .fz-social-tag{
          font:700 clamp(16px,6.5cqi,26px) "Bebas Neue",sans-serif;
          letter-spacing:.04em;
          color:rgba(30,22,14,0.94);
          line-height:1;
        }
        /* A wavy stroked path, not a flat skewed bar - reads as a brush
           swash instead of a straight-ruled underline. */
        .fz-social-headline-underline{
          display:block;
          width:min(150px,58%);
          height:clamp(6px,2.2cqi,11px);
          overflow:visible;
        }
        .fz-social-message{
          display:flex;
          flex-direction:column;
          gap:1px;
          padding-right:clamp(22px,7cqi,40px);
        }
        .fz-social-message p{
          margin:0;
          font:600 clamp(7.5px,2.3cqi,10.5px)/1.35 Oswald,sans-serif;
          color:rgba(30,22,14,0.85);
        }
        .fz-social-message-url{
          color:rgba(30,22,14,0.5) !important;
          word-break:break-all;
        }
        .fz-social-accent{ color:#2451c9; font-weight:700; }
        /* 3x2 grid: Facebook / X / Instagram, Email / Text / Copy - Copy
           used to be its own full-width button above this grid; folded in
           here as a 6th tile so it reads as one consistent set of share
           actions instead of one button styled differently from the rest.
           Each icon is its own complete app-icon badge (see the icon
           components above) - no extra button chrome (border/background)
           around it, same as how real app icons sit on a home screen. */
        .fz-social-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(4px,1.4cqi,8px);margin-top:2px}
        .fz-social-link{
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:clamp(2px,.8cqi,4px);
          font:700 clamp(6.5px,2cqi,9px) Oswald,sans-serif;
          letter-spacing:.02em;
          color:rgba(30,22,14,0.8);
          text-decoration:none;
          background:none;
          border:none;
          padding:0;
          cursor:pointer;
        }
        .fz-social-link svg{
          width:clamp(26px,9cqi,40px);
          height:clamp(26px,9cqi,40px);
          flex-shrink:0;
          filter:drop-shadow(0 1px 2px rgba(0,0,0,0.18));
        }
        .fz-social-link:hover svg{ filter:drop-shadow(0 1px 3px rgba(0,0,0,0.3)) brightness(1.05); }
        .fz-social-link.copied{ color:#1c7a3e; }

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

        /* -- Connect / Mentorship Marketplace panel ---------------------- */
        /* One designed graphic, not coded text - see the comment on
           ConnectPanel. object-fit:contain scales it to whatever space is
           actually available instead of overflowing the fixed card face. */
        .fz-connect{
          display:flex;
          align-items:center;
          justify-content:center;
          height:100%;
          width:100%;
          text-decoration:none;
        }
        .fz-connect-graphic{
          max-width:100%;
          max-height:100%;
          width:auto;
          height:auto;
          object-fit:contain;
          border-radius:clamp(4px,1.2cqi,8px);
        }
        .fz-connect:hover .fz-connect-graphic{ filter:brightness(1.03); }
      `}</style>
    </div>
  );
}
