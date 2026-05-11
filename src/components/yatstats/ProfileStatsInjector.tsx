'use client';

import { useEffect } from 'react';

type Row = Record<string, any>;
type Column = readonly [string, string];

const battingColumns = [
  ['year', 'year'], ['team', 'team name'], ['league', 'league'], ['level', 'level'], ['mlb', 'mlb'], ['age', 'age'],
  ['g', 'g'], ['ab', 'ab'], ['r', 'r'], ['h', 'h'], ['dbl', '2b'], ['tpl', '3b'], ['hr', 'hr'],
  ['rbi', 'rbi'], ['sb', 'sb'], ['bb', 'bb'], ['so', 'so'], ['avg', 'avg'], ['obp', 'obp'], ['slg', 'slg'], ['ops', 'ops'],
] as const;

const pitchingColumns = [
  ['year', 'year'], ['team', 'team name'], ['league', 'league'], ['level', 'level'], ['mlb', 'mlb'], ['age', 'age'],
  ['w', 'w'], ['l', 'l'], ['era', 'era'], ['g', 'g'], ['gs', 'gs'], ['cg', 'cg'], ['sho', 'sho'], ['gr', 'gr'],
  ['gf', 'gf'], ['sv', 'sv'], ['ip', 'ip'], ['h', 'h'], ['r', 'r'], ['er', 'er'], ['hr', 'hr'], ['bb', 'bb'],
  ['so', 'so'], ['wp', 'wp'], ['bk', 'bk'], ['hb', 'hb'], ['whip', 'whip'], ['h9', 'h9'], ['hr9', 'hr9'],
  ['bb9', 'bb9'], ['so9', 'so9'], ['ra9', 'ra9'], ['so_bb', 'so/bb'],
] as const;

const sumBattingKeys = ['g','ab','r','h','dbl','tpl','hr','rbi','sb','bb','so'] as const;
const sumPitchingKeys = ['w','l','g','gs','cg','sho','gr','gf','sv','h','r','er','hr','bb','so','wp','bk','hb'] as const;

function esc(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
  if (!Number.isFinite(value)) return '';
  return value.toFixed(decimals);
}

function fmt(value: unknown) {
  if (value === null || value === undefined || value === '') return '&nbsp;';
  return esc(value);
}

function buildBattingTotal(rows: Row[]) {
  const total: Row = { year: 'Tot:', team: 'Career', league: '', level: '', mlb: '', age: '' };
  sumBattingKeys.forEach((key) => { total[key] = rows.reduce((sum, row) => sum + num(row[key]), 0); });
  const h = num(total.h);
  const ab = num(total.ab);
  const bb = num(total.bb);
  const dbl = num(total.dbl);
  const tpl = num(total.tpl);
  const hr = num(total.hr);
  total.avg = ab > 0 ? rate(h / ab) : '';
  total.obp = (ab + bb) > 0 ? rate((h + bb) / (ab + bb)) : '';
  total.slg = ab > 0 ? rate((h + dbl + (tpl * 2) + (hr * 3)) / ab) : '';
  total.ops = total.obp && total.slg ? rate(Number(`0${total.obp}`) + Number(`0${total.slg}`)) : '';
  return total;
}

