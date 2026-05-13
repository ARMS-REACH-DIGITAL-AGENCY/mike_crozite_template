'use client';

import { useEffect } from 'react';

type Row = Record<string, any>;
type Column = readonly [string, string];
type StatsMeta = {
  currentTeamName?: string;
  orgConferenceName?: string;
  levelLabel?: string;
  statusLabel?: string;
};

const battingColumns = [
  ['year', 'YR'], ['team', 'TEAM'], ['level', 'LVL'], ['org_conf', 'ORG'], ['age', 'AGE'], ['bt', 'B/T'], ['class', 'CLS'], ['posit', 'POS'],
  ['g', 'G'], ['ab', 'AB'], ['r', 'R'], ['h', 'H'], ['dbl', '2B'], ['tpl', '3B'], ['hr', 'HR'], ['rbi', 'RBI'], ['sb', 'SB'], ['bb', 'BB'], ['so', 'SO'], ['bavg', 'AVG'], ['obp', 'OBP'], ['slg', 'SLG'], ['ops', 'OPS'],
] as const;

const pitchingColumns = [
  ['year', 'YR'], ['team', 'TEAM'], ['level', 'LVL'], ['org_conf', 'ORG'], ['age', 'AGE'], ['bt', 'B/T'], ['class', 'CLS'],
  ['w', 'W'], ['l', 'L'], ['g', 'G'], ['gs', 'GS'], ['sv', 'SV'], ['ip', 'IP'], ['h', 'H'], ['r', 'R'], ['er', 'ER'], ['hr', 'HR'], ['bb', 'BB'], ['so', 'SO'], ['era', 'ERA'], ['whip', 'WHIP'], ['so9', 'K/9'], ['so_bb', 'K/BB'],
] as const;

const sumBattingKeys = ['g','ab','r','h','dbl','tpl','hr','rbi','sb','bb','so'] as const;
const sumPitchingKeys = ['w','l','g','gs','sv','h','r','er','hr','bb','so'] as const;
const levelBuckets = ['MLB', 'MINORS', 'AAA', 'AA', 'A+', 'A', 'RK', 'COLLEGE'] as const;

function esc(value: unknown) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function num(value: unknown) {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseIpToOuts(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const [wholeRaw, fracRaw = ''] = raw.split('.');
  const whole = Number(wholeRaw) || 0;
  const frac = fracRaw === '1' ? 1 : fracRaw === '2' ? 2 : 0;
  return whole * 3 + frac;
}

function outsToIp(outs: number) {
  const whole = Math.floor(outs / 3);
  const rem = outs % 3;
  return rem ? `${whole}.${rem}` : String(whole);
}

function rate(value: number, decimals = 3, trimZero = true) {
  if (!Number.isFinite(value)) return '';
  const out = value.toFixed(decimals);
  return trimZero ? out.replace(/^0/, '') : out;
}

function dec(value: number, decimals = 2) {
  return Number.isFinite(value) ? value.toFixed(decimals) : '';
}

function fmt(value: unknown) {
  if (value === null || value === undefined || value === '') return '&nbsp;';
  return esc(value);
}

function normalizeLevel(value: unknown) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('MLB')) return 'MLB';
  if (raw.includes('TRIPLE') || raw === 'AAA') return 'AAA';
  if (raw.includes('DOUBLE') || raw === 'AA') return 'AA';
  if (raw === 'A+' || raw.includes('HIGH-A') || raw.includes('HIGH A')) return 'A+';
  if (raw === 'A' || raw.includes('LOW-A') || raw.includes('LOW A')) return 'A';
  if (raw.includes('ROOKIE') || raw === 'RK') return 'RK';
  if (raw.includes('NCAA') || raw.includes('NJCAA') || raw.includes('NAIA') || raw.includes('COLLEGE')) return 'COLLEGE';
  if (['MINORS','MINOR','PRO'].includes(raw)) return 'MINORS';
  return raw;
}

function prepRow(row: Row) {
  return { ...row, level: normalizeLevel(row.level), bt: [row.ba, row.th].filter(Boolean).join('/') };
}

