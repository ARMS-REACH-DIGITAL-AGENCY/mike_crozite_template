'use client';

// src/components/yatstats/StoryDrawer.tsx
// "Add a Story" drawer on the player profile page. The only way in is the
// Polaroid on the Career Path Timeline, which fires 'yat:story-drawer-open'
// with the year of the slide the fan is looking at. The drawer slides in
// from the right like the site's other drawers (body.drawer-story-open).
//
// Signed out: asks the fan to sign in, or join if they're new.
// Signed in: their name is already on it, the year comes from the slide;
// they add photos, tag players, pick the month, tell the story, and post.
// The story is live immediately, in the Stories tab.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerProfile } from '@/context/PlayerProfileContext';
import { auth } from '@/lib/firebase';
import FanConfirm from '@/components/yatstats/FanConfirm';
import StoryPreview from '@/components/yatstats/StoryPreview';
import { track } from '@/lib/analytics';
import { copyStoryPhoto, createStoryUploadBody, prepareStoryPhoto, type StoryPhotoData } from '@/lib/storyPhotoUpload';
import { STORY_DRAWER_OPEN_EVENT, takePendingStoryDrawerOpen, type StoryDrawerOpenDetail } from '@/lib/storyDrawer';

export { STORY_DRAWER_OPEN_EVENT } from '@/lib/storyDrawer';
export const STORY_POSTED_EVENT = 'yat:story-posted';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_PHOTOS = 4;
const MAX_TAGS = 20;
const OTHER_DRAWER_CLASSES = ['drawer-left-open', 'drawer-right-open', 'drawer-sort-open', 'drawer-account-open', 'drawer-favorites-open', 'drawer-contribute-open'];
// A departing player layout must not close a newer layout's story portal.
// This is client-only ownership of the currently visible drawer, not data.
let activeStoryDrawerOwner: symbol | null = null;

function clearStoryDrawerState(owner: symbol) {
  if (activeStoryDrawerOwner !== owner) return;
  activeStoryDrawerOwner = null;
  const body = document.body;
  if (body.classList.contains('drawer-story-open')) body.classList.remove('drawer-story-open');
  if (body.classList.contains('drawer-open') && !OTHER_DRAWER_CLASSES.some((name) => body.classList.contains(name))) body.classList.remove('drawer-open');
}

type FanSession = {
  uid?: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  homeSchoolName?: string | null;
};

type TagCandidate = { playerId: string; displayName: string; schoolName?: string; city?: string; state?: string; crestUrl?: string };

const CREST_FALLBACK = '/img/school-placeholder.png';

type PickedPhoto = StoryPhotoData & { id: string; preview: string };

function openAccountDrawer(tab: 'signin' | 'register') {
  document.body.classList.remove('drawer-story-open');
  document.body.classList.add('drawer-account-open', 'drawer-open');
  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: tab }));
}

