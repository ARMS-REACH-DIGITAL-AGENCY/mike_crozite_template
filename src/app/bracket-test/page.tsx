// Live October test of the bracket: 6 brackets of 16, Round 1 Game 1
// (Oct 5-11), scored from real game lines. Private test page - not linked
// anywhere, kept out of search.
import type { Metadata } from 'next';
import { loadTestBrackets, TEST_WEEK } from '@/lib/bracket/testLive';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Bracket live test | YAT?STATS', robots: { index: false, follow: false } };

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S', 'WK', 'W-L'];

export default async function BracketTestPage() {
  const { brackets, lines, asOf, today } = await loadTestBrackets();
  return (
    <main className="bt">
      <header>
        <h1>Bracket live test · {TEST_WEEK.label}</h1>
        <p>
          Mon Oct 5 – Sun Oct 11, 2026 · day {today + 1} of 7 · {lines} real game lines so far · scored with the bracket engine (raw mode) ·
          updated {new Date(asOf).toLocaleString('en-US', { timeZone: 'America/Phoenix', dateStyle: 'medium', timeStyle: 'short' })} AZ
        </p>
      </header>
      {brackets.map((games, b) => (
        <section key={b}>
          <h2>Bracket {b + 1}</h2>
          {games.map((g, i) => {
            const rows: [typeof g.home, number[], number][] = [
              [g.away, g.result.innings.map((x) => x.away), g.result.away],
              [g.home, g.result.innings.map((x) => x.home), g.result.home],
            ];
            return (
              <div className="bt-game" key={i}>
                <table>
                  <thead><tr><th />{DAYS.map((d, k) => <th key={k} className={k === today ? 'now' : ''}>{d}</th>)}<th>R</th></tr></thead>
                  <tbody>
                    {rows.map(([[h, name, seed], inn, r]) => (
                      <tr key={h}>
                        <td className="nm"><small>{seed}</small> {name}</td>
                        {inn.map((v, k) => <td key={k} className={k > 7 || k <= today || k === 7 ? '' : 'later'}>{k < 7 && k > today ? '' : v}</td>)}
                        <td className="r">{r}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <details>
                  <summary>Who played</summary>
                  {[g.away, g.home].map(([h, name]) => (
                    <div key={h} className="who"><b>{name}</b>{(g.players[h] || []).length === 0 ? <span> – no games yet</span> : (
                      <ul>{g.players[h].sort((a, c) => a.day - c.day).map((p, k) => <li key={k}>{DAYS[p.day]} · {p.name} ({p.team}) · {p.type === 'pitching' ? 'P ' : ''}{p.line}</li>)}</ul>
                    )}</div>
                  ))}
                </details>
              </div>
            );
          })}
        </section>
      ))}
      <style>{`
        .bt{background:#0d0d0d;color:#eee;min-height:100vh;padding:16px;font:14px/1.4 system-ui,sans-serif}
        .bt h1{font-size:20px;margin:0 0 4px} .bt header p{color:#aaa;margin:0 0 16px;font-size:13px}
        .bt section{margin:0 0 28px} .bt h2{font-size:16px;color:#d2b45c;margin:0 0 8px;border-bottom:1px solid #333;padding-bottom:4px}
        .bt section{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:10px;align-items:start} .bt h2{grid-column:1/-1}
        .bt-game{background:#181818;border:1px solid #2a2a2a;border-radius:6px;padding:8px}
        .bt table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
        .bt th,.bt td{padding:3px 4px;text-align:center;font-size:12px} .bt th{color:#888;font-weight:600} .bt th.now{color:#d2b45c}
        .bt td.nm{text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px} .bt td.nm small{color:#888;margin-right:4px}
        .bt td.r{font-weight:700;color:#fff;border-left:1px solid #333} .bt td.later{color:#444}
        .bt details{margin-top:6px;font-size:12px;color:#bbb} .bt summary{cursor:pointer;color:#888}
        .bt .who{margin:4px 0} .bt .who ul{margin:2px 0 0 16px;padding:0}
        @media (max-width:480px){.bt section{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}
