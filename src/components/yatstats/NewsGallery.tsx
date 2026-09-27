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
            <div className="yat-front-content yat-news-front-content">
              <div className="yat-news-headline-top">{headline}</div>

              <div className="yat-news-front-bottom-row">
                <div className="yat-news-player-meta">
                  <div className="yat-name yat-news-player-name">
                    <span>{first.toUpperCase()}</span>
                    <span>{last.toUpperCase()}</span>
                  </div>

                  <div className="yat-front-team-name">
                    {post.teamName || "--"}
                  </div>

                  {post.orgName ? (
                    <div className="yat-front-org-name">{post.orgName}</div>
                  ) : null}

                  <div className="yat-front-chip-stack yat-news-chip-stack">
                    <span className="front-chip">{(post.status || "ACTIVE").toUpperCase()}</span>
                    {post.level ? <span className="front-chip">{post.level.toUpperCase()}</span> : null}
                    {post.gradClass ? (
                      <span className="front-chip">{`CLASS OF ${post.gradClass}`}</span>
                    ) : null}
                    {years.length ? (
                      <div className="yat-front-year-dots">
                        {years.map((y) => (
                          <div className="yat-dot" key={y}>{String(y).slice(-2)}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="yat-news-source-actions">
                  <div className="yat-news-source-line">
                    {(post.displaySourceLabel || post.source || "NEWS").toUpperCase()}
                    <span>{formatDate(post.publishedAt)}</span>
                  </div>
                  <span className="yat-front-flip-button yat-news-flip-button">
                    <span>FLIP FOR FULL RECAP</span>
                    <span aria-hidden="true">&gt;</span>
                  </span>
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
        .news-card .yat-bg{
          filter:brightness(.84) saturate(.88);
        }
        .news-card .yat-shade{
          /* Base card CSS only covers the bottom 70%, which created the
             visible horizontal dark band. News cards need one continuous
             full-image screen from top to bottom. */
          top:0;
          bottom:0;
          height:auto;
          background:linear-gradient(
            to bottom,
            rgba(0,0,0,.76) 0%,
            rgba(0,0,0,.58) 22%,
            rgba(0,0,0,.28) 48%,
            rgba(0,0,0,.40) 72%,
            rgba(0,0,0,.68) 100%
          );
        }
        .news-card .yat-news-front-content{padding:12px;display:flex;flex-direction:column;justify-content:space-between}
        .yat-news-headline-top{
          width:100%;
          font:400 21px/1.05 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.025em;
          text-transform:uppercase;
          color:#fff;
          text-shadow:1px 1px 4px rgba(0,0,0,.8);
          padding:1px 2px 8px;
          border-bottom:2px solid var(--gold);
        }
        .yat-news-front-bottom-row{
          width:100%;
          display:grid;
          grid-template-columns:minmax(0,1fr) minmax(86px,40%);
          align-items:end;
          gap:8px;
        }
        .yat-news-player-meta{min-width:0;display:flex;flex-direction:column;align-items:flex-start}
        .news-card .yat-news-player-name{
          font-size:20px;
          line-height:.88;
          margin-bottom:4px;
        }
        .news-card .yat-front-team-name{
          font:500 12px/1.05 Oswald,sans-serif;
          color:#fff;
          text-shadow:1px 1px 3px rgba(0,0,0,.75);
          text-transform:none;
        }
        .news-card .yat-front-org-name{
          margin-top:2px;
          font:400 9px/1.1 Oswald,sans-serif;
          color:rgba(255,255,255,.8);
          text-shadow:1px 1px 3px rgba(0,0,0,.75);
        }
        .yat-news-chip-stack{
          display:flex;
          flex-direction:column;
          gap:5px;
          align-items:flex-start;
          margin-top:7px;
        }
        .news-card .yat-news-chip-stack .front-chip{
          width:fit-content;
          background:rgba(0,0,0,.58);
          color:#fff;
          border:1px solid rgba(255,255,255,.3);
          border-radius:5px;
          padding:3px 7px;
          font:700 9px/1 Oswald,sans-serif;
          letter-spacing:.04em;
        }
        .news-card .yat-front-year-dots{display:flex;gap:4px;margin-top:1px}
        .news-card .yat-dot{width:22px;height:22px;font-size:9px}
        .yat-news-source-actions{
          min-width:0;
          display:flex;
          flex-direction:column;
          align-items:stretch;
          justify-content:flex-end;
          gap:6px;
        }
        .yat-news-source-line{
          font:500 9px/1.2 Oswald,sans-serif;
          letter-spacing:.04em;
          text-transform:uppercase;
          color:rgba(255,255,255,.9);
          text-align:right;
          text-shadow:1px 1px 3px rgba(0,0,0,.8);
          overflow-wrap:anywhere;
        }
        .yat-news-source-line span{display:block;color:rgba(255,255,255,.65);margin-top:2px}
        .news-card .yat-news-flip-button{
          display:flex;
          justify-content:space-between;
          align-items:center;
          width:100%;
          min-height:30px;
          background:var(--gold);
          border:1px solid rgba(255,255,255,.38);
          border-radius:6px;
          color:#000;
          padding:6px 8px;
          font:700 10px/1 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.08em;
          text-transform:uppercase;
          box-shadow:0 2px 8px rgba(0,0,0,.3);
        }
        .yat-news-back{padding:16px 18px;display:flex;flex-direction:column;height:100%}
        .yat-news-back-label{color:var(--gold);font:400 12px/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.1em;margin-bottom:4px}
        .yat-news-back-title{font:400 18px/1.1 "Bebas Neue",Oswald,sans-serif;color:#fff;margin-bottom:12px}
        .yat-news-back-body{font:400 14px/1.58 Georgia,"Times New Roman",serif;color:rgba(255,255,255,.92);flex:1;overflow-y:auto;padding-right:4px}
        .yat-news-back-why{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.76);font:italic 12px/1.45 Georgia,"Times New Roman",serif}
        .yat-news-back-actions{margin-top:10px;display:flex;flex-direction:column;gap:8px}
        .yat-news-back-cta{display:block;background:var(--gold);color:#000;text-align:center;padding:10px;font:400 14px/1 "Bebas Neue",Oswald,sans-serif;letter-spacing:.1em;border-radius:4px;text-decoration:none}
        .yat-news-back-source{display:block;text-align:center;color:rgba(255,255,255,.7);font:400 12px/1.2 Oswald,sans-serif;text-decoration:underline}
        .yat-news-back-share{display:flex;align-items:center;gap:12px}
        .yat-news-back-share span{font:400 12px "Bebas Neue",Oswald,sans-serif;color:rgba(255,255,255,.5)}
        .yat-news-back-share a{background:rgba(255,255,255,.1);color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none}
        .yat-news-empty-sub{font-weight:300;margin-top:8px;max-width:360px;margin-left:auto;margin-right:auto}
        .yat-news-filter-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;margin:0 0 12px;border:1px solid var(--line);border-radius:6px;font:400 13px/1.2 Oswald,sans-serif;letter-spacing:.05em;color:var(--fg)}
        .yat-news-filter-bar strong{color:var(--gold)}
        .yat-news-filter-bar button{background:none;border:1px solid var(--line);color:var(--fg);font:400 12px Oswald,sans-serif;letter-spacing:.08em;padding:6px 10px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
        .gallery-slot-link.active-news-player-filter{outline:3px solid var(--gold);outline-offset:-3px}

        @media(max-width:520px){
          .yat-news-headline-top{font-size:20px}
          .news-card .yat-news-player-name{font-size:19px}
        }
      `}</style>
    </>
  );
}
