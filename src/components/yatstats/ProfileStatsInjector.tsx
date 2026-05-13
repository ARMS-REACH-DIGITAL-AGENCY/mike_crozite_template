'use client';

import { useEffect } from 'react';

type Row = Record<string, unknown>;
type Column = readonly [string, string];
type StatsMeta = {
  currentTeamName?: string;
  orgConferenceName?: string;
  levelLabel?: string;
  statusLabel?: string;
};

const battingColumns: readonly Column[] = [
  ['year', 'YR'], ['team', 'TEAM'], ['level', 'LEVEL'], ['org_conf', 'ORG/CONF'], ['age', 'AGE'], ['bt', 'B/T'], ['class', 'CLS'], ['posit', 'POS'],
  ['g', 'G'], ['ab', 'AB'], ['r', 'R'], ['h', 'H'], ['dbl', '2B'], ['tpl', '3B'], ['hr', 'HR'], ['rbi', 'RBI'], ['sb', 'SB'], ['cs', 'CS'], ['bb', 'BB'], ['so', 'SO'], ['hbp', 'HBP'], ['sh', 'SH'], ['sf', 'SF'], ['ibb', 'IBB'], ['gdp', 'GDP'], ['tb', 'TB'], ['pa', 'PA'], ['xbh', 'XBH'], ['sgl', '1B'], ['bavg', 'AVG'], ['obp', 'OBP'], ['slg', 'SLG'], ['ops', 'OPS'], ['seca', 'SECA'], ['iso', 'ISO'], ['babip', 'BABIP'],
] as const;

const pitchingColumns: readonly Column[] = [
  ['year', 'YR'], ['team', 'TEAM'], ['level', 'LEVEL'], ['org_conf', 'ORG/CONF'], ['age', 'AGE'], ['bt', 'B/T'], ['class', 'CLS'],
  ['w', 'W'], ['l', 'L'], ['g', 'G'], ['gs', 'GS'], ['cg', 'CG'], ['sho', 'SHO'], ['gr', 'GR'], ['gf', 'GF'], ['sv', 'SV'], ['ip', 'IP'], ['h', 'H'], ['r', 'R'], ['er', 'ER'], ['hr', 'HR'], ['bb', 'BB'], ['so', 'SO'], ['wp', 'WP'], ['bk', 'BK'], ['hb', 'HB'], ['era', 'ERA'], ['whip', 'WHIP'], ['h9', 'H/9'], ['hr9', 'HR/9'], ['bb9', 'BB/9'], ['so9', 'K/9'], ['ra9', 'RA/9'], ['so_bb', 'K/BB'],
] as const;

