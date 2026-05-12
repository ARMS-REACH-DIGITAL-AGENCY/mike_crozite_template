'use client';

import { useEffect, useState } from 'react';

type Row = Record<string, any>;

type StatsPayload = {
  success: boolean;
  playerId: string;
  primaryType: 'batting' | 'pitching';
  batting: Row[];
  pitching: Row[];
  externalRecentStats?: Row[];
};

const BATTING_COLUMNS = [
  ['year', 'year'], ['team', 'team name'], ['league', 'league'], ['level', 'level'], ['mlb', 'mlb'], ['age', 'age'],
  ['g', 'g'], ['ab', 'ab'], ['r', 'r'], ['h', 'h'], ['dbl', '2b'], ['tpl', '3b'], ['hr', 'hr'],
  ['rbi', 'rbi'], ['sb', 'sb'], ['bb', 'bb'], ['so', 'so'], ['avg', 'avg'], ['obp', 'obp'], ['slg', 'slg'], ['ops', 'ops'],
] as const;

const PITCHING_COLUMNS = [
  ['year', 'year'], ['team', 'team name'], ['league', 'league'], ['level', 'level'], ['mlb', 'mlb'], ['age', 'age'],
  ['w', 'w'], ['l', 'l'], ['era', 'era'], ['g', 'g'], ['gs', 'gs'], ['cg', 'cg'], ['sho', 'sho'], ['gr', 'gr'],
  ['gf', 'gf'], ['sv', 'sv'], ['ip', 'ip'], ['h', 'h'], ['r', 'r'], ['er', 'er'], ['hr', 'hr'], ['bb', 'bb'],
  ['so', 'so'], ['wp', 'wp'], ['bk', 'bk'], ['hb', 'hb'], ['whip', 'whip'], ['h9', 'h9'], ['hr9', 'hr9'],
  ['bb9', 'bb9'], ['so9', 'so9'], ['ra9', 'ra9'], ['so_bb', 'so/bb'],
] as const;

const EXTERNAL_RECENT_COLUMNS = [
  ['date', 'date'], ['team', 'team'], ['league', 'league'], ['level', 'level'], ['opponent', 'game'], ['status', 'status'],
  ['g', 'g'], ['ab', 'ab'], ['r', 'r'], ['h', 'h'], ['dbl', '2b'], ['tpl', '3b'], ['hr', 'hr'], ['rbi', 'rbi'],
  ['bb', 'bb'], ['so', 'so'], ['ip', 'ip'], ['er', 'er'], ['era', 'era'], ['whip', 'whip'],
] as const;

function fmt(value: any) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === 'object') return '';
  return String(value);
}

function StatTable({ title, rows, columns }: { title: string; rows: Row[]; columns: readonly (readonly [string, string])[] }) {
  if (!rows.length) return null;

  return (
    <section className="psy-card">
      <div className="psy-ribbon">
        <span>Want the stats?</span>
        <strong>{title}</strong>
      </div>
      <div className="psy-table-wrap">
        <table className="psy-table">
          <thead>
            <tr>
              {columns.map(([key, label]) => <th key={key} className={key === 'team' ? 'team' : ''}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.year || row.date || 'row'}-${row.team || idx}-${idx}`}>
                {columns.map(([key]) => <td key={key} className={key === 'team' || key === 'league' || key === 'mlb' || key === 'opponent' ? 'linkish' : ''}>{fmt(row[key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ProfileSeasonStats({ playerId }: { playerId: string }) {
  const [payload, setPayload] = useState<StatsPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/player-season-stats?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Unable to load stats');
        return data;
      })
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Unable to load stats');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (loading) {
    return <div className="psy-empty">Loading season stats...</div>;
  }

  if (error) {
    return <div className="psy-empty">Stats failed to load: {error}</div>;
  }

  const batting = payload?.batting || [];
  const pitching = payload?.pitching || [];
  const externalRecentStats = payload?.externalRecentStats || [];

  if (!batting.length && !pitching.length && !externalRecentStats.length) {
    return <div className="psy-empty">No season-by-season stats found for this player yet.</div>;
  }

  const primaryIsPitching = payload?.primaryType === 'pitching';

  return (
    <div className="psy-stats-shell">
      <StatTable title="Atlantic League Recent Games" rows={externalRecentStats} columns={EXTERNAL_RECENT_COLUMNS} />
      {primaryIsPitching ? (
        <>
          <StatTable title="Pitching Statistics" rows={pitching} columns={PITCHING_COLUMNS} />
          <StatTable title="Batting Statistics" rows={batting} columns={BATTING_COLUMNS} />
        </>
      ) : (
        <>
          <StatTable title="Batting Statistics" rows={batting} columns={BATTING_COLUMNS} />
          <StatTable title="Pitching Statistics" rows={pitching} columns={PITCHING_COLUMNS} />
        </>
      )}

      <style jsx>{`
        .psy-stats-shell { width: 100%; padding: 8px 10px calc(var(--profile-tabs-h, 68px) + 14px); background: #101010; color: #050505; }
        .psy-card { width: 100%; border: 1px solid #a69755; background: #e6e6e6; margin: 0 0 14px; }
        .psy-ribbon { display: flex; gap: 6px; align-items: center; padding: 5px 8px; background: #f5efad; border-bottom: 1px solid #7f7f7f; font: 700 12px/1 Arial, sans-serif; color: #111; }
        .psy-ribbon strong { color: #0645ad; text-decoration: underline; font-weight: 700; }
        .psy-table-wrap { width: 100%; overflow-x: auto; background: #e6e6e6; }
        .psy-table { min-width: 1180px; width: 100%; border-collapse: collapse; font: 700 12px/1.15 Arial, Helvetica, sans-serif; color: #050505; }
        .psy-table th { padding: 3px 5px; border: 1px solid #111; background: #626262; color: #fff; text-align: left; white-space: nowrap; text-transform: lowercase; }
        .psy-table td { padding: 3px 5px; border: 1px solid #111; background: #f1f1f1; white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; }
        .psy-table tr:nth-child(even) td { background: #dcdcdc; }
        .psy-table tr:hover td { background: #d8edf5; }
        .psy-table td:nth-child(1), .psy-table td:nth-child(2), .psy-table td:nth-child(3), .psy-table td:nth-child(4), .psy-table td:nth-child(5), .psy-table td:nth-child(6) { text-align: left; }
        .psy-table .team { min-width: 170px; }
        .psy-table .linkish { color: #0645ad; text-decoration: underline; }
        .psy-empty { min-height: 260px; display: grid; place-items: center; padding: 24px; color: rgba(255,255,255,.75); background: #101010; font: 800 13px/1.35 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; text-align: center; }
        @media (max-width: 860px) { .psy-stats-shell { padding: 6px 6px calc(var(--profile-tabs-h, 72px) + 12px); } .psy-table { font-size: 11px; } .psy-table th, .psy-table td { padding: 3px 4px; } }
      `}</style>
    </div>
  );
}
