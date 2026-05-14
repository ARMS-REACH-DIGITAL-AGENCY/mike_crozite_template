'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const ZOOM_KEY = 'yat:careerTimelineZoom';
const SCROLL_EVENT = 'yat:career-timeline-scroll';
const ZOOM_EVENT = 'yat:career-timeline-zoom';
const CARD_W = 58;
const CARD_H = 84;
const CTA_W = 118;
const TIMELINE_GUTTER = 42;
const CLOSED_ZOOM = 1;
const EXPANDED_ZOOM_THRESHOLD = 2.25;
const FULL_ZOOM = 3.2;

type StatRow = {
  year?: string | number;
  age?: string | number;
  team?: string;
  teamid?: string | number;
  team_id?: string | number;
  level?: string;
  org_conf?: string;
  league?: string;
};
type MomentKind = 'cta' | 'prompt' | 'season' | 'archive' | 'upload';
type Moment = {
  id: string;
  year: number;
  label: string;
  title: string;
  caption: string;
  src?: string;
  srcs?: string[];
  kind: MomentKind;
  href?: string;
  cardMode?: boolean;
};
type UploadSlot = { id: string; year: number; label: string; leftYear: number; rightYear: number };
type SubmittedMoment = {
  id: string;
  title?: string;
  caption?: string;
  image_data_url?: string;
  photo_taken_date?: string | null;
  photo_taken_year?: number | null;
};

declare global { interface Window { __yatCareerTimelineSyncing?: boolean } }

function readInitialZoom() {
  if (typeof window === 'undefined') return CLOSED_ZOOM;
  const saved = Number(sessionStorage.getItem(ZOOM_KEY));
  return Number.isFinite(saved) ? clamp(saved, CLOSED_ZOOM, 3.4) : CLOSED_ZOOM;
}

