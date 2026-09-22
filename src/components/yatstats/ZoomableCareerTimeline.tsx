'use client';

import { MouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
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
// HS_GRAD_AGE-1), standing in for the old "this year is still a blank
// page" placeholder copy on any of those 17 screens that has no fan photo
// dated to it yet.
const LIFE_YEAR_QUOTES: Record<number, string> = {
  1: "You Win Some. You Lose Some.\nThere's No Crying in Baseball.",
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
  15: "You're always going to win as\na team and lose as a team.\nCheck your ego at the door.",
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

function SmartImage({ src, srcs, alt, className }: { src?: string; srcs?: string[]; alt: string; className?: string }) {
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
  // Same resolution SchoolContextBar.tsx uses for its own breadcrumb:
  // PlayerProfileContext's playerName can come back empty (a data-quality
  // gap in the identity lookup it's fed from), so this falls back to the
  // name embedded in the route's own /player/[playerId]/[slug] segment
  // rather than ever showing "him"/"his" in its place.
  const pathname = usePathname();
  const slugDerivedName = (() => {
    const match = pathname?.match(/\/player\/([^/]+)(?:\/([^/?#]+))?/);
    return match?.[2]
      ? match[2].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : '';
  })();
  const resolvedPlayerName = player?.playerName || slugDerivedName;
  // Same join logic as PlayerCardBack.tsx's posLevelStatus/btHw, applied to
  // the same context fields, so this reads identically to the flip card's
  // back rather than approximating it.
  const posLevelStatus = [player?.position, player?.levelLabel, player?.statusLabel].filter(Boolean).join(' - ');
  const batsThrowsHw = [
    player?.bats && player?.throws ? `B/T ${player.bats}/${player.throws}` : '',
    player?.height && player?.weight ? `${player.height} / ${player.weight}` : (player?.height || player?.weight || ''),
  ].filter(Boolean).join(' - ');
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
      title: resolvedPlayerName || 'High School',
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

    return { startYear: birthYear ?? hsYear, endYear, hsYear, slides, anchorIndex: anchorIndex < 0 ? 0 : anchorIndex };
  }, [stats, uploads, playerId, localOverrides, resolvedPlayerName]);

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
      {resolvedPlayerName && (
        <div className="zt-moment-cta" aria-hidden="true">
          <span className="zt-moment-cta-line">Post a Moment on the Career Path Timeline of</span>
          {/* Same fields, same order, as the flip card's BACK (position -
              level - status, then B/T + height/weight) -- sourced from
              the same PlayerProfileContext fields layout.tsx already
              computes for it, not re-derived here -- per direct
              feedback that a fan should see the same facts whichever
              of the flip card's front, its back, or this profile page
              they're looking at. */}
          <div className="zt-persist-id">
            <span className="zt-persist-name">{resolvedPlayerName}</span>
            {player?.currentTeamName && (
              <span className="zt-persist-team">{player.currentTeamName}</span>
            )}
            {player?.orgConferenceName && (
              <span className="zt-persist-org">{player.orgConferenceName}</span>
            )}
            {posLevelStatus && (
              <span className="zt-persist-status">{posLevelStatus}</span>
            )}
            {batsThrowsHw && (
              <span className="zt-persist-bthw">{batsThrowsHw}</span>
            )}
          </div>
          <div className="zt-moment-thumb">
            <span className="zt-moment-thumb-frame">
              <i className="ri-image-add-line" />
            </span>
          </div>
        </div>
      )}
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
              {slide.kind === 'anchor' && (
                <SmartImage className="zt-person" src={`${S3_BASE}/players/cutouts/${encodeURIComponent(playerId)}.png`} alt={`${firstName(slide.title)} cutout`} />
              )}
              {slide.kind === 'season' && (
                <SmartImage className="zt-person zt-person-yati" srcs={slide.seasonCutoutSrc ? [slide.seasonCutoutSrc] : []} src={slide.yatiFallback || YATI_PLACEHOLDERS[0]} alt={`${resolvedPlayerName || 'Player'} — ${slide.year}`} />
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
                  <span className="zt-title">When a baseball player&apos;s journey doesn&apos;t end at graduation, neither should his story.</span>
                  <span className="zt-bodycopy">Follow {resolvedPlayerName ? firstName(resolvedPlayerName) : 'his'} journey through college and professional baseball.</span>
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
                  <span className="zt-kick">Age {slide.age}</span>
                  <span className="zt-title">&ldquo;{LIFE_YEAR_QUOTES[slide.age ?? 0]}&rdquo;</span>
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
          <div className="zt-rail" ref={railRef}>
            <span className="zt-rail-track" aria-hidden="true" />
            <span className="zt-rail-fill" style={{ width: `${railProgress * 100}%` }} aria-hidden="true" />
            {model.slides.map((slide, i) => (
              <button
                type="button"
                key={slide.id}
                className={`zt-rail-tick${i === activeIndex ? ' active' : ''}`}
                style={{ left: `${(i / Math.max(1, model.slides.length - 1)) * 100}%` }}
                onClick={() => scrollToIndex(i)}
                aria-label={`Slide ${i + 1}`}
              />
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
        .zt-visual :global(.zt-person) { position:absolute; z-index:4; left:14%; bottom:-4%; width:clamp(150px,18vw,260px); height:104%; max-width:none; object-fit:contain; object-position:left bottom; filter:drop-shadow(0 14px 22px rgba(0,0,0,.44)); }
        .zt-visual :global(.zt-person-cover) { left:0; bottom:0; width:100%; height:100%; max-width:none; object-fit:cover; object-position:center top; }
        .zt-visual-baseline { position:absolute; z-index:5; left:0; right:0; bottom:0; height:2px; background:linear-gradient(90deg,rgba(200,169,110,.25),#d3aa48 28%,#efd070 55%,rgba(200,169,110,.24)); box-shadow:0 0 16px rgba(211,170,72,.28); pointer-events:none; }

        /* Top-left CTA/identity block, separate from the marketing
           kicker/headline column on the right (which never runs into it
           -- the headline sits in its own right-hand column, not
           stacked above this). Lives on .zt-hero-bleed (see the JSX
           above), not inside the per-slide visual, so it's :global() for
           the same reason the rest of that layer is: it's a sibling of
           <section>, not its descendant, so styled-jsx's scope hash
           never attaches to it. */
        .zt-moment-cta { position:absolute; z-index:8; left:4%; top:10px; display:flex; flex-direction:column; align-items:flex-start; gap:5px; pointer-events:none; }
        .zt-persist-id { display:flex; flex-direction:column; gap:2px; max-width:160px; }
        .zt-persist-name { display:block; color:#fff; font-family:Oswald,sans-serif; font-weight:800; font-size:clamp(14px,2.4vw,22px); line-height:1; letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .zt-persist-team { display:block; color:#f7f7f5; font-family:Oswald,sans-serif; font-weight:600; font-size:clamp(9px,1.3vw,11.5px); line-height:1.2; letter-spacing:.02em; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .zt-persist-org { display:block; color:#aeb2b6; font-family:Oswald,sans-serif; font-weight:400; font-size:clamp(8px,1.05vw,9.5px); line-height:1.2; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .zt-persist-status { display:block; color:${TIMELINE_YELLOW}; font-family:Oswald,sans-serif; font-weight:600; font-size:clamp(7.5px,1vw,9px); letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .zt-persist-bthw { display:block; color:#aeb2b6; font-family:Oswald,sans-serif; font-weight:400; font-size:clamp(7px,.95vw,8.5px); letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        /* Same font as .zt-title (the marketing headline), not a separate
           italic style -- per direct feedback -- kept mixed-case (not
           uppercase like .zt-title) since this line's actual text isn't
           written in all caps. */
        .zt-moment-cta-line { display:block; max-width:220px; color:${TIMELINE_YELLOW}; font-family:Oswald,sans-serif; font-weight:700; font-size:clamp(8px,1.05vw,10px); line-height:1.3; letter-spacing:.005em; }
        .zt-moment-thumb { margin-top:8px; width:clamp(46px,6vw,64px); aspect-ratio:6/7; background:#f4f1e6; border-radius:2px; padding:5px 5px 11px; box-shadow:0 6px 14px rgba(0,0,0,.4); transform:rotate(-4deg); }
        .zt-moment-thumb-frame { display:flex; width:100%; height:100%; align-items:center; justify-content:center; background:#0c0c0c; border-radius:1px; color:rgba(255,255,255,.4); font-size:clamp(14px,2vw,20px); }

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
        .zt-copy { position:absolute; z-index:6; left:40%; right:5%; top:0; bottom:22px; display:flex; flex-direction:column; justify-content:flex-start; padding-top:14px; background:transparent; }
        .zt-kick, .zt-title, .zt-bodycopy { min-width:0; }
        .zt-kick { display:block; margin:0 0 4px; color:${TIMELINE_YELLOW}; font-family:Oswald,sans-serif; font-weight:600; font-size:10px; line-height:1.2; letter-spacing:.13em; text-transform:uppercase; }
        .zt-title { display:block; width:100%; margin:0 0 5px; font-family:Oswald,sans-serif; font-weight:700; font-size:20px; line-height:1.08; letter-spacing:.005em; text-transform:uppercase; color:#f7f7f5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .zt-anchor .zt-title, .zt-lifeyear .zt-title { white-space:normal; overflow-wrap:anywhere; }
        .zt-lifeyear .zt-title { white-space:pre-line; font-style:italic; }
        .zt-bodycopy { display:block; width:100%; margin:0; color:#aeb2b6; font-family:Oswald,sans-serif; font-weight:300; font-size:13px; line-height:1.35; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* The season's 4 headline numbers, big and plain -- no card/tile
           background, border or shadow, per direct feedback ("it doesn't
           need to be a graphic"). Just enlarged label+number pairs in a
           row under the heading. */
        .zt-bigstats { display:flex; flex-wrap:wrap; column-gap:clamp(10px,2.2vw,20px); row-gap:4px; margin-top:2px; }
        .zt-bigstat { display:flex; flex-direction:column; gap:1px; }
        .zt-bigstat-label { color:#aeb2b6; font-family:Oswald,sans-serif; font-weight:600; font-size:clamp(7px,.9vw,8.5px); letter-spacing:.08em; text-transform:uppercase; }
        .zt-bigstat-value { color:#f7f7f5; font-family:"Bebas Neue",Oswald,sans-serif; font-weight:700; font-size:clamp(17px,3.2vw,25px); line-height:1; }
        .zt-anchor .zt-bodycopy, .zt-lifeyear .zt-bodycopy { white-space:normal; overflow-wrap:anywhere; }
        /* No cutout/logo on a life-year slide (there's no photo yet) -- the
           copy block gets the room that would otherwise be reserved for
           one, so the invite reads as a real screen instead of empty
           space with a caption stuck to the right. */
        .zt-lifeyear .zt-copy { left:6%; }

        .zt-upload-actions { display:flex; gap:6px; margin-top:6px; }
        .zt-yatzaboy { display:flex; align-items:center; gap:4px; height:24px; padding:0 9px; border:1px solid rgba(255,178,28,.5); border-radius:999px; background:rgba(0,0,0,.35); color:${TIMELINE_YELLOW}; font:800 8px/1 Oswald,sans-serif; letter-spacing:.05em; cursor:pointer; }
        .zt-yatzaboy.active { background:${TIMELINE_YELLOW}; color:#1a1208; }
        .zt-yatzaboy b { font-size:9px; }
        .zt-comment-pill { display:flex; align-items:center; gap:4px; height:24px; padding:0 8px; border:1px solid rgba(255,255,255,.3); border-radius:999px; background:rgba(0,0,0,.35); color:#fff; font:700 9px/1 Oswald,sans-serif; cursor:pointer; }

        /* -- bottom chrome: a continuous progress rail plus a pair of
           square prev/next buttons at the bottom-right, matching the real
           corporate hero's bottom bar (sitting just above its baseline
           gold line), not round dots and mid-edge circular arrows.
           The rail reads as ONE continuous line (picking up visually from
           .zt-visual-baseline's full-bleed gold glow below it, which is
           this same frame's one "burned into the background" swoosh/line)
           rather than a row of separate hash marks: a single gold "fill"
           covers the traveled distance, per-slide stops are thin ticks
           embedded in that same line instead of standalone bars, and the
           current stop is called out by breaking the line and setting the
           year directly into that gap -- an opaque year chip painted over
           both the fill and the track -- rather than lighting a mark up
           gold. */
        .zt-nav { position:absolute; z-index:7; bottom:5px; top:auto; transform:none; width:20px; height:20px; border-radius:3px; border:1px solid rgba(255,255,255,.32); background:rgba(0,0,0,.4); color:#fff; display:grid; place-items:center; cursor:pointer; font-size:13px; }
        .zt-nav:disabled { opacity:.3; cursor:default; }
        .zt-nav-prev { right:30px; left:auto; }
        .zt-nav-next { right:6px; }
        .zt-rail { position:absolute; z-index:6; left:40%; right:60px; bottom:11px; height:12px; }
        .zt-rail-track { position:absolute; left:0; right:0; top:50%; height:2.5px; transform:translateY(-50%); border-radius:1px; background:rgba(255,255,255,.28); }
        .zt-rail-fill { position:absolute; left:0; top:50%; height:2.5px; transform:translateY(-50%); border-radius:1px; background:${TIMELINE_YELLOW}; box-shadow:0 0 6px rgba(255,178,28,.55); transition:width .18s linear; }
        .zt-rail-tick { position:absolute; top:50%; width:6px; height:6px; margin-left:-3px; transform:translateY(-50%); border:0; border-radius:50%; padding:0; background:rgba(4,5,6,.55); cursor:pointer; }
        .zt-rail-tick.active { background:transparent; cursor:default; }
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
           touching the variables anywhere else on the site. */
        :global(.yat-row1-shell.pp-hero-row) { --fg: #f2f2f2; --logo-filter: invert(1); }
        :global(.yat-row2-shell.pp-hero-row) { --fg: #f2f2f2; }

        /* -- responsive: proportions only, same single layered frame at
           every width (never restructures into a grid or stacks into two
           boxes) -- exact scaling from layered-story-strip.js's own
           @media max-width:900px / 620px. */
        @media (max-width:900px) {
          .zt-visual :global(.zt-person) { left:10%; width:clamp(130px,26vw,200px); }
          .zt-logo-layer { width:50%; right:-12%; }
          .zt-copy { left:38%; right:5%; bottom:20px; }
          .zt-moment-cta { left:3.5%; top:9px; }
          .zt-rail { left:38%; }
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
          /* Shifted right from the very edge (was left:6%). */
          .zt-visual :global(.zt-person) { left:24%; width:clamp(84px,28vw,120px); }
          .zt-logo-layer { width:58%; right:-14%; opacity:.14; }
          .zt-moment-cta { left:2.5%; top:7px; }
          .zt-persist-name { font-size:clamp(12px,3.6vw,15px); }
          /* 1-2pt smaller than the base clamp's floor, per direct
             feedback that this line reads too big on mobile. */
          .zt-moment-cta-line { font-size:clamp(6.5px,1vw,8px); }
          .zt-moment-thumb { width:clamp(38px,14vw,50px); }
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
          .zt-copy { left:26%; right:auto; width:22%; bottom:14px; justify-content:flex-start; padding-top:10px; }
          /* Life-year screens have no cutout reserving space, so they can
             afford a bit more width than the rule above -- still
             contained to the real screen's right half, expressed as
             left+width for the same reason (this slide is 200% wide, so
             "right" would measure from an edge that's off-screen). */
          .zt-lifeyear .zt-copy { left:22%; width:28%; justify-content:flex-start; padding-top:10px; }
          .zt-rail { left:32%; }
          .zt-kick { font-size:7px; margin-bottom:3px; }
          .zt-title { font-size:clamp(13px,4.2vw,17px); margin-bottom:3px; }
          .zt-bodycopy { font-size:clamp(9px,2.2vw,11px); }
        }
      `}</style>
    </section>
    </>
  );
}