function rowBucket(row: Row) {
  const level = normalizeLevel(row.level);
  if (['RK','A','A+','AA','AAA'].includes(level)) return level;
  if (level === 'MLB') return 'MLB';
  if (level === 'COLLEGE') return 'COLLEGE';
  return level;
}

function buildBattingTotal(rows: Row[], label = 'Career', bucket = '') {
  const total: Row = { year: 'Tot:', team: label, level: bucket, org_conf: '', age: '', bt: '', class: '', posit: '' };
  sumBattingKeys.forEach((key) => { total[key] = rows.reduce((sum, row) => sum + num(row[key]), 0); });
  const h = num(total.h); const ab = num(total.ab); const bb = num(total.bb); const tb = rows.reduce((sum, row) => sum + num(row.tb), 0);
  total.bavg = ab > 0 ? rate(h / ab) : '';
  total.obp = (ab + bb) > 0 ? rate((h + bb) / (ab + bb)) : '';
  total.slg = ab > 0 ? rate(tb / ab) : '';
  total.ops = total.obp && total.slg ? rate(Number(`0${total.obp}`) + Number(`0${total.slg}`)) : '';
  return total;
}

function buildPitchingTotal(rows: Row[], label = 'Career', bucket = '') {
  const total: Row = { year: 'Tot:', team: label, level: bucket, org_conf: '', age: '', bt: '', class: '' };
  sumPitchingKeys.forEach((key) => { total[key] = rows.reduce((sum, row) => sum + num(row[key]), 0); });
  const outs = rows.reduce((sum, row) => sum + parseIpToOuts(row.ip), 0);
  const innings = outs / 3;
  const er = num(total.er); const h = num(total.h); const bb = num(total.bb); const so = num(total.so);
  total.ip = outsToIp(outs);
  total.era = innings > 0 ? dec((er * 9) / innings, 2) : '';
  total.whip = innings > 0 ? dec((h + bb) / innings, 2) : '';
  total.so9 = innings > 0 ? dec((so * 9) / innings, 2) : '';
  total.so_bb = bb > 0 ? dec(so / bb, 2) : '';
  return total;
}

function getBucketRows(rows: Row[], bucket: string) {
  if (bucket === 'MINORS') return rows.filter((row) => ['RK','A','A+','AA','AAA'].includes(rowBucket(row)));
  return rows.filter((row) => rowBucket(row) === bucket);
}

function totalRows(kind: 'batting' | 'pitching', rows: Row[]) {
  const make = kind === 'pitching' ? buildPitchingTotal : buildBattingTotal;
  const out: Row[] = [];
  for (const bucket of levelBuckets) {
    const bucketRows = getBucketRows(rows, bucket);
    if (!bucketRows.length) continue;
    out.push(make(bucketRows, `${bucket} (${bucketRows.length} yrs)`, bucket));
  }
  out.push(make(rows, `ALL (${rows.length} yrs)`, 'ALL'));
  return out.map(prepRow);
}

function renderCells(row: Row, columns: readonly Column[], extraClass = '') {
  const clean = prepRow(row);
  return columns.map(([key]) => `<td data-key="${esc(key)}" class="${extraClass} ${['team','org_conf'].includes(key) ? 'linkish' : ''}">${fmt(clean[key])}</td>`).join('');
}

function totalRow(kind: 'batting' | 'pitching', rows: Row[], columns: readonly Column[]) {
  if (!rows.length) return '';
  return `<tfoot>${totalRows(kind, rows).map((row) => `<tr class="psi-total-row">${renderCells(row, columns)}</tr>`).join('')}</tfoot>`;
}

