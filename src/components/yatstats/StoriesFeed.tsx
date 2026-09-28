'use client';

// src/components/yatstats/StoriesFeed.tsx
// The Stories tab on the player profile page: every live story this player
// is in (posted on his page or tagged), sortable newest / oldest first and
// searchable.
//   Phone:   small cards like the news cards; tapping one opens it large.
//   Desktop: each story as a full post right here - photos, Like · Comment ·
//            Share, the latest comments and a comment box - so there's
//            nothing to open to join in (a photo still opens large).
// Uploading happens only from the Polaroid on the Career Path Timeline
// (StoryDrawer), never here.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { STORY_POSTED_EVENT } from '@/components/yatstats/StoryDrawer';
import StoryViewer, { StoryStyles, StoryThread, storyWhen, type Story } from '@/components/yatstats/StoryViewer';

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
    <div className={`ysf-photos ysf-photos-${photos.length}`}>
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

export default function StoriesFeed({ playerId, playerName }: { playerId: string; playerName: string }) {
  const firstName = (playerName || '').split(' ')[0] || 'this player';
  const [stories, setStories] = useState<Story[] | null>(null);
  const [failed, setFailed] = useState(false);
  const isDesktop = useIsDesktop();
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [openPhoto, setOpenPhoto] = useState(0);
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
          if (window.matchMedia(DESKTOP_QUERY).matches) {
            pendingFocus.current = shared;
          } else {
            setOpenPhoto(0);
            setOpenId(shared);
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
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('ysf-card-focus');
    window.setTimeout(() => card.classList.remove('ysf-card-focus'), 2400);
  }, []);

  // A story was just posted (reload), or something asked to show one.
  useEffect(() => {
    const onPosted = () => load();
    const onFocus = (event: Event) => {
      pendingFocus.current = String((event as CustomEvent<{ id?: string }>).detail?.id || '') || null;
      tryFocus();
    };
    window.addEventListener(STORY_POSTED_EVENT, onPosted);
    window.addEventListener('yat:story-focus', onFocus);
    return () => {
      window.removeEventListener(STORY_POSTED_EVENT, onPosted);
      window.removeEventListener('yat:story-focus', onFocus);
    };
  }, [load, tryFocus]);

  useEffect(() => {
    tryFocus();
  }, [stories, tryFocus]);

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

  const show = (story: Story, photo = 0) => {
    setOpenPhoto(photo);
    setOpenId(story.id);
  };

  const visible = useMemo(() => {
    if (!stories) return stories;
    const q = search.trim().toLowerCase();
    const list = q
      ? stories.filter((s) =>
          [s.story, s.author, storyWhen(s), ...s.players.map((p) => p.name)].join(' ').toLowerCase().includes(q)
        )
      : stories.slice();
    list.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0) * (sort === 'newest' ? -1 : 1));
    return list;
  }, [stories, search, sort]);

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
    const toolbar = (
      <div className="ysf-tools">
        <label className="ysf-search">
          <i className="ri-search-line" aria-hidden="true" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stories" aria-label="Search stories" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')} aria-label="Sort stories">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
    );
    const list = visible || [];
    body = (
      <>
        {toolbar}
        {list.length === 0 ? (
          <div className="ysf-empty">No stories match “{search.trim()}”.</div>
        ) : isDesktop ? (
          <div className="ysf-feed ysf-feed-posts">
            {list.map((s) => (
              <StoryThread
                key={s.id}
                story={s}
                playerId={playerId}
                variant="inline"
                onChange={updateStory}
                onDeleted={removeStory}
                media={<StoryPhotos story={s} onOpen={(i) => show(s, i)} />}
              />
            ))}
          </div>
        ) : (
          <div className="ysf-feed">
            {list.map((s) => {
              const cover = s.photos[0];
              return (
                <button type="button" className="ysf-card" id={`story-${s.id}`} key={s.id} onClick={() => show(s)}>
                  <span className="ysf-card-when">{fullWhenLabel(s)}</span>
                  <span className="ysf-card-row">
                    <span className="ysf-card-photo">
                      {cover?.thumb || cover?.web ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover.thumb || cover.web || ''} alt="" loading="lazy" decoding="async" />
                      ) : null}
                      {s.photos.length > 1 ? <span className="ysf-card-count">{s.photos.length} photos</span> : null}
                    </span>
                    <span className="ysf-card-body">
                      <span className="ysf-card-text">{s.story}</span>
                      <span className="ysf-card-by">
                        By {s.author}
                        {s.likeCount > 0 ? <span className="ysf-card-stat"><i className="ri-thumb-up-fill" /> {s.likeCount}</span> : null}
                        {s.commentCount > 0 ? <span className="ysf-card-stat"><i className="ri-chat-3-fill" /> {s.commentCount}</span> : null}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="ysf">
      {body}

      {openStory && typeof document !== 'undefined' && (
        <StoryViewer key={`${openStory.id}-${openPhoto}`} story={openStory} playerId={playerId} initialPhoto={openPhoto} onClose={closeViewer} onChange={updateStory} onDeleted={removeStory} />
      )}
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
          --ysf-when: var(--gold, #ffc107);
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
          --ysf-when: #b78600;
        }
        .ysf-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 48px 16px; text-align: center; color: var(--ysf-muted); font: 400 14px/1.45 system-ui, sans-serif; }
        .ysf-empty strong { color: var(--ysf-strong); font: 700 18px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
        .ysf-feed { display: flex; flex-direction: column; gap: 10px; }
        .ysf-feed-posts { gap: 16px; max-width: 720px; margin: 0 auto; }
        .ysf-tools { display: flex; gap: 8px; align-items: center; margin: 0 auto 10px; max-width: 720px; }
        .ysf-search { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; padding: 0 10px; border: 1px solid var(--ysf-card-border); border-radius: 8px; background: var(--ysf-card-bg); color: var(--ysf-muted); }
        .ysf-search input { flex: 1; min-width: 0; min-height: 36px; border: 0; background: transparent; color: var(--ysf-strong); font: 400 14px/1 system-ui, sans-serif; outline: none; }
        .ysf-tools select { min-height: 38px; padding: 0 10px; border: 1px solid var(--ysf-card-border); border-radius: 8px; background: var(--ysf-card-bg); color: var(--ysf-strong); font: 400 14px/1 system-ui, sans-serif; }
        .ysf-photos { display: grid; gap: 2px; margin-top: 4px; background: var(--ysf-card-border); }
        .ysf-photos-item { display: block; padding: 0; border: 0; background: #000; cursor: zoom-in; overflow: hidden; }
        .ysf-photos-item img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .ysf-photos-1 .ysf-photos-item img { height: auto; max-height: 560px; object-fit: contain; margin: 0 auto; }
        .ysf-photos-2 { grid-template-columns: 1fr 1fr; }
        .ysf-photos-2 .ysf-photos-item { aspect-ratio: 1; }
        .ysf-photos-3 { grid-template-columns: 1fr 1fr; grid-template-rows: 260px 200px; }
        .ysf-photos-3 .ysf-photos-item:first-child { grid-column: 1 / -1; }
        .ysf-photos-4 { grid-template-columns: 1fr 1fr; }
        .ysf-photos-4 .ysf-photos-item { aspect-ratio: 4 / 3; }
        /* The date on its own line at the top left; under it the photo and
           the story side by side, their tops level. Thin border like the
           News cards. */
        .ysf-card { appearance: none; width: 100%; display: flex; flex-direction: column; align-items: stretch; gap: 7px; min-width: 0; margin: 0; padding: 8px; text-align: left; cursor: pointer; border: 1px solid var(--ysf-card-border); border-radius: 8px; background: var(--ysf-card-bg); box-shadow: var(--ysf-card-shadow); color: var(--ysf-text); transition: border-color .15s ease; }
        .ysf-card:hover { border-color: var(--gold, #ffc107); }
        .ysf-card-focus { border-color: var(--gold, #ffc107); box-shadow: 0 0 0 2px var(--gold, #ffc107); }
        /* Same type as the News cards' eyebrow (.pp-news-label). */
        .ysf-card-when { color: var(--ysf-when); font: 700 8px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
        .ysf-card-row { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
        /* Same size and frame as the News thumbnail (.pp-news-thumb). */
        .ysf-card-photo { position: relative; flex: 0 0 auto; display: block; width: 68px; height: 88px; overflow: hidden; border-radius: 8px; border: 1px solid var(--ysf-thumb-border); box-shadow: 0 1px 3px rgba(0,0,0,.16); background: var(--ysf-thumb-bg); }
        .ysf-card-photo img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }
        .ysf-card-count { position: absolute; left: 3px; right: 3px; bottom: 3px; padding: 2px 0; text-align: center; border-radius: 999px; background: rgba(0,0,0,.7); color: #fff; font: 700 9px/1.3 Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
        .ysf-card-body { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
        .ysf-card-text { color: var(--ysf-text); font: 400 13px/1.4 var(--yat-news-font, Georgia, serif); margin-top: -.15em; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; }
        .ysf-card-by { color: var(--ysf-muted); font: 700 9px/1.2 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
        .ysf-card-stat { margin-left: 10px; white-space: nowrap; }
        .ysf-card-stat i { font-size: 10px; vertical-align: -1px; }
        @media (max-width: 760px) {
          .ysf { padding: 8px 8px 16px; }
          .ysf-feed { gap: 8px; }
          .ysf-card { gap: 6px; padding: 7px; }
          .ysf-card-row { gap: 8px; }
          .ysf-card-photo { width: 62px; height: 80px; }
          .ysf-card-text { font-size: 12px; }
        }
      `}</style>
    </div>
  );
}
