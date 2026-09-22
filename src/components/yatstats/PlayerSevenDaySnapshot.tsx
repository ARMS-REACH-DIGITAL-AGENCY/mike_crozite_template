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

type GameSummary = {
  isHome: boolean;
  logoUrl: string | null;
  opponentLabel: string;
  venue: string;
  resultLine: string;
  resultClass: ResultClass;
  subLine: string;
};

// A calendar day with 2 scheduled games (a doubleheader) renders as ONE row
// with both games side by side, not two separate rows - this is a 7-DAY
// snapshot (one row per calendar day), not a "however many games fall in
// the window" snapshot. Letting a doubleheader add an 8th/9th row forced
// every row's font down to keep everything fitting the fixed FunZone
// frame, which is the wrong trade - a fan would rather see one busier row
// than seven cramped ones.
type SnapshotItem =
  | { kind: 'game'; iso: string; game: GameSummary }
  | { kind: 'doubleheader'; iso: string; games: GameSummary[] }
  | { kind: 'offday'; iso: string }
  | { kind: 'unknown'; iso: string };

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// "Today" has to be today in the PLAYER'S school's calendar, not the
// server's UTC calendar - Arizona (UTC-7, no DST) rolls its calendar day
// over hours before UTC does, so a plain isoDate(new Date()) call would
// flip this widget's "TODAY" row to the next day while it's still last
// night for the fan actually looking at the site.
function isoDateInZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value || '0000';
  const month = parts.find((p) => p.type === 'month')?.value || '00';
  const day = parts.find((p) => p.type === 'day')?.value || '00';
  return `${year}-${month}-${day}`;
}

function addDays(iso: string, delta: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDate(d);
}

// Uses the player's own school_timezone (flip_card_front_stage), the same
// real per-school column the flip card front reads - falls back to Arizona
// only when a player has no school_timezone on file, not as the default
// for everyone regardless of school.
function formatGameTime(gameTimeUtc: unknown, timeZone: string): string {
  if (!gameTimeUtc) return 'TBD';
  const d = new Date(String(gameTimeUtc));
  if (Number.isNaN(d.getTime())) return 'TBD';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(d);
}

function buildGameSummary(
  game: ScheduleRow,
  logsByGamePk: Map<string, GameLogRow[]>,
  teamIdMap: Map<string, string>,
  timeZone: string
): GameSummary {
  const isHome = game.is_home === true || game.home_away === 'Home';
  const opponentRawId = isHome ? game.away_team_id : game.home_team_id;
  const logoUrl = opponentRawId ? mlbTeamLogoUrl(teamIdMap, opponentRawId) : null;
  const abbr = mlbTeamAbbreviation(opponentRawId);
  const opponentLabel = abbr || String(game.opponent || 'TBD').trim();

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
    resultLine = formatGameTime(game.game_time_utc, timeZone);
  }

  // A completed game (win/loss/tie) with no joined box-score line means the
  // player was on the roster but didn't appear in it - a bench day, not a
  // missing-data gap - so it's worth a label rather than reading as blank.
  if ((resultClass === 'win' || resultClass === 'loss' || resultClass === 'tie') && !subLine) {
    subLine = 'DNP';
  }

  return { isHome, logoUrl, opponentLabel, venue: game.venue_name || '', resultLine, resultClass, subLine };
}

