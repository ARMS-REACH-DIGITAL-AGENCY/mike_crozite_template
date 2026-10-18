'use client';

// Bulk photo upload (reviewers only). Pick the filled-in spreadsheet and the
// photos; Check matches every row to a player (by YAT number or any other
// id we keep for him, or by name and high school) and finds its photo;
// nothing is written until Post. Then each photo goes up on its own, the
// same steps as an approved fan photo, and its row shows where it landed.

import { useMemo, useState } from 'react';
import readXlsxFile from 'read-excel-file';
import { auth } from '@/lib/firebase';

type Row = {
  row: number; file: string; first: string; last: string; school: string; city: string; playerId: string;
  type: string; year: string; month: string; caption: string; alsoIn: string; credit: string;
};
type Player = { playerid: string; name: string; hsid: string; school: string; location: string; classOf: string; status: string };
type Check = {
  row: number; type: string | null; year: number | null; month: number | null; player: Player | null; close: boolean;
  candidates: Player[]; tagged: Player[]; problems: string[]; notes: string[];
};
type Posted = { state: 'posting' | 'done' | 'failed'; text?: string; link?: string | null };

const TYPE_LABEL: Record<string, string> = {
  flip_card: 'HS Photo (Card Front)', headshot: 'Headshot', back_hero: 'Action (Card Back)', timeline_hero: 'Timeline', story: 'Story / Memory',
};
// The template's two example rows.
const EXAMPLES = new Set(['img_2041.jpg|drew', 'bankone_2011.jpg|chaz']);
// Vercel takes up to ~4.5 MB a request: bigger photos are scaled down here.
const SEND_MAX = 4 * 1024 * 1024;

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const COLUMNS: [keyof Row, (h: string) => boolean][] = [
  ['file', (h) => h.startsWith('file')],
  ['first', (h) => h.startsWith('first')],
  ['last', (h) => h.startsWith('last')],
  ['school', (h) => h.includes('school') && !h.startsWith('city')],
  ['city', (h) => h.startsWith('city')],
  ['playerId', (h) => h.startsWith('playerid') || h === 'id' || h.startsWith('yat')],
  ['type', (h) => h.startsWith('phototype') || h === 'type'],
  ['year', (h) => h === 'year'],
  ['month', (h) => h.startsWith('month')],
  ['caption', (h) => h.startsWith('caption') || h.startsWith('story')],
  ['alsoIn', (h) => h.startsWith('also')],
  ['credit', (h) => h.includes('credit') || h.startsWith('photographer')],
];

async function authHeaders(): Promise<Record<string, string>> {
  await auth.authStateReady?.();
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
  return token ? { 'x-firebase-token': token } : {};
}

function cell(v: unknown) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return String(v.getUTCFullYear());
  return String(v).trim();
}

function toRows(grid: unknown[][]): Row[] {
  const head = (grid[0] || []).map((h) => norm(cell(h)));
  const at: Partial<Record<keyof Row, number>> = {};
  for (const [key, test] of COLUMNS) {
    const i = head.findIndex((h) => h && test(h));
    if (i >= 0 && at[key] === undefined) at[key] = i;
  }
  const out: Row[] = [];
  grid.slice(1).forEach((line, i) => {
    const get = (key: keyof Row) => (at[key] === undefined ? '' : cell(line[at[key]!]));
    const row: Row = {
      row: i + 2, file: get('file'), first: get('first'), last: get('last'), school: get('school'), city: get('city'),
      playerId: get('playerId'), type: get('type'), year: get('year'), month: get('month'), caption: get('caption'),
      alsoIn: get('alsoIn'), credit: get('credit'),
    };
    if (!row.file && !row.first && !row.last && !row.playerId) return;
    if (EXAMPLES.has(`${row.file.toLowerCase()}|${row.first.toLowerCase()}`)) return;
    out.push(row);
  });
  return out;
}

// A small CSV reader (quoted fields, commas and newlines inside quotes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function readSheet(file: File): Promise<Row[]> {
  if (/\.csv$/i.test(file.name)) return toRows(parseCsv(await file.text()));
  try {
    return toRows(await readXlsxFile(file, { sheet: 'Photos' }));
  } catch {
    return toRows(await readXlsxFile(file));
  }
}

