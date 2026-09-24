'use client';

import { ChangeEvent, CSSProperties, Fragment, FormEvent, MouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
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
// Mobile carries the exact same content (kicker/title/bodycopy still
// vertically centered) at a shorter box -- 200px was leaving real dead
// space above the hero image/headline once the type scaled down for
// narrow screens, per direct feedback ("very tall with a lot of dead
// space").
const ROW_H_MOBILE = 150;
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

// One life-lesson quote per pre-HS life-year screen (age 1 through
// LIFE_YEAR_COUNT, defined further down), standing in for the old "this
// year is still a blank page" placeholder copy on any of those 17 screens
// that has no fan photo dated to it yet. The two even-earlier screens
// (EARLY_YEAR_COUNT) aren't part of this map -- see their own comment.
const LIFE_YEAR_QUOTES: Record<number, string> = {
  1: "There's No Crying in Baseball.\nYou Win Some. You Lose Some.",
  2: 'The wonder years are when the seeds are planted for the love of the game.',
  3: "You can't win if you don't play. Take your hacks or always wonder.",
  4: "A hero can shape the greatness in a child that's waiting to be discovered.",
  5: 'Some of the best friendships began in the dugout.',
  6: 'Courage is the absence of fear. Adversity is the opportunity to overcome it.',
  7: "Sometimes it's the simplest things that make the biggest difference.\nDo simple better.",
  8: 'Have Fun. Winning is Fun.\nALWAYS Play to Win.',
  9: 'Baseball at its simplest form,\nis basically just playing catch.',
  10: "Practice doesn't make perfect.\nIt makes permanent.\nSo practice perfectly.",
  11: 'Adversity met with grace\nreveals the character of a man.',
  12: 'Great plays are made\nbefore the pitch is even thrown.',
  13: 'The stage may be bigger,\nbut the game is still the same.',
  14: 'Trust in those beside you transforms individual talent\ninto collective strength.',
  15: 'Check your ego at the door.\nYou’ll either win as a team\nor lose as a team.\nThere’s no "I" team.',
  16: 'True accountability is doing the unseen work when nobody is watching.',
  17: 'Relentlessly pursue your dreams; greatness is earned through the courage to never stop chasing them.',
};

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
  obp?: string | number;
  slg?: string | number;
  ops?: string | number;
  // pitching
  w?: string | number;
  l?: string | number;
  era?: string | number;
  ip?: string | number;
  whip?: string | number;
  so_bb?: string | number;
  g?: string | number;
};

type BigStat = { label: string; value: string };

type SlideKind = 'anchor' | 'season' | 'upload' | 'today' | 'lifeyear' | 'future';

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
  // season-kind only -- normalizeLevel()'s output, kept alongside caption
  // so same-year stints can be ordered by level (see seasonOrderRank)
  // without re-parsing it back out of the caption string.
  level?: string;
  // season-kind only -- the 4 headline numbers for that stint (ERA/WHIP/
  // K-BB/GP for a pitching season, AVG/OBP/SLG/OPS for a batting one --
  // see buildBigStats()), shown as plain enlarged label+number pairs
  // under the season heading, not as card graphics.
  bigStats?: BigStat[];
  // lifeyear-kind only (the empty, no-photo-yet placeholder for a
  // pre-high-school year of the player's life)
  age?: number;
  // lifeyear-kind only -- true for the standardized birth-year screen
  // further back than age 1 (see EARLY_YEAR_COUNT below), so its
  // kicker/title can skip the age-keyed LIFE_YEAR_QUOTES lookup that age
  // isn't in and render as a plain headline instead of a quote.
  isEarly?: boolean;
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
  // Checked before the generic "HIGH" -> High-A branch below: "HIGH
  // SCHOOL" contains that same substring, and was silently being
  // normalized to the pro level High-A -- which also broke same-year
  // season ordering downstream (an amateur row needs to be recognizable
  // as amateur, not accidentally sorted in among Double-A/Triple-A rows).
  if (raw.includes('HIGH SCHOOL') || raw === 'HS') return 'HS';
  if (raw.includes('MLB')) return 'MLB';
  if (raw.includes('TRIPLE') || raw === 'AAA') return 'Triple-A';
  if (raw.includes('DOUBLE') || raw === 'AA') return 'Double-A';
  if (raw.includes('HIGH') || raw === 'A+') return 'High-A';
  if (raw.includes('LOW') || raw === 'A') return 'A Ball';
  if (raw.includes('ROOKIE') || raw === 'RK') return 'Rookie';
  if (raw.includes('INDY') || raw.includes('INDEPENDENT')) return 'INDY';
  if (raw.includes('NAIA')) return 'NAIA';
  if (raw.includes('NCAA-D1')) return 'NCAA-D1';
  if (raw.includes('NCAA-D2')) return 'NCAA-D2';
  if (raw.includes('NCAA-D3')) return 'NCAA-D3';
  if (raw.includes('NJCAA') || raw.includes('JUCO')) return 'JUCO';
  return raw;
}

// Best-effort chronological ordering for two stints tagged to the SAME
// year (a college season plus the pro debut after being drafted, a
// mid-season promotion, a demotion, etc.) -- this data has no per-stint
// date, only a level, so there's no way to know the real order for
// certain. Amateur ball (HS/JUCO/NAIA/NCAA) is a safe bet to always sort
// before affiliated pro ball in the same year, since the draft always
// follows the amateur season. Ordering WITHIN pro ball lowest-level-first
// is NOT a safe bet -- a call-up moves up, a demotion moves down, and
// nothing here says which happened -- but it's right far more often than
// not (a draftee's first pro assignment is normally their lowest level
// that year), so it's kept as the best available default until real
// stint dates exist. An unrecognized level sits in the middle rather
// than at either end, so one bad guess doesn't get sorted to a hard edge.
const SEASON_LEVEL_ORDER: Record<string, number> = {
  HS: 0, JUCO: 0, NAIA: 0, 'NCAA-D3': 0, 'NCAA-D2': 0, 'NCAA-D1': 0,
  Rookie: 1, 'A Ball': 2, 'High-A': 3, 'Double-A': 4, 'Triple-A': 5, INDY: 5, MLB: 6,
};
function seasonOrderRank(level: string): number {
  return level in SEASON_LEVEL_ORDER ? SEASON_LEVEL_ORDER[level] : 3;
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

// The 4 headline numbers for a season, shown big under the heading --
// same isPitching detection as statLineHeadline, different (larger, more
// scannable) set of stats than that one-line summary: ERA/WHIP/K-BB/GP
// for a pitching season, AVG/OBP/SLG/OPS for a batting one. Only include
// a stat the row actually has a value for, so a partial row still shows
// whatever it has instead of a blank/zero.
function buildBigStats(row: StatRow): BigStat[] {
  const isPitching = row.w !== undefined || row.l !== undefined || row.era !== undefined || row.ip !== undefined;
  const stats: BigStat[] = [];

  if (isPitching) {
    if (row.era !== undefined && row.era !== '') stats.push({ label: 'ERA', value: String(row.era) });
    if (row.whip !== undefined && row.whip !== '') stats.push({ label: 'WHIP', value: String(row.whip) });
    if (row.so_bb !== undefined && row.so_bb !== '') stats.push({ label: 'K/BB', value: String(row.so_bb) });
    if (row.g !== undefined && row.g !== '') stats.push({ label: 'GP', value: String(row.g) });
  } else {
    const avg = row.avg ?? row.bavg;
    if (avg !== undefined && avg !== '') stats.push({ label: 'AVG', value: String(avg) });
    if (row.obp !== undefined && row.obp !== '') stats.push({ label: 'OBP', value: String(row.obp) });
    if (row.slg !== undefined && row.slg !== '') stats.push({ label: 'SLG', value: String(row.slg) });
    if (row.ops !== undefined && row.ops !== '') stats.push({ label: 'OPS', value: String(row.ops) });
  }

  return stats;
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

// Same 7 stages GoldenLineUploadPanel.tsx (unused elsewhere) and the live
// legacy #ppTab-upload flow (ProfilePageEnhancer.tsx) both offer.
const MOMENT_STAGE_OPTIONS = ['Youth Baseball', 'Middle School', 'High School', 'College', 'Minor Leagues', 'Major Leagues', 'Fan Memory'];
// A phone photo can land well past what /api/player-moments accepts
// (MAX_UPLOAD_BYTES = 4MB, a hard rejection, no client-side compression on
// the sender's end) -- same compress-before-send pipeline already proven
// out in ProfilePageEnhancer.tsx's own upload flow (the live #ppTab-upload
// tab), copied here rather than shared from that file since it's tied to
// vanilla DOM there, not exported.
const MOMENT_UPLOAD_TARGET_BYTES = 1_250_000;
const MOMENT_UPLOAD_MAX_SIDE = 1600;

function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to read selected image.')); };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Unable to compress selected image.'))), 'image/jpeg', quality);
  });
}

async function prepareMomentUploadFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Only image uploads are supported.');
  if (file.size <= MOMENT_UPLOAD_TARGET_BYTES && file.type === 'image/jpeg') return file;
  const img = await loadImageFile(file);
  const scale = Math.min(1, MOMENT_UPLOAD_MAX_SIDE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to prepare selected image.');
  ctx.drawImage(img, 0, 0, width, height);
  let blob = await canvasToJpegBlob(canvas, 0.82);
  if (blob.size > MOMENT_UPLOAD_TARGET_BYTES) blob = await canvasToJpegBlob(canvas, 0.68);
  if (blob.size > MOMENT_UPLOAD_TARGET_BYTES) blob = await canvasToJpegBlob(canvas, 0.52);
  const cleanName = file.name.replace(/\.[^.]+$/, '') || 'career-path-memory';
  return new File([blob], `${cleanName}.jpg`, { type: 'image/jpeg' });
}

