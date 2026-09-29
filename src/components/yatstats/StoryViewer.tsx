'use client';

// src/components/yatstats/StoryViewer.tsx
// A story as a Facebook-style post: who posted it and who's in it, the
// story, like / comment counts, a Like · Comment · Share bar, the comments
// and "Comment as ..." (a comment can carry up to 4 photos). The fan who
// posted it gets a ⋯ menu to edit or delete it.
//   StoryThread - that post; used inline in the Stories tab on desktop and
//                 inside the big view.
//   StoryViewer - the big view (photo + thread), opened from a card on a
//                 phone or from a photo on desktop.

import { type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '@/lib/firebase';
import { toPlayerSlug } from '@/lib/slug';
import FanConfirm from '@/components/yatstats/FanConfirm';
import { track } from '@/lib/analytics';
import { jpegName, shrinkPhoto } from '@/lib/shrinkPhoto';

export type StoryPhoto = { web: string | null; thumb: string | null; full: string | null; width: number | null; height: number | null };
export type StoryPlayer = { playerId: string; hsid: string | null; name: string; isPrimary: boolean };
export type Story = {
  id: string;
  story: string;
  author: string;
  date: string | null;
  year: number | null;
  postedAt: string;
  photos: StoryPhoto[];
  players: StoryPlayer[];
  likeCount: number;
  commentCount: number;
  likedByMe?: boolean;
  isMine?: boolean;
};

type StoryComment = { id: string; text: string; author: string; createdAt: string; isMine: boolean; canDelete: boolean; photos?: StoryPhoto[] };
type PickedPhoto = { id: string; file: File; preview: string };
const COMMENT_MAX_PHOTOS = 4;
export type Me = { firstName: string; lastName: string; email: string } | null;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function storyWhen(story: Pick<Story, 'date' | 'year'>, short = false) {
  const m = story.date ? Number(story.date.slice(5, 7)) : 0;
  const month = m ? (short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]) : '';
  return [month, story.year || ''].filter(Boolean).join(' ');
}

export function playerHref(player: StoryPlayer) {
  const [first, ...rest] = player.name.split(' ');
  return `/${encodeURIComponent(player.hsid || '')}/player/${encodeURIComponent(player.playerId)}/${toPlayerSlug(first || '', rest.join(' '))}`;
}

// "2h", "3d", "1w" - like Facebook's comment times.
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  if (s < 31536000) return `${Math.floor(s / 604800)}w`;
  return `${Math.floor(s / 31536000)}y`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

function openSignIn() {
  document.body.classList.remove('drawer-story-open');
  document.body.classList.add('drawer-account-open', 'drawer-open');
  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: 'signin' }));
}

// A Firebase ID token when this site has a Firebase user; the server falls
// back to the signed pass from sign-in otherwise (lib/fanIdentity.ts).
async function authHeaders(): Promise<Record<string, string>> {
  try {
    await auth.authStateReady?.();
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    return token ? { 'x-firebase-token': token } : {};
  } catch {
    return {};
  }
}