export default function StoryDrawer() {
  const [drawerOwner] = useState(() => Symbol('story-drawer'));
  const profile = usePlayerProfile();
  const playerId = String(profile?.playerId || '').trim();
  const playerName = String(profile?.playerName || '').trim() || 'this player';
  const firstName = playerName.split(' ')[0] || 'this player';

  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<FanSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(0);
  const [story, setStory] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const photosRef = useRef<PickedPhoto[]>([]);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const preparingPhotosRef = useRef(false);
  const preparationVersion = useRef(0);
  const sessionRequest = useRef(0);
  const reviewerRequest = useRef(0);
  const confirmationRequest = useRef(0);
  const [identityRefreshing, setIdentityRefreshing] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [approvedPreview, setApprovedPreview] = useState('');
  const replacePhotos = useCallback((next: PickedPhoto[]) => {
    photosRef.current = next;
    setPhotos(next);
  }, []);
  useEffect(() => () => {
    preparationVersion.current++;
    sessionRequest.current++;
    reviewerRequest.current++;
    confirmationRequest.current++;
    preparingPhotosRef.current = false;
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
    photosRef.current = [];
  }, []);
  // Reviewers can post as YAT?STATS (the crest) instead of as themselves.
  const [canPostAsYatstats, setCanPostAsYatstats] = useState(false);
  const [asYatstats, setAsYatstats] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const request = ++reviewerRequest.current;
    (async () => {
      await auth.authStateReady?.();
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/contribute/bulk', { credentials: 'include', cache: 'no-store', headers: token ? { 'x-firebase-token': token } : {} }).catch(() => null);
      const body = res?.ok ? await res.json().catch(() => null) : null;
      if (live && request === reviewerRequest.current) setCanPostAsYatstats(Boolean(body?.reviewer));
    })();
    return () => { live = false; };
  }, [open]);
  const [tags, setTags] = useState<TagCandidate[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [tagResults, setTagResults] = useState<TagCandidate[]>([]);
  const [status, setStatus] = useState<{ kind: 'idle' | 'posting' | 'error' | 'done'; text?: string; storyId?: string; confirm?: boolean }>({ kind: 'idle' });
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Rendered straight into <body>: inside the profile page's containers a
  // position:fixed drawer is pinned to the page section, not the screen.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const signedIn = Boolean(session?.uid && session?.email);
  const fanFirstName = String(session?.firstName || '').trim() || 'there';
  const postAsOfficial = canPostAsYatstats && asYatstats;
  const previewAuthor = postAsOfficial ? 'YAT?STATS' : [session?.firstName, session?.lastName].map((name) => String(name || '').trim()).filter(Boolean).join(' ') || 'A YAT?STATS fan';
  const needsConfirmation = status.kind === 'error' && Boolean(status.confirm);
  const previewReady = Boolean(photos.length && month && story.trim() && !preparingPhotos && !identityRefreshing && !needsConfirmation);
  // Approval applies to exactly the draft the fan reviewed. Any meaningful
  // edit invalidates it; a failed request leaves it available for a retry.
  const previewSignature = JSON.stringify([
    playerId, playerName, month, year, story, photos.map((photo) => [photo.id, photo.name]),
    tags.map((tag) => [tag.playerId, tag.displayName]), session?.uid, previewAuthor, postAsOfficial,
  ]);
  const previewApproved = previewReady && approvedPreview === previewSignature;
  const previewPrompt = identityRefreshing ? 'Refreshing your sign-in…'
    : needsConfirmation ? 'Confirm your sign-in below, then review your story.'
      : preparingPhotos ? 'Preparing your photos for preview…'
    : !photos.length ? 'Add a photo to preview your story.'
      : !month ? 'Choose the month to preview your story.'
        : 'Tell the story to see your preview.';

  const close = useCallback(() => {
    setOpen(false);
    clearStoryDrawerState(drawerOwner);
  }, [drawerOwner]);

  // This portal belongs to the player layout. Leaving that layout must not
  // leave a screen mask behind after the drawer itself has unmounted.
  useEffect(() => () => clearStoryDrawerState(drawerOwner), [drawerOwner]);

  // Other drawers use body classes to replace the active rail. Suspend this
  // drawer as well, without resetting the fan's draft, so its ARIA state and
  // Escape/mask handlers agree with the panel that is actually visible.
  useEffect(() => {
    if (!open) return;
    const sync = () => {
      const body = document.body;
      if (activeStoryDrawerOwner !== drawerOwner || !body.classList.contains('drawer-story-open') || OTHER_DRAWER_CLASSES.some((name) => body.classList.contains(name))) close();
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [open, close, drawerOwner]);

  const resetForm = useCallback(() => {
    preparationVersion.current++;
    preparingPhotosRef.current = false;
    setPreparingPhotos(false);
    setPhotoError('');
    setApprovedPreview('');
    setMonth(0);
    setStory('');
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
    replacePhotos([]);
    setTags([]);
    setTagQuery('');
    setTagResults([]);
    setStatus({ kind: 'idle' });
  }, [replacePhotos]);

  // Open from the Polaroid, with the year of the slide the fan is on.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<StoryDrawerOpenDetail>).detail || {};
      if (detail.playerId && detail.playerId !== playerId) return;
      // A live listener consumes the queued click immediately; a drawer
      // that hydrates later replays it once after registering below.
      takePendingStoryDrawerOpen(playerId);
      const slideYear = Number(detail.year);
      const thisYear = new Date().getFullYear();
      // Keep the fan's own pick when they come back to a story in progress
      // (e.g. after signing in).
      const inProgress = status.kind !== 'done' && (story.trim() !== '' || photos.length > 0 || preparingPhotosRef.current);
      if (!inProgress) setYear(Number.isInteger(slideYear) && slideYear > 1950 && slideYear <= thisYear + 1 ? slideYear : thisYear);
      if (status.kind === 'done') resetForm();
      activeStoryDrawerOwner = drawerOwner;
      setOpen(true);
      document.body.classList.remove(...OTHER_DRAWER_CLASSES, 'yat-left-search-mode');
      document.getElementById('drawerAccount')?.classList.remove('open', 'is-open', 'active');
      document.body.classList.add('drawer-story-open', 'drawer-open');
      setSessionLoading(true);
      const request = ++sessionRequest.current;
      fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (request !== sessionRequest.current) return;
          const nextSession = data?.authenticated ? (data.session as FanSession) : null;
          if (auth.currentUser?.uid && nextSession?.uid && auth.currentUser.uid !== nextSession.uid) {
            setApprovedPreview('');
            setStatus({ kind: 'error', confirm: true, text: 'Your sign-in changed. Confirm it below before reviewing your story.' });
          }
          setSession(nextSession);
        })
        .catch(() => { if (request === sessionRequest.current) setSession(null); })
        .finally(() => { if (request === sessionRequest.current) setSessionLoading(false); });
    };
    window.addEventListener(STORY_DRAWER_OPEN_EVENT, onOpen);
    const pending = takePendingStoryDrawerOpen(playerId);
    if (pending) onOpen(new CustomEvent<StoryDrawerOpenDetail>(STORY_DRAWER_OPEN_EVENT, { detail: pending }));
    return () => window.removeEventListener(STORY_DRAWER_OPEN_EVENT, onOpen);
  }, [resetForm, status.kind, story, photos.length, drawerOwner, playerId]);

  // Close on Escape or a tap on the dark mask.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onMask = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('.yat-drawer-mask')) close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onMask);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onMask);
    };
  }, [open, close]);

  // Player search for tagging.
  useEffect(() => {
    const q = tagQuery.trim();
    if (q.length < 2) {
      setTagResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/players/search?q=${encodeURIComponent(q)}&limit=8`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setTagResults(Array.isArray(data?.players) ? data.players : []))
        .catch(() => {});
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [tagQuery]);

  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const list: number[] = [];
    for (let y = thisYear + 1; y >= 1960; y--) list.push(y);
    return list;
  }, []);

  const addPhotos = async (files: FileList | null) => {
    if (!files || preparingPhotosRef.current || status.kind === 'posting') return;
    const room = MAX_PHOTOS - photosRef.current.length;
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name))
      .slice(0, Math.max(0, room));
    const input = fileInput.current;
    if (!picked.length) {
      if (input) input.value = '';
      return;
    }

    const version = ++preparationVersion.current;
    preparingPhotosRef.current = true;
    setPreparingPhotos(true);
    setPhotoError('');
    setApprovedPreview('');
    // Start every provider read immediately. Keep the native input alive
    // until these copies finish; compression then uses only memory blobs.
    const copies = await Promise.allSettled(picked.map(copyStoryPhoto));
    if (input) input.value = '';
    if (version !== preparationVersion.current) return;

    const errors: string[] = [];
    for (const copy of copies) {
      try {
        if (copy.status === 'rejected') throw copy.reason;
        // Decode one at a time to avoid holding several full phone-sized
        // image bitmaps in memory at once.
        const prepared = await prepareStoryPhoto(copy.value);
        if (version !== preparationVersion.current) return;
        const photo = { ...prepared, id: `${prepared.name}-${Math.random()}`, preview: URL.createObjectURL(prepared.blob) };
        replacePhotos([...photosRef.current, photo]);
      } catch (error) {
        if (version !== preparationVersion.current) return;
        errors.push(error instanceof Error ? error.message : 'That photo could not be prepared. Please choose it again.');
      }
    }
    setPhotoError(errors.join(' '));
    preparingPhotosRef.current = false;
    setPreparingPhotos(false);
  };

  const removePhoto = (id: string) => {
    const gone = photosRef.current.find((photo) => photo.id === id);
    if (gone) URL.revokeObjectURL(gone.preview);
    replacePhotos(photosRef.current.filter((photo) => photo.id !== id));
  };

  const addTag = (candidate: TagCandidate) => {
    if (candidate.playerId === playerId) return;
    setTags((current) => (current.length >= MAX_TAGS || current.some((t) => t.playerId === candidate.playerId) ? current : [...current, candidate]));
    setTagQuery('');
    setTagResults([]);
  };

  const showInStories = (storyId?: string) => {
    close();
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#ppTab-upload`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    if (storyId) window.dispatchEvent(new CustomEvent('yat:story-focus', { detail: { id: storyId } }));
    document.getElementById('playerFunZone')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const refreshConfirmedIdentity = async () => {
    const request = ++confirmationRequest.current;
    const sessionVersion = ++sessionRequest.current;
    const reviewerVersion = ++reviewerRequest.current;
    setApprovedPreview('');
    setCanPostAsYatstats(false);
    setAsYatstats(false);
    setIdentityRefreshing(true);
    setSessionLoading(false);
    setStatus({ kind: 'idle' });
    try {
      await auth.authStateReady?.();
      const user = auth.currentUser;
      const token = user ? await user.getIdToken().catch(() => '') : '';
      if (request !== confirmationRequest.current || sessionVersion !== sessionRequest.current) return;
      const [sessionResponse, reviewerResponse] = await Promise.all([
        fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/contribute/bulk', { credentials: 'include', cache: 'no-store', headers: token ? { 'x-firebase-token': token } : {} }).catch(() => null),
      ]);
      const data = await sessionResponse.json().catch(() => null);
      const reviewer = reviewerResponse?.ok ? await reviewerResponse.json().catch(() => null) : null;
      if (request !== confirmationRequest.current || sessionVersion !== sessionRequest.current) return;
      const nextSession = data?.authenticated ? (data.session as FanSession) : null;
      // FanConfirm may sign into a different account, and its login request
      // can fail. Never approve an old cookie author for a new token's post.
      if (!sessionResponse.ok || !nextSession?.uid || !nextSession.email ||
        auth.currentUser?.uid !== user?.uid || (user?.uid && nextSession.uid !== user.uid)) {
        throw new Error('Session does not match the confirmed account');
      }
      setSession(nextSession);
      if (reviewerVersion === reviewerRequest.current) setCanPostAsYatstats(Boolean(reviewer?.reviewer));
    } catch {
      if (request === confirmationRequest.current && sessionVersion === sessionRequest.current) {
        setStatus({ kind: 'error', confirm: true, text: 'We couldn’t refresh your sign-in. Please confirm again before posting.' });
      }
    } finally {
      if (request === confirmationRequest.current) setIdentityRefreshing(false);
      if (sessionVersion === sessionRequest.current) setSessionLoading(false);
    }
  };

  const submit = async () => {
    if (preparingPhotosRef.current || status.kind === 'posting') return;
    if (!month) return setStatus({ kind: 'error', text: 'Choose the month.' });
    if (!story.trim()) return setStatus({ kind: 'error', text: 'Tell the story behind this photo.' });
    if (photos.length === 0) return setStatus({ kind: 'error', text: 'Add at least one photo.' });
    if (!previewApproved) return setStatus({ kind: 'error', text: 'Check your preview and confirm it looks right before posting.' });

    setStatus({ kind: 'posting', text: 'Posting your story…' });
    try {
      // A Firebase ID token when this site has a Firebase user; if the fan
      // signed in on another yatstats.com site there isn't one here, and the
      // server uses the signed pass set at sign-in instead.
      await auth.authStateReady?.();
      if (auth.currentUser?.uid && auth.currentUser.uid !== session?.uid) {
        setApprovedPreview('');
        setStatus({ kind: 'error', confirm: true, text: 'Your sign-in changed. Confirm it below before reviewing your story.' });
        return;
      }
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';

      const form = new FormData();
      if (idToken) form.set('idToken', idToken);
      form.set('playerId', playerId);
      form.set('year', String(year));
      form.set('month', String(month));
      form.set('story', story.trim());
      form.set('tagged', JSON.stringify(tags.map((t) => t.playerId)));
      form.set('pageUrl', window.location.href);
      if (canPostAsYatstats && asYatstats) form.set('asYatstats', '1');
      for (const photo of photos) {
        form.append('photos', photo.blob, photo.name);
      }

      const { body, contentType } = await createStoryUploadBody(form);
      const res = await fetch('/api/stories', { method: 'POST', body, headers: { 'Content-Type': contentType }, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setApprovedPreview('');
        setStatus({ kind: 'error', confirm: true });
        return;
      }
      if (!res.ok) throw new Error(data?.error || 'Your story could not be posted. Please try again.');

      setStatus({ kind: 'done', storyId: data?.id });
      track('story_post', { moment_id: data?.id, moment_year: year, photo_count: photos.length, tagged_count: tags.length });
      window.dispatchEvent(new CustomEvent(STORY_POSTED_EVENT, { detail: { id: data?.id, playerIds: [playerId, ...tags.map((t) => t.playerId)] } }));
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Your story could not be posted.' });
    }
  };

  const posting = status.kind === 'posting';

  if (!portalReady) return null;

  return createPortal(
    <aside className="yat-drawer yat-drawer-right yat-story-drawer" id="drawerStory" aria-label="Add a story" aria-hidden={!open}>
      <div className="ysd-header">
        <div>
          <div className="ysd-kicker">Add a story</div>
          <h3 className="ysd-title">to {playerName}&apos;s Career Timeline</h3>
        </div>
        <button type="button" className="yat-icon-btn ysd-close" onClick={close} aria-label="Close">
          <i className="ri-close-line" />
        </button>
      </div>

      <div className="ysd-body">
        {sessionLoading ? (
          <p className="ysd-muted">Loading…</p>
        ) : !signedIn ? (
          <div className="ysd-gate">
            <p>Sign in to add a story to {firstName}&apos;s Career Timeline.</p>
            <p className="ysd-muted">Stories are posted from your YAT?STATS fan account. New here? Joining is free.</p>
            <div className="ysd-actions">
              <button type="button" className="ysd-btn ysd-btn-primary" onClick={() => openAccountDrawer('signin')}>Sign in</button>
              <button type="button" className="ysd-btn" onClick={() => openAccountDrawer('register')}>Join free</button>
            </div>
          </div>
        ) : status.kind === 'done' ? (
          <div className="ysd-done">
            <p className="ysd-done-title">Your story is live.</p>
            <p className="ysd-muted">It&apos;s in {firstName}&apos;s Stories{tags.length ? ` and on ${tags.length === 1 ? tags[0].displayName + "'s" : 'the tagged players\''} too` : ''}.</p>
            <div className="ysd-actions">
              <button type="button" className="ysd-btn ysd-btn-primary" onClick={() => showInStories(status.storyId)}>See it in Stories</button>
              <button type="button" className="ysd-btn" onClick={resetForm}>Add another</button>
            </div>
          </div>
        ) : (
          <>
            <div className="ysd-poster">Hi {fanFirstName}!</div>

            <div className="ysd-field">
              <div className="ysd-label">Photos <span className="ysd-muted">({photos.length}/{MAX_PHOTOS})</span></div>
              <div className="ysd-photos" aria-busy={preparingPhotos}>
                {photos.map((p) => (
                  <div className="ysd-photo" key={p.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt="" />
                    <button type="button" onClick={() => removePhoto(p.id)} aria-label="Remove photo" disabled={posting}>×</button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button type="button" className="ysd-photo-add" onClick={() => fileInput.current?.click()} disabled={preparingPhotos || posting}>
                    <i className="ri-image-add-line" aria-hidden="true" />
                    <span>Add photo</span>
                  </button>
                )}
              </div>
              <input ref={fileInput} type="file" accept="image/*" multiple hidden disabled={preparingPhotos || posting} onChange={(e) => { void addPhotos(e.target.files); }} />
              {preparingPhotos ? <div className="ysd-muted ysd-small" role="status">Preparing photos…</div> : null}
              {photoError ? <div className="ysd-error" role="alert">{photoError}</div> : null}
            </div>

            <div className="ysd-field">
              <label className="ysd-label" htmlFor="ysdTag">Anyone else in the photo? Tag players</label>
              {tags.length > 0 && (
                <div className="ysd-tags">
                  {tags.map((t) => (
                    <span className="ysd-tag" key={t.playerId}>
                      {t.displayName}
                      <button type="button" onClick={() => setTags((c) => c.filter((x) => x.playerId !== t.playerId))} aria-label={`Remove ${t.displayName}`} disabled={posting}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <input id="ysdTag" type="search" value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="Search players by name" autoComplete="off" disabled={posting || tags.length >= MAX_TAGS} />
              {tags.length >= MAX_TAGS ? <div className="ysd-muted ysd-small">Up to {MAX_TAGS} players can be tagged in a story.</div> : null}
              {tagResults.length > 0 && (
                <div className="ysd-results yat-gs-results" role="listbox" aria-label="Players">
                  {tagResults.filter((r) => r.playerId !== playerId).map((r) => {
                    const loc = [r.city, r.state].filter(Boolean).join(', ');
                    const subtitle = [r.schoolName, loc].filter(Boolean).join(' - ');
                    return (
                      <button type="button" key={r.playerId} className="yat-gs-result yat-gs-player" role="option" aria-selected={false} onClick={() => addTag(r)} disabled={posting || tags.length >= MAX_TAGS}>
                        <span className="yat-gs-result-top">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="yat-gs-result-crest"
                            src={r.crestUrl || CREST_FALLBACK}
                            alt=""
                            loading="lazy"
                            onError={(e) => { const img = e.currentTarget; if (!img.src.endsWith(CREST_FALLBACK)) img.src = CREST_FALLBACK; }}
                          />
                          <span className="yat-gs-result-info">
                            <span className="yat-gs-result-name">{r.displayName}</span>
                            {subtitle ? <span className="yat-gs-result-loc">{subtitle}</span> : null}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ysd-field">
              <div className="ysd-label">When was this?</div>
              <div className="ysd-date">
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Month" disabled={posting}>
                  <option value={0}>Month</option>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year" disabled={posting}>
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="ysd-muted ysd-small">
                {month ? `Goes on ${firstName}'s timeline in ${MONTHS[month - 1]} ${year}. Is that right?` : `Pick the month. A best guess is fine.`}
              </div>
            </div>

            <div className="ysd-field">
              <label className="ysd-label" htmlFor="ysdStory">Tell the story</label>
              <textarea
                id="ysdStory"
                rows={7}
                value={story}
                maxLength={10000}
                onChange={(e) => setStory(e.target.value)}
                disabled={posting}
                placeholder={`Where was this? What happened? Why does this moment with ${firstName} matter to you?`}
              />
            </div>

            {canPostAsYatstats ? (
              <label className="ysd-as">
                <input type="checkbox" checked={asYatstats} onChange={(e) => setAsYatstats(e.target.checked)} disabled={posting} />
                <span>Post as <b>YAT?STATS</b>, not as me</span>
              </label>
            ) : null}

            <section className="ysd-field ysd-review" aria-labelledby="ysdPreviewTitle">
              <div className="ysd-label" id="ysdPreviewTitle">Preview &amp; approve</div>
              {previewReady ? (
                <>
                  <StoryPreview photos={photos} story={story} author={previewAuthor} official={postAsOfficial} playerName={playerName} month={MONTHS[month - 1]} year={year} tags={tags} />
                  <label className={`ysd-approve${previewApproved ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={previewApproved} onChange={(e) => setApprovedPreview(e.target.checked ? previewSignature : '')} disabled={posting} />
                    <span>Looks right. This is the story I want to post.</span>
                  </label>
                </>
              ) : <div className="ysd-muted ysd-small">{previewPrompt}</div>}
            </section>

            {status.kind === 'error' && status.confirm ? (
              // Confirmation can change the posting identity. Refresh it and
              // review the current draft again, without an automatic post.
              <>
                {status.text ? <div className="ysd-error" role="alert">{status.text}</div> : null}
                <FanConfirm email={auth.currentUser?.email || session?.email} onConfirmed={() => { void refreshConfirmedIdentity(); }} />
              </>
            ) : status.kind === 'error' ? (
              <div className="ysd-error">{status.text}</div>
            ) : null}

            <div className="ysd-actions">
              <button type="button" className="ysd-btn ysd-btn-primary" onClick={submit} disabled={posting || !previewApproved}>
                {posting ? 'Posting…' : 'Post story'}
              </button>
            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        .ysd-as { display:flex; align-items:center; gap:8px; margin:12px 0 0; font:500 13px/1.35 var(--yat-font-ui, Archivo, Arial, sans-serif); cursor:pointer; }
        .ysd-as input { width: 18px; height: 18px; accent-color: #2e8b5f; }
        #drawerStory .ysd-review { gap:12px; min-width:0; }
        #drawerStory .ysd-approve { display:flex; align-items:center; gap:10px; padding:10px; border:1px solid var(--line); border-radius:8px; cursor:pointer; font:400 13px/1.4 var(--yat-font-ui, Archivo, Arial, sans-serif); }
        #drawerStory .ysd-approve input { flex:0 0 18px; width:18px; height:18px; accent-color:var(--ink); }
        #drawerStory .ysd-approve.is-on { border-color:var(--ink); background:var(--line); }
        body.drawer-story-open #drawerStory { transform: translateX(0); }
        body.drawer-story-open .yat-drawer-mask { opacity: 1; pointer-events: auto; }
        /* The generic drawer rail has a 360px !important cap. Preserve this
           form's approved 440px layout regardless of style injection order. */
        #drawerStory.yat-story-drawer { width:min(94vw,440px)!important; max-width:440px!important; font-family:var(--yat-font-ui, Archivo, Arial, sans-serif); }
        .ysd-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 16px 10px; border-bottom: 1px solid var(--line); }
        /* The YAT?STATS crest screened back behind the header, the same as
           the News reader drawer (ProfileContentDrawer): large at 15%
           opacity, bleeding off the right edge. */
        .ysd-header { position: relative; isolation: isolate; overflow: hidden; flex-shrink: 0; }
        .ysd-header::before { content: ""; position: absolute; z-index: -1; top: 50%; right: -14%; width: 62%; aspect-ratio: 1637/1281; transform: translateY(-50%); background: url("/img/ys-crest.png") center/contain no-repeat; opacity: .15; pointer-events: none; }
        body.light-theme .ysd-header::before { filter: invert(1); opacity: .09; }
        /* Use the same two-font hierarchy as Connect & Contribute: Archivo for
           interface copy/titles, Barlow Condensed for compact section labels.
           Preserve existing gold CTA and 8px-rounded fields. */
        .ysd-kicker { color:#FFD700; font:700 13px/1.1 var(--yat-font-compact, "Barlow Condensed", "Arial Narrow", sans-serif); letter-spacing:.07em; text-transform:uppercase; }
        body.light-theme .ysd-kicker { color: #9a6f00; }
        #drawerStory .ysd-title { margin:6px 0 0 !important; padding:0 !important; font:800 20px/1.12 var(--yat-font-ui, Archivo, Arial, sans-serif) !important; letter-spacing:-.025em!important; }
        .ysd-close { position: static !important; flex: none; }
        .ysd-body { flex-shrink:0; display:flex; flex-direction:column; gap:16px; padding:14px 16px 28px; font-family:var(--yat-font-ui, Archivo, Arial, sans-serif); }
        .ysd-muted { opacity: .65; }
        .ysd-small { font:400 12px/1.4 var(--yat-font-ui, Archivo, Arial, sans-serif); margin-top:6px; }
        .ysd-poster { font:800 18px/1.2 var(--yat-font-ui, Archivo, Arial, sans-serif); letter-spacing:-.025em; }
        .ysd-field { display: flex; flex-direction: column; gap: 6px; }
        .ysd-label { font:700 14px/1.1 var(--yat-font-compact, "Barlow Condensed", "Arial Narrow", sans-serif); letter-spacing:.06em; text-transform:uppercase; }
        .ysd-date { display: grid; grid-template-columns: 1.4fr 1fr; gap: 8px; }
        #drawerStory select, #drawerStory textarea, #drawerStory input[type="search"] {
          width: 100%; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,.06);
          color:var(--ink); padding:10px 12px; font:400 14px/1.45 var(--yat-font-ui, Archivo, Arial, sans-serif);
        }
        body.light-theme #drawerStory input[type="search"] { background: rgba(0,0,0,.06); }
        .yat-story-drawer textarea { resize: vertical; min-height: 140px; }
        .ysd-photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .ysd-photo, .ysd-photo-add { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); }
        .ysd-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ysd-photo button { position: absolute; top: 3px; right: 3px; width: 22px; height: 22px; border-radius: 50%; border: 0; background: rgba(0,0,0,.7); color: #fff; font-size: 15px; line-height: 1; cursor: pointer; }
        .ysd-photo-add { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; background:transparent; color:inherit; cursor:pointer; font:800 11px/1.15 var(--yat-font-ui, Archivo, Arial, sans-serif); letter-spacing:.01em; text-transform:uppercase; }
        .ysd-photo-add i { font-size: 22px; }
        .ysd-photo-add:disabled { opacity:.6; cursor:wait; }
        .ysd-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .ysd-tag { display:inline-flex; align-items:center; gap:6px; padding:4px 6px 4px 10px; border-radius:999px; background:rgba(255,215,0,.14); border:1px solid rgba(255,215,0,.6); font:600 12px/1.2 var(--yat-font-ui, Archivo, Arial, sans-serif); }
        .ysd-tag button { border: 0; background: none; color: inherit; font-size: 15px; cursor: pointer; }
        .ysd-results.yat-gs-results { max-height: none; overflow: visible; }
        .ysd-results .yat-gs-result { width: 100%; text-align: left; font: inherit; }
        .ysd-results .yat-gs-result:is(:hover,:focus-visible) { background:var(--line); border-radius:4px; }
        .ysd-error { color: #ff6b6b; font-size: 13px; }
        .ysd-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .ysd-btn { min-height:42px; padding:0 18px; border-radius:8px; border:1px solid #FFD700; background:transparent; color:#FFD700; font:800 12px/1.15 var(--yat-font-ui, Archivo, Arial, sans-serif); letter-spacing:.02em; text-transform:uppercase; cursor:pointer; }
        .ysd-btn-primary { background: #FFD700; color: #000; }
        body.light-theme .ysd-btn:not(.ysd-btn-primary) { border-color: #9a6f00; color: #9a6f00; }
        .ysd-btn:disabled { opacity: .6; cursor: wait; }
        .ysd-gate p, .ysd-done p { margin: 0 0 8px; line-height: 1.45; }
        .ysd-done-title { font:800 19px/1.15 var(--yat-font-ui, Archivo, Arial, sans-serif); letter-spacing:-.025em; }
      `}</style>
    </aside>,
    document.body
  );
}
