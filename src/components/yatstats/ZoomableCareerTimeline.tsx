'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const ZOOM_KEY = 'yat:careerTimelineZoom';
const SCROLL_EVENT = 'yat:career-timeline-scroll';
const ZOOM_EVENT = 'yat:career-timeline-zoom';
const CARD_W = 58;
const CARD_H = 84;
const TIMELINE_GUTTER = 42;
const FULL_ZOOM = 3.2;

type StatRow = { year?: string | number; age?: string | number; team?: string; level?: string; org_conf?: string; league?: string };
type MomentKind = 'cta' | 'prompt' | 'season' | 'archive' | 'upload';
type Moment = { id: string; year: number; label: string; title: string; caption: string; src?: string; kind: MomentKind; href?: string; cardMode?: boolean };
type UploadSlot = { id: string; year: number; label: string; leftYear: number; rightYear: number };
type SubmittedMoment = { id: string; title?: string; caption?: string; image_data_url?: string; photo_taken_date?: string | null; photo_taken_year?: number | null };

declare global { interface Window { __yatCareerTimelineSyncing?: boolean } }

function readInitialZoom() {
  if (typeof window === 'undefined') return 0.8;
  const saved = Number(sessionStorage.getItem(ZOOM_KEY));
  return Number.isFinite(saved) ? saved : 0.8;
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
  if (raw.includes('HIGH')) return 'High-A';
  if (raw.includes('LOW') || raw === 'A') return 'A Ball';
  return raw;
}

