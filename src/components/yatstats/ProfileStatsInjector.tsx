'use client';

import { useEffect } from 'react';

type Row = Record<string, any>;

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

function esc(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmt(value: unknown) {
  if (value === null || value === undefined || value === '') return '&nbsp;';
  return esc(value);
}

function table(title: string, rows: Row[], columns: readonly (readonly [string, string])[]) {
  if (!rows.length) return '';
  return `
    <section class="psi-card">
      <div class="psi-ribbon"><span>Want the stats?</span> <strong>${esc(title)}</strong></div>
      <div class="psi-table-wrap">
        <table class="psi-table">
          <thead><tr>${columns.map(([key, label]) => `<th class="${key === 'team' ? 'team' : ''}">${esc(label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map((row, idx) => `
              <tr>
                ${columns.map(([key]) => `<td class="${['team','league','mlb'].includes(key) ? 'linkish' : ''}">${fmt(row[key])}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function css() {
  return `
    <style id="profile-stats-injector-css">
      #ppTab-stats { background:#101010 !important; padding:8px 10px calc(var(--profile-tabs-h,68px) + 14px) !important; overflow:auto !important; color:#050505 !important; }
      #ppTab-stats .psi-shell { width:100%; background:#101010; }
      #ppTab-stats .psi-card { width:100%; border:1px solid #a69755; background:#e6e6e6; margin:0 0 14px; box-shadow:none; }
      #ppTab-stats .psi-ribbon { display:flex; gap:6px; align-items:center; padding:5px 8px; background:#f5efad; border-bottom:1px solid #777; font:700 12px/1 Arial, sans-serif; color:#111; }
      #ppTab-stats .psi-ribbon strong { color:#0645ad; text-decoration:underline; font-weight:700; }
      #ppTab-stats .psi-table-wrap { width:100%; overflow-x:auto; background:#e6e6e6; }
      #ppTab-stats .psi-table { min-width:1180px; width:100%; border-collapse:collapse; font:700 12px/1.15 Arial, Helvetica, sans-serif; color:#050505; }
      #ppTab-stats .psi-table th { padding:3px 5px; border:1px solid #111; background:#626262; color:#fff; text-align:left; white-space:nowrap; text-transform:lowercase; }
      #ppTab-stats .psi-table td { padding:3px 5px; border:1px solid #111; background:#f1f1f1; white-space:nowrap; font-variant-numeric:tabular-nums; text-align:right; color:#050505; }
      #ppTab-stats .psi-table tr:nth-child(even) td { background:#dcdcdc; }
      #ppTab-stats .psi-table tr:hover td { background:#d8edf5; }
      #ppTab-stats .psi-table td:nth-child(1), #ppTab-stats .psi-table td:nth-child(2), #ppTab-stats .psi-table td:nth-child(3), #ppTab-stats .psi-table td:nth-child(4), #ppTab-stats .psi-table td:nth-child(5) { text-align:left; }
      #ppTab-stats .psi-table .team { min-width:170px; }
      #ppTab-stats .psi-table .linkish { color:#0645ad; text-decoration:underline; }
      #ppTab-stats .psi-empty { min-height:260px; display:grid; place-items:center; padding:24px; color:rgba(255,255,255,.78); background:#101010; font:800 13px/1.35 Oswald, sans-serif; letter-spacing:.1em; text-transform:uppercase; text-align:center; }
      @media (max-width:860px) { #ppTab-stats { padding:6px 6px calc(var(--profile-tabs-h,72px) + 12px) !important; } #ppTab-stats .psi-table { font-size:11px; } #ppTab-stats .psi-table th, #ppTab-stats .psi-table td { padding:3px 4px; } }
    </style>
  `;
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
          ? `${table('Pitching Statistics', pitching, pitchingColumns)}${table('Batting Statistics', batting, battingColumns)}`
          : `${table('Batting Statistics', batting, battingColumns)}${table('Pitching Statistics', pitching, pitchingColumns)}`;

        panel.innerHTML = html
          ? `${css()}<div class="psi-shell">${html}</div>`
          : `${css()}<div class="psi-empty">No season-by-season stats found for this player yet.</div>`;
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
