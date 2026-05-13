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
  ['year', 'YEAR'], ['team', 'TEAM'], ['level', 'LEVEL'], ['org_conf', 'ORG/CONF'], ['age', 'AGE'], ['posit', 'POS'],
  ['g', 'G'], ['ab', 'AB'], ['r', 'R'], ['h', 'H'], ['dbl', '2B'], ['tpl', '3B'], ['hr', 'HR'], ['rbi', 'RBI'], ['sb', 'SB'], ['cs', 'CS'], ['bb', 'BB'], ['so', 'SO'], ['hbp', 'HBP'], ['sh', 'SH'], ['sf', 'SF'], ['ibb', 'IBB'], ['gdp', 'GDP'], ['tb', 'TB'], ['pa', 'PA'], ['xbh', 'XBH'], ['sgl', '1B'], ['bavg', 'AVG'], ['obp', 'OBP'], ['slg', 'SLG'], ['ops', 'OPS'], ['seca', 'SECA'], ['iso', 'ISO'], ['babip', 'BABIP'],
] as const;

const pitchingColumns: readonly Column[] = [
  ['year', 'YEAR'], ['team', 'TEAM'], ['level', 'LEVEL'], ['org_conf', 'ORG/CONF'], ['age', 'AGE'],
  ['w', 'W'], ['l', 'L'], ['g', 'G'], ['gs', 'GS'], ['cg', 'CG'], ['sho', 'SHO'], ['gr', 'GR'], ['gf', 'GF'], ['sv', 'SV'], ['ip', 'IP'], ['h', 'H'], ['r', 'R'], ['er', 'ER'], ['hr', 'HR'], ['bb', 'BB'], ['so', 'SO'], ['wp', 'WP'], ['bk', 'BK'], ['hb', 'HB'], ['era', 'ERA'], ['whip', 'WHIP'], ['h9', 'H/9'], ['hr9', 'HR/9'], ['bb9', 'BB/9'], ['so9', 'K/9'], ['ra9', 'RA/9'], ['so_bb', 'K/BB'],
] as const;

