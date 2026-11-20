// Newsletter projections of the one authoritative tournament result.
// This module NEVER imports the fantasy scoring engine or replays player lines.
// Persisted master_bracket.innings, scores, box and winner are the source.
import type { GameBox, GameRow } from '@/components/bracket/gallery';

export type StoredBracketGame = {
  stage: string;
  region: number;
  game_id: number;
  week: number;
  home_hsid: number | null;
  away_hsid: number | null;
  status: string;
  innings: number[] | string | null;
  home_runs?: number | null;
  away_runs?: number | null;
  winner_hsid: number | null;
  decided_by?: string | null;
  locked_at: string | null;
  box: GameBox | null;
};

export function storedInnings(value: StoredBracketGame['innings']): number[] {
  const values = Array.isArray(value) ? value : typeof value === 'string'
    ? value.replace(/^[{[]|[}\]]$/g, '').split(',').filter(Boolean).map(Number)
    : [];
  if (values.length !== 18 || values.some((v) => !Number.isSafeInteger(v) || v < 0)) {
    throw new Error('Incomplete or invalid stored nine-inning fantasy result');
  }
  return values;
}

function savedGame(row: StoredBracketGame) {
  if (row.home_hsid == null || row.away_hsid == null || row.home_hsid === row.away_hsid) {
    throw new Error('Stored bracket game has invalid school pairing: ' + row.game_id);
  }
  if (!row.box || !Array.isArray(row.box.f) ||
      !Array.isArray(row.box.h?.days) || !Array.isArray(row.box.a?.days)) {
    throw new Error('Missing stored fantasy scoring and player-day ledger for game ' + row.game_id);
  }
  const innings = storedInnings(row.innings);
  const game: GameRow = [
    row.game_id, row.week, row.home_hsid, row.away_hsid,
    row.status === 'final' ? row.decided_by || 'runs' : '',
    innings, row.status === 'final' ? row.winner_hsid : null,
  ];
  return { game, box: row.box, innings };
}

function posted(box: GameBox, day: number, gameId: number) {
  if (!box.f?.[day]?.[0] || !box.f[day][1]) {
    throw new Error('Stored fantasy inning ' + (day + 1) + ' not settled for game ' + gameId);
  }
}

function linesThrough(innings: number[], through: number) {
  const home = Array.from({ length: through }, (_, i) => innings[2 * i]);
  const away = Array.from({ length: through }, (_, i) => innings[2 * i + 1]);
  return {
    homeInnings: home, awayInnings: away,
    homeRuns: home.reduce((total, runs) => total + runs, 0),
    awayRuns: away.reduce((total, runs) => total + runs, 0),
  };
}

/**
 * A Digest reflects the already-posted Monday-Sunday inning; Sunday's
 * 4 a.m. Monday cutoff also includes the official 8th and 9th innings.
 * Even when reading a final box days later, historical days remain snapshots
 * of only the innings that had posted on those days.
 */
export function dailyFromStored(row: StoredBracketGame, day: number) {
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw new Error('Daily fantasy inning must be Monday=0 through Sunday=6');
  }
  const saved = savedGame(row);
  posted(saved.box, day, row.game_id);
  if (!Array.isArray(saved.box.h.days?.[day]) ||
      !Array.isArray(saved.box.a.days?.[day])) {
    throw new Error('Missing stored daily player ledger for game ' + row.game_id);
  }
  const final = day === 6;
  if (final) {
    if (row.status !== 'final' || !row.locked_at || row.winner_hsid == null) {
      throw new Error('Sunday Digest requires final locked bracket result for game ' + row.game_id);
    }
    posted(saved.box, 7, row.game_id);
    posted(saved.box, 8, row.game_id);
  }
  const through = final ? 9 : day + 1;
  const totals = linesThrough(saved.innings, through);
  if (final && (row.home_runs !== totals.homeRuns || row.away_runs !== totals.awayRuns)) {
    throw new Error('Saved final score and innings disagree for game ' + row.game_id);
  }
  return {
    ...saved,
    ...totals,
    throughInning: through,
    storyInning: final ? 8 : day,
    isFinal: final,
  };
}

/**
 * The Gazette prints the locked answer, not a second evaluation of OPS+/FIP-,
 * the real-team W-L tiebreaker, or any other fantasy scoring rule.
 */
export function weeklyFromStored(row: StoredBracketGame) {
  if (row.status !== 'final' || !row.locked_at ||
      row.winner_hsid == null || ![row.home_hsid, row.away_hsid].includes(row.winner_hsid)) {
    throw new Error('Weekly Gazette requires a final locked result for game ' + row.game_id);
  }
  const saved = savedGame(row);
  posted(saved.box, 8, row.game_id);
  if (!Array.isArray(saved.box.h.p) || !Array.isArray(saved.box.a.p)) {
    throw new Error('Missing stored weekly player ledger for game ' + row.game_id);
  }
  const totals = linesThrough(saved.innings, 9);
  if (totals.homeRuns !== row.home_runs || totals.awayRuns !== row.away_runs) {
    throw new Error('Saved final score and innings disagree for game ' + row.game_id);
  }
  return { ...saved, ...totals, winnerHsid: row.winner_hsid };
}
