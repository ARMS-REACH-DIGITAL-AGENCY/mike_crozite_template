import { getPlayerGameLogs, getTeamSchedule, getFlipCardTransactionStatus, getTeamIdMap } from '@/lib/db';
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
  teamIdMap: Map<string, string>
): SnapshotItem {
  const isHome = game.is_home === true || game.home_away === 'Home';
  const opponentRawId = isHome ? game.away_team_id : game.home_team_id;
  const logoUrl = opponentRawId ? mlbTeamLogoUrl(teamIdMap, opponentRawId) : null;
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

  const [transactionStatus, gameLogs, teamIdMap] = await Promise.all([
    getFlipCardTransactionStatus(playerId),
    getPlayerGameLogs(playerId),
    getTeamIdMap(),
  ]);

  // current_team_source_team_id is only a raw MLB Stats API id needing
  // translation through teamIdMap when current_team_source is 'mlb_api'
  // (a minor leaguer's own affiliate id, e.g. Somerset Patriots, works the
  // same way as an MLB roster player's). The college/HS tbc_* pipelines
  // store the already-correct tbc_teamid in this same field - translating
  // that through a pro-only crosswalk would just fail to find it, which
  // silently broke every college player's snapshot until this check existed.
  const currentTeamSource = String((transactionStatus as any)?.current_team_source || '').trim();
  const rawTeamId = String((transactionStatus as any)?.current_team_source_team_id || '').trim();
  const teamId = rawTeamId
    ? currentTeamSource === 'mlb_api'
      ? teamIdMap.get(rawTeamId) || ''
      : rawTeamId
    : '';

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
      items.push(buildGameItem(iso, game, logsByGamePk, teamIdMap));
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

  const todayIso = isoDate(new Date());

  if (!hasAnyRealData) {
    return (
      <div className="yat-snap yat-snap-empty" aria-label="7-Day Snapshot - schedule and game log">
        <div className="yat-snap-title">7-Day Snapshot</div>
        <div className="yat-snap-empty-body">
          <i className="ri-calendar-line" aria-hidden="true" />
          <p>Schedule will appear here once available.</p>
        </div>
        <style>{`
          .yat-snap-empty{ justify-content:center; align-items:center; }
          .yat-snap-empty .yat-snap-title{ align-self:stretch; }
          .yat-snap-empty-body{
            flex:1;
            min-height:0;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            gap:clamp(3px,1.2cqi,7px);
            color:#8a7c68;
            text-align:center;
          }
          .yat-snap-empty-body i{ font-size:clamp(14px,5cqi,24px); }
          .yat-snap-empty-body p{
            margin:0;
            font:400 clamp(6.5px,2.1cqi,9.5px)/1.3 Oswald,sans-serif;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="yat-snap" aria-label="7-Day Snapshot - schedule and game log">
      <div className="yat-snap-title">7-Day Snapshot</div>

      <div className="yat-snap-rows">
        {items.map((item, idx) => {
          const isToday = item.iso === todayIso;
          const d = new Date(`${item.iso}T00:00:00Z`);
          const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
          const dayNum = d.getUTCDate();
          const dateLabel = isToday ? 'TODAY' : `${mon} ${dayNum}`;

          return (
            <a
              className={`yat-snap-row${isToday ? ' yat-snap-row-today' : ''}`}
              href={profileHref}
              key={`${item.iso}-${idx}`}
            >
              <div className={`yat-snap-date${isToday ? ' yat-snap-date-today' : ''}`}>{dateLabel}</div>

              {item.kind === 'game' ? (
                <>
                  <div className="yat-snap-team">
                    {item.logoUrl && <img src={item.logoUrl} alt="" loading="lazy" />}
                    <span>{item.matchup}</span>
                  </div>

                  <div className={`yat-snap-score yat-snap-score-${item.resultClass}`}>{item.resultLine}</div>

                  <div className="yat-snap-statline">{item.subLine || '-'}</div>
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
          overflow:hidden;
          background:linear-gradient(180deg,#f7f3ea,#ece5d5);
          border:1px solid rgba(30,22,14,0.18);
          border-radius:clamp(4px,1.2cqi,8px);
          padding:clamp(3px,1.2cqi,7px);
        }
        .yat-snap-title{
          flex:0 0 auto;
          text-align:center;
          font:700 clamp(8px,2.8cqi,14px)/1 "Bebas Neue",sans-serif;
          letter-spacing:.1em;
          text-transform:uppercase;
          color:#3a2f24;
          padding-bottom:clamp(2px,.8cqi,5px);
          margin-bottom:clamp(2px,.8cqi,5px);
          border-bottom:1px solid rgba(30,22,14,0.16);
        }
        .yat-snap-rows{
          flex:1;
          min-height:0;
          display:flex;
          flex-direction:column;
          gap:clamp(1px,.5cqi,3px);
        }
        .yat-snap-row{
          flex:1;
          min-height:0;
          display:grid;
          grid-template-columns:auto auto auto 1fr;
          align-items:center;
          gap:clamp(5px,1.6cqi,10px);
          text-decoration:none;
          color:inherit;
          background:rgba(255,255,255,0.72);
          border:1px solid rgba(30,22,14,0.10);
          border-radius:clamp(3px,1cqi,6px);
          padding:clamp(2px,.9cqi,6px) clamp(6px,1.6cqi,10px);
          box-shadow:0 1px 2px rgba(0,0,0,0.06);
          min-width:0;
          overflow:hidden;
        }
        .yat-snap-row-today{
          background:rgba(255,255,255,0.94);
          border-color:rgba(30,22,14,0.24);
        }
        .yat-snap-date{
          font:700 clamp(8px,2.8cqi,13px)/1 "Bebas Neue",sans-serif;
          letter-spacing:.04em;
          color:#17120c;
          white-space:nowrap;
        }
        .yat-snap-date-today{
          color:#8a4a2c;
        }
        .yat-snap-team{
          display:flex;
          align-items:center;
          gap:clamp(4px,1.2cqi,7px);
          min-width:0;
          font:700 clamp(8px,2.8cqi,13px)/1.1 Oswald,sans-serif;
          letter-spacing:.02em;
          text-transform:uppercase;
          color:#221a12;
          white-space:nowrap;
          overflow:hidden;
        }
        .yat-snap-team span{
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-team img{
          width:clamp(14px,4.5cqi,20px);
          height:clamp(14px,4.5cqi,20px);
          object-fit:contain;
          flex:0 0 auto;
        }
        .yat-snap-score{
          font:700 clamp(8.5px,2.9cqi,13.5px)/1.1 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.02em;
          white-space:nowrap;
        }
        .yat-snap-score-win{ color:#1c7a3e; }
        .yat-snap-score-loss{ color:#b4232c; }
        .yat-snap-score-tie{ color:#4a4038; }
        .yat-snap-score-live{ color:#b4232c; }
        .yat-snap-score-time{ color:#221a12; }
        .yat-snap-score-ppd{ color:#8a7c68; }
        .yat-snap-statline{
          text-align:right;
          min-width:0;
          font:400 clamp(7px,2.3cqi,11px)/1.1 Oswald,sans-serif;
          color:#6b5d4d;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-offday{
          grid-column:2 / -1;
          text-align:center;
          font:700 clamp(7px,2.4cqi,11px)/1 Oswald,sans-serif;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:#a89a86;
        }
        .yat-snap-unknown{ color:#c2b9ae; }
      `}</style>
    </div>
  );
}
