'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePlayerProfile } from '@/context/PlayerProfileContext';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';

type StatRow = {
  year?: string | number;
  age?: string | number;
  team?: string;
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
  kind: MomentKind;
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

function estimateDobYear(rows: StatRow[]) {
  const guesses = rows
    .map((row) => {
      const year = yearOf(row.year);
      const age = Number(row.age);
      if (!year || !Number.isFinite(age) || age < 5 || age > 60) return null;
      return year - age;
    })
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => a - b);

  return guesses.length ? guesses[Math.floor(guesses.length / 2)] : new Date().getFullYear() - 24;
}

function buildTicks(start: number, end: number, zoom: number) {
  const span = Math.max(1, end - start);
  const step = zoom >= 2.6 ? 1 : span > 34 ? 5 : span > 18 ? 2 : 1;
  const out: number[] = [];
  for (let y = Math.ceil(start / step) * step; y <= end; y += step) out.push(y);
  if (!out.includes(start)) out.unshift(start);
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

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (!src || failed) {
    const icon = kind === 'season' ? 'ri-baseball-line' : kind === 'prompt' ? 'ri-image-add-line' : 'ri-user-add-line';
    return (
      <span className="zt-empty" aria-hidden="true">
        <i className={icon} />
        <b>{kind === 'season' ? 'Season' : 'Memory'}</b>
      </span>
    );
  }

  return <img src={src} alt={title} loading="lazy" onError={() => setFailed(true)} />;
}

