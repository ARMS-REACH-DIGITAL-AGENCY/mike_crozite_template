// src/components/yatstats/funzone/SeasonTable.tsx
// Renders a season-by-season batting or pitching table with career totals row.

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: any, decimals = 0): string {
  if (v === null || v === undefined || v === '' || v === '--') return '--';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (decimals > 0) return n.toFixed(decimals);
  return String(n);
}

function fmtAvg(v: any): string {
  if (v === null || v === undefined || v === '' || v === '--') return '--';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toFixed(3).replace(/^0/, '');
}

function levelClass(lv: string): string {
  return `level-${(lv || '').toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

// ── Batting Table ────────────────────────────────────────────────────────────

interface BattingSeason {
  year: string | number;
  team_name?: string;
  level?: string;
  g?: any; ab?: any; r?: any; h?: any;
  '2b'?: any; '3b'?: any; hr?: any; rbi?: any;
  sb?: any; bb?: any; so?: any;
  avg?: any; obp?: any; slg?: any; ops?: any;
}

export function BattingSeasonTable({
  seasons,
  careerTotals,
}: {
  seasons: BattingSeason[];
  careerTotals: any;
}) {
  if (seasons.length === 0) return null;
  return (
    <div className="log-section">
      <div className="table-wrap" style={{ borderRadius: '6px' }}>
        <table className="season-table career-log">
          <thead>
            <tr>
              <th>YEAR</th><th>TEAM</th><th>LVL</th><th>G</th><th>AB</th><th>H</th>
              <th>2B</th><th>3B</th><th>HR</th><th>RBI</th><th>R</th><th>SB</th>
              <th>BB</th><th>SO</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((b, i) => (
              <tr key={i} className={`level-row ${levelClass(b.level || '')}`}>
                <td className="year-cell">{b.year}</td>
                <td className="team-cell">{b.team_name || '--'}</td>
                <td>{(b.level || '--').toUpperCase()}</td>
                <td>{fmt(b.g)}</td><td>{fmt(b.ab)}</td><td>{fmt(b.h)}</td>
                <td>{fmt(b['2b'])}</td><td>{fmt(b['3b'])}</td><td>{fmt(b.hr)}</td>
                <td>{fmt(b.rbi)}</td><td>{fmt(b.r)}</td><td>{fmt(b.sb)}</td>
                <td>{fmt(b.bb)}</td><td>{fmt(b.so)}</td>
                <td>{fmtAvg(b.avg)}</td><td>{fmtAvg(b.obp)}</td>
                <td>{fmtAvg(b.slg)}</td><td>{fmtAvg(b.ops)}</td>
              </tr>
            ))}
            {careerTotals && (
              <tr className="career-totals-row">
                <td className="year-cell">CAREER</td>
                <td>&mdash;</td><td>&mdash;</td>
                <td>{fmt(careerTotals.g)}</td><td>{fmt(careerTotals.ab)}</td><td>{fmt(careerTotals.h)}</td>
                <td>{fmt(careerTotals['2b'])}</td><td>{fmt(careerTotals['3b'])}</td><td>{fmt(careerTotals.hr)}</td>
                <td>{fmt(careerTotals.rbi)}</td><td>{fmt(careerTotals.r)}</td><td>{fmt(careerTotals.sb)}</td>
                <td>{fmt(careerTotals.bb)}</td><td>{fmt(careerTotals.so)}</td>
                <td>{fmtAvg(careerTotals.avg)}</td><td>{fmtAvg(careerTotals.obp)}</td>
                <td>{fmtAvg(careerTotals.slg)}</td><td>{fmtAvg(careerTotals.ops)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pitching Table ───────────────────────────────────────────────────────────

interface PitchingSeason {
  year: string | number;
  team_name?: string;
  level?: string;
  g?: any; gs?: any; w?: any; l?: any;
  saves?: any; ip?: any; er?: any; ko?: any;
  bb?: any; era?: any; whip?: any; k9?: any; kbb?: any;
}

export function PitchingSeasonTable({
  seasons,
  careerTotals,
}: {
  seasons: PitchingSeason[];
  careerTotals: any;
}) {
  if (seasons.length === 0) return null;
  return (
    <div className="log-section">
      <div className="table-wrap" style={{ borderRadius: '6px' }}>
        <table className="season-table career-log">
          <thead>
            <tr>
              <th>YEAR</th><th>TEAM</th><th>LVL</th><th>G</th><th>GS</th><th>W</th><th>L</th>
              <th>SV</th><th>IP</th><th>ER</th><th>KO</th><th>BB</th>
              <th>ERA</th><th>WHIP</th><th>K/9</th><th>K/BB</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((p, i) => (
              <tr key={i} className={`level-row ${levelClass(p.level || '')}`}>
                <td className="year-cell">{p.year}</td>
                <td className="team-cell">{p.team_name || '--'}</td>
                <td>{(p.level || '--').toUpperCase()}</td>
                <td>{fmt(p.g)}</td><td>{fmt(p.gs)}</td><td>{fmt(p.w)}</td><td>{fmt(p.l)}</td>
                <td>{fmt(p.saves)}</td><td>{fmt(p.ip, 1)}</td><td>{fmt(p.er)}</td>
                <td>{fmt(p.ko)}</td><td>{fmt(p.bb)}</td>
                <td>{fmt(p.era, 2)}</td><td>{fmt(p.whip, 2)}</td>
                <td>{fmt(p.k9, 2)}</td><td>{fmt(p.kbb, 2)}</td>
              </tr>
            ))}
            {careerTotals && (
              <tr className="career-totals-row">
                <td className="year-cell">CAREER</td>
                <td>&mdash;</td><td>&mdash;</td>
                <td>{fmt(careerTotals.g)}</td><td>{fmt(careerTotals.gs)}</td>
                <td>{fmt(careerTotals.w)}</td><td>{fmt(careerTotals.l)}</td>
                <td>{fmt(careerTotals.saves)}</td><td>{fmt(careerTotals.ip, 1)}</td>
                <td>{fmt(careerTotals.er)}</td><td>{fmt(careerTotals.ko)}</td>
                <td>{fmt(careerTotals.bb)}</td>
                <td>{fmt(careerTotals.era, 2)}</td><td>{fmt(careerTotals.whip, 2)}</td>
                <td>{fmt(careerTotals.k9, 2)}</td><td>{fmt(careerTotals.kbb, 2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
