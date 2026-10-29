import SponsorTower from '@/components/yatstats/SponsorTower';
'use client';

// src/components/yatstats/StoriesFeed.tsx
// The Stories tab on the player profile page: every live story this player
// is in (posted on his page or tagged), sortable newest / oldest first and
// searchable.
//   Phone:   small cards like the news cards; tapping one opens it large.
//   Desktop: each story as a full post right here - photos, Like · Comment ·
//            Share, the latest comments and a comment box - so there's
//            nothing to open to join in (a photo still opens large).
// Story publishing is triggered by the compact Add Story control beside sort
// and search. The same StoryDrawer handles upload from the Career Timeline.
// Teammates are accessible by the icon + count only (no visible word label).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { STORY_POSTED_EVENT } from '@/components/yatstats/StoryDrawer';
import { openStoryDrawer, cancelPendingStoryDrawerOpen } from '@/lib/storyDrawer';
import SortToggle from '@/components/yatstats/SortToggle';
import TeammatesList, { teammateCount, useTeammates, type TeammateSeason } from '@/components/yatstats/TeammatesList';
import StoryViewer, { AlbumStrip, StoryStyles, StoryThread, openSignIn, shareStory, storyWhen, toggleStoryLike, useFanMe, type Story } from '@/components/yatstats/StoryViewer';

const DESKTOP_QUERY = '(min-width: 900px)';
function useIsDesktop() {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  );
}

// When it happened (the story's month/year), then when it was posted.
function sortKey(story: Story) {
  return `${story.date || (story.year ? `${story.year}-01-01` : '0000-00-00')}|${story.postedAt}`;
}

