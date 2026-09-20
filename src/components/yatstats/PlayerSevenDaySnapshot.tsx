import { getPlayerGameLogs, getTeamSchedule, getFlipCardTransactionStatus, getMlbTeamLogoMap } from '@/lib/db';
import { toISODate, mlbTeamLogoUrl, mlbTeamAbbreviation } from '@/lib/playerUtils';

type GameLogRow = {
  source_game_id?: string | null;
  game_date?: string | null;
  opponent_name?: string | null;
  home_away?: string | null;
  line_summary?: string | null;
};

type ScheduleRow = {
  game_date?: string | null;
  game_time_utc?: string | null;
  status?: string | null;
  venue_name?: string | null;
  opponent?: string | null;
  is_home?: boolean | null;
  home_away?: string | null;
  home_team_id?: number | null;
  away_team_id?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  game_pk?: number | string | null;
  result?: string | null; // precomputed "W 6-3" / "L 2-5" / "T 4-4" from getTeamSchedule
};

type ResultClass = 'win' | 'loss' | 'tie' | 'live' | 'time' | 'ppd';

type SnapshotItem =
  | {
      kind: 'game';
      iso: string;
      isHome: boolean;
      logoUrl: string | null;
      matchup: string;
      venue: string;
      resultLine: string;
      resultClass: ResultClass;
      subLine: string;
    }
  | { kind: 'offday'; iso: string }
  | { kind: 'unknown'; iso: string };

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDate(d);
}

function formatGameTime(gameTimeUtc: unknown): string {
  if (!gameTimeUtc) return 'TBD';
  const d = new Date(String(gameTimeUtc));
  if (Number.isNaN(d.getTime())) return 'TBD';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(d);
}

function buildGameItem(
  iso: string,
  game: ScheduleRow,
  logsByGamePk: Map<string, GameLogRow[]>,
  mlbTeamLogoMap: Map<string, string>
): SnapshotItem {
  const isHome = game.is_home === true || game.home_away === 'Home';
  const opponentRawId = isHome ? game.away_team_id : game.home_team_id;
  const logoUrl = opponentRawId ? mlbTeamLogoUrl(mlbTeamLogoMap, opponentRawId) : null;
  const abbr = mlbTeamAbbreviation(opponentRawId);
  const opponentLabel = abbr || String(game.opponent || 'TBD').trim();
  const matchup = `${isHome ? 'vs' : 'at'} ${opponentLabel}`;

  const status = String(game.status || '').trim();
  const gamePk = String(game.game_pk || '').trim();
  const logRows = gamePk ? logsByGamePk.get(gamePk) : undefined;
  const subLineFromLog = logRows && logRows.length
    ? logRows.map((r) => r.line_summary || '').filter(Boolean).join(' | ')
    : '';

  let resultLine = '';
  let subLine = subLineFromLog;
  let resultClass: ResultClass = 'time';

  if (game.result) {
    resultLine = game.result;
    resultClass = game.result.startsWith('W') ? 'win' : game.result.startsWith('L') ? 'loss' : 'tie';
  } else if (/postpon|cancel|suspend|delay/i.test(status)) {
    resultClass = 'ppd';
    resultLine = /postpon/i.test(status)
      ? 'PPD'
      : /cancel/i.test(status)
      ? 'CANC'
      : /suspend/i.test(status)
      ? 'SUSP'
      : 'DELAY';
    subLine = status;
  } else if (/in progress|live|manager challenge|review/i.test(status)) {
    resultClass = 'live';
    resultLine = 'LIVE';
    if (game.home_score != null && game.away_score != null) {
      const us = isHome ? game.home_score : game.away_score;
      const them = isHome ? game.away_score : game.home_score;
      subLine = `${us}-${them}`;
    }
  } else {
    resultClass = 'time';
    resultLine = formatGameTime(game.game_time_utc);
  }

  return {
    kind: 'game',
    iso,
    isHome,
    logoUrl,
    matchup,
    venue: game.venue_name || '',
    resultLine,
    resultClass,
    subLine,
  };
}