const sumBattingKeys = ['g','ab','r','h','dbl','tpl','hr','rbi','sb','cs','bb','so','hbp','sh','sf','ibb','gdp','tb','pa','xbh','sgl'] as const;
const sumPitchingKeys = ['w','l','g','gs','cg','sho','gr','gf','sv','h','r','er','hr','bb','so','wp','bk','hb'] as const;
const levelBuckets = ['MLB', 'AAA', 'AA', 'A+', 'A', 'RK', 'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'JUCO', 'COLLEGE'] as const;

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

function cleanText(value: unknown) {
  return String(value ?? '').replace(/[\u0091\u0092\u0093\u0094]/g, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

function abbreviateTeam(value: unknown) {
  const team = cleanText(value);
  const key = team.toUpperCase();
  const exact: Record<string, string> = {
    'YAVAPAI COLLEGE': 'YAVAPAI',
    'DALLAS BAPTIST UNIVERSITY': 'DALLAS BAPTIST',
    'UNIVERSITY OF CALIFORNIA- LOS ANGELES- UCLA': 'UCLA',
    'UNIVERSITY OF CALIFORNIA - LOS ANGELES - UCLA': 'UCLA',
    'BROOKLYN CYCLONES': 'BROOKLYN',
    'BINGHAMTON RUMBLE PONIES': 'BINGHAMTON',
    'SYRACUSE METS': 'SYRACUSE',
    'NEW YORK METS': 'NEW YORK METS',
    'SCRANTON/WILKES-BARRE RAILRIDERS': 'SCRANTON/WB',
    'SCRANTON/WILES-BARRE RAILRAIDERS': 'SCRANTON/WB',
    'FCL METS': 'FCL METS',
    'ST. LUCIE METS': 'ST. LUCIE',
  };
  if (exact[key]) return exact[key];
  return team
    .replace(/\bUniversity\b/gi, 'Univ.')
    .replace(/\bCollege\b/gi, 'Coll.')
    .replace(/\bRumble Ponies\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOrg(value: unknown) {
  const org = cleanText(value);
  if (/NJCAA Region 1/i.test(org)) return 'Region 1';
  return org;
}

function normalizeLevel(value: unknown, row?: Row) {
  const raw = cleanText(value).toUpperCase();
  const team = cleanText(row?.team).toUpperCase();
  const org = cleanText(row?.org_conf).toUpperCase();
  if (raw.includes('MLB')) return 'MLB';
  if (raw.includes('TRIPLE') || raw === 'AAA') return 'AAA';
  if (raw.includes('DOUBLE') || raw === 'AA') return 'AA';
  if (raw === 'A+' || raw.includes('HIGH-A') || raw.includes('HIGH A')) return 'A+';
  if (raw === 'A' || raw.includes('LOW-A') || raw.includes('LOW A')) return 'A';
  if (raw.includes('ROOKIE') || raw === 'RK') return 'RK';
  if (raw.includes('NCAA-D1') || raw.includes('NCAA D1') || raw.includes('DIVISION I')) return 'NCAA-D1';
  if (raw.includes('NCAA-D2') || raw.includes('NCAA D2') || raw.includes('DIVISION II')) return 'NCAA-D2';
  if (raw.includes('NCAA-D3') || raw.includes('NCAA D3') || raw.includes('DIVISION III')) return 'NCAA-D3';
  if (raw.includes('NJCAA') || raw.includes('JUCO')) return 'NJCAA';
  if (raw.includes('NAIA')) return 'NAIA';
  if (team.includes('YAVAPAI') || org.includes('NJCAA') || org.includes('REGION 1')) return 'NJCAA';
  if (team.includes('DALLAS BAPTIST') || team.includes('UCLA') || org.includes('BIG TEN') || org.includes('CONFERENCE USA') || org === 'SEC' || org === 'ACC' || org.includes('PAC-12') || org.includes('BIG 12')) return 'NCAA-D1';
  if (raw.includes('COLLEGE') || raw.includes('NCAA')) return 'COLLEGE';
  return raw;
}

function prepRow(row: Row): Row {
  return {
    ...row,
    team: abbreviateTeam(row.team),
    org_conf: normalizeOrg(row.org_conf),
    level: normalizeLevel(row.level, row),
    bt: [row.ba, row.th].map(cleanText).filter(Boolean).join('/'),
  };
}

function rowBucket(row: Row) {
  return String(prepRow(row).level || '').toUpperCase();
}

function buildBattingTotal(rows: Row[], label = 'Career', bucket = ''): Row {
  const total: Row = { year: 'Total', team: label, level: bucket, org_conf: '', age: '', bt: '', class: '', posit: '' };
  sumBattingKeys.forEach((key) => { total[key] = rows.reduce((sum, row) => sum + num(row[key]), 0); });
  const h = num(total.h); const ab = num(total.ab); const bb = num(total.bb); const hbp = num(total.hbp); const sf = num(total.sf); const tb = num(total.tb);
  total.bavg = ab > 0 ? rate(h / ab) : '';
  total.obp = (ab + bb + hbp + sf) > 0 ? rate((h + bb + hbp) / (ab + bb + hbp + sf)) : '';
  total.slg = ab > 0 ? rate(tb / ab) : '';
  total.ops = total.obp && total.slg ? rate(Number(`0${total.obp}`) + Number(`0${total.slg}`)) : '';
  total.seca = ab > 0 ? rate((num(total.bb) + (num(total.tb) - h) + num(total.sb) - num(total.cs)) / ab) : '';
  total.iso = ab > 0 && total.bavg ? rate(Number(`0${total.slg}`) - Number(`0${total.bavg}`)) : '';
  total.babip = (ab - num(total.hr) - num(total.so) + sf) > 0 ? rate((h - num(total.hr)) / (ab - num(total.hr) - num(total.so) + sf)) : '';
  return total;
}

function buildPitchingTotal(rows: Row[], label = 'Career', bucket = ''): Row {
  const total: Row = { year: 'Total', team: label, level: bucket, org_conf: '', age: '', bt: '', class: '' };
  sumPitchingKeys.forEach((key) => { total[key] = rows.reduce((sum, row) => sum + num(row[key]), 0); });
  const outs = rows.reduce((sum, row) => sum + parseIpToOuts(row.ip), 0);
  const innings = outs / 3;
  const er = num(total.er); const r = num(total.r); const h = num(total.h); const bb = num(total.bb); const hr = num(total.hr); const so = num(total.so);
  total.ip = outsToIp(outs);
  total.era = innings > 0 ? dec((er * 9) / innings, 2) : '';
  total.whip = innings > 0 ? dec((h + bb) / innings, 2) : '';
  total.h9 = innings > 0 ? dec((h * 9) / innings, 2) : '';
  total.hr9 = innings > 0 ? dec((hr * 9) / innings, 2) : '';
  total.bb9 = innings > 0 ? dec((bb * 9) / innings, 2) : '';
  total.so9 = innings > 0 ? dec((so * 9) / innings, 2) : '';
  total.ra9 = innings > 0 ? dec((r * 9) / innings, 2) : '';
  total.so_bb = bb > 0 ? dec(so / bb, 2) : '';
  return total;
}

function getBucketRows(rows: Row[], bucket: string) {
  if (bucket === 'COLLEGE') return rows.filter((row) => ['NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','JUCO','COLLEGE'].includes(rowBucket(row)));
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
  out.push(make(rows, `All Levels (${rows.length} yrs)`, 'ALL'));
  return out.map(prepRow);
}

function renderCells(row: Row, columns: readonly Column[], extraClass = '') {
  const clean: Row = prepRow(row);
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
    html, body, .pp-funzone-outer, .pp-funzone, #playerFunZone { background:#070707 !important; }
    #ppTab-stats { background: radial-gradient(circle at 18% 0%, rgba(255,255,255,.08), transparent 24%), linear-gradient(180deg, #121212 0%, #070707 100%) !important; padding:6px 8px calc(var(--profile-tabs-h,68px) + 10px) !important; overflow:auto !important; color:#f4f0e6 !important; }
    #ppTab-stats .psi-shell { width:100%; background:transparent; }
    #ppTab-stats .psi-card { width:100%; border:1px solid rgba(255,255,255,.22); background:linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018)), #0c0c0c; margin:0 0 10px; box-shadow:0 14px 32px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.08); }
    #ppTab-stats .psi-table-wrap { width:100%; max-height: calc(100dvh - var(--row1-h, 40px) - var(--row2-h, 84px) - var(--row3-h, 96px) - var(--row4-h, 48px) - var(--profile-tabs-h, 68px) - var(--footerH, 64px) - 24px); overflow:auto; background:#080808; scrollbar-color:rgba(255,255,255,.38) rgba(255,255,255,.08); scrollbar-width:thin; }
    #ppTab-stats .psi-table { min-width:1480px; width:max-content; border-collapse:separate; border-spacing:0; font:700 10px/1.08 Oswald, Arial, sans-serif; color:#f4f0e6; table-layout:auto; }
    #ppTab-stats .psi-table thead th { position:sticky; top:0; z-index:8; padding:0; border-right:1px solid rgba(255,255,255,.12); border-bottom:1px solid rgba(255,255,255,.24); background:linear-gradient(180deg,#202020,#101010); color:#fff; text-align:left; white-space:nowrap; text-transform:uppercase; }
    #ppTab-stats .psi-table th button { width:100%; height:100%; display:flex; align-items:center; justify-content:center; gap:3px; border:0; background:transparent; color:inherit; padding:5px 4px; font:900 9px/1 Oswald, Arial, sans-serif; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; }
    #ppTab-stats .psi-table th:nth-child(-n+8) button { justify-content:flex-start; }
    #ppTab-stats .psi-table td { padding:4px 4px; border-right:1px solid rgba(255,255,255,.055); border-bottom:1px solid rgba(255,255,255,.075); background:rgba(255,255,255,.035); white-space:nowrap; font-variant-numeric:tabular-nums; text-align:right; color:rgba(255,255,255,.84); min-width:34px; max-width:68px; overflow:hidden; text-overflow:ellipsis; }
    #ppTab-stats .psi-table tbody tr:nth-child(even) td { background:rgba(255,255,255,.065); }
    #ppTab-stats .psi-table tbody tr:hover td { background:rgba(255,255,255,.12); color:#fff; }
    #ppTab-stats .psi-table td:nth-child(-n+8) { text-align:left; }
    #ppTab-stats .psi-table th.year, #ppTab-stats .psi-table td[data-key="year"] { position:sticky; left:0; z-index:12; min-width:50px; max-width:50px; box-shadow:4px 0 10px rgba(0,0,0,.34); }
    #ppTab-stats .psi-table th.team, #ppTab-stats .psi-table td[data-key="team"] { position:sticky; left:50px; z-index:11; min-width:124px; max-width:124px; box-shadow:4px 0 10px rgba(0,0,0,.28); }
    #ppTab-stats .psi-table th.year, #ppTab-stats .psi-table th.team { z-index:16; }
    #ppTab-stats .psi-table td[data-key="year"] { background:#111 !important; color:#fff; font-weight:900; }
    #ppTab-stats .psi-table td[data-key="team"] { background:#141414 !important; color:#fff; font-weight:900; }
    #ppTab-stats .psi-table th.level, #ppTab-stats .psi-table td[data-key="level"] { min-width:64px; max-width:72px; }
    #ppTab-stats .psi-table th.org_conf, #ppTab-stats .psi-table td[data-key="org_conf"] { min-width:88px; max-width:100px; }
    #ppTab-stats .psi-table th.age, #ppTab-stats .psi-table td[data-key="age"], #ppTab-stats .psi-table th.bt, #ppTab-stats .psi-table td[data-key="bt"], #ppTab-stats .psi-table th.class, #ppTab-stats .psi-table td[data-key="class"], #ppTab-stats .psi-table th.posit, #ppTab-stats .psi-table td[data-key="posit"] { min-width:42px; max-width:52px; }
    #ppTab-stats .psi-table .linkish { color:#fff; text-decoration:none; font-weight:900; }
    #ppTab-stats .psi-total-row td { background:linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.07)) !important; color:#fff !important; border-top:1px solid rgba(255,255,255,.24); font-weight:900; }
    #ppTab-stats .psi-total-row td[data-key="year"] { background:#151515 !important; }
    #ppTab-stats .psi-total-row td[data-key="team"] { background:#171717 !important; letter-spacing:.04em; text-transform:uppercase; }
    #ppTab-stats .psi-empty { min-height:260px; display:grid; place-items:center; padding:24px; color:rgba(255,255,255,.78); background:#101010; font:800 13px/1.35 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; text-align:center; }
    @media (max-width:860px) { #ppTab-stats { padding:7px 5px calc(var(--profile-tabs-h,72px) + 10px) !important; } #ppTab-stats .psi-table { font-size:9px; } #ppTab-stats .psi-table th button, #ppTab-stats .psi-table td { padding:4px 3px; } #ppTab-stats .psi-table th.team, #ppTab-stats .psi-table td[data-key="team"] { min-width:112px; max-width:112px; left:46px; } #ppTab-stats .psi-table th.year, #ppTab-stats .psi-table td[data-key="year"] { min-width:46px; max-width:46px; } }
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
