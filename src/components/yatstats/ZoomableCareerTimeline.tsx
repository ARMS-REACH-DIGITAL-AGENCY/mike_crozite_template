'use client';

import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
// Full-bleed hero carousel -- one slide per season, matching the corporate
// homepage slideshow's visual pattern. Replaces the old 156px filmstrip
// (--row3-h 100px + --row4-h 56px). Row4 stays folded to 0 (already merged
// into this one row); the extra height comes out of the FunZone panel's
// budget below via the --row3-h/--row4-h var overrides further down.
const HERO_H = 340;
const TIMELINE_YELLOW = '#ffb21c';
const HERO_BG = '/img/career-path-hero-bg.png';
const YS_CREST_FALLBACK = '/img/ys-crest.png';
const YATI_PLACEHOLDERS = [
  '/img/yati-placeholders/yati-standing-hips.png',
  '/img/yati-placeholders/yati-running-field.png',
  '/img/yati-placeholders/yati-catcher-back.png',
  '/img/yati-placeholders/yati-thinking.png',
];

type StatRow = {
  year?: string | number;
  team?: string;
  teamid?: string | number;
  team_id?: string | number;
  level?: string;
  org_conf?: string;
  league?: string;
  // batting
  avg?: string | number;
  bavg?: string | number;
  hr?: string | number;
  rbi?: string | number;
  // pitching
  w?: string | number;
  l?: string | number;
  era?: string | number;
  ip?: string | number;
};

type SlideKind = 'anchor' | 'season' | 'upload' | 'today';

type MomentComment = {
  id: string;
  contributor_name: string;
  body: string;
  created_at: string;
};

type Slide = {
  id: string;
  kind: SlideKind;
  year: number;
  title: string;
  caption?: string;
  headline?: string;
  src?: string;
  srcs?: string[];
  teamLogoSrcs?: string[];
  seasonCutoutSrc?: string;
  yatiFallback?: string;
  // upload-kind only
  momentDbId?: string;
  contributorName?: string;
  relationship?: string;
  reactionCount?: number;
  viewerReacted?: boolean;
  comments?: MomentComment[];
};

type SubmittedMoment = {
  id: string;
  title?: string;
  caption?: string;
  image_data_url?: string;
  image_url?: string;
  photo_taken_date?: string | null;
  photo_taken_year?: number | null;
  contributor_name?: string;
  relationship?: string;
  reaction_count?: number;
  viewer_reacted?: boolean;
  comments?: MomentComment[];
};

type FanSession = { uid: string; email: string; firstName?: string | null; lastName?: string | null };

function yearOf(value: unknown): number | null {
  const match = String(value ?? '').match(/\d{4}/);
  const year = match ? Number(match[0]) : NaN;
  return Number.isFinite(year) ? year : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeLevel(value: unknown) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('MLB')) return 'MLB';
  if (raw.includes('TRIPLE') || raw === 'AAA') return 'Triple-A';
  if (raw.includes('DOUBLE') || raw === 'AA') return 'Double-A';
  if (raw.includes('HIGH') || raw === 'A+') return 'High-A';
  if (raw.includes('LOW') || raw === 'A') return 'A Ball';
  if (raw.includes('ROOKIE') || raw === 'RK') return 'Rookie';
  if (raw.includes('INDY') || raw.includes('INDEPENDENT')) return 'INDY';
  if (raw.includes('NCAA-D1')) return 'NCAA-D1';
  if (raw.includes('NCAA-D2')) return 'NCAA-D2';
  if (raw.includes('NCAA-D3')) return 'NCAA-D3';
  if (raw.includes('NJCAA') || raw.includes('JUCO')) return 'JUCO';
  return raw;
}

function teamLogoCandidates(row: StatRow) {
  const teamId = String(row.teamid || row.team_id || '').trim();
  if (!teamId || !/^\d+$/.test(teamId)) return [];
  return [
    `${S3_BASE}/teams/${teamId}.png`,
    `${S3_BASE}/teams/${teamId}.jpg`,
    `${S3_BASE}/teams/${teamId}.jpeg`,
    `${S3_BASE}/teams/${teamId}.webp`,
    `${S3_BASE}/teams/${teamId}.PNG`,
    `${S3_BASE}/teams/${teamId}.JPG`,
  ];
}