export default function ZoomableCareerTimeline({ playerId }: { playerId: string }) {
  const player = usePlayerProfile();
  const [stats, setStats] = useState<StatRow[]>([]);
  const [uploads, setUploads] = useState<SubmittedMoment[]>([]);
  const [zoom, setZoom] = useState(1.3);

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
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/player-moments?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.moments)) setUploads(data.moments);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const model = useMemo(() => {
    const today = new Date().getFullYear();
    const dob = estimateDobYear(stats);
    const statYears = stats.map((row) => yearOf(row.year)).filter((year): year is number => typeof year === 'number');
    const start = Math.min(dob, statYears.length ? Math.min(...statYears) - 14 : dob);
    const end = today;
    const span = Math.max(1, end - start);
    const firstName = String(player?.playerName || 'this player').split(' ')[0] || 'this player';

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
      const year = item.photo_taken_year || yearOf(item.photo_taken_date) || dob + 15;
      return {
        id: `upload-${item.id}`,
        year,
        label: String(year),
        title: item.title || 'Fan memory',
        caption: item.caption || 'Fan-submitted Golden Line memory.',
        src: item.image_data_url,
        kind: 'upload',
      };
    });

    const titles = ['First baseball memory', 'School-years memory', 'Next-level memory'];
    const prompts: Moment[] = [8, 14, 18].map((offset, index) => {
      const year = clamp(dob + offset, start, end);
      return {
        id: `prompt-${index}`,
        year,
        label: String(year),
        title: titles[index],
        caption: `Help document a real dated moment from ${firstName}'s baseball story.`,
        kind: 'prompt',
      };
    });

    const archive: Moment[] = [
      {
        id: 'archive-then',
        year: statYears[0] || dob + 16,
        label: String(statYears[0] || dob + 16),
        title: 'The hometown chapter',
        caption: 'Archive image / early player chapter.',
        src: `${S3_BASE}/players/then/${playerId}.jpg`,
        kind: 'archive',
      },
      {
        id: 'archive-now',
        year: statYears[statYears.length - 1] || today,
        label: String(statYears[statYears.length - 1] || today),
        title: 'Latest chapter',
        caption: 'Current or most recent player chapter.',
        src: `${S3_BASE}/players/now/${playerId}.jpg`,
        kind: 'archive',
      },
      {
        id: 'cta',
        year: start,
        label: 'Add',
        title: 'Add a memory',
        caption: 'Place a fan memory on the calendar line.',
        kind: 'cta',
      },
    ];

    return {
      start,
      end,
      span,
      ticks: buildTicks(start, end, zoom),
      moments: [...archive, ...seasons, ...uploaded, ...prompts].sort((a, b) => a.year - b.year),
    };
  }, [stats, uploads, player?.playerName, playerId, zoom]);

  const width = Math.max(900, Math.round(model.span * 42 * zoom));
  const left = (year: number) => `${((year - model.start) / model.span) * 100}%`;

  function openUpload() {
    window.location.hash = 'ppTab-upload';
  }

  return (
    <section className="zt-shell" id="playerCareerStrip">
      <div className="zt-meta">
        <span>The Golden Line</span>
        <strong>Career Path</strong>
        <button type="button" onClick={openUpload}>+ Add Photo</button>
      </div>

      <div className="zt-controls">
        <span>Zoom</span>
        <input aria-label="Zoom timeline" type="range" min="0.8" max="3.8" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
      </div>

      <div className="zt-window">
        <div className="zt-canvas" style={{ width }}>
          <div className="zt-line" />
          {model.ticks.map((year) => (
            <span className="zt-tick" key={year} style={{ left: left(year) }}>
              <i />
              <b>{year === model.start ? 'DOB' : year === model.end ? 'Today' : year}</b>
            </span>
          ))}

          {model.moments.map((moment, index) => {
            const isTop = index % 2 === 0;
            return (
              <button
                type="button"
                key={moment.id}
                className={`zt-moment zt-${moment.kind} ${isTop ? 'zt-top' : 'zt-bottom'}`}
                style={{ left: left(moment.year) }}
                onClick={() => {
                  if (moment.kind === 'prompt' || moment.kind === 'cta') openUpload();
                }}
              >
                <span className="zt-pin" />
                <span className="zt-card">
                  <span className="zt-photo">
                    <TimelineImage src={moment.src} title={moment.title} kind={moment.kind} />
                  </span>
                  <span className="zt-copy">
                    <b>{moment.label}</b>
                    <strong>{moment.title}</strong>
                    <em>{moment.caption}</em>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        .zt-shell { position: relative; height: 100%; min-height: 104px; overflow: hidden; isolation: isolate; background: linear-gradient(90deg,#101010,#050505); color: #fff; }
        .zt-meta { position: absolute; z-index: 5; left: 10px; top: 0; bottom: 0; width: 132px; display: grid; align-content: center; gap: 3px; background: linear-gradient(90deg, rgba(0,0,0,.92), rgba(0,0,0,.52), transparent); text-transform: uppercase; }
        .zt-meta span { color:#f5c85a; font: 900 9px/1 Oswald,sans-serif; letter-spacing:.15em; }
        .zt-meta strong { font: 900 14px/1 Oswald, sans-serif; letter-spacing:.08em; }
        .zt-meta button { width:max-content; border:1px solid rgba(245,200,90,.72); background:rgba(0,0,0,.62); color:#f5c85a; padding:5px 8px; font:900 9px/1 Oswald,sans-serif; letter-spacing:.1em; cursor:pointer; }
        .zt-controls { position:absolute; z-index:6; right:12px; top:7px; display:flex; gap:8px; align-items:center; color:rgba(255,255,255,.66); font:800 9px/1 Oswald,sans-serif; letter-spacing:.12em; text-transform:uppercase; }
        .zt-controls input { width: 100px; accent-color:#f5c85a; }
        .zt-window { height:100%; overflow-x:auto; overflow-y:hidden; padding-left:142px; scrollbar-width:thin; scrollbar-color:rgba(245,200,90,.7) rgba(255,255,255,.08); }
        .zt-canvas { position:relative; height:100%; min-width:100%; }
        .zt-line { position:absolute; left:0; right:0; top:56%; height:2px; background:linear-gradient(90deg,rgba(245,200,90,.08),rgba(245,200,90,.95),rgba(245,200,90,.14)); box-shadow:0 0 16px rgba(245,200,90,.36); }
        .zt-tick { position:absolute; top:56%; transform:translateX(-50%); display:grid; justify-items:center; gap:4px; pointer-events:none; }
        .zt-tick i { width:1px; height:17px; background:rgba(245,200,90,.72); transform:translateY(-7px); }
        .zt-tick b { color:#f5c85a; font:900 10px/1 Oswald,sans-serif; letter-spacing:.08em; text-transform:uppercase; transform:translateY(-4px); white-space:nowrap; }
        .zt-moment { position:absolute; top:56%; width:112px; height:1px; border:0; padding:0; background:transparent; color:inherit; cursor:pointer; transform:translateX(-50%); }
        .zt-pin { position:absolute; left:50%; top:-4px; width:8px; height:8px; transform:translateX(-50%); border:1px solid #f5c85a; background:#111; box-shadow:0 0 12px rgba(245,200,90,.62); }
        .zt-card { position:absolute; left:50%; width:112px; height:70px; transform:translateX(-50%); display:grid; grid-template-columns:48px 1fr; gap:5px; padding:4px; border:1px solid rgba(245,200,90,.33); background:linear-gradient(135deg,rgba(32,32,32,.98),rgba(5,5,5,.94)); box-shadow:0 8px 18px rgba(0,0,0,.35); }
        .zt-top .zt-card { bottom:14px; }
        .zt-bottom .zt-card { top:14px; }
        .zt-top .zt-pin:before, .zt-bottom .zt-pin:before { content:''; position:absolute; left:50%; width:1px; height:38px; background:rgba(245,200,90,.35); transform:translateX(-50%); }
        .zt-top .zt-pin:before { bottom:8px; }
        .zt-bottom .zt-pin:before { top:8px; }
        .zt-photo { width:46px; height:62px; overflow:hidden; border:1px solid rgba(245,200,90,.5); background:#111; }
        .zt-photo :global(img) { width:100%; height:100%; object-fit:cover; object-position:top center; display:block; }
        .zt-photo :global(.zt-empty) { height:100%; display:grid; align-content:center; justify-items:center; gap:3px; color:rgba(245,200,90,.78); background:linear-gradient(135deg,#252525,#0b0b0b); font-size:17px; }
        .zt-photo :global(.zt-empty b) { font:900 7px/1 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; }
        .zt-copy { min-width:0; display:flex; flex-direction:column; text-align:left; text-transform:uppercase; }
        .zt-copy b { color:#f5c85a; font:900 8px/1 Oswald,sans-serif; letter-spacing:.1em; }
        .zt-copy strong { margin-top:3px; color:#fff; font:900 11px/1 Oswald,sans-serif; letter-spacing:.05em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .zt-copy em { margin-top:auto; color:rgba(255,255,255,.62); font:800 7px/1.05 Oswald,sans-serif; letter-spacing:.05em; font-style:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .zt-prompt .zt-card, .zt-cta .zt-card { border-style:dashed; border-color:rgba(245,200,90,.58); background:linear-gradient(135deg,rgba(45,35,14,.98),rgba(6,6,6,.94)); }
      `}</style>
    </section>
  );
}