async function getSevenDayWindow(playerId: string): Promise<SnapshotItem[]> {
  const today = isoDate(new Date());

  const [transactionStatus, gameLogs, mlbTeamLogoMap] = await Promise.all([
    getFlipCardTransactionStatus(playerId),
    getPlayerGameLogs(playerId),
    getMlbTeamLogoMap(),
  ]);

  // current_team_source_team_id is the raw MLB Stats API team id (e.g. 147
  // for the Yankees); v_team_schedule_feed is keyed by tbc_teamid (Yankees
  // there is 20) - same crosswalk used for opponent logos translates it.
  const rawMlbTeamId = String((transactionStatus as any)?.current_team_source_team_id || '').trim();
  const teamId = rawMlbTeamId ? mlbTeamLogoMap.get(rawMlbTeamId) || '' : '';

  const schedule = teamId ? await getTeamSchedule(teamId) : [];
  const hasSchedule = Boolean(teamId) && (schedule as ScheduleRow[]).length > 0;

  const scheduleByDate = new Map<string, ScheduleRow[]>();
  for (const row of schedule as ScheduleRow[]) {
    const d = toISODate(row.game_date);
    if (!d) continue;
    const bucket = scheduleByDate.get(d) ?? [];
    bucket.push(row);
    scheduleByDate.set(d, bucket);
  }

  const logsByGamePk = new Map<string, GameLogRow[]>();
  for (const row of gameLogs as GameLogRow[]) {
    const key = String(row.source_game_id || '').trim();
    if (!key) continue;
    const bucket = logsByGamePk.get(key) ?? [];
    bucket.push(row);
    logsByGamePk.set(key, bucket);
  }

  const items: SnapshotItem[] = [];

  for (let offset = -3; offset <= 3; offset++) {
    const iso = addDays(today, offset);
    const gamesForDate = (scheduleByDate.get(iso) || [])
      .slice()
      .sort((a, b) => String(a.game_time_utc || '').localeCompare(String(b.game_time_utc || '')));

    if (gamesForDate.length === 0) {
      items.push({ kind: hasSchedule ? 'offday' : 'unknown', iso });
      continue;
    }

    for (const game of gamesForDate) {
      items.push(buildGameItem(iso, game, logsByGamePk, mlbTeamLogoMap));
    }
  }

  return items;
}

/**
 * Lives inside FunZone's GAME LOG tab panel (passed in as a prop from
 * PlayerCardBack, since this is an async Server Component and FunZone is a
 * Client Component) - not a standalone section above the tab strip, and not
 * its own CTA (FunZone's YatiCta strip already says "See X's full season
 * schedule & game log..." for this tab). Typography matches the rest of
 * FunZone: Bebas Neue for headlines, Oswald for labels/body - no script font.
 */
