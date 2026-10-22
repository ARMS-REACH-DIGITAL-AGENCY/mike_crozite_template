import SevenDaySnapshotView from './SevenDaySnapshotView';
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
export type SnapshotItem =
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

  // Only the week around today, so a team with next season's schedule loaded
  // too never pushes this week past getTeamSchedule's row limit.
  const schedule = teamId
    ? await getTeamSchedule(teamId, 300, { from: addDays(today, -4), to: addDays(today, 4) })
    : [];
  // An empty seven-day window does not mean this team has no schedule.
  // Check the season before deciding whether blank dates are verified off days.
  // This also covers postseason-eliminated clubs such as the Mets in October.
  const seasonEvidence = teamId && (schedule as ScheduleRow[]).length === 0
    ? await getTeamSchedule(teamId, 1, { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` })
    : [];
  const hasSchedule = Boolean(teamId) && ((schedule as ScheduleRow[]).length > 0 || seasonEvidence.length > 0);

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
      // MLB removes "if necessary" playoff games once a series ends early.
      // The live refresh marks orphan rows as "Not Necessary"; hide those.
      // Also hide any stale Scheduled/Pre-Game row whose start time is already
      // more than 3 hours in the past. A real game would have advanced to a
      // live/final/postponed status; leaving it as an upcoming time is wrong.
      .filter((game) => {
        const status = String(game.status || '');
        if (/not necessary/i.test(status)) return false;
        if (/^(scheduled|pre-game)$/i.test(status.trim()) && game.game_time_utc) {
          const startMs = new Date(String(game.game_time_utc)).getTime();
          if (Number.isFinite(startMs) && startMs < Date.now() - 3 * 60 * 60 * 1000) {
            return false;
          }
        }
        return true;
      })
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

// This data source is shared by the server-rendered player card and the
// authenticated-on-demand gallery route; no React SSR APIs are needed.
export async function getPlayerSevenDayWindow(playerId: string) {
  return getSevenDayWindow(playerId);
}

export default async function PlayerSevenDaySnapshot({ playerId, profileHref }: { playerId: string; displayName: string; profileHref: string }) {
  if (!playerId) return null;
  const window = await getSevenDayWindow(playerId);
  return <SevenDaySnapshotView {...window} profileHref={profileHref} />;
}