// A post's photos on desktop, laid out like Facebook's: one large; two side
// by side; three as one large plus two; four as a 2x2 grid.
function StoryPhotos({ story, onOpen }: { story: Story; onOpen: (index: number) => void }) {
  const photos = story.photos.slice(0, 4);
  if (!photos.length) return null;
  return (
    <div className={`ysf-photos ysf-photos-${photos.length}${photos[0]?.logo ? ' ysf-photos-logo' : ''}`}>
      {photos.map((p, i) => (
        <button type="button" key={i} className="ysf-photos-item" onClick={() => onOpen(i)} aria-label={`Open photo ${i + 1}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={(photos.length === 1 ? p.full || p.web : p.web || p.full) || ''} alt="" loading="lazy" decoding="async" />
        </button>
      ))}
    </div>
  );
}

// Story cards spell the month out ("April 2003").
const fullWhenLabel = (story: Story) => storyWhen(story);

// The Teammates drawer docks alongside the profile on wide screens and
// becomes a dismissible modal only where the remaining page would be cramped.
function TeammatesDrawer({ rows, onClose }: { rows: TeammateSeason[] | null; onClose: () => void }) {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const breakpoint = window.matchMedia('(min-width: 1040px)');
    const previousOverflow = document.body.style.overflow;
    const update = () => {
      setDocked(breakpoint.matches);
      // A docked teammate directory must never block site scrolling.
      document.body.style.overflow = breakpoint.matches ? previousOverflow : 'hidden';
    };
    document.body.classList.add('drawer-teammates-open');
    document.addEventListener('keydown', onKey);
    breakpoint.addEventListener('change', update);
    update();
    return () => {
      document.body.classList.remove('drawer-teammates-open');
      document.body.style.overflow = previousOverflow;
      breakpoint.removeEventListener('change', update);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="ytd" role="dialog" aria-modal={!docked} aria-label="Teammates">
      <button type="button" className="ytd-mask" aria-label="Close teammates" onClick={onClose} />
      <div className="ytd-panel">
        <button type="button" className="ytd-close" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
        <div className="ytd-scroll">
          <TeammatesList rows={rows} />
        </div>
      </div>
      <style jsx global>{`
        .ytd { position: fixed; inset: 0; z-index: 10040; }
        .ytd-mask { position: absolute; inset: 0; width: 100%; border: 0; padding: 0; background: rgba(0,0,0,.6); cursor: pointer; animation: ytd-fade .2s ease; }
        .ytd-panel {
          --ytm-bg: #0b0b0b; --ytm-text: rgba(255,255,255,.88); --ytm-muted: rgba(255,255,255,.55); --ytm-strong: #fff;
          --ytm-border: rgba(255,255,255,.16); --ytm-accent: #a0a0a0;
          position: absolute; top: 0; right: 0; bottom: 0; width: min(380px, 88vw); overflow: hidden;
          background: var(--ytm-bg); border-left: 1px solid var(--ytm-border);
          box-shadow: -12px 0 32px rgba(0,0,0,.45); animation: ytd-in .24s cubic-bezier(.2,.8,.2,1);
        }
        /* Keep the close control outside the scrolling roster so it stays
           reachable alongside the sticky heading on long teammate lists. */
        .ytd-scroll { height: 100%; overflow-y: auto; overscroll-behavior: contain; padding: 22px 22px calc(28px + env(safe-area-inset-bottom)); }
        body.light-theme .ytd-panel {
          --ytm-bg: #fbf8f2; --ytm-text: rgba(31,25,18,.88); --ytm-muted: rgba(31,25,18,.55); --ytm-strong: rgba(31,25,18,.95);
          --ytm-border: rgba(53,43,30,.18); --ytm-accent: #555;
        }
        .ytd-close { position: absolute; top: 14px; right: 14px; z-index: 3; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%; background: transparent; color: var(--ytm-muted); font-size: 22px; cursor: pointer; }
        .ytd-close:hover { color: var(--ytm-strong); }
        .ytd-panel .ytm-title { padding-right: 40px; }
        /* Match the established 360px Contribute drawer: fixed beneath rows
           1 and 2, clear of the footer, with rows 3-6 narrowing in tandem. */
        @media (min-width: 1040px) {
          body.drawer-teammates-open .yat-row3-shell,
          body.drawer-teammates-open .yat-row4-shell,
          body.drawer-teammates-open .yat-row5-shell,
          body.drawer-teammates-open .yat-row6-shell {
            margin-right: var(--yat-side-drawer-w,360px) !important;
            transition: margin-right .22s ease;
          }
          .ytd { pointer-events:none; }
          .ytd-mask { display:none; }
          .ytd-panel {
            top:calc(var(--row1-h,36px) + var(--row2-h,54px));
            bottom:var(--yat-drawer-clearance,var(--footerH,66px));
            width:var(--yat-side-drawer-w,360px);
            height:auto;
            box-shadow:none;
            pointer-events:auto;
            animation:none;
          }
          .ytd-scroll { padding-top:16px; }
        }
        @keyframes ytd-in { from { transform: translateX(100%); } to { transform: none; } }
        @keyframes ytd-fade { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .ytd-panel, .ytd-mask { animation: none; } }
      `}</style>
    </div>,
    document.body
  );
}

export default function StoriesFeed({ playerId, playerName }: { playerId: string; playerName: string }) {
  const firstName = (playerName || '').split(' ')[0] || 'this player';
  const storyOpenOwner = useMemo(() => Symbol(`story-toolbar:${playerId}`), [playerId]);
  useEffect(() => () => cancelPendingStoryDrawerOpen(storyOpenOwner), [storyOpenOwner]);
  const me = useFanMe();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [failed, setFailed] = useState(false);
  const isDesktop = useIsDesktop();
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  // A year selected on one player must not carry over when browsing another.
  useEffect(() => setYearFilter(null), [playerId]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openPhoto, setOpenPhoto] = useState(0);
  const [openForComment, setOpenForComment] = useState(false);
  const [note, setNote] = useState('');
  const teammates = useTeammates(playerId);
  const teammatesTotal = teammateCount(teammates);
  const [teammatesOpen, setTeammatesOpen] = useState(false);
  const closeTeammates = useCallback(() => setTeammatesOpen(false), []);
  const openStory = stories?.find((s) => s.id === openId) || null;
  // A shared link (?story=<id>) opens that story once the list is in.
  const pendingOpen = useRef<string | null>(typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('story') : null);
  // A story someone asked to see (just posted, or a timeline thumbnail);
  // shown as soon as its card is on the page.
  const pendingFocus = useRef<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/stories?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store', credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        const list: Story[] = Array.isArray(data?.stories) ? data.stories : [];
        setStories(list);
        setFailed(false);
        // A shared link (?story=<id>): desktop scrolls to that post, a
        // phone opens it. Only the first load after the page opens.
        const shared = pendingOpen.current;
        pendingOpen.current = null;
        if (shared && list.some((s) => s.id === shared)) {
          // An archived championship card lives on the timeline rather
          // than repeating in the lower feed. Its existing shared URL must
          // still open the original story, not scroll toward a hidden card.
          const linked = list.find((s) => s.id === shared);
          if (linked?.timelineOnly || !window.matchMedia(DESKTOP_QUERY).matches) {
            setOpenPhoto(0);
            setOpenId(shared);
          } else {
            pendingFocus.current = shared;
          }
        }
      })
      .catch(() => setFailed(true));
  }, [playerId]);

  useEffect(() => {
    load();
  }, [load]);

  const tryFocus = useCallback(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const card = document.getElementById(`story-${id}`);
    if (!card) return;
    pendingFocus.current = null;
    // The story feed is its own scroll container in the profile Fun Zone.
    // Scroll the actual card into view after the Stories tab becomes active.
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('ysf-card-focus');
    window.setTimeout(() => card.classList.remove('ysf-card-focus'), 2400);
  }, []);

  // A story was just posted (reload), or something asked to show one.
  useEffect(() => {
    const onPosted = () => load();
    const onFocus = (event: Event) => {
      const requested = String((event as CustomEvent<{ id?: string }>).detail?.id || '');
      if (!requested) return;
      // Clear a prior text filter, otherwise a valid timeline memory might
      // be invisible even though its story is loaded.
      setSearch('');
      pendingFocus.current = requested;
      requestAnimationFrame(() => tryFocus());
    };
    window.addEventListener(STORY_POSTED_EVENT, onPosted);
    window.addEventListener('yat:story-focus', onFocus);
    const onTimelineYear = (event: Event) => {
      const detail = (event as CustomEvent<{ playerId?: string; year?: number | null }>).detail;
      if (!detail || detail.playerId !== playerId) return;
      const year = detail.year;
      setSearch('');
      setYearFilter(typeof year === 'number' && Number.isInteger(year) ? year : null);
      // The fixed Career Path / dock layout has a separate Stories scroll
      // surface. Go to its beginning so the selected year's cards are visible.
      requestAnimationFrame(() => {
        const pane = document.querySelector('#ppTab-upload .yp-profile-partner-body');
        if (pane instanceof HTMLElement) pane.scrollTo({ top: 0, behavior: 'smooth' });
      });
    };
    window.addEventListener('yat:timeline-memory-year', onTimelineYear);
    // Who's viewing changed: reload so "liked by me" and the ⋯ menu on
    // your own stories are right.
    window.addEventListener('yat-auth-success', onPosted);
    window.addEventListener('yat-sign-out', onPosted);
    return () => {
      window.removeEventListener(STORY_POSTED_EVENT, onPosted);
      window.removeEventListener('yat:story-focus', onFocus);
      window.removeEventListener('yat:timeline-memory-year', onTimelineYear);
      window.removeEventListener('yat-auth-success', onPosted);
      window.removeEventListener('yat-sign-out', onPosted);
    };
  }, [load, tryFocus]);

  useEffect(() => {
    tryFocus();
  }, [stories, search, tryFocus]);

  const updateStory = useCallback((next: Story) => {
    setStories((list) => (list ? list.map((s) => (s.id === next.id ? next : s)) : list));
  }, []);

  const removeStory = useCallback((id: string) => {
    setOpenId(null);
    setStories((list) => (list ? list.filter((s) => s.id !== id) : list));
  }, []);

  const closeViewer = useCallback(() => {
    setOpenId(null);
    // Drop a shared ?story= from the address once it's been shown.
    const url = new URL(window.location.href);
    if (url.searchParams.has('story')) {
      url.searchParams.delete('story');
      history.replaceState(null, '', url.toString());
    }
  }, []);

  const show = (story: Story, photo = 0, forComment = false) => {
    setOpenPhoto(photo);
    setOpenForComment(forComment);
    setOpenId(story.id);
  };

  const flash = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(''), 2600);
  };

  // Like and Share work straight from a card (no account needed for
  // either); Comment opens the story with the comment box ready.
  const likeFromCard = async (story: Story) => {
    const was = Boolean(story.likedByMe);
    updateStory({ ...story, likedByMe: !was, likeCount: Math.max(0, story.likeCount + (was ? -1 : 1)) });
    const result = await toggleStoryLike(story.id);
    if (result) updateStory({ ...story, likedByMe: result.liked, likeCount: result.likeCount });
    else {
      updateStory(story);
      flash('That like didn’t go through.');
    }
  };

  const shareFromCard = async (story: Story) => {
    const message = await shareStory(story);
    if (message) flash(message);
  };

  const visible = useMemo(() => {
    if (!stories) return stories;
    const q = search.trim().toLowerCase();
    // Imported championship cards are on the year/month rail, including
    // every tagged player's timeline. Do not show a second copy below the
    // rail. Regular fan and official posts remain in the Stories feed.
    // Normal browse hides duplicate archive cards. Drilling into a year
    // includes those same archived records, alongside ordinary fan stories:
    // any card can now open its existing story viewer.
    const feedStories = stories.filter((s) => yearFilter !== null
      ? s.year === yearFilter
      : true);
    const list = q
      ? feedStories.filter((s) =>
          [s.story, s.author, storyWhen(s), ...s.players.map((p) => p.name)].join(' ').toLowerCase().includes(q)
        )
      : feedStories.slice();
    list.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0) * (sort === 'newest' ? -1 : 1));
    return list;
  }, [stories, search, sort, yearFilter]);

  const sponsorCard = (
    <aside className="yp-stories-feed-ad" aria-label="Player Profile Partner mobile sponsor card"><span>PLAYER PROFILE PARTNER</span><strong>ADVERTISER PLACEMENT</strong><small>IN-FEED SPONSOR CARD</small></aside>
  );

  let body: React.ReactNode;
  if (failed) {
    body = <div className="ysf-empty">Stories couldn&apos;t load right now. Please try again later.</div>;
  } else if (stories === null) {
    body = <div className="ysf-empty">Loading stories…</div>;
  } else if (stories.length === 0) {
    body = (
      <div className="ysf-empty">
        <strong>No stories yet.</strong>
        <span>Tap the Polaroid on {firstName}&apos;s Career Timeline above to add the first one.</span>
      </div>
    );
  } else {
    const list = visible || [];
    body = (
      <>
        {list.length === 0 ? (
          <>
            <div className="ysf-empty">{yearFilter != null
              ? `No stories match ${yearFilter}${search.trim() ? ` and “${search.trim()}”` : ''}.`
              : search.trim() ? `No feed stories match “${search.trim()}”.`
              : 'Select a yellow star on the timeline above to explore its year and monthly memories.'}</div>
            {!search.trim() && yearFilter == null && !isDesktop && sponsorCard}
          </>
        ) : isDesktop ? (
          <div className="ysf-feed ysf-feed-posts">
            {list.map((s, index) => (
              <Fragment key={s.id}>
                <StoryThread
                  story={s}
                  playerId={playerId}
                  variant="inline"
                  onOpenStory={() => show(s)}
                  onChange={updateStory}
                  onDeleted={removeStory}
                  media={<StoryPhotos story={s} onOpen={(i) => show(s, i)} />}
                />
                
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="ysf-feed">
            {list.map((s, index) => {
              const cover = s.photos[0];
              return (
                <Fragment key={s.id}>
                  <div className="ysf-card" id={`story-${s.id}`}>
                  <button type="button" className="ysf-card-open" onClick={() => show(s)} aria-label={`Open ${s.author}'s story from ${fullWhenLabel(s)}`}>
                    <span className="ysf-card-when">{fullWhenLabel(s)}</span>
                    {cover?.full || cover?.web ? (
                      <span className={`ysf-card-image${cover?.logo ? ' ysf-card-image-logo' : ''}`}>
                        {/* The whole photograph is visible before its story at any width. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cover.full || cover.web || ''} alt="" loading="lazy" decoding="async" />
                        {s.photos.length > 1 && <span className="ysf-card-count">{s.photos.length} photos</span>}
                      </span>
                    ) : null}
                    <span className="ysf-card-text">{s.story}</span>
                    <span className="ysf-card-by">By {s.author}</span>
                  </button>
                  {/* Photos others added from the same moment. */}
                  <AlbumStrip story={s} onOpen={(i) => show(s, i)} />
                  <div className="ysf-card-actions">
                    <button type="button" className={s.likedByMe ? 'ysf-liked' : ''} onClick={() => likeFromCard(s)} aria-pressed={Boolean(s.likedByMe)}>
                      <i className={s.likedByMe ? 'ri-thumb-up-fill' : 'ri-thumb-up-line'} /> Like{s.likeCount > 0 ? ` · ${s.likeCount}` : ''}
                    </button>
                    <button type="button" onClick={() => me ? show(s, 0, true) : openSignIn()}>
                      <i className="ri-chat-3-line" /> Comment{s.commentCount > 0 ? ` · ${s.commentCount}` : ''}
                    </button>
                    <button type="button" onClick={() => shareFromCard(s)}>
                      <i className="ri-share-forward-line" /> Share
                    </button>
                  </div>
                  </div>
                  {index === (list.length <= 2 ? 0 : 1) ? sponsorCard : null}
                </Fragment>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="ysf">
      {/* Two compact toolbar rows: wide contribution action above wide search. */}
      <div className="ysf-tools" role="toolbar" aria-label={`Stories about ${playerName || 'this player'}`}>
        <div className="ysf-tool-row">
          <button type="button" className="ysf-add-btn"
            onClick={() => openStoryDrawer({ playerId, year: null }, storyOpenOwner)}
            aria-label={`Share a story on ${firstName}'s timeline`}>
            <i className="ri-upload-cloud-2-line" aria-hidden="true" />
            <span>SHARE A STORY ON {firstName.toUpperCase()}&#39;S TIMELINE</span>
          </button>

        </div>
        <div className="ysf-tool-row ysf-tool-row-search">
          <label className="ysf-search">
            <i className="ri-search-line" aria-hidden="true" />
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stories" aria-label="Search stories" />
          </label>
          <div className="ysf-sort"><SortToggle dir={sort} onChange={setSort} compact /></div>
          {teammatesTotal > 0 && (
            <button type="button" className="ysf-tm-btn" onClick={() => setTeammatesOpen(true)}
              aria-haspopup="dialog" aria-expanded={teammatesOpen} aria-label={`Show ${teammatesTotal} teammates`}>
              <i className="ri-team-line" aria-hidden="true" /><span className="ysf-tm-count">{teammatesTotal}</span>
            </button>
          )}
        </div>
        {yearFilter !== null && (
          <div className="ysf-active-year" role="status">
            <span>{yearFilter} MEMORIES</span>
            <button type="button" onClick={() => setYearFilter(null)} aria-label="Show stories from all years">SHOW ALL <i className="ri-close-line" aria-hidden="true" /></button>
          </div>
        )}
      </div>
      <div className="ysf-main">
        <div className={isDesktop ? "ysf-desktop-columns" : "ysf-mobile-columns"}>
          <div className="ysf-story-column">{body}</div>
          {isDesktop ? <div className="ysf-sponsor-column"><SponsorTower placement="player-stories" /></div> : null}
        </div>
        <div className="ysf-bottom-scroll-clearance" aria-hidden="true" />
      </div>
      {teammatesOpen && typeof document !== 'undefined' ? <TeammatesDrawer rows={teammates} onClose={closeTeammates} /> : null}

      {openStory && typeof document !== 'undefined' && (
        <StoryViewer key={`${openStory.id}-${openPhoto}`} story={openStory} playerId={playerId} initialPhoto={openPhoto} focusComment={openForComment} onClose={closeViewer} onChange={updateStory} onDeleted={removeStory} />
      )}
      {note && <div className="ysf-toast" role="status">{note}</div>}
      <StoryStyles />

      <style jsx global>{`
        /* Horizontal cards matching the News tab (ProfileNewsList): photo on
           the left, date, story and author on the right, in both themes. */
        .ysf {
          --ysf-card-bg: rgba(255,255,255,.055);
          --ysf-card-border: rgba(255,255,255,.14);
          --ysf-card-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 1px 3px rgba(0,0,0,.22);
          --ysf-thumb-bg: rgba(255,255,255,.06);
          --ysf-thumb-border: rgba(255,255,255,.13);
          --ysf-text: rgba(255,255,255,.88);
          --ysf-muted: rgba(255,255,255,.55);
          --ysf-strong: rgba(255,255,255,.95);
          --ysf-when: #bcbcbc;
          padding: 10px 10px 20px;
        }
        body.light-theme .ysf {
          --ysf-card-bg: rgba(255,255,255,.52);
          --ysf-card-border: rgba(53,43,30,.18);
          --ysf-card-shadow: inset 0 1px 0 rgba(255,255,255,.7), 0 1px 3px rgba(72,54,30,.08);
          --ysf-thumb-bg: rgba(53,43,30,.05);
          --ysf-thumb-border: rgba(53,43,30,.17);
          --ysf-text: rgba(31,25,18,.86);
          --ysf-muted: rgba(31,25,18,.55);
          --ysf-strong: rgba(31,25,18,.94);
          --ysf-when: #555;
        }
        .ysf-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 48px 16px; text-align: center; color: var(--ysf-muted); font: 400 14px/1.45 var(--yat-font-ui, Arial, sans-serif); }
        .ysf-empty strong { color: var(--ysf-strong); font: 800 18px/1.15 var(--yat-font-ui, Arial, sans-serif); letter-spacing: -.01em; text-transform: uppercase; }
        .ysf-main { min-width: 0; }
        .ysf-desktop-columns {display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start;width:100%;max-width:1200px;margin:0 auto;}
        .ysf-story-column {min-width:0;}
        .ysf-sponsor-column {min-width:0;position:sticky;top:0;align-self:start;z-index:2;}
        .ysf-desktop-columns .ysf-sponsor-column > .yat-desktop-sponsor-tower {width:300px;max-width:100%;}
        @media(max-width:779px){.ysf-desktop-columns{display:block}.ysf-sponsor-column{display:none}.ysf-main{padding-top:0}.ysf-tools{margin:0 auto 6px;max-width:100%}}
        
        /* The scroll viewport ends at the fixed profile dock. This physical
           spacer (not just scroll-padding) guarantees the final advertiser
           and interaction row can be scrolled fully above the footer. */
        .ysf-bottom-scroll-clearance { display:block; height:calc(var(--pp-dock-h,62px) + 88px + env(safe-area-inset-bottom)); width:100%; flex:none; pointer-events:none; }

        .ysf-tools { display:flex;flex-direction:column;gap:7px;position:sticky;top:0;z-index:6;width:100%;max-width:none;margin:0 0 10px;padding:7px 0 8px;min-width:0;background:var(--psi-page-bg,#070707); }
        .ysf-tool-row { display:flex;align-items:stretch;min-width:0; }
        .ysf-tool-row-search { display:grid;grid-template-columns:minmax(0,1fr) 38px auto;gap:6px;align-items:center; }
        .ysf-add-btn { display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:43px;padding:7px 10px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:linear-gradient(180deg,rgba(255,255,255,.17),rgba(255,255,255,.045));box-shadow:inset 0 1px rgba(255,255,255,.14),0 3px 12px rgba(0,0,0,.16);color:var(--ysf-strong);font:800 clamp(10px,2.6vw,14px)/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif);cursor:pointer;min-width:0;letter-spacing:.015em; }
        .ysf-add-btn:hover,.ysf-add-btn:focus-visible { background:linear-gradient(180deg,rgba(255,255,255,.24),rgba(255,255,255,.08)); }
        .ysf-add-btn span { white-space:normal;text-align:center;min-width:0; }
        .ysf-add-btn i { flex:none;font-size:21px; }
        .ysf-tm-btn { display:flex;align-items:center;justify-content:center;gap:5px;min-width:68px;height:32px;border:0;border-radius:6px;padding:0 7px;background:var(--ysf-card-bg);color:var(--ysf-strong);cursor:pointer; }
        .ysf-tm-btn i { font-size:17px; }
        .ysf-tm-count { border:0;padding:0;font:800 12px/1 var(--yat-font-ui,Archivo,Arial,sans-serif);color:inherit; }
        .ysf-search { display:flex;align-items:center;gap:6px;min-width:0;width:100%;height:32px;padding:0 8px;border:0;border-radius:6px;background:var(--ysf-card-bg);color:var(--ysf-muted); }
        .ysf-active-year { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:6px 0 0; padding:6px 10px; border:1px solid var(--ysf-card-border); border-radius:4px; color:var(--ysf-strong); background:var(--ysf-card-bg); font:700 11px/1.2 var(--yat-font-ui,Archivo,Arial,sans-serif); letter-spacing:.05em; }
        .ysf-active-year button { border:0; background:transparent; color:inherit; cursor:pointer; font:inherit; opacity:.8; }
        .ysf-active-year button:hover { opacity:1; }
        .ysf-search input { width:100%;min-width:0;height:30px;border:0;outline:0;background:transparent;color:var(--ysf-strong);font:400 12px/1 var(--yat-font-ui,Archivo,Arial,sans-serif); }
        .ysf-sort { display:flex;align-items:center;justify-content:center;width:38px;min-width:0;background:var(--ysf-card-bg);border-radius:6px; }
        .ysf-sort button { border-radius:6px !important; }
        @media(max-width:410px){.ysf-add-btn{font-size:10px;padding:7px 6px;gap:6px}.ysf-tm-btn{min-width:60px}}
        .ysf-photos { display: grid; gap: 2px; margin-top: 4px; background: var(--ysf-card-border); }
        .ysf-photos-item { min-width:0; display:grid; place-items:center; padding:0; border:0; background:#101010; cursor:zoom-in; overflow:hidden; }
        .ysf-photos-item img { display:block; width:auto; height:auto; max-width:100%; max-height:min(70dvh,760px); object-fit:contain; object-position:center; }
        .ysf-photos-1 .ysf-photos-item { width:100%; min-height:0; }
        .ysf-photos-1 .ysf-photos-item img { width:auto; height:auto; max-width:100%; max-height:min(75dvh,760px); object-fit:contain; margin:auto; }
        /* A Draft Day story's club logo: whole, on a light panel. */
        .ysf-photos-logo .ysf-photos-item { background: #f4f1ea; padding: 28px 0; }
        .ysf-photos-logo .ysf-photos-item img { max-height: 200px; }
        .ysf-photos-2 { grid-template-columns: 1fr 1fr; }
        .ysf-photos-2 .ysf-photos-item { aspect-ratio: 1; }
        .ysf-photos-3 { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .ysf-photos-3 .ysf-photos-item { aspect-ratio:4/3; }
        .ysf-photos-3 .ysf-photos-item:first-child { grid-column:1 / -1; aspect-ratio:16/10; }
        .ysf-photos-4 { grid-template-columns: 1fr 1fr; }
        .ysf-photos-4 .ysf-photos-item { aspect-ratio: 4 / 3; }
        /* The date on its own line at the top left; under it the photo and
           the story side by side, their tops level. Thin border like the
           News cards. */
        .ysf-card { width: 100%; display: flex; flex-direction: column; align-items: stretch; min-width: 0; margin: 0; padding: 0; border: 1px solid var(--ysf-card-border); border-radius: 8px; background: var(--ysf-card-bg); box-shadow: var(--ysf-card-shadow); color: var(--ysf-text); transition: border-color .15s ease; overflow: hidden; }
        .ysf-card-open { appearance: none; display: flex; flex-direction: column; align-items: stretch; gap: 7px; width: 100%; min-width: 0; margin: 0; padding: 8px 8px 6px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
        /* Like · Comment · Share on each card. */
        .ysf-card-actions { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--ysf-card-border); }
        .ysf-card-actions button { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 36px; border: 0; background: transparent; color: var(--ysf-muted); font: 600 13px/1 var(--yat-font-ui, Arial, sans-serif); letter-spacing: 0; cursor: pointer; }
        .ysf-card-actions button i { font-size: 15px; }
        .ysf-card-actions button:hover { color: var(--ysf-strong); }
        .ysf-card-actions .ysf-liked { color: var(--ysf-when); }
        .ysf-toast { position: fixed; left: 50%; bottom: calc(var(--footerH, 66px) + var(--pp-dock-h, 58px) + 12px); transform: translateX(-50%); z-index: 70; max-width: calc(100vw - 32px); padding: 10px 16px; border-radius: 999px; background: #111; color: #fff; border: 1px solid rgba(255,255,255,.26); font: 400 13px/1.3 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.4); }
        .ysf-card:hover { border-color: var(--ysf-strong); }
        .ysf-card-focus { border-color: var(--ysf-strong); box-shadow: 0 0 0 2px var(--ysf-strong); }
        /* Same type as the News cards' eyebrow (.pp-news-label). */
        .ysf-card-when { color: var(--ysf-when); font: 700 9px/1 var(--yat-font-ui, Arial, sans-serif); letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
        .ysf-card-row { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
        /* Same size and frame as the News thumbnail (.pp-news-thumb). */
        .ysf-card-photo { position: relative; flex: 0 0 auto; display: block; width: 68px; height: 88px; overflow: hidden; border-radius: 8px; border: 1px solid var(--ysf-thumb-border); box-shadow: 0 1px 3px rgba(0,0,0,.16); background: var(--ysf-thumb-bg); }
        .ysf-card-photo img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }
        .ysf-card-photo-logo { background: #f4f1ea; }
        .ysf-card-photo-logo img { object-fit: contain; object-position: center; padding: 8px; box-sizing: border-box; }
        .ysf-card-image { position:relative; display:grid; place-items:center; width:100%; min-width:0; max-height:70dvh; background:#101010; overflow:hidden; }
        .ysf-card-image img { display:block; width:auto; height:auto; max-width:100%; max-height:70dvh; object-fit:contain; object-position:center; }
        .ysf-card-image-logo { background:#f4f1ea; }
        .ysf-card-image-logo img { max-height:220px; }

        .ysf-card-count { position: absolute; left: 3px; right: 3px; bottom: 3px; padding: 2px 0; text-align: center; border-radius: 999px; background: rgba(0,0,0,.7); color: #fff; font: 700 9px/1.3 var(--yat-font-ui, Arial, sans-serif); letter-spacing: .01em; text-transform: uppercase; }
        .ysf-card-body { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
        .ysf-card-text { color:var(--ysf-text); font:400 13px/1.4 var(--yat-news-font,Georgia,serif); margin:6px 2px 2px; display:block; white-space:pre-line; overflow-wrap:anywhere; }
        .ysf-card-by { color: var(--ysf-muted); font: 600 10px/1.2 var(--yat-font-ui, Arial, sans-serif); letter-spacing: 0; text-transform: uppercase; }
        @media (max-width: 760px) {
          .ysf { padding: 8px 8px 16px; }
          .ysf-feed { gap: 8px; }
          .ysf-card-open { gap: 6px; padding: 7px 7px 5px; }
          .ysf-card-row { gap: 8px; }
          .ysf-card-photo { width: 62px; height: 80px; }
          .ysf-card-text { font-size: 12px; }
        }
      `}</style>
    </div>
  );
}
