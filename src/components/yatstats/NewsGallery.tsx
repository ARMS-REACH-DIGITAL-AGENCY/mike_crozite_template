import SponsorTower from '@/components/yatstats/SponsorTower';
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
import { loadFavoriteIds, readYatUser } from "@/components/yatstats/FavoriteButton";
import { EMPTY_NEWS_FILTERS, matchesNewsStory, type NewsFilterSelection } from "@/lib/newsFilterMatch";

type NewsPost = {
  uuid: string;
  title: string;
  source: string | null;
  url: string;
  imageUrl: string | null;
  publishedAt: string | null;
  playerId: string | null;
  playerName: string | null;
  originalPlayerName?: string | null;
  taggedPlayers?: Array<{playerId:string;playerName:string}>;
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
  newsworthiness?: string | null;
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
  const [sharedStoryId] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('story') || '');
  const [playerFilter, setPlayerFilter] = useState<string>("");
  const [newsFilters, setNewsFilters] = useState<NewsFilterSelection>(EMPTY_NEWS_FILTERS);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(60);

  // Only fetch once the News tab is actually shown (SharedShell toggles
  // .visible on #sec-news), not on every gallery page load.
  useEffect(() => {
    const section = document.getElementById("sec-news");
    if (!section) return;
    const check = () => {
      if (sharedStoryId || section.classList.contains("visible")) setRequested(true);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(section, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [sharedStoryId]);

  // Fetch the first page only on tab entry. Further pages load on demand,
  // so no school incurs an unbounded initial response or extra home-page SQL.
  useEffect(() => {
    if (!requested || posts !== null) return;
    let cancelled = false;
    fetch(`/api/news/${encodeURIComponent(hsid)}?limit=100&offset=0`)
      .then((res) => {
        if (!res.ok) throw new Error(`news ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const rows: NewsPost[] = Array.isArray(data?.posts) ? data.posts : [];
        setPosts(rows);
        setHasMore(rows.length === 100);
      })
      .catch((err) => {
        console.error("[NewsGallery] news fetch failed:", err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [requested, posts, hsid]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !posts) return;
    setLoadingMore(true);
    setPageError(false);
    try {
      const response = await fetch(`/api/news/${encodeURIComponent(hsid)}?limit=100&offset=${posts.length}`);
      if (!response.ok) throw new Error(`news ${response.status}`);
      const data = await response.json();
      const next: NewsPost[] = Array.isArray(data?.posts) ? data.posts : [];
      const ids = new Set(posts.map((post) => post.uuid));
      setPosts([...posts, ...next.filter(post => !ids.has(post.uuid))]);
      setHasMore(next.length === 100);
    } catch (error) {
      console.error('[NewsGallery] page fetch failed', error);
      setPageError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, posts, hsid]);

  // The shared sidebar owns its controls. For News, read the controls into
  // React state instead of attempting to hide unrelated player-card elements.
  useEffect(() => {
    const snapshot = () => {
      const group = (id: string) => Array.from(document.querySelectorAll<HTMLInputElement>(
        `#${id} input[type="checkbox"]:not([data-select-all]):checked`
      )).map(input => input.value);
      setNewsFilters({
        name: (document.getElementById('filterName') as HTMLInputElement | null)?.value || '',
        statuses: group('filterStatus'),
        levels: group('filterLevels'),
        orgs: group('filterOrgs'),
        gradClasses: group('filterGradClass'),
        rosterYears: group('filterRosterYears'),
        favoritesOnly: Boolean((document.getElementById('filterFavs') as HTMLInputElement | null)?.checked),
      });
    };
    const onUpdate = (event: Event) => {
      if ((event as CustomEvent<{ section?: string }>).detail?.section === 'news') snapshot();
    };
    const onFavs = () => {
      const uid = readYatUser()?.uid;
      if (uid) {
        void loadFavoriteIds(uid).then(setFavoriteIds).catch(() => setFavoriteIds(new Set()));
      } else setFavoriteIds(new Set());
      snapshot();
    };
    window.addEventListener('yat:gallery-filtered', onUpdate);
    window.addEventListener('yat-favorites-changed', onFavs);
    window.addEventListener('yat-auth-success', onFavs);
    window.addEventListener('yat-sign-out', onFavs);
    onFavs();
    return () => {
      window.removeEventListener('yat:gallery-filtered', onUpdate);
      window.removeEventListener('yat-favorites-changed', onFavs);
      window.removeEventListener('yat-auth-success', onFavs);
      window.removeEventListener('yat-sign-out', onFavs);
    };
  }, []);

  useEffect(() => { setVisibleCount(60); }, [playerFilter, newsFilters]);

  // A requested player/filter must search the full feed, not just the newest
  // 100 school-wide stories. Fetch the remaining pages progressively while
  // narrowed; the unfiltered feed stays lazy for cost and responsiveness.
  const hasNarrowing = Boolean(
    playerFilter || newsFilters.name.trim() || newsFilters.statuses.length ||
    newsFilters.levels.length || newsFilters.orgs.length ||
    newsFilters.gradClasses.length || newsFilters.rosterYears.length ||
    newsFilters.favoritesOnly
  );
  useEffect(() => {
    const linkedStory = new URLSearchParams(window.location.search).get('story');
    const missingLinkedStory = Boolean(linkedStory && posts && !posts.some(post => post.uuid === linkedStory));
    if ((hasNarrowing || missingLinkedStory) && hasMore && posts && !loadingMore && !pageError) void loadMore();
  }, [hasNarrowing, hasMore, posts, loadingMore, pageError, loadMore]);

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
    () => (posts || []).filter((p) =>
      (!playerFilter || String(p.playerId || "") === playerFilter || Boolean(p.taggedPlayers?.some(tag => tag.playerId === playerFilter)))
      && matchesNewsStory(p, newsFilters, favoriteIds)
    ),
    [posts, playerFilter, newsFilters, favoriteIds]
  );
  const filteredName = useMemo(() => {
    if (!playerFilter) return "";
    const fromPost = (posts || []).find((p) => String(p.playerId || "") === playerFilter)?.playerName;
    if (fromPost) return fromPost;
    const slot = document.querySelector<HTMLElement>(`.gallery-slot-link[data-playerid="${CSS.escape(playerFilter)}"]`);
    return slot?.textContent?.trim() || "this player";
  }, [playerFilter, posts]);

  const clearFilter = useCallback(() => setPlayerFilter(""), []);
  useEffect(() => {
    const reset = () => {
      setPlayerFilter("");
      setNewsFilters(EMPTY_NEWS_FILTERS);
      window.dispatchEvent(new Event("yat:news-reset"));
    };
    const onResetButton = (event: MouseEvent) => {
      if (!document.getElementById("sec-news")?.classList.contains("visible")) return;
      const target = event.target;
      if (target instanceof Element && target.closest("#filtersReset, #filtersReset2")) reset();
    };
    window.addEventListener("click", onResetButton, true);
    return () => window.removeEventListener("click", onResetButton, true);
  }, []);

  // Cards that arrive after FLIP ALL was pressed (the news loads when the
  // tab opens, or a player filter adds cards) follow it too.
  useEffect(() => {
    if (document.getElementById("flipAllCards")?.getAttribute("aria-pressed") !== "true") return;
    document.querySelectorAll<HTMLElement>("#sec-news .news-card").forEach((card) => card.classList.add("is-flipped"));
  }, [visible]);

  // A shared story must stay mounted even if it is older than the first
  // visible page or the user's current filters would otherwise hide it.
  const sharedPost = sharedStoryId ? (posts || []).find(p => p.uuid === sharedStoryId) : null;
  const displayPosts = visible.slice(0, visibleCount);
  if (sharedPost && !displayPosts.some(p => p.uuid === sharedStoryId)) displayPosts.unshift(sharedPost);
  const rows: ProfileNewsStory[] = displayPosts.map((post) => ({
    uuid: post.uuid,
    title: stripHtml(post.displayHeadline || post.title) || 'Alumni news',
    url: post.url,
    source: post.displaySourceLabel || post.source,
    publishedAt: post.publishedAt,
    recap: stripHtml(post.displayRecap),
    whyLocal: stripHtml(post.displayWhyLocal),
    imageUrl: post.imageUrl,
    newsworthiness: post.newsworthiness || 'STANDARD',
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
          {visible.length > visibleCount && (
            <button type="button" className="yat-news-load-more" onClick={() => setVisibleCount((count) => count + 60)}>
              Show more stories ({visible.length - visibleCount} remaining)
            </button>
          )}
          {hasMore && (
            <button type="button" className="yat-news-load-more" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? 'Loading more news…' : 'Load older news stories'}
            </button>
          )}
          {pageError && <div role="alert">Older stories could not be loaded. Try again.</div>}
          <aside className="yp-school-news-inline-ad" aria-label="Title Sponsor in-feed advertisement placement">
            <small>TITLE SPONSOR · ACTIVE ALUMNI NEWS</small>
            <strong>ADVERTISING PLACEMENT</strong>
            <span>300 × 250 PX · IN-FEED SPONSOR CARD</span>
          </aside>
        </div>
        <SponsorTower placement="school-news" className="yp-school-news-tower" />
      </div>
      <style>{`
        .yat-news-load-more{display:block;margin:18px auto;padding:10px 18px;border:1px solid var(--line);border-radius:5px;background:var(--bg);color:var(--fg);cursor:pointer;font-weight:700}
        .yp-school-news {
          width:min(100%,1310px);margin:0 auto;padding:16px 22px 100px;container:yp-news / inline-size;
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
          display:grid;grid-template-columns:minmax(0,1fr) 300px;
          align-items:start;gap:20px;min-width:0;
        }
        .yp-school-news-main {min-width:0}
        .yp-school-news-main .pp-news-feed {padding:0 3px 40px}
        .yp-school-news-tower {
          display:flex;flex-direction:column;gap:14px;align-items:center;
          justify-content:center;width:300px;height:600px;min-height:600px;max-height:600px;box-sizing:border-box;padding:25px 14px;
          position:sticky;top:12px;align-self:start;
          border:1px dashed #898989;border-radius:3px;
          background:#181818;color:#fff;text-align:center;
        }
        .yp-school-news-tower small,.yp-school-news-tower span {
          font:700 12px/1.3 var(--yat-font-compact,Oswald,sans-serif);color:#d4d4d4;
        }
        .yp-school-news-tower strong {
          font:800 clamp(23px,2.2vw,34px)/1.1 var(--yat-font-compact,Oswald,sans-serif);
        }
        /* Same fixed IAB half-page slot as player News / Connect / Stories.
           Sponsor artwork must preserve its full aspect ratio, not crop. */
        .yp-school-news-tower :is(img,picture,video) {
          display:block;width:100%;height:100%;
          object-fit:contain;object-position:center;
        }
        .yp-school-news-inline-ad {display:none;}
        /* Responsive to available reading width, not the device label or
           raw viewport: a docked drawer can reduce the usable column. */
        @container yp-news (max-width:840px){
          .yp-school-news-layout{display:block;}
          .yp-school-news-tower{display:none;}
          .yp-school-news-inline-ad{
            display:flex;box-sizing:border-box;flex-direction:column;
            justify-content:center;align-items:center;gap:9px;
            aspect-ratio:6/5;width:min(100%,300px);margin:20px auto;padding:15px;
            border:1px dashed #898989;border-radius:5px;
            background:#181818;color:#fff;text-align:center;
          }
          .yp-school-news-inline-ad strong {font:800 18px/1.1 var(--yat-font-compact,Oswald,sans-serif);}
          .yp-school-news-inline-ad :is(small,span){font:700 10px/1.25 var(--yat-font-ui,Arial,sans-serif);color:#dadada;}
        }
        body.light-theme .yp-school-news-inline-ad{background:#f0e6d1;color:#17130b;border-color:#8d7a5b;}
        body.light-theme .yp-school-news-inline-ad :is(small,span){color:#3b3224;}
        body.light-theme .yp-school-news-tower {
          background:#f0e6d1;color:#17130b;border-color:#8d7a5b;
        }
        body.light-theme .yp-school-news-tower :is(small,span) {color:#3b3224}
        @media(max-width:740px){
          .yp-school-news{width:100%;max-width:none;padding:0 0 100px}
          .yp-school-news-layout{display:block}
          .yp-school-news-tower{display:none}
          .yp-school-news-main .pp-news-feed{padding:0 0 55px}
        }
        /* The sponsor follows available space, not pointer type. Chrome's
           desktop-site mode on a phone must behave like the desktop layout. */
        @media (max-width:740px) {
          #sec-news .yp-school-news {width:100%!important;min-width:0!important;box-sizing:border-box;padding:0 0 100px!important;margin:0!important}
          #sec-news .yp-school-news-layout {display:block!important;width:100%!important;min-width:0!important}
          #sec-news .yp-school-news-main .pp-news-feed {padding:0 0 55px!important;width:100%!important}
          #sec-news .yp-school-news-tower {display:none!important}
          #sec-news .yp-school-news-inline-ad {display:flex!important}
        }
        /* A docked filter reduces the available reading column. Relocate the
           tower to the in-feed ad rather than hiding sponsor inventory. */
        @media (min-width:780px) {
          body.drawer-right-open #sec-news .yp-school-news-layout {
            grid-template-columns:minmax(0,1fr)!important;
          }
          body.drawer-right-open #sec-news .yp-school-news-tower {display:none!important}
          body.drawer-right-open #sec-news .yp-school-news-inline-ad {display:flex!important}
        }
        `}</style>
    </section>
  );
}