function table(kind: 'batting' | 'pitching', rows: Row[], columns: readonly Column[]) {
  if (!rows.length) return '';
  const prepped = rows.map(prepRow);
  return `
    <section class="psi-card" data-table-title="${kind}">
      <div class="psi-table-wrap">
        <table class="psi-table">
          <thead><tr>${columns.map(([key, label]) => `<th class="${key}" data-sort-key="${esc(key)}"><button type="button">${esc(label)}<span class="psi-sort-mark"></span></button></th>`).join('')}</tr></thead>
          <tbody>${prepped.map((row) => `<tr>${renderCells(row, columns)}</tr>`).join('')}</tbody>
          ${totalRow(kind, rows, columns)}
        </table>
      </div>
    </section>`;
}

function css() {
  return `<style id="profile-stats-injector-css">
    #ppTab-stats { background: radial-gradient(circle at 18% 0%, rgba(255,255,255,.08), transparent 24%), linear-gradient(180deg, #121212 0%, #070707 100%) !important; padding:8px 10px calc(var(--profile-tabs-h,68px) + 12px) !important; overflow:auto !important; color:#f4f0e6 !important; }
    #ppTab-stats .psi-shell { width:100%; background:transparent; }
    #ppTab-stats .psi-card { width:100%; border:1px solid rgba(255,255,255,.22); background:linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018)), #0c0c0c; margin:0 0 12px; box-shadow:0 14px 32px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.08); }
    #ppTab-stats .psi-table-wrap { width:100%; max-height: calc(100dvh - var(--row1-h, 40px) - var(--row2-h, 84px) - var(--row3-h, 96px) - var(--row4-h, 48px) - var(--profile-tabs-h, 68px) - var(--footerH, 64px) - 30px); overflow:auto; background:#080808; scrollbar-color:rgba(255,255,255,.38) rgba(255,255,255,.08); scrollbar-width:thin; }
    #ppTab-stats .psi-table { min-width:1180px; width:100%; border-collapse:separate; border-spacing:0; font:500 11px/1.12 Oswald, Arial, sans-serif; color:#f4f0e6; }
    #ppTab-stats .psi-table thead th { position:sticky; top:0; z-index:8; padding:0; border-right:1px solid rgba(255,255,255,.12); border-bottom:1px solid rgba(255,255,255,.24); background:linear-gradient(180deg,#202020,#101010); color:#fff; white-space:nowrap; text-transform:uppercase; }
    #ppTab-stats .psi-table th button { width:100%; height:100%; display:flex; align-items:center; gap:5px; border:0; background:transparent; color:inherit; padding:7px 6px; font:900 10px/1 Oswald, Arial, sans-serif; letter-spacing:.1em; text-transform:uppercase; cursor:pointer; }
    #ppTab-stats .psi-table td { padding:5px 6px; border-right:1px solid rgba(255,255,255,.055); border-bottom:1px solid rgba(255,255,255,.075); background:rgba(255,255,255,.035); white-space:nowrap; font-variant-numeric:tabular-nums; text-align:right; color:rgba(255,255,255,.84); font-weight:500; }
    #ppTab-stats .psi-table tbody tr:nth-child(even) td { background:rgba(255,255,255,.065); }
    #ppTab-stats .psi-table tbody tr:hover td { background:rgba(255,255,255,.12); color:#fff; }
    #ppTab-stats .psi-table th.year button, #ppTab-stats .psi-table th.level button, #ppTab-stats .psi-table th.age button, #ppTab-stats .psi-table th.bt button, #ppTab-stats .psi-table th.class button, #ppTab-stats .psi-table th.posit button { justify-content:center; text-align:center; }
    #ppTab-stats .psi-table td[data-key="year"], #ppTab-stats .psi-table td[data-key="level"], #ppTab-stats .psi-table td[data-key="age"], #ppTab-stats .psi-table td[data-key="bt"], #ppTab-stats .psi-table td[data-key="class"], #ppTab-stats .psi-table td[data-key="posit"] { text-align:center; }
    #ppTab-stats .psi-table th.team button, #ppTab-stats .psi-table th.org_conf button { justify-content:flex-start; text-align:left; }
    #ppTab-stats .psi-table td[data-key="team"], #ppTab-stats .psi-table td[data-key="org_conf"] { text-align:left; }
    #ppTab-stats .psi-table th:not(.year):not(.team):not(.level):not(.org_conf):not(.age):not(.bt):not(.class):not(.posit) button { justify-content:flex-end; text-align:right; }
    #ppTab-stats .psi-table th.year, #ppTab-stats .psi-table td[data-key="year"] { position:sticky; left:0; z-index:12; min-width:54px; max-width:54px; box-shadow:4px 0 10px rgba(0,0,0,.34); }
    #ppTab-stats .psi-table th.team, #ppTab-stats .psi-table td[data-key="team"] { position:sticky; left:54px; z-index:11; min-width:170px; max-width:170px; box-shadow:4px 0 10px rgba(0,0,0,.28); }
    #ppTab-stats .psi-table th.year, #ppTab-stats .psi-table th.team { z-index:16; }
    #ppTab-stats .psi-table td[data-key="year"] { background:#111 !important; color:#fff; }
    #ppTab-stats .psi-table td[data-key="team"] { background:#141414 !important; color:#fff; overflow:hidden; text-overflow:ellipsis; }
    #ppTab-stats .psi-table th.level, #ppTab-stats .psi-table td[data-key="level"] { min-width:54px; }
    #ppTab-stats .psi-table th.org_conf, #ppTab-stats .psi-table td[data-key="org_conf"] { min-width:120px; max-width:140px; overflow:hidden; text-overflow:ellipsis; }
    #ppTab-stats .psi-table .linkish { color:#fff; text-decoration:none; font-weight:500; }
    #ppTab-stats .psi-total-row td { background:linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.07)) !important; color:#fff !important; border-top:1px solid rgba(255,255,255,.24); font-weight:900 !important; }
    #ppTab-stats .psi-total-row td[data-key="year"] { background:#151515 !important; }
    #ppTab-stats .psi-total-row td[data-key="team"] { background:#171717 !important; letter-spacing:.05em; text-transform:uppercase; }
    #ppTab-stats .psi-empty { min-height:260px; display:grid; place-items:center; padding:24px; color:rgba(255,255,255,.78); background:#101010; font:800 13px/1.35 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; text-align:center; }
    html.light-theme #ppTab-stats, body.light-theme #ppTab-stats { background:#f4f1e8 !important; color:#161616 !important; }
    html.light-theme #ppTab-stats .psi-card, body.light-theme #ppTab-stats .psi-card { background:#ffffff !important; border-color:rgba(0,0,0,.18) !important; box-shadow:0 10px 22px rgba(0,0,0,.12) !important; }
    html.light-theme #ppTab-stats .psi-table-wrap, body.light-theme #ppTab-stats .psi-table-wrap { background:#fff !important; scrollbar-color:rgba(0,0,0,.28) rgba(0,0,0,.08) !important; }
    html.light-theme #ppTab-stats .psi-table, body.light-theme #ppTab-stats .psi-table { color:#151515 !important; }
    html.light-theme #ppTab-stats .psi-table thead th, body.light-theme #ppTab-stats .psi-table thead th { background:linear-gradient(180deg,#f5f5f5,#e6e2d7) !important; color:#141414 !important; border-color:rgba(0,0,0,.18) !important; }
    html.light-theme #ppTab-stats .psi-table td, body.light-theme #ppTab-stats .psi-table td { background:#fff !important; color:#222 !important; border-color:rgba(0,0,0,.09) !important; }
    html.light-theme #ppTab-stats .psi-table tbody tr:nth-child(even) td, body.light-theme #ppTab-stats .psi-table tbody tr:nth-child(even) td { background:#f7f4ec !important; }
    html.light-theme #ppTab-stats .psi-table tbody tr:hover td, body.light-theme #ppTab-stats .psi-table tbody tr:hover td { background:#eee7d8 !important; color:#000 !important; }
    html.light-theme #ppTab-stats .psi-table td[data-key="year"], body.light-theme #ppTab-stats .psi-table td[data-key="year"] { background:#f0ede4 !important; color:#111 !important; }
    html.light-theme #ppTab-stats .psi-table td[data-key="team"], body.light-theme #ppTab-stats .psi-table td[data-key="team"] { background:#f7f4ec !important; color:#111 !important; }
    html.light-theme #ppTab-stats .psi-table .linkish, body.light-theme #ppTab-stats .psi-table .linkish { color:#111 !important; }
    html.light-theme #ppTab-stats .psi-total-row td, body.light-theme #ppTab-stats .psi-total-row td { background:#e3ddcf !important; color:#000 !important; }
    html.light-theme #ppTab-stats .psi-empty, body.light-theme #ppTab-stats .psi-empty { background:#fff !important; color:#222 !important; }
    @media (max-width:860px) { #ppTab-stats { padding:7px 5px calc(var(--profile-tabs-h,72px) + 10px) !important; } #ppTab-stats .psi-table { font-size:10px; } #ppTab-stats .psi-table th button, #ppTab-stats .psi-table td { padding:6px 5px; } #ppTab-stats .psi-table th.team, #ppTab-stats .psi-table td[data-key="team"] { min-width:146px; max-width:146px; left:50px; } #ppTab-stats .psi-table th.year, #ppTab-stats .psi-table td[data-key="year"] { min-width:50px; max-width:50px; } }
  </style>`;
}

