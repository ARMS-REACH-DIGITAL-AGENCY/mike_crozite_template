'use client';

import { MouseEvent, TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
// One-slide-per-season carousel. ONE continuous frame -- no grid split, no
// second box, no border -- at every breakpoint. The cutout is confined to
// roughly the left third of the frame; copy sits in the right two-thirds,
// vertically centered, over a gradient that darkens specifically on that
// side for legibility. Same single-frame structure on mobile too, just
// smaller type -- it never restructures into two stacked boxes.
// Height stays local to the row3 budget this component already owned
// before this redesign (156px), just a bigger number -- deliberately not
// touching the FunZone panel's height budget below this component.
const ROW_H = 260;
const TIMELINE_YELLOW = '#ffb21c';
// Same asset the corporate hero and this component's own HS anchor slide
// have always pointed at (audience-site.js's BG) -- one canonical
// background image, not a separate copy.
const HERO_BG = '/img/career-path-default.png';
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

  // Finger-swipe through slides, matching the corporate site's touch
  // carousel. A short/near-vertical touch is left alone so it still
  // registers as a tap (opening an upload moment, etc); only a real
  // horizontal drag past the threshold advances the slide.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(event: ReactTouchEvent) {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }
  function handleTouchEnd(event: ReactTouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) goNext(); else goPrev();
  }

  if (variant === 'line') {
    return null;
  }

  return (
    <>
      {/* Sits behind the sticky header rows (fixed, not part of row3's own
          box) so the hero photo reads as one continuous backdrop under
          rows 1 & 2 with their icons/logo on top of it, instead of the
          photo being boxed in below them. */}
      <div className="zt-hero-bleed" aria-hidden="true">
        <SmartImage className="zt-hero-bleed-bg" src={HERO_BG} alt="" />
      </div>
      <section className="zt-shell-images yat-profile-career-strip" id="playerCareerImages">
      <div className="zt-carousel" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {ready && activeSlide && (
          <div key={activeSlide.id} className={`zt-slide zt-${activeSlide.kind}`}>
            <button type="button" className="zt-slide-surface" onClick={() => handleSlideClick(activeSlide)} title={activeSlide.title}>
              {/* Layers, stacked in this exact order -- matching the real
                  corporate site's layered-story-strip.js: (1) full-bleed
                  background photo, (2) a gradient that darkens toward the
                  right so text is legible there, (3) the team logo as its
                  own big plain layer on the right -- no box, no border,
                  just a large image -- (4) the player cutout confined to a
                  narrow strip on the left, (5) a thin gold baseline, then
                  (6) the copy, offset past the cutout, on top of everything. */}
              <span className="zt-visual">
                {/* No per-slide background image here for anchor/season --
                    the fixed .zt-hero-bleed layer behind rows 1-3 already
                    shows this same photo, and row3's own background is
                    transparent so it shows through as one continuous
                    image with no seam between a second, separately-cropped
                    copy. */}
                <span className="zt-visual-gradient" aria-hidden="true" />
                {activeSlide.kind === 'season' && (
                  <span className="zt-logo-layer" aria-hidden="true">
                    <SmartImage srcs={activeSlide.teamLogoSrcs} src={YS_CREST_FALLBACK} alt="" />
                  </span>
                )}
                {activeSlide.kind === 'anchor' && (
                  <span className="zt-logo-layer" aria-hidden="true">
                    <SmartImage src={YS_CREST_FALLBACK} alt="" />
                  </span>
                )}
                {activeSlide.kind === 'anchor' && (
                  <SmartImage className="zt-person" src={`${S3_BASE}/players/cutouts/${encodeURIComponent(playerId)}.png`} alt={`${firstName(activeSlide.title)} cutout`} />
                )}
                {activeSlide.kind === 'season' && (
                  <SmartImage className="zt-person zt-person-yati" src={activeSlide.seasonCutoutSrc} srcs={[activeSlide.yatiFallback || YATI_PLACEHOLDERS[0]]} alt={`${player?.playerName || 'Player'} — ${activeSlide.year}`} />
                )}
                {activeSlide.kind === 'today' && (
                  <SmartImage className="zt-person zt-person-cover" src={activeSlide.src} alt="Current" />
                )}
                {activeSlide.kind === 'upload' && (
                  <SmartImage className="zt-person zt-person-cover" src={activeSlide.src} alt={activeSlide.title} />
                )}
                <span className="zt-visual-baseline" aria-hidden="true" />
              </span>

              <span className="zt-copy">
                {activeSlide.kind === 'anchor' && (
                  <>
                    <span className="zt-kick">The hometown never stopped caring</span>
                    <span className="zt-title">A baseball player&apos;s journey does not end at graduation. Neither should his story.</span>
                    <span className="zt-bodycopy">Follow {player?.playerName ? firstName(player.playerName) : 'his'} journey through college and professional baseball.</span>
                  </>
                )}
                {activeSlide.kind === 'season' && (
                  <>
                    <span className="zt-kick">{activeSlide.year} · {activeSlide.caption}</span>
                    <span className="zt-title">{activeSlide.title}</span>
                    <span className="zt-bodycopy">{activeSlide.headline}</span>
                    <button type="button" className="zt-upload-inline-cta" onClick={(e) => { e.stopPropagation(); openUpload(activeSlide.year); }}>
                      <i className="ri-upload-cloud-line" /> Share an image of {player?.playerName ? firstName(player.playerName) : 'him'}
                    </button>
                  </>
                )}
                {activeSlide.kind === 'today' && (
                  <>
                    <span className="zt-kick">{activeSlide.year}</span>
                    <span className="zt-title">{player?.playerName || ''}</span>
                  </>
                )}
                {activeSlide.kind === 'upload' && (
                  <>
                    {(activeSlide.relationship || activeSlide.contributorName) && (
                      <span className="zt-kick">{[activeSlide.relationship, activeSlide.contributorName].filter(Boolean).join(' · ')}</span>
                    )}
                    <span className="zt-title">{activeSlide.title}</span>
                    {activeSlide.caption ? <span className="zt-bodycopy">{activeSlide.caption}</span> : null}
                    <div className="zt-upload-actions">
                      <ReactionButton moment={activeSlide} session={session} onToggled={handleReactionToggled} />
                      <button type="button" className="zt-comment-pill" onClick={(e) => { e.stopPropagation(); setOpenMomentId(activeSlide.id); }}>
                        <i className="ri-chat-3-line" />
                        {(activeSlide.comments || []).length}
                      </button>
                    </div>
                  </>
                )}
              </span>
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
        .zt-carousel { position:relative; height:100%; width:100%; }
        .zt-slide { position:absolute; inset:0; }

        /* -- one continuous layered frame, exact recipe from the real
           corporate site's layered-story-strip.js (verified by rendering
           the actual production script locally): background photo, a
           gradient that darkens toward the right, the cutout confined to a
           narrow left strip, and copy positioned past it with padding, not
           absolute-pinned -- so it's never behind the photo and there is no
           second box or border anywhere. */
        .zt-slide-surface { position:relative; width:100%; height:100%; border:0; padding:0; margin:0; background:transparent; cursor:default; overflow:hidden; text-align:left; isolation:isolate; }
        .zt-slide.zt-upload .zt-slide-surface { cursor:pointer; }

        .zt-visual { position:absolute; z-index:1; inset:0; overflow:hidden; background:transparent; }
        .zt-visual-gradient { position:absolute; z-index:2; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(0,0,0,.05) 0%,rgba(0,0,0,.12) 20%,rgba(4,5,6,.82) 43%,rgba(4,5,6,.97) 72%,#040506 100%),linear-gradient(180deg,rgba(0,0,0,.12),transparent 55%,rgba(0,0,0,.48)); }

        /* -- team logo: its own big plain layer on the right, bleeding off
           the edge of the frame -- matching the real corporate hero, where
           the ghosted crest is only partly visible, clipped by the frame's
           right edge, not fully contained inside it. */
        .zt-logo-layer { position:absolute; z-index:3; top:4%; bottom:4%; right:-14%; width:56%; display:flex; align-items:center; justify-content:center; opacity:.4; pointer-events:none; }
        .zt-logo-layer :global(img) { width:100%; height:100%; object-fit:contain; }

        .zt-visual :global(.zt-person) { position:absolute; z-index:4; left:2.5%; bottom:-4%; width:clamp(126px,15vw,224px); height:108%; max-width:none; object-fit:contain; object-position:left bottom; filter:drop-shadow(0 14px 22px rgba(0,0,0,.44)); }
        .zt-visual :global(.zt-person-yati) { left:4%; bottom:-6%; width:clamp(112px,13vw,194px); height:104%; object-position:center bottom; }
        .zt-visual :global(.zt-person-cover) { left:0; bottom:0; width:100%; height:100%; max-width:none; object-fit:cover; object-position:center top; }
        .zt-visual-baseline { position:absolute; z-index:5; left:0; right:0; bottom:0; height:2px; background:linear-gradient(90deg,rgba(200,169,110,.25),#d3aa48 28%,#efd070 55%,rgba(200,169,110,.24)); box-shadow:0 0 16px rgba(211,170,72,.28); pointer-events:none; }

        /* Starts past the photo, roughly a third of the way in, and runs
           into the ghosted logo's left edge (the logo is faint enough that
           text stays legible over it) -- matching the real corporate
           hero's proportions: kicker/headline/bodycopy stacked and
           vertically centered in the space above the bottom chrome bar.
           Font declarations are split into separate properties instead of
           the "font:" shorthand: the shorthand's own commas (font-family
           list) and slash (size/line-height) combined with clamp()'s
           internal commas was silently dropping the whole declaration in
           production, which is why this text was invisible there. */
        .zt-copy { position:absolute; z-index:6; left:30%; right:5%; top:0; bottom:22px; display:flex; flex-direction:column; justify-content:center; background:transparent; }
        .zt-kick, .zt-title, .zt-bodycopy { min-width:0; }
        .zt-kick { display:block; margin:0 0 4px; color:${TIMELINE_YELLOW}; font-family:Oswald,sans-serif; font-weight:600; font-size:10px; line-height:1.2; letter-spacing:.13em; text-transform:uppercase; }
        .zt-title { display:block; width:100%; margin:0 0 5px; font-family:Oswald,sans-serif; font-weight:700; font-size:20px; line-height:1.08; letter-spacing:.005em; text-transform:uppercase; color:#f7f7f5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .zt-anchor .zt-title { white-space:normal; overflow-wrap:anywhere; }
        .zt-bodycopy { display:block; width:100%; margin:0; color:#aeb2b6; font-family:Oswald,sans-serif; font-weight:300; font-size:10.5px; line-height:1.35; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .zt-anchor .zt-bodycopy { white-space:normal; overflow-wrap:anywhere; }

        .zt-upload-inline-cta { margin-top:4px; display:inline-flex; align-items:center; gap:5px; height:24px; padding:0 9px; border:1px solid rgba(255,178,28,.5); border-radius:999px; background:rgba(255,178,28,.1); color:${TIMELINE_YELLOW}; font:700 8.5px/1 Oswald,sans-serif; letter-spacing:.03em; text-transform:uppercase; cursor:pointer; }

        .zt-upload-actions { display:flex; gap:6px; margin-top:6px; }
        .zt-yatzaboy { display:flex; align-items:center; gap:4px; height:24px; padding:0 9px; border:1px solid rgba(255,178,28,.5); border-radius:999px; background:rgba(0,0,0,.35); color:${TIMELINE_YELLOW}; font:800 8px/1 Oswald,sans-serif; letter-spacing:.05em; cursor:pointer; }
        .zt-yatzaboy.active { background:${TIMELINE_YELLOW}; color:#1a1208; }
        .zt-yatzaboy b { font-size:9px; }
        .zt-comment-pill { display:flex; align-items:center; gap:4px; height:24px; padding:0 8px; border:1px solid rgba(255,255,255,.3); border-radius:999px; background:rgba(0,0,0,.35); color:#fff; font:700 9px/1 Oswald,sans-serif; cursor:pointer; }

        /* -- bottom chrome: a segmented progress bar plus a pair of square
           prev/next buttons at the bottom-right, matching the real
           corporate hero's bottom bar (sitting just above its baseline
           gold line), not round dots and mid-edge circular arrows. */
        .zt-nav { position:absolute; z-index:7; bottom:5px; top:auto; transform:none; width:20px; height:20px; border-radius:3px; border:1px solid rgba(255,255,255,.32); background:rgba(0,0,0,.4); color:#fff; display:grid; place-items:center; cursor:pointer; font-size:13px; }
        .zt-nav:disabled { opacity:.3; cursor:default; }
        .zt-nav-prev { right:30px; left:auto; }
        .zt-nav-next { right:6px; }
        .zt-dots { position:absolute; z-index:6; left:6%; right:60px; bottom:11px; display:flex; align-items:center; gap:4px; }
        .zt-dot { flex:1; max-width:20px; height:2.5px; border-radius:1px; border:0; background:rgba(255,255,255,.28); padding:0; cursor:pointer; }
        .zt-dot.active { background:${TIMELINE_YELLOW}; }

        /* Height stays entirely local to this component's own row3/row4 --
           the same two rules this file already had before this redesign,
           just a bigger number. Deliberately NOT touching --row3-h/--row4-h
           vars or .pp-funzone-outer (that's the FunZone panel below this
           component, out of scope for this pass). */
        :global(.yat-row3-shell:has(.yat-profile-career-strip)) { min-height:${ROW_H}px !important; height:${ROW_H}px !important; overflow:hidden !important; background:transparent !important; }
        :global(.yat-row3-shell:has(.yat-profile-career-strip) ~ .yat-row4-shell) { min-height:0 !important; height:0 !important; overflow:hidden !important; border:0 !important; padding:0 !important; }
        :global(.yat-profile-career-strip) { height:${ROW_H}px !important; min-height:${ROW_H}px !important; }

        /* The hero photo reads as one continuous backdrop under the sticky
           header rows (school logo, hamburger, search, YAT?STATS crest)
           instead of a separate boxed strip below them: this fixed layer
           sits behind rows 1 & 2 (z-index below their 70/65, above row3's
           own 60) and their backgrounds are made transparent so the icons
           paint directly on top of the photo. Row3 itself is untouched --
           it keeps clipping its own carousel horizontally as before. */
        .zt-hero-bleed { position:fixed; z-index:58; top:0; left:0; right:0; height:calc(var(--row1-h, 36px) + var(--row2-h, 54px) + ${ROW_H}px); overflow:hidden; pointer-events:none; background:#060708; }
        .zt-hero-bleed :global(.zt-hero-bleed-bg) { position:absolute; inset:0; width:100%; height:100%; max-width:none; object-fit:cover; object-position:center 48%; filter:brightness(.78) saturate(.94); }
        :global(.yat-row1-shell:has(~ main .yat-profile-career-strip)) { background:transparent !important; }
        :global(.yat-row2-shell:has(~ main .yat-profile-career-strip)) { background:transparent !important; border-color:transparent !important; }

        /* -- responsive: proportions only, same single layered frame at
           every width (never restructures into a grid or stacks into two
           boxes) -- exact scaling from layered-story-strip.js's own
           @media max-width:900px / 620px. */
        @media (max-width:900px) {
          .zt-visual :global(.zt-person) { width:clamp(108px,23vw,172px); height:107%; }
          .zt-logo-layer { width:50%; right:-12%; }
          .zt-copy { left:clamp(120px,28vw,220px); right:5%; bottom:20px; }
          .zt-title { font-size:clamp(15px,3.4vw,22px); }
          .zt-bodycopy { font-size:clamp(8.5px,1.6vw,10.5px); }
        }
        @media (max-width:620px) {
          .zt-hero-bleed :global(.zt-hero-bleed-bg) { object-position:44% 50%; }
          .zt-visual-gradient { background:linear-gradient(90deg,rgba(0,0,0,.04) 0%,rgba(3,4,5,.32) 22%,rgba(3,4,5,.90) 47%,#030405 100%),linear-gradient(180deg,rgba(0,0,0,.10),transparent 55%,rgba(0,0,0,.50)); }
          .zt-visual :global(.zt-person) { left:1%; bottom:-3%; width:clamp(78px,27vw,112px); height:104%; }
          .zt-visual :global(.zt-person-yati) { left:3%; width:clamp(70px,24vw,102px); }
          .zt-logo-layer { width:58%; right:-14%; opacity:.35; }
          .zt-copy { left:34%; right:4%; bottom:18px; }
          .zt-kick { font-size:7px; margin-bottom:3px; }
          .zt-title { font-size:clamp(13px,4.2vw,17px); margin-bottom:3px; }
          .zt-bodycopy { font-size:clamp(7.5px,1.8vw,9px); }
        }
      `}</style>
    </section>
    </>
  );
}