function SmartImage({ src, srcs, alt, className, style }: { src?: string; srcs?: string[]; alt: string; className?: string; style?: CSSProperties }) {
  const sources = useMemo(() => Array.from(new Set([...(srcs || []), ...(src ? [src] : [])].filter(Boolean))), [src, srcs]);
  const sourcesKey = sources.join('|');
  const [index, setIndex] = useState(0);
  // Resetting the fallback index during render (not in an effect) when the
  // source list changes avoids the extra render pass an effect-based
  // reset would cause.
  const [prevSourcesKey, setPrevSourcesKey] = useState(sourcesKey);
  if (sourcesKey !== prevSourcesKey) {
    setPrevSourcesKey(sourcesKey);
    setIndex(0);
  }
  const active = sources[index];
  if (!active) return null;
  // data-fallback lets CSS style the "gave up on the preferred source and
  // is showing a later one instead" case differently -- e.g. .zt-person-now
  // sizes/positions its primary source (a real back-cutout action photo,
  // matching .zt-person-then's own proportions) very differently from its
  // fallback (a squarer headshot cutout, shown only when there's no
  // flip-card-back photo yet), and CSS has no other way to tell which URL
  // actually loaded.
  return <img className={className} style={style} src={active} alt={alt} loading="eager" data-fallback={index > 0 ? 'true' : undefined} onError={() => setIndex((next) => next + 1)} />;
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

// Opens when a fan clicks the "Click to Upload" Polaroid on the anchor
// slide (see its own JSX/onClick below) -- same modal shell/typography as
// MomentDetailModal just above (.zt-modal-mask/.zt-modal, Oswald/Bebas
// Neue, TIMELINE_YELLOW), reused as a class-name-prefixed sibling
// (.zt-upload-modal-*) rather than the same classes, for the same reason
// .fz-social-bar/.fz-social-grid in FunZone.tsx don't reuse .yat-stats-bar/
// .yat-stats-grid: a form-only tweak here should never bleed into the
// detail modal's own layout. Posts straight to /api/player-moments -- the
// same endpoint ZoomableCareerTimeline already fetches FROM (see the
// uploads effect below), so a successful submit just needs that same
// fetch to run again (onUploaded bumps a refresh counter) for the new
// moment to appear on the timeline in its own dated slot, no separate
// "add it to the model" step required.
function MomentUploadModal({
  playerId,
  hsid,
  playerName,
  session,
  onClose,
  onUploaded,
}: {
  playerId: string;
  hsid: string;
  playerName: string;
  session: FanSession | null;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const firstNameOnly = firstName(playerName) || 'this player';
  const [stage, setStage] = useState('Fan Memory');
  const [previewUrl, setPreviewUrl] = useState('');
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : '';
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      openAccountDrawer('signin');
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const selectedPhoto = formData.get('photo');

    if (!(selectedPhoto instanceof File) || selectedPhoto.size === 0) {
      setStatus('Please choose a photo before submitting.');
      return;
    }

    setUploading(true);
    setStatus(selectedPhoto.size > MOMENT_UPLOAD_TARGET_BYTES ? 'Optimizing photo for upload...' : 'Uploading memory...');

    try {
      const preparedPhoto = await prepareMomentUploadFile(selectedPhoto);
      formData.set('photo', preparedPhoto);
      formData.set('playerId', playerId);
      formData.set('hsid', hsid);
      formData.set('playerName', playerName);
      formData.set('pageUrl', window.location.href);

      const res = await fetch('/api/player-moments', { method: 'POST', body: formData, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload failed');

      setDone(true);
      setStatus('Uploaded! It will appear on the timeline after review.');
      onUploaded();
      window.setTimeout(onClose, 1600);
    } catch (error: any) {
      setStatus(error?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="zt-modal-mask" onClick={onClose}>
      <div className="zt-upload-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="zt-modal-close" onClick={onClose} aria-label="Close">
          <i className="ri-close-line" />
        </button>

        {!session ? (
          <div className="zt-upload-gate">
            <div className="zt-modal-kicker">Career Path Timeline</div>
            <h3 className="zt-modal-title">Sign in to add a memory for {firstNameOnly}.</h3>
            <p className="zt-upload-gate-copy">Memories are tied to your YAT?STATS fan account so we know who to credit.</p>
            <div className="zt-upload-gate-actions">
              <button type="button" onClick={() => openAccountDrawer('signin')}>Log In</button>
              <button type="button" onClick={() => openAccountDrawer('register')}>Join Free</button>
            </div>
          </div>
        ) : (
          <>
            <div className="zt-modal-kicker">Career Path Timeline</div>
            <h3 className="zt-modal-title">Add a memory from {firstNameOnly}&apos;s baseball journey.</h3>

            <form className="zt-upload-form" onSubmit={handleSubmit}>
              <label>
                Photo stage
                <select name="stage" value={stage} onChange={(event) => setStage(event.target.value)}>
                  {MOMENT_STAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>

              <label>
                Date photo was taken
                <input name="photoTakenDate" type="date" required />
              </label>

              <label>
                Relationship / role
                <input name="relationship" placeholder="Parent, coach, teammate, alumni, fan..." />
              </label>

              <label className="zt-upload-wide">
                Memory title
                <input name="title" placeholder="Example: First travel ball tournament" />
              </label>

              <label className="zt-upload-wide">
                Caption / memory
                <textarea name="caption" rows={3} placeholder="I remember this because..." />
              </label>

              <label className="zt-upload-wide">
                Upload photo
                <input name="photo" type="file" accept="image/*" required onChange={handlePhotoChange} />
              </label>

              {previewUrl && (
                <div className="zt-upload-preview">
                  <img src={previewUrl} alt="Selected upload preview" />
                </div>
              )}

              <div className="zt-upload-actions">
                <button type="submit" disabled={uploading || done || !playerId}>{uploading ? 'Uploading...' : done ? 'Uploaded' : 'Submit Memory'}</button>
                <span>{status || 'Submitted photos are saved as pending memories.'}</span>
              </div>
            </form>
          </>
        )}
      </div>

      <style jsx>{`
        {/* styled-jsx scopes each component's own <style jsx> block
            independently, so MomentDetailModal's .zt-modal-mask/.zt-modal-
            close/.zt-modal-kicker/.zt-modal-title rules above don't reach
            this component even though this JSX reuses those same class
            names for a consistent look -- duplicated here rather than
            hoisted into a shared file, same as .fz-social-bar not reusing
            .yat-stats-bar elsewhere in this codebase. */}
        .zt-modal-mask { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; padding:16px; }
        .zt-modal-close { position:absolute; top:8px; right:8px; z-index:2; width:30px; height:30px; border-radius:50%; border:0; background:rgba(0,0,0,.55); color:#fff; display:grid; place-items:center; cursor:pointer; }
        .zt-modal-kicker { color:${TIMELINE_YELLOW}; font:700 10px/1 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; margin-bottom:6px; }
        .zt-modal-title { margin:0 0 6px; font:800 22px/1.05 'Bebas Neue',Oswald,sans-serif; letter-spacing:.03em; text-transform:uppercase; }
        .zt-upload-modal { position:relative; width:min(560px,100%); max-height:88vh; overflow-y:auto; background:#111; border:1px solid rgba(255,178,28,.28); border-radius:10px; padding:20px 20px 18px; color:#fff; }
        .zt-upload-gate { padding-top:6px; }
        .zt-upload-gate-copy { margin:8px 0 0; color:rgba(255,255,255,.72); font:400 13px/1.45 system-ui,sans-serif; }
        .zt-upload-gate-actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
        .zt-upload-gate-actions button { min-height:38px; padding:0 16px; border:1px solid ${TIMELINE_YELLOW}; border-radius:6px; background:rgba(255,178,28,.14); color:${TIMELINE_YELLOW}; font:800 11px/1 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; }
        .zt-upload-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:14px; padding:14px; border:1px solid rgba(255,178,28,.2); background:rgba(255,255,255,.04); border-radius:8px; }
        .zt-upload-form label { display:grid; gap:4px; color:rgba(255,255,255,.72); font:800 10px/1 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; }
        .zt-upload-form input, .zt-upload-form textarea, .zt-upload-form select { width:100%; border:1px solid rgba(255,255,255,.18); border-radius:4px; background:rgba(0,0,0,.45); color:#fff; padding:8px; font:400 13px/1.25 system-ui,sans-serif; }
        .zt-upload-wide, .zt-upload-actions { grid-column:1 / -1; }
        .zt-upload-preview { grid-column:1 / -1; width:100%; aspect-ratio:7/5; border:1px solid rgba(255,178,28,.4); border-radius:4px; overflow:hidden; background:#000; }
        .zt-upload-preview img { width:100%; height:100%; object-fit:cover; display:block; }
        .zt-upload-actions { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
        .zt-upload-actions button { min-height:38px; padding:0 16px; border:1px solid ${TIMELINE_YELLOW}; border-radius:6px; background:rgba(255,178,28,.14); color:${TIMELINE_YELLOW}; font:800 12px/1 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; cursor:pointer; }
        .zt-upload-actions button:disabled { opacity:.55; cursor:wait; }
        .zt-upload-actions span { color:rgba(255,255,255,.7); font:700 12px/1.35 system-ui,sans-serif; }
        @media (max-width:620px) { .zt-upload-form { grid-template-columns:1fr; } }
      `}</style>
    </div>
  );
}

export default function ZoomableCareerTimeline({ playerId, variant = 'combined' }: { playerId: string; variant?: 'combined' | 'images' | 'line' }) {
  const player = usePlayerProfile();
  // usePlayerProfile() reads PlayerProfileContext, which is only provided
  // around {children} in [hsid]/player/[playerId]/layout.tsx. This
  // component is rendered by SharedShell's row3 - a SIBLING of {children},
  // not a descendant of it (SharedShell renders {children} separately, in
  // row5) - so that context is never actually in scope here, and player
  // above is always null in production. Confirmed directly: the same
  // team/org/status data that renders correctly on this player's flip
  // card is present and correct in the database, so the previous "data-
  // quality gap in the identity lookup" theory was wrong - this fetches
  // its own copy instead of depending on a context that can't reach it.
  const [identityMeta, setIdentityMeta] = useState<{
    currentTeamName: string; orgConferenceName: string; levelLabel: string; statusLabel: string;
    position: string; bats: string; throws: string; height: string; weight: string;
  } | null>(null);
  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    fetch(`/api/player-identity?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setIdentityMeta(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [playerId]);
  // Same resolution SchoolContextBar.tsx uses for its own breadcrumb: the
  // name can come back empty before the fetch above resolves (or if it
  // fails), so this falls back to the name embedded in the route's own
  // /player/[playerId]/[slug] segment rather than ever showing "him"/"his"
  // in its place.
  const pathname = usePathname();
  const slugDerivedName = (() => {
    const match = pathname?.match(/\/player\/([^/]+)(?:\/([^/?#]+))?/);
    return match?.[2]
      ? match[2].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : '';
  })();
  const resolvedPlayerName = player?.playerName || slugDerivedName;
  // player?.playerHsid is unreachable for the same reason player itself is
  // (see the comment on usePlayerProfile() above) -- read directly off the
  // URL's own leading segment instead, same "derive it locally rather than
  // depend on out-of-scope context" approach slugDerivedName above already
  // takes for the player's name. Only used for S3 path organization and
  // ARMS tagging on a moment upload (see MomentUploadModal below); the
  // upload API itself treats hsid as optional.
  const hsidFromPath = (() => {
    const match = pathname?.match(/^\/([^/]+)\/player\//);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  })();
  // Same join logic as PlayerCardBack.tsx's posLevelStatus/btHw, applied to
  // the fetched identity fields, so this reads identically to the flip
  // card's back rather than approximating it.
  const currentTeamName = identityMeta?.currentTeamName || player?.currentTeamName || '';
  const orgConferenceName = identityMeta?.orgConferenceName || player?.orgConferenceName || '';
  // Position moved off this line and onto the end of batsThrowsHw below --
  // per direct feedback, this line is level + status only now (e.g.
  // "NCAA-D1 - ACTIVE"), not "position - level - status" like the flip
  // card's back still reads.
  const posLevelStatus = [
    identityMeta?.levelLabel || player?.levelLabel,
    identityMeta?.statusLabel || player?.statusLabel,
  ].filter(Boolean).join(' - ');
  const batsThrowsHw = [
    (identityMeta?.bats || player?.bats) && (identityMeta?.throws || player?.throws)
      ? `B/T ${identityMeta?.bats || player?.bats}/${identityMeta?.throws || player?.throws}`
      : '',
    (identityMeta?.height || player?.height) && (identityMeta?.weight || player?.weight)
      ? `${identityMeta?.height || player?.height} / ${identityMeta?.weight || player?.weight}`
      : (identityMeta?.height || player?.height || identityMeta?.weight || player?.weight || ''),
    identityMeta?.position || player?.position,
  ].filter(Boolean).join(' - ');
  const session = useFanSession();
  const [stats, setStats] = useState<StatRow[]>([]);
  const [uploads, setUploads] = useState<SubmittedMoment[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [uploadsLoaded, setUploadsLoaded] = useState(false);
  const [localOverrides, setLocalOverrides] = useState<Record<string, { reactionCount: number; viewerReacted: boolean; extraComments: MomentComment[] }>>({});
  const [openMomentId, setOpenMomentId] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  // Continuous scroll position, in slide-widths (1.35 == 35% of the way from
  // slide 1 into slide 2) -- the source of truth for both which slide reads
  // as "active" (dots/arrows) and how far each slide's hero visual has
  // dissolved in/out, instead of a plain integer index that only ever jumps.
  const [scrollProgress, setScrollProgress] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dragging: boolean; moved: boolean; startX: number; startScroll: number; pointerId: number | null }>({ dragging: false, moved: false, startX: 0, startScroll: 0, pointerId: null });
  const railRef = useRef<HTMLDivElement | null>(null);
  const railDragRef = useRef<{ dragging: boolean; pointerId: number | null }>({ dragging: false, pointerId: null });
  const scrollRafRef = useRef<number | null>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Called after a successful MomentUploadModal submit. Deliberately NOT
  // the same effect as the initial load above -- that one resets
  // initializedRef/localOverrides and re-jumps the scroll position to the
  // anchor slide, which is right for a fresh playerId but would yank a fan
  // who's mid-browse back to the anchor the moment their own upload lands.
  // This just re-pulls the moments list and lets model's own useMemo below
  // (already keyed on uploads) slot the new one into its dated position.
  function refreshUploadsQuietly() {
    fetch(`/api/player-moments?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (Array.isArray(data?.moments)) setUploads(data.moments); })
      .catch(() => {});
  }

  const model = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const statYears = stats.map((row) => yearOf(row.year)).filter((year): year is number => typeof year === 'number');
    const firstStatYear = statYears.length ? Math.min(...statYears) : currentYear;
    const endYear = Math.max(currentYear, ...statYears, firstStatYear);

    // We can't count on knowing a player's real DOB, so the life-year
    // screens before high school are standardized: always exactly 18 of
    // them (17 quote-driven ones at ages 1-17, plus 1 more further back --
    // see LIFE_YEAR_COUNT/EARLY_YEAR_COUNT below), with HS always the 19th
    // screen -- rather than however many actually happened to fall before
    // a per-player derived birth year (which would make some players' HS
    // screen land at a different index depending on data quality).
    // Back to 18 -- per direct feedback, most players (including this
    // component's own sample) really are 18 the year they graduate; 17
    // was a mistake.
    const HS_GRAD_AGE = 18;
    // The 17 standardized quote-driven screens (ages 1-17, LIFE_YEAR_QUOTES'
    // own key range) stay a fixed count, independent of HS_GRAD_AGE above --
    // changing that constant only shifts hsYear itself, it doesn't shrink or
    // grow this set or touch its quotes.
    const LIFE_YEAR_COUNT = 17;
    // One more standardized screen further back than age 1, extending the
    // timeline to birth -- per direct feedback, the second one added
    // alongside it (a "before he was born" screen) wasn't wanted.
    const EARLY_YEAR_COUNT = 1;
    // hsYear used to be derived from a birth year read off real stat-row
    // age data, independent of Class Of -- which could (and, on the live
    // sample, did) land on a different year than the Class Of line right
    // above the Polaroid, making the anchor look like it was missing a
    // whole year of the timeline. Per direct feedback, the anchor's own
    // year should always be THE SAME grad year the metadata block's Class
    // Of line shows: verified (flip_card_front_stage.class_of, surfaced as
    // player.classOf by PlayerProfileContext) when a school/coach has set
    // one, otherwise the same earliest-recorded-season-minus-one estimate
    // classOf falls back to elsewhere on this page (see displayClassOf
    // below, which now just mirrors this value instead of computing its
    // own separately).
    const verifiedGradYear = Number(String(player?.classOf || '').trim()) || null;
    const hsYear = verifiedGradYear || Math.max(1900, firstStatYear - 1);

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
        level,
        bigStats: buildBigStats(row),
      });
    });
    seasons.sort((a, b) => a.year - b.year
      || seasonOrderRank(a.level || '') - seasonOrderRank(b.level || '')
      || a.title.localeCompare(b.title));

    // hsYear - 17 .. hsYear - 1 are the 17 standardized life-year slots,
    // whether or not a real birth year could be derived (see above) -- a
    // fan photo dated into that range fills its year's placeholder instead
    // of clamping up to hsYear.
    const lifeYearStart = hsYear - LIFE_YEAR_COUNT;
    // One standardized screen sitting right after Today, at January 1st of
    // next year -- per direct feedback, each point on this timeline marks
    // a January 1st, and fans keep uploading moments all through the
    // current year that need somewhere to land once that next January 1st
    // has actually passed. Not tied to LIFE_YEAR_QUOTES or any real data,
    // same as the birth-year screen at the other end.
    const futureYear = endYear + 1;
    const preHsUploaded: Slide[] = [];
    const postHsUploaded: Slide[] = [];
    uploads
      .filter((item) => !isCurrentHeadshotUrl(item.image_data_url, playerId))
      .forEach((item) => {
        const rawYear = item.photo_taken_year || yearOf(item.photo_taken_date) || hsYear;
        const isPreHs = rawYear >= lifeYearStart && rawYear < hsYear;
        // Upper bound raised to futureYear (was endYear) -- a moment
        // actually dated into that next year (uploaded throughout it, per
        // direct feedback) should land on the future screen itself instead
        // of getting clamped back onto Today's.
        const year = isPreHs ? rawYear : clamp(rawYear, hsYear, futureYear);
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
    const lifeYears: Slide[] = Array.from({ length: LIFE_YEAR_COUNT }, (_, i) => lifeYearStart + i)
      .filter((year) => !filledLifeYears.has(year))
      .map((year) => ({
        id: `lifeyear-${year}`,
        kind: 'lifeyear' as const,
        year,
        age: year - lifeYearStart + 1,
        title: `Age ${year - lifeYearStart + 1}`,
        // Same rotating YaTi placeholder mechanism season slides already
        // fall back to when there's no real photo yet -- these 17 screens
        // never have one (pre-HS), so they always show it, not just on
        // error.
        yatiFallback: yatiPlaceholderFor(year - lifeYearStart + 1),
      }));

    // One more standardized screen still further back, extending the
    // timeline all the way to birth (age 0) -- see EARLY_YEAR_COUNT above.
    // Not keyed into LIFE_YEAR_QUOTES (ages 1-17 only); .zt-title's own
    // JSX falls back to this slide's title text directly for isEarly
    // slides instead of that lookup.
    const earlyYears: Slide[] = Array.from({ length: EARLY_YEAR_COUNT }, (_, i) => {
      const year = lifeYearStart - EARLY_YEAR_COUNT + i;
      return {
        id: `lifeyear-early-${year}`,
        kind: 'lifeyear' as const,
        year,
        age: 0,
        title: 'The year it all began.',
        isEarly: true,
        yatiFallback: YATI_PLACEHOLDERS[0],
      };
    });

    const anchor: Slide = {
      id: 'career-path-anchor',
      kind: 'anchor',
      year: hsYear,
      title: resolvedPlayerName || 'High School',
    };

    // Skipped when a real season already lands on endYear -- when a
    // player's latest recorded season IS the current calendar year (he's
    // still actively playing this year), that season slide already shows
    // "today" with real stats attached; a second, generic full-photo
    // "Today" slide for the exact same year just duplicates it. Per direct
    // feedback: "make sure the second 2026 screen gets deleted."
    const today: Slide | null = seasons.some((s) => s.year === endYear)
      ? null
      : {
          id: 'current-headshot',
          kind: 'today',
          year: endYear,
          title: 'Today',
          src: `${S3_BASE}/players/now/${encodeURIComponent(playerId)}.jpg`,
        };

    // Only add the standing invite if a real moment hasn't already been
    // dated into futureYear -- once one has (see the raised upload clamp
    // above), that upload's own slide already serves this same spot, same
    // as how a dated pre-HS upload skips its matching lifeyear placeholder.
    const futureSlide: Slide | null = postHsUploaded.some((s) => s.year === futureYear)
      ? null
      : {
          id: 'career-path-future',
          kind: 'future',
          year: futureYear,
          title: `His story keeps going. Check back throughout ${futureYear} for new moments.`,
          yatiFallback: YATI_PLACEHOLDERS[0],
        };

    // No more force-pinning the anchor to index 0: preHsUploaded + lifeYears
    // + earlyYears always total exactly 18 screens between them, so sorted
    // by year the anchor always lands at index 18 -- the 19th screen --
    // instead of always being first. A fan can still swipe further back
    // through those 18 life years, all the way to birth.
    const slides = [...earlyYears, ...lifeYears, ...preHsUploaded, anchor, ...seasons, ...postHsUploaded, ...(today ? [today] : []), ...(futureSlide ? [futureSlide] : [])]
      .sort((a, b) => a.year - b.year);
    const anchorIndex = slides.findIndex((s) => s.kind === 'anchor');

    return { startYear: hsYear - HS_GRAD_AGE, endYear, hsYear, futureYear, slides, anchorIndex: anchorIndex < 0 ? 0 : anchorIndex };
  }, [stats, uploads, playerId, localOverrides, resolvedPlayerName, player?.classOf]);

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
  // Fraction of the rail the "traveled" fill covers, driven by the
  // continuous scroll position (not the rounded activeIndex) so it tracks
  // smoothly mid-drag instead of snapping slide-to-slide.
  const railProgress = model.slides.length > 1
    ? clamp(scrollProgress, 0, model.slides.length - 1) / (model.slides.length - 1)
    : 0;
  // "Class of" starts unknown for most players -- we don't ask a coach to
  // verify it until they engage with the microsite. Prefer the verified
  // year (flip_card_front_stage.class_of, set by a school/coach) and only
  // fall back to an estimate -- the same heuristic gradClassInfo() in
  // playerUtils.ts uses elsewhere: earliest recorded season minus one --
  // when nothing's been verified yet. The estimate is marked with an
  // asterisk so it reads as a best guess, not a confirmed fact. Mirrors
  // model.hsYear exactly rather than computing its own estimate
  // separately -- the two used to drift apart (this line said one grad
  // year, the anchor slide landed on a different one), which is what made
  // the timeline look like it was missing a year.
  const verifiedClassOf = String(player?.classOf || '').trim();
  const displayClassOf = verifiedClassOf || String(model.hsYear);
  const classOfIsEstimated = !verifiedClassOf;

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
  //
  // A "slide" is NOT always exactly one track.clientWidth: on narrow
  // screens each .zt-slide is deliberately 200% of the viewport (see the
  // 620px media query below), so it takes twice the physical scroll
  // distance to reach the next moment -- otherwise a phone-width screen
  // gave every moment barely any room of its own, with the next hero image
  // arriving almost as soon as you started swiping, per direct feedback.
  // Read the actual rendered slide width instead of assuming it equals the
  // container's width.
  function getSlideWidth() {
    const el = trackRef.current;
    if (!el) return 1;
    const first = el.firstElementChild as HTMLElement | null;
    return first?.getBoundingClientRect().width || el.clientWidth || 1;
  }
  function scrollToIndex(index: number, smooth = true) {
    const el = trackRef.current;
    if (!el) return;
    const width = getSlideWidth();
    const target = clamp(index, 0, Math.max(0, model.slides.length - 1));
    el.scrollTo({ left: target * width, behavior: smooth ? 'smooth' : 'auto' });
  }
  function goPrev() { scrollToIndex(Math.round(scrollProgress) - 1); }
  function goNext() { scrollToIndex(Math.round(scrollProgress) + 1); }

  // The year chip on the rail doubles as a scrubber: its position along
  // the rail IS the fraction of the whole timeline, so dragging it
  // (rather than dragging the much wider carousel itself) jumps straight
  // to wherever along the timeline it's released, the same way a video
  // scrubber works -- not a 1:1 finger-distance drag, which would need
  // an awkward, exaggerated multiplier given how much narrower the rail
  // is than the carousel it's driving.
  function updateScrollFromClientX(clientX: number) {
    const rail = railRef.current;
    const el = trackRef.current;
    if (!rail || !el) return;
    const rect = rail.getBoundingClientRect();
    const fraction = clamp(rect.width > 0 ? (clientX - rect.left) / rect.width : 0, 0, 1);
    const maxIndex = Math.max(0, model.slides.length - 1);
    const width = getSlideWidth();
    const targetProgress = fraction * maxIndex;
    el.scrollLeft = targetProgress * width;
    setScrollProgress(targetProgress);
  }
  function handleRailYearPointerDown(event: ReactPointerEvent) {
    event.stopPropagation();
    railDragRef.current = { dragging: true, pointerId: event.pointerId };
    try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); } catch {}
    updateScrollFromClientX(event.clientX);
  }
  function handleRailYearPointerMove(event: ReactPointerEvent) {
    if (!railDragRef.current.dragging || event.pointerId !== railDragRef.current.pointerId) return;
    updateScrollFromClientX(event.clientX);
  }
  function handleRailYearPointerUp(event: ReactPointerEvent) {
    if (!railDragRef.current.dragging) return;
    try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); } catch {}
    railDragRef.current = { dragging: false, pointerId: null };
    scrollToIndex(Math.round(scrollProgress));
  }

  // Scroll-snap is deliberately off on the track itself (free drag,
  // matching the real site's mechanism), which means letting go mid-drag
  // -- or a touch scroll's momentum simply running out -- can leave the
  // carousel resting anywhere between two slides, including deep in the
  // hero-visual dissolve's dead zone (both slides' cutouts faded to 0
  // opacity by design, so only the always-on background photo/swoosh
  // shows through unobstructed) while the copy track sits at some
  // unrelated fractional position of its own linear scroll. That
  // mismatch -- not a brightness bug -- is what reads as the photo and
  // its swoosh "not syncing" with the text: the two were never
  // guaranteed to reach a settled, fully-resolved state together. This
  // schedules a snap to the nearest whole slide once scrolling has been
  // idle for a beat, so the carousel never rests in that in-between
  // state; handlePointerUp below does the same immediately on drag
  // release rather than waiting out the idle delay.
  function scheduleSnap() {
    if (snapTimerRef.current != null) clearTimeout(snapTimerRef.current);
    snapTimerRef.current = setTimeout(() => {
      snapTimerRef.current = null;
      if (dragRef.current.dragging || railDragRef.current.dragging) return;
      const el = trackRef.current;
      if (!el) return;
      const width = getSlideWidth();
      scrollToIndex(Math.round(el.scrollLeft / width));
    }, 140);
  }

  function handleScroll() {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = trackRef.current;
      if (!el) return;
      const width = getSlideWidth();
      setScrollProgress(el.scrollLeft / width);
    });
    scheduleSnap();
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
    if (snapTimerRef.current != null) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null; }
    scrollToIndex(Math.round(scrollProgress));
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
        {/* One continuous top-to-bottom darkening over the full bleed
            (rows 1+2+3 together, not per-row), darkest at the very top
            where the topbar icons and YAT?STATS logo sit against the
            photo, tapering down into row 3's own left-right gradient
            (.zt-visual-gradient) so there's no visible seam where the
            two overlays meet. */}
        <span className="zt-hero-bleed-overlay" />
      </div>
      <section className="zt-shell-images yat-profile-career-strip" id="playerCareerImages">
      {/* Top-left, persistent CTA + identity block -- not inside
          .zt-hero-bleed (that div sits at z-index:-1, deliberately
          painted BEHIND this entire section's own content -- see the
          z-index note further down -- so anything placed inside it is
          hidden behind the carousel too, confirmed by direct feedback
          that it wasn't showing up at all in production) and not inside
          the per-slide visual stack either (so it's always there
          regardless of which slide is dissolved in). A plain child of
          this <section>, so it needs no :global() -- it's a normal
          descendant, not a Fragment-level sibling.
          Layout-only for now, per direct feedback -- not wired to the
          upload flow yet (that's pending a decision on the tagged-
          moment/gallery-tab architecture), so the thumbnail has no
          onClick and this block stays aria-hidden. Replaces the old
          inline "Share an image of him" pill CTA that used to sit under
          the headline on every anchor/season/lifeyear slide -- there's
          one persistent entry point here instead of one repeated on
          every slide. */}
      {/* Gated on ANY identity field being available, not resolvedPlayerName
          alone -- if the name resolver ever comes back empty for a given
          player (route slug mismatch, context not yet hydrated) but team/
          org/status/B-T-H-W are still known, this block should still show
          them instead of disappearing entirely, which is what a
          name-only gate was doing. */}
      {/* Name/metadata block only now -- no CTA line here. Its top offset
          is set (see CSS) to land .zt-persist-name on the same plane as
          .zt-kick over in the headline column, per direct feedback --
          both are the first line of their respective columns, so they
          should read as one shared top edge across the slide. */}
      {(resolvedPlayerName || currentTeamName || orgConferenceName || posLevelStatus || batsThrowsHw || displayClassOf) && (
        <div className="zt-moment-cta" aria-hidden="true">
          {/* Same fields as the flip card's BACK, reordered per direct
              feedback: name, team, org, then level/status (position moved
              off this line onto the end of the B/T-H/W line below it), then
              Class Of last -- moved up here from its old spot on the
              Polaroid's own bottom border, in gold like .zt-persist-status.
              Fetched via /api/player-identity (see the comment above
              identityMeta), not read off PlayerProfileContext, so a fan
              sees the same facts whichever of the flip card's front, its
              back, or this profile page they're looking at. */}
          <div className="zt-persist-id">
            <span className="zt-persist-name">{resolvedPlayerName}</span>
            {currentTeamName && (
              <span className="zt-persist-team">{currentTeamName}</span>
            )}
            {orgConferenceName && (
              <span className="zt-persist-org">{orgConferenceName}</span>
            )}
            {posLevelStatus && (
              <span className="zt-persist-status">{posLevelStatus}</span>
            )}
            {batsThrowsHw && (
              <span className="zt-persist-bthw">{batsThrowsHw}</span>
            )}
            {displayClassOf && (
              <span
                className="zt-persist-classof"
                title={classOfIsEstimated ? 'Estimated from earliest recorded season -- not yet confirmed' : undefined}
              >
                Class of {displayClassOf}{classOfIsEstimated ? '*' : ''}
              </span>
            )}
          </div>
        </div>
      )}
      {/* Polaroid + CTA text, side by side (Polaroid left, text right) --
          per direct feedback, moved to sit directly under the metadata
          block's own Class Of line (a fixed top offset approximating that
          block's natural height, same approach .zt-moment-cta's own top
          already uses elsewhere in this file), freeing up the rail below
          to run all the way to the frame's own left edge instead of
          stopping short to clear this row. Kept as its own sibling here,
          not nested inside .zt-moment-cta, so its z-index:8 keeps
          comparing directly against .zt-person-stack's 4 instead of being
          capped by .zt-moment-cta's own stacking context (that div is
          position:absolute + z-index:3, which forms one). */}
      <div className="zt-polaroid-stack">
        {/* Class Of used to live written on this Polaroid's own bottom
            border -- moved up into .zt-persist-id as its own gold line
            instead (see above), so the Polaroid card itself now just says
            what it's for. The old add-image icon is replaced with the word
            itself, set in the same headline font (.zt-title's Oswald 700)
            as everywhere else on this slide, and it inherits this whole
            card's own -4deg rotation for free by sitting inside it, rather
            than needing a second rotation of its own.
            A real <button> now, not a plain <div> -- per direct feedback,
            "click on the icon of the Polaroid and it opens a modal." The
            parent .zt-polaroid-stack keeps pointer-events:none (the CTA
            caption text beside this is still decorative), so this button
            overrides back to pointer-events:auto on its own -- only the
            Polaroid itself is clickable, not the whole row. aria-hidden
            removed from the wrapper above since it now contains a real
            interactive control. */}
        <button
          type="button"
          className="zt-moment-thumb"
          onClick={() => setUploadModalOpen(true)}
          aria-label={`Upload a memory to ${resolvedPlayerName || 'this player'}'s Career Path Timeline`}
        >
          <span className="zt-moment-thumb-frame">
            {/* 3 lines now (was 2: "Click To" / "Upload"), per direct
                feedback, one word per line. */}
            <span className="zt-moment-thumb-upload">Click<br />to<br />Upload</span>
          </span>
        </button>
        {/* Explicit breaks, not natural wrap -- per direct feedback with a
            reference mockup showing exactly these line breaks, not
            wherever the text happens to wrap at this box's width.
            Rewrapped to 5 lines (was 3, same words: "Add a memory to X's
            Career Timeline!") -- per direct feedback. One wording/size at
            every breakpoint, same as before. */}
        {/* "Timeline!" is its own span, not a plain 5th <br />-separated
            line -- per direct feedback, desktop only should read "Career
            Timeline!" on one line, while mobile keeps the 5-line wrap. The
            span is display:inline (falls in right after "Career " on the
            same line) at every width down through the 900px breakpoint,
            then switched to display:block under the 620px override below,
            which forces it back onto its own line there. */}
        <span className="zt-polaroid-caption">Add a<br />memory<br />to {resolvedPlayerName ? firstName(resolvedPlayerName) : 'his'}&apos;s<br />Career <span className="zt-polaroid-caption-timeline">Timeline!</span></span>
      </div>
      {/* Hero visuals live in their own non-scrolling stack, one per slide
          -- they never move horizontally, only the copy track underneath
          does -- each opacity-driven by how close the continuous scroll
          position is to that slide's index. The falloff is steep (4x, not
          a plain 1-|d| triangle): each slide sits at full opacity across
          most of its own dwell range, then dissolves out fast in just the
          last quarter of the distance to the next slide, and the next one
          dissolves in fast over its own first quarter -- a quick in/out
          snap rather than a slow morph, with a wider fully-transparent gap
          between them (from a quarter out to three-quarters of the way
          across) so the two are never simultaneously visible even
          fractionally -- confirmed via getComputedStyle at several forced
          scroll positions. A plainer 1-|d| triangle was tried first and
          rejected: it puts two ADJACENT slides at 0.5 opacity at the same
          instant, a true double-exposure of two different logos/cutouts,
          which reads as a rendering glitch, not a dissolve. The copy track
          below is a separate, plain native horizontally-scrollable strip
          (free scroll matching the corporate site's real timeline
          mechanism, layered-story-strip.js) -- scroll-snap explicitly off,
          mouse drag via pointer events since browsers don't drag-scroll
          for mice, touch/trackpad get native scrolling for free. */}
      <div className="zt-visual-stack" aria-hidden="true">
        {ready && model.slides.map((slide, i) => {
          const opacity = clamp(1 - 4 * Math.abs(scrollProgress - i), 0, 1);
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
              {slide.kind === 'today' && (
                <SmartImage className="zt-person zt-person-cover" src={slide.src} alt="Current" />
              )}
              {slide.kind === 'upload' && (
                <SmartImage className="zt-person zt-person-cover" src={slide.src} alt={slide.title} />
              )}
            </span>
          );
        })}
      </div>

      {/* The player cutout only (transparent-background PNG, anchor's HS
          silhouette or a season's YaTi placeholder), painted in its own
          layer ABOVE the headline text instead of inside .zt-visual-stack
          underneath it -- per direct feedback that the photo should read
          like a magazine cover with type running behind it (Sports
          Illustrated-style), not text laid over the image. Everything
          else that used to share .zt-visual-stack with it (the darkening
          gradient, the ghosted team logo) stays back there, still behind
          the text, since those exist to give the text contrast, not to
          compete with it. .zt-person-cover (the flat "today"/upload cover
          photos, not a cutout) also stays behind -- there's no transparent
          silhouette to read text through, so raising it would just hide
          the copy outright instead of overlaying it. */}
      <div className="zt-person-stack" aria-hidden="true">
        {ready && model.slides.map((slide, i) => {
          const opacity = clamp(1 - 4 * Math.abs(scrollProgress - i), 0, 1);
          if (opacity <= 0) return null;
          if (slide.kind === 'anchor') {
            return (
              <Fragment key={slide.id}>
                {/* S3 folder renamed from players/cutouts/ to
                    players/then-cutouts/ -- the bucket's three raw-photo
                    folders are back/ (flip-card action pic), now/
                    (current headshot) and then/ (HS photo); their cutout
                    counterparts are now named to match: then-cutouts/,
                    back-cutouts/, now-cutouts/ (below) -- this one used to
                    just be "cutouts/", ambiguous once the other two cutout
                    folders existed alongside it. */}
                <SmartImage className="zt-person zt-person-then" style={{ opacity }} src={`${S3_BASE}/players/then-cutouts/${encodeURIComponent(playerId)}.png`} alt={`${firstName(slide.title)} cutout`} />
                {/* "Then vs now" -- a cutout from the current/most-recent
                    action photo (players/back/, run through the same
                    background-removal pipeline into players/back-cutouts/).
                    Desktop: fills the dead space between the HS
                    silhouette and the headline column, side by side with
                    it. Mobile: same spot as the HS cutout instead (no
                    room to spare there), the two alternating via an 8s
                    CSS crossfade (.zt-person-then/.zt-person-now,
                    4s-visible each with a brief cross-dissolve at the
                    swap) -- see the animation rule in the 620px media
                    query. Falls back to the headshot cutout
                    (players/now/, background removed into
                    players/now-cutouts/) when a player has no "back"
                    photo -- e.g. a pro whose flip card back is still
                    blank -- via SmartImage's own srcs-then-src fallback
                    chain (the same mechanism season slides use for their
                    YaTi placeholder), not a second image element. Only
                    renders nothing if NEITHER exists. */}
                <SmartImage className="zt-person zt-person-now" style={{ opacity }} srcs={[`${S3_BASE}/players/back-cutouts/${encodeURIComponent(playerId)}.png`]} src={`${S3_BASE}/players/now-cutouts/${encodeURIComponent(playerId)}.png`} alt={`${firstName(slide.title)} today`} />
              </Fragment>
            );
          }
          if (slide.kind === 'season') {
            return (
              <SmartImage key={slide.id} className="zt-person zt-person-yati" style={{ opacity }} srcs={slide.seasonCutoutSrc ? [slide.seasonCutoutSrc] : []} src={slide.yatiFallback || YATI_PLACEHOLDERS[0]} alt={`${resolvedPlayerName || 'Player'} — ${slide.year}`} />
            );
          }
          if (slide.kind === 'lifeyear') {
            return (
              <SmartImage key={slide.id} className="zt-person zt-person-yati" style={{ opacity }} src={slide.yatiFallback || YATI_PLACEHOLDERS[0]} alt={`Age ${slide.age}`} />
            );
          }
          if (slide.kind === 'future') {
            return (
              <SmartImage key={slide.id} className="zt-person zt-person-yati" style={{ opacity }} src={slide.yatiFallback || YATI_PLACEHOLDERS[0]} alt={`${slide.year} — story continues`} />
            );
          }
          return null;
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
                  <span className="zt-kick">His hometown never stopped caring</span>
                  <span className="zt-title">When a baseball player&apos;s journey doesn&apos;t end at graduation, neither should his story.</span>
                  <span className="zt-bodycopy">Stay connected to {resolvedPlayerName ? firstName(resolvedPlayerName) : 'him'} on his baseball journey...</span>
                </>
              )}
              {slide.kind === 'season' && (
                <>
                  <span className="zt-kick">{slide.year} · {slide.caption}</span>
                  <span className="zt-title">{slide.title}</span>
                  {slide.bigStats && slide.bigStats.length > 0 ? (
                    <div className="zt-bigstats">
                      {slide.bigStats.map((stat) => (
                        <div className="zt-bigstat" key={stat.label}>
                          <span className="zt-bigstat-label">{stat.label}</span>
                          <span className="zt-bigstat-value">{stat.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="zt-bodycopy">{slide.headline}</span>
                  )}
                </>
              )}
              {slide.kind === 'today' && (
                <>
                  <span className="zt-kick">{slide.year}</span>
                  <span className="zt-title">{resolvedPlayerName || ''}</span>
                </>
              )}
              {slide.kind === 'lifeyear' && (
                <>
                  <span className="zt-kick">{slide.isEarly ? 'Born' : `Age ${slide.age}`}</span>
                  {/* The birth-year screen is a plain headline statement,
                      not a life-lesson quote -- no curly quotes around it. */}
                  {slide.isEarly ? (
                    <span className="zt-title">{slide.title}</span>
                  ) : (
                    <span className="zt-title">&ldquo;{LIFE_YEAR_QUOTES[slide.age ?? 0]}&rdquo;</span>
                  )}
                </>
              )}
              {slide.kind === 'future' && (
                <>
                  <span className="zt-kick">{slide.year}</span>
                  <span className="zt-title">{slide.title}</span>
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
          {/* Closing boundary for the future screen above -- per direct
              feedback, adding that one screen really means two points on
              the timeline (each point marks a January 1st: the screen
              opens on futureYear's, and the timeline should visibly run
              through the following January 1st too), but the second point
              doesn't open a screen of its own -- plain span, not a button,
              and outside .zt-rail entirely so it doesn't need to fit into
              that div's own index-based tick spacing. */}
          <span className="zt-rail-tick zt-rail-tick-boundary" aria-hidden="true">
            <span className="zt-rail-tick-year">{String(model.futureYear + 1).slice(-2)}</span>
          </span>
          <div className="zt-rail" ref={railRef}>
            <span className="zt-rail-track" aria-hidden="true" />
            {model.slides.map((slide, i) => (
              <button
                type="button"
                key={slide.id}
                className={`zt-rail-tick${i === activeIndex ? ' active' : ''}`}
                style={{ left: `${(i / Math.max(1, model.slides.length - 1)) * 100}%` }}
                onClick={() => scrollToIndex(i)}
                aria-label={`Slide ${i + 1}: ${slide.year}`}
              >
                <span className="zt-rail-tick-year" aria-hidden="true">{String(slide.year).slice(-2)}</span>
              </button>
            ))}
            <span
              className="zt-rail-year"
              style={{ left: `${railProgress * 100}%` }}
              role="slider"
              aria-label="Scrub the timeline"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, model.slides.length - 1)}
              aria-valuenow={activeIndex}
              aria-valuetext={String(model.slides[activeIndex]?.year ?? '')}
              tabIndex={0}
              onPointerDown={handleRailYearPointerDown}
              onPointerMove={handleRailYearPointerMove}
              onPointerUp={handleRailYearPointerUp}
              onPointerCancel={handleRailYearPointerUp}
            >
              {model.slides[activeIndex]?.year ?? ''}
            </span>
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

      {uploadModalOpen && (
        <MomentUploadModal
          playerId={playerId}
          hsid={hsidFromPath}
          playerName={resolvedPlayerName}
          session={session}
          onClose={() => setUploadModalOpen(false)}
          onUploaded={refreshUploadsQuietly}
        />
      )}

      <style jsx>{`
        /* Same left edge row 1's hamburger/logo sit at (.yat-topbar:
           padding:1px 10px 0, flat, never capped at any width). A prior
           version of this matched row 2's crest instead (.yat-schoolrow:
           max-width:1400px, centered) -- that drifted noticeably rightward
           of row 1 on any screen wider than ~1400px, per direct feedback
           on a genuinely wide desktop. Row 1's own inset never grows past
           10px regardless of viewport, so this doesn't either. Declared
           once here so every left-column element below (CTA/identity
           block, Polaroid) reads off the same value instead of drifting
           independently. */
        /* --hero-copy-left/--hero-rail-left freeze the headline column and
           the rail's own left edge at their exact 1400px-wide pixel value
           (the site's general "designed width" cap used everywhere else,
           e.g. .yat-schoolrow) once the viewport grows past that point,
           instead of letting them keep drifting right as a flat percentage
           forever. Below 1400px, min() just picks the percentage -- today's
           existing behavior, unchanged. Above it, the whole hero cluster
           (cutout, headline, "now" thumbnail -- everything that reads left
           off these two variables) stays a fixed, correlated group instead
           of stretching or resizing on a wide screen; only .zt-rail, which
           reads its LEFT from --hero-rail-left but keeps its own
           already-fixed right:60px unchanged, actually grows -- its right
           edge is still tied to the true edge of the screen. Per direct
           feedback: elements shouldn't distort or drift apart on a wide
           screen, only the rail should visibly expand. */
        .zt-shell-images { position:relative; height:100%; min-height:100%; overflow:hidden; color:#fff; background:transparent; --x-logo-left:10px; --hero-copy-left:min(34%, 476px); --hero-rail-left:min(40%, 560px); }

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

        /* Sits below .zt-carousel (z-index:5, the headline text) but above
           .zt-visual-stack (z-index:1) -- see the JSX comment above
           .zt-person-stack for why this is a separate layer from
           .zt-visual-stack instead of just raising that whole stack. */
        .zt-person-stack { position:absolute; z-index:4; inset:0; overflow:hidden; pointer-events:none; }

        /* z-index:5, not 2 -- .zt-copy's own z-index:6 (further down) is
           scoped INSIDE this stacking context (position:relative + z-index
           both set here create one), so it was never actually being
           compared against .zt-person-stack's z-index:4 at the outer
           level; what mattered there was this element's own z-index vs
           4, and 2 lost. That's why the mascot/cutout painted over the
           headline text despite .zt-copy's higher number -- per direct
           feedback, with a live example (the mascot's cap cutting into
           the quote text). Raised above .zt-person-stack so the headline
           wins the comparison that actually happens, at every slide kind. */
        .zt-carousel { position:relative; z-index:5; height:100%; width:100%; display:flex; overflow-x:auto; overflow-y:hidden; scroll-snap-type:none; scrollbar-width:none; cursor:grab; overscroll-behavior-x:contain; touch-action:pan-x; }
        .zt-carousel:active { cursor:grabbing; }
        .zt-carousel::-webkit-scrollbar { display:none; }
        .zt-slide { position:relative; flex:0 0 100%; width:100%; min-width:100%; height:100%; overflow:hidden; cursor:default; background:transparent; }
        .zt-slide.zt-upload { cursor:pointer; }

        /* -- team logo: its own big plain layer on the right, bleeding off
           the edge of the frame -- matching the real corporate hero, where
           the ghosted crest is only partly visible, clipped by the frame's
           right edge, not fully contained inside it. */
        .zt-logo-layer { position:absolute; z-index:3; top:4%; bottom:4%; right:-14%; width:56%; display:flex; align-items:center; justify-content:center; opacity:.15; pointer-events:none; }
        .zt-logo-layer :global(img) { width:100%; height:100%; object-fit:contain; }

        /* Moved in from the very edge, closer to the headline, so it sits
           inside the background photo's own swoosh curve instead of off
           to the side of it. */
        /* Every hero image (real cutout, YaTi placeholder, cover photo)
           shares this exact position/size -- per direct feedback, the
           player/YaTi image must land in the same spot on every slide,
           not just the anchor. .zt-person-yati carries no positional
           overrides of its own anymore; it's the same box as .zt-person. */
        /* height/bottom are deliberately balanced so ALL of the box's
           excess-over-100%-height bleeds off the BOTTOM (feet), never the
           top: box top = bottom-offset + height, and that must not exceed
           100% or the top of the image is pushed above this container's
           edge -- clipped by .zt-shell-images' overflow:hidden, which is
           exactly how "make the cutout bigger" previously turned into a
           cropped-off head (118% height with -6% bottom put the top 12%
           above the frame). 104% height with -4% bottom lands the top
           exactly at 100% (box top = -4% + 104% = 100%): a little bigger
           than a plain 100%/0 box, zero risk of cropping the head. */
        /* left is computed, not a flat percentage: box-left = (.zt-copy's
           own left, 34%) minus an 8px gap minus this box's own width, so
           the box's RIGHT edge always lands exactly 8px short of the
           headline regardless of viewport width. Flat left:8%/14% values
           (tried first) only controlled the box's LEFT edge -- since this
           photo is much narrower than its box and object-fit:contain
           scales it by height, most of each box's right portion was
           actually empty transparent margin invisible to the eye, which
           is why nudging left a few points barely moved the VISIBLE photo
           at all. object-position is right-bottom (not left-bottom) so
           the visible pixels hug this exact computed right edge directly,
           however wide or narrow any given player's cutout happens to be,
           per direct feedback that it still wasn't close enough to the
           headline. */
        .zt-person-stack :global(.zt-person) { position:absolute; left:calc(var(--hero-copy-left) - 8px - clamp(150px,18vw,252px)); bottom:-4%; width:clamp(150px,18vw,252px); height:104%; max-width:none; object-fit:contain; object-position:right bottom; filter:drop-shadow(0 14px 22px rgba(0,0,0,.44)); }
        /* Per direct feedback, the primary source (a real back-cutout
           action photo) and the fallback (a headshot cutout, shown only
           when there's no flip-card-back photo yet) get very different
           desktop treatment now, matching the split already made for
           mobile -- previously BOTH shared this one small thumbnail box,
           which is why the primary source never got the "2x, same spot
           as then" treatment mobile did: there was no way to target it
           separately.
           Primary: left justified to the exact same position as
           .zt-person(then) above -- same left calc(), width doubled
           (clamp(300px,36vw,504px), was clamp(150px,18vw,252px)), height
           doubled to match (208%, was 104%) so the taller box doesn't
           become the new limiting dimension for object-fit:contain once
           the image itself is that much bigger, and object-position
           switched to right bottom (was left bottom) to match "then"'s
           own alignment now that they share the same box -- overflow
           past the row's own edges is clipped by .zt-shell-images'
           overflow:hidden, same as a zoomed-in hero photo. Renders
           nothing (see SmartImage) if a player has neither a back-flip-
           card cutout nor a headshot cutout yet, so it never leaves a
           broken-image icon. */
        .zt-person-stack :global(.zt-person-now) { position:absolute; left:calc(var(--hero-copy-left) - 8px - clamp(150px,18vw,252px)); bottom:-4%; width:clamp(300px,36vw,504px); height:208%; object-position:right bottom; }
        /* Fallback only: right-justified to just left of .zt-copy's own
           left edge (var(--hero-copy-left) minus this box's own width) --
           per direct feedback, "right justified to the left of the
           vertical line that the heading is left justified to." Small
           thumbnail size unchanged from before the split above (this was
           never the case that read too big). */
        .zt-person-stack :global(.zt-person-now[data-fallback="true"]) { left:calc(var(--hero-copy-left) - clamp(56px,7vw,84px)); width:clamp(56px,7vw,84px); bottom:24px; height:34%; object-position:left bottom; }
        .zt-visual :global(.zt-person-cover) { position:absolute; z-index:4; left:0; bottom:0; width:100%; height:100%; max-width:none; object-fit:cover; object-position:center top; }

        /* Top-left CTA/identity block, separate from the marketing
           kicker/headline column on the right (which never runs into it
           -- the headline sits in its own right-hand column, not
           stacked above this). Lives on .zt-hero-bleed (see the JSX
           above), not inside the per-slide visual, so it's :global() for
           the same reason the rest of that layer is: it's a sibling of
           <section>, not its descendant, so styled-jsx's scope hash
           never attaches to it. */
        /* top is nearly 0 on purpose: row 2's own 3-line text block (school
           location/name/breadcrumb) ends right where row 3 begins, no gap
           between them by page layout, so pinning this flush to row 3's
           own top edge is what makes the CTA line read as a 4th line of
           that same grouping instead of a separate block floating lower
           in the frame. */
        /* top:14px, not 2px -- matches .zt-copy's own top:0 + padding-
           top:14px exactly (both are 100%-width/height children of
           .zt-shell-images with no offset of their own, so their "top"
           values are the same coordinate), landing .zt-persist-name on
           the same plane as .zt-kick over in the headline column. */
        /* z-index:3, not 8 -- below .zt-person-stack's 4 (the hero cutout),
           on purpose. This block's own position no longer overlaps the
           cutout in the normal case (fixed in earlier passes), so this
           has no visible effect there; it only matters for the rare long
           name/team/org that now runs past its box instead of getting
           ellipsis-truncated (see .zt-persist-id below) -- in that one
           case, the hero image should win and paint over the overflow
           tail, per direct feedback, rather than the text sitting on top
           of the photo. Still above .zt-carousel (z-index:2) and
           .zt-visual-stack (z-index:1), so it stays above the background
           layers exactly as before. */
        /* top:4px, not 14px -- per direct feedback, this block should sit
           higher, closer to row 2's school name/alumni-page text right
           above it, rather than sharing .zt-copy's own top:14px plane
           (see that comment above); the two blocks are no longer meant to
           land on the same line. */
        .zt-moment-cta { position:absolute; z-index:3; left:var(--x-logo-left); top:4px; pointer-events:none; }
        /* gap:1px, not 2px -- these lines read as one dense block cut
           straight from the flip card's back, not loosely spaced. */
        /* No max-width here anymore -- per direct feedback, this block
           shouldn't clip/ellipsis a long name/team/org at all. Each line
           below keeps white-space:nowrap (never wraps to a second line)
           but drops overflow:hidden/text-overflow:ellipsis, so a line
           that's too long to fit just renders past this box's natural
           width instead of getting truncated. .zt-moment-cta's lowered
           z-index (see above) is what makes that overflow land behind the
           hero cutout instead of on top of it. */
        .zt-persist-id { display:flex; flex-direction:column; gap:1px; }
        .zt-persist-name { display:block; color:#fff; font-family:Oswald,sans-serif; font-weight:800; font-size:clamp(14px,2.4vw,22px); line-height:1; letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; }
        /* All four metadata lines at the same (lighter) weight -- team
           and status were 600 while org and B-T-H-W were already 400,
           reading as inconsistently bold; leveled to 400 throughout per
           direct feedback that the block shouldn't be this heavy. */
        .zt-persist-team { display:block; color:#f7f7f5; font-family:Oswald,sans-serif; font-weight:400; font-size:clamp(9px,1.3vw,11.5px); line-height:1.15; letter-spacing:.02em; text-transform:uppercase; white-space:nowrap; }
        .zt-persist-org { display:block; color:#aeb2b6; font-family:Oswald,sans-serif; font-weight:400; font-size:clamp(8px,1.05vw,9.5px); line-height:1.15; text-transform:uppercase; white-space:nowrap; }
        .zt-persist-status { display:block; color:${TIMELINE_YELLOW}; font-family:Oswald,sans-serif; font-weight:400; font-size:clamp(7.5px,1vw,9px); line-height:1.15; letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; }
        .zt-persist-bthw { display:block; color:#aeb2b6; font-family:Oswald,sans-serif; font-weight:400; font-size:clamp(7px,.95vw,8.5px); line-height:1.15; letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; }
        /* Class Of, moved here from the Polaroid's own bottom border --
           gold like .zt-persist-status, since it's now read as part of
           this identity block rather than a caption written on a photo. */
        .zt-persist-classof { display:block; color:${TIMELINE_YELLOW}; font-family:Oswald,sans-serif; font-weight:400; font-size:clamp(7px,.95vw,8.5px); line-height:1.15; letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; }
        /* Polaroid + CTA text, side by side (row, not the old column of
           caption-above-arrow-above-Polaroid), sitting directly under the
           metadata block above it -- same left inset as that block. top
           is a fixed pixel estimate of that block's own height (name +
           4 metadata lines + Class Of, top:4px start) plus a bit of
           breathing room below it -- per direct feedback, this row was
           sitting too close under the Class Of line above it.
           align-items:flex-start, not flex-end -- per direct feedback,
           the caption should start level with the Polaroid's own top
           edge, not bottom-align with it (the caption is the shorter of
           the two, so bottom-aligning left its first line sitting well
           below the Polaroid's top). gap:4px, not 10px -- per direct
           feedback, "push the text block closer to the Polaroid." */
        .zt-polaroid-stack { position:absolute; z-index:8; left:var(--x-logo-left); top:110px; display:flex; flex-direction:row; align-items:flex-start; gap:4px; pointer-events:none; }
        /* Handwritten-caption feel via Caveat (loaded in layout.tsx), not
           Oswald -- reads as a personal note, not another line of the
           same UI chrome type everywhere else on this slide. One wording
           at every breakpoint now (was a separate, larger desktop-only
           variant plus a smaller, differently-worded mobile-only one) --
           per direct feedback, the mobile CTA belongs everywhere. Tilted
           to match the Polaroid beside it (its own -4deg rotation lives on
           .zt-moment-thumb, a sibling, not an ancestor, so this needs its
           own transform rather than inheriting one) -- per direct
           feedback, "rotate that text block just like Click to Upload." */
        /* line-height tightened to 1.0 (was 1.1) -- per direct feedback,
           the lines were sitting too far apart. transform-origin is left
           top now, not left bottom -- matches .zt-polaroid-stack's own
           align-items:flex-start above (this text's top edge is the fixed
           point now, not its bottom). */
        /* text-shadow strengthened into a full outline (8 directions) plus
           its own drop shadow, not just a soft blur -- per direct
           feedback, "add a shadow or outline... to make it pop." A soft
           blur alone was already there for plain legibility (this caption
           can land mid-photo, see .zt-polaroid-stack's own comment on
           mobile overlap), but wasn't enough to make light cursive text
           actually stand out against a busy background the way a solid
           outline does. */
        {/* line-clamp raised to 5 (was 4) to match the 5-line wrap above --
           otherwise the last line ("Timeline!") gets clipped. */}
        .zt-polaroid-caption { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:5; overflow:hidden; max-width:190px; color:#f7f7f5; font-family:"Caveat",cursive; font-weight:700; font-size:clamp(13px,1.7vw,18px); line-height:1; text-shadow:-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 -1.5px 0 #000, 0 1.5px 0 #000, -1.5px 0 0 #000, 1.5px 0 0 #000, 0 3px 6px rgba(0,0,0,.7); transform:rotate(-4deg); transform-origin:left top; }
        {/* max-width raised from 150px so "Career Timeline!" has room to
            sit on one line -- see the span itself, below. */}
        .zt-polaroid-caption-timeline { display:inline; }
        {/* Now a <button> (see its own JSX comment) sitting inside a
            pointer-events:none parent -- pointer-events:auto here puts
            just this element back in the hit-testing tree. border:0/
            font:inherit/cursor:pointer undo the browser's own default
            button chrome so it still reads as the same plain Polaroid
            card it was as a <div>; background/padding/box-shadow etc. are
            unchanged from before. */}
        .zt-moment-thumb { width:clamp(46px,6vw,64px); aspect-ratio:6/7; background:#f4f1e6; border-radius:2px; padding:5px 5px 14px; box-shadow:0 6px 14px rgba(0,0,0,.4); transform:rotate(-4deg); border:0; font:inherit; cursor:pointer; pointer-events:auto; }
        .zt-moment-thumb-frame { display:flex; width:100%; height:100%; align-items:center; justify-content:center; background:#0c0c0c; border-radius:1px; }
        /* Same headline font as .zt-title (Oswald 700, uppercase) -- reads
           as this slide's own UI chrome, not a generic icon. Tilts along
           with the rest of the card via .zt-moment-thumb's own
           rotate(-4deg): no separate transform needed here. */
        /* Bumped up (was clamp(5.5px,.9vw,7px)) now that it's 3 short
           one-word lines instead of 2 -- per direct feedback, larger. */
        .zt-moment-thumb-upload { color:rgba(255,255,255,.6); font-family:Oswald,sans-serif; font-weight:700; font-size:clamp(7px,1.1vw,9px); line-height:1.25; letter-spacing:.05em; text-align:center; text-transform:uppercase; }

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
        /* max-width:854px (100% - 34% - 5% at the 1400px freeze point)
           caps this column's own width alongside --hero-copy-left freezing
           its left edge -- together they keep the headline column a fixed
           block past 1400px instead of stretching wider on an ultra-wide
           screen. Below 1400px this has no effect; the existing left%/
           right% math already produces a narrower box there. */
        .zt-copy { position:absolute; z-index:6; left:var(--hero-copy-left); right:5%; max-width:854px; top:0; bottom:22px; display:flex; flex-direction:column; justify-content:flex-start; padding-top:14px; background:transparent; }
        .zt-kick, .zt-title, .zt-bodycopy { min-width:0; }
        /* font-weight:400, matching the (now-leveled) metadata block --
           was 600, reading as too blocky/heavy next to it, per direct
           feedback. */
        .zt-kick { display:block; margin:0 0 4px; color:${TIMELINE_YELLOW}; font-family:Oswald,sans-serif; font-weight:400; font-size:10px; line-height:1.2; letter-spacing:.13em; text-transform:uppercase; }
        {/* Thin black outline (4-directional text-shadow, not
            -webkit-text-stroke -- a stroke draws centered on the glyph
            and eats into thin letterforms at this weight, while stacked
            shadows sit outside it) plus a soft drop shadow underneath --
            per direct feedback, so the headline/quote text (this class
            covers both, see the quote slide's own JSX) stays readable
            over whatever part of the hero photo happens to land behind
            it, not just on the plain background. */}
        .zt-title { display:block; width:100%; margin:0 0 5px; font-family:Oswald,sans-serif; font-weight:700; font-size:20px; line-height:1.08; letter-spacing:.005em; text-transform:uppercase; color:#f7f7f5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-shadow:-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 -1px 0 #000, 0 1px 0 #000, -1px 0 0 #000, 1px 0 0 #000, 0 2px 5px rgba(0,0,0,.65); }
        /* .zt-season added alongside anchor/lifeyear here -- same class of
           gap as the .zt-copy positioning fix a pass ago: left out of a
           shared rule, fell back to the base .zt-title's nowrap+ellipsis
           instead. The italic + white-space:pre-line life-year used to
           carry on top of this (a separate, more specific rule) is
           removed entirely, not just moved -- per direct feedback, quotes
           should use the exact same font/treatment as the anchor's
           headline, not their own italic style, and pre-line was forcing
           a source-text line break to render literally instead of letting
           the sentence just flow and wrap naturally. */
        .zt-anchor .zt-title, .zt-season .zt-title, .zt-lifeyear .zt-title, .zt-future .zt-title { white-space:normal; overflow-wrap:anywhere; }
        /* text-shadow added -- the anchor's own mobile column (see its
           620px rule below) can run this line right into the "then/now"
           cutout image beside it; a dark shadow keeps it legible against
           the photo instead of just the plain background it was designed
           against. */
        .zt-bodycopy { display:block; width:100%; margin:0; color:#aeb2b6; font-family:Oswald,sans-serif; font-weight:300; font-size:13px; line-height:1.35; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-shadow:0 1px 3px rgba(0,0,0,.85), 0 0 6px rgba(0,0,0,.6); }
        /* The season's 4 headline numbers, big and plain -- no card/tile
           background, border or shadow, per direct feedback ("it doesn't
           need to be a graphic"). Just enlarged label+number pairs in a
           row under the heading. */
        .zt-bigstats { display:flex; flex-wrap:wrap; column-gap:clamp(10px,2.2vw,20px); row-gap:4px; margin-top:2px; }
        .zt-bigstat { display:flex; flex-direction:column; gap:1px; }
        .zt-bigstat-label { color:#aeb2b6; font-family:Oswald,sans-serif; font-weight:600; font-size:clamp(7px,.9vw,8.5px); letter-spacing:.08em; text-transform:uppercase; }
        .zt-bigstat-value { color:#f7f7f5; font-family:"Bebas Neue",Oswald,sans-serif; font-weight:700; font-size:clamp(17px,3.2vw,25px); line-height:1; }
        /* Anchor's own line is short enough by design to stay on the base
           rule's single line (white-space:nowrap + ellipsis) at every
           breakpoint, including mobile -- per direct feedback. Life-year
           quotes are genuinely long/multi-line, so those still need to
           wrap. */
        .zt-lifeyear .zt-bodycopy { white-space:normal; overflow-wrap:anywhere; }
        /* Life-year slides now always carry a YaTi placeholder image (see
           .zt-person-stack's 'lifeyear' case), same as a season slide with
           no real cutout yet -- so the copy column no longer needs the
           extra width a true photo-less slide used to get; it uses the
           same left/right column as every other slide kind. */

        .zt-upload-actions { display:flex; gap:6px; margin-top:6px; }
        .zt-yatzaboy { display:flex; align-items:center; gap:4px; height:24px; padding:0 9px; border:1px solid rgba(255,178,28,.5); border-radius:999px; background:rgba(0,0,0,.35); color:${TIMELINE_YELLOW}; font:800 8px/1 Oswald,sans-serif; letter-spacing:.05em; cursor:pointer; }
        .zt-yatzaboy.active { background:${TIMELINE_YELLOW}; color:#1a1208; }
        .zt-yatzaboy b { font-size:9px; }
        .zt-comment-pill { display:flex; align-items:center; gap:4px; height:24px; padding:0 8px; border:1px solid rgba(255,255,255,.3); border-radius:999px; background:rgba(0,0,0,.35); color:#fff; font:700 9px/1 Oswald,sans-serif; cursor:pointer; }

        /* -- bottom chrome: a continuous progress rail plus a pair of
           square prev/next buttons at the bottom-right, matching the real
           corporate hero's bottom bar, not round dots and mid-edge
           circular arrows. .zt-visual-baseline -- a separate full-bleed
           gold glow line that used to sit right under this rail -- is
           gone entirely now, not just restyled: once the rail itself
           moved down close to the frame's own bottom edge, the two gold
           lines sat close enough together to visually compete, per direct
           feedback ("my eye wants to look at it... it needs to go").
           The rail reads as ONE continuous line rather than a row of
           separate hash marks: the whole track is gold (his career, dot
           to dot, not just a stretch of it -- see .zt-rail-track below),
           per-slide stops are thin ticks embedded in that same line
           instead of standalone bars, and the current stop is called out
           by breaking the line and setting the year directly into that
           gap -- an opaque year chip painted over both the fill and the
           track -- rather than lighting a mark up
           gold. */
        /* bottom:10px, staying level with .zt-rail's own bottom:14px. */
        .zt-nav { position:absolute; z-index:7; bottom:10px; top:auto; transform:none; width:20px; height:20px; border-radius:3px; border:1px solid rgba(255,255,255,.32); background:rgba(0,0,0,.4); color:#fff; display:grid; place-items:center; cursor:pointer; font-size:13px; }
        .zt-nav:disabled { opacity:.3; cursor:default; }
        /* Moved from stacked next to zt-nav-next (right:30px) over to the
           far left edge -- per direct feedback, the rail should sit
           between the two arrows, not have both of them clustered at one
           end of it. Mirrors zt-nav-next's own right:6px inset. */
        .zt-nav-prev { left:6px; right:auto; }
        .zt-nav-next { right:6px; }
        /* bottom raised to 20px (was 4px) -- per direct feedback, moving
           the per-tick year labels to sit below each dot (see
           .zt-rail-tick-year below) meant they were landing right at, and
           getting clipped by, this frame's own bottom edge; raising the
           whole rail (ticks, labels, and all) clears that. left/right
           now clear the prev/next arrows individually (6px inset + 20px
           width + 8px gap = 34px each side) now that they sit at opposite
           ends instead of both being clustered on the right. */
        /* right:44px, not the mirrored 34px -- the extra 10px makes room
           for .zt-rail-tick-boundary (see below) to sit clearly separated
           from both the last real tick and .zt-nav-next beside it, rather
           than crowding either. bottom:14px, not flush against the frame's
           own bottom edge -- per direct feedback, a little padding below
           the tick-year labels reads better than none at all. */
        .zt-rail { position:absolute; z-index:6; left:34px; right:44px; bottom:14px; height:12px; }
        /* Solid gold the whole way now, not gray-before/gold-after-grad-
           year (that two-tone .zt-rail-fill overlay is gone) -- per direct
           feedback: "I want it all yellow except for the little red
           dots." Keeps the glow the old scroll-driven fill used to carry,
           just applied to the full-width track instead of a partial one. */
        .zt-rail-track { position:absolute; left:0; right:0; top:50%; height:2.5px; transform:translateY(-50%); border-radius:1px; background:${TIMELINE_YELLOW}; box-shadow:0 0 6px rgba(255,178,28,.55); }
        /* Every tick red now, not just the birth-year one -- per direct
           feedback. */
        /* 4px, not 6px -- per direct feedback, smaller dots. */
        .zt-rail-tick { position:absolute; top:50%; width:4px; height:4px; margin-left:-2px; transform:translateY(-50%); border:0; border-radius:50%; padding:0; background:#e5342a; cursor:pointer; }
        .zt-rail-tick.active { background:transparent; cursor:default; }
        /* Sits outside .zt-rail (see its own JSX comment), so top:50%/
           margin-left from the base rule above -- both relative to
           .zt-rail's own box -- are overridden here against the outer
           frame instead: bottom matches .zt-rail's own bottom+half its
           height, right sits in the gap between the rail's own right
           edge and .zt-nav-next beside it. Not a button, so no hover/
           active state to style. */
        .zt-rail-tick-boundary { top:auto; bottom:18px; left:auto; right:36px; margin-left:0; transform:none; cursor:default; }
        /* Sits just below each tick's own dot now (was above it), per
           direct feedback. Hidden on the active tick itself so it doesn't
           double up with .zt-rail-year's own bigger, bold, draggable
           label. Deliberately tiny and abbreviated to the last two
           digits -- a full "2021" at every tick, on a rail with a full
           career's worth of seasons, would run into its neighbors; "21"
           reads fine at this size and this density. Hidden altogether on
           narrow phone widths (see the 620px media query) -- no room for
           a label at every tick once the rail itself is that
           compressed. */
        .zt-rail-tick-year { position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:3px; color:rgba(255,255,255,.55); font:600 8px/1 Oswald,sans-serif; letter-spacing:.02em; white-space:nowrap; pointer-events:none; }
        .zt-rail-tick.active .zt-rail-tick-year { display:none; }
        .zt-rail-year { position:absolute; top:50%; transform:translate(-50%,-50%); padding:0 6px; background:#040506; border-radius:3px; color:${TIMELINE_YELLOW}; font:700 10px/18px "Bebas Neue",Oswald,sans-serif; letter-spacing:.04em; white-space:nowrap; cursor:grab; touch-action:none; }
        .zt-rail-year:active { cursor:grabbing; }

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
        /* Hard-stops at the bottom of row 2 (held at full darkness for
           icon/logo contrast through exactly var(--row1-h)+var(--row2-h),
           then fades out over the next 40px) instead of a slow taper
           that used to keep darkening well into row 3. Row 3's photo --
           including the swoosh baked into it -- is meant to be governed
           by exactly one thing, its own filter:brightness(.78) on
           .zt-hero-bleed-bg below, not a second overlay stacked on top
           of it too; a taper reaching into that area was a second,
           redundant brightness control on the same pixels. */
        :global(.zt-hero-bleed-overlay) { position:absolute; inset:0; pointer-events:none; background:linear-gradient(180deg,rgba(0,0,0,.74) 0%,rgba(0,0,0,.74) calc(var(--row1-h, 36px) + var(--row2-h, 54px)),rgba(0,0,0,0) calc(var(--row1-h, 36px) + var(--row2-h, 54px) + 40px)); }
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
        /* .yat-icon-btn's color and .yat-wordmark-img's filter both read
           --fg/--logo-filter, which body.light-theme flips (near-white ->
           near-black, invert(1) -> none) so they stay legible against
           every OTHER page template's --header-bg, which flips in sync
           right alongside them. This is the only template with a
           permanently-dark photo behind rows 1-2 instead of a
           theme-matched solid background, so that flip works against it
           instead of for it -- in light-theme, the icons/logo go dark
           against a background that's still dark. Re-pinning both
           variables here, on the row shells themselves, overrides what
           body.light-theme set for every descendant inside them without
           touching the variables anywhere else on the site. --muted gets
           the same treatment on row 2: .yat-schooltext .small (the
           "LAKESIDE, CA" location line) reads var(--muted), which
           light-theme also flips dark (#555) -- without this it went
           dark-on-dark against the same permanently-dark photo. */
        :global(.yat-row1-shell.pp-hero-row) { --fg: #f2f2f2; --logo-filter: invert(1); }
        :global(.yat-row2-shell.pp-hero-row) { --fg: #f2f2f2; --muted: #c4c4c4; }
        /* .yat-schooltext .big1/.big2 (the school name + "ALUMNI PROFILE
           PAGE" label) have no color property of their own in
           YatStyles.tsx -- they just inherit body's plain color, which is
           ALREADY a resolved value by the time it reaches them (dark in
           light-theme), not a live re-read of --fg at this element.
           Re-pinning --fg on the row shell above never reaches them for
           that reason -- confirmed via direct feedback ("in light mode
           it's black on a black background"). Forcing color:var(--fg)
           here, inside this template's own pp-hero-row scope, re-resolves
           --fg AT these two elements, which does pick up the re-pin.
           The WHOLE selector has to sit inside :global(...) here, not just
           its first compound -- styled-jsx appends this component's own
           scoping attribute to anything left outside the parens, and
           .big1/.big2 (rendered by SchoolContextBar.tsx, a different
           component entirely) never carry that attribute. The first
           attempt at this rule wrapped only ".yat-row2-shell.pp-hero-row"
           and left ".yat-schooltext .big1" bare, so it silently never
           matched anything in production -- confirmed still black in
           light mode after that first attempt shipped. */
        :global(.yat-row2-shell.pp-hero-row .yat-schooltext .big1),
        :global(.yat-row2-shell.pp-hero-row .yat-schooltext .big2) { color: var(--fg); }

        /* -- responsive: proportions only, same single layered frame at
           every width (never restructures into a grid or stacks into two
           boxes) -- exact scaling from layered-story-strip.js's own
           @media max-width:900px / 620px. */
        @media (max-width:900px) {
          /* Same computed-right-edge/left-justified-to-headline treatment
             as the desktop base rule, same reasons -- just recomputed
             against .zt-copy's left:32% at this breakpoint instead of 34%. */
          .zt-person-stack :global(.zt-person) { left:calc(32% - 8px - clamp(130px,26vw,200px)); width:clamp(130px,26vw,200px); }
          /* Primary source: same left/width relationship as .zt-person
             (then) above, doubled -- see the desktop base rule's own
             comment for why. bottom/height/object-position inherit from
             that same base rule (-4%/208%/right bottom), unchanged here. */
          .zt-person-stack :global(.zt-person-now) { left:calc(32% - 8px - clamp(130px,26vw,200px)); width:clamp(260px,52vw,400px); }
          /* Fallback: recomputed against .zt-copy's real left:32% at this
             breakpoint -- var(--hero-copy-left) (used at the desktop base
             rule) is a fixed ~34%/476px and no longer matches .zt-copy's
             own position once this breakpoint's 32% override takes over. */
          .zt-person-stack :global(.zt-person-now[data-fallback="true"]) { left:calc(32% - clamp(48px,7vw,72px)); width:clamp(48px,7vw,72px); }
          .zt-logo-layer { width:50%; right:-12%; }
          .zt-copy { left:32%; right:5%; bottom:20px; }
          .zt-title { font-size:clamp(15px,3.4vw,22px); }
          .zt-bodycopy { font-size:clamp(10px,2vw,13px); }
        }
        @media (max-width:620px) {
          /* Shorter box: 200px was leaving real dead space above the hero
             image/headline once type scaled down this far, per direct
             feedback. The row3-shell/row4-shell/profile-strip trio and the
             hero-bleed height calc all have to shrink together or the
             bleed photo would run past row3's now-shorter bottom edge. */
          :global(.yat-row3-shell:has(.yat-profile-career-strip)) { min-height:${ROW_H_MOBILE}px !important; height:${ROW_H_MOBILE}px !important; }
          :global(.yat-profile-career-strip) { height:${ROW_H_MOBILE}px !important; min-height:${ROW_H_MOBILE}px !important; }
          :global(.zt-hero-bleed) { height:calc(var(--row1-h, 36px) + var(--row2-h, 54px) + ${ROW_H_MOBILE}px) !important; }
          :global(.zt-hero-bleed .zt-hero-bleed-bg) { object-position:0% 50%; }
          .zt-visual-gradient { background:linear-gradient(90deg,rgba(0,0,0,.04) 0%,rgba(3,4,5,.32) 22%,rgba(3,4,5,.90) 47%,#030405 100%),linear-gradient(180deg,rgba(0,0,0,.10),transparent 55%,rgba(0,0,0,.50)); }
          /* Reverted back to a flat left/object-position:left-bottom --
             a prior pass here tried reusing .zt-copy's own box-relative
             left (the calc()-from-headline pattern desktop and the 900px
             breakpoint use) but got it wrong: .zt-copy lives inside this
             breakpoint's doubled, 200%-wide scrolling slide box (see its
             own rule below), so its "32%" is a box-relative value that's
             real-64% on screen -- but .zt-person-stack does NOT scroll
             and was never part of that doubled box, so its own
             percentages are plain, direct percentages of the real
             viewport. Subtracting the headline's doubled 32% from this
             box's real coordinate system landed the cutout far off to the
             left, not lined up with anything. Back to the plain flat
             left:24%/object-position:left-bottom this had before that. */
          .zt-person-stack :global(.zt-person) { left:24%; width:clamp(84px,28vw,120px); object-position:left bottom; }
          /* No room for a second full image alongside the HS cutout at
             this width without crowding the already-tight text column,
             so "now" occupies the exact same box as "then" instead of a
             spot of its own -- same left/width as the rule above, same
             object-position (overriding the desktop-only "right bottom"
             that let it lean toward the gap it fills there) -- and the
             two alternate via the crossfade animation below rather than
             both showing at once. */
          /* Per direct feedback, the two sources SmartImage can land on
             here need very different treatment, not one shared box:
             - primary (a real back-cutout action photo, matching
               .zt-person-then's own proportions) doesn't just keep its
               original size -- it's 2x that now (width doubled to
               clamp(168px,56vw,240px); height raised to 172%, double the
               original 86%, so the taller box doesn't become the new
               limiting dimension for object-fit:contain once the image
               itself is that much bigger -- any overflow past the row's
               own edges is clipped by .zt-shell-images' overflow:hidden,
               same as a zoomed-in hero photo). left reuses .zt-person
               (then)'s own left calc() (same anchor, same subtracted
               width, THEN's width not this box's own wider one) -- the
               exact same pattern the desktop base rule uses for its own
               primary/then pair (see line ~1599), so the two boxes start
               at the same point and only this one extends further right
               since it's wider, rather than both sharing one flat 24%.
             - fallback (a squarer headshot cutout, shown only when
               there's no flip-card-back photo yet) is the one that
               actually renders too big at the ORIGINAL size, let alone
               2x it -- see the [data-fallback] override below, which is
               the only case that still needs shrinking (and is still its
               own separate position, left-justified with the headline
               column, not sharing this shared spot).
             bottom:2px, not 16px -- matches .zt-rail's own mobile bottom
             (see its rule) so both cases visibly rest on the timeline
             instead of floating above it. left/object-position reverted
             to the same flat left:24%/left-bottom as .zt-person just
             above, for the same reason -- see that rule's own comment. */
          .zt-person-stack :global(.zt-person-now) { left:24%; width:clamp(168px,56vw,240px); bottom:2px; height:172%; object-position:left bottom; }
          /* SmartImage marks its <img> data-fallback="true" once it's had
             to move past the first source in its list -- see SmartImage's
             own comment. Only this case (the headshot fallback) gets
             shrunk. left is right-justified to just before the slide's
             own headline/kicker/bodycopy column starts -- per direct
             feedback, "right justified to the left of the vertical line
             that the heading is left justified to." This box lives in
             .zt-person-stack, which is NOT part of this breakpoint's
             doubled 200%-wide scrolling slide box that .zt-copy lives in
             (see .zt-person's own comment above, and .zt-copy's own rule
             below) -- so anchoring against .zt-copy's real on-screen
             position means doubling its box-relative left (29% here ->
             real 58%), not reusing that 29% directly the way a previous
             pass wrongly did. bottom:12px, not the base rule's 24px, to
             track .zt-rail's own bottom:2px at this breakpoint (see that
             rule below) -- but NOT flush to the same 2px .zt-person-now's
             much taller primary case uses just above: this box is a
             short, small headshot thumbnail (height:30%, not 172%), so
             matching the rail's own bottom offset 1:1 sat its bottom
             edge below the rail's dot line instead of right on it, per
             direct feedback. bottom:12px instead keeps the same +10px
             gap over the rail's own bottom that the desktop base rule
             uses (rail bottom:14px, this box's own bottom:24px there --
             confirmed by direct feedback that desktop "sits right on the
             line"), just recomputed against this breakpoint's rail
             bottom:2px instead of desktop's 14px. */
          .zt-person-stack :global(.zt-person-now[data-fallback="true"]) { left:calc(58% - clamp(40px,14vw,60px)); width:clamp(40px,14vw,60px); height:30%; bottom:12px; }
          /* 8s loop, ~4s each: "then" visible 0-3.2s, cross-dissolves
             over the next .8s, "now" visible 4-7.2s, cross-dissolves
             back over the last .8s. .zt-person-now runs the identical
             keyframes 4s out of phase (half the cycle) via animation-
             delay, so whichever one is fading in, the other is fading
             out at the same rate -- never both fully opaque or both
             fully transparent at once. Multiplies with the inline
             opacity from the slide's own scroll-based crossfade (a
             nested opacity is applied on top of the parent's, not
             instead of it), so this only ever matters while the anchor
             slide itself is the one in view. */
          .zt-person-then, .zt-person-now { animation:zt-then-now-fade 8s ease-in-out infinite; }
          .zt-person-now { animation-delay:-4s; }
          @keyframes zt-then-now-fade {
            0%, 40% { opacity:1; }
            50%, 90% { opacity:0; }
            100% { opacity:1; }
          }
          .zt-logo-layer { width:58%; right:-14%; opacity:.14; }
          /* This whole block (name + the four metadata lines) is sized
             down a notch at this breakpoint -- smaller than the desktop
             clamp floors, not just following the same vw scaling -- so a
             typical name/team/org/status fits without needing to overflow
             at all on most phones. An unusually long one (see a live
             example: "HUDSON VALLEY RENEGADES") will still run past this
             column's natural width even at this size; that's expected and
             fine now, not a bug -- .zt-persist-id has no max-width to
             clip it, and .zt-moment-cta's z-index (see its own comment
             above) puts the hero cutout on top of that overflow instead
             of ellipsis-truncating it. Per direct feedback, no line here
             should ever show "...". */
          .zt-persist-name { font-size:clamp(11px,3.2vw,14px); }
          .zt-persist-team { font-size:8px; }
          .zt-persist-org { font-size:7.5px; }
          .zt-persist-status { font-size:7px; }
          .zt-persist-bthw { font-size:6.5px; }
          .zt-persist-classof { font-size:6.5px; }
          /* Same element/text as desktop now (see its own comment) --
             just resized to fit this narrower column: smaller, tighter
             line-height, per direct feedback ("tightly spaced lines, it
             will fit on mobile"). max-width narrowed further from 120px --
             this row starts right where the anchor's own "then/now" cutout
             column starts too (both are pinned to fixed/percentage
             positions, not aware of each other), so the narrower this
             column stays, the less of it actually sits over that photo
             instead of the plain background. */
          .zt-polaroid-caption { font-size:11px; line-height:.92; max-width:80px; }
          /* Desktop-only merge (see the base rule above) undone here --
             mobile keeps "Timeline!" on its own line, the 5-line wrap. */
          .zt-polaroid-caption-timeline { display:block; }
          /* Recomputed for this breakpoint's smaller metadata block (see
             the font-size overrides just above), plus the same added
             breathing room as the desktop base rule. */
          .zt-polaroid-stack { top:80px; }
          .zt-moment-thumb { width:clamp(38px,14vw,50px); }
          .zt-moment-thumb-upload { font-size:clamp(6px,1.6vw,7.5px); }
          /* No room for a year label at every tick once the rail itself is
             this compressed -- per direct feedback. */
          .zt-rail-tick-year { display:none; }
          /* Nothing below the rail needs protecting at this breakpoint
             (the tick-year labels are hidden here -- rule right above),
             so it can sit right at the very bottom of the section instead
             of the desktop base rule's 8px -- per direct feedback. */
          .zt-rail { bottom:2px; }
          .zt-nav { bottom:0; }
          .zt-rail-tick-boundary { bottom:6px; }
          /* Each slide is 200% of the viewport here, not 100% -- doubling
             the physical scroll distance between moments so a phone-width
             screen still gives each one real room, matching how much
             "throw" there is between hero images on desktop, per direct
             feedback. .zt-copy's left/width (percentages of the SLIDE's
             own box) read as HALF their real on-screen percentage --
             e.g. left:26%/width:22% of a 200%-wide box lands at the real
             52%-96% of the actual viewport -- just expressed as a "right"
             edge doesn't work any more once the box is wider than the
             viewport (the box's actual right edge is now off-screen), so
             it's left+width instead of left+right. Contained to the
             right half of the real screen (not the ~32%-96% span this
             used to compute to) so the text card never sits on top of
             the person cutout in the left half of the frame, and anchored
             to the top of the box instead of vertically centered, per
             direct feedback that the resting text was covering the hero
             image. .zt-rail/.zt-nav are unaffected: they're positioned
             relative to the outer (un-doubled) frame, not to any one
             .zt-slide. */
          .zt-slide { flex:0 0 200%; width:200%; min-width:200%; }
          /* One shared position for every slide kind, still -- left/width
             moved back to the anchor's own original 26%/22%, not
             lifeyear/season's old 22%/28% (real 44%-100%) that this got
             unified onto -- per direct feedback, that landed the headline
             too far left on every slide, anchor included, once it became
             the shared value. Nudged right from 26%/22% to 29%/19% (real
             58%-96%) per direct feedback the header/text block still
             needed to move a little further right -- a prior pass pushed
             this too far to 32%/17% and also (wrongly) reused this box's
             own doubled percentage directly in the person-stack rules
             above, which don't live in this doubled scrolling box; those
             are back to their own flat, correct values now (see their own
             comments). Contained to the real screen's right half,
             expressed as left+width rather than right, because this slide
             is 200% wide, so "right" would measure from an edge that's
             off-screen. */
          .zt-copy { left:29%; right:auto; width:19%; bottom:14px; justify-content:flex-start; padding-top:10px; }
          /* A touch smaller than the general .zt-bodycopy floor so the
             now-shorter anchor line ("Stay connected to X on his
             baseball journey...") has the best chance of actually
             fitting on one line in this narrow column, not just
             getting cut off by the single-line ellipsis. */
          .zt-anchor .zt-bodycopy { font-size:clamp(8px,2vw,10px); }
          .zt-kick { font-size:7px; margin-bottom:3px; }
          .zt-title { font-size:clamp(13px,4.2vw,17px); margin-bottom:3px; }
          .zt-bodycopy { font-size:clamp(9px,2.2vw,11px); }
        }
      `}</style>
    </section>
    </>
  );
}