function attachSortHandlers(panel: HTMLElement) {
  const tables = Array.from(panel.querySelectorAll<HTMLTableElement>('.psi-table'));
  tables.forEach((tableEl) => {
    const headers = Array.from(tableEl.querySelectorAll<HTMLTableCellElement>('th[data-sort-key]'));
    const tbody = tableEl.querySelector('tbody');
    if (!tbody) return;
    headers.forEach((header, index) => {
      header.querySelector('button')?.addEventListener('click', () => {
        const direction = header.classList.contains('is-sort-asc') ? 'desc' : 'asc';
        headers.forEach((h) => h.classList.remove('is-sort-asc', 'is-sort-desc'));
        header.classList.add(direction === 'asc' ? 'is-sort-asc' : 'is-sort-desc');
        const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr'));
        rows.sort((a, b) => {
          const av = a.children[index]?.textContent?.trim() || '';
          const bv = b.children[index]?.textContent?.trim() || '';
          const an = Number(av.replace(/[^0-9.-]/g, ''));
          const bn = Number(bv.replace(/[^0-9.-]/g, ''));
          const numeric = av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn);
          const result = numeric ? an - bn : av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
          return direction === 'asc' ? result : -result;
        });
        rows.forEach((row) => tbody.appendChild(row));
      });
    });
  });
}