// Like or un-like (no account needed). Used by posts and the small cards.
export async function toggleStoryLike(storyId: string): Promise<{ liked: boolean; likeCount: number } | null> {
  try {
    const res = await fetch(`/api/stories/${storyId}/like`, { method: 'POST', headers: await authHeaders(), credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    track(data.liked ? 'story_like' : 'story_unlike', { moment_id: storyId });
    return { liked: Boolean(data.liked), likeCount: Number(data.likeCount) || 0 };
  } catch {
    return null;
  }
}

// The phone's share sheet, else copy the link. Returns a message to show
// (or null when the share sheet handled it / was cancelled).
export async function shareStory(story: Story): Promise<string | null> {
  const url = shareUrlFor(story.id);
  const title = `${story.author}'s story${story.year ? ` · ${storyWhen(story)}` : ''}`;
  let method = 'link';
  let message: string | null = null;
  try {
    if (navigator.share) {
      await navigator.share({ title, text: story.story.slice(0, 140), url });
      method = 'native';
    } else {
      await navigator.clipboard.writeText(url);
      message = 'Link copied. Paste it anywhere to share.';
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return null;
    try {
      await navigator.clipboard.writeText(url);
      message = 'Link copied. Paste it anywhere to share.';
    } catch {
      window.prompt('Copy this link to share the story:', url);
    }
  }
  track('story_share', { moment_id: story.id, method });
  fetch(`/api/stories/${story.id}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    credentials: 'include',
    body: JSON.stringify({ method }),
  }).catch(() => {});
  return message;
}

export function shareUrlFor(storyId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('story', storyId);
  url.hash = 'ppTab-upload';
  return url.toString();
}

// Who's viewing (from the site session), fetched once per page and shared by
// every post. Used for "Comment as ..." and to show sign-in vs confirm.
let meRequest: Promise<Me> | null = null;
let meValue: Me | undefined;
const meListeners = new Set<() => void>();
let meWatching = false;
// Signing in or out (Join / Log in drawer) re-checks who's viewing, so the
// posts switch to "Comment as ..." without a page reload.
function watchAuthChanges() {
  if (meWatching || typeof window === 'undefined') return;
  meWatching = true;
  const refresh = () => {
    meRequest = null;
    void loadMe();
  };
  window.addEventListener('yat-auth-success', refresh);
  window.addEventListener('yat-sign-out', refresh);
}
function loadMe() {
  if (!meRequest) {
    meRequest = fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const s = data?.authenticated ? data.session : null;
        return s ? { firstName: String(s.firstName || ''), lastName: String(s.lastName || ''), email: String(s.email || '') } : null;
      })
      .catch(() => null)
      .then((me) => {
        meValue = me;
        meListeners.forEach((fn) => fn());
        return me;
      });
  }
  return meRequest;
}
export function useFanMe(): Me {
  return useSyncExternalStore(
    (fn) => {
      meListeners.add(fn);
      watchAuthChanges();
      void loadMe();
      return () => meListeners.delete(fn);
    },
    () => meValue ?? null,
    () => null
  );
}

export function StoryThread({
  story,
  playerId,
  onChange,
  onDeleted,
  variant,
  media,
  focusComment = false,
}: {
  story: Story;
  playerId: string;
  onChange: (story: Story) => void;
  onDeleted: (id: string) => void;
  // Opened from a card's Comment button: put the cursor in the comment box.
  focusComment?: boolean;
  // 'modal': the right-hand side of the big view (scrolls; comment box
  // pinned at the bottom). 'inline': a full post in the Stories tab.
  variant: 'modal' | 'inline';
  // Inline posts show their photos between the story and the Like bar.
  media?: ReactNode;
}) {
  const me = useFanMe();
  const [comments, setComments] = useState<StoryComment[] | null>(null);
  const [showAll, setShowAll] = useState(variant === 'modal');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'' | 'like' | 'comment' | 'save' | 'delete'>('');
  const [note, setNote] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<{ text: string; month: number; year: number } | null>(null);
  // Set when this site couldn't tell who the fan is: the action to retry
  // once they've confirmed it's them (FanConfirm).
  const [retry, setRetry] = useState<null | (() => void)>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // Photos picked for the next comment, and a comment photo opened large.
  const [picked, setPicked] = useState<PickedPhoto[]>([]);
  const [lightbox, setLightbox] = useState<{ photos: StoryPhoto[]; index: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pickedRef = useRef<PickedPhoto[]>([]);
  pickedRef.current = picked;
  useEffect(() => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const others = story.players.filter((p) => p.playerId !== playerId);
  const hasComments = story.commentCount > 0;

  useEffect(() => {
    if (focusComment && me) composerRef.current?.focus();
  }, [focusComment, me]);

  // Comments: loaded when the post appears (skipped when there are none).
  useEffect(() => {
    if (!hasComments) return;
    let cancelled = false;
    fetch(`/api/stories/${story.id}/comments`, { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { comments: [] }))
      .then((data) => { if (!cancelled) setComments(Array.isArray(data?.comments) ? data.comments : []); })
      .catch(() => { if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
  }, [story.id, hasComments]);
  const commentList = hasComments ? comments : (comments ?? []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  const flash = useCallback((text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(''), 2600);
  }, []);

  const needConfirm = (action: () => void) => {
    if (!me) return openSignIn();
    setRetry(() => action);
  };

  const call = async (url: string, init: RequestInit = {}) => {
    // A form (comment photos) sets its own Content-Type.
    const headers = { ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()) };
    const res = await fetch(url, { ...init, headers, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  // Anyone can like - no account needed (visitors like anonymously).
  const toggleLike = async () => {
    if (busy) return;
    const was = Boolean(story.likedByMe);
    setBusy('like');
    onChange({ ...story, likedByMe: !was, likeCount: Math.max(0, story.likeCount + (was ? -1 : 1)) });
    const result = await toggleStoryLike(story.id);
    if (result) {
      onChange({ ...story, likedByMe: result.liked, likeCount: result.likeCount });
    } else {
      onChange({ ...story });
      flash('That like didn’t go through.');
    }
    setBusy('');
  };

  const pickPhotos = (files: FileList | null) => {
    const room = COMMENT_MAX_PHOTOS - picked.length;
    const chosen = Array.from(files || []).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room));
    if (files && files.length > room) flash(`Up to ${COMMENT_MAX_PHOTOS} photos per comment.`);
    if (chosen.length) {
      setPicked((list) => [...list, ...chosen.map((file) => ({ id: Math.random().toString(36).slice(2), file, preview: URL.createObjectURL(file) }))]);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const unpick = (id: string) => {
    setPicked((list) => {
      const gone = list.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return list.filter((p) => p.id !== id);
    });
  };

  const postComment = async () => {
    const text = draft.trim();
    const photos = pickedRef.current;
    if ((!text && photos.length === 0) || busy) return;
    if (!me) return openSignIn();
    setBusy('comment');
    try {
      let body: string | FormData = JSON.stringify({ text });
      if (photos.length) {
        const form = new FormData();
        form.append('text', text);
        for (const p of photos) form.append('photos', await shrinkPhoto(p.file), jpegName(p.file));
        body = form;
      }
      const { res, data } = await call(`/api/stories/${story.id}/comments`, { method: 'POST', body });
      if (res.status === 401) return needConfirm(postComment);
      if (!res.ok) throw new Error(data?.error || 'Your comment could not be posted.');
      track('story_comment', { moment_id: story.id, photos: photos.length });
      setComments((list) => [...(list || []), data.comment]);
      setShowAll(true);
      setDraft('');
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPicked([]);
      onChange({ ...story, commentCount: story.commentCount + 1 });
      // The timeline shows photos from a story's thread on that year's slide.
      if (photos.length) window.dispatchEvent(new CustomEvent('yat:story-comment-photos', { detail: { id: story.id } }));
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Your comment could not be posted.');
    } finally {
      setBusy('');
    }
  };

  const removeComment = async (comment: StoryComment) => {
    if (!window.confirm('Delete this comment?')) return;
    const { res, data } = await call(`/api/stories/${story.id}/comments/${comment.id}`, { method: 'DELETE' });
    if (res.status === 401) return needConfirm(() => removeComment(comment));
    if (!res.ok) return flash(data?.error || 'The comment could not be removed.');
    setComments((list) => (list || []).filter((c) => c.id !== comment.id));
    onChange({ ...story, commentCount: Math.max(0, story.commentCount - 1) });
  };

  const share = async () => {
    const message = await shareStory(story);
    if (message) flash(message);
  };

  const startEdit = () => {
    setMenuOpen(false);
    const m = story.date ? Number(story.date.slice(5, 7)) : 1;
    setEditing({ text: story.story, month: m || 1, year: story.year || new Date().getFullYear() });
  };

  const saveEdit = async () => {
    if (!editing || busy) return;
    setBusy('save');
    try {
      const { res, data } = await call(`/api/stories/${story.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ story: editing.text, month: editing.month, year: editing.year }),
      });
      if (res.status === 401) return needConfirm(saveEdit);
      if (!res.ok) throw new Error(data?.error || 'Your changes could not be saved.');
      onChange({ ...story, story: data.story, date: data.date, year: data.year });
      setEditing(null);
      window.dispatchEvent(new CustomEvent('yat:story-posted', { detail: { id: story.id } }));
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Your changes could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setMenuOpen(false);
    if (!window.confirm('Delete this story? It will be removed from every timeline and Stories tab it’s on.')) return;
    setBusy('delete');
    try {
      const { res, data } = await call(`/api/stories/${story.id}`, { method: 'DELETE' });
      if (res.status === 401) return needConfirm(remove);
      if (!res.ok) throw new Error(data?.error || 'The story could not be deleted.');
      onDeleted(story.id);
      window.dispatchEvent(new CustomEvent('yat:story-posted', { detail: { id: story.id } }));
    } catch (error) {
      flash(error instanceof Error ? error.message : 'The story could not be deleted.');
    } finally {
      setBusy('');
    }
  };

  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear + 1; y >= 1960; y--) years.push(y);
  const myName = me ? [me.firstName, me.lastName].filter(Boolean).join(' ') : '';

  // Inline posts show the latest two comments until "View more".
  const PREVIEW = 2;
  const visibleComments = commentList && !showAll && commentList.length > PREVIEW ? commentList.slice(-PREVIEW) : commentList;
  const hiddenCount = commentList && !showAll ? Math.max(0, commentList.length - PREVIEW) : 0;

  const header = (
    <div className="ysv-head">
      <span className="ysv-avatar" aria-hidden="true">{initials(story.author)}</span>
      <div className="ysv-who">
        <div className="ysv-byline">
          <strong>{story.author}</strong>
          {others.length > 0 && (
            <>
              {' '}is with{' '}
              {others.map((p, i) => (
                <span key={p.playerId}>
                  {i > 0 ? (i === others.length - 1 ? ' and ' : ', ') : ''}
                  <a href={playerHref(p)}><strong>{p.name || 'Player'}</strong></a>
                </span>
              ))}
            </>
          )}
          .
        </div>
        <div className="ysv-when">{storyWhen(story)}</div>
      </div>
      {story.isMine && (
        <div className="ysv-menu-wrap">
          <button type="button" className="ysv-menu-btn" aria-label="Story options" aria-expanded={menuOpen} onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}>
            <i className="ri-more-fill" />
          </button>
          {menuOpen && (
            <div className="ysv-menu" role="menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" role="menuitem" onClick={startEdit}><i className="ri-pencil-line" /> Edit story</button>
              <button type="button" role="menuitem" className="ysv-danger" onClick={remove}><i className="ri-delete-bin-line" /> Delete story</button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const body = editing ? (
    <div className="ysv-edit">
      <div className="ysv-edit-date">
        <select value={editing.month} onChange={(e) => setEditing({ ...editing, month: Number(e.target.value) })} aria-label="Month">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={editing.year} onChange={(e) => setEditing({ ...editing, year: Number(e.target.value) })} aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} rows={6} />
      <div className="ysv-edit-actions">
        <button type="button" className="ysv-btn" onClick={() => setEditing(null)} disabled={busy === 'save'}>Cancel</button>
        <button type="button" className="ysv-btn ysv-btn-primary" onClick={saveEdit} disabled={busy === 'save' || !editing.text.trim()}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  ) : (
    <p className="ysv-story">{story.story}</p>
  );

  const bar = (
    <>
      {(story.likeCount > 0 || story.commentCount > 0) && (
        <div className="ysv-counts">
          <span>{story.likeCount > 0 ? <><i className="ri-thumb-up-fill ysv-like-dot" /> {story.likeCount}</> : null}</span>
          <span>{story.commentCount > 0 ? `${story.commentCount} comment${story.commentCount === 1 ? '' : 's'}` : ''}</span>
        </div>
      )}
      <div className="ysv-actions">
        <button type="button" className={story.likedByMe ? 'ysv-liked' : ''} onClick={toggleLike} aria-pressed={Boolean(story.likedByMe)}>
          <i className={story.likedByMe ? 'ri-thumb-up-fill' : 'ri-thumb-up-line'} /> Like
        </button>
        <button type="button" onClick={() => (me ? composerRef.current?.focus() : openSignIn())}>
          <i className="ri-chat-3-line" /> Comment
        </button>
        <button type="button" onClick={share}>
          <i className="ri-share-forward-line" /> Share
        </button>
      </div>
    </>
  );

  const commentsBlock = (
    <div className="ysv-comments">
      {hiddenCount > 0 && (
        <button type="button" className="ysv-more" onClick={() => setShowAll(true)}>
          View {hiddenCount} more comment{hiddenCount === 1 ? '' : 's'}
        </button>
      )}
      {visibleComments === null ? (
        <div className="ysv-muted">Loading comments…</div>
      ) : visibleComments.length === 0 ? (
        variant === 'modal' ? <div className="ysv-muted">No comments yet. Be the first.</div> : null
      ) : (
        visibleComments.map((c) => (
          <div className="ysv-comment" key={c.id}>
            <span className="ysv-avatar ysv-avatar-sm" aria-hidden="true">{initials(c.author)}</span>
            <div className="ysv-comment-main">
              <div className="ysv-bubble">
                <strong>{c.author}</strong>
                {c.text && <span>{c.text}</span>}
              </div>
              {c.photos && c.photos.length > 0 && (
                <div className="ysv-comment-photos">
                  {c.photos.map((p, i) => (
                    <button type="button" key={i} onClick={() => setLightbox({ photos: c.photos || [], index: i })} aria-label="Open photo">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumb || p.web || p.full || ''} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              <div className="ysv-comment-meta">
                <span>{ago(c.createdAt)}</span>
                {c.canDelete && <button type="button" onClick={() => removeComment(c)}>Delete</button>}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const footer = (
    <>
      {note && <div className="ysv-note" role="status">{note}</div>}
      {retry && (
        <div className="ysv-confirm">
          <FanConfirm email={me?.email} onConfirmed={() => { const run = retry; setRetry(null); run(); }} />
        </div>
      )}
      {/* Comment as ... (signed-in fans); a sign-in prompt otherwise. */}
      <div className="ysv-composer">
        {me ? (
          <>
            <span className="ysv-avatar ysv-avatar-sm" aria-hidden="true">{initials(myName)}</span>
            <div className="ysv-compose-box">
              {picked.length > 0 && (
                <div className="ysv-picked">
                  {picked.map((p) => (
                    <span key={p.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.preview} alt="" />
                      <button type="button" onClick={() => unpick(p.id)} aria-label="Remove photo" disabled={busy === 'comment'}><i className="ri-close-line" /></button>
                    </span>
                  ))}
                </div>
              )}
              <textarea
                ref={composerRef}
                rows={1}
                value={draft}
                placeholder={`Comment as ${myName || 'you'}`}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
              />
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => pickPhotos(e.target.files)} />
            <button
              type="button"
              className="ysv-photo-btn"
              onClick={() => fileRef.current?.click()}
              disabled={picked.length >= COMMENT_MAX_PHOTOS || busy === 'comment'}
              aria-label="Add photos"
              title="Add photos"
            >
              <i className="ri-image-add-line" />
            </button>
            <button type="button" onClick={postComment} disabled={(!draft.trim() && picked.length === 0) || busy === 'comment'} aria-label="Post comment">
              <i className={busy === 'comment' ? 'ri-loader-4-line ysv-spin' : 'ri-send-plane-2-fill'} />
            </button>
          </>
        ) : (
          <button type="button" className="ysv-signin" onClick={openSignIn}>Sign in to comment</button>
        )}
      </div>
      {lightbox && <PhotoLightbox photos={lightbox.photos} start={lightbox.index} onClose={() => setLightbox(null)} />}
    </>
  );

  if (variant === 'modal') {
    return (
      <div className="ysv-side">
        <div className="ysv-scroll">
          {header}
          {body}
          {bar}
          {commentsBlock}
        </div>
        {footer}
      </div>
    );
  }

  return (
    <article className="ysv-post" id={`story-${story.id}`}>
      <div className="ysv-post-pad">
        {header}
        {body}
      </div>
      {media}
      <div className="ysv-post-pad">
        {bar}
        {commentsBlock}
      </div>
      {footer}
    </article>
  );
}

// A comment photo opened large, over everything (the big view included).
// Escape closes this, not the story underneath.
function PhotoLightbox({ photos, start, onClose }: { photos: StoryPhoto[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const photo = photos[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!['Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.stopPropagation();
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, photos.length - 1));
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, photos.length]);

  return createPortal(
    <div className="ysv-lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <button type="button" className="ysv-close" onClick={onClose} aria-label="Close"><i className="ri-close-line" /></button>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.full || photo.web || photo.thumb || ''} alt="" onClick={(e) => e.stopPropagation()} />
      )}
      {photos.length > 1 && (
        <div onClick={(e) => e.stopPropagation()}>
          <button type="button" className="ysv-nav ysv-nav-prev" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} aria-label="Previous photo">‹</button>
          <button type="button" className="ysv-nav ysv-nav-next" disabled={index === photos.length - 1} onClick={() => setIndex((i) => i + 1)} aria-label="Next photo">›</button>
          <span className="ysv-count">{index + 1}/{photos.length}</span>
        </div>
      )}
    </div>,
    document.body
  );
}

export default function StoryViewer({
  story,
  playerId,
  initialPhoto = 0,
  focusComment = false,
  onClose,
  onChange,
  onDeleted,
}: {
  story: Story;
  playerId: string;
  initialPhoto?: number;
  focusComment?: boolean;
  onClose: () => void;
  onChange: (story: Story) => void;
  onDeleted: (id: string) => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(initialPhoto);
  const photo = story.photos[photoIndex];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('textarea, input, select')) return;
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setPhotoIndex((i) => Math.min(i + 1, story.photos.length - 1));
      if (event.key === 'ArrowLeft') setPhotoIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, story.photos.length]);

  return createPortal(
    <div className="ysv" role="dialog" aria-modal="true" aria-label="Story" onClick={onClose}>
      <div className="ysv-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ysv-close" onClick={onClose} aria-label="Close"><i className="ri-close-line" /></button>
        <div className="ysv-photo">
          {photo?.full ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.full} alt="" />
          ) : null}
          {story.photos.length > 1 && (
            <>
              <button type="button" className="ysv-nav ysv-nav-prev" disabled={photoIndex === 0} onClick={() => setPhotoIndex((i) => i - 1)} aria-label="Previous photo">‹</button>
              <button type="button" className="ysv-nav ysv-nav-next" disabled={photoIndex === story.photos.length - 1} onClick={() => setPhotoIndex((i) => i + 1)} aria-label="Next photo">›</button>
              <span className="ysv-count">{photoIndex + 1}/{story.photos.length}</span>
            </>
          )}
        </div>
        <StoryThread story={story} playerId={playerId} onChange={onChange} onDeleted={onDeleted} variant="modal" focusComment={focusComment} />
      </div>
      <StoryStyles />
    </div>,
    document.body
  );
}

// Styles for posts and the big view. Colours come from variables: the big
// view is always dark; inline posts follow the site's light / dark theme.
export function StoryStyles() {
  return (
    <style jsx global>{`
      .ysv-card, .ysv-post {
        --ysv-fg: #fff; --ysv-text: rgba(255,255,255,.85); --ysv-muted: rgba(255,255,255,.55);
        --ysv-line: rgba(255,255,255,.1); --ysv-bubble: rgba(255,255,255,.08); --ysv-hover: rgba(255,255,255,.06);
        --ysv-input-bg: rgba(255,255,255,.06); --ysv-input-border: rgba(255,255,255,.14);
        --ysv-gold: #FFD700; --ysv-gold-text: #FFD700; --ysv-menu-bg: #1b1b1b; --ysv-avatar-sm-bg: rgba(255,255,255,.14);
      }
      body.light-theme .ysv-post {
        --ysv-fg: #1f1912; --ysv-text: rgba(31,25,18,.86); --ysv-muted: rgba(31,25,18,.55);
        --ysv-line: rgba(53,43,30,.14); --ysv-bubble: rgba(53,43,30,.07); --ysv-hover: rgba(53,43,30,.06);
        --ysv-input-bg: rgba(255,255,255,.8); --ysv-input-border: rgba(53,43,30,.2);
        --ysv-gold-text: #9a6f00; --ysv-menu-bg: #fffdf8; --ysv-avatar-sm-bg: rgba(53,43,30,.14);
      }
      .ysv { position: fixed; inset: 0; z-index: 10050; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.82); }
      .ysv-card { position: relative; display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr); width: min(1100px, 100%); height: min(760px, calc(100dvh - 32px)); background: #0d0d0d; color: var(--ysv-fg); border: 1px solid rgba(255,255,255,.14); border-radius: 10px; overflow: hidden; }
      .ysv-close { position: absolute; top: 8px; right: 8px; z-index: 3; width: 36px; height: 36px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; font-size: 20px; cursor: pointer; }
      .ysv-photo { position: relative; display: flex; align-items: center; justify-content: center; background: #000; min-height: 0; }
      .ysv-photo img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
      .ysv-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 38px; height: 38px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; font-size: 24px; line-height: 1; cursor: pointer; }
      .ysv-nav:disabled { opacity: .25; cursor: default; }
      .ysv-nav-prev { left: 8px; }
      .ysv-nav-next { right: 8px; }
      .ysv-count { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); padding: 2px 8px; border-radius: 999px; background: rgba(0,0,0,.6); color: #fff; font: 700 11px/1.4 Oswald, sans-serif; }
      .ysv-side { display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--ysv-line); }
      .ysv-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 16px 8px; }
      .ysv-card .ysv-head { padding-right: 36px; }
      .ysv-head { display: flex; align-items: flex-start; gap: 10px; }
      .ysv-avatar { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--ysv-gold); color: #000; font: 400 17px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .04em; }
      .ysv-avatar-sm { width: 32px; height: 32px; font-size: 14px; background: var(--ysv-avatar-sm-bg); color: var(--ysv-fg); }
      .ysv-who { flex: 1; min-width: 0; }
      .ysv-byline { font: 400 15px/1.3 system-ui, sans-serif; color: var(--ysv-text); }
      .ysv-byline strong { color: var(--ysv-fg); font-weight: 700; }
      .ysv-byline a { color: inherit; text-decoration: none; }
      .ysv-byline a:hover { text-decoration: underline; }
      .ysv-when { margin-top: 2px; color: var(--ysv-gold-text); font: 700 10px/1.2 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
      .ysv-menu-wrap { position: relative; }
      .ysv-menu-btn { width: 34px; height: 34px; border-radius: 50%; border: 0; background: transparent; color: var(--ysv-text); font-size: 20px; cursor: pointer; }
      .ysv-menu-btn:hover { background: var(--ysv-hover); }
      .ysv-menu { position: absolute; right: 0; top: 38px; z-index: 4; min-width: 170px; padding: 6px; border-radius: 10px; background: var(--ysv-menu-bg); border: 1px solid var(--ysv-input-border); box-shadow: 0 10px 30px rgba(0,0,0,.35); }
      .ysv-menu button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ysv-fg); font: 400 14px/1 system-ui, sans-serif; text-align: left; cursor: pointer; }
      .ysv-menu button:hover { background: var(--ysv-hover); }
      .ysv-menu .ysv-danger { color: #e05252; }
      .ysv-story { margin: 12px 0; color: var(--ysv-fg); font: 400 16px/1.6 var(--yat-news-font, Georgia, serif); white-space: pre-line; }
      .ysv-edit { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
      .ysv-edit-date { display: grid; grid-template-columns: 1.4fr 1fr; gap: 8px; }
      .ysv-edit select, .ysv-edit textarea, .ysv-composer textarea { width: 100%; border: 1px solid var(--ysv-input-border); border-radius: 8px; background: var(--ysv-input-bg); color: var(--ysv-fg); padding: 9px 12px; font: 400 14px/1.45 system-ui, sans-serif; }
      .ysv-edit textarea { resize: vertical; min-height: 120px; }
      .ysv-edit-actions { display: flex; justify-content: flex-end; gap: 8px; }
      .ysv-btn { min-height: 36px; padding: 0 16px; border-radius: 8px; border: 1px solid var(--ysv-gold); background: transparent; color: var(--ysv-gold-text); font: 400 15px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; cursor: pointer; }
      .ysv-btn-primary { background: var(--ysv-gold); color: #000; }
      .ysv-btn:disabled { opacity: .55; cursor: default; }
      .ysv-counts { display: flex; justify-content: space-between; align-items: center; padding: 8px 2px; color: var(--ysv-muted); font: 400 13px/1 system-ui, sans-serif; }
      .ysv-like-dot { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--ysv-gold); color: #000; font-size: 11px; vertical-align: -3px; }
      .ysv-actions { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--ysv-line); border-bottom: 1px solid var(--ysv-line); }
      .ysv-actions button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; border: 0; background: transparent; color: var(--ysv-text); font: 400 16px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .06em; cursor: pointer; border-radius: 6px; }
      .ysv-actions button i { font-size: 18px; }
      .ysv-actions button:hover { background: var(--ysv-hover); }
      .ysv-actions .ysv-liked { color: var(--ysv-gold-text); }
      .ysv-comments { display: flex; flex-direction: column; gap: 12px; padding: 12px 0 4px; }
      .ysv-comments:empty { display: none; }
      .ysv-more { align-self: flex-start; border: 0; background: none; padding: 0; color: var(--ysv-muted); font: 700 13px/1.2 system-ui, sans-serif; cursor: pointer; }
      .ysv-more:hover { text-decoration: underline; }
      .ysv-muted { color: var(--ysv-muted); font: 400 13px/1.4 system-ui, sans-serif; }
      .ysv-comment { display: flex; gap: 8px; }
      .ysv-comment-main { min-width: 0; }
      .ysv-bubble { display: inline-flex; flex-direction: column; gap: 2px; max-width: 100%; padding: 8px 12px; border-radius: 16px; background: var(--ysv-bubble); color: var(--ysv-fg); font: 400 14px/1.35 system-ui, sans-serif; overflow-wrap: anywhere; white-space: pre-line; }
      .ysv-bubble strong { font-size: 13px; }
      .ysv-comment-photos { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
      .ysv-comment-photos button { padding: 0; border: 0; border-radius: 10px; overflow: hidden; background: var(--ysv-bubble); cursor: zoom-in; }
      .ysv-comment-photos img { display: block; width: 96px; height: 96px; object-fit: cover; }
      .ysv-comment-photos button:only-child img { width: 200px; height: auto; max-height: 220px; }
      .ysv-lightbox { position: fixed; inset: 0; z-index: 10060; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.9); }
      .ysv-lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
      .ysv-comment-meta { display: flex; gap: 12px; padding: 3px 12px 0; color: var(--ysv-muted); font: 700 12px/1 system-ui, sans-serif; }
      .ysv-comment-meta button { border: 0; background: none; padding: 0; color: inherit; font: inherit; cursor: pointer; }
      .ysv-comment-meta button:hover { color: #e05252; }
      .ysv-confirm { padding: 0 12px 8px; }
      .ysv-note { margin: 0 16px 6px; padding: 8px 12px; border-radius: 8px; background: rgba(255,215,0,.14); color: var(--ysv-gold-text); font: 400 13px/1.3 system-ui, sans-serif; }
      .ysv-composer { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid var(--ysv-line); }
      .ysv-composer .ysv-avatar-sm { align-self: center; }
      .ysv-compose-box { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
      .ysv-composer textarea { flex: 1; resize: none; max-height: 120px; border-radius: 20px; padding: 10px 14px; }
      .ysv-picked { display: flex; flex-wrap: wrap; gap: 6px; }
      .ysv-picked span { position: relative; width: 56px; height: 56px; border-radius: 8px; overflow: hidden; background: var(--ysv-bubble); }
      .ysv-picked img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .ysv-picked button { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: rgba(0,0,0,.7); color: #fff; font-size: 13px; line-height: 20px; cursor: pointer; }
      .ysv-composer > button:not(.ysv-signin) { flex: none; width: 40px; height: 40px; border-radius: 50%; border: 0; background: var(--ysv-gold); color: #000; font-size: 18px; cursor: pointer; }
      .ysv-composer > button.ysv-photo-btn { background: transparent; color: var(--ysv-text); font-size: 22px; }
      .ysv-composer > button.ysv-photo-btn:hover:not(:disabled) { background: var(--ysv-hover); }
      .ysv-composer > button:disabled { opacity: .4; cursor: default; }
      .ysv-spin { display: inline-block; animation: ysv-spin 0.9s linear infinite; }
      @keyframes ysv-spin { to { transform: rotate(360deg); } }
      .ysv-signin { flex: 1; min-height: 42px; border-radius: 20px; border: 1px solid var(--ysv-gold); background: transparent; color: var(--ysv-gold-text); font: 400 16px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .07em; cursor: pointer; }
      /* A full post in the Stories tab (desktop). */
      .ysv-post { color: var(--ysv-fg); border: 1px solid var(--ysf-card-border, var(--ysv-line)); border-radius: 10px; background: var(--ysf-card-bg, rgba(255,255,255,.04)); box-shadow: var(--ysf-card-shadow, none); overflow: hidden; }
      .ysv-post-pad { padding: 14px 16px 0; }
      .ysv-post .ysv-post-pad + .ysv-post-pad { padding-top: 0; }
      .ysv-post .ysv-composer { border-top: 0; padding-top: 4px; }
      .ysv-post .ysv-note, .ysv-post .ysv-confirm { margin-left: 16px; margin-right: 16px; padding-left: 0; padding-right: 0; }
      @media (max-width: 760px) {
        .ysv { padding: 0; align-items: stretch; }
        .ysv-card { grid-template-columns: 1fr; grid-template-rows: minmax(0, 42dvh) minmax(0, 1fr); width: 100%; height: 100dvh; border-radius: 0; border: 0; }
        .ysv-side { border-left: 0; border-top: 1px solid var(--ysv-line); }
      }
    `}</style>
  );
}