// Season-specific hero cutout, keyed by {playerId}_{year} -- plain S3
// naming convention (no DB row, no filename-date parsing needed since the
// season year already IS the join key). Falls back through SmartImage's
// onError chain to a rotating YaTi placeholder when the real cutout
// doesn't exist yet.
function seasonCutoutCandidates(playerId: string, year: number) {
  return [`${S3_BASE}/players/season-cutouts/${encodeURIComponent(playerId)}_${year}.png`];
}

function yatiPlaceholderFor(index: number) {
  return YATI_PLACEHOLDERS[index % YATI_PLACEHOLDERS.length];
}

function firstName(full?: string) {
  return String(full || '').trim().split(/\s+/)[0] || 'Player';
}

function isCurrentHeadshotUrl(value: unknown, playerId: string) {
  const src = String(value || '').toLowerCase();
  const id = encodeURIComponent(playerId).toLowerCase();
  return Boolean(src && src.includes('/players/now/') && src.includes(`${id}.`));
}

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

// Plain, factual, computed-from-real-stats headline. No judgment calls, no
// invented narrative -- just the numbers, so it is never wrong and never
// empty for a season that has stats. A hand-written headline (added later,
// per player, per season) can override this; this is only the default.
function statLineHeadline(row: StatRow, teamName: string): string {
  const isPitching = row.w !== undefined || row.l !== undefined || row.era !== undefined || row.ip !== undefined;
  const parts: string[] = [];

  if (isPitching) {
    const w = row.w, l = row.l, era = row.era, ip = row.ip;
    if (w !== undefined && w !== '' && l !== undefined && l !== '') parts.push(`${w}-${l}`);
    if (era !== undefined && era !== '') parts.push(`${era} ERA`);
    if (ip !== undefined && ip !== '') parts.push(`${ip} IP`);
  } else {
    const avg = row.avg ?? row.bavg;
    if (avg !== undefined && avg !== '') parts.push(`${avg} AVG`);
    if (row.hr !== undefined && row.hr !== '' && Number(row.hr) > 0) parts.push(`${row.hr} HR`);
    if (row.rbi !== undefined && row.rbi !== '') parts.push(`${row.rbi} RBI`);
  }

  if (!parts.length) return teamName ? `Played for ${teamName}.` : 'A season on the roster.';
  return `${parts.join(' · ')}${teamName ? ` — ${teamName}` : ''}`;
}

function openAccountDrawer(tab: 'signin' | 'register') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: tab }));
  const drawer = document.getElementById('drawerAccount');
  const mask = document.getElementById('drawerMask');
  drawer?.classList.add('open', 'is-open', 'active');
  drawer?.setAttribute('aria-hidden', 'false');
  mask?.classList.add('open', 'is-open', 'active');
}

function useFanSession() {
  const [session, setSession] = useState<FanSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        setSession(data?.authenticated && data?.session?.uid ? (data.session as FanSession) : null);
      } catch {
        if (!cancelled) setSession(null);
      }
    }

    refresh();
    const onChange = () => refresh();
    window.addEventListener('yat-auth-success', onChange);
    window.addEventListener('yat-sign-out', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener('yat-auth-success', onChange);
      window.removeEventListener('yat-sign-out', onChange);
    };
  }, []);

  return session;
}

function SmartImage({ src, srcs, alt, className }: { src?: string; srcs?: string[]; alt: string; className?: string }) {
  const sources = useMemo(() => Array.from(new Set([...(srcs || []), ...(src ? [src] : [])].filter(Boolean))), [src, srcs]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [sources.join('|')]);
  const active = sources[index];
  if (!active) return null;
  return <img className={className} src={active} alt={alt} loading="eager" onError={() => setIndex((next) => next + 1)} />;
}

