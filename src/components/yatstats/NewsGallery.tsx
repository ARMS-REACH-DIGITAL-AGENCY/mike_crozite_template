"use client";

// Alumni News gallery (#sec-news): news cards laid out like the flip-card
// gallery, one card per story - a player can have many cards, or none.
//
// This replaces the loader that lived in YatInteractivity's inline script,
// which the browser has refused to parse since Sep 20 (so the page sat on
// "LOADING ALUMNI NEWS..." forever). Same card markup and CSS classes as
// that loader (YatStyles' .news-card rules), same /api/news/:hsid feed.
//
// Row 3 on this page is a filter, not a scroll target: clicking a headshot
// shows only that player's stories (InteractionStrip dispatches
// "yat:news-player-filter"); clicking it again shows everyone.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toSlugFromDisplay } from "@/lib/slug";

type NewsPost = {
  uuid: string;
  title: string;
  source: string | null;
  url: string;
  imageUrl: string | null;
  publishedAt: string | null;
  playerId: string | null;
  playerName: string | null;
  level: string | null;
  status: string | null;
  gradClass: string | null;
  rosterYears: string[] | null;
  teamName: string | null;
  orgName: string | null;
  displayHeadline: string | null;
  displaySourceLabel: string | null;
  displayRecap: string | null;
  displayWhyLocal: string | null;
};

export const NEWS_PLAYER_FILTER_EVENT = "yat:news-player-filter";

function limitWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= max ? text.trim() : `${words.slice(0, max).join(" ")}…`;
}