async function getSevenDayWindow(playerId: string): Promise<{ items: SnapshotItem[]; todayIso: string }> {
  const [transactionStatus, gameLogs, teamIdMap] = await Promise.all([
    getFlipCardTransactionStatus(playerId),
    getPlayerGameLogs(playerId),
    getTeamIdMap(),
  ]);

  const schoolTimeZone = String((transactionStatus as any)?.school_timezone || '').trim() || 'America/Phoenix';
  const today = isoDateInZone(new Date(), schoolTimeZone);

  // Empty/unset status_label (most college/HS players, who aren't on this
  // MLB-specific pipeline) is treated as active - only a real, explicit
  // non-ACTIVE status (INJURED 7-DAY, RETIRED, FREE AGENT, etc) should
  // override the stat line, and it replaces it on every row, not just past
  // ones: a player on the 7-day IL isn't going to play Thursday's game
  // either, so a blank "-" there would just look like missing data.
  const statusLabel = String((transactionStatus as any)?.status_label || '').trim().toUpperCase();
  const isActive = !statusLabel || statusLabel === 'ACTIVE';

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
    } else if (gamesForDate.length === 1) {
      const game = buildGameSummary(gamesForDate[0], logsByGamePk, teamIdMap, schoolTimeZone);
      if (!isActive) game.subLine = statusLabel;
      items.push({ kind: 'game', iso, game });
    } else {
      const games = gamesForDate.map((g) => buildGameSummary(g, logsByGamePk, teamIdMap, schoolTimeZone));
      if (!isActive) games.forEach((g) => { g.subLine = statusLabel; });
      items.push({ kind: 'doubleheader', iso, games });
    }
  }

  return { items, todayIso: today };
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

  const { items, todayIso } = await getSevenDayWindow(playerId);
  const hasAnyRealData = items.some((it) => it.kind !== 'unknown');

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
          const dow = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();

          return (
            <a
              className={`yat-snap-row${isToday ? ' yat-snap-row-today' : ''}`}
              href={profileHref}
              key={`${item.iso}-${idx}`}
            >
              <div className={`yat-snap-date${isToday ? ' yat-snap-date-today' : ''}`}>
                {!isToday && <span className="yat-snap-date-mon">{mon}</span>}
                <div className="yat-snap-date-stack">
                  <span className="yat-snap-date-day">{isToday ? 'TODAY' : dayNum}</span>
                  <span className="yat-snap-date-dow">{dow}</span>
                </div>
              </div>

              {item.kind === 'game' ? (
                <>
                  <div className="yat-snap-team">
                    {item.game.logoUrl && <img src={item.game.logoUrl} alt="" loading="lazy" />}
                    <div className="yat-snap-team-text">
                      <div className="yat-snap-matchup">
                        <span className="yat-snap-matchup-prefix">{item.game.isHome ? 'vs' : '@'}</span>
                        <span className="yat-snap-matchup-team">{item.game.opponentLabel}</span>
                      </div>
                      {item.game.venue && <div className="yat-snap-venue">{item.game.venue}</div>}
                    </div>
                  </div>

                  <div className={`yat-snap-score yat-snap-score-${item.game.resultClass}`}>{item.game.resultLine}</div>

                  <div className="yat-snap-statline">{item.game.subLine || '-'}</div>
                </>
              ) : item.kind === 'doubleheader' ? (
                <div className="yat-snap-dh">
                  {item.games.map((g, gi) => (
                    <div className="yat-snap-dh-game" key={gi}>
                      <div className="yat-snap-dh-logo">
                        {g.logoUrl && <img src={g.logoUrl} alt="" loading="lazy" />}
                      </div>
                      <div className="yat-snap-dh-team">
                        <span className="yat-snap-dh-team-prefix">{g.isHome ? 'vs' : '@'}</span> {g.opponentLabel}
                      </div>
                      <div className={`yat-snap-dh-score yat-snap-score-${g.resultClass}`}>{g.resultLine}</div>
                      <div className="yat-snap-dh-stat">{g.subLine || '-'}</div>
                    </div>
                  ))}
                </div>
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
          gap:clamp(2px,.8cqi,5px);
        }
        .yat-snap-row{
          flex:1;
          min-height:0;
          display:grid;
          grid-template-columns:clamp(42px,15cqi,60px) clamp(70px,24cqi,110px) clamp(52px,19cqi,82px) 1fr;
          align-items:center;
          gap:clamp(5px,1.5cqi,9px);
          text-decoration:none;
          color:inherit;
          background:rgba(255,255,255,0.72);
          border:1px solid rgba(30,22,14,0.10);
          border-radius:clamp(4px,1.2cqi,7px);
          padding:clamp(2px,1cqi,6px) clamp(6px,1.6cqi,10px);
          box-shadow:0 1px 2px rgba(0,0,0,0.06);
          min-width:0;
          overflow:hidden;
        }
        .yat-snap-row-today{
          background:rgba(255,255,255,0.94);
          border-color:rgba(30,22,14,0.24);
        }
        .yat-snap-date{
          display:flex;
          align-items:center;
          gap:clamp(3px,1cqi,6px);
          line-height:1;
          min-width:0;
        }
        .yat-snap-date-mon{
          font:700 clamp(6px,1.9cqi,9px)/1 Oswald,sans-serif;
          letter-spacing:.05em;
          color:#8a7c68;
        }
        .yat-snap-date-stack{
          display:flex;
          flex-direction:column;
          align-items:flex-start;
          line-height:1;
        }
        .yat-snap-date-day{
          font:700 clamp(10px,3.6cqi,18px)/1.05 "Bebas Neue",sans-serif;
          color:#17120c;
          white-space:nowrap;
        }
        .yat-snap-date-dow{
          font:700 clamp(6px,1.9cqi,9px)/1 Oswald,sans-serif;
          letter-spacing:.05em;
          color:#8a7c68;
        }
        .yat-snap-date-today .yat-snap-date-day{
          font-size:clamp(9px,3.2cqi,15px);
          letter-spacing:.04em;
          color:#8a4a2c;
        }
        .yat-snap-team{
          display:flex;
          align-items:center;
          gap:clamp(4px,1.3cqi,8px);
          min-width:0;
        }
        .yat-snap-team img{
          width:clamp(17px,5.5cqi,27px);
          height:clamp(17px,5.5cqi,27px);
          object-fit:contain;
          flex:0 0 auto;
        }
        .yat-snap-team-text{
          min-width:0;
          display:flex;
          flex-direction:column;
        }
        .yat-snap-matchup{
          display:flex;
          align-items:baseline;
          gap:.3em;
          min-width:0;
          white-space:nowrap;
          overflow:hidden;
        }
        .yat-snap-matchup-prefix{
          font:400 clamp(6.5px,2.1cqi,10px)/1 Oswald,sans-serif;
          text-transform:lowercase;
          color:#8a7c68;
          flex:0 0 auto;
        }
        .yat-snap-matchup-team{
          font:700 clamp(8px,2.7cqi,13px)/1.15 Oswald,sans-serif;
          letter-spacing:.02em;
          text-transform:uppercase;
          color:#221a12;
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-venue{
          font:400 clamp(6.5px,2.1cqi,9.5px)/1.15 Oswald,sans-serif;
          color:#8a7c68;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-score{
          font:700 clamp(8px,2.6cqi,13px)/1.1 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.02em;
          white-space:nowrap;
          text-align:center;
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-score-win{ color:#1c7a3e; }
        .yat-snap-score-loss{ color:#b4232c; }
        .yat-snap-score-tie{ color:#4a4038; }
        .yat-snap-score-live{ color:#b4232c; }
        .yat-snap-score-time{ color:#221a12; }
        .yat-snap-score-ppd{ color:#8a7c68; }
        .yat-snap-statline{
          font:700 clamp(11px,4cqi,18px)/1.1 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.01em;
          color:#17120c;
          text-align:right;
          min-width:0;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-offday{
          grid-column:2;
          min-width:0;
          text-align:left;
          font:700 clamp(7px,2.4cqi,11px)/1 Oswald,sans-serif;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:#a89a86;
        }
        .yat-snap-unknown{ color:#c2b9ae; }

        /* Doubleheader: one calendar day, two games - side by side in the
           same row instead of a second row, so the window always stays at
           exactly 7 rows regardless of how many games fall in it. */
        .yat-snap-dh{
          grid-column:2 / -1;
          display:flex;
          align-items:center;
          min-width:0;
        }
        .yat-snap-dh-game{
          flex:1;
          min-width:0;
          display:flex;
          align-items:center;
          gap:clamp(3px,1cqi,6px);
          overflow:hidden;
        }
        .yat-snap-dh-game + .yat-snap-dh-game{
          margin-left:clamp(5px,1.5cqi,9px);
          padding-left:clamp(5px,1.5cqi,9px);
          border-left:1px solid rgba(30,22,14,0.14);
        }
        .yat-snap-dh-logo{
          width:clamp(13px,4.2cqi,19px);
          height:clamp(13px,4.2cqi,19px);
          flex:0 0 auto;
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .yat-snap-dh-logo img{
          width:100%;
          height:100%;
          object-fit:contain;
        }
        .yat-snap-dh-team{
          flex:0 1 auto;
          min-width:0;
          font:700 clamp(6.5px,2.1cqi,9.5px)/1.15 Oswald,sans-serif;
          text-transform:uppercase;
          letter-spacing:.02em;
          color:#221a12;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-dh-team-prefix{
          text-transform:lowercase;
          font-weight:400;
          color:#8a7c68;
        }
        .yat-snap-dh-score{
          flex:0 0 auto;
          font:700 clamp(7px,2.3cqi,10.5px)/1.1 "Bebas Neue",Oswald,sans-serif;
          white-space:nowrap;
        }
        .yat-snap-dh-stat{
          flex:1;
          min-width:0;
          text-align:right;
          font:700 clamp(7.5px,2.6cqi,12px)/1.1 "Bebas Neue",Oswald,sans-serif;
          color:#17120c;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
      `}</style>
    </div>
  );
}
