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
import CardPhoto from "@/components/yatstats/CardPhoto";
import { markPlayerName } from "@/components/yatstats/PlayerNameMentions";
import { getNewsPhotoSrcs, PLAYER_SILHOUETTE_URL } from "@/lib/playerImage";
import { toSlugFromDisplay } from "@/lib/slug";
import ProfileNewsList, { type ProfileNewsStory } from "@/components/yatstats/ProfileNewsList";

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

// Browsers may wrap after any hyphen, which split "Triple-A" into
// "TRIPLE-" / "A". Hyphenated words stay on one line.
function keepHyphenatedWords(text: string): React.ReactNode[] {
  return text.split(/(\S+-\S+)/).map((part, i) =>
    i % 2 ? (
      <span key={i} style={{ whiteSpace: "nowrap" }}>
        {part}
      </span>
    ) : (
      part
    )
  );
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
  const photoSrcs = getNewsPhotoSrcs(post.playerId, post.imageUrl);
  const years = Array.isArray(post.rosterYears) && post.rosterYears.length ? post.rosterYears.slice(0, 4) : [];
  const playerHref =
    post.playerId && name
      ? `/${encodeURIComponent(hsid)}/player/${encodeURIComponent(post.playerId)}/${toSlugFromDisplay(name)}`
      : null;
  const profileHref = playerHref ? `${playerHref}?story=${encodeURIComponent(post.uuid)}#ppTab-news` : null;

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
            {/* Our own photo of the player, not the publisher's hero image
                (usually someone else). Silhouette behind it if none load. */}
            <div className="yat-bg" style={{ backgroundImage: `url('${PLAYER_SILHOUETTE_URL}')` }}>
              <CardPhoto srcs={photoSrcs} />
            </div>
            <div className="yat-shade" />
            <div className="yat-front-content yat-news-front-content">
              <div className="yat-news-headline-top">{keepHyphenatedWords(headline)}</div>

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
              <div className="yat-news-back-label">YAT?STATS LOCAL RECAP</div>
              <div className="yat-news-back-body">{markPlayerName(recap, name, playerHref)}</div>
              <div className="yat-news-back-actions">
                {profileHref ? (
                  <a className="yat-news-back-cta" href={profileHref}>
                    {first.toUpperCase() || "PLAYER"}&apos;S PROFILE <span aria-hidden="true">&rsaquo;</span>
                  </a>
                ) : null}
                <a className="yat-news-back-source" href={post.url} target="_blank" rel="noopener noreferrer">
                  {(post.source || "Original story").toUpperCase()} <i className="ri-external-link-line" />
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

  // Cards that arrive after FLIP ALL was pressed (the news loads when the
  // tab opens, or a player filter adds cards) follow it too.
  useEffect(() => {
    if (document.getElementById("flipAllCards")?.getAttribute("aria-pressed") !== "true") return;
    document.querySelectorAll<HTMLElement>("#sec-news .news-card").forEach((card) => card.classList.add("is-flipped"));
  }, [visible]);

  const rows: ProfileNewsStory[] = visible.map((post) => ({
    uuid: post.uuid,
    title: stripHtml(post.displayHeadline || post.title) || 'Alumni news',
    url: post.url,
    source: post.displaySourceLabel || post.source,
    publishedAt: post.publishedAt,
    recap: stripHtml(post.displayRecap),
    whyLocal: stripHtml(post.displayWhyLocal),
    imageUrl: post.imageUrl,
    newsworthiness: 'STANDARD',
    tease: limitWords(stripHtml(post.displayRecap || post.displayWhyLocal) || '', 43),
    playerId: post.playerId,
    playerName: post.playerName,
  }));

  return (
    <section className={`yp-school-news${playerFilter ? ' has-player-filter' : ''}`} aria-label="Active Alumni News">
      {playerFilter ? (
        <div className="yat-news-filter-bar">
          <span className="yat-news-filter-label" title={`Showing news for ${filteredName}`}>SHOWING NEWS FOR <strong>{filteredName.toUpperCase()}</strong></span>
          <button type="button" onClick={clearFilter} aria-label="Show news for all players">SHOW ALL <i className="ri-close-line" aria-hidden="true" /></button>
        </div>
      ) : null}
      <div className="yp-school-news-layout">
        <div className="yp-school-news-main">
          {failed ? (
            <div className="yat-news-error">Unable to load Alumni News right now. Please retry.</div>
          ) : posts === null ? (
            <div className="yat-news-loading"><div className="yat-news-loading-spinner" /><div className="yat-news-loading-text">LOADING ALUMNI NEWS…</div></div>
          ) : rows.length === 0 ? (
            <div className="yat-news-loading">
              <div className="yat-news-loading-text">{playerFilter ? 'NO STORIES FOR '+filteredName.toUpperCase() : 'NO ALUMNI NEWS YET'}</div>
            </div>
          ) : (
            <ProfileNewsList stories={rows} firstName="school alumni" playerId="" playerName="" hsid={hsid} schoolWide />
          )}
        </div>
        <aside className="yp-school-news-tower" aria-label="Title Sponsor desktop advertisement placement">
          <small>TITLE SPONSOR · ACTIVE ALUMNI NEWS</small>
          <strong>ADVERTISING<br />TOWER</strong>
          <span>Reserved for sponsor creative</span>
        </aside>
      </div>
      <style>{`
        .yp-school-news {
          width:min(100%,1310px);margin:0 auto;padding:16px 22px 100px;
          color:var(--fg);background:var(--bg);min-height:60vh;
        }
        /* The news toolbar sticks below the three shared sticky site rows.
           Its offset includes this filter strip only when a headshot is selected. */
        .yp-school-news { --yp-news-filter-h:0px; }
        .yp-school-news.has-player-filter { --yp-news-filter-h:30px; }
        .yp-school-news .yat-news-filter-bar {
          position:sticky;
          top:calc(var(--row1-h,36px) + var(--row2-h,54px) + var(--row3-h,100px));
          z-index:17;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          width:100%;
          min-width:0;
          height:30px;
          margin:0 0 4px;
          padding:0 3px;
          background:var(--bg);
          color:var(--fg);
          border:0;
          box-shadow:none;
        }
        .yp-school-news .yat-news-filter-label {
          flex:1 1 auto;
          min-width:0;
          display:block;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          color:var(--fg);
          font:600 clamp(9px,2.5vw,11px)/1.15 var(--yat-font-compact,"Barlow Condensed",sans-serif);
          letter-spacing:0;
          text-transform:uppercase;
        }
        .yp-school-news .yat-news-filter-label strong {font-weight:800;}
        .yp-school-news .yat-news-filter-bar button {
          display:inline-flex;
          flex:0 0 auto;
          align-items:center;
          justify-content:center;
          gap:5px;
          margin:0;
          padding:3px 4px;
          border:0;
          border-radius:4px;
          background:transparent;
          color:var(--fg);
          font:700 10px/1.15 var(--yat-font-compact,"Barlow Condensed",sans-serif);
          letter-spacing:0;
          white-space:nowrap;
          cursor:pointer;
        }
        .yp-school-news .yat-news-filter-bar button:is(:hover,:focus-visible) {background:var(--line);}
        .yp-school-news-layout {
          display:grid;grid-template-columns:minmax(0,1fr) clamp(225px,24vw,325px);
          align-items:start;gap:20px;min-width:0;
        }
        .yp-school-news-main {min-width:0}
        .yp-school-news-main .pp-news-feed {padding:0 3px 40px}
        .yp-school-news-tower {
          display:flex;flex-direction:column;gap:14px;align-items:center;
          justify-content:center;min-height:390px;padding:25px 14px;
          position:sticky;top:calc(var(--row1-h,36px) + var(--row2-h,54px) + var(--row3-h,100px) + 14px);
          border:1px dashed #898989;border-radius:3px;
          background:#181818;color:#fff;text-align:center;
        }
        .yp-school-news-tower small,.yp-school-news-tower span {
          font:700 12px/1.3 var(--yat-font-compact,Oswald,sans-serif);color:#d4d4d4;
        }
        .yp-school-news-tower strong {
          font:800 clamp(23px,2.2vw,34px)/1.1 var(--yat-font-compact,Oswald,sans-serif);
        }
        body.light-theme .yp-school-news-tower {
          background:#f0e6d1;color:#17130b;border-color:#8d7a5b;
        }
        body.light-theme .yp-school-news-tower :is(small,span) {color:#3b3224}
        @media(max-width:740px){
          .yp-school-news{padding:8px 12px 100px}
          .yp-school-news-layout{display:block}
          .yp-school-news-tower{display:none}
          .yp-school-news-main .pp-news-feed{padding:0 2px 55px}
        }
      `}</style>
    </section>
  );
}
