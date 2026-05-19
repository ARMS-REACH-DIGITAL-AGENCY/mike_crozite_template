'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const CARD_W = 58;
const ANCHOR_W = 232;
const SEASON_W = 134;
const ROW_H = 96;

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
};

type SubmittedMoment = {
  id: string;
  title?: string;
  caption?: string;
  image_data_url?: string;
  photo_taken_date?: string | null;
  photo_taken_year?: number | null;
};

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

function SmartImage({ src, srcs, alt, className }: { src?: string; srcs?: string[]; alt: string; className?: string }) {
  const sources = useMemo(() => Array.from(new Set([...(srcs || []), ...(src ? [src] : [])].filter(Boolean))), [src, srcs]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [sources.join('|')]);
  const active = sources[index];
  if (!active) return null;
  return <img className={className} src={active} alt={alt} loading="eager" onError={() => setIndex((next) => next + 1)} />;
}

function AnchorCard({ playerId, playerName }: { playerId: string; playerName?: string }) {
  return (
    <span className="zt-anchor-card">
      <img className="zt-anchor-bg" src="/img/career-path-default.png" alt="" aria-hidden="true" loading="eager" />
      <SmartImage className="zt-anchor-cutout" src={`${S3_BASE}/players/cutouts/${encodeURIComponent(playerId)}.png`} alt={`${firstName(playerName)} high school cutout`} />
    </span>
  );
}

function MomentImage({ moment, playerId, playerName }: { moment: Moment; playerId: string; playerName?: string }) {
  if (moment.kind === 'anchor') return <AnchorCard playerId={playerId} playerName={playerName} />;
  return (
    <span className={`zt-image-wrap zt-image-${moment.kind}`}>
      <SmartImage src={moment.src} srcs={moment.srcs} alt={moment.title} />
      {!moment.src && !moment.srcs?.length ? <span className="zt-placeholder">{moment.label}</span> : null}
    </span>
  );
}

export default function ZoomableCareerTimeline({ playerId, variant = 'combined' }: { playerId: string; variant?: 'combined' | 'images' | 'line' }) {
  const player = usePlayerProfile();
  const [stats, setStats] = useState<StatRow[]>([]);
  const [uploads, setUploads] = useState<SubmittedMoment[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [uploadsLoaded, setUploadsLoaded] = useState(false);
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

    const uploaded: Moment[] = uploads.map((item): Moment => {
      const year = item.photo_taken_year || yearOf(item.photo_taken_date) || hsYear;
      return {
        id: `upload-${item.id}`,
        kind: 'upload',
        year: clamp(year, hsYear, endYear),
        label: String(year),
        title: item.title || 'Fan memory',
        caption: item.caption || 'Fan-submitted Golden Line memory.',
        src: item.image_data_url,
        width: CARD_W,
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
  }, [stats, uploads, playerId]);

  const ready = statsLoaded && uploadsLoaded;
  const canvasWidth = useMemo(() => model.moments.reduce((sum, moment) => sum + moment.width, 0), [model.moments]);

  useEffect(() => {
    if (!ready || variant !== 'images') return;
    requestAnimationFrame(() => {
      if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
    });
  }, [ready, variant, playerId]);

  const leftForIndex = (index: number) => {
    let left = 0;
    for (let i = 0; i < index; i += 1) left += model.moments[i].width;
    return left + model.moments[index].width / 2;
  };

  const lineWidth = Math.max(360, (model.endYear - model.startYear + 1) * CARD_W + TIMELINE_GUTTER * 2);
  const lineLeft = (year: number) => {
    const span = Math.max(1, model.endYear - model.startYear);
    return TIMELINE_GUTTER + ((year - model.startYear) / span) * Math.max(1, lineWidth - TIMELINE_GUTTER * 2);
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

  function handleMomentClick(moment: Moment) {
    if (moment.kind === 'season') openUpload(moment.year);
  }

  if (variant === 'line') {
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
          .zt-line { position:absolute; left:0; right:0; top:50%; height:2px; background:#c7a34a; }
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
          {ready && model.moments.map((moment, index) => (
            <button
              type="button"
              key={moment.id}
              className={`zt-img-moment zt-${moment.kind}`}
              style={{ left: leftForIndex(index), width: moment.width }}
              onClick={() => handleMomentClick(moment)}
              title={`${moment.label} - ${moment.title}`}
            >
              <span className="zt-img-card" style={{ width: moment.width }}>
                <MomentImage moment={moment} playerId={playerId} playerName={player?.playerName} />
              </span>
            </button>
          ))}
        </div>
      </div>
      <style jsx>{`
        .zt-shell-images { position:relative; height:100%; min-height:100%; overflow:hidden; color:#fff; background:transparent; }
        .zt-window-images { height:100%; overflow-x:auto; overflow-y:hidden; padding-left:0; scrollbar-width:none; }
        .zt-window-images::-webkit-scrollbar { display:none; }
        .zt-canvas-images { position:relative; height:100%; min-width:100%; transition:none; }
        .zt-img-moment { position:absolute; top:0; height:100%; transform:translateX(-50%); border:0; padding:0; margin:0; background:transparent; cursor:pointer; transition:none; }
        .zt-img-card { position:relative; display:block; height:100%; overflow:hidden; background:#fff; border:1px solid rgba(255,255,255,.22); border-bottom:4px solid #ffd200; box-shadow:none; transition:none; }
        .zt-img-card :global(.zt-image-wrap) { position:relative; display:block; width:100%; height:100%; background:#090909; }
        .zt-img-card :global(.zt-image-wrap img) { width:100%; height:100%; display:block; object-fit:cover; object-position:center center; padding:0; margin:0; }
        .zt-img-card :global(.zt-image-season) { background:#fff; }
        .zt-img-card :global(.zt-image-season img) { object-fit:contain; background:#fff; }
        .zt-img-card :global(.zt-placeholder) { display:grid; place-items:center; width:100%; height:100%; color:rgba(0,0,0,.4); font:900 12px/1 Oswald,sans-serif; letter-spacing:.08em; }
        .zt-img-card :global(.zt-anchor-card) { position:relative; display:block; width:100%; height:100%; overflow:hidden; background:#0b0b0b; isolation:isolate; }
        .zt-img-card :global(.zt-anchor-bg) { position:absolute; inset:0; z-index:1; display:block; width:100%; height:100%; object-fit:cover; object-position:center center; }
        .zt-img-card :global(.zt-anchor-cutout) { position:absolute; z-index:2; left:0; bottom:0; display:block; width:auto; height:102%; max-width:46%; object-fit:contain; object-position:left bottom; filter:drop-shadow(0 5px 7px rgba(0,0,0,.75)); pointer-events:none; }
        :global(.yat-row3-shell), :global(.yat-row3-shell .gallery-strip), :global(.yat-row3-shell .golden-line-strip), :global(.yat-profile-career-strip), :global(.yat-profile-meta-row-host) { min-height:var(--row3-h, ${ROW_H}px) !important; height:var(--row3-h, ${ROW_H}px) !important; }
      `}</style>
    </section>
  );
}