function yearOf(value: unknown): number | null {
  const match = String(value ?? '').match(/\d{4}/);
  const year = match ? Number(match[0]) : NaN;
  return Number.isFinite(year) ? year : null;
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function buildTicks(start: number, end: number, zoom: number, promptYear: number) {
  const span = Math.max(1, end - start);
  const step = zoom >= 2.4 ? 1 : span > 8 ? 2 : 1;
  const out: number[] = [promptYear, start];
  for (let y = start + step; y < end; y += step) out.push(y);
  if (!out.includes(end)) out.push(end);
  return Array.from(new Set(out)).sort((a, b) => a - b);
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

function cleanTeamLabel(value: unknown) {
  return String(value || '').trim();
}

function teamLogoCandidates(row: StatRow) {
  const teamId = String(row.teamid || row.team_id || '').trim();
  if (!teamId || !/^\d+$/.test(teamId)) return [];
  return Array.from(new Set([
    `${S3_BASE}/teams/${teamId}.png`,
    `${S3_BASE}/teams/${teamId}.jpg`,
    `${S3_BASE}/teams/${teamId}.jpeg`,
    `${S3_BASE}/teams/${teamId}.webp`,
    `${S3_BASE}/teams/${teamId}.PNG`,
    `${S3_BASE}/teams/${teamId}.JPG`,
    `${S3_BASE}/colleges/${teamId}.png`,
    `${S3_BASE}/colleges/${teamId}.jpg`,
  ]));
}

function TimelineImage({ src, srcs, title, caption, kind, label }: {
  src?: string;
  srcs?: string[];
  title: string;
  caption: string;
  kind: MomentKind;
  label: string;
}) {
  const sources = useMemo(() => Array.from(new Set([...(srcs || []), ...(src ? [src] : [])].filter(Boolean))), [src, srcs]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const currentSrc = sources[sourceIndex];
  const failed = !currentSrc;

  useEffect(() => setSourceIndex(0), [sources.join('|')]);

  if (kind === 'prompt') {
    return <span className="zt-prompt-card" aria-hidden="true"><b>{title}</b><strong>{caption}</strong><i>+</i></span>;
  }

  if (failed) {
    return <span className={`zt-logo-placeholder zt-logo-placeholder-${kind}`} aria-hidden="true"><b>{label}</b></span>;
  }

  return (
    <span className={`zt-image-wrap zt-image-wrap-${kind}`}>
      <img
        src={currentSrc}
        alt={title}
        loading="lazy"
        onError={() => setSourceIndex((index) => index + 1)}
      />
      {kind !== 'season' && <span className="zt-card-overlay"><b>{label}</b><strong>{title}</strong><em>{caption}</em></span>}
    </span>
  );
}

function inferFirstName(playerName?: string) {
  const direct = String(playerName || '').trim();
  if (direct) return direct.split(' ')[0];
  if (typeof document !== 'undefined') {
    const favorite = document.querySelector('button[aria-label*=" to favorites"]')?.getAttribute('aria-label') || '';
    const match = favorite.match(/^Add\s+(.+?)\s+to favorites/i);
    if (match?.[1]) return match[1].trim().split(' ')[0];
  }
  return 'this player';
}

export default function ZoomableCareerTimeline({ playerId, variant = 'combined' }: { playerId: string; variant?: 'combined' | 'images' | 'line' }) {
  const player = usePlayerProfile();
  const [stats, setStats] = useState<StatRow[]>([]);
  const [uploads, setUploads] = useState<SubmittedMoment[]>([]);
  const [zoom, setZoom] = useState(readInitialZoom);
  const [fallbackFirstName, setFallbackFirstName] = useState('this player');
  const windowRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    const next = inferFirstName(player?.playerName);
    setFallbackFirstName(next);
  }, [player?.playerName]);

  useEffect(() => {
    const onZoom = (event: Event) => {
      const next = Number((event as CustomEvent).detail?.zoom);
      if (Number.isFinite(next)) setZoom(next);
    };
    window.addEventListener(ZOOM_EVENT, onZoom);
    return () => window.removeEventListener(ZOOM_EVENT, onZoom);
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(ZOOM_KEY, String(zoom)); } catch {}
    window.dispatchEvent(new CustomEvent(ZOOM_EVENT, { detail: { zoom, source: variant } }));
  }, [zoom, variant]);

  useEffect(() => {
    const el = windowRef.current;
    if (!el) return;
    const onScroll = () => {
      if (window.__yatCareerTimelineSyncing) return;
      window.dispatchEvent(new CustomEvent(SCROLL_EVENT, { detail: { scrollLeft: el.scrollLeft, source: variant } }));
    };
    const onPeerScroll = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.source === variant || typeof detail.scrollLeft !== 'number') return;
      if (Math.abs(el.scrollLeft - detail.scrollLeft) < 2) return;
      window.__yatCareerTimelineSyncing = true;
      el.scrollLeft = detail.scrollLeft;
      requestAnimationFrame(() => { window.__yatCareerTimelineSyncing = false; });
    };
    const distance = (touches: TouchList) => {
      const a = touches[0];
      const b = touches[1];
      if (!a || !b) return 0;
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      pinchRef.current = { distance: distance(event.touches), zoom };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinchRef.current) return;
      event.preventDefault();
      const next = clamp(pinchRef.current.zoom * (distance(event.touches) / Math.max(1, pinchRef.current.distance)), CLOSED_ZOOM, 3.4);
      setZoom(next);
    };
    const onTouchEnd = () => { pinchRef.current = null; };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener(SCROLL_EVENT, onPeerScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener(SCROLL_EVENT, onPeerScroll);
    };
  }, [variant, zoom]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/player-season-stats?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const primary = data.primaryType === 'batting' ? data.batting : data.pitching;
        const fallback = [...(Array.isArray(data.pitching) ? data.pitching : []), ...(Array.isArray(data.batting) ? data.batting : [])];
        setStats(Array.isArray(primary) && primary.length ? primary : fallback);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [playerId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/player-moments?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && Array.isArray(data?.moments)) setUploads(data.moments); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [playerId]);

  const model = useMemo(() => {
    const today = new Date().getFullYear();
    const statYears = stats.map((row) => yearOf(row.year)).filter((year): year is number => typeof year === 'number');
    const firstStatYear = statYears.length ? Math.min(...statYears) : today;
    const hsYear = Math.max(1900, firstStatYear - 1);
    const promptYear = hsYear - 1;
    const end = Math.max(today, firstStatYear);
    const span = Math.max(1, end - promptYear);
    const firstName = inferFirstName(player?.playerName) || fallbackFirstName;
    const galleryReturnHref = player?.playerSchoolUrl
      ? `${player.playerSchoolUrl}?view=active&player=${encodeURIComponent(playerId)}#player-${encodeURIComponent(playerId)}`
      : `#player-${encodeURIComponent(playerId)}`;

    const seen = new Set<string>();
    const seasons: Moment[] = [];
    for (const row of stats) {
      const year = yearOf(row.year);
      const team = cleanTeamLabel(row.team);
      if (!year || !team) continue;
      const level = normalizeLevel(row.level);
      const org = String(row.org_conf || row.league || '').trim();
      const key = `${year}|${team}|${level}|${org}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const srcs = teamLogoCandidates(row);
      seasons.push({
        id: `season-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        year,
        label: String(year),
        title: team,
        caption: `${level}${org ? ` · ${org}` : ''}`,
        src: srcs[0],
        srcs,
        kind: 'season',
      });
    }

    const uploaded: Moment[] = uploads.map((item) => {
      const year = item.photo_taken_year || yearOf(item.photo_taken_date) || hsYear;
      return { id: `upload-${item.id}`, year: clamp(year, hsYear, end), label: String(year), title: item.title || 'Fan memory', caption: item.caption || 'Fan-submitted Golden Line memory.', src: item.image_data_url, kind: 'upload' };
    });

    const prompts: Moment[] = [{ id: 'prompt-memory', year: promptYear, label: 'Add', title: `Add a moment in time to ${firstName}'s`, caption: 'Career Path Timeline', kind: 'prompt' }];
    const archive: Moment[] = [
      { id: 'archive-hs-card', year: hsYear, label: 'HS', title: 'High school card', caption: 'Return to the original flip card view.', src: `${S3_BASE}/players/then/${playerId}.jpg`, kind: 'archive', href: galleryReturnHref, cardMode: true },
      { id: 'archive-headshot', year: end, label: String(end), title: 'Profile headshot', caption: 'Current interactive-strip image.', src: `${S3_BASE}/players/now/${playerId}.jpg`, kind: 'archive' },
    ];
    const moments = [...prompts, ...archive, ...seasons, ...uploaded].sort((a, b) => a.year - b.year || Number(Boolean(a.cardMode)) - Number(Boolean(b.cardMode)));
    const uploadSlots: UploadSlot[] = moments.slice(0, -1).map((leftMoment, index) => {
      const rightMoment = moments[index + 1];
      const leftYear = leftMoment.year;
      const rightYear = rightMoment.year;
      const slotYear = Math.max(hsYear, Math.round((leftYear + rightYear) / 2));
      return { id: `slot-${leftMoment.id}-${rightMoment.id}`, year: (leftYear + rightYear) / 2, label: String(slotYear), leftYear, rightYear };
    });

    return { promptYear, start: hsYear, canvasStart: promptYear, end, span, firstName, ticks: buildTicks(hsYear, end, zoom, promptYear), moments, uploadSlots };
  }, [stats, uploads, player?.playerName, player?.playerSchoolUrl, playerId, zoom, fallbackFirstName]);

  const isExpanded = zoom >= EXPANDED_ZOOM_THRESHOLD;
  const laneWidth = CARD_W * zoom;
  const expandedWidth = Math.max(TIMELINE_GUTTER * 2 + CARD_W, Math.round(model.span * laneWidth + TIMELINE_GUTTER * 2));
  const closedWidth = TIMELINE_GUTTER * 2 + model.moments.reduce((sum, moment) => sum + (moment.kind === 'prompt' ? CTA_W : CARD_W), 0);
  const width = isExpanded ? expandedWidth : Math.max(TIMELINE_GUTTER * 2 + CARD_W, closedWidth);
  const usable = Math.max(1, expandedWidth - TIMELINE_GUTTER * 2);
  const leftPx = (year: number) => TIMELINE_GUTTER + ((year - model.canvasStart) / model.span) * usable;
  const momentWidth = (moment: Moment) => moment.kind === 'prompt' ? CTA_W : CARD_W;
  const closedLeftPx = (index: number) => {
    let left = TIMELINE_GUTTER;
    for (let i = 0; i < index; i += 1) left += momentWidth(model.moments[i]);
    return left + momentWidth(model.moments[index]) / 2;
  };
  const imageLeftPx = (moment: Moment, index: number) => {
    if (index === 0) return closedLeftPx(0);
    return isExpanded ? leftPx(moment.year) : closedLeftPx(index);
  };

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
  function expandTimeline() {
    setZoom(FULL_ZOOM);
    requestAnimationFrame(() => {
      const el = windowRef.current;
      if (el) el.scrollLeft = 0;
    });
  }
  function handleMomentClick(moment: Moment) {
    if (moment.kind === 'prompt' || moment.kind === 'cta') {
      expandTimeline();
      return;
    }
    if (moment.kind === 'season') {
      openUpload(moment.year);
      return;
    }
    if (moment.href) window.location.href = moment.href;
  }
  function handleUploadSlot(slot: UploadSlot) {
    openUpload(Math.max(model.start, Math.round((slot.leftYear + slot.rightYear) / 2)));
  }

  if (variant === 'images') {
    return (
      <section className={`zt-shell zt-shell-images ${isExpanded ? 'zt-expanded' : 'zt-closed'}`} id="playerCareerImages">
        <div className="zt-window zt-window-images" ref={windowRef}>
          <div className="zt-canvas zt-canvas-images" style={{ width }}>
            {isExpanded && model.uploadSlots.map((slot) => (
              <button type="button" key={slot.id} className="zt-upload-slot" style={{ left: leftPx(slot.year) }} onClick={() => handleUploadSlot(slot)} title={`Upload a memory around ${slot.label}`}>
                Upload +
              </button>
            ))}
            {model.moments.map((moment, index) => {
              const w = momentWidth(moment);
              const isSeason = moment.kind === 'season';
              return (
                <button type="button" key={moment.id} className={`zt-img-moment zt-${moment.kind}`} style={{ left: imageLeftPx(moment, index), width: w }} onClick={() => handleMomentClick(moment)} title={`${moment.label} — ${moment.title}`}>
                  <span className="zt-img-connector" />
                  <span className="zt-img-card" style={{ width: w }}><TimelineImage src={moment.src} srcs={moment.srcs} title={moment.title} caption={moment.caption} kind={moment.kind} label={moment.label} /></span>
                  {isSeason && <span className="zt-season-caption"><b>{moment.label}</b><strong>{moment.title}</strong><em>{moment.caption}</em></span>}
                </button>
              );
            })}
          </div>
        </div>
        <style jsx>{`
          .zt-shell-images { position: relative; height: 100%; min-height: 100%; overflow: hidden; color: #fff; background: transparent; }
          .zt-window-images { height: 100%; overflow-x: auto; overflow-y: hidden; padding-left: 0; scrollbar-width: none; }
          .zt-window-images::-webkit-scrollbar { display: none; }
          .zt-canvas-images { position: relative; height: 100%; min-width: 100%; transition: width .24s ease; }
          .zt-img-moment { position: absolute; top: 0; height: 100%; transform: translateX(-50%); border: 0; padding: 0; background: transparent; cursor: pointer; transition: left .24s ease, width .24s ease; }
          .zt-img-card { position: relative; z-index: 2; display: block; height: 100%; border: 1px solid rgba(255,255,255,.32); background: #fff; overflow: hidden; box-shadow: 0 8px 18px rgba(0,0,0,.38); transition: width .24s ease, box-shadow .24s ease; }
          .zt-closed .zt-img-card { box-shadow: none; border-right-color: rgba(255,255,255,.18); }
          .zt-prompt .zt-img-card { border: 1px solid rgba(255,255,255,.72); background:#080808; }
          .zt-img-connector { display: none; }
          .zt-img-card :global(.zt-image-wrap) { position: relative; display:block; width:100%; height:100%; background:#090909; }
          .zt-img-card :global(img) { width: 100%; height: 100%; object-fit: cover; object-position: center center; display: block; padding:0; margin:0; }
          .zt-img-card :global(.zt-image-wrap-season) { background:#fff; display:block; }
          .zt-img-card :global(.zt-image-wrap-season img) { object-fit: contain; object-position: center center; padding:0; margin:0; background:#fff; }
          .zt-img-card :global(.zt-card-overlay) { position:absolute; left:0; right:0; bottom:0; z-index:3; display:grid; gap:1px; padding:4px 3px 3px; color:#fff; text-align:center; text-transform:uppercase; background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.82) 25%,rgba(0,0,0,.94)); pointer-events:none; }
          .zt-img-card :global(.zt-card-overlay b) { font:900 8px/1 Oswald,sans-serif; letter-spacing:.06em; }
          .zt-img-card :global(.zt-card-overlay strong) { font:900 7px/1 Oswald,sans-serif; letter-spacing:.03em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .zt-img-card :global(.zt-card-overlay em) { font:800 6px/1 Oswald,sans-serif; font-style:normal; letter-spacing:.04em; color:rgba(255,255,255,.78); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .zt-img-card :global(.zt-logo-placeholder) { height: 100%; display:grid; place-items:center; color:rgba(0,0,0,.35); background:#fff; text-align:center; text-transform:uppercase; }
          .zt-img-card :global(.zt-logo-placeholder b) { font:900 10px/1 Oswald,sans-serif; letter-spacing:.08em; }
          .zt-img-card :global(.zt-prompt-card) { height: 100%; display: grid; align-content: center; justify-items: center; gap: 3px; padding: 6px 7px; color: #fff; background: #080808; text-align: center; text-transform: uppercase; }
          .zt-img-card :global(.zt-prompt-card b) { font: 900 9px/1.08 Oswald, sans-serif; letter-spacing: .08em; }
          .zt-img-card :global(.zt-prompt-card strong) { font: 900 9px/1.05 Oswald, sans-serif; letter-spacing: .08em; }
          .zt-img-card :global(.zt-prompt-card i) { font: 900 18px/1 Oswald, sans-serif; font-style: normal; }
          .zt-season-caption { position:absolute; left:50%; top:calc(100% + 2px); z-index:5; width:90px; transform:translateX(-50%); display:grid; gap:1px; color:#fff; text-align:center; text-transform:uppercase; pointer-events:none; text-shadow:0 1px 2px rgba(0,0,0,.75); }
          .zt-season-caption b { font:900 8px/1 Oswald,sans-serif; letter-spacing:.07em; }
          .zt-season-caption strong { font:900 7px/1 Oswald,sans-serif; letter-spacing:.03em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .zt-season-caption em { font:800 6px/1 Oswald,sans-serif; font-style:normal; color:rgba(255,255,255,.76); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .zt-upload-slot { position:absolute; top:50%; transform:translate(-50%,-50%); z-index:4; display:inline-flex; align-items:center; justify-content:center; min-width:46px; height:18px; padding:0 5px; border:1px solid rgba(255,255,255,.38); background:rgba(0,0,0,.72); color:rgba(255,255,255,.82); font:900 8px/1 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; box-shadow:none; }
          .zt-upload-slot:hover { color:#fff; border-color:#fff; }
          @media (max-width: 760px) { .zt-img-moment { height: 100%; } .zt-img-card { height: 100%; } }
          :global(.yat-row3-shell), :global(.yat-row3-shell .gallery-strip), :global(.yat-row3-shell .golden-line-strip), :global(.yat-profile-career-strip), :global(.yat-profile-meta-row-host) { min-height: var(--row3-h, 96px) !important; height: var(--row3-h, 96px) !important; }
        `}</style>
      </section>
    );
  }

  return (
    <section className={`zt-shell ${variant === 'line' ? 'zt-shell-line' : ''}`} id="playerCareerStrip">
      <div className="zt-controls"><span>Zoom</span><input aria-label="Zoom timeline" type="range" min="1" max="3.4" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></div>
      <div className="zt-window" ref={windowRef}>
        <div className="zt-canvas" style={{ width: expandedWidth }}>
          <div className="zt-line" />
          {model.ticks.map((year) => <span className="zt-tick" key={year} style={{ left: leftPx(year) }}><i /><b>{year === model.promptYear ? '' : year === model.start ? 'HS' : year === model.end ? 'Today' : year}</b></span>)}
          {model.moments.map((moment, index) => (
            <button type="button" key={moment.id} className={`zt-line-pin zt-line-${moment.kind}`} style={{ left: imageLeftPx(moment, index) }} onClick={() => handleMomentClick(moment)} title={`${moment.label} — ${moment.title}`}>
              <span />
              {moment.kind === 'season' && <b className="zt-line-season-label"><i>{moment.label}</i><strong>{moment.title}</strong><em>{moment.caption}</em></b>}
            </button>
          ))}
        </div>
      </div>
      <style jsx>{`
        .zt-shell { position: relative; height: 100%; min-height: 52px; overflow: visible; isolation: isolate; background: linear-gradient(90deg,#101010,#050505); color: #fff; border-top: 0; }
        .zt-controls { position:absolute; z-index:8; left:10px; top:5px; display:flex; gap:6px; align-items:center; color:rgba(255,255,255,.42); font:800 8px/1 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; opacity:.42; }
        .zt-controls:hover { opacity:.82; }
        .zt-controls input { width: 64px; height: 12px; accent-color:#d9b75b; opacity:.58; }
        .zt-window { height:100%; overflow-x:auto; overflow-y:visible; padding-left:0; scrollbar-width:none; }
        .zt-window::-webkit-scrollbar { display:none; }
        .zt-canvas { position:relative; height:100%; min-width:100%; }
        .zt-line { position:absolute; left:0; right:0; top:44%; height:2px; background:linear-gradient(90deg,rgba(210,165,58,.72),rgba(245,200,90,.95),rgba(210,165,58,.72)); box-shadow:0 0 10px rgba(245,200,90,.22); }
        .zt-tick { position:absolute; top:44%; transform:translateX(-50%); display:grid; justify-items:center; gap:4px; pointer-events:none; z-index:3; }
        .zt-tick i { width:1px; height:15px; background:rgba(255,255,255,.34); transform:translateY(-7px); }
        .zt-tick b { color:#fff; font:900 10px/1 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; transform:translateY(-4px); white-space:nowrap; }
        .zt-line-pin { position:absolute; top:44%; width:20px; height:20px; transform:translate(-50%, -50%); border:0; background:transparent; padding:0; cursor:pointer; z-index:4; }
        .zt-line-pin span { position:relative; z-index:2; display:block; width:9px; height:9px; margin:auto; border:1px solid #fff; background:#111; box-shadow:0 0 8px rgba(255,255,255,.24); }
        .zt-line-season-label { position:absolute; top:15px; left:50%; width:90px; transform:translateX(-50%); display:grid; gap:1px; color:#fff; text-align:center; text-transform:uppercase; pointer-events:none; text-shadow:0 1px 2px rgba(0,0,0,.75); }
        .zt-line-season-label i { font:900 8px/1 Oswald,sans-serif; font-style:normal; }
        .zt-line-season-label strong { font:900 7px/1 Oswald,sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .zt-line-season-label em { font:800 6px/1 Oswald,sans-serif; font-style:normal; color:rgba(255,255,255,.72); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        @media (max-width: 760px) { .zt-controls { display:none; } }
      `}</style>
    </section>
  );
}
