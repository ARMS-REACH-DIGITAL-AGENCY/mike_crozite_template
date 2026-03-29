// src/components/yatstats/profile/GameLogFeed.tsx
// Renders the game log feed: chronological schedule with per-game stat lines.

interface GameLogFeedProps {
  teamSchedule: any[];
  batStatsByDate: Map<string, any>;
  pitStatsByDate: Map<string, any>;
  isPitcher: boolean;
  ctxTeam: string;
  currentTeamId: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(raw: any): string {
  if (!raw) return '?';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function homeAway(raw: any): 'H' | 'A' {
  const v = String(raw || '').toLowerCase();
  return (v === 'h' || v === 'home') ? 'H' : 'A';
}

function hitterLine(row: any): string {
  const parts: string[] = [];
  const h = Number(row.h ?? row.hits ?? 0);
  const ab = Number(row.ab ?? 0);
  if (ab > 0) parts.push(`${h}-${ab}`);
  const dbl = Number(row.dbl ?? row["2b"] ?? 0);
  const tpl = Number(row.tpl ?? row["3b"] ?? 0);
  const hr = Number(row.hr ?? 0);
  const rbi = Number(row.rbi ?? 0);
  const r = Number(row.r ?? row.runs ?? 0);
  const so = Number(row.so ?? row.k ?? 0);
  const bb = Number(row.bb ?? 0);
  const sf = Number(row.sf ?? 0);
  const sb = Number(row.sb ?? 0);
  const hits: string[] = [];
  if (dbl) hits.push(dbl > 1 ? `${dbl} 2B` : '2B');
  if (tpl) hits.push(tpl > 1 ? `${tpl} 3B` : '3B');
  if (hr) hits.push(hr > 1 ? `${hr} HR` : 'HR');
  if (rbi) hits.push(rbi === 1 ? 'RBI' : `${rbi} RBI`);
  if (r) hits.push(r === 1 ? 'R' : `${r} R`);
  if (so) hits.push(so === 1 ? 'SO' : `${so} SO`);
  if (bb) hits.push(bb === 1 ? 'BB' : `${bb} BB`);
  if (sf) hits.push(sf === 1 ? 'SF' : `${sf} SF`);
  if (sb) hits.push(sb === 1 ? 'SB' : `${sb} SB`);
  if (hits.length) parts.push(hits.join(', '));
  return parts.join(' | ');
}

function pitcherLine(row: any): string {
  const parts: string[] = [];
  const ip = Number(row.ip ?? 0);
  const h = Number(row.h ?? row.hits ?? 0);
  const r = Number(row.r ?? row.runs ?? 0);
  const er = Number(row.er ?? 0);
  const k = Number(row.ko ?? row.so ?? row.k ?? 0);
  const bb = Number(row.bb ?? 0);
  if (ip) parts.push(`${ip.toFixed(1)} IP`);
  if (h) parts.push(`${h} H`);
  if (r) parts.push(`${r} R`);
  if (er) parts.push(`${er} ER`);
  if (k) parts.push(`${k} K`);
  if (bb) parts.push(`${bb} BB`);
  const dec = row.decision ? String(row.decision).toUpperCase() : '';
  if (dec) parts.push(dec);
  return parts.join(', ');
}

function resultInfo(row: any): { label: string; cls: string } {
  const res = String(row.result || '').toUpperCase().trim();
  if (!res) return { label: '', cls: '' };
  if (res.startsWith('W')) return { label: res, cls: 'win' };
  if (res.startsWith('L')) return { label: res, cls: 'loss' };
  return { label: res, cls: '' };
}

function statusBadge(row: any): string | null {
  const s = String(row.status || '').toUpperCase().trim();
  if (!s || s === 'SCHEDULED' || s === 'FINAL') return null;
  return s;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GameLogFeed({
  teamSchedule,
  batStatsByDate,
  pitStatsByDate,
  isPitcher,
  ctxTeam,
  currentTeamId,
}: GameLogFeedProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (teamSchedule.length === 0) {
    return (
      <div className="gl-feed">
        <div className="gl-feed-header">
          <span className="gl-feed-title"><i className="ri-calendar-line" />GAME LOG</span>
          {ctxTeam && <span className="gl-feed-team">{ctxTeam}</span>}
        </div>
        <div className="gl-empty">
          {currentTeamId
            ? 'Schedule not yet available for this team.'
            : 'No active team found. Check back once the season schedule is loaded.'}
        </div>
      </div>
    );
  }

  return (
    <div className="gl-feed">
      <div className="gl-feed-header">
        <span className="gl-feed-title"><i className="ri-calendar-line" />GAME LOG</span>
        {ctxTeam && <span className="gl-feed-team">{ctxTeam}</span>}
      </div>
      {teamSchedule.map((game: any, i: number) => {
        const isoDate = game.game_date ? String(game.game_date).slice(0, 10) : null;
        const gameDate = isoDate ? new Date(isoDate + 'T12:00:00') : null;
        const isPast = gameDate ? gameDate < today : false;
        const isToday = gameDate ? gameDate.getTime() === today.getTime() : false;
        const ha = homeAway(game.home_away);
        const opp = game.opponent || game.opponent_name || game.opp || '?';
        const matchup = ha === 'A' ? `@ ${opp}` : `vs ${opp}`;
        const dateLabel = fmtDate(game.game_date);
        const batRow = isoDate ? batStatsByDate.get(isoDate) : null;
        const pitRow = isoDate ? pitStatsByDate.get(isoDate) : null;
        const statLine = isPast
          ? (isPitcher ? (pitRow ? pitcherLine(pitRow) : '') : (batRow ? hitterLine(batRow) : ''))
          : '';
        const res = resultInfo(game);
        const liveStatus = statusBadge(game);
        const rowClass = `gl-row${isToday ? ' gl-row-today' : isPast ? ' gl-row-past' : ''}`;
        return (
          <div key={i} className={rowClass}>
            <span className="gl-date">{dateLabel}</span>
            <span className="gl-matchup">{matchup}</span>
            {res.label && <span className={`gl-result ${res.cls}`}>{res.label}</span>}
            {statLine && <span className="gl-stat-line">{statLine}</span>}
            {liveStatus && <span className={`gl-status${liveStatus === 'IN PROGRESS' || liveStatus === 'LIVE' ? ' live' : ''}`}>{liveStatus}</span>}
          </div>
        );
      })}
    </div>
  );
}
