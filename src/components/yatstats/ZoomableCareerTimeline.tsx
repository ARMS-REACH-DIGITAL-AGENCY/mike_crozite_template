'use client';

import { MouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
// One-slide-per-season carousel. ONE continuous frame -- no grid split, no
// second box, no border -- at every breakpoint. The cutout is confined to
// roughly the left third of the frame; copy sits in the right two-thirds,
// vertically centered, over a gradient that darkens specifically on that
// side for legibility. Same single-frame structure on mobile too, just
// smaller type -- it never restructures into two stacked boxes.
// Height stays local to the row3 budget this component already owned
// before this redesign (156px). Now that the background photo bleeds up
// behind rows 1 & 2, row3 itself doesn't need to carry that height on its
// own to read as a full hero -- shrunk from 260 accordingly. Deliberately
// not touching the FunZone panel's height budget below this component.
const ROW_H = 200;
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
  age?: string | number;
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

type SlideKind = 'anchor' | 'season' | 'upload' | 'today' | 'lifeyear';

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
  // lifeyear-kind only (the empty, no-photo-yet placeholder for a
  // pre-high-school year of the player's life)
  age?: number;
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
  // Continuous scroll position, in slide-widths (1.35 == 35% of the way from
  // slide 1 into slide 2) -- the source of truth for both which slide reads
  // as "active" (dots/arrows) and how far each slide's hero visual has
  // dissolved in/out, instead of a plain integer index that only ever jumps.
  const [scrollProgress, setScrollProgress] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dragging: boolean; moved: boolean; startX: number; startScroll: number; pointerId: number | null }>({ dragging: false, moved: false, startX: 0, startScroll: 0, pointerId: null });
  const scrollRafRef = useRef<number | null>(null);
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
    const endYear = Math.max(currentYear, ...statYears, firstStatYear);

    // We can't count on knowing a player's real DOB, so the life-year
    // screens before high school are standardized: always exactly 17 of
    // them (ages 1-17), with HS always the 18th screen -- rather than
    // however many actually happened to fall before a per-player derived
    // birth year (which would make some players' HS screen the 17th, some
    // the 18th, some the 15th depending on data quality). When a stat row's
    // age field lets us derive a real birth year we still use it, purely to
    // pick a more accurate hsYear (and thus real calendar years for those
    // 17 screens, so an already-dated fan photo can land in the right one);
    // when it can't be derived, hsYear falls back to the old
    // firstStatYear-1 heuristic and the 17 screens just count back from
    // that -- either way there are always 17 of them.
    const HS_GRAD_AGE = 18;
    const rowWithAge = stats
      .map((row) => ({ year: yearOf(row.year), age: Number(row.age) }))
      .filter((r): r is { year: number; age: number } => typeof r.year === 'number' && Number.isFinite(r.age) && r.age > 0)
      .sort((a, b) => a.year - b.year)[0];
    const birthYear = rowWithAge ? rowWithAge.year - rowWithAge.age : null;
    const hsYear = birthYear ? birthYear + HS_GRAD_AGE : Math.max(1900, firstStatYear - 1);

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

    // hsYear - 17 .. hsYear - 1 are the 17 standardized life-year slots,
    // whether or not a real birth year could be derived (see above) -- a
    // fan photo dated into that range fills its year's placeholder instead
    // of clamping up to hsYear.
    const lifeYearStart = hsYear - (HS_GRAD_AGE - 1);
    const preHsUploaded: Slide[] = [];
    const postHsUploaded: Slide[] = [];
    uploads
      .filter((item) => !isCurrentHeadshotUrl(item.image_data_url, playerId))
      .forEach((item) => {
        const rawYear = item.photo_taken_year || yearOf(item.photo_taken_date) || hsYear;
        const isPreHs = rawYear >= lifeYearStart && rawYear < hsYear;
        const year = isPreHs ? rawYear : clamp(rawYear, hsYear, endYear);
        const override = localOverrides[`upload-${item.id}`];
        const slide: Slide = {
          id: `upload-${item.id}`,
          kind: 'upload',
          year,
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
        (isPreHs ? preHsUploaded : postHsUploaded).push(slide);
      });
    preHsUploaded.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
    postHsUploaded.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

    // Always exactly 17 life-year screens (standardized -- see above),
    // ages 1 through 17, filled with a fan photo already dated to that
    // year where one exists, otherwise an empty invite screen for that
    // specific age.
    const filledLifeYears = new Set(preHsUploaded.map((s) => s.year));
    const lifeYears: Slide[] = Array.from({ length: HS_GRAD_AGE - 1 }, (_, i) => lifeYearStart + i)
      .filter((year) => !filledLifeYears.has(year))
      .map((year) => ({
        id: `lifeyear-${year}`,
        kind: 'lifeyear' as const,
        year,
        age: year - lifeYearStart + 1,
        title: `Age ${year - lifeYearStart + 1}`,
      }));

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

    // No more force-pinning the anchor to index 0: preHsUploaded + lifeYears
    // always total exactly 17 screens between them, so sorted by year the
    // anchor always lands at index 17 -- the 18th screen -- instead of
    // always being first. A fan can still swipe further back through those
    // 17 life years, all the way to age 1.
    const slides = [...lifeYears, ...preHsUploaded, anchor, ...seasons, ...postHsUploaded, today]
      .sort((a, b) => a.year - b.year);
    const anchorIndex = slides.findIndex((s) => s.kind === 'anchor');

    return { startYear: birthYear ?? hsYear, endYear, slides, anchorIndex: anchorIndex < 0 ? 0 : anchorIndex };
  }, [stats, uploads, playerId, localOverrides, player?.playerName]);

  const ready = statsLoaded && uploadsLoaded;

  useEffect(() => {
    if (!ready || initializedRef.current) return;
    initializedRef.current = true;
    // Opens on the HS anchor slide (now the 18th screen, not the first --
    // see model.anchorIndex above), jumped to instantly rather than
    // animated in from slide 0 since there's no slide 0-through-17 pass to
    // show on first paint.
    setScrollProgress(model.anchorIndex);
    scrollToIndex(model.anchorIndex, false);
  }, [ready, model.anchorIndex]);

  useEffect(() => {
    const maxIndex = Math.max(0, model.slides.length - 1);
    if (scrollProgress > maxIndex) setScrollProgress(maxIndex);
  }, [model.slides.length, scrollProgress]);

  const openMoment = openMomentId ? model.slides.find((slide) => slide.id === openMomentId) || null : null;
  const activeIndex = clamp(Math.round(scrollProgress), 0, Math.max(0, model.slides.length - 1));

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

  // Free scroll, matching the corporate site's real timeline mechanism
  // (layered-story-strip.js): the track is a plain native horizontally
  // scrollable element with scroll-snap turned OFF, not a click-only
  // stepper -- touch/trackpad get native scrolling for free, and a
  // pointer-drag handler gives mouse users the same "grab the timeline"
  // feel (mice have no built-in click-and-drag-to-scroll). Layered on top
  // of that free scroll -- and this part isn't in the corporate source,
  // it's new -- the hero visual for each slide dissolves in/out based on
  // how close the continuous scroll position is to that slide's index,
  // instead of hard-cutting between slides.
  function scrollToIndex(index: number, smooth = true) {
    const el = trackRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    const target = clamp(index, 0, Math.max(0, model.slides.length - 1));
    el.scrollTo({ left: target * width, behavior: smooth ? 'smooth' : 'auto' });
  }
  function goPrev() { scrollToIndex(Math.round(scrollProgress) - 1); }
  function goNext() { scrollToIndex(Math.round(scrollProgress) + 1); }

  function handleScroll() {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = trackRef.current;
      if (!el) return;
      const width = el.clientWidth || 1;
      setScrollProgress(el.scrollLeft / width);
    });
  }

  function handlePointerDown(event: ReactPointerEvent) {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    dragRef.current = { dragging: true, moved: false, startX: event.clientX, startScroll: el.scrollLeft, pointerId: event.pointerId };
    try { el.setPointerCapture(event.pointerId); } catch {}
  }
  function handlePointerMove(event: ReactPointerEvent) {
    const drag = dragRef.current;
    const el = trackRef.current;
    if (!drag.dragging || !el || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (Math.abs(dx) > 3) drag.moved = true;
    el.scrollLeft = drag.startScroll - dx;
  }
  function handlePointerUp() {
    const drag = dragRef.current;
    if (!drag.dragging) return;
    try { if (drag.pointerId != null) trackRef.current?.releasePointerCapture(drag.pointerId); } catch {}
    dragRef.current = { ...drag, dragging: false };
  }

  function handleSlideClick(slide: Slide) {
    if (dragRef.current.moved) return;
    if (slide.kind === 'upload') setOpenMomentId(slide.id);
  }

  // Desktop mice only scroll vertically by default; redirect vertical
  // wheel delta into horizontal scroll so a plain wheel also moves the
  // timeline, matching audience-site.js's own wheel handler. A native
  // listener (not React's onWheel) is required to call preventDefault --
  // React's synthetic wheel handler is attached passively.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      el!.scrollLeft += event.deltaY;
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  if (variant === 'line') {
    return null;
  }

  return (
    <>
      {/* A small independent strip, sized to exactly rows 1+2's combined
          height (not row3's) -- it never touches or overlaps row3's own
          box, so there's no seam or height math shared with the carousel
          below. Just the same photo, cropped on its own for this strip,
          sitting behind the now-transparent header bars. */}
      <div className="zt-hero-bleed" aria-hidden="true">
        <SmartImage className="zt-hero-bleed-bg" src={HERO_BG} alt="" />
      </div>
      <section className="zt-shell-images yat-profile-career-strip" id="playerCareerImages">
      {/* Hero visuals live in their own non-scrolling stack, one per slide,
          each opacity-driven by how close the continuous scroll position is
          to that slide's index. The falloff is DELIBERATELY steeper than a
          plain triangle (1 - 2*|d| instead of 1 - |d|, both clamped to
          [0,1]): a plain linear falloff puts two ADJACENT slides at 0.5
          opacity simultaneously at the halfway point of a drag -- a true
          50/50 double-exposure of two different logos/cutouts, which read
          as a rendering glitch rather than a dissolve (confirmed via
          screenshots of it happening on a real device). Doubling the slope
          makes each slide reach 0 by the halfway point instead of at a full
          slide-width away, so the outgoing slide has fully dissolved out
          before the incoming one starts dissolving in -- sequential, never
          overlapping, with a brief fully-transparent instant exactly at the
          midpoint. The copy track below is a separate, plain native
          horizontally-scrollable strip underneath it (free scroll matching
          the corporate site's real timeline mechanism, layered-story-
          strip.js) -- scroll-snap explicitly off, mouse drag via pointer
          events since browsers don't drag-scroll for mice, touch/trackpad
          get native scrolling for free. */}
      <div className="zt-visual-stack" aria-hidden="true">
        {ready && model.slides.map((slide, i) => {
          const opacity = clamp(1 - 2 * Math.abs(scrollProgress - i), 0, 1);
          if (opacity <= 0) return null;
          return (
            <span key={slide.id} className={`zt-visual zt-${slide.kind}`} style={{ opacity }}>
              {/* No background image here for anchor/season -- .zt-hero-bleed
                  (a single fixed layer behind rows 1-3) covers this whole
                  area too, so this is a transparent window onto that one
                  continuous image instead of a second, independently-cropped
                  copy of it. */}
              <span className="zt-visual-gradient" aria-hidden="true" />
              {slide.kind === 'season' && (
                <span className="zt-logo-layer" aria-hidden="true">
                  <SmartImage srcs={slide.teamLogoSrcs} src={YS_CREST_FALLBACK} alt="" />
                </span>
              )}
              {slide.kind === 'anchor' && (
                <span className="zt-logo-layer" aria-hidden="true">
                  <SmartImage src={YS_CREST_FALLBACK} alt="" />
                </span>
              )}
              {slide.kind === 'anchor' && (
                <SmartImage className="zt-person" src={`${S3_BASE}/players/cutouts/${encodeURIComponent(playerId)}.png`} alt={`${firstName(slide.title)} cutout`} />
              )}
              {(slide.kind === 'anchor' || slide.kind === 'season') && player?.playerName && (
                <span className="zt-player-name">{player.playerName}</span>
              )}
              {slide.kind === 'season' && (
                <SmartImage className="zt-person zt-person-yati" srcs={slide.seasonCutoutSrc ? [slide.seasonCutoutSrc] : []} src={slide.yatiFallback || YATI_PLACEHOLDERS[0]} alt={`${player?.playerName || 'Player'} — ${slide.year}`} />
              )}
              {slide.kind === 'today' && (
                <SmartImage className="zt-person zt-person-cover" src={slide.src} alt="Current" />
              )}
              {slide.kind === 'upload' && (
                <SmartImage className="zt-person zt-person-cover" src={slide.src} alt={slide.title} />
              )}
              <span className="zt-visual-baseline" aria-hidden="true" />
            </span>
          );
        })}
      </div>

      <div
        className="zt-carousel"
        ref={trackRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {ready && model.slides.map((slide) => (
          <div key={slide.id} className={`zt-slide zt-${slide.kind}`} onClick={() => handleSlideClick(slide)} title={slide.title}>
            <span className="zt-copy">
              {slide.kind === 'anchor' && (
                <>
                  <span className="zt-kick">The hometown never stopped caring</span>
                  <span className="zt-title">A baseball player&apos;s journey does not end at graduation. Neither should his story.</span>
                  <span className="zt-bodycopy">Follow {player?.playerName ? firstName(player.playerName) : 'his'} journey through college and professional baseball.</span>
                </>
              )}
              {slide.kind === 'season' && (
                <>
                  <span className="zt-kick">{slide.year} · {slide.caption}</span>
                  <span className="zt-title">{slide.title}</span>
                  <span className="zt-bodycopy">{slide.headline}</span>
                  <button type="button" className="zt-upload-inline-cta" onClick={(e) => { e.stopPropagation(); openUpload(slide.year); }}>
                    <i className="ri-upload-cloud-line" /> Share an image of {player?.playerName ? firstName(player.playerName) : 'him'}
                  </button>
                </>
              )}
              {slide.kind === 'today' && (
                <>
                  <span className="zt-kick">{slide.year}</span>
                  <span className="zt-title">{player?.playerName || ''}</span>
                </>
              )}
              {slide.kind === 'lifeyear' && (
                <>
                  <span className="zt-kick">Age {slide.age}</span>
                  <span className="zt-title">This year is still a blank page.</span>
                  <span className="zt-bodycopy">No photo yet from {player?.playerName ? firstName(player.playerName) : 'his'} childhood at this age -- be the first to add one.</span>
                  <button type="button" className="zt-upload-inline-cta" onClick={(e) => { e.stopPropagation(); openUpload(slide.year); }}>
                    <i className="ri-upload-cloud-line" /> Share a photo from this year
                  </button>
                </>
              )}
              {slide.kind === 'upload' && (
                <>
                  {(slide.relationship || slide.contributorName) && (
                    <span className="zt-kick">{[slide.relationship, slide.contributorName].filter(Boolean).join(' · ')}</span>
                  )}
                  <span className="zt-title">{slide.title}</span>
                  {slide.caption ? <span className="zt-bodycopy">{slide.caption}</span> : null}
                  <div className="zt-upload-actions">
                    <ReactionButton moment={slide} session={session} onToggled={handleReactionToggled} />
                    <button type="button" className="zt-comment-pill" onClick={(e) => { e.stopPropagation(); setOpenMomentId(slide.id); }}>
                      <i className="ri-chat-3-line" />
                      {(slide.comments || []).length}
                    </button>
                  </div>
                </>
              )}
            </span>
          </div>
        ))}
      </div>

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
                onClick={() => scrollToIndex(i)}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}

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

        /* The hero visuals and the scrolling copy track are two entirely
           separate layers: the visual stack never moves horizontally, it
           only dissolves between slides (opacity set inline, from
           scrollProgress, one slide fully out before the next fades in --
           see the opacity formula above); the copy track is a plain native
           horizontally-scrollable strip underneath it, free scroll matching
           the corporate site's real timeline mechanism
           (layered-story-strip.js) -- scroll-snap explicitly off, mouse
           drag via pointer events since browsers don't drag-scroll for
           mice, touch/trackpad get native scrolling for free. */
        .zt-visual-stack { position:absolute; z-index:1; inset:0; overflow:hidden; pointer-events:none; }
        .zt-visual { position:absolute; inset:0; overflow:hidden; background:transparent; }
        .zt-visual-gradient { position:absolute; z-index:2; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(0,0,0,.05) 0%,rgba(0,0,0,.12) 20%,rgba(4,5,6,.82) 43%,rgba(4,5,6,.97) 72%,#040506 100%),linear-gradient(180deg,rgba(0,0,0,.12),transparent 55%,rgba(0,0,0,.48)); }

        .zt-carousel { position:relative; z-index:2; height:100%; width:100%; display:flex; overflow-x:auto; overflow-y:hidden; scroll-snap-type:none; scrollbar-width:none; cursor:grab; overscroll-behavior-x:contain; touch-action:pan-x; }
        .zt-carousel:active { cursor:grabbing; }
        .zt-carousel::-webkit-scrollbar { display:none; }
        .zt-slide { position:relative; flex:0 0 100%; width:100%; min-width:100%; height:100%; overflow:hidden; cursor:default; background:transparent; }
        .zt-slide.zt-upload { cursor:pointer; }

        /* -- team logo: its own big plain layer on the right, bleeding off
           the edge of the frame -- matching the real corporate hero, where
           the ghosted crest is only partly visible, clipped by the frame's
           right edge, not fully contained inside it. */
        .zt-logo-layer { position:absolute; z-index:3; top:4%; bottom:4%; right:-14%; width:56%; display:flex; align-items:center; justify-content:center; opacity:.4; pointer-events:none; }
        .zt-logo-layer :global(img) { width:100%; height:100%; object-fit:contain; }

        /* Moved in from the very edge, closer to the headline, so it sits
           inside the background photo's own swoosh curve instead of off
           to the side of it. */
        /* Every hero image (real cutout, YaTi placeholder, cover photo)
           shares this exact position/size -- per direct feedback, the
           player/YaTi image must land in the same spot on every slide,
           not just the anchor. .zt-person-yati carries no positional
           overrides of its own anymore; it's the same box as .zt-person. */
        .zt-visual :global(.zt-person) { position:absolute; z-index:4; left:14%; bottom:-4%; width:clamp(126px,15vw,224px); height:108%; max-width:none; object-fit:contain; object-position:left bottom; filter:drop-shadow(0 14px 22px rgba(0,0,0,.44)); }
        .zt-visual :global(.zt-person-cover) { left:0; bottom:0; width:100%; height:100%; max-width:none; object-fit:cover; object-position:center top; }
        .zt-visual-baseline { position:absolute; z-index:5; left:0; right:0; bottom:0; height:2px; background:linear-gradient(90deg,rgba(200,169,110,.25),#d3aa48 28%,#efd070 55%,rgba(200,169,110,.24)); box-shadow:0 0 16px rgba(211,170,72,.28); pointer-events:none; }

        /* Player's name -- bottom-left, to the left of the (now
           right-shifted) cutout, sitting low in the frame where the
           swoosh starts its curve, separate from the marketing
           kicker/headline column on the right. Anchor slide only. */
        .zt-player-name { position:absolute; z-index:4; left:4%; bottom:6%; display:block; margin:0; color:#fff; font-family:Oswald,sans-serif; font-weight:800; font-size:clamp(14px,2.4vw,22px); line-height:1; letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; }

        /* Starts past the photo, closer to the ghosted logo's left edge
           (the logo is faint enough that text stays legible over it) --
           matching the real corporate hero's proportions: kicker/headline/
           bodycopy stacked and vertically centered in the space above the
           bottom chrome bar. Font declarations are split into separate
           properties instead of the "font:" shorthand: the shorthand's
           own commas (font-family list) and slash (size/line-height)
           combined with clamp()'s internal commas was silently dropping
           the whole declaration in production, which is why this text
           was invisible there. */
        .zt-copy { position:absolute; z-index:6; left:40%; right:5%; top:0; bottom:22px; display:flex; flex-direction:column; justify-content:center; background:transparent; }
        .zt-kick, .zt-title, .zt-bodycopy { min-width:0; }
        .zt-kick { display:block; margin:0 0 4px; color:${TIMELINE_YELLOW}; font-family:Oswald,sans-serif; font-weight:600; font-size:10px; line-height:1.2; letter-spacing:.13em; text-transform:uppercase; }
        .zt-title { display:block; width:100%; margin:0 0 5px; font-family:Oswald,sans-serif; font-weight:700; font-size:20px; line-height:1.08; letter-spacing:.005em; text-transform:uppercase; color:#f7f7f5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .zt-anchor .zt-title, .zt-lifeyear .zt-title { white-space:normal; overflow-wrap:anywhere; }
        .zt-bodycopy { display:block; width:100%; margin:0; color:#aeb2b6; font-family:Oswald,sans-serif; font-weight:300; font-size:10.5px; line-height:1.35; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .zt-anchor .zt-bodycopy, .zt-lifeyear .zt-bodycopy { white-space:normal; overflow-wrap:anywhere; }
        /* No cutout/logo on a life-year slide (there's no photo yet) -- the
           copy block gets the room that would otherwise be reserved for
           one, so the invite reads as a real screen instead of empty
           space with a caption stuck to the right. */
        .zt-lifeyear .zt-copy { left:6%; }

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
        .zt-dots { position:absolute; z-index:6; left:40%; right:60px; bottom:11px; display:flex; align-items:center; gap:4px; }
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

        /* Rows 1 & 2 get a plain marker class from SharedShell.tsx itself
           (isPlayerProfile is already known there) rather than a
           cross-sibling :has() selector guessed from in here -- that
           guess didn't reliably match on the real deployed page last
           time. This one fixed layer now spans rows 1+2+3 combined (not
           just 1+2) and row3's own background/visual/slide-surface are
           all transparent, so row3 is a window onto the *same* image
           instead of a second, independently-cropped copy of it -- two
           separate object-fit:cover crops of the same photo at different
           container heights don't line up, which was the visible seam
           right at the row2/row3 boundary before this.
           :global() here isn't optional: this div is a sibling of
           <section>, not its descendant, at the top level of the returned
           Fragment -- styled-jsx's scope hash didn't get attached to it
           (confirmed via computed style: position was landing as "static"
           instead of "fixed" because the scoped selector's compiled hash
           class never matched this element), so a plain scoped rule here
           silently matches nothing. */
        /* z-index is negative, not just "less than row3-shell's 60": this
           div is DOM-nested inside .yat-row3-shell (a sticky+z-index
           element, so a stacking context of its own), and position:fixed
           only escapes its CONTAINING BLOCK, not its STACKING CONTEXT --
           its z-index is still compared against its local siblings inside
           row3-shell (like .zt-shell-images, z-index:auto), not against
           row1/row2 directly. A positive value here painted this layer
           ABOVE .zt-shell-images's entire contents once the two started
           spatially overlapping (once this layer grew tall enough to
           reach into row3's own area) -- hiding the whole carousel behind
           it. Negative z-index paints behind z-index:auto content in the
           same stacking context, which is what's needed here; row3-shell
           as a whole (all of it, this div included) is still compared
           against row1/row2 using row3-shell's own z-index (60 vs their
           70/65), which is unaffected by this. */
        :global(.zt-hero-bleed) { position:fixed; z-index:-1; top:0; left:0; right:0; height:calc(var(--row1-h, 36px) + var(--row2-h, 54px) + ${ROW_H}px); overflow:hidden; pointer-events:none; background:#060708; }
        /* Tried zooming this photo in (transform:scale()) to push its
           swoosh curve further from the left edge on wide desktop windows,
           where object-fit:cover's width-driven scaling otherwise parks it
           at a fixed ~7.5% of viewport width -- measured and solved for
           exactly, not eyeballed. Reverted: it also zoomed in on the
           outfield-wall stripe along the top of the frame, which at that
           magnification blew out into a wash of amber across the whole
           width instead of reading as a thin background detail -- the fix
           made the photo look worse than the problem it solved. Left at
           plain object-fit:cover for now; the player-name/copy positions
           below were nudged instead (see left offsets) to keep them off
           the true edge without touching the photo itself. */
        :global(.zt-hero-bleed .zt-hero-bleed-bg) { position:absolute; inset:0; width:100%; height:100%; max-width:none; object-fit:cover; object-position:0% 48%; filter:brightness(.78) saturate(.94); }
        /* .yat-topbar and .yat-schoolrow (rendered inside these shells by
           GlobalTopbar/SchoolContextBar) carry their own separate
           background:var(--header-bg) in YatStyles.tsx -- making just the
           outer shell divs transparent does nothing while these inner
           wrappers still paint solid over the same box, which is why the
           first two attempts at this showed no visible change at all. */
        :global(.yat-row1-shell.pp-hero-row) { background:transparent !important; }
        :global(.yat-row1-shell.pp-hero-row .yat-topbar) { background:transparent !important; }
        :global(.yat-row2-shell.pp-hero-row) { background:transparent !important; border-color:transparent !important; }
        :global(.yat-row2-shell.pp-hero-row .yat-schoolrow) { background:transparent !important; }

        /* -- responsive: proportions only, same single layered frame at
           every width (never restructures into a grid or stacks into two
           boxes) -- exact scaling from layered-story-strip.js's own
           @media max-width:900px / 620px. */
        @media (max-width:900px) {
          .zt-visual :global(.zt-person) { left:10%; width:clamp(108px,23vw,172px); height:107%; }
          .zt-logo-layer { width:50%; right:-12%; }
          .zt-copy { left:38%; right:5%; bottom:20px; }
          .zt-player-name { left:3.5%; bottom:5%; }
          .zt-dots { left:38%; }
          .zt-title { font-size:clamp(15px,3.4vw,22px); }
          .zt-bodycopy { font-size:clamp(8.5px,1.6vw,10.5px); }
        }
        @media (max-width:620px) {
          :global(.zt-hero-bleed .zt-hero-bleed-bg) { object-position:0% 50%; }
          .zt-visual-gradient { background:linear-gradient(90deg,rgba(0,0,0,.04) 0%,rgba(3,4,5,.32) 22%,rgba(3,4,5,.90) 47%,#030405 100%),linear-gradient(180deg,rgba(0,0,0,.10),transparent 55%,rgba(0,0,0,.50)); }
          .zt-visual :global(.zt-person) { left:6%; bottom:-3%; width:clamp(78px,27vw,112px); height:104%; }
          .zt-logo-layer { width:58%; right:-14%; opacity:.35; }
          .zt-copy { left:32%; right:4%; bottom:18px; }
          .zt-player-name { left:3%; bottom:4%; }
          .zt-dots { left:32%; }
          .zt-kick { font-size:7px; margin-bottom:3px; }
          .zt-title { font-size:clamp(13px,4.2vw,17px); margin-bottom:3px; }
          .zt-bodycopy { font-size:clamp(7.5px,1.8vw,9px); }
        }
      `}</style>
    </section>
    </>
  );
}