function ReactionButton({ moment, session, onToggled }: { moment: Slide; session: FanSession | null; onToggled: (id: string, reacted: boolean, count: number) => void }) {
  const [busy, setBusy] = useState(false);

  async function handleClick(event: MouseEvent) {
    event.stopPropagation();
    if (busy || !moment.momentDbId) return;

    if (!session) {
      openAccountDrawer('signin');
      return;
    }

    setBusy(true);
    const prevReacted = Boolean(moment.viewerReacted);
    const prevCount = moment.reactionCount || 0;
    onToggled(moment.id, !prevReacted, prevReacted ? Math.max(0, prevCount - 1) : prevCount + 1);

    try {
      const res = await fetch(`/api/player-moments/${moment.momentDbId}/react`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Reaction failed');
      onToggled(moment.id, Boolean(data.reacted), Number(data.count) || 0);
    } catch {
      onToggled(moment.id, prevReacted, prevCount);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={`zt-yatzaboy${moment.viewerReacted ? ' active' : ''}`} onClick={handleClick} disabled={busy}>
      <span>YAT-A-BOY</span>
      <b>{moment.reactionCount || 0}</b>
    </button>
  );
}

function MomentDetailModal({ moment, session, onClose, onCommentPosted, onReactionToggled }: { moment: Slide; session: FanSession | null; onClose: () => void; onCommentPosted: (id: string, comment: MomentComment) => void; onReactionToggled: (id: string, reacted: boolean, count: number) => void }) {
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [shareLabel, setShareLabel] = useState('Share');

  async function handleShare() {
    const shareUrl = `${window.location.origin}${window.location.pathname}#moment-${moment.momentDbId || moment.id}`;
    const shareData = { title: moment.title, text: moment.caption || moment.title, url: shareUrl };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareLabel('Link copied');
      setTimeout(() => setShareLabel('Share'), 2000);
    } catch {
      // Share sheet dismissed or clipboard blocked -- not an error worth surfacing.
    }
  }

  async function submitComment() {
    const body = draft.trim();
    if (!body || !moment.momentDbId) return;

    if (!session) {
      openAccountDrawer('signin');
      return;
    }

    setPosting(true);
    setError('');
    try {
      const res = await fetch(`/api/player-moments/${moment.momentDbId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Comment failed');
      onCommentPosted(moment.id, data.comment as MomentComment);
      setDraft('');
    } catch (err: any) {
      setError(err?.message || 'Comment failed');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="zt-modal-mask" onClick={onClose}>
      <div className="zt-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="zt-modal-close" onClick={onClose} aria-label="Close">
          <i className="ri-close-line" />
        </button>

        <div className="zt-modal-photo">
          <SmartImage src={moment.src} srcs={moment.srcs} alt={moment.title} />
        </div>

        <div className="zt-modal-body">
          {moment.relationship || moment.contributorName ? (
            <div className="zt-modal-kicker">{[moment.relationship, moment.contributorName].filter(Boolean).join(' · ')}</div>
          ) : null}
          <h3 className="zt-modal-title">{moment.title}</h3>
          {moment.caption ? <p className="zt-modal-caption">{moment.caption}</p> : null}

          <div className="zt-modal-reaction-row">
            <ReactionButton moment={moment} session={session} onToggled={onReactionToggled} />
            <button type="button" className="zt-share-btn" onClick={handleShare}>
              <i className="ri-share-forward-line" />
              {shareLabel}
            </button>
          </div>

          <div className="zt-modal-comments">
            {(moment.comments || []).length === 0 ? (
              <div className="zt-modal-empty">Be the first to say something about this memory.</div>
            ) : (
              (moment.comments || []).map((comment) => (
                <div className="zt-modal-comment" key={comment.id}>
                  <strong>{comment.contributor_name}</strong>
                  <span>{comment.body}</span>
                  <em>{timeAgo(comment.created_at)}</em>
                </div>
              ))
            )}
          </div>

          <div className="zt-modal-composer">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={session ? 'Write something on this memory...' : 'Sign in to comment...'}
              rows={2}
              maxLength={600}
            />
            <button type="button" onClick={submitComment} disabled={posting || !draft.trim()}>
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
          {error ? <div className="zt-modal-error">{error}</div> : null}
        </div>
      </div>

      <style jsx>{`
        .zt-modal-mask { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; padding:16px; }
        .zt-modal { position:relative; width:min(520px,100%); max-height:88vh; overflow-y:auto; background:#111; border:1px solid rgba(255,178,28,.28); border-radius:10px; }
        .zt-modal-close { position:absolute; top:8px; right:8px; z-index:2; width:30px; height:30px; border-radius:50%; border:0; background:rgba(0,0,0,.55); color:#fff; display:grid; place-items:center; cursor:pointer; }
        .zt-modal-photo { width:100%; aspect-ratio:4/3; background:#000; }
        .zt-modal-photo :global(img) { width:100%; height:100%; object-fit:contain; display:block; }
        .zt-modal-body { padding:16px 18px 18px; color:#fff; }
        .zt-modal-kicker { color:${TIMELINE_YELLOW}; font:700 10px/1 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; margin-bottom:6px; }
        .zt-modal-title { margin:0 0 6px; font:800 22px/1.05 'Bebas Neue',Oswald,sans-serif; letter-spacing:.03em; text-transform:uppercase; }
        .zt-modal-caption { margin:0 0 12px; color:rgba(255,255,255,.78); font:400 13px/1.45 system-ui,sans-serif; }
        .zt-modal-reaction-row { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
        .zt-share-btn { display:flex; align-items:center; gap:5px; height:22px; padding:0 10px; border:1px solid rgba(255,255,255,.3); border-radius:999px; background:rgba(255,255,255,.06); color:#fff; font:800 9px/1 Oswald,sans-serif; letter-spacing:.05em; text-transform:uppercase; cursor:pointer; }
        .zt-modal-comments { display:flex; flex-direction:column; gap:10px; padding:12px 0; border-top:1px solid rgba(255,255,255,.12); border-bottom:1px solid rgba(255,255,255,.12); max-height:220px; overflow-y:auto; }
        .zt-modal-empty { color:rgba(255,255,255,.5); font:400 12px/1.4 system-ui,sans-serif; }
        .zt-modal-comment { display:flex; flex-direction:column; gap:2px; }
        .zt-modal-comment strong { font:700 12px/1 Oswald,sans-serif; letter-spacing:.02em; color:${TIMELINE_YELLOW}; }
        .zt-modal-comment span { font:400 13px/1.4 system-ui,sans-serif; color:#fff; }
        .zt-modal-comment em { font:400 10px/1 system-ui,sans-serif; color:rgba(255,255,255,.45); font-style:normal; }
        .zt-modal-composer { display:flex; gap:8px; margin-top:12px; align-items:flex-end; }
        .zt-modal-composer textarea { flex:1; resize:none; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.18); border-radius:6px; color:#fff; padding:8px; font:400 13px/1.3 system-ui,sans-serif; }
        .zt-modal-composer button { flex-shrink:0; min-height:38px; padding:0 16px; border:1px solid ${TIMELINE_YELLOW}; border-radius:6px; background:rgba(255,178,28,.14); color:${TIMELINE_YELLOW}; font:800 11px/1 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; }
        .zt-modal-composer button:disabled { opacity:.5; cursor:wait; }
        .zt-modal-error { margin-top:8px; color:#ff8080; font:400 11px/1.3 system-ui,sans-serif; }
      `}</style>
    </div>
  );
}

export default function ZoomableCareerTimeline({ playerId, variant = 'combined' }: { playerId: string; variant?: 'combined' | 'images' | 'line' }) {
  const player = usePlayerProfile();
  const session = useFanSession();
  const [stats, setStats] = useState<StatRow[]>([]);
  const [uploads, setUploads] = useState<SubmittedMoment[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [uploadsLoaded, setUploadsLoaded] = useState(false);
  const [localOverrides, setLocalOverrides] = useState<Record<string, { reactionCount: number; viewerReacted: boolean; extraComments: MomentComment[] }>>({});
  const [openMomentId, setOpenMomentId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setStatsLoaded(false);
    fetch(`/api/player-season-stats?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const primary = data?.primaryType === 'batting' ? data?.batting : data?.pitching;
        const fallback = [
          ...(Array.isArray(data?.pitching) ? data.pitching : []),
          ...(Array.isArray(data?.batting) ? data.batting : []),
        ];
        setStats(Array.isArray(primary) && primary.length ? primary : fallback);
      })
      .catch(() => { if (!cancelled) setStats([]); })
      .finally(() => { if (!cancelled) setStatsLoaded(true); });
    return () => { cancelled = true; };
  }, [playerId]);

  useEffect(() => {
    let cancelled = false;
    setUploadsLoaded(false);
    setLocalOverrides({});
    initializedRef.current = false;
    fetch(`/api/player-moments?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setUploads(Array.isArray(data?.moments) ? data.moments : []); })
      .catch(() => { if (!cancelled) setUploads([]); })
      .finally(() => { if (!cancelled) setUploadsLoaded(true); });
    return () => { cancelled = true; };
  }, [playerId]);

  const model = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const statYears = stats.map((row) => yearOf(row.year)).filter((year): year is number => typeof year === 'number');
    const firstStatYear = statYears.length ? Math.min(...statYears) : currentYear;
    const hsYear = Math.max(1900, firstStatYear - 1);
    const endYear = Math.max(currentYear, ...statYears, firstStatYear);

    const seen = new Set<string>();
    const seasons: Slide[] = [];
    let seasonIndex = 0;
    stats.forEach((row) => {
      const year = yearOf(row.year);
      const team = String(row.team || '').trim();
      if (!year || !team) return;
      const level = normalizeLevel(row.level);
      const org = String(row.org_conf || row.league || '').trim();
      const key = `${year}|${team}|${level}|${org}`;
      if (seen.has(key)) return;
      seen.add(key);
      const teamLogoSrcs = teamLogoCandidates(row);
      seasons.push({
        id: `season-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        kind: 'season',
        year,
        title: team,
        caption: `${level}${org ? ` · ${org}` : ''}`,
        headline: statLineHeadline(row, team),
        teamLogoSrcs,
        seasonCutoutSrc: seasonCutoutCandidates(playerId, year)[0],
        yatiFallback: yatiPlaceholderFor(seasonIndex++),
      });
    });
    seasons.sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));

    const uploaded: Slide[] = uploads
      .filter((item) => !isCurrentHeadshotUrl(item.image_data_url, playerId))
      .map((item): Slide => {
        const year = item.photo_taken_year || yearOf(item.photo_taken_date) || hsYear;
        const override = localOverrides[`upload-${item.id}`];
        return {
          id: `upload-${item.id}`,
          kind: 'upload',
          year: clamp(year, hsYear, endYear),
          title: item.title || 'Fan memory',
          caption: item.caption || '',
          src: item.image_url || item.image_data_url,
          momentDbId: item.id,
          contributorName: item.contributor_name,
          relationship: item.relationship,
          reactionCount: override ? override.reactionCount : (item.reaction_count || 0),
          viewerReacted: override ? override.viewerReacted : Boolean(item.viewer_reacted),
          comments: [...(item.comments || []), ...(override?.extraComments || [])],
        };
      }).sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

    const anchor: Slide = {
      id: 'career-path-anchor',
      kind: 'anchor',
      year: hsYear,
      title: player?.playerName || 'High School',
    };

    const today: Slide = {
      id: 'current-headshot',
      kind: 'today',
      year: endYear,
      title: 'Today',
      src: `${S3_BASE}/players/now/${encodeURIComponent(playerId)}.jpg`,
    };

    const slides = [anchor, ...seasons, ...uploaded, today].sort((a, b) => a.year - b.year);
    // Keep the anchor pinned first regardless of year math -- it is always
    // where the carousel opens, per the fixed HS-slide-one design.
    const anchorPos = slides.findIndex((s) => s.kind === 'anchor');
    if (anchorPos > 0) slides.unshift(slides.splice(anchorPos, 1)[0]);

    return { startYear: hsYear, endYear, slides };
  }, [stats, uploads, playerId, localOverrides, player?.playerName]);

  const ready = statsLoaded && uploadsLoaded;

  useEffect(() => {
    if (!ready || initializedRef.current) return;
    initializedRef.current = true;
    setActiveIndex(0); // opens on the HS anchor slide
  }, [ready]);

  useEffect(() => {
    if (activeIndex > model.slides.length - 1) setActiveIndex(Math.max(0, model.slides.length - 1));
  }, [model.slides.length, activeIndex]);

  const openMoment = openMomentId ? model.slides.find((slide) => slide.id === openMomentId) || null : null;
  const activeSlide = model.slides[activeIndex];

  function handleReactionToggled(id: string, reacted: boolean, count: number) {
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: { reactionCount: count, viewerReacted: reacted, extraComments: prev[id]?.extraComments || [] },
    }));
  }

  function handleCommentPosted(id: string, comment: MomentComment) {
    setLocalOverrides((prev) => {
      const existing = prev[id];
      const fallbackMoment = model.slides.find((m) => m.id === id);
      return {
        ...prev,
        [id]: {
          reactionCount: existing ? existing.reactionCount : (fallbackMoment?.reactionCount || 0),
          viewerReacted: existing ? existing.viewerReacted : Boolean(fallbackMoment?.viewerReacted),
          extraComments: [...(existing?.extraComments || []), comment],
        },
      };
    });
  }

  function openUpload(year?: number) {
    try {
      if (year) {
        sessionStorage.setItem('yat:goldenLinePrefillYear', String(year));
        sessionStorage.setItem('yat:goldenLinePrefillDate', `${year}-07-01`);
        sessionStorage.setItem('yat:goldenLinePrefillPlayerName', String(player?.playerName || ''));
      }
    } catch {}
    window.location.hash = 'ppTab-upload';
    window.dispatchEvent(new CustomEvent('yat:golden-line-prefill', { detail: { year } }));
  }

  function goPrev() { setActiveIndex((i) => Math.max(0, i - 1)); }
  function goNext() { setActiveIndex((i) => Math.min(model.slides.length - 1, i + 1)); }

  function handleSlideClick(slide: Slide) {
    if (slide.kind === 'upload') setOpenMomentId(slide.id);
  }

  if (variant === 'line') {
    return null;
  }

  return (
    <section className="zt-shell-images yat-profile-career-strip" id="playerCareerImages">
      <div className="zt-hero-bg-layer" aria-hidden="true">
        <img className="zt-hero-bg-img" src={HERO_BG} alt="" />
      </div>

      <div className="zt-carousel">
        {ready && activeSlide && (
          <div key={activeSlide.id} className={`zt-slide zt-${activeSlide.kind}`}>
            <button type="button" className="zt-slide-surface" onClick={() => handleSlideClick(activeSlide)} title={activeSlide.title}>
              {activeSlide.kind === 'anchor' && (
                <>
                  <span className="zt-cutout-person-shell">
                    <SmartImage className="zt-cutout-person" src={`${S3_BASE}/players/cutouts/${encodeURIComponent(playerId)}.png`} alt={`${firstName(activeSlide.title)} cutout`} />
                  </span>
                  <span className="zt-slide-copy zt-anchor-copy">
                    <span className="zt-slide-name">{player?.playerName || activeSlide.title}</span>
                    <span className="zt-anchor-tagline">
                      When a baseball player&apos;s journey doesn&apos;t end at graduation...<br />
                      Neither should his story.
                    </span>
                  </span>
                </>
              )}

              {activeSlide.kind === 'season' && (
                <>
                  <span className="zt-team-badge">
                    <SmartImage className="zt-team-logo" srcs={activeSlide.teamLogoSrcs} src={YS_CREST_FALLBACK} alt={activeSlide.title} />
                  </span>
                  <span className="zt-cutout-person-shell">
                    <SmartImage className="zt-cutout-person" src={activeSlide.seasonCutoutSrc} srcs={[activeSlide.yatiFallback || YATI_PLACEHOLDERS[0]]} alt={`${player?.playerName || 'Player'} — ${activeSlide.year}`} />
                  </span>
                  <span className="zt-slide-copy">
                    <span className="zt-slide-name">{player?.playerName || ''}</span>
                    <span className="zt-slide-kicker">{activeSlide.year} · {activeSlide.title}</span>
                    <span className="zt-slide-headline">{activeSlide.headline}</span>
                    <span className="zt-slide-cta">Share an image of {firstName(player?.playerName || activeSlide.title)} that helps tell the story of his baseball journey.</span>
                  </span>
                  <button type="button" className="zt-upload-inline-cta" onClick={(e) => { e.stopPropagation(); openUpload(activeSlide.year); }}>
                    <i className="ri-upload-cloud-line" /> Add a photo
                  </button>
                </>
              )}

              {activeSlide.kind === 'today' && (
                <>
                  <span className="zt-cutout-person-shell">
                    <SmartImage className="zt-cutout-person zt-cutout-person-cover" src={activeSlide.src} alt="Current" />
                  </span>
                  <span className="zt-slide-copy">
                    <span className="zt-slide-name">{player?.playerName || ''}</span>
                    <span className="zt-slide-kicker">{activeSlide.year} · Today</span>
                  </span>
                </>
              )}

              {activeSlide.kind === 'upload' && (
                <>
                  <span className="zt-upload-bg">
                    <SmartImage src={activeSlide.src} alt={activeSlide.title} />
                  </span>
                  <span className="zt-upload-shade" />
                  <span className="zt-slide-copy">
                    {(activeSlide.relationship || activeSlide.contributorName) && (
                      <span className="zt-slide-kicker">
                        {[activeSlide.relationship, activeSlide.contributorName].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    <span className="zt-slide-name">{activeSlide.title}</span>
                    {activeSlide.caption ? <span className="zt-slide-headline">{activeSlide.caption}</span> : null}
                  </span>
                  <div className="zt-upload-actions">
                    <ReactionButton moment={activeSlide} session={session} onToggled={handleReactionToggled} />
                    <button type="button" className="zt-comment-pill" onClick={(e) => { e.stopPropagation(); setOpenMomentId(activeSlide.id); }}>
                      <i className="ri-chat-3-line" />
                      {(activeSlide.comments || []).length}
                    </button>
                  </div>
                </>
              )}
            </button>
          </div>
        )}

        {ready && model.slides.length > 1 && (
          <>
            <button type="button" className="zt-nav zt-nav-prev" onClick={goPrev} disabled={activeIndex === 0} aria-label="Previous">
              <i className="ri-arrow-left-s-line" />
            </button>
            <button type="button" className="zt-nav zt-nav-next" onClick={goNext} disabled={activeIndex === model.slides.length - 1} aria-label="Next">
              <i className="ri-arrow-right-s-line" />
            </button>
            <div className="zt-dots">
              {model.slides.map((slide, i) => (
                <button
                  type="button"
                  key={slide.id}
                  className={`zt-dot${i === activeIndex ? ' active' : ''}`}
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {openMoment && (
        <MomentDetailModal
          moment={openMoment}
          session={session}
          onClose={() => setOpenMomentId(null)}
          onCommentPosted={handleCommentPosted}
          onReactionToggled={handleReactionToggled}
        />
      )}

      <style jsx>{`
        .zt-shell-images { position:relative; height:100%; min-height:100%; overflow:hidden; color:#fff; background:transparent; }

        /* -- full-bleed field/fence background, ambient slow pan -- shared
           across every slide, same static asset repeated everywhere. */
        .zt-hero-bg-layer { position:absolute; inset:0; z-index:0; overflow:hidden; }
        .zt-hero-bg-img { position:absolute; top:50%; left:50%; width:112%; height:112%; max-width:none; object-fit:cover; transform:translate(-50%,-50%) scale(1); animation:zt-hero-pan 42s ease-in-out infinite alternate; }
        @keyframes zt-hero-pan { from { transform:translate(-50%,-50%) scale(1); } to { transform:translate(-52%,-48%) scale(1.06); } }

        .zt-carousel { position:relative; z-index:1; height:100%; width:100%; }
        .zt-slide { position:absolute; inset:0; }
        .zt-slide-surface { position:relative; display:block; width:100%; height:100%; border:0; padding:0; margin:0; background:transparent; cursor:default; overflow:hidden; text-align:left; }
        .zt-slide.zt-upload .zt-slide-surface { cursor:pointer; }

        /* -- shared foreground cutout (anchor / season / today) ---------- */
        .zt-cutout-person-shell { position:absolute; inset:0; z-index:2; display:block; pointer-events:none; }
        .zt-cutout-person-shell :global(.zt-cutout-person) { position:absolute; left:4%; bottom:0; width:auto; height:96%; max-width:46%; object-fit:contain; object-position:left bottom; filter:drop-shadow(0 8px 12px rgba(0,0,0,.6)); }
        .zt-cutout-person-shell :global(.zt-cutout-person-cover) { height:100%; max-width:none; width:38%; object-fit:cover; object-position:center top; left:0; border-radius:0 0 8px 0; }

        /* -- team logo badge, top-left, small graphic over the hero ------ */
        .zt-team-badge { position:absolute; z-index:3; top:14px; left:14px; width:52px; height:52px; border-radius:8px; background:rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.18); display:flex; align-items:center; justify-content:center; padding:6px; }
        .zt-team-badge :global(img) { width:100%; height:100%; object-fit:contain; }

        /* -- copy block, lower-left, matches the corporate hero pattern -- */
        .zt-slide-copy { position:absolute; z-index:3; left:22px; right:22px; bottom:20px; display:flex; flex-direction:column; gap:4px; max-width:56%; }
        .zt-slide-name { font:800 clamp(22px,4vw,34px)/1 'Bebas Neue',Oswald,sans-serif; letter-spacing:.02em; text-transform:uppercase; color:#fff; text-shadow:0 2px 10px rgba(0,0,0,.7); }
        .zt-slide-kicker { color:${TIMELINE_YELLOW}; font:700 11px/1.2 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; }
        .zt-slide-headline { color:rgba(255,255,255,.92); font:500 13px/1.35 Oswald,sans-serif; }
        .zt-slide-cta { color:rgba(255,255,255,.62); font:400 10.5px/1.35 system-ui,sans-serif; margin-top:2px; }

        .zt-anchor-copy { max-width:64%; gap:8px; }
        .zt-anchor-tagline { color:rgba(255,255,255,.94); font:600 15px/1.35 Oswald,sans-serif; }

        .zt-upload-inline-cta { position:absolute; z-index:3; top:14px; right:14px; display:flex; align-items:center; gap:5px; height:26px; padding:0 10px; border:1px solid rgba(255,178,28,.5); border-radius:999px; background:rgba(0,0,0,.5); color:${TIMELINE_YELLOW}; font:700 9.5px/1 Oswald,sans-serif; letter-spacing:.04em; text-transform:uppercase; cursor:pointer; }

        /* -- upload (fan moment) slide ------------------------------------ */
        .zt-upload-bg { position:absolute; inset:0; z-index:1; display:block; }
        .zt-upload-bg :global(img) { width:100%; height:100%; object-fit:cover; display:block; }
        .zt-upload-shade { position:absolute; inset:0; z-index:2; background:linear-gradient(180deg,rgba(4,5,6,.05) 0%,rgba(4,5,6,.2) 45%,rgba(4,5,6,.6) 70%,rgba(4,5,6,.92) 100%); pointer-events:none; }
        .zt-upload-actions { position:absolute; z-index:4; top:14px; right:14px; display:flex; gap:6px; }
        .zt-yatzaboy { display:flex; align-items:center; gap:4px; height:26px; padding:0 10px; border:1px solid rgba(255,178,28,.5); border-radius:999px; background:rgba(0,0,0,.55); color:${TIMELINE_YELLOW}; font:800 9px/1 Oswald,sans-serif; letter-spacing:.05em; cursor:pointer; }
        .zt-yatzaboy.active { background:${TIMELINE_YELLOW}; color:#1a1208; }
        .zt-yatzaboy b { font-size:10px; }
        .zt-comment-pill { display:flex; align-items:center; gap:4px; height:26px; padding:0 9px; border:1px solid rgba(255,255,255,.3); border-radius:999px; background:rgba(0,0,0,.55); color:#fff; font:700 10px/1 Oswald,sans-serif; cursor:pointer; }

        /* -- nav arrows + dots -------------------------------------------- */
        .zt-nav { position:absolute; z-index:5; top:50%; transform:translateY(-50%); width:34px; height:34px; border-radius:50%; border:1px solid rgba(255,255,255,.3); background:rgba(0,0,0,.45); color:#fff; display:grid; place-items:center; cursor:pointer; font-size:18px; }
        .zt-nav:disabled { opacity:.3; cursor:default; }
        .zt-nav-prev { left:10px; }
        .zt-nav-next { right:10px; }
        .zt-dots { position:absolute; z-index:5; left:0; right:0; bottom:6px; display:flex; justify-content:center; gap:5px; }
        .zt-dot { width:6px; height:6px; border-radius:50%; border:0; background:rgba(255,255,255,.35); padding:0; cursor:pointer; }
        .zt-dot.active { background:${TIMELINE_YELLOW}; }

        /* -- page-scoped layout: bigger hero row, header rows transparent
           over the hero image, funzone panel gets what's left. Same
           :has()-scoping idiom already used elsewhere in this codebase --
           anchored on body since row1/row2 are earlier DOM siblings of
           row3, not descendants, so :has() has to live above all three. */
        :global(body:has(.yat-profile-career-strip)) { --row3-h:${HERO_H}px !important; --row4-h:0px !important; }
        :global(body:has(.yat-profile-career-strip) .yat-row1-shell) { background:rgba(0,0,0,.55) !important; }
        :global(body:has(.yat-profile-career-strip) .yat-row2-shell) { background:transparent !important; border-color:transparent !important; }
        :global(body:has(.yat-profile-career-strip) .yat-row3-shell) { background:transparent !important; border-bottom:0 !important; }
        :global(.yat-row3-shell:has(.yat-profile-career-strip)) { min-height:${HERO_H}px !important; height:${HERO_H}px !important; overflow:hidden !important; }
        :global(.yat-row3-shell:has(.yat-profile-career-strip) ~ .yat-row4-shell) { min-height:0 !important; height:0 !important; overflow:hidden !important; border:0 !important; padding:0 !important; }
        :global(.yat-profile-career-strip) { height:${HERO_H}px !important; min-height:${HERO_H}px !important; }
      `}</style>
    </section>
  );
}