export default async function PlayerSevenDaySnapshot({
  playerId,
  profileHref,
}: {
  playerId: string;
  displayName: string;
  profileHref: string;
}) {
  if (!playerId) return null;

  const items = await getSevenDayWindow(playerId);
  const hasAnyRealData = items.some((it) => it.kind !== 'unknown');
  if (!hasAnyRealData) return null;

  const todayIso = isoDate(new Date());

  return (
    <div className="yat-snap" aria-label="7-Day Snapshot - schedule and game log">
      <div className="yat-snap-title">7-Day Snapshot</div>

      <div className="yat-snap-rows">
        {items.map((item, idx) => {
          const d = new Date(`${item.iso}T00:00:00Z`);
          const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
          const dayNum = d.getUTCDate();
          const dow = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();

          return (
            <a
              className={`yat-snap-row${item.iso === todayIso ? ' yat-snap-row-today' : ''}`}
              href={profileHref}
              key={`${item.iso}-${idx}`}
            >
              <div className="yat-snap-date">
                <span className="yat-snap-date-mon">{mon}</span>
                <span className="yat-snap-date-day">{dayNum}</span>
                <span className="yat-snap-date-dow">{dow}</span>
              </div>

              {item.kind === 'game' ? (
                <>
                  <div className="yat-snap-logo">
                    {item.logoUrl && <img src={item.logoUrl} alt="" loading="lazy" />}
                  </div>

                  <div className="yat-snap-mid">
                    <div className="yat-snap-matchup">{item.matchup}</div>
                    {item.venue && <div className="yat-snap-venue">{item.venue}</div>}
                  </div>

                  <div className="yat-snap-result">
                    <div className={`yat-snap-score yat-snap-score-${item.resultClass}`}>{item.resultLine}</div>
                    {item.subLine && <div className="yat-snap-sub">{item.subLine}</div>}
                  </div>

                  <div className="yat-snap-homeaway">
                    <i className={item.isHome ? 'ri-home-4-line' : 'ri-flight-takeoff-line'} aria-hidden="true" />
                  </div>
                </>
              ) : item.kind === 'offday' ? (
                <div className="yat-snap-offday">Off Day</div>
              ) : (
                <div className="yat-snap-offday yat-snap-unknown">--</div>
              )}
            </a>
          );
        })}
      </div>

      <style>{`
        .yat-snap{
          display:flex;
          flex-direction:column;
          height:100%;
          min-height:0;
          background:linear-gradient(180deg,#f7f3ea,#ece5d5);
          border:1px solid rgba(30,22,14,0.18);
          border-radius:clamp(4px,1.2cqi,8px);
          overflow:hidden;
          padding:clamp(5px,1.8cqi,10px);
        }
        .yat-snap-title{
          text-align:center;
          font:700 clamp(9px,3cqi,14px)/1 "Bebas Neue",sans-serif;
          letter-spacing:.1em;
          text-transform:uppercase;
          color:#3a2f24;
          padding-bottom:clamp(4px,1.4cqi,8px);
          margin-bottom:clamp(4px,1.4cqi,8px);
          border-bottom:1px solid rgba(30,22,14,0.16);
        }
        .yat-snap-rows{
          display:flex;
          flex-direction:column;
          gap:clamp(3px,1.1cqi,6px);
          min-height:0;
          overflow:hidden;
        }
        .yat-snap-row{
          display:grid;
          grid-template-columns:auto auto 1fr auto auto;
          align-items:center;
          gap:clamp(4px,1.4cqi,9px);
          text-decoration:none;
          color:inherit;
          background:rgba(255,255,255,0.72);
          border:1px solid rgba(30,22,14,0.10);
          border-radius:clamp(5px,1.6cqi,9px);
          padding:clamp(3px,1.2cqi,6px) clamp(5px,1.6cqi,9px);
          box-shadow:0 1px 2px rgba(0,0,0,0.06);
          min-width:0;
        }
        .yat-snap-row-today{
          background:rgba(255,255,255,0.94);
          border-color:rgba(30,22,14,0.24);
        }
        .yat-snap-date{
          display:flex;
          flex-direction:column;
          align-items:center;
          line-height:1;
          min-width:2.1em;
        }
        .yat-snap-date-mon, .yat-snap-date-dow{
          font:700 clamp(5.5px,1.7cqi,7.5px)/1 Oswald,sans-serif;
          letter-spacing:.05em;
          color:#8a7c68;
        }
        .yat-snap-date-day{
          font:700 clamp(11px,3.6cqi,17px)/1.05 "Bebas Neue",sans-serif;
          color:#17120c;
        }
        .yat-snap-logo{
          width:clamp(18px,5.5cqi,26px);
          height:clamp(18px,5.5cqi,26px);
          flex:0 0 auto;
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .yat-snap-logo img{
          width:100%;
          height:100%;
          object-fit:contain;
        }
        .yat-snap-mid{
          min-width:0;
          display:flex;
          flex-direction:column;
          gap:1px;
        }
        .yat-snap-matchup{
          font:700 clamp(7px,2.3cqi,10.5px)/1.15 Oswald,sans-serif;
          letter-spacing:.02em;
          text-transform:uppercase;
          color:#221a12;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-venue{
          font:400 clamp(6px,1.9cqi,8.5px)/1.15 Oswald,sans-serif;
          color:#8a7c68;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-result{
          text-align:right;
          min-width:0;
          display:flex;
          flex-direction:column;
          gap:1px;
        }
        .yat-snap-score{
          font:700 clamp(7.5px,2.5cqi,11px)/1.1 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.02em;
          white-space:nowrap;
        }
        .yat-snap-score-win{ color:#1c7a3e; }
        .yat-snap-score-loss{ color:#b4232c; }
        .yat-snap-score-tie{ color:#4a4038; }
        .yat-snap-score-live{ color:#b4232c; }
        .yat-snap-score-time{ color:#221a12; }
        .yat-snap-score-ppd{ color:#8a7c68; }
        .yat-snap-sub{
          font:400 clamp(6px,1.9cqi,8.5px)/1.15 Oswald,sans-serif;
          color:#6b5d4d;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-homeaway{
          display:flex;
          align-items:center;
          justify-content:center;
          width:clamp(12px,3.6cqi,16px);
          flex:0 0 auto;
          color:#8a7c68;
          font-size:clamp(10px,3.2cqi,14px);
        }
        .yat-snap-offday{
          grid-column:2 / -1;
          text-align:center;
          font:700 clamp(7px,2.3cqi,10px)/1 Oswald,sans-serif;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:#a89a86;
        }
        .yat-snap-unknown{ color:#c2b9ae; }
      `}</style>
    </div>
  );
}