// The photo as sent: as is when it's small enough, else scaled to 3000px
// on its long side (turned upright by the browser) as a JPEG.
async function prepare(file: File): Promise<Blob> {
  if (file.size <= SEND_MAX && /jpe?g|png|webp/i.test(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(/hei[cf]/i.test(file.name) ? "This browser can't open HEIC photos: save it as a JPG, or use Safari." : "That file isn't a photo this browser can open.");
  }
  for (const [side, quality] of [[3000, 0.9], [2400, 0.85], [2000, 0.8]] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= SEND_MAX) return blob;
  }
  throw new Error('That photo is too large to send.');
}

export default function BulkUpload() {
  const [sheetName, setSheetName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [checks, setChecks] = useState<Map<number, Check> | null>(null);
  const [posted, setPosted] = useState<Record<number, Posted>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Story / Memory rows: posted as YAT?STATS (the crest) or as you.
  const [asYatstats, setAsYatstats] = useState(true);

  const fileFor = (r: Row) => files.get(r.file.trim().toLowerCase()) || files.get(r.file.trim().toLowerCase().replace(/\.[a-z0-9]+$/, ''));
  const ready = useMemo(
    () => (checks ? rows.filter((r) => { const c = checks.get(r.row); return c && c.player && !c.problems.length && fileFor(r); }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checks, rows, files]
  );
  const left = ready.filter((r) => posted[r.row]?.state !== 'done');

  const pickSheet = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setChecks(null); setPosted({});
    try {
      const read = await readSheet(file);
      setSheetName(file.name);
      setRows(read);
      if (!read.length) setError('No photo rows found on the Photos tab.');
    } catch {
      setError("That spreadsheet couldn't be read. Save it as .xlsx (or .csv) and try again.");
    }
  };

  const pickPhotos = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => {
      const next = new Map(prev);
      for (const f of Array.from(list)) {
        if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|hei[cf])$/i.test(f.name)) continue;
        next.set(f.name.toLowerCase(), f);
        next.set(f.name.toLowerCase().replace(/\.[a-z0-9]+$/, ''), f);
      }
      return next;
    });
  };

  const check = async () => {
    setBusy('Checking…'); setError('');
    const res = await fetch('/api/contribute/bulk', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ action: 'check', rows }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) return setError(body?.error || 'The check did not work.');
    setChecks(new Map((body.rows as Check[]).map((c) => [c.row, c])));
  };

  const postOne = async (r: Row) => {
    const c = checks!.get(r.row)!;
    setPosted((p) => ({ ...p, [r.row]: { state: 'posting' } }));
    try {
      const photo = await prepare(fileFor(r)!);
      const form = new FormData();
      form.set('photo', photo, r.file);
      form.set('fileName', r.file);
      form.set('type', c.type || '');
      form.set('playerId', c.player!.playerid);
      if (c.year) form.set('year', String(c.year));
      if (c.month) form.set('month', String(c.month));
      form.set('caption', r.caption);
      form.set('credit', r.credit);
      form.set('tagged', JSON.stringify(c.tagged.map((t) => t.playerid)));
      if (asYatstats) form.set('asYatstats', '1');
      const res = await fetch('/api/contribute/bulk', { method: 'POST', credentials: 'include', headers: await authHeaders(), body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'It did not post.');
      setPosted((p) => ({ ...p, [r.row]: { state: 'done', link: body.link } }));
    } catch (e) {
      setPosted((p) => ({ ...p, [r.row]: { state: 'failed', text: e instanceof Error ? e.message : 'It did not post.' } }));
    }
  };

  const postAll = async () => {
    setBusy('Posting…');
    const queue = [...left];
    // Two at a time: fast, without piling up on remove.bg.
    await Promise.all([0, 1].map(async () => {
      for (let r = queue.shift(); r; r = queue.shift()) await postOne(r);
    }));
    setBusy('');
  };

  const counts = checks
    ? { ready: ready.length, problems: rows.length - ready.length, done: Object.values(posted).filter((p) => p.state === 'done').length }
    : null;

  return (
    <div className="ybu">
      <header className="ybu-head">
        <span className="ybu-eyebrow">Reviewers</span>
        <h1>Bulk Photo Upload</h1>
        <p>Fill in the spreadsheet (one row per photo), pick it and the photos, and check. Nothing goes on the site until you post.</p>
        <a className="ybu-link" href="/downloads/YATSTATS-Bulk-Photo-Upload.xlsx" download>Download the spreadsheet template ›</a>
      </header>

      <div className="ybu-pickers">
        <label className="ybu-pick">
          <span className="ybu-step">1</span>
          <span><b>Spreadsheet</b><small>{sheetName ? `${sheetName} · ${rows.length} photo rows` : '.xlsx or .csv'}</small></span>
          <input type="file" accept=".xlsx,.csv" onChange={(e) => pickSheet(e.target.files?.[0])} />
        </label>
        <label className="ybu-pick">
          <span className="ybu-step">2</span>
          <span><b>Photos</b><small>{files.size ? `${new Set(files.values()).size} photos picked` : 'Select them all (or add more)'}</small></span>
          <input type="file" accept="image/*,.heic,.heif" multiple onChange={(e) => pickPhotos(e.target.files)} />
        </label>
        <label className="ybu-pick">
          <span className="ybu-step">2</span>
          <span><b>Or A Whole Folder</b><small>Every photo in it</small></span>
          {/* @ts-expect-error - webkitdirectory isn't in React's input types */}
          <input type="file" webkitdirectory="" multiple onChange={(e) => pickPhotos(e.target.files)} />
        </label>
        <button type="button" className="ybu-go" disabled={!rows.length || !!busy} onClick={check}>
          <span className="ybu-step">3</span> {busy === 'Checking…' ? busy : 'Check'}
        </button>
      </div>

      {error ? <p className="ybu-error">{error}</p> : null}

      {checks && counts ? (
        <>
          <div className="ybu-summary">
            <span><b>{counts.ready}</b> ready</span>
            <span><b>{counts.problems}</b> need a fix</span>
            {counts.done ? <span><b>{counts.done}</b> posted</span> : null}
            <button type="button" className="ybu-go" disabled={!left.length || !!busy} onClick={postAll}>
              <span className="ybu-step">4</span> {busy === 'Posting…' ? `Posting… ${counts.done}/${ready.length}` : `Post ${left.length} Photo${left.length === 1 ? '' : 's'}`}
            </button>
          </div>
          <div className="ybu-as" role="radiogroup" aria-label="Post stories as">
            <span>Post Story / Memory rows as</span>
            <button type="button" role="radio" aria-checked={asYatstats} className={asYatstats ? 'is-on' : ''} onClick={() => setAsYatstats(true)}>YAT?STATS</button>
            <button type="button" role="radio" aria-checked={!asYatstats} className={!asYatstats ? 'is-on' : ''} onClick={() => setAsYatstats(false)}>Me</button>
          </div>
          <p className="ybu-muted">Fix a row in the spreadsheet, pick it again and check: rows already posted show as posted until you reload.</p>
          <div className="ybu-table" role="table">
            {rows.map((r) => {
              const c = checks.get(r.row);
              const file = fileFor(r);
              const problems = [...(c?.problems || []), ...(file ? [] : [r.file ? `Photo "${r.file}" isn't in the photos you picked.` : ''])].filter(Boolean);
              const p = posted[r.row];
              return (
                <div className={`ybu-row${problems.length ? ' is-bad' : ''}${p?.state === 'done' ? ' is-done' : ''}`} role="row" key={r.row}>
                  <span className="ybu-n">{r.row}</span>
                  <span className="ybu-who">
                    {c?.player ? (
                      <>
                        <b>{c.player.name}</b>
                        <small>{[c.player.school, c.player.location].filter(Boolean).join(' · ')}{c.player.classOf ? ` · Class of ${c.player.classOf}` : ''} · {c.player.playerid}</small>
                      </>
                    ) : (
                      <>
                        <b>{`${r.first} ${r.last}`.trim() || r.playerId || '—'}</b>
                        <small>{[r.school, r.city].filter(Boolean).join(' · ')}</small>
                      </>
                    )}
                    {c?.candidates.length ? (
                      <small className="ybu-cands">
                        {c.candidates.map((x) => `${x.name} (${x.school || 'no school'}${x.classOf ? `, ${x.classOf}` : ''}) ${x.playerid}`).join(' · ')}
                      </small>
                    ) : null}
                  </span>
                  <span className="ybu-what">
                    <b>{c?.type ? TYPE_LABEL[c.type] : r.type || '—'}{c?.year ? ` · ${c.year}` : ''}</b>
                    <small>{r.file}{c?.tagged.length ? ` · with ${c.tagged.map((t) => t.name).join(', ')}` : ''}</small>
                  </span>
                  <span className="ybu-state">
                    {p?.state === 'done' ? (
                      <>Posted {p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer">See it ›</a> : null}</>
                    ) : p?.state === 'posting' ? 'Posting…'
                      : p?.state === 'failed' ? <span className="ybu-bad">{p.text}</span>
                      : problems.length ? <span className="ybu-bad">{problems.join(' ')}</span>
                      : 'Ready'}
                    {c?.notes.length && p?.state !== 'done' ? <small>{c.notes.join(' ')}</small> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <style jsx>{`
        .ybu { max-width: 1180px; margin: 0 auto; padding: 32px 20px 80px; color: var(--sb-ink, #111); font-family: var(--yat-font-ui); }
        .ybu-head { margin-bottom: 28px; }
        .ybu-eyebrow { display: block; margin-bottom: 6px; color: #2e8b5f; font: 600 11px/1 var(--yat-font-ui); letter-spacing: .08em; text-transform: uppercase; }
        .ybu-head h1 { margin: 0 0 8px; font: 700 34px/1.05 var(--yat-font-compact); }
        .ybu-head p { margin: 0 0 10px; max-width: 640px; font-size: 15px; line-height: 1.45; opacity: .8; }
        .ybu-link { color: #2e8b5f; font-weight: 600; text-decoration: none; }
        .ybu-pickers { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; align-items: stretch; }
        .ybu-pick, .ybu-go { position: relative; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid rgba(0,0,0,.14); border-radius: 10px; background: #fff; cursor: pointer; color: inherit; text-align: left; }
        .ybu-pick:hover { border-color: #2e8b5f; }
        .ybu-pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .ybu-pick b, .ybu-go { font: 700 18px/1.1 var(--yat-font-compact); }
        .ybu-pick small { display: block; margin-top: 3px; font-size: 12px; opacity: .65; }
        .ybu-step { flex: none; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #1f6546; color: #fff; font: 700 14px/1 var(--yat-font-compact); }
        .ybu-go { justify-content: center; background: #1f6546; border-color: #1f6546; color: #fff; }
        .ybu-go .ybu-step { background: #fff; color: #1f6546; }
        .ybu-go:disabled { opacity: .45; cursor: default; }
        .ybu-error, .ybu-bad { color: #b3261e; }
        .ybu-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 22px; margin: 34px 0 6px; font: 600 15px/1 var(--yat-font-ui); }
        .ybu-summary b { font: 700 24px/1 var(--yat-font-compact); margin-right: 3px; }
        .ybu-summary .ybu-go { margin-left: auto; padding: 12px 18px; }
        .ybu-as { display: flex; align-items: center; gap: 6px; margin: 4px 0 12px; font-size: 13px; }
        .ybu-as span { margin-right: 6px; opacity: .75; }
        .ybu-as button { padding: 6px 12px; border: 1px solid rgba(0,0,0,.18); border-radius: 999px; background: #fff; font: 700 14px/1 var(--yat-font-compact); cursor: pointer; color: inherit; }
        .ybu-as button.is-on { background: #1f6546; border-color: #1f6546; color: #fff; }
        .ybu-muted { margin: 0 0 14px; font-size: 12px; opacity: .6; }
        .ybu-table { border-top: 2px solid #1f6546; }
        .ybu-row { display: grid; grid-template-columns: 44px minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.2fr); gap: 14px; padding: 12px 4px; border-bottom: 1px solid rgba(0,0,0,.08); font-size: 13px; line-height: 1.35; }
        .ybu-row.is-bad { background: rgba(179,38,30,.04); }
        .ybu-row.is-done { opacity: .7; }
        .ybu-row b { display: block; font: 700 16px/1.15 var(--yat-font-compact); }
        .ybu-row small { display: block; margin-top: 2px; font-size: 12px; opacity: .7; overflow-wrap: anywhere; }
        .ybu-n { color: rgba(0,0,0,.45); font: 600 12px/1.6 var(--yat-font-ui); }
        .ybu-state a { color: #2e8b5f; font-weight: 600; text-decoration: none; margin-left: 6px; }
        .ybu-cands { color: #8a5a00; opacity: 1 !important; }
        @media (max-width: 720px) {
          .ybu-row { grid-template-columns: 34px 1fr; }
          .ybu-what, .ybu-state { grid-column: 2; }
        }
      `}</style>
    </div>
  );
}