function stripHtml(text: string | null | undefined): string {
  return (text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(value: string | null): string {
  if (!value) return "RECENT";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "RECENT"
    : d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function NewsCard({ post, hsid }: { post: NewsPost; hsid: string }) {
  const name = post.playerName || "";
  const first = name ? name.split(" ").slice(0, -1).join(" ") : "--";
  const last = name ? name.split(" ").slice(-1).join(" ") : "";
  const headline = stripHtml(post.displayHeadline || post.title) || "Alumni news";
  const recap = limitWords(
    stripHtml(post.displayRecap) || "No recap available yet. Check back soon for the local alumni angle!",
    80
  );
  const years = Array.isArray(post.rosterYears) && post.rosterYears.length ? post.rosterYears.slice(0, 4) : [];
  const profileHref =
    post.playerId && name
      ? `/${encodeURIComponent(hsid)}/player/${encodeURIComponent(post.playerId)}/${toSlugFromDisplay(name)}?story=${encodeURIComponent(post.uuid)}#ppTab-news`
      : null;
  const shareText = encodeURIComponent(`Check out this news about ${name || "our alumni"}: ${headline}`);
  const shareUrl = encodeURIComponent(post.url);

  const onCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (target.closest("a, button")) return;
    event.stopPropagation();
    event.currentTarget.classList.toggle("is-flipped");
  };

  return (
    <div
      className="yat-card news-card"
      id={`news-${post.uuid}`}
      data-name={name.toLowerCase()}
      data-pid={post.playerId || ""}
      data-level={(post.level || "").toUpperCase()}
      data-gradclass={post.gradClass || ""}
      data-team={(post.teamName || "").toLowerCase()}
      data-status={(post.status || "ACTIVE").toUpperCase()}
      onClick={onCardClick}
    >
      <div className="yat-card-inner">
        <div className="yat-flip">
          <div className="yat-face yat-front">
            <div
              className="yat-bg"
              style={post.imageUrl ? { backgroundImage: `url("${post.imageUrl.replace(/"/g, "%22")}")` } : undefined}
            />
            <div className="yat-shade" />
            <div className="yat-front-content">
              <div className="yat-front-top" style={{ justifyContent: "flex-end" }}>
                <div className="yat-front-top-right">
                  <span className="front-chip">{(post.source || "NEWS").toUpperCase()}</span>
                </div>
              </div>
              <div className="yat-news-bottom-wrap">
                <div className="yat-info-block">
                  <div className="yat-name">
                    <span>{first.toUpperCase()}</span>
                    <span>{last.toUpperCase()}</span>
                  </div>
                  <div className="yat-meta">
                    <span>{post.teamName || post.orgName || post.level || "ALUMNI NEWS"}</span>
                  </div>
                  <div className="yat-front-badge-row">
                    {post.level ? <span className="front-chip">{post.level.toUpperCase()}</span> : null}
                    <span className="front-chip">{(post.status || "ACTIVE").toUpperCase()}</span>
                  </div>
                  <div className="yat-chips-col" style={{ marginTop: 4 }}>
                    <span className="front-chip">{post.gradClass ? `CLASS OF ${post.gradClass}` : "ALUMNI NEWS"}</span>
                    {years.length ? (
                      <div className="yat-dots" style={{ marginTop: 4 }}>
                        {years.map((y) => (
                          <div className="yat-dot" key={y}>{y}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="yat-game-block" style={{ marginTop: 8 }}>
                    <div className="yat-pill" style={{ background: "#00e676", color: "#000", border: "none" }}>
                      FLIP TO READ RECAP <i className="ri-arrow-right-line" />
                    </div>
                    <div className="yat-game-text" style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
                      {(post.displaySourceLabel || post.source || "NEWS").toUpperCase()} ({formatDate(post.publishedAt)})
                    </div>
                  </div>
                </div>
                <div className="yat-news-headline-wrap">
                  <div className="yat-news-headline">{headline}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="yat-face yat-back">
            <div className="news-back-content yat-news-back">
              <div className="yat-news-back-label">LOCAL YAT?STATS RECAP</div>
              <div className="yat-news-back-title">{headline.toUpperCase()}</div>
              <div className="yat-news-back-body">
                {recap}
                {post.displayWhyLocal ? <div className="yat-news-back-why">{stripHtml(post.displayWhyLocal)}</div> : null}
              </div>
              <div className="yat-news-back-actions">
                {profileHref ? (
                  <a className="yat-news-back-cta" href={profileHref}>
                    READ MORE ON {first.toUpperCase() || "HIS"}&apos;S PROFILE
                  </a>
                ) : null}
                <a
                  className={profileHref ? "yat-news-back-source" : "yat-news-back-cta"}
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {profileHref ? "Original story at " : "READ FULL STORY AT "}
                  {(post.source || "SOURCE").toUpperCase()}
                </a>
                <div className="yat-news-back-share">
                  <span>SHARE:</span>
                  <a href={`https://x.com/intent/tweet?text=${shareText}&url=${shareUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X">
                    <i className="ri-twitter-x-line" />
                  </a>
                  <a href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook">
                    <i className="ri-facebook-fill" />
                  </a>
                  <a href={`mailto:?subject=${shareText}&body=${shareUrl}`} aria-label="Share by email">
                    <i className="ri-mail-line" />
                  </a>
                  <a href={`sms:?&body=${shareText}%20${shareUrl}`} aria-label="Share by text">
                    <i className="ri-chat-1-line" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewsGallery({ hsid }: { hsid: string }) {
  const [posts, setPosts] = useState<NewsPost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [requested, setRequested] = useState(false);
  const [playerFilter, setPlayerFilter] = useState<string>("");

  // Only fetch once the News tab is actually shown (SharedShell toggles
  // .visible on #sec-news), not on every gallery page load.
  useEffect(() => {
    const section = document.getElementById("sec-news");
    if (!section) return;
    const check = () => {
      if (section.classList.contains("visible")) setRequested(true);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(section, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!requested || posts !== null) return;
    let cancelled = false;
    fetch(`/api/news/${encodeURIComponent(hsid)}?limit=100`)
      .then((res) => {
        if (!res.ok) throw new Error(`news ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPosts(Array.isArray(data?.posts) ? data.posts : []);
      })
      .catch((err) => {
        console.error("[NewsGallery] news fetch failed:", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [requested, posts, hsid]);

  // Row 3 headshot clicks on the News tab (see InteractionStrip).
  useEffect(() => {
    const onFilter = (event: Event) => {
      const id = String((event as CustomEvent<{ playerId?: string }>).detail?.playerId || "");
      setPlayerFilter((current) => (current === id ? "" : id));
    };
    window.addEventListener(NEWS_PLAYER_FILTER_EVENT, onFilter);
    return () => window.removeEventListener(NEWS_PLAYER_FILTER_EVENT, onFilter);
  }, []);

  // Mark the selected headshot in row 3.
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".gallery-slot-link[data-playerid]").forEach((slot) => {
      slot.classList.toggle(
        "active-news-player-filter",
        playerFilter !== "" && slot.getAttribute("data-playerid") === playerFilter
      );
    });
  }, [playerFilter]);

  const visible = useMemo(
    () => (posts || []).filter((p) => !playerFilter || String(p.playerId || "") === playerFilter),
    [posts, playerFilter]
  );
  const filteredName = useMemo(() => {
    if (!playerFilter) return "";
    const fromPost = (posts || []).find((p) => String(p.playerId || "") === playerFilter)?.playerName;
    if (fromPost) return fromPost;
    const slot = document.querySelector<HTMLElement>(`.gallery-slot-link[data-playerid="${CSS.escape(playerFilter)}"]`);
    return slot?.textContent?.trim() || "this player";
  }, [playerFilter, posts]);

  const clearFilter = useCallback(() => setPlayerFilter(""), []);

  let body: React.ReactNode;
  if (failed) {
    body = (
      <div className="yat-news-error">
        <div className="yat-news-error-icon">⚠️</div>
        <div className="yat-news-error-text">Unable to load news right now. Please try again later.</div>
      </div>
    );
  } else if (posts === null) {
    body = (
      <div className="yat-news-loading">
        <div className="yat-news-loading-spinner" />
        <div className="yat-news-loading-text">LOADING ALUMNI NEWS&hellip;</div>
      </div>
    );
  } else if (visible.length === 0) {
    body = (
      <div className="yat-news-loading">
        <div className="yat-news-empty-icon">⚾</div>
        <div className="yat-news-loading-text">
          {playerFilter ? `NO NEWS YET FOR ${filteredName.toUpperCase()}` : "NO ALUMNI NEWS FOUND YET"}
        </div>
        <div className="yat-news-loading-text yat-news-empty-sub">
          News for active alumni will appear here as articles are published. Check back soon.
        </div>
      </div>
    );
  } else {
    body = visible.map((post) => <NewsCard key={`${post.uuid}-${post.playerId || ""}`} post={post} hsid={hsid} />);
  }

  return (
    <>
      {playerFilter ? (
        <div className="yat-news-filter-bar">
          <span>
            SHOWING NEWS FOR <strong>{filteredName.toUpperCase()}</strong>
          </span>
          <button type="button" onClick={clearFilter}>
            SHOW ALL <i className="ri-close-line" />
          </button>
        </div>
      ) : null}
      <div className="yat-grid" id="news-grid">
        {body}
      </div>
      <style>{`
        .yat-news-back{padding:20px;display:flex;flex-direction:column;height:100%}
        .yat-news-back-label{color:#00e676;font:400 12px/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.1em;margin-bottom:4px}
        .yat-news-back-title{font:400 18px/1.1 "Bebas Neue",Oswald,sans-serif;color:#fff;margin-bottom:15px}
        .yat-news-back-body{font:400 14px/1.4 Oswald,sans-serif;color:rgba(255,255,255,.8);flex:1;overflow-y:auto}
        .yat-news-back-why{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.62);font-size:12px;line-height:1.35}
        .yat-news-back-actions{margin-top:15px;display:flex;flex-direction:column;gap:10px}
        .yat-news-back-cta{display:block;background:#00e676;color:#000;text-align:center;padding:10px;font:400 14px/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.1em;border-radius:4px;text-decoration:none}
        .yat-news-back-source{display:block;text-align:center;color:rgba(255,255,255,.7);font:400 12px/1.2 Oswald,sans-serif;text-decoration:underline}
        .yat-news-back-share{display:flex;align-items:center;gap:12px}
        .yat-news-back-share span{font:400 12px "Bebas Neue",Oswald,sans-serif;color:rgba(255,255,255,.5)}
        .yat-news-back-share a{background:rgba(255,255,255,.1);color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none}
        .yat-news-empty-sub{font-weight:300;margin-top:8px;max-width:360px;margin-left:auto;margin-right:auto}
        .yat-news-filter-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;margin:0 0 12px;border:1px solid var(--line);border-radius:6px;font:400 13px/1.2 Oswald,sans-serif;letter-spacing:.05em;color:var(--fg)}
        .yat-news-filter-bar strong{color:var(--green)}
        .yat-news-filter-bar button{background:none;border:1px solid var(--line);color:var(--fg);font:400 12px Oswald,sans-serif;letter-spacing:.08em;padding:6px 10px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
        .gallery-slot-link.active-news-player-filter{outline:3px solid #00e676;outline-offset:-3px}
      `}</style>
    </>
  );
}