export default function ProfileStatsInjector({ playerId, meta }: { playerId: string; meta?: StatsMeta }) {
  useEffect(() => {
    let cancelled = false;
    const panel = document.querySelector('#ppTab-stats') as HTMLElement | null;
    if (!panel) return;
    panel.innerHTML = `${css()}<div class="psi-empty">Loading season stats...</div>`;
    fetch(`/api/player-season-stats?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data?.error || 'Unable to load stats'); return data; })
      .then((data) => {
        if (cancelled) return;
        const batting = Array.isArray(data?.batting) ? data.batting : [];
        const pitching = Array.isArray(data?.pitching) ? data.pitching : [];
        const primary = data?.primaryType === 'pitching' ? 'pitching' : 'batting';
        const html = primary === 'pitching'
          ? `${table('pitching', pitching, pitchingColumns)}${table('batting', batting, battingColumns)}`
          : `${table('batting', batting, battingColumns)}${table('pitching', pitching, pitchingColumns)}`;
        panel.innerHTML = html ? `${css()}<div class="psi-shell">${html}</div>` : `${css()}<div class="psi-empty">No season-by-season stats found for this player yet.</div>`;
        attachSortHandlers(panel);
      })
      .catch((err) => { if (!cancelled) panel.innerHTML = `${css()}<div class="psi-empty">Stats failed to load: ${esc(err?.message || 'Unknown error')}</div>`; });
    return () => { cancelled = true; };
  }, [playerId, meta]);
  return null;
}
