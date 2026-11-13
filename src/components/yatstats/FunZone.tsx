"use client";
import "./FunZone.css";
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
import SevenDaySnapshotView from "./SevenDaySnapshotView";
import {openWhereYatNow} from "./WhereYatNowDrawer";
import {auth} from "@/lib/firebase";
import {onAuthStateChanged} from "firebase/auth";
import WhereYatFunZonePanel from "./WhereYatFunZonePanel";
import { parseNewsVideo } from "@/lib/newsVideo";
import { PLAYER_SILHOUETTE_URL } from "@/lib/playerImage";
import { whereYatCardHeading } from "@/lib/whereYatPrompts";

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
  family?: "batting" | "pitching";
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
  lazySchedulePlayerId?: string;
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
  url?: string | null;
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
      return `Request a personalized video message from ${firstName} through YAT-A-BOY Player Connect.`;
    case "upload":
      return `See ${firstName}\u0027s career path timeline and share your own memories.`;
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
        const res = await fetch(`/api/news/${resolvedHsid}?player=${playerId}&limit=3&sort=newest`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`News fetch failed: ${res.status}`);
        }

        const data = await res.json();
const posts: NewsApiPost[] = Array.isArray(data?.posts) ? data.posts.slice(0, 3) : [];

const normalizedTeases: NewsTease[] = posts.map((post) => ({
  badge:
    post.tease?.badge ??
    (post.displaySourceLabel ? "YAT?STATS NEWS" : undefined),
  headline:
    post.displayHeadline ??
    post.tease?.headline ??
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
  imageUrl: (post.url ? parseNewsVideo(post.url)?.thumbnailUrl : null) || post.tease?.imageUrl || post.imageUrl || undefined,
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

  const slug = String(player.slug || "");
  const profileHref = `/${resolvedHsid}/player/${playerId}/${slug}#ppTab-news`;
  const tipsHref = `/${encodeURIComponent(resolvedHsid)}/connect-contribute?contribute=tip&playerId=${encodeURIComponent(playerId)}`;
  const newsSlots = Array.from({ length: Math.max(0, 3 - featuredNews.length) }, (_, index) => index);

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
                onError={(event) => {
                  const image = event.currentTarget;
                  if (!image.src.endsWith(PLAYER_SILHOUETTE_URL)) image.src = PLAYER_SILHOUETTE_URL;
                  else image.style.visibility = "hidden";
                }}
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
    {newsSlots.map((index) => (
      <a key={`news-tip-${index}`} href={tipsHref} className="fz-news-featured fz-news-tip" aria-label="Submit a news tip about this player">
        <span className="fz-news-thumb fz-news-tip-icon"><i className="ri-newspaper-line" aria-hidden="true" /></span>
        <span className="fz-news-copy">
          <span className="fz-news-label">CLIPS &amp; TIPS</span>
          <span className="fz-news-title">HAVE A NEWS TIP ABOUT {String(player.firstname || player.first_name || player.display_name || 'THIS PLAYER').split(' ')[0]}?</span>
          <span className="fz-news-body">Help us tell their story.</span>
          <span className="fz-news-footer">SHARE A NEWS TIP</span>
        </span>
      </a>
    ))}
  </div>
);
}
// Facebook's sharer.php no longer accepts pre-filled text/tags at all
// (deprecated for spam reasons around 2018) - a Facebook share can only
// carry the URL itself, whose link preview then comes from that page's own
// Open Graph tags, so the @handle below only actually "tags" YAT?STATS on
// X, where it's a plain mention inside the tweet text.
const YAT_STATS_X_HANDLE = "yat_stats";

// Facebook, X, and Instagram are complete, self-contained app-icon badges
// (rounded-square background baked in) - a fan recognizes "the blue
// Facebook square" and "the black X square" as icons in their own right.
// Copy/mail/text have no badge of their own - the .fz-social-cell they sit
// in already supplies a border/background matching the Stats tab's cells,
// so a second background here would just double up on it.
// Each non-badge glyph is scaled down and recentered to roughly the same
// ~50%-of-canvas footprint as InstagramIcon's own camera mark, and the
// Facebook/X marks are similarly inset within their badges - the real
// brand marks are drawn edge-to-edge in their official artwork, which
// reads as "blown up" once every icon sits in the same cell size.
const GLYPH_INSET_TRANSFORM = "translate(20 20) scale(0.55) translate(-20 -20)";

// Copy/mail/text have no colored badge behind them, so their glyph IS all
// the visible "ink" - drawn up close to the canvas edges (rather than
// InstagramIcon's own inset camera mark) so they read as just as big as
// the top row's full-bleed badges instead of a small outline floating in
// empty space.
const UTILITY_GLYPH_ENLARGE_TRANSFORM = "translate(20 20) scale(1.5) translate(-20 -20)";

function FacebookIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#1877F2" />
      <path
        transform="translate(13.2 9) scale(0.043)"
        d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z"
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
        transform="translate(9.23 9) scale(0.01793)"
        d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z"
        fill="#fff"
      />
    </svg>
  );
}

