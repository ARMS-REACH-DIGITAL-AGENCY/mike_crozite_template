'use client';

import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
// Row heights before this component merged them: --row3-h (100px, the old
// plain image strip) + --row4-h (56px, the old separate thin year-tick
// line). Combining them into one taller row reuses that same total budget
// instead of asking the page for more -- the FunZone panel below is
// completely unaffected.
const ROW_H = 156;
const ANCHOR_W = 300; // anchor + upload: full copy panel, needs the most room
const SEASON_W = 220; // season: logo + cutout + a short caption
const CARD_W = 130; // headshot: image only
const TIMELINE_YELLOW = '#ffb21c';

type StatRow = {
  year?: string | number;
  team?: string;
  teamid?: string | number;
  team_id?: string | number;
  level?: string;
  org_conf?: string;
  league?: string;
};

type MomentKind = 'anchor' | 'season' | 'upload' | 'headshot';

type MomentComment = {
  id: string;
  contributor_name: string;
  body: string;
  created_at: string;
};

type Moment = {
  id: string;
  kind: MomentKind;
  year: number;
  label: string;
  title: string;
  caption?: string;
  src?: string;
  srcs?: string[];
  width: number;
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

// Shared background + player-cutout layering used by both the anchor card
// and (now) season cards, matching the corporate slideshow's visual/person
// layer structure instead of a flat logo.
function CutoutOverlay({ bgSrc, bgSrcs, playerId, playerName, bgFit }: { bgSrc?: string; bgSrcs?: string[]; playerId: string; playerName?: string; bgFit: 'cover' | 'contain' }) {
  return (
    <span className="zt-cutout-shell">
      <SmartImage className={`zt-cutout-bg zt-cutout-bg-${bgFit}`} src={bgSrc} srcs={bgSrcs} alt="" />
      <SmartImage className="zt-cutout-person" src={`${S3_BASE}/players/cutouts/${encodeURIComponent(playerId)}.png`} alt={`${firstName(playerName)} cutout`} />
    </span>
  );
}

function ReactionButton({ moment, session, onToggled }: { moment: Moment; session: FanSession | null; onToggled: (id: string, reacted: boolean, count: number) => void }) {
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

function MomentDetailModal({ moment, session, onClose, onCommentPosted, onReactionToggled }: { moment: Moment; session: FanSession | null; onClose: () => void; onCommentPosted: (id: string, comment: MomentComment) => void; onReactionToggled: (id: string, reacted: boolean, count: number) => void }) {
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

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
        .zt-modal-reaction-row { margin-bottom:14px; }
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
  const scrollerRef = useRef<HTMLDivElement | null>(null);

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
    const seasons: Moment[] = [];
    stats.forEach((row) => {
      const year = yearOf(row.year);
      const team = String(row.team || '').trim();
      if (!year || !team) return;
      const level = normalizeLevel(row.level);
      const org = String(row.org_conf || row.league || '').trim();
      const key = `${year}|${team}|${level}|${org}`;
      if (seen.has(key)) return;
      seen.add(key);
      const srcs = teamLogoCandidates(row);
      seasons.push({
        id: `season-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        kind: 'season',
        year,
        label: String(year),
        title: team,
        caption: `${level}${org ? ` · ${org}` : ''}`,
        src: srcs[0],
        srcs,
        width: SEASON_W,
      });
    });
    seasons.sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));

    const uploaded: Moment[] = uploads
      .filter((item) => !isCurrentHeadshotUrl(item.image_data_url, playerId))
      .map((item): Moment => {
        const year = item.photo_taken_year || yearOf(item.photo_taken_date) || hsYear;
        const override = localOverrides[`upload-${item.id}`];
        return {
          id: `upload-${item.id}`,
          kind: 'upload',
          year: clamp(year, hsYear, endYear),
          label: String(year),
          title: item.title || 'Fan memory',
          caption: item.caption || '',
          src: item.image_url || item.image_data_url,
          width: ANCHOR_W,
          momentDbId: item.id,
          contributorName: item.contributor_name,
          relationship: item.relationship,
          reactionCount: override ? override.reactionCount : (item.reaction_count || 0),
          viewerReacted: override ? override.viewerReacted : Boolean(item.viewer_reacted),
          comments: [...(item.comments || []), ...(override?.extraComments || [])],
        };
      }).sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

    const anchor: Moment = {
      id: 'career-path-anchor',
      kind: 'anchor',
      year: hsYear,
      label: 'HS',
      title: 'High school journey anchor',
      width: ANCHOR_W,
    };

    const headshot: Moment = {
      id: 'current-headshot',
      kind: 'headshot',
      year: endYear,
      label: String(endYear),
      title: 'Current headshot',
      src: `${S3_BASE}/players/now/${encodeURIComponent(playerId)}.jpg`,
      width: CARD_W,
    };

    return {
      startYear: hsYear,
      endYear,
      moments: [anchor, ...uploaded, ...seasons, headshot],
      ticks: Array.from(new Set([hsYear, ...statYears, endYear])).sort((a, b) => a - b),
    };
  }, [stats, uploads, playerId, localOverrides]);

  const ready = statsLoaded && uploadsLoaded;
  const canvasWidth = useMemo(() => model.moments.reduce((sum, moment) => sum + moment.width, 0), [model.moments]);
  const openMoment = openMomentId ? model.moments.find((moment) => moment.id === openMomentId) || null : null;

  useEffect(() => {
    if (!ready || variant !== 'images') return;
    requestAnimationFrame(() => {
      if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
    });
  }, [ready, variant, playerId]);

  function handleReactionToggled(id: string, reacted: boolean, count: number) {
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: { reactionCount: count, viewerReacted: reacted, extraComments: prev[id]?.extraComments || [] },
    }));
  }

  function handleCommentPosted(id: string, comment: MomentComment) {
    setLocalOverrides((prev) => {
      const existing = prev[id];
      const fallbackMoment = model.moments.find((m) => m.id === id);
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

  function handleMomentClick(moment: Moment) {
    if (moment.kind === 'season') openUpload(moment.year);
    if (moment.kind === 'upload') setOpenMomentId(moment.id);
  }

  if (variant === 'line') {
    const lineWidth = Math.max(360, (model.endYear - model.startYear + 1) * CARD_W + 42 * 2);
    const lineLeft = (year: number) => {
      const span = Math.max(1, model.endYear - model.startYear);
      return 42 + ((year - model.startYear) / span) * Math.max(1, lineWidth - 42 * 2);
    };

    return (
      <section className="zt-line-shell">
        <div className="zt-line-window">
          <div className="zt-line-canvas" style={{ width: lineWidth }}>
            <div className="zt-line" />
            {model.ticks.map((year) => (
              <span className="zt-tick" key={year} style={{ left: lineLeft(year) }}><i /><b>{year === model.startYear ? 'HS' : year === model.endYear ? 'Today' : year}</b></span>
            ))}
          </div>
        </div>
        <style jsx>{`
          .zt-line-shell { position:relative; height:100%; overflow:hidden; background:transparent; }
          .zt-line-window { height:100%; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; }
          .zt-line-window::-webkit-scrollbar { display:none; }
          .zt-line-canvas { position:relative; height:100%; min-width:100%; }
          .zt-line { position:absolute; left:0; right:0; top:50%; height:2px; background:${TIMELINE_YELLOW}; }
          .zt-tick { position:absolute; top:50%; transform:translateX(-50%); display:grid; justify-items:center; gap:4px; pointer-events:none; }
          .zt-tick i { width:1px; height:14px; background:rgba(255,255,255,.35); transform:translateY(-7px); }
          .zt-tick b { color:#fff; font:900 10px/1 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; transform:translateY(-4px); }
        `}</style>
      </section>
    );
  }

  return (
    <section className="zt-shell-images" id="playerCareerImages">
      <div className="zt-window-images" ref={scrollerRef}>
        <div className="zt-canvas-images" style={{ width: ready ? canvasWidth : ANCHOR_W }}>
          {ready && model.moments.map((moment, index) => {
            let left = 0;
            for (let i = 0; i < index; i += 1) left += model.moments[i].width;

            return (
              <div key={moment.id} className={`zt-moment zt-${moment.kind}`} style={{ left, width: moment.width }}>
                <button type="button" className="zt-moment-surface" onClick={() => handleMomentClick(moment)} title={moment.title}>
                  {moment.kind === 'anchor' && (
                    <CutoutOverlay bgSrc="/img/career-path-default.png" playerId={playerId} playerName={player?.playerName} bgFit="cover" />
                  )}

                  {moment.kind === 'season' && (
                    <>
                      <CutoutOverlay bgSrc={moment.src} bgSrcs={moment.srcs} playerId={playerId} playerName={player?.playerName} bgFit="contain" />
                      <span className="zt-season-copy">
                        <b>{moment.title}</b>
                        <em>{moment.caption}</em>
                      </span>
                    </>
                  )}

                  {moment.kind === 'headshot' && (
                    <span className="zt-plain-image">
                      <SmartImage src={moment.src} alt={moment.title} />
                    </span>
                  )}

                  {moment.kind === 'upload' && (
                    <>
                      <span className="zt-upload-bg">
                        <SmartImage src={moment.src} alt={moment.title} />
                      </span>
                      <span className="zt-upload-shade" />
                      <span className="zt-upload-copy">
                        {(moment.relationship || moment.contributorName) && (
                          <span className="zt-upload-kicker">
                            {[moment.relationship, moment.contributorName].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        <span className="zt-upload-title">{moment.title}</span>
                      </span>
                    </>
                  )}
                </button>

                {moment.kind === 'upload' && (
                  <div className="zt-upload-actions">
                    <ReactionButton moment={moment} session={session} onToggled={handleReactionToggled} />
                    <button type="button" className="zt-comment-pill" onClick={() => setOpenMomentId(moment.id)}>
                      <i className="ri-chat-3-line" />
                      {(moment.comments || []).length}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
        .zt-window-images { height:100%; overflow-x:auto; overflow-y:hidden; padding-left:0; scrollbar-width:none; }
        .zt-window-images::-webkit-scrollbar { display:none; }
        .zt-canvas-images { position:relative; height:100%; min-width:100%; transition:none; }

        .zt-moment { position:absolute; top:0; height:100%; }
        .zt-moment.zt-anchor { z-index:2; }
        .zt-moment:not(.zt-anchor) { z-index:1; }
        .zt-moment-surface { position:relative; display:block; width:100%; height:100%; border:0; padding:0; margin:0; background:#090909; cursor:pointer; overflow:hidden; }
        .zt-moment:not(.zt-anchor) .zt-moment-surface { border-bottom:3px solid ${TIMELINE_YELLOW}; }

        /* -- shared background+cutout layering (anchor, season) ---------- */
        .zt-moment-surface :global(.zt-cutout-shell) { position:absolute; inset:0; display:block; }
        .zt-moment-surface :global(.zt-cutout-bg) { position:absolute; inset:0; width:100%; height:100%; max-width:none; object-position:center center; }
        .zt-moment-surface :global(.zt-cutout-bg-cover) { object-fit:cover; }
        .zt-moment-surface :global(.zt-cutout-bg-contain) { object-fit:contain; background:#fff; }
        .zt-moment-surface :global(.zt-cutout-person) { position:absolute; z-index:2; left:-2px; bottom:0; width:auto; height:92%; max-width:56%; object-fit:contain; object-position:left bottom; filter:drop-shadow(0 6px 9px rgba(0,0,0,.65)); pointer-events:none; }

        .zt-season-copy { position:absolute; z-index:3; left:0; right:0; bottom:0; padding:6px 8px; background:linear-gradient(0deg,rgba(0,0,0,.72),transparent); display:flex; flex-direction:column; gap:1px; }
        .zt-season-copy b { font:800 11px/1.1 'Bebas Neue',Oswald,sans-serif; letter-spacing:.03em; text-transform:uppercase; color:#fff; }
        .zt-season-copy em { font:400 8.5px/1.1 Oswald,sans-serif; color:rgba(255,255,255,.75); font-style:normal; }

        .zt-plain-image { position:relative; display:block; width:100%; height:100%; }
        .zt-plain-image :global(img) { width:100%; height:100%; object-fit:cover; display:block; }

        /* -- upload: fan photo + wall-post copy panel --------------------- */
        .zt-upload-bg { position:absolute; inset:0; display:block; }
        .zt-upload-bg :global(img) { width:100%; height:100%; object-fit:cover; display:block; }
        .zt-upload-shade { position:absolute; inset:0; background:linear-gradient(0deg,rgba(0,0,0,.86) 0%,rgba(0,0,0,.35) 45%,transparent 75%); pointer-events:none; }
        .zt-upload-copy { position:absolute; left:0; right:0; bottom:0; padding:8px 10px; display:flex; flex-direction:column; gap:2px; text-align:left; }
        .zt-upload-kicker { color:${TIMELINE_YELLOW}; font:700 8px/1 Oswald,sans-serif; letter-spacing:.09em; text-transform:uppercase; }
        .zt-upload-title { color:#fff; font:700 12.5px/1.25 Oswald,sans-serif; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

        .zt-upload-actions { position:absolute; z-index:4; top:6px; right:6px; display:flex; gap:5px; }
        .zt-yatzaboy { display:flex; align-items:center; gap:4px; height:22px; padding:0 8px; border:1px solid rgba(255,178,28,.5); border-radius:999px; background:rgba(0,0,0,.55); color:${TIMELINE_YELLOW}; font:800 7.5px/1 Oswald,sans-serif; letter-spacing:.05em; cursor:pointer; }
        .zt-yatzaboy.active { background:${TIMELINE_YELLOW}; color:#1a1208; }
        .zt-yatzaboy b { font-size:9px; }
        .zt-comment-pill { display:flex; align-items:center; gap:3px; height:22px; padding:0 7px; border:1px solid rgba(255,255,255,.3); border-radius:999px; background:rgba(0,0,0,.55); color:#fff; font:700 9px/1 Oswald,sans-serif; cursor:pointer; }

        /* :has() carries higher specificity than the plain-class rule below,
           so this wins on the player profile page regardless of source
           order, while every other page type (gallery/news, no
           .yat-profile-career-strip marker present) keeps the original
           row3-h-driven height untouched. */
        :global(.yat-row3-shell:has(.yat-profile-career-strip)) { min-height:${ROW_H}px !important; height:${ROW_H}px !important; overflow:hidden !important; }
        :global(.yat-row3-shell:has(.yat-profile-career-strip) ~ .yat-row4-shell) { min-height:0 !important; height:0 !important; overflow:hidden !important; border:0 !important; padding:0 !important; }
        :global(.yat-row3-shell), :global(.yat-row3-shell .gallery-strip), :global(.yat-row3-shell .golden-line-strip), :global(.yat-profile-meta-row-host) { min-height:var(--row3-h, 100px) !important; height:var(--row3-h, 100px) !important; }
      `}</style>
    </section>
  );
}
