// TEST-ONLY: select one historical input day. No scoring or result calculation.
import type { Live } from '../src/components/bracket/liveSeason';

export const addDays = (day: string, days: number) => new Date(Date.parse(day + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export function publicationRequests(day: string): ({ cadence: 'daily'; date: string } | { cadence: 'weekly'; periodStart: string })[] {
  const periods: ReturnType<typeof publicationRequests> = [{ cadence: 'daily', date: day }];
  if (new Date(day + 'T00:00:00Z').getUTCDay() === 0) periods.push({ cadence: 'weekly', periodStart: addDays(day, -6) });
  return periods;
}
export type Checkpoint = { report_date: string; phase: string };
export function validateRehearsalDay(day: string, previous?: Checkpoint, reviewedDay = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day + 'T00:00:00Z')) || addDays(day, 0) !== day || day < '2026-03-23' || day > '2026-11-15') {
    throw new Error('Supply one explicit --day YYYY-MM-DD within March 23–November 15, 2026');
  }
  if (!previous) {
    if (day !== '2026-03-23') throw new Error('The first reviewable historical day is March 23, 2026');
    return;
  }
  if (day === previous.report_date) return; // resume this day's failed or interrupted work
  if (day !== addDays(previous.report_date, 1)) throw new Error('Advance exactly one day after the previous checkpoint');
  if (previous.phase !== 'awaiting_review' || reviewedDay !== previous.report_date) {
    throw new Error('The previous day must have a reviewable Digest and an explicit --reviewed-day before advancing');
  }
}

export type Snapshot = { start: string; weeks: number; capturedAt: string; sourceBase: string; branch: string; endpoint: string; commit: string; fieldHash: string; live: Live };

// A recording of the actual production raw-input route, narrowed to the
// requested schools/window. At a daily cutoff, future historical results
// stay hidden while their known schedule remains available as unstarted.
export function recordedRequest(snapshot: Snapshot, reportDate?: string): typeof fetch {
  const lastDay = reportDate === undefined ? Infinity : Math.round((Date.parse(reportDate + 'T00:00:00Z') - Date.parse(snapshot.start + 'T00:00:00Z')) / 86400000);
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    if (url.pathname !== '/api/bracket/live' || url.searchParams.get('start') !== snapshot.start) throw new Error('Recorded transport only serves the captured production source path/calendar');
    const weeks = Number(url.searchParams.get('weeks'));
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > snapshot.weeks) throw new Error('Invalid or uncaptured source window');
    const hsids = (url.searchParams.get('h') || '').split(',');
    const wanted = new Set(hsids);
    const days = weeks * 7;
    const roster = Object.fromEntries(hsids.map(id => {
      if (!(id in snapshot.live.roster)) throw new Error('School missing from source recording: ' + id);
      return [id, snapshot.live.roster[id]];
    }));
    const windowLines = snapshot.live.lines.filter(line => wanted.has(String(line[0])) && line[2] >= 0 && line[2] < days);
    const lines = windowLines.filter(line => line[2] <= lastDay);
    // Keep the captured schedule's clubs even while hiding their future
    // result lines, so an empty result feed is never manufactured as proof
    // that tomorrow has no scheduled games.
    const people = new Set(Object.values(roster).flat().map(p => p[0]));
    const clubStints = Object.fromEntries(Object.entries(snapshot.live.clubStints || {}).filter(([id]) => people.has(id)));
    const clubNames = new Set([...Object.values(roster).flat().map(p => p[4]), ...windowLines.map(line => line[6]), ...Object.values(clubStints).flat().filter(([from,to]) => from < days && (to == null || to >= 0)).map(([, , club]) => club)].filter(Boolean));
    const clubs = Object.fromEntries(Object.entries(snapshot.live.clubs).filter(([club]) => clubNames.has(club)).map(([club, games]) => [club, games.filter(g => g[0] >= 0 && g[0] < days && g[0] <= lastDay)]).filter(([, games]) => (games as unknown[]).length));
    const games = Object.fromEntries(Object.entries(snapshot.live.games || {}).filter(([club]) => clubNames.has(club)).map(([club, list]) => [club, list.filter(g => g[0] >= 0 && g[0] < days).map(g => g[0] <= lastDay ? g : [g[0], g[1], 0, 0, g[4]])]).filter(([, list]) => (list as unknown[]).length));
    const fans = Object.fromEntries(hsids.filter(h => snapshot.live.fans?.[h]?.slice(0, weeks).some(n => n > 0)).map(h => [h, snapshot.live.fans![h].slice(0, weeks)]));
    return Response.json({ asOf: reportDate || snapshot.live.asOf, start: snapshot.start, weeks, roster, lines, clubs, games, fans, ...(snapshot.live.clubStints ? { clubStints } : {}),
      yatIdentityBySourceId: Object.fromEntries(Object.entries(snapshot.live.yatIdentityBySourceId || {}).filter(([, id]) => people.has(id))),
    });
  }) as typeof fetch;
}

export function normalizedSource(input: Live) {
  const sorted = (rows: unknown[][]) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const groups = (map: Record<string, unknown[][]>) => Object.fromEntries(Object.keys(map).sort().map(k => [k, sorted(map[k])]));
  return { roster: groups(input.roster), lines: sorted(input.lines), clubs: groups(input.clubs), games: groups(input.games || {}), ...(input.clubStints ? { clubStints: groups(input.clubStints) } : {}),
    fans: Object.fromEntries(Object.entries(input.fans || {}).sort(([a], [b]) => a.localeCompare(b))),
    aliases: Object.fromEntries(Object.entries(input.yatIdentityBySourceId || {}).sort(([a], [b]) => a.localeCompare(b))) };
}
