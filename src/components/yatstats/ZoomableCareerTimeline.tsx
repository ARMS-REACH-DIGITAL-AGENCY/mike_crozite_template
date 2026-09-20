'use client';

import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
// One-slide-per-season carousel, matching the real corporate "story strip"
// (armsreach/sites/yatstats/audience-site.js's .story/.slide/.visual/.copy)
// exactly -- a grid split, photo confined to a fixed-width left column,
// copy in a completely separate right column on its own background. Text
// never touches the photo at any breakpoint, including mobile, where the
// grid stacks (photo band on top, copy below) instead of overlaying.
// Height stays close to the row3 budget this component already owned
// before this redesign (156px) rather than the corporate story strip's own
// literal height (226-310px) -- deliberately not touching the FunZone
// panel's height budget below this component.
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

  if (variant === 'line') {
    return null;
  }

  return (
    <section className="zt-shell-images yat-profile-career-strip" id="playerCareerImages">
      <div className="zt-carousel">
        {ready && activeSlide && (
          <div key={activeSlide.id} className={`zt-slide zt-${activeSlide.kind}`}>
            <button type="button" className="zt-slide-surface" onClick={() => handleSlideClick(activeSlide)} title={activeSlide.title}>
              {/* Photo confined to its own column -- never behind the copy,
                  at any breakpoint (stacked on top on mobile instead of
                  overlaid), matching audience-site.js's .visual/.copy grid
                  split exactly. */}
              <span className="zt-visual">
                {(activeSlide.kind === 'anchor' || activeSlide.kind === 'season') && (
                  <SmartImage className="zt-visual-bg" src={HERO_BG} alt="" />
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
                <span className="zt-visual-sheen" aria-hidden="true" />
                {activeSlide.kind === 'season' && (
                  <span className="zt-visual-badge">
                    <SmartImage srcs={activeSlide.teamLogoSrcs} src={YS_CREST_FALLBACK} alt={activeSlide.title} />
                  </span>
                )}
              </span>

              <span className="zt-copy">
                {activeSlide.kind === 'anchor' && (
                  <>
                    <span className="zt-kick">The hometown never stopped caring</span>
                    <span className="zt-title">A baseball player&apos;s journey does not end at graduation. Neither should his story.</span>
                    <span className="zt-bodycopy">Follow {firstName(player?.playerName || activeSlide.title)}&apos;s journey through college and professional baseball.</span>
                  </>
                )}
                {activeSlide.kind === 'season' && (
                  <>
                    <span className="zt-kick">{activeSlide.year} · {activeSlide.caption}</span>
                    <span className="zt-title">{activeSlide.title}</span>
                    <span className="zt-bodycopy">{activeSlide.headline}</span>
                    <button type="button" className="zt-upload-inline-cta" onClick={(e) => { e.stopPropagation(); openUpload(activeSlide.year); }}>
                      <i className="ri-upload-cloud-line" /> Share an image of {firstName(player?.playerName || activeSlide.title)}
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

        /* -- grid split, exact structure from the real corporate "story
           strip" (audience-site.js's .slide/.visual/.copy): photo confined
           to a fixed-width left column, copy in a totally separate right
           column on its own background. Never an overlay -- text can never
           sit on top of the photo at any breakpoint. */
        .zt-slide-surface { position:relative; display:grid; grid-template-columns:clamp(180px,29vw,340px) minmax(0,1fr); width:100%; height:100%; border:0; padding:0; margin:0; background:linear-gradient(135deg,#141618,#0b0c0d); cursor:default; overflow:hidden; text-align:left; }
        .zt-slide.zt-upload .zt-slide-surface { cursor:pointer; }

        .zt-visual { position:relative; overflow:hidden; border-right:1px solid rgba(255,255,255,.14); background:#25302d; }
        .zt-visual :global(.zt-visual-bg) { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; filter:brightness(.88) saturate(.95); }
        .zt-visual :global(.zt-person) { position:absolute; z-index:2; left:0; bottom:-2%; width:55%; height:103%; object-fit:contain; object-position:left bottom; filter:drop-shadow(0 14px 20px rgba(0,0,0,.4)); }
        .zt-visual :global(.zt-person-yati) { left:6%; bottom:-3%; width:48%; height:96%; object-position:center bottom; }
        .zt-visual :global(.zt-person-cover) { left:0; bottom:0; width:100%; height:100%; object-fit:cover; object-position:center top; }
        .zt-visual-sheen { position:absolute; z-index:3; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(0,0,0,.06),transparent 50%,rgba(0,0,0,.25)),linear-gradient(180deg,transparent 62%,rgba(0,0,0,.58)); }
        .zt-visual-badge { position:absolute; z-index:4; left:10px; top:10px; width:34px; height:34px; border-radius:6px; background:rgba(0,0,0,.45); border:1px solid rgba(255,255,255,.2); display:flex; align-items:center; justify-content:center; padding:4px; }
        .zt-visual-badge :global(img) { width:100%; height:100%; object-fit:contain; }

        .zt-copy { position:relative; display:flex; flex-direction:column; justify-content:center; gap:5px; padding:16px clamp(18px,3vw,32px) 16px clamp(14px,2.5vw,24px); background:radial-gradient(circle at 82% 8%,rgba(200,169,110,.10),transparent 32%); min-width:0; }
        .zt-kick { color:${TIMELINE_YELLOW}; font:500 9px/1.2 Oswald,sans-serif; letter-spacing:.13em; text-transform:uppercase; }
        .zt-title { max-width:100%; font:400 clamp(17px,2.4vw,30px)/1.05 'Bebas Neue',Oswald,sans-serif; letter-spacing:.01em; text-transform:uppercase; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .zt-anchor .zt-title { white-space:normal; -webkit-line-clamp:3; -webkit-box-orient:vertical; display:-webkit-box; overflow:hidden; }
        .zt-bodycopy { max-width:100%; color:#a5a8ac; font:300 clamp(10.5px,.9vw,13px)/1.4 Oswald,sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .zt-anchor .zt-bodycopy { white-space:normal; }

        .zt-upload-inline-cta { align-self:flex-start; margin-top:4px; display:flex; align-items:center; gap:5px; height:24px; padding:0 9px; border:1px solid rgba(255,178,28,.5); border-radius:999px; background:rgba(255,178,28,.1); color:${TIMELINE_YELLOW}; font:700 8.5px/1 Oswald,sans-serif; letter-spacing:.03em; text-transform:uppercase; cursor:pointer; }

        .zt-upload-actions { display:flex; gap:6px; margin-top:6px; }
        .zt-yatzaboy { display:flex; align-items:center; gap:4px; height:24px; padding:0 9px; border:1px solid rgba(255,178,28,.5); border-radius:999px; background:rgba(0,0,0,.35); color:${TIMELINE_YELLOW}; font:800 8px/1 Oswald,sans-serif; letter-spacing:.05em; cursor:pointer; }
        .zt-yatzaboy.active { background:${TIMELINE_YELLOW}; color:#1a1208; }
        .zt-yatzaboy b { font-size:9px; }
        .zt-comment-pill { display:flex; align-items:center; gap:4px; height:24px; padding:0 8px; border:1px solid rgba(255,255,255,.3); border-radius:999px; background:rgba(0,0,0,.35); color:#fff; font:700 9px/1 Oswald,sans-serif; cursor:pointer; }

        /* -- nav arrows + dots -------------------------------------------- */
        .zt-nav { position:absolute; z-index:5; top:50%; transform:translateY(-50%); width:30px; height:30px; border-radius:50%; border:1px solid rgba(255,255,255,.3); background:rgba(0,0,0,.45); color:#fff; display:grid; place-items:center; cursor:pointer; font-size:16px; }
        .zt-nav:disabled { opacity:.3; cursor:default; }
        .zt-nav-prev { left:6px; }
        .zt-nav-next { right:6px; }
        .zt-dots { position:absolute; z-index:5; left:0; right:0; bottom:4px; display:flex; justify-content:center; gap:5px; }
        .zt-dot { width:6px; height:6px; border-radius:50%; border:0; background:rgba(255,255,255,.35); padding:0; cursor:pointer; }
        .zt-dot.active { background:${TIMELINE_YELLOW}; }

        /* Height stays entirely local to this component's own row3/row4 --
           the same two rules this file already had before this redesign,
           just a bigger number. Deliberately NOT touching --row3-h/--row4-h
           vars or .pp-funzone-outer (that's the FunZone panel below this
           component, out of scope for this pass). */
        :global(.yat-row3-shell:has(.yat-profile-career-strip)) { min-height:${ROW_H}px !important; height:${ROW_H}px !important; overflow:hidden !important; }
        :global(.yat-row3-shell:has(.yat-profile-career-strip) ~ .yat-row4-shell) { min-height:0 !important; height:0 !important; overflow:hidden !important; border:0 !important; padding:0 !important; }
        :global(.yat-profile-career-strip) { height:${ROW_H}px !important; min-height:${ROW_H}px !important; }

        /* -- responsive steps, exact breakpoints and column ratios from
           audience-site.js's own @media max-width:900px / 620px. Below
           620px the grid stacks (photo band on top, copy below) instead of
           splitting side by side -- never an overlay. */
        @media (max-width:900px) {
          .zt-slide-surface { grid-template-columns:34% 66%; }
          .zt-copy { padding:12px 14px 12px; }
        }
        @media (max-width:620px) {
          .zt-slide-surface { grid-template-columns:1fr; grid-template-rows:38% 62%; }
          .zt-visual { border-right:0; border-bottom:1px solid rgba(255,255,255,.14); }
          .zt-visual :global(.zt-person) { width:40%; height:110%; }
          .zt-copy { justify-content:flex-start; padding-top:10px; gap:3px; }
          .zt-title { font-size:16px; }
          .zt-bodycopy { font-size:10px; }
        }
      `}</style>
    </section>
  );
}