// Copy/mail/text share no colored badge - the cell itself already supplies
// the border/background (matching the Stats tab's cells), so a second
// background here would just double up on it.
function TextIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <g transform={UTILITY_GLYPH_ENLARGE_TRANSFORM}>
        <path
          d="M9 13.5A3.5 3.5 0 0 1 12.5 10h15A3.5 3.5 0 0 1 31 13.5v7A3.5 3.5 0 0 1 27.5 24H18l-5.2 4v-4h-.3A3.5 3.5 0 0 1 9 20.5v-7Z"
          fill="#2E7DF7"
        />
      </g>
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <g transform={UTILITY_GLYPH_ENLARGE_TRANSFORM}>
        <rect x="9" y="12" width="22" height="16" rx="2.5" fill="none" stroke="#1266C4" strokeWidth="2" />
        <path d="m10 13.5 10 7.5 10-7.5" stroke="#1266C4" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
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
      <g transform={UTILITY_GLYPH_ENLARGE_TRANSFORM}>
        <rect x="16" y="16" width="15" height="15" rx="2.5" fill="none" stroke="#1a1208" strokeWidth="2" />
        <path d="M24 16v-4a2 2 0 0 0-2-2H11a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h4" fill="none" stroke="#1a1208" strokeWidth="2" />
      </g>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#1c7a3e" />
      <g transform={GLYPH_INSET_TRANSFORM}>
        <path d="m11 21 6 6 12-13" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
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

  // Keep the school name accurate whether the database stores "Perry" or
  // "Perry High School" (never append "High School" twice).
  const schoolLabel = schoolName.trim().toLowerCase().endsWith("high school")
    ? schoolName.trim()
    : `${schoolName.trim()} High School`;
  const shareText =
    schoolName && formattedLocation
      ? [
          `Hey Alumni of ${schoolLabel} in ${formattedLocation}...`,
          `Do you ever wonder what became of one of your school's best baseball players, like ${fullName}?`,
          `Visit @${YAT_STATS_X_HANDLE} to find out.`,
          "Where They YAT? Stories & Stats.",
          `#${hashtag}`,
        ].join("\n")
      : `Where They YAT? Stories & Stats. Follow ${fullName}'s career on YAT?STATS. #${hashtag}`;

  // What fans see in the Social tab is the actual text that gets shared.
  // Only highlight the brand mention and personalized hashtag.
  const messageNodes: ReactNode[] = shareText
    .split(/(@yat_stats|#YATABOY[A-Za-z0-9]*)/gi)
    .map((part, index) =>
      /^(?:@yat_stats|#YATABOY)/i.test(part)
        ? <b className="fz-social-accent" key={index}>{part}</b>
        : part
    );

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
      {/* Same bar treatment as the Stats tab's "2026 SEASON" header
          (.yat-stats-bar) - a dedicated, identically-styled class rather
          than that literal class, so a Social-only tweak here can never
          bleed into the Stats tab's own bar (the same reason the action
          grid below has its own class instead of reusing .yat-stats-grid). */}
      <div className="fz-social-bar">#{hashtag}</div>

      {/* Same 3-column/4-row grid as the Stats tab, so these cells are
          exactly as tall as .yat-stat's - the message cell spans the first
          two rows (where Stats would show its first 6 stat cells), and the
          six share icons auto-flow into the remaining two rows. */}
      <div className="fz-social-grid">
        <div className="fz-social-message-cell">
          {/* The link itself is never shown in this preview - it's still
              part of every actual share (fullPostText/encodedSmsBody below,
              and the Facebook/X links' own url params), just not spelled
              out here, which frees up room to run the message text bigger. */}
          <p className="fz-social-message-text">{messageNodes}</p>
        </div>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fz-social-cell"
          aria-label="Share on Facebook"
        >
          <FacebookIcon />
        </a>
        <a
          href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fz-social-cell"
          aria-label="Share on X"
        >
          <XIcon />
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
          aria-label="Share on Instagram"
        >
          <InstagramIcon />
        </a>
        <a href={`sms:?&body=${encodedSmsBody}`} className="fz-social-cell" aria-label="Share by text">
          <TextIcon />
        </a>
        <a
          href={`mailto:?subject=${encodedEmailSubject}&body=${encodedSmsBody}`}
          className="fz-social-cell"
          aria-label="Share by email"
        >
          <EmailIcon />
        </a>
        <button
          type="button"
          className={`fz-social-cell${copied ? " copied" : ""}`}
          data-copy-text={fullPostText}
          onClick={handleCopyPost}
          aria-label={copied ? "Copied" : "Copy post text"}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

// The fan video exchange is a pilot interest program, not live checkout.
// The player's profile Connect tab is the destination for the full program.
function ConnectPanel({ profileHref, firstName }: { profileHref: string; firstName: string }) {
  return (
    <a className="fz-connect-video" href={profileHref} aria-label={`Request a personalized video message from ${firstName}`}>
      <i className="ri-video-chat-line fz-connect-video-icon" aria-hidden="true" />
      <span className="fz-connect-video-eyebrow">YAT-A-BOY PLAYER CONNECT</span>
      <strong>GET A PERSONALIZED VIDEO MESSAGE FROM {firstName.toUpperCase()}</strong>
      <span>Birthdays, celebrations, encouragement, or a message to remember.</span>
      <b>REQUEST A VIDEO <i className="ri-arrow-right-line" aria-hidden="true" /></b>
      <small>Join the interest list. Video ordering is coming soon.</small>
    </a>
  );
}

// The actual screenshot of this player's PPP Career Path Timeline is
// already generated by the site's bounded timeline-snapshot worker.
function UploadPanel({ player, resolvedHsid, profileHref, isActive }: {
  player: Record<string, unknown>; resolvedHsid: string; profileHref: string; isActive: boolean;
}) {
  const playerId = String(player.playerid || '');
  const fullName = String(player.display_name || [player.firstname || player.first_name, player.lastname || player.last_name].filter(Boolean).join(' ')).trim() || 'THIS PLAYER';
  const [image, setImage] = useState<string>('');
  const [pending, setPending] = useState(true);
  useEffect(() => {
    if (!isActive || !playerId || !resolvedHsid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let heldUrl = '';
    let attempt = 0;
    const load = async () => {
      attempt += 1;
      try {
        const url = `/api/og/player-profile?playerId=${encodeURIComponent(playerId)}&hsid=${encodeURIComponent(resolvedHsid)}&rev=${Math.floor(Date.now() / 60000)}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok || !String(res.headers.get('content-type') || '').includes('image/png')) throw new Error('Timeline preview is not ready');
        const blob = await res.blob();
        if (cancelled) return;
        heldUrl = URL.createObjectURL(blob);
        setImage(heldUrl);
        setPending(false);
      } catch {
        if (!cancelled && attempt < 12) timer = setTimeout(load, 10000);
        else if (!cancelled) setPending(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (heldUrl) URL.revokeObjectURL(heldUrl);
    };
  }, [isActive, playerId, resolvedHsid]);
  const uploadHref = profileHref.replace(/#.*$/, '') + (profileHref.includes('?') ? '&' : '?') + 'openStory=1#ppTab-upload';
  return (
    <div className="fz-story-preview">
      <a className="fz-story-preview-image" href={profileHref} aria-label={`View ${fullName}'s career path timeline`}>
        {image ? <img src={image} alt={`${fullName}'s actual player profile career path timeline`} /> :
          <span className="fz-story-preview-loading">
            <i className="ri-timeline-view" aria-hidden="true" />
            <strong>CAREER PATH TIMELINE</strong>
            <span>{pending ? 'Loading the player profile timeline…' : 'View the timeline on the player profile'}</span>
          </span>}
      </a>
      <a className="fz-story-upload" href={uploadHref}>
        <i className="ri-upload-cloud-line" aria-hidden="true" />
        <strong>SHARE A STORY ON {fullName.toUpperCase()}'S TIMELINE</strong>
      </a>
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
  lazySchedulePlayerId,
}: FunZoneProps) {
  const retiredPlayer = /\bRETIRED\b/i.test(String(player.status_label || player.status || ""));
  const imageId = String(player.playerid || "");
  const [activeTab, setActiveTab] = useState<TabId>("stats");
  const [alumniUpdate,setAlumniUpdate]=useState<any>(null);
  useEffect(()=>{
    // Loading every retired player's status during a roster render produces
    // thousands of unnecessary DB requests. Load only on the selected tab.
    if(!retiredPlayer || activeTab!=='schedule') return;
    let active=true;
    const load=async()=>{
      try {
        await auth.authStateReady?.();
        const token=await auth.currentUser?.getIdToken().catch(()=>'');
        const url='/api/contribute/where-yat-now/status?playerId='+encodeURIComponent(imageId)+'&hsid='+encodeURIComponent(resolvedHsid);
        const response=await fetch(url,{credentials:'include',cache:'no-store',
          headers:token?{'x-firebase-token':token}:{}});
        const data=response.ok?await response.json():null;
        if(active)setAlumniUpdate(data?.update||null);
      } catch {/* An unavailable status endpoint must not break the flip card. */}
    };
    load();
    const onFocus=()=>{void load()};
    const onSubmitted=(event:Event)=>{
      const detail=(event as CustomEvent<{playerId:string;hsid:string}>).detail;
      if(detail?.playerId===imageId && detail?.hsid===resolvedHsid)void load();
    };
    const unsubscribe=onAuthStateChanged(auth,()=>{void load()});
    window.addEventListener('focus',onFocus);
    window.addEventListener('yat:where-yat-submitted',onSubmitted);
    return()=>{active=false;unsubscribe();window.removeEventListener('focus',onFocus);window.removeEventListener('yat:where-yat-submitted',onSubmitted)};
  },[retiredPlayer,activeTab,imageId,resolvedHsid]);
  const [loadedSchedule, setLoadedSchedule] = useState<{items:import('./PlayerSevenDaySnapshot').SnapshotItem[];todayIso:string}|null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState(false);
  const scheduleRequested = useRef(false);
  useEffect(() => {
    if (activeTab !== 'schedule' || retiredPlayer || !lazySchedulePlayerId || scheduleSnapshot || scheduleRequested.current) return;
    const card = rootRef.current?.closest<HTMLElement>('.yat-card');
    if (!card?.classList.contains('is-flipped')) return;
    scheduleRequested.current = true;
    const controller = new AbortController();
    setScheduleLoading(true);
    fetch(`/api/card-game-log/${encodeURIComponent(lazySchedulePlayerId)}?hsid=${encodeURIComponent(resolvedHsid)}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Game log unavailable'); return response.json(); })
      .then((data) => {
        if (!Array.isArray(data.items) || typeof data.todayIso !== 'string') throw new Error('Invalid game log');
        setLoadedSchedule(data);
        setScheduleError(false);
      })
      .catch(() => { setScheduleError(true); scheduleRequested.current = false; })
      .finally(() => setScheduleLoading(false));
    return () => controller.abort();
  }, [activeTab, lazySchedulePlayerId, scheduleSnapshot]);
  // Global flip-all navigation uses the same React state as local tab clicks.
  // Merely toggling CSS classes would desynchronize CTA links and lazy panels.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const card = rootRef.current?.closest<HTMLElement>('.yat-card');
    if (!card) return;
    const onGlobalTab = (event: Event) => {
      const next = (event as CustomEvent<{ tab?: TabId }>).detail?.tab;
      if (next && TABS.some((tab) => tab.id === next)) setActiveTab(next);
    };
    card.addEventListener('yat:flip-all-tab', onGlobalTab);
    return () => card.removeEventListener('yat:flip-all-tab', onGlobalTab);
  }, []);
  const [activeStatsIndex, setActiveStatsIndex] = useState(0);
  // Swipe left/right on the card back to change tab (one listener for the
  // whole page, installed by whichever card mounts first).
  useEffect(() => installFunZoneSwipe(), []);
  const resolvedStatBuckets =
    statBuckets && statBuckets.length > 0
      ? statBuckets
      : [{ label: statBarLabel, stats }];
  const activeStatsBucket = resolvedStatBuckets[Math.min(activeStatsIndex, resolvedStatBuckets.length - 1)];
  const statFamilies = [...new Set(resolvedStatBuckets.map((bucket) => bucket.family).filter((family): family is "batting" | "pitching" => Boolean(family)))];
  const hasBothStatFamilies = statFamilies.length === 2;
  const selectedFamily = activeStatsBucket.family ?? statFamilies[0];
  const activeFamilyBuckets = hasBothStatFamilies
    ? resolvedStatBuckets.map((bucket, idx) => ({ bucket, idx })).filter(({ bucket }) => bucket.family === selectedFamily)
    : resolvedStatBuckets.map((bucket, idx) => ({ bucket, idx }));

  // Reset during render (not in an effect) when the bucket count changes,
  // to avoid the extra render pass a useEffect-based reset would cause.
  const [prevStatBucketsLength, setPrevStatBucketsLength] = useState(resolvedStatBuckets.length);
  if (resolvedStatBuckets.length !== prevStatBucketsLength) {
    setPrevStatBucketsLength(resolvedStatBuckets.length);
    setActiveStatsIndex(0);
  }

  const slug = String(player.slug || "");
  const firstName = displayName.split(" ")[0] || "this player";
  const lastName = String(player.lastname || player.last_name || displayName.split(" ").slice(1).join(" ") || "");
  // Deep-link to the matching tab on the profile page so the CTA always
  // opens the same tab the user is currently viewing on the flip card.
  const profileHref = `/${resolvedHsid}/player/${imageId}/${slug}#ppTab-${activeTab}`;
  // Share the player's existing SHORT PROFILE route rather than the
  // school-card ?player= URL. The short route returns the profile's rich
  // OG image to SMS/social crawlers and redirects fans to the actual
  // player profile. This avoids the separate /api/og/player-card renderer
  // that crops action photos. It also makes the SMS URL shorter.
  const shareRoot = (shareBaseUrl || `https://yatstats.com/${resolvedHsid}`).replace(/[/]+$/, "");
  const shareUrl = `${shareRoot}/p/${encodeURIComponent(imageId)}`;
  const ctaText = getCta(activeTab, firstName);

  // Suppress unused-variable warnings for props used only in sub-panels
  void isPitcher;
  void isAllTime;

  return (
    <div ref={rootRef} className="fz-root">
      {/*
        1. CTA strip - YaTi (left) + speech bubble (right)
           flex-shrink:1 - yields padding before the content panel.
      */}
      {!(retiredPlayer && activeTab === "schedule") && <YatiCta ctaText={ctaText} profileHref={profileHref} />}

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
        {retiredPlayer ? (
          <div className="fz-where-yat">
            <WhereYatFunZonePanel
              state={alumniUpdate?.status === 'approved' ? 'approved' : alumniUpdate?.status === 'pending' ? 'pending' : 'unclaimed'}
              firstName={firstName}
              playerId={imageId} hsid={resolvedHsid} displayName={displayName} schoolName={''}
              profileHref={`/${resolvedHsid}/player/${imageId}/${slug}#ppTab-schedule`}
              proof={alumniUpdate?.status === 'approved' ? {
                playerId:imageId, hsid:resolvedHsid, displayName:alumniUpdate.display_name||displayName,
                city:alumniUpdate.location_city||'', state:alumniUpdate.location_state||'',
                occupation:alumniUpdate.occupation||'', company:alumniUpdate.company_name||'',
                website:alumniUpdate.business_website||'', linkedin:alumniUpdate.linkedin_url||'',
                instagram:alumniUpdate.instagram_url||'', facebook:alumniUpdate.facebook_url||'',
                x:alumniUpdate.x_url||'',story:String(({favoriteHs:alumniUpdate.favorite_hs_memory,favoriteAfter:alumniUpdate.favorite_post_hs_memory,family:alumniUpdate.family_life,story:alumniUpdate.story} as Record<string,unknown>)[alumniUpdate.featured_memory_key||'story']||alumniUpdate.story||''),
                storyPrompt:whereYatCardHeading(alumniUpdate.featured_memory_key),
                photoUrl:alumniUpdate.memory_photos_json?.[alumniUpdate.featured_memory_key||'story']?.[0]?.web||alumniUpdate.photo_url||null,logoUrl:alumniUpdate.company_logo_url||null,
                businessPublic:Boolean(alumniUpdate.business_public_opt_in),
                 businesses:Array.isArray(alumniUpdate.businesses_json)?alumniUpdate.businesses_json:[],
                 businessHeadshotUrl:alumniUpdate.business_headshot_url||null,
                 businessEmail:alumniUpdate.business_contact_email||null,businessPhone:alumniUpdate.business_contact_phone||null,
              } : null}
            />
          </div>
        ) : lazySchedulePlayerId ? (
          loadedSchedule ? <SevenDaySnapshotView {...loadedSchedule} profileHref={`/${resolvedHsid}/player/${imageId}/${slug}#ppTab-schedule`} /> :
          <div className="fz-placeholder"><i className="ri-calendar-line fz-ph-icon" /><div className="fz-ph-text">{scheduleLoading ? 'Loading game log…' : scheduleError ? 'Game log unavailable. Open the player profile.' : 'Open Game Log to load the schedule.'}</div></div>
        ) : <SchedulePanel scheduleSnapshot={scheduleSnapshot} />}
      </div>
      <div
        className={`fz-panel${activeTab === "stats" ? " fz-panel-active" : ""}`}
        data-fz-tab="stats"
      >
        <div className={`fz-stats-shell${hasBothStatFamilies && activeFamilyBuckets.length === 1 ? " fz-show-single-level" : ""}`} data-fz-stat-buckets={JSON.stringify(resolvedStatBuckets)}>
          {hasBothStatFamilies && (
            <div className="fz-stat-bucket-tabs" role="tablist" aria-label="Batting or pitching statistics">
              {statFamilies.map((family) => (
                <button
                  key={family}
                  type="button"
                  role="tab"
                  data-fz-stat-family={family}
                  aria-selected={selectedFamily === family}
                  className={`fz-stat-bucket-btn${selectedFamily === family ? " active" : ""}`}
                  onClick={() => setActiveStatsIndex(resolvedStatBuckets.findIndex((bucket) => bucket.family === family))}
                >
                  {family === "batting" ? "HITTING" : "PITCHING"}
                </button>
              ))}
            </div>
          )}
          {activeFamilyBuckets.length > 1 && (
            <div className="fz-stat-bucket-tabs fz-stat-level-tabs" role="tablist" aria-label="Stats level buckets">
              {activeFamilyBuckets.map(({ bucket, idx }) => (
                <button
                  key={`${bucket.label}-${idx}`}
                  type="button"
                  role="tab"
                  data-fz-stat-index={idx}
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
        <ConnectPanel profileHref={profileHref} firstName={firstName} />
      </div>
      <div
        className={`fz-panel${activeTab === "upload" ? " fz-panel-active" : ""}`}
        data-fz-tab="upload"
      >
        <UploadPanel player={player} resolvedHsid={resolvedHsid} profileHref={profileHref} isActive={activeTab === "upload"} />
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
            <span className="fz-tab-label">{retiredPlayer && tab.id === "schedule" ? "YAT?" : tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Inline styles scoped to FunZone - no global stylesheet changes */}
      {/* All sizing uses cqi (container query inline-size) units.
          The container is .yat-back-cq established in PlayerCardBack.tsx.
          cqi = percent of card width - ensures proportional sizing at any card width. */}
      
    </div>
  );
}