function buildPitchingTotal(rows: Row[]) {
  const total: Row = { year: 'Tot:', team: 'Career', league: '', level: '', mlb: '', age: '' };
  sumPitchingKeys.forEach((key) => { total[key] = rows.reduce((sum, row) => sum + num(row[key]), 0); });
  const outs = rows.reduce((sum, row) => sum + parseIpToOuts(row.ip), 0);
  const innings = outs / 3;
  const er = num(total.er);
  const r = num(total.r);
  const h = num(total.h);
  const bb = num(total.bb);
  const hr = num(total.hr);
  const so = num(total.so);
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

function totalRow(kind: 'batting' | 'pitching', rows: Row[], columns: readonly Column[]) {
  if (!rows.length) return '';
  const total = kind === 'pitching' ? buildPitchingTotal(rows) : buildBattingTotal(rows);
  return `
    <tfoot>
      <tr class="psi-total-row">
        ${columns.map(([key]) => `<td data-key="${esc(key)}" class="${['team','league','mlb'].includes(key) ? 'linkish' : ''}">${fmt(total[key])}</td>`).join('')}
      </tr>
    </tfoot>
  `;
}

function table(title: string, kind: 'batting' | 'pitching', rows: Row[], columns: readonly Column[]) {
  if (!rows.length) return '';
  return `
    <section class="psi-card" data-table-title="${esc(title)}">
      <div class="psi-ribbon">
        <span class="psi-kicker">YAT?STATS DATA VIEW</span>
        <strong>${esc(title)}</strong>
        <em>Click a column heading to sort</em>
      </div>
      <div class="psi-table-wrap">
        <table class="psi-table">
          <thead><tr>${columns.map(([key, label]) => `<th class="${key === 'team' ? 'team' : ''}" data-sort-key="${esc(key)}"><button type="button">${esc(label)}<span class="psi-sort-mark"></span></button></th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                ${columns.map(([key]) => `<td data-key="${esc(key)}" class="${['team','league','mlb'].includes(key) ? 'linkish' : ''}">${fmt(row[key])}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
          ${totalRow(kind, rows, columns)}
        </table>
      </div>
    </section>
  `;
}

function css() {
  return `
    <style id="profile-stats-injector-css">
      html, body, .pp-funzone-outer, .pp-funzone, #playerFunZone { background:#070707 !important; }
      #ppTab-stats {
        background:
          radial-gradient(circle at 18% 0%, rgba(245,200,90,.14), transparent 24%),
          linear-gradient(180deg, #121212 0%, #070707 100%) !important;
        padding: 10px 14px calc(var(--profile-tabs-h,68px) + 16px) !important;
        overflow: auto !important;
        color: #f4f0e6 !important;
      }
      #ppTab-stats .psi-shell { width: 100%; background: transparent; }
      #ppTab-stats .psi-card { width: 100%; border: 1px solid rgba(245,200,90,.44); background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018)), #0c0c0c; margin: 0 0 14px; box-shadow: 0 14px 32px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.08); }
      #ppTab-stats .psi-ribbon { display: grid; grid-template-columns: auto minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 8px 10px; background: linear-gradient(90deg, rgba(245,200,90,.22), rgba(245,200,90,.055) 44%, rgba(255,255,255,.02)), #090909; border-bottom: 1px solid rgba(245,200,90,.32); color: #f5c85a; }
      #ppTab-stats .psi-kicker { padding: 4px 7px; border: 1px solid rgba(245,200,90,.42); background: rgba(245,200,90,.08); font: 900 9px/1 Oswald, Arial, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: rgba(245,200,90,.9); white-space: nowrap; }
      #ppTab-stats .psi-ribbon strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff; font: 900 22px/.9 "Bebas Neue", Oswald, Arial, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
      #ppTab-stats .psi-ribbon em { color: rgba(255,255,255,.52); font: 700 10px/1.1 Oswald, Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; font-style: normal; white-space: nowrap; }
      #ppTab-stats .psi-table-wrap { width: 100%; overflow-x: auto; background: #080808; scrollbar-color: rgba(245,200,90,.7) rgba(255,255,255,.08); scrollbar-width: thin; }
      #ppTab-stats .psi-table { min-width: 1180px; width: 100%; border-collapse: separate; border-spacing: 0; font: 700 12px/1.15 Arial, Helvetica, sans-serif; color: #f4f0e6; }
      #ppTab-stats .psi-table th { position: sticky; top: 0; z-index: 2; padding: 0; border-right: 1px solid rgba(245,200,90,.16); border-bottom: 1px solid rgba(245,200,90,.5); background: linear-gradient(180deg, #24211a, #111); color: #f5c85a; text-align: left; white-space: nowrap; text-transform: uppercase; }
      #ppTab-stats .psi-table th button { width: 100%; height: 100%; display: flex; align-items: center; justify-content: flex-end; gap: 5px; border: 0; background: transparent; color: inherit; padding: 7px 7px; font: 900 10px/1 Oswald, Arial, sans-serif; letter-spacing: .11em; text-transform: uppercase; cursor: pointer; }
      #ppTab-stats .psi-table th:nth-child(1) button, #ppTab-stats .psi-table th:nth-child(2) button, #ppTab-stats .psi-table th:nth-child(3) button, #ppTab-stats .psi-table th:nth-child(4) button, #ppTab-stats .psi-table th:nth-child(5) button { justify-content: flex-start; }
      #ppTab-stats .psi-table th button:hover { background: rgba(245,200,90,.12); color: #fff; }
      #ppTab-stats .psi-sort-mark { width: 0; height: 0; opacity: .55; }
      #ppTab-stats .psi-table th.is-sort-asc .psi-sort-mark::after { content: '▲'; font-size: 8px; }
      #ppTab-stats .psi-table th.is-sort-desc .psi-sort-mark::after { content: '▼'; font-size: 8px; }
      #ppTab-stats .psi-table td { padding: 6px 7px; border-right: 1px solid rgba(255,255,255,.055); border-bottom: 1px solid rgba(255,255,255,.075); background: rgba(255,255,255,.035); white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; color: rgba(255,255,255,.84); }
      #ppTab-stats .psi-table tbody tr:nth-child(even) td { background: rgba(255,255,255,.065); }
      #ppTab-stats .psi-table tbody tr:hover td { background: rgba(245,200,90,.13); color: #fff; }
      #ppTab-stats .psi-table td:nth-child(1), #ppTab-stats .psi-table td:nth-child(2), #ppTab-stats .psi-table td:nth-child(3), #ppTab-stats .psi-table td:nth-child(4), #ppTab-stats .psi-table td:nth-child(5) { text-align: left; }
      #ppTab-stats .psi-table td:nth-child(1) { color: #f5c85a; font-weight: 900; }
      #ppTab-stats .psi-table .team { min-width: 210px; }
      #ppTab-stats .psi-table .linkish { color: #fff; text-decoration: none; font-weight: 900; }
      #ppTab-stats .psi-table td[data-key="league"], #ppTab-stats .psi-table td[data-key="level"], #ppTab-stats .psi-table td[data-key="mlb"] { color: rgba(245,200,90,.82); }
      #ppTab-stats .psi-total-row td { background: linear-gradient(180deg, rgba(245,200,90,.23), rgba(245,200,90,.12)) !important; color: #fff !important; border-top: 2px solid rgba(245,200,90,.62); font-weight: 900; }
      #ppTab-stats .psi-total-row td:first-child, #ppTab-stats .psi-total-row td:nth-child(2) { color: #f5c85a !important; letter-spacing: .05em; text-transform: uppercase; }
      #ppTab-stats .psi-empty { min-height:260px; display:grid; place-items:center; padding:24px; color:rgba(255,255,255,.78); background:#101010; font:800 13px/1.35 Oswald, sans-serif; letter-spacing:.1em; text-transform:uppercase; text-align:center; }
      @media (max-width:860px) { #ppTab-stats { padding: 8px 6px calc(var(--profile-tabs-h,72px) + 12px) !important; } #ppTab-stats .psi-ribbon { grid-template-columns: 1fr; gap: 5px; } #ppTab-stats .psi-ribbon em { display: none; } #ppTab-stats .psi-table { font-size:11px; } #ppTab-stats .psi-table th button, #ppTab-stats .psi-table td { padding:5px 5px; } }
    </style>
  `;
}

function attachSortHandlers(panel: HTMLElement) {
  const tables = Array.from(panel.querySelectorAll<HTMLTableElement>('.psi-table'));
  tables.forEach((tableEl) => {
    const headers = Array.from(tableEl.querySelectorAll<HTMLTableCellElement>('th[data-sort-key]'));
    const tbody = tableEl.querySelector('tbody');
    if (!tbody) return;

    headers.forEach((header, index) => {
      const button = header.querySelector('button');
      button?.addEventListener('click', () => {
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

export default function ProfileStatsInjector({ playerId }: { playerId: string }) {
  useEffect(() => {
    let cancelled = false;
    const panel = document.querySelector('#ppTab-stats') as HTMLElement | null;
    if (!panel) return;

    panel.innerHTML = `${css()}<div class="psi-empty">Loading season stats...</div>`;

    fetch(`/api/player-season-stats?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Unable to load stats');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const batting = Array.isArray(data?.batting) ? data.batting : [];
        const pitching = Array.isArray(data?.pitching) ? data.pitching : [];
        const primary = data?.primaryType === 'pitching' ? 'pitching' : 'batting';
        const html = primary === 'pitching'
          ? `${table('Pitching Statistics', 'pitching', pitching, pitchingColumns)}${table('Batting Statistics', 'batting', batting, battingColumns)}`
          : `${table('Batting Statistics', 'batting', batting, battingColumns)}${table('Pitching Statistics', 'pitching', pitching, pitchingColumns)}`;

        panel.innerHTML = html
          ? `${css()}<div class="psi-shell">${html}</div>`
          : `${css()}<div class="psi-empty">No season-by-season stats found for this player yet.</div>`;
        attachSortHandlers(panel);
      })
      .catch((err) => {
        if (cancelled) return;
        panel.innerHTML = `${css()}<div class="psi-empty">Stats failed to load: ${esc(err?.message || 'Unknown error')}</div>`;
      });

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return null;
}
