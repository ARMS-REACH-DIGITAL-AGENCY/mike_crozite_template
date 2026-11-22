// TEST-ONLY: record authentic provider responses before the shared production
// ingestion workers parse them. This adapter never writes game/stat tables,
// constructs box scores, changes a game's status, or computes a result.
import { createHash } from 'node:crypto';

type ScheduleGame = { gamePk?: number; officialDate?: string; [key: string]: unknown };
type ScheduleDay = { date?: string; games?: ScheduleGame[]; [key: string]: unknown };
type SchedulePayload = { dates?: ScheduleDay[]; [key: string]: unknown };

export type HistoricalMlbRecord = {
  reportDate: string;
  url: string;
  capturedAt: string;
  status: number;
  contentType: string;
  providerBody: string;
  providerHash: string;
  replayBody: string;
  replayHash: string;
  omittedFutureDates: string[];
  omittedFutureGameIds: number[];
};

const sha256 = (body: string) => createHash('sha256').update(body).digest('hex');
function requireDay(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value + 'T00:00:00Z'))
      || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ${label} in historical MLB source`);
  }
  return value;
}

/**
 * End-of-day historical source only. Original intraday arrivals/revisions are
 * unavailable unless the caller supplies original provider captures. A current
 * historical schedule may already contain future finals, so those entire game
 * records are omitted; no fake "Scheduled" status or score is manufactured.
 * Future schedule visibility is therefore outside this fixture's coverage.
 * `save` must persist the raw record outside the sandbox before it is consumed.
 * Preserve failed attempts too (e.g. key by URL + body hash), but only successful
 * captures are reusable inputs. A provider outage must not freeze a failed day.
 */
export function createHistoricalMlbSource(options: {
  reportDate: string;
  request?: typeof fetch;
  previous?: HistoricalMlbRecord[];
  save: (record: HistoricalMlbRecord) => Promise<void>;
}) {
  const reportDate = requireDay(options.reportDate, 'report date');
  const upstream = options.request ?? fetch;
  const records: HistoricalMlbRecord[] = [];
  const prior = new Map<string, HistoricalMlbRecord>();
  const retainedGames = new Set<number>();
  const inflight = new Map<string, Promise<HistoricalMlbRecord>>();

  for (const record of options.previous ?? []) {
    if (record.reportDate !== reportDate || sha256(record.providerBody) !== record.providerHash
        || sha256(record.replayBody) !== record.replayHash) {
      throw new Error('Historical MLB capture does not match this day or its saved hashes');
    }
    if (record.status < 200 || record.status >= 300) continue;
    if (prior.has(record.url)) throw new Error('Duplicate historical MLB capture URL');
    prior.set(record.url, record);
  }

  function rememberSchedule(body: string) {
    const payload = JSON.parse(body) as SchedulePayload;
    for (const day of payload.dates ?? []) {
      const date = requireDay(day.date, 'schedule date');
      if (date > reportDate) throw new Error('Future schedule date in replay response');
      for (const game of day.games ?? []) {
        const officialDate = game.officialDate == null ? date : requireDay(game.officialDate, 'official game date');
        if (officialDate > reportDate) throw new Error('Future game in replay response');
        if (Number.isSafeInteger(game.gamePk) && Number(game.gamePk) > 0) retainedGames.add(Number(game.gamePk));
      }
    }
  }

  async function capture(url: URL, init?: RequestInit): Promise<HistoricalMlbRecord> {
    const saved = prior.get(url.toString());
    if (saved) {
      if (url.pathname === '/api/v1/schedule' && saved.status >= 200 && saved.status < 300) rememberSchedule(saved.replayBody);
      records.push(saved);
      return saved;
    }
    const response = await upstream(url.toString(), { ...init, redirect: 'error' });
    const providerBody = await response.text();
    let replayBody = providerBody;
    const omittedDates = new Set<string>();
    const omittedGames = new Set<number>();
    if (response.ok && url.pathname === '/api/v1/schedule') {
      const original = JSON.parse(providerBody) as SchedulePayload;
      const dates: ScheduleDay[] = [];
      for (const day of original.dates ?? []) {
        const date = requireDay(day.date, 'schedule date');
        const games = (day.games ?? []).filter(game => {
          const official = game.officialDate == null ? date : requireDay(game.officialDate, 'official game date');
          if (date <= reportDate && official <= reportDate) return true;
          omittedDates.add(date > reportDate ? date : official);
          if (Number.isSafeInteger(game.gamePk)) omittedGames.add(Number(game.gamePk));
          return false;
        });
        if (date <= reportDate) dates.push({ ...day, games });
        else omittedDates.add(date);
      }
      replayBody = JSON.stringify({ ...original, dates });
    }
    const record: HistoricalMlbRecord = {
      reportDate,
      url: url.toString(),
      capturedAt: new Date().toISOString(),
      status: response.status,
      contentType: response.headers.get('content-type') || 'application/json',
      providerBody,
      providerHash: sha256(providerBody),
      replayBody,
      replayHash: sha256(replayBody),
      omittedFutureDates: [...omittedDates].sort(),
      omittedFutureGameIds: [...omittedGames].sort((a, b) => a - b),
    };
    await options.save(record);
    if (response.ok && url.pathname === '/api/v1/schedule') rememberSchedule(replayBody);
    records.push(record);
    return record;
  }

  const request: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    if (url.origin !== 'https://statsapi.mlb.com' || url.username || url.password
        || (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase() !== 'GET') {
      throw new Error('Historical MLB source accepts only read-only MLB provider requests');
    }
    const box = /^\/api\/v1\/game\/(\d+)\/boxscore$/.exec(url.pathname);
    if (url.pathname === '/api/v1/schedule') {
      const day = url.searchParams.get('date');
      const start = url.searchParams.get('startDate');
      const end = url.searchParams.get('endDate');
      if (day) {
        if (requireDay(day, 'requested schedule date') > reportDate) throw new Error('Cannot request a future historical MLB day');
      } else if (!start || !end || requireDay(start, 'requested schedule start') > reportDate
          || requireDay(end, 'requested schedule end') < start) {
        throw new Error('Historical MLB schedule requires a bounded date window');
      }
    } else if (box) {
      if (!retainedGames.has(Number(box[1]))) throw new Error('Boxscore must belong to a previously captured game on or before the report day');
    } else {
      throw new Error('Unrecognized historical MLB provider request; extend the recorded input adapter explicitly');
    }
    let pending = inflight.get(url.toString());
    if (!pending) {
      pending = capture(url, init);
      inflight.set(url.toString(), pending);
      pending.catch(() => inflight.delete(url.toString()));
    }
    const record = await pending;
    if ((record.status < 200 || record.status >= 300) && inflight.get(url.toString()) === pending) {
      inflight.delete(url.toString());
    }
    return new Response(record.replayBody, { status: record.status, headers: { 'content-type': record.contentType } });
  };
  return { request, records };
}