function TimelineImage({ src, title, caption, kind, label }: { src?: string; title: string; caption: string; kind: MomentKind; label: string }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);

  if (kind === 'prompt') {
    return <span className="zt-prompt-card" aria-hidden="true"><b>{title}</b><strong>{caption}</strong><i>+</i></span>;
  }

  if (!src || failed || kind === 'season') {
    return <span className="zt-empty" aria-hidden="true"><b>{label}</b></span>;
  }

  return <img src={src} alt={title} loading="lazy" onError={() => setFailed(true)} />;
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
      const next = clamp(pinchRef.current.zoom * (distance(event.touches) / Math.max(1, pinchRef.current.distance)), 0.8, 3.4);
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
      const team = String(row.team || '').trim();
      if (!year || !team) continue;
      const key = `${year}|${team}|${row.level || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seasons.push({ id: `season-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`, year, label: String(year), title: team, caption: `${normalizeLevel(row.level)}${row.org_conf || row.league ? ` · ${row.org_conf || row.league}` : ''}`, kind: 'season' });
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

  const laneWidth = CARD_W * zoom;
  const width = Math.max(TIMELINE_GUTTER * 2 + CARD_W, Math.round(model.span * laneWidth + TIMELINE_GUTTER * 2));
  const usable = Math.max(1, width - TIMELINE_GUTTER * 2);
  const leftPx = (year: number) => TIMELINE_GUTTER + ((year - model.canvasStart) / model.span) * usable;

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
      <section className="zt-shell zt-shell-images" id="playerCareerImages">
        <div className="zt-window zt-window-images" ref={windowRef}>
          <div className="zt-canvas zt-canvas-images" style={{ width }}>
            {model.uploadSlots.map((slot) => (
              <button type="button" key={slot.id} className="zt-upload-slot" style={{ left: leftPx(slot.year) }} onClick={() => handleUploadSlot(slot)} title={`Upload a memory around ${slot.label}`}>
                Upload +
              </button>
            ))}
            {model.moments.map((moment) => (
              <button type="button" key={moment.id} className={`zt-img-moment zt-${moment.kind}`} style={{ left: leftPx(moment.year) }} onClick={() => handleMomentClick(moment)} title={`${moment.label} — ${moment.title}`}>
                <span className="zt-img-connector" />
                <span className="zt-img-card"><TimelineImage src={moment.src} title={moment.title} caption={moment.caption} kind={moment.kind} label={moment.label} /></span>
              </button>
            ))}
          </div>
        </div>
        <style jsx>{`
          .zt-shell-images { position: relative; height: 100%; min-height: 100%; overflow: hidden; color: #fff; background: transparent; }
          .zt-window-images { height: 100%; overflow-x: auto; overflow-y: hidden; padding-left: 0; scrollbar-width: none; }
          .zt-window-images::-webkit-scrollbar { display: none; }
          .zt-canvas-images { position: relative; height: 100%; min-width: 100%; }
          .zt-img-moment { position: absolute; top: 4px; width: ${CARD_W}px; height: ${CARD_H}px; transform: translateX(-50%); border: 0; padding: 0; background: transparent; cursor: pointer; }
          .zt-img-card { position: relative; z-index: 2; display: block; width: ${CARD_W}px; height: ${CARD_H}px; border: 1px solid rgba(255,255,255,.32); background: #111; overflow: hidden; box-shadow: 0 8px 18px rgba(0,0,0,.38); }
          .zt-prompt .zt-img-card { border: 1px solid rgba(255,255,255,.72); }
          .zt-img-connector { display: none; }
          .zt-img-card :global(img) { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
          .zt-img-card :global(.zt-empty) { height: 100%; display: grid; place-items: center; color: rgba(255,255,255,.68); background: linear-gradient(135deg,#141414,#060606); }
          .zt-img-card :global(.zt-empty b) { font: 900 10px/1.15 Oswald,sans-serif; letter-spacing: .08em; text-transform: uppercase; text-align:center; }
          .zt-img-card :global(.zt-prompt-card) { height: 100%; display: grid; align-content: center; justify-items: center; gap: 3px; padding: 6px 5px; color: #fff; background: #080808; text-align: center; text-transform: uppercase; }
          .zt-img-card :global(.zt-prompt-card b) { font: 900 7px/1.08 Oswald, sans-serif; letter-spacing: .08em; }
          .zt-img-card :global(.zt-prompt-card strong) { font: 900 7px/1.05 Oswald, sans-serif; letter-spacing: .08em; }
          .zt-img-card :global(.zt-prompt-card i) { font: 900 16px/1 Oswald, sans-serif; font-style: normal; }
          .zt-upload-slot { position:absolute; top:34px; transform:translate(-50%,-50%); z-index:4; display:${zoom >= 2.25 ? 'inline-flex' : 'none'}; align-items:center; justify-content:center; min-width:46px; height:18px; padding:0 5px; border:1px solid rgba(255,255,255,.38); background:rgba(0,0,0,.72); color:rgba(255,255,255,.82); font:900 8px/1 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; box-shadow:none; }
          .zt-upload-slot:hover { color:#fff; border-color:#fff; }
          @media (max-width: 760px) { .zt-img-moment { width: ${CARD_W}px; height: ${CARD_H}px; } .zt-img-card { width: ${CARD_W}px; height: ${CARD_H}px; } }
          :global(.yat-row3-shell), :global(.yat-row3-shell .gallery-strip), :global(.yat-row3-shell .golden-line-strip), :global(.yat-profile-career-strip), :global(.yat-profile-meta-row-host) { min-height: var(--row3-h, 96px) !important; height: var(--row3-h, 96px) !important; }
        `}</style>
      </section>
    );
  }

  return (
    <section className={`zt-shell ${variant === 'line' ? 'zt-shell-line' : ''}`} id="playerCareerStrip">
      <div className="zt-controls"><span>Zoom</span><input aria-label="Zoom timeline" type="range" min="0.8" max="3.4" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></div>
      <div className="zt-window" ref={windowRef}>
        <div className="zt-canvas" style={{ width }}>
          <div className="zt-line" />
          {model.ticks.map((year) => <span className="zt-tick" key={year} style={{ left: leftPx(year) }}><i /><b>{year === model.promptYear ? '' : year === model.start ? 'HS' : year === model.end ? 'Today' : year}</b></span>)}
          {model.moments.map((moment) => <button type="button" key={moment.id} className={`zt-line-pin zt-line-${moment.kind}`} style={{ left: leftPx(moment.year) }} onClick={() => handleMomentClick(moment)} title={`${moment.label} — ${moment.title}`}><span /></button>)}
        </div>
      </div>
      <style jsx>{`
        .zt-shell { position: relative; height: 100%; min-height: 52px; overflow: visible; isolation: isolate; background: linear-gradient(90deg,#101010,#050505); color: #fff; border-top: 0; }
        .zt-controls { position:absolute; z-index:8; right:12px; top:5px; display:flex; gap:8px; align-items:center; color:rgba(255,255,255,.32); font:800 9px/1 Oswald,sans-serif; letter-spacing:.12em; text-transform:uppercase; opacity:.28; }
        .zt-controls:hover { opacity:.72; }
        .zt-controls input { width: 100px; accent-color:#ffffff; opacity:.28; }
        .zt-window { height:100%; overflow-x:auto; overflow-y:visible; padding-left:0; scrollbar-width:none; }
        .zt-window::-webkit-scrollbar { display:none; }
        .zt-canvas { position:relative; height:100%; min-width:100%; }
        .zt-line { position:absolute; left:0; right:0; top:44%; height:2px; background:linear-gradient(90deg,rgba(210,165,58,.72),rgba(245,200,90,.95),rgba(210,165,58,.72)); box-shadow:0 0 10px rgba(245,200,90,.22); }
        .zt-tick { position:absolute; top:44%; transform:translateX(-50%); display:grid; justify-items:center; gap:4px; pointer-events:none; z-index:3; }
        .zt-tick i { width:1px; height:15px; background:rgba(255,255,255,.34); transform:translateY(-7px); }
        .zt-tick b { color:#fff; font:900 10px/1 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; transform:translateY(-4px); white-space:nowrap; }
        .zt-line-pin { position:absolute; top:44%; width:20px; height:20px; transform:translate(-50%, -50%); border:0; background:transparent; padding:0; cursor:pointer; z-index:4; }
        .zt-line-pin span { position:relative; z-index:2; display:block; width:9px; height:9px; margin:auto; border:1px solid #fff; background:#111; box-shadow:0 0 8px rgba(255,255,255,.24); }
        @media (max-width: 760px) { .zt-controls { display:none; } }
      `}</style>
    </section>
  );
}
