import { getRecentSportsBlazeMlbGamelogs } from '@/lib/sportsblazeMlb';

type GameLogRow = {
  yatstats_playerid: string;
  sportsblaze_player_id: string;
  sportsblaze_game_id: string;
  season_year: number;
  season_type?: string | null;
  game_date?: string | null;
  game_status?: string | null;
  position?: string | null;
  started?: boolean | null;
  away_team_name?: string | null;
  home_team_name?: string | null;
  batting_summary?: string | null;
  stats?: Record<string, unknown> | null;
};

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

function opponentLine(row: GameLogRow) {
  const away = row.away_team_name || '';
  const home = row.home_team_name || '';
  if (!away && !home) return '';
  return `${away} @ ${home}`.trim();
}

function statSummary(row: GameLogRow) {
  const summary = String(row.batting_summary || '').trim();
  if (summary) return summary;

  const stats = row.stats || {};
  const ab = stats.batting_at_bats;
  const h = stats.batting_hits;
  const rbi = stats.batting_rbi;
  const r = stats.batting_runs;

  const parts: string[] = [];
  if (h !== undefined && ab !== undefined) parts.push(`${h}-${ab}`);
  if (rbi !== undefined && Number(rbi) > 0) parts.push(`${rbi} RBI`);
  if (r !== undefined && Number(r) > 0) parts.push(`${r} R`);
  return parts.join(' | ') || 'Game result logged';
}

export default async function SportsBlazeRecentResults({ playerId }: { playerId: string }) {
  if (!playerId) return null;

  const rows = (await getRecentSportsBlazeMlbGamelogs(playerId, 3)) as GameLogRow[];
  if (!rows.length) return null;

  return (
    <section className="sb-recent" aria-label="Recent YAT results">
      <div className="sb-header">
        <span className="sb-kicker">LAST YAT</span>
        <span className="sb-source">SportsBlaze</span>
      </div>
      <div className="sb-lines">
        {rows.map((row) => (
          <div className="sb-line" key={`${row.sportsblaze_player_id}-${row.sportsblaze_game_id}`}>
            <div className="sb-date">{formatDate(row.game_date)}</div>
            <div className="sb-main">
              <div className="sb-summary">{statSummary(row)}</div>
              <div className="sb-meta">
                {[opponentLine(row), row.position, row.started === true ? 'START' : row.started === false ? 'OFF BENCH' : '']
                  .filter(Boolean)
                  .join(' • ')}
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .sb-recent{ flex:0 0 auto; background:rgba(22,18,14,.92); border-top:1px solid rgba(255,255,255,.16); border-bottom:1px solid rgba(0,0,0,.35); color:#fff; padding:clamp(4px,1.7cqi,9px) clamp(5px,2cqi,11px); }
        .sb-header{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:clamp(3px,1.2cqi,6px); }
        .sb-kicker{ font:800 clamp(7px,2.4cqi,11px)/1 Oswald,sans-serif; letter-spacing:.14em; color:#f6d36b; text-transform:uppercase; }
        .sb-source{ font:600 clamp(5px,1.8cqi,8px)/1 Oswald,sans-serif; letter-spacing:.1em; color:rgba(255,255,255,.55); text-transform:uppercase; }
        .sb-lines{ display:flex; flex-direction:column; gap:clamp(2px,.8cqi,5px); }
        .sb-line{ display:grid; grid-template-columns:clamp(28px,10cqi,44px) 1fr; gap:clamp(4px,1.5cqi,8px); align-items:start; min-width:0; }
        .sb-date{ font:800 clamp(6px,2cqi,9px)/1.15 Oswald,sans-serif; letter-spacing:.08em; color:#f6d36b; white-space:nowrap; padding-top:1px; }
        .sb-main{ min-width:0; }
        .sb-summary{ font:800 clamp(7px,2.5cqi,12px)/1.15 Oswald,sans-serif; letter-spacing:.04em; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sb-meta{ margin-top:1px; font:500 clamp(5px,1.8cqi,8px)/1.15 Oswald,sans-serif; letter-spacing:.05em; color:rgba(255,255,255,.62); text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      `}</style>
    </section>
  );
}
