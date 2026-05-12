'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const ZOOM_KEY = 'yat:careerTimelineZoom';
const SCROLL_EVENT = 'yat:career-timeline-scroll';
const ZOOM_EVENT = 'yat:career-timeline-zoom';

type StatRow = { year?: string | number; age?: string | number; team?: string; level?: string; org_conf?: string; league?: string };
type MomentKind = 'cta' | 'prompt' | 'season' | 'archive' | 'upload';
type Moment = { id: string; year: number; label: string; title: string; caption: string; src?: string; kind: MomentKind; href?: string; cardMode?: boolean };
type SubmittedMoment = { id: string; title?: string; caption?: string; image_data_url?: string; photo_taken_date?: string | null; photo_taken_year?: number | null };

declare global { interface Window { __yatCareerTimelineSyncing?: boolean } }

function readInitialZoom() {
  if (typeof window === 'undefined') return 1.25;
  const saved = Number(sessionStorage.getItem(ZOOM_KEY));
  return Number.isFinite(saved) ? saved : 1.25;
}

function yearOf(value: unknown): number | null {
  const match = String(value ?? '').match(/\d{4}/);
  const year = match ? Number(match[0]) : NaN;
  return Number.isFinite(year) ? year : null;
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function buildTicks(start: number, end: number, zoom: number) {
  const span = Math.max(1, end - start);
  const step = zoom >= 2.4 ? 1 : span > 8 ? 2 : 1;
  const out: number[] = [start];
  for (let y = start + step; y < end; y += step) out.push(y);
  if (!out.includes(end)) out.push(end);
  return out;
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

function TimelineImage({ src, title, kind }: { src?: string; title: string; kind: MomentKind }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);
  if (!src || failed) {
    const icon = kind === 'season' ? 'ri-baseball-line' : kind === 'prompt' ? 'ri-image-add-line' : 'ri-user-add-line';
    return <span className="zt-empty" aria-hidden="true"><i className={icon} /><b>{kind === 'season' ? 'Season' : 'Memory'}</b></span>;
  }
  return <img src={src} alt={title} loading="lazy" onError={() => setFailed(true)} />;
}

export default function ZoomableCareerTimeline({ playerId, variant = 'combined' }: { playerId: string; variant?: 'combined' | 'images' | 'line' }) {
  const player = usePlayerProfile();
  const [stats, setStats] = useState<StatRow[]>([]);
  const [uploads, setUploads] = useState<SubmittedMoment[]>([]);
  const [zoom, setZoom] = useState(readInitialZoom);
  const windowRef = useRef<HTMLDivElement | null>(null);

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

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener(SCROLL_EVENT, onPeerScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener(SCROLL_EVENT, onPeerScroll);
    };
  }, [variant]);

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
    const end = Math.max(today, firstStatYear);
    const span = Math.max(1, end - hsYear);
    const firstName = String(player?.playerName || 'this player').split(' ')[0] || 'this player';
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
      seasons.push({
        id: `season-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        year,
        label: String(year),
        title: team,
        caption: `${normalizeLevel(row.level)}${row.org_conf || row.league ? ` · ${row.org_conf || row.league}` : ''}`,
        kind: 'season',
      });
    }

    const uploaded: Moment[] = uploads.map((item) => {
      const year = item.photo_taken_year || yearOf(item.photo_taken_date) || hsYear;
      return { id: `upload-${item.id}`, year: clamp(year, hsYear, end), label: String(year), title: item.title || 'Fan memory', caption: item.caption || 'Fan-submitted Golden Line memory.', src: item.image_data_url, kind: 'upload' };
    });

    const prompts: Moment[] = [{ id: 'prompt-memory', year: clamp(hsYear + 2, hsYear, end), label: 'Add', title: 'Add a dated memory', caption: `Place a real fan photo or baseball memory from ${firstName}'s journey on this line.`, kind: 'prompt' }];
    const archive: Moment[] = [
      { id: 'archive-hs-card', year: hsYear, label: 'HS', title: 'High school card', caption: 'Return to the original flip card view.', src: `${S3_BASE}/players/then/${playerId}.jpg`, kind: 'archive', href: galleryReturnHref, cardMode: true },
      { id: 'archive-headshot', year: end, label: String(end), title: 'Profile headshot', caption: 'Current interactive-strip image.', src: `${S3_BASE}/players/now/${playerId}.jpg`, kind: 'archive' },
    ];

    return { start: hsYear, end, span, ticks: buildTicks(hsYear, end, zoom), moments: [...archive, ...seasons, ...uploaded, ...prompts].sort((a, b) => a.year - b.year || Number(Boolean(a.cardMode)) - Number(Boolean(b.cardMode))) };
  }, [stats, uploads, player?.playerName, player?.playerSchoolUrl, playerId, zoom]);

  const width = Math.max(720, Math.round(model.span * 58 * zoom));
  const left = (year: number) => `${((year - model.start) / model.span) * 100}%`;

  function openUpload() { window.location.hash = 'ppTab-upload'; }
  function handleMomentClick(moment: Moment) {
    if (moment.kind === 'prompt' || moment.kind === 'cta') openUpload();
    if (moment.href) window.location.href = moment.href;
  }

  if (variant === 'images') {
    return (
      <section className="zt-shell zt-shell-images" id="playerCareerImages">
        <div className="zt-window zt-window-images" ref={windowRef}>
          <div className="zt-canvas zt-canvas-images" style={{ width }}>
            {model.moments.map((moment) => (
              <button type="button" key={moment.id} className={`zt-img-moment zt-${moment.kind} ${moment.cardMode ? 'zt-cardmode' : ''}`} style={{ left: left(moment.year) }} onClick={() => handleMomentClick(moment)} title={`${moment.label} — ${moment.title}`}>
                <span className="zt-img-card"><TimelineImage src={moment.src} title={moment.title} kind={moment.kind} /></span>
              </button>
            ))}
          </div>
        </div>
        <style jsx>{`
          .zt-shell-images { position: relative; height: 100%; min-height: 100%; overflow: hidden; color: #fff; background: transparent; }
          .zt-window-images { height: 100%; overflow-x: auto; overflow-y: hidden; padding-left: var(--profile-meta-w, 180px); scrollbar-width: none; }
          .zt-window-images::-webkit-scrollbar { display: none; }
          .zt-canvas-images { position: relative; height: 100%; min-width: 100%; }
          .zt-img-moment { position: absolute; top: 50%; width: 82px; height: 58px; transform: translate(-50%, -50%); border: 0; padding: 0; background: transparent; cursor: pointer; }
          .zt-img-card { display: block; width: 100%; height: 100%; border: 1px solid rgba(245,200,90,.42); background: #111; overflow: hidden; box-shadow: 0 8px 18px rgba(0,0,0,.38); }
          .zt-cardmode { width: 58px; height: 74px; }
          .zt-cardmode .zt-img-card { border-color: rgba(245,200,90,.92); box-shadow: 0 0 16px rgba(245,200,90,.2), 0 8px 18px rgba(0,0,0,.45); }
          .zt-img-card :global(img) { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
          .zt-img-card :global(.zt-empty) { height: 100%; display: grid; align-content: center; justify-items: center; gap: 3px; color: rgba(245,200,90,.78); background: linear-gradient(135deg,#252525,#0b0b0b); font-size: 15px; }
          .zt-img-card :global(.zt-empty b) { font: 900 7px/1 Oswald,sans-serif; letter-spacing: .1em; text-transform: uppercase; }
          @media (max-width: 760px) { .zt-window-images { padding-left: var(--profile-meta-w-mobile, 136px); } .zt-img-moment { width: 74px; height: 52px; } .zt-cardmode { width: 52px; height: 68px; } }
        `}</style>
      </section>
    );
  }

  return (
    <section className={`zt-shell ${variant === 'line' ? 'zt-shell-line' : ''}`} id="playerCareerStrip">
      <div className="zt-meta"><span>The Golden Line</span><strong>Timeline</strong><button type="button" onClick={openUpload}>+ Add Photo</button></div>
      <div className="zt-controls"><span>Zoom</span><input aria-label="Zoom timeline" type="range" min="0.9" max="3.2" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></div>
      <div className="zt-window" ref={windowRef}>
        <div className="zt-canvas" style={{ width }}>
          <div className="zt-line" />
          {model.ticks.map((year) => <span className="zt-tick" key={year} style={{ left: left(year) }}><i /><b>{year === model.start ? 'HS' : year === model.end ? 'Today' : year}</b></span>)}
          {model.moments.map((moment) => <button type="button" key={moment.id} className="zt-line-pin" style={{ left: left(moment.year) }} onClick={() => handleMomentClick(moment)} title={`${moment.label} — ${moment.title}`}><span /></button>)}
        </div>
      </div>
      <style jsx>{`
        .zt-shell { position: relative; height: 100%; min-height: 52px; overflow: visible; isolation: isolate; background: linear-gradient(90deg,#101010,#050505); color: #fff; border-top: 1px solid rgba(245,200,90,.22); }
        .zt-meta { position: absolute; z-index: 7; left: 10px; top: 0; bottom: 0; width: 132px; display: grid; align-content: center; gap: 3px; background: linear-gradient(90deg, rgba(0,0,0,.92), rgba(0,0,0,.52), transparent); text-transform: uppercase; }
        .zt-meta span { color:#f5c85a; font: 900 9px/1 Oswald,sans-serif; letter-spacing:.15em; }
        .zt-meta strong { font: 900 15px/1 Oswald, sans-serif; letter-spacing:.08em; }
        .zt-meta button { width:max-content; border:1px solid rgba(245,200,90,.72); background:rgba(0,0,0,.62); color:#f5c85a; padding:5px 8px; font:900 9px/1 Oswald,sans-serif; letter-spacing:.1em; cursor:pointer; }
        .zt-controls { position:absolute; z-index:8; right:12px; top:5px; display:flex; gap:8px; align-items:center; color:rgba(255,255,255,.66); font:800 9px/1 Oswald,sans-serif; letter-spacing:.12em; text-transform:uppercase; }
        .zt-controls input { width: 100px; accent-color:#f5c85a; }
        .zt-window { height:100%; overflow-x:auto; overflow-y:visible; padding-left:142px; scrollbar-width:thin; scrollbar-color:rgba(245,200,90,.7) rgba(255,255,255,.08); }
        .zt-canvas { position:relative; height:100%; min-width:100%; }
        .zt-line { position:absolute; left:0; right:0; top:44%; height:2px; background:linear-gradient(90deg,rgba(245,200,90,.08),rgba(245,200,90,.95),rgba(245,200,90,.14)); box-shadow:0 0 16px rgba(245,200,90,.36); }
        .zt-tick { position:absolute; top:44%; transform:translateX(-50%); display:grid; justify-items:center; gap:4px; pointer-events:none; z-index:3; }
        .zt-tick i { width:1px; height:15px; background:rgba(245,200,90,.72); transform:translateY(-7px); }
        .zt-tick b { color:#f5c85a; font:900 10px/1 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; transform:translateY(-4px); white-space:nowrap; }
        .zt-line-pin { position:absolute; top:44%; width:20px; height:20px; transform:translate(-50%, -50%); border:0; background:transparent; padding:0; cursor:pointer; z-index:4; }
        .zt-line-pin:before { content:''; position:absolute; left:50%; bottom:50%; width:1px; height:calc(var(--row3-h, 96px) + 18px); transform:translateX(-50%); background:linear-gradient(0deg, rgba(245,200,90,.8), rgba(245,200,90,.08)); box-shadow:0 0 12px rgba(245,200,90,.28); pointer-events:none; }
        .zt-line-pin span { position:relative; z-index:2; display:block; width:9px; height:9px; margin:auto; border:1px solid #f5c85a; background:#111; box-shadow:0 0 12px rgba(245,200,90,.62); }
        @media (max-width: 760px) { .zt-window { padding-left:132px; } .zt-meta { width:122px; } .zt-controls { right:8px; } .zt-controls input { width:78px; } }
      `}</style>
    </section>
  );
}