const sumBattingKeys = ['g','ab','r','h','dbl','tpl','hr','rbi','sb','cs','bb','so','hbp','sh','sf','ibb','gdp','tb','pa','xbh','sgl'] as const;
const sumPitchingKeys = ['w','l','g','gs','cg','sho','gr','gf','sv','h','r','er','hr','bb','so','wp','bk','hb'] as const;
const levelBuckets = ['MLB', 'AAA', 'AA', 'A+', 'A', 'RK', 'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'JUCO'] as const;
const minorBuckets = new Set(['AAA', 'AA', 'A+', 'A', 'RK']);
const collegeBuckets = new Set(['NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'NJCAA', 'JUCO', 'COLLEGE']);
const twoDecimalKeys = new Set(['era', 'whip', 'h9', 'hr9', 'bb9', 'so9', 'ra9', 'so_bb']);

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

function fmtCell(key: string, value: unknown) {
  if (twoDecimalKeys.has(key)) {
    const n = Number(value);
    if (Number.isFinite(n)) return n.toFixed(2);
  }
  return fmt(value);
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
  };
}

function rowBucket(row: Row) {
  return String(prepRow(row).level || '').toUpperCase();
}

function buildBattingTotal(rows: Row[], label = 'Career', bucket = ''): Row {
  const total: Row = { year: 'Total', team: label, level: bucket, org_conf: '', age: '', posit: '' };
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
  const total: Row = { year: 'Total', team: label, level: bucket, org_conf: '', age: '' };
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

function getLevelRows(rows: Row[], bucket: string) {
  return rows.filter((row) => rowBucket(row) === bucket);
}

function getBucketRows(rows: Row[], bucket: 'MLB' | 'MiLB' | 'COLLEGE') {
  if (bucket === 'MLB') return rows.filter((row) => rowBucket(row) === 'MLB');
  if (bucket === 'MiLB') return rows.filter((row) => minorBuckets.has(rowBucket(row)));
  return rows.filter((row) => collegeBuckets.has(rowBucket(row)));
}

function marked(row: Row, totalKind: 'level' | 'bucket') {
  return { ...row, __total_kind: totalKind };
}

function totalRows(kind: 'batting' | 'pitching', rows: Row[]) {
  const make = kind === 'pitching' ? buildPitchingTotal : buildBattingTotal;
  const out: Row[] = [];

  for (const bucket of levelBuckets) {
    const bucketRows = getLevelRows(rows, bucket);
    if (!bucketRows.length) continue;
    out.push(marked(make(bucketRows, `${bucket} TOTAL`, bucket), 'level'));
  }

  const mlbRows = getBucketRows(rows, 'MLB');
  const milbRows = getBucketRows(rows, 'MiLB');
  const collegeRows = getBucketRows(rows, 'COLLEGE');

  if (mlbRows.length) out.push(marked(make(mlbRows, 'MLB TOTALS', 'MLB'), 'bucket'));
  if (milbRows.length) out.push(marked(make(milbRows, 'MiLB TOTALS', 'MiLB'), 'bucket'));
  if (collegeRows.length) out.push(marked(make(collegeRows, 'COLLEGE TOTALS', 'COLLEGE'), 'bucket'));

  return out.map(prepRow);
}

function renderCells(row: Row, columns: readonly Column[], extraClass = '') {
  const clean: Row = prepRow(row);
  return columns.map(([key]) => `<td data-key="${esc(key)}" class="${extraClass} ${['team','org_conf'].includes(key) ? 'linkish' : ''}">${fmtCell(key, clean[key])}</td>`).join('');
}

function totalRow(kind: 'batting' | 'pitching', rows: Row[], columns: readonly Column[]) {
  if (!rows.length) return '';
  return `<tfoot>${totalRows(kind, rows).map((row) => `<tr class="psi-total-row ${row.__total_kind === 'bucket' ? 'psi-bucket-total-row' : 'psi-level-total-row'}">${renderCells(row, columns)}</tr>`).join('')}</tfoot>`;
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
    #playerFunZone {
      --psi-page-bg: #070707;
      --psi-panel-bg: #080808;
      --psi-card-bg: #0c0c0c;
      --psi-card-bg-2: rgba(255,255,255,.055);
      --psi-head-bg-a: #202020;
      --psi-head-bg-b: #101010;
      --psi-text: #f4f0e6;
      --psi-muted-text: rgba(255,255,255,.84);
      --psi-border: rgba(255,255,255,.18);
      --psi-cell-bg: rgba(255,255,255,.035);
      --psi-cell-bg-alt: rgba(255,255,255,.065);
      --psi-cell-hover: rgba(255,255,255,.12);
      --psi-total-bg: rgba(214, 178, 83, .32);
      --psi-total-bg-2: rgba(214, 178, 83, .20);
      --psi-total-text: #fff7d6;
    }

    html.light-theme #playerFunZone,
    body.light-theme #playerFunZone {
      --psi-page-bg: #f6f0e4;
      --psi-panel-bg: #fffaf0;
      --psi-card-bg: #fffdf8;
      --psi-card-bg-2: rgba(160,118,28,.10);
      --psi-head-bg-a: #eadfbf;
      --psi-head-bg-b: #d9c68e;
      --psi-text: #17130b;
      --psi-muted-text: #2b2415;
      --psi-border: rgba(74,54,10,.24);
      --psi-cell-bg: rgba(255,255,255,.78);
      --psi-cell-bg-alt: rgba(245,236,214,.92);
      --psi-cell-hover: rgba(224,198,126,.38);
      --psi-total-bg: rgba(229, 197, 105, .72);
      --psi-total-bg-2: rgba(241, 216, 145, .78);
      --psi-total-text: #181109;
    }

    #playerFunZone,
    #playerFunZone .pp-funzone,
    #playerFunZone .pp-funzone-outer { background: var(--psi-page-bg) !important; }
    #ppTab-stats { background: var(--psi-page-bg) !important; padding:6px 6px calc(var(--profile-tabs-h,68px) + 10px) !important; overflow:auto !important; color:var(--psi-text) !important; }
    #ppTab-stats .psi-shell { width:100%; background:transparent; }
    #ppTab-stats .psi-card { width:100%; border:1px solid var(--psi-border); background:linear-gradient(180deg, var(--psi-card-bg-2), transparent), var(--psi-card-bg); margin:0 0 10px; box-shadow:0 14px 32px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.08); }
    #ppTab-stats .psi-table-wrap { width:100%; max-height: calc(100dvh - var(--row1-h, 40px) - var(--row2-h, 84px) - var(--row3-h, 96px) - var(--row4-h, 48px) - var(--profile-tabs-h, 68px) - var(--footerH, 64px) - 24px); overflow:auto; background:var(--psi-panel-bg); scrollbar-color:rgba(150,120,50,.55) rgba(150,120,50,.12); scrollbar-width:thin; }
    #ppTab-stats .psi-table { min-width:0; width:max-content; border-collapse:separate; border-spacing:0; font:500 9.5px/1.05 Oswald, Arial, sans-serif; color:var(--psi-text); table-layout:auto; }
    #ppTab-stats .psi-table thead th { position:sticky; top:0; z-index:8; padding:0; border-right:1px solid var(--psi-border); border-bottom:1px solid var(--psi-border); background:linear-gradient(180deg,var(--psi-head-bg-a),var(--psi-head-bg-b)); color:var(--psi-text); text-align:right; white-space:nowrap; text-transform:uppercase; width:auto; }
    #ppTab-stats .psi-table th button { width:auto; height:100%; display:flex; align-items:center; justify-content:flex-end; gap:2px; border:0; background:transparent; color:inherit; padding:4px 3px; font:900 9px/1 Oswald, Arial, sans-serif; letter-spacing:.04em; text-transform:uppercase; cursor:pointer; }
    #ppTab-stats .psi-table th.year button,
    #ppTab-stats .psi-table th.level button,
    #ppTab-stats .psi-table th.age button { justify-content:center; }
    #ppTab-stats .psi-table th.team button,
    #ppTab-stats .psi-table th.org_conf button,
    #ppTab-stats .psi-table th.posit button { justify-content:flex-start; }
    #ppTab-stats .psi-table td { padding:3px 3px; border-right:1px solid rgba(128,128,128,.14); border-bottom:1px solid rgba(128,128,128,.16); background:var(--psi-cell-bg); white-space:nowrap; font-variant-numeric:tabular-nums; text-align:right !important; color:var(--psi-muted-text); width:auto; min-width:0; max-width:none; overflow:visible; text-overflow:clip; font-weight:500; }
    #ppTab-stats .psi-table tbody tr:nth-child(even) td { background:var(--psi-cell-bg-alt); }
    #ppTab-stats .psi-table tbody tr:hover td { background:var(--psi-cell-hover); color:var(--psi-text); }
    #ppTab-stats .psi-table td[data-key="team"],
    #ppTab-stats .psi-table td[data-key="org_conf"],
    #ppTab-stats .psi-table td[data-key="posit"] { text-align:left !important; }
    #ppTab-stats .psi-table td[data-key="year"],
    #ppTab-stats .psi-table td[data-key="level"],
    #ppTab-stats .psi-table td[data-key="age"] { text-align:center !important; }
    #ppTab-stats .psi-table th.year, #ppTab-stats .psi-table td[data-key="year"] { position:sticky; left:0; z-index:12; width:40px; min-width:40px; max-width:40px; box-shadow:4px 0 10px rgba(0,0,0,.18); }
    #ppTab-stats .psi-table th.team, #ppTab-stats .psi-table td[data-key="team"] { position:sticky; left:40px; z-index:11; width:108px; min-width:108px; max-width:108px; box-shadow:4px 0 10px rgba(0,0,0,.14); overflow:hidden; text-overflow:ellipsis; }
    #ppTab-stats .psi-table th.year, #ppTab-stats .psi-table th.team { z-index:16; }
    #ppTab-stats .psi-table tbody tr td[data-key="year"],
    #ppTab-stats .psi-table tbody tr td[data-key="team"] { background:var(--psi-cell-bg) !important; color:var(--psi-text); }
    #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="year"],
    #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="team"] { background:var(--psi-cell-bg-alt) !important; }
    #ppTab-stats .psi-table tbody tr:hover td[data-key="year"],
    #ppTab-stats .psi-table tbody tr:hover td[data-key="team"] { background:var(--psi-cell-hover) !important; color:var(--psi-text); }
    #ppTab-stats .psi-table th.level, #ppTab-stats .psi-table td[data-key="level"] { width:58px; min-width:58px; max-width:58px; overflow:hidden; text-overflow:ellipsis; }
    #ppTab-stats .psi-table th.org_conf, #ppTab-stats .psi-table td[data-key="org_conf"] { width:76px; min-width:76px; max-width:76px; overflow:hidden; text-overflow:ellipsis; }
    #ppTab-stats .psi-table th.age, #ppTab-stats .psi-table td[data-key="age"], #ppTab-stats .psi-table th.posit, #ppTab-stats .psi-table td[data-key="posit"] { width:34px; min-width:34px; max-width:40px; }
    #ppTab-stats .psi-table th[data-sort-key="w"], #ppTab-stats .psi-table td[data-key="w"], #ppTab-stats .psi-table th[data-sort-key="l"], #ppTab-stats .psi-table td[data-key="l"], #ppTab-stats .psi-table th[data-sort-key="g"], #ppTab-stats .psi-table td[data-key="g"], #ppTab-stats .psi-table th[data-sort-key="h"], #ppTab-stats .psi-table td[data-key="h"], #ppTab-stats .psi-table th[data-sort-key="r"], #ppTab-stats .psi-table td[data-key="r"], #ppTab-stats .psi-table th[data-sort-key="hr"], #ppTab-stats .psi-table td[data-key="hr"] { width:26px; min-width:26px; max-width:32px; }
    #ppTab-stats .psi-table th[data-sort-key="gs"], #ppTab-stats .psi-table td[data-key="gs"], #ppTab-stats .psi-table th[data-sort-key="cg"], #ppTab-stats .psi-table td[data-key="cg"], #ppTab-stats .psi-table th[data-sort-key="gr"], #ppTab-stats .psi-table td[data-key="gr"], #ppTab-stats .psi-table th[data-sort-key="gf"], #ppTab-stats .psi-table td[data-key="gf"], #ppTab-stats .psi-table th[data-sort-key="sv"], #ppTab-stats .psi-table td[data-key="sv"], #ppTab-stats .psi-table th[data-sort-key="er"], #ppTab-stats .psi-table td[data-key="er"], #ppTab-stats .psi-table th[data-sort-key="bb"], #ppTab-stats .psi-table td[data-key="bb"], #ppTab-stats .psi-table th[data-sort-key="so"], #ppTab-stats .psi-table td[data-key="so"], #ppTab-stats .psi-table th[data-sort-key="wp"], #ppTab-stats .psi-table td[data-key="wp"], #ppTab-stats .psi-table th[data-sort-key="bk"], #ppTab-stats .psi-table td[data-key="bk"], #ppTab-stats .psi-table th[data-sort-key="hb"], #ppTab-stats .psi-table td[data-key="hb"] { width:30px; min-width:30px; max-width:36px; }
    #ppTab-stats .psi-table th[data-sort-key="ip"], #ppTab-stats .psi-table td[data-key="ip"], #ppTab-stats .psi-table th[data-sort-key="era"], #ppTab-stats .psi-table td[data-key="era"], #ppTab-stats .psi-table th[data-sort-key="whip"], #ppTab-stats .psi-table td[data-key="whip"], #ppTab-stats .psi-table th[data-sort-key="h9"], #ppTab-stats .psi-table td[data-key="h9"], #ppTab-stats .psi-table th[data-sort-key="hr9"], #ppTab-stats .psi-table td[data-key="hr9"], #ppTab-stats .psi-table th[data-sort-key="bb9"], #ppTab-stats .psi-table td[data-key="bb9"], #ppTab-stats .psi-table th[data-sort-key="so9"], #ppTab-stats .psi-table td[data-key="so9"], #ppTab-stats .psi-table th[data-sort-key="ra9"], #ppTab-stats .psi-table td[data-key="ra9"], #ppTab-stats .psi-table th[data-sort-key="so_bb"], #ppTab-stats .psi-table td[data-key="so_bb"] { width:42px; min-width:42px; max-width:50px; }
    #ppTab-stats .psi-table .linkish { color:var(--psi-text); text-decoration:none; }
    #ppTab-stats .psi-total-row td { background:linear-gradient(180deg, var(--psi-total-bg), var(--psi-total-bg-2)) !important; color:var(--psi-total-text) !important; border-top:1px solid rgba(191,148,43,.58); font-weight:900 !important; }
    #ppTab-stats .psi-total-row td[data-key="year"],
    #ppTab-stats .psi-total-row td[data-key="team"] { background:linear-gradient(180deg, var(--psi-total-bg), var(--psi-total-bg-2)) !important; color:var(--psi-total-text) !important; }
    #ppTab-stats .psi-total-row td[data-key="team"] { letter-spacing:.02em; text-transform:uppercase; }
    #ppTab-stats .psi-bucket-total-row td,
    #ppTab-stats .psi-bucket-total-row td[data-key="year"],
    #ppTab-stats .psi-bucket-total-row td[data-key="team"] { background:var(--psi-cell-bg-alt) !important; color:var(--psi-text) !important; border-top:2px solid rgba(191,148,43,.72); }
    #ppTab-stats .psi-empty { min-height:260px; display:grid; place-items:center; padding:24px; color:var(--psi-muted-text); background:var(--psi-card-bg); font:800 13px/1.35 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; text-align:center; }
    @media (max-width:860px) { #ppTab-stats { padding:6px 4px calc(var(--profile-tabs-h,72px) + 10px) !important; } #ppTab-stats .psi-table { font-size:9px; } #ppTab-stats .psi-table th button, #ppTab-stats .psi-table td { padding:3px 2px; } #ppTab-stats .psi-table th.year, #ppTab-stats .psi-table td[data-key="year"] { width:38px; min-width:38px; max-width:38px; } #ppTab-stats .psi-table th.team, #ppTab-stats .psi-table td[data-key="team"] { width:102px; min-width:102px; max-width:102px; left:38px; } }
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
