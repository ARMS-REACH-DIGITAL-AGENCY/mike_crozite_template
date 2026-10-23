/** Read-only adapters from the tournament's real scoring payload into an edition. */
import type { NextRequest } from 'next/server';
import type { ActiveRosterPlayer, GameBox, GameRow, Index, PlayerRow, SideBox } from '@/components/bracket/gallery';
import { scoreLiveIndex, scoreLiveSchoolWeek, type LiveInning, type LivePayload } from '@/lib/bracket/scoreLive';
import { toProductionTournamentIndex } from '@/lib/bracket/productionIndex';
import { TOURNAMENT_2027 } from '@/lib/bracket/tournamentCalendar';
import type { TribuneEdition, TribuneMatchup, TribunePlayerRow, TribuneRoster, TribuneScoreSide } from './types';

export type TribuneRosterPlayer = ActiveRosterPlayer & {
  name?: string | null; position?: string | null; current_team_name?: string | null;
  hsid?: string | number | null; schoolName?: string | null;
};
type TeamMetrics = { opsPlus: number | null; fipMinus: number | null };
const DAY = 86400000;
const n = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : 0;
const rate = (x: number) => x.toFixed(3).replace(/^0/, '');
const metric = (x: number | null | undefined) => x == null ? '—' : String(Math.round(x));
const zero = () => Array<number>(9).fill(0);
const wl = (x: [number, number] | null | undefined) => x ? `${x[0]}-${x[1]}` : '—';
const dateAt = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const monday = (iso: string) => dateAt(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
/** Arizona never observes DST; the tournament date changes at 11:00 UTC. */
export const tournamentDateAt = (now = new Date()) => new Date(now.getTime() - 11 * 3600000).toISOString().slice(0, 10);
const nameOf = (p: TribuneRosterPlayer) => String(p.display_name || p.name || `${p.firstname || ''} ${p.lastname || ''}`.trim() || p.playerid);
const isPitcher = (p: TribuneRosterPlayer) => typeof p.is_pitcher === 'boolean'
  ? p.is_pitcher : /(^|[^A-Z])(P|LHP|RHP|PITCHER)([^A-Z]|$)/.test(String(p.position || '').toUpperCase());
const sum = (values: number[][]) => values.reduce((a, row) => a.map((x, i) => x + n(row[i])), zero());
const sumWl = (rows: PlayerRow[]): [number, number] => rows.reduce<[number, number]>((a, p) => [a[0] + n(p[8]?.[0]), a[1] + n(p[8]?.[1])], [0, 0]);
const obp = (b: number[]) => b[1] + b[6] + b[7] + b[8] ? (b[2] + b[6] + b[7]) / (b[1] + b[6] + b[7] + b[8]) : 0;
const slg = (b: number[]) => b[1] ? (b[2] + b[3] + 2 * b[4] + 3 * b[5]) / b[1] : 0;
function batCells(b: number[], value: number | null | undefined, record: [number, number] | null | undefined) {
  return [metric(value), wl(record), ...b.slice(1, 9).map(String), rate(obp(b)), rate(slg(b)), rate(obp(b) + slg(b))];
}
function pitCells(p: number[], value: number | null | undefined, record: [number, number] | null | undefined) {
  const outs = n(p[0]), bb = n(p[2]), k = n(p[4]);
  // These formats and the no-BB K/BB convention match Face's stat ledger.
  return [metric(value), wl(record), `${Math.floor(outs / 3)}.${outs % 3}`, ...[p[5], p[6], p[7], p[1], bb, p[3], k].map(x => String(n(x))),
    rate(outs ? (n(p[5]) + bb) / (outs / 3) : 0), (bb ? k / bb : k).toFixed(2), n(p[8]).toFixed(2)];
}

/** Full canonical roster first; known no-appearance rows stay, missing feeds stay unknown.
 * day is 0=Monday..6=Sunday; omit it for the whole week.
 */
export function toTribuneRoster(input: {
  title: string; schoolId?: string; roster: TribuneRosterPlayer[]; sideBox?: SideBox;
  metrics?: TeamMetrics; day?: number; available?: boolean; schoolUrl?: string;
}): TribuneRoster {
  const roster = [...new Map(input.roster.map(p => [String(p.playerid), p])).values()];
  const rows = input.day == null ? input.sideBox?.p : input.sideBox?.days?.[input.day];
  const byId = new Map((rows || []).map(p => [p[0], p]));
  const entries = roster.map(p => ({ p, source: byId.get(String(p.playerid)) }));
  const sourceRows = entries.flatMap(e => e.source ? [e.source] : []);
  const available = input.available !== false && Boolean(input.sideBox);
  const toRow = ({ p, source }: typeof entries[number], kind: 'batting' | 'pitching'): TribunePlayerRow => {
    const known = available && Boolean(source) && source?.[3] === 0 && source?.[9] !== 1;
    const stats = source?.[kind === 'batting' ? 4 : 5] || zero();
    const played = known && stats.some(x => x !== 0);
    const teamId = String(p.current_teamid || '');
    let profileUrl: string | undefined;
    const hsid = String(p.hsid || input.schoolId || '');
    if (input.schoolUrl && /^\d+$/.test(hsid)) profileUrl = new URL(`/${hsid}/player/${encodeURIComponent(String(p.playerid))}`, input.schoolUrl).toString();
    return {
      id: String(p.playerid), name: nameOf(p), team: p.current_team_name || undefined,
      school: p.schoolName || undefined, level: p.level || undefined,
      ...(teamId && /^\d+$/.test(teamId) ? { logoUrl: `https://yatstats-assets.s3.us-west-2.amazonaws.com/teams-web/${teamId}.webp` } : {}),
      profileUrl, state: !known ? 'unavailable' : played ? 'played' : 'no-appearance',
      cells: !known ? Array<string>(13).fill('—') : kind === 'batting'
        ? batCells(stats, source?.[6] ?? 0, source?.[8])
        : pitCells(stats, source?.[7] ?? 0, source?.[8]),
    };
  };
  const batting = entries.filter(({ p, source }) => p.is_two_way_2026 || !isPitcher(p) || (source?.[4] && source[4].some(x => x !== 0)));
  const pitching = entries.filter(({ p, source }) => p.is_two_way_2026 || isPitcher(p) || (source?.[5] && source[5].some(x => x !== 0)));
  const batRows = batting.map(e => toRow(e, 'batting'));
  const pitRows = pitching.map(e => toRow(e, 'pitching'));
  const b = sum(batting.map(e => e.source?.[4] || zero()));
  const p = sum(pitching.map(e => e.source?.[5] || zero()));
  p[8] = p[0] ? pitching.reduce((a, e) => a + n(e.source?.[5] && e.source[5][8]) * n(e.source?.[5] && e.source[5][0]), 0) / p[0] : 0;
  const batWl = sumWl(batting.flatMap(e => e.source ? [e.source] : []));
  const pitWl = sumWl(pitching.flatMap(e => e.source ? [e.source] : []));
  const allKnown = available && sourceRows.length === roster.length && [...batRows, ...pitRows].every(r => r.state !== 'unavailable');
  return {
    schoolId: input.schoolId, title: input.title, playerCount: roster.length,
    batting: { kind: 'batting', rows: batRows, totals: allKnown ? batCells(b, input.metrics?.opsPlus, batWl) : Array<string>(13).fill('—') },
    pitching: { kind: 'pitching', rows: pitRows, totals: allKnown ? pitCells(p, input.metrics?.fipMinus, pitWl) : Array<string>(13).fill('—') },
    // Unique canonical players, not both category subtotals: a two-way player counts once.
    clubRecord: allKnown ? wl(sumWl(sourceRows)) : '—',
    note: 'W-L is the player’s real club record. Every roster member is listed. A no-appearance row is a known zero; an em dash marks unavailable data. Two-way players appear in both tables and count once in the school club record.',
  };
}

const skip = /^(high|school|hs|academy|prep|preparatory|the|of|and|at)$/i;
function abbreviation(name: string) {
  let words = name.split(' (')[0].replace(/[^A-Za-z .'-]/g, '').split(/[\s.-]+/).map(w => w.replace(/'/g, '')).filter(Boolean);
  const kept = words.filter(w => !skip.test(w)); if (kept.length) words = kept;
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  if (words.length === 2) return (words[0][0] + (words[0].slice(1).replace(/[aeiou]/gi, '')[0] || words[0][1] || '') + words[1][0]).toUpperCase();
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
}

/** Already-scored innings only; never re-awards runs using rounded display metrics. */
export function toTribuneMatchup(input: { game: GameRow; index: Index; box?: GameBox; liveInning?: LiveInning; asOf: string }): TribuneMatchup {
  const { game: g, index, box, liveInning: clock } = input;
  const [start, end] = index.weeks[g[1] - 1];
  const upcoming = input.asOf < start;
  const ended = input.asOf > end;
  const unknown = !upcoming && !box;
  const count = Math.max(9, ended && !unknown ? Math.floor(g[5].length / 2) : 9);
  const day = clock?.day ?? Math.max(0, Math.min(7, daysBetween(input.asOf, start)));
  const weekPosted = ended || (day === 6 && clock?.phase === 'posted');
  const states: TribuneMatchup['inningStates'] = Array.from({ length: count }, (_, i) => {
    if (upcoming || unknown) return 'future';
    if (ended || (i < 7 && i < day)) return 'final';
    if ((i < 7 && i === day) || (i >= 7 && weekPosted)) return 'provisional';
    return 'future';
  });
  const side = (s: 'h' | 'a', offset: 0 | 1): TribuneScoreSide => {
    const id = String(g[offset === 0 ? 2 : 3]);
    const raw = index.schools[id]?.[0] || `School ${id}`;
    const name = raw.split(' (')[0];
    const runs = states.map((state, i) => {
      if (state === 'future') return null;
      if (!ended && i === day && clock?.phase === 'top' && offset === 0) return null;
      return n(g[5][i * 2 + offset]);
    });
    return {
      schoolId: id, name, abbreviation: abbreviation(name), location: raw.includes(' (') ? raw.split(' (')[1].replace(/\)$/, '') : undefined,
      runs, total: runs.reduce<number>((a, x) => a + (x ?? 0), 0),
      opsPlus: Array.from({ length: 8 }, (_, i) => !upcoming && !unknown && (i <= day || i === 7) ? box?.d[i]?.[offset] ?? null : null),
      fipMinus: Array.from({ length: 8 }, (_, i) => !upcoming && !unknown && (i <= day || i === 7) ? box?.d[i]?.[offset + 2] ?? null : null),
      clubRecord: !upcoming && !unknown ? box?.[s].wl || [0, 0] : [0, 0],
    };
  };
  return {
    gameId: String(g[0]), round: Math.ceil(g[1] / 3), game: ((g[1] - 1) % 3) + 1, week: g[1], start, end,
    status: upcoming ? 'upcoming' : unknown ? 'unavailable' : ended && g[4] !== 'commissioner-pending' ? 'final' : 'live',
    away: side('a', 1), home: side('h', 0), inningStates: states,
    note: upcoming ? 'The 2027 tournament has not started. The alumni stats below are real production for the selected reporting period.'
      : unknown ? 'Tournament data is unavailable; no result is inferred.'
      : g[4] === 'commissioner-pending' ? 'Tied after the recorded tiebreakers; the commissioner’s decision is pending.'
      : 'Innings 1–7: Monday–Sunday. Inning 8: the whole week. Inning 9: real-club winning percentage. Yellow innings are provisional until 4 a.m. Arizona time.',
  };
}

export function buildTribuneSchoolStats(live: LivePayload, input: {
  schoolId: string; title: string; roster: TribuneRosterPlayer[]; start: string; asOf: string; day?: number; schoolUrl?: string;
}): TribuneRoster {
  const data = scoreLiveSchoolWeek(live, { schoolId: input.schoolId, weekStart: input.start, asOf: input.asOf });
  return toTribuneRoster({ ...input, sideBox: data.side, metrics: data.metrics[input.day ?? 7], available: Boolean(live.roster[input.schoolId]) });
}

export type TribuneDataInput = {
  request: NextRequest; hsid: string; schoolName?: string; schoolUrl?: string; period: TribuneEdition['period'];
  extraFavorites: TribuneRosterPlayer[]; home?: TribuneRosterPlayer[];
};
export type TribuneData = {
  homeRoster: TribuneRoster; follows?: TribuneRoster; matchup?: TribuneMatchup;
  dataStatus: 'verified' | 'unavailable'; notices: string[]; statLineCount: number;
};
/** Injectable read-only boundaries allow deterministic delivery previews and source tests. */
export type TribuneDataSources = {
  roster?: (schoolId: string) => Promise<TribuneRosterPlayer[]>;
  live?: (start: string, weeks: number, schoolIds: string[]) => Promise<LivePayload>;
  seed?: () => Promise<Index>;
  now?: () => Date;
};

/** Read-only API adapter. Cohorts are scoped and batched to the live route's 64-school limit. */
export async function loadTribuneData(input: TribuneDataInput, sources: TribuneDataSources = {}): Promise<TribuneData> {
  const origin = input.request.nextUrl.origin;
  const schoolUrl = input.schoolUrl || origin;
  const notices: string[] = [];
  let home = input.home;
  if (!home) {
    if (sources.roster) home = await sources.roster(input.hsid);
    else {
      const { GET: rosterGET } = await import('@/app/api/players/[hsid]/route');
      const response = await rosterGET(input.request, { params: Promise.resolve({ hsid: input.hsid }) });
      if (!response.ok) throw new Error('Canonical school alumni roster is unavailable');
      home = await response.json() as TribuneRosterPlayer[];
    }
  }
  if (!Array.isArray(home)) throw new Error('Canonical school alumni roster is invalid');
  const homeIds = new Set(home.map(p => String(p.playerid)));
  const extras = [...new Map(input.extraFavorites.filter(p => !homeIds.has(String(p.playerid))).map(p => [String(p.playerid), p])).values()];
  const start = input.period.cadence === 'daily' ? monday(input.period.start) : input.period.start;
  const day = input.period.cadence === 'daily' ? daysBetween(input.period.start, start) : undefined;
  const hsids = [...new Set([input.hsid, ...extras.map(p => String(p.hsid || ''))].filter(h => /^\d{1,7}$/.test(h)))];
  const readLive = async (sourceStart: string, weeks: number, schools: string[]): Promise<LivePayload> => {
    const combined: LivePayload = { asOf: (sources.now?.() || new Date()).toISOString(), start: sourceStart, weeks, roster: {}, lines: [], clubs: {}, games: {}, fans: {} };
    for (let offset = 0; offset < schools.length; offset += 64) {
      const chunk = schools.slice(offset, offset + 64);
      let data: LivePayload;
      if (sources.live) data = await sources.live(sourceStart, weeks, chunk);
      else {
        const { NextRequest: Request } = await import('next/server');
        const { GET: liveGET } = await import('@/app/api/bracket/live/route');
        const url = new URL('/api/bracket/live', origin);
        url.searchParams.set('start', sourceStart); url.searchParams.set('weeks', String(weeks)); url.searchParams.set('h', chunk.join(','));
        const response = await liveGET(new Request(url));
        if (!response.ok) throw new Error('Recorded alumni game data is unavailable');
        data = await response.json() as LivePayload;
      }
      if (!data.roster || !Array.isArray(data.lines) || !data.clubs) throw new Error('Recorded alumni game data is invalid');
      Object.assign(combined.roster, data.roster); combined.lines.push(...data.lines);
      Object.assign(combined.clubs, data.clubs); Object.assign(combined.games!, data.games); Object.assign(combined.fans!, data.fans);
    }
    return combined;
  };
  let live: LivePayload | undefined;
  try { live = await readLive(start, 1, hsids); }
  catch { notices.push('The real-game feed could not be loaded. Unavailable statistics are shown as dashes, never as zero production.'); }
  const sourceHomeIds = new Set((live?.roster[input.hsid] || []).map(p => p[0]));
  const populationMismatch = Boolean(live) && (sourceHomeIds.size !== homeIds.size || [...homeIds].some(id => !sourceHomeIds.has(id)));
  if (populationMismatch) notices.push('The school roster and live scoring population do not match. This edition must be refreshed before delivery.');
  // A requested historical period must not silently include later game lines.
  if (live) {
    const through = daysBetween(input.period.end, start);
    live = { ...live, lines: live.lines.filter(l => l[2] <= through),
      clubs: Object.fromEntries(Object.entries(live.clubs).map(([k, list]) => [k, list.filter(g => g[0] <= through)])) };
  }
  const homeRoster = live
    ? buildTribuneSchoolStats(live, { schoolId: input.hsid, title: input.schoolName || 'Home-school alumni', roster: home, start, asOf: input.period.end, day, schoolUrl })
    : toTribuneRoster({ schoolId: input.hsid, title: input.schoolName || 'Home-school alumni', roster: home, available: false, schoolUrl });
  let follows: TribuneRoster | undefined;
  if (extras.length) {
    const rows: PlayerRow[] = [];
    if (live) for (const h of [...new Set(extras.map(p => String(p.hsid || '')).filter(Boolean))]) {
      const data = scoreLiveSchoolWeek(live, { schoolId: h, weekStart: start, asOf: input.period.end });
      rows.push(...(day == null ? data.side.p : data.side.days?.[day] || []));
    }
    const allowed = new Set(extras.map(p => String(p.playerid)));
    const selected = rows.filter(p => allowed.has(p[0]));
    follows = toTribuneRoster({ title: 'Beyond your home school', roster: extras, sideBox: live ? { p: selected, wl: sumWl(selected) } : undefined, available: Boolean(live), schoolUrl });
    follows.note = 'These are your followed players from other schools. Their production does not contribute to your home school’s fantasy score. W-L is each player’s real club record.';
  }
  let matchup: TribuneMatchup | undefined;
  try {
    // This is the SAME seed-only boundary the school hub uses. No fixture score,
    // historical winner or generated later-round opponent survives normalization.
    let seed: Index;
    if (sources.seed) seed = await sources.seed();
    else {
      const response = await fetch(new URL('/bracket-lab/2026/index.json', origin), { next: { revalidate: 300 } });
      if (!response.ok) throw new Error('Tournament field unavailable');
      seed = await response.json() as Index;
    }
    let index = toProductionTournamentIndex(seed);
    const asOf = tournamentDateAt(sources.now?.());
    const matchupDate = input.period.cadence === 'weekly' ? input.period.end : asOf;
    const week = asOf < TOURNAMENT_2027.start ? 1 : index.weeks.findIndex(([a, b]) => matchupDate >= a && matchupDate <= b) + 1;
    const games = index.rounds.flatMap(r => r.series.flatMap(s => s[7]));
    let game = games.find(g => g[1] === week && (String(g[2]) === input.hsid || String(g[3]) === input.hsid));
    if (game) {
      if (asOf < index.weeks[game[1] - 1][0]) matchup = toTribuneMatchup({ game, index, asOf });
      else {
        // A region is a sufficient existing first-round cohort; batch all of it
        // so the no-alumni day clock matches the hub, without an unbounded query.
        const region = index.schools[input.hsid]?.[1];
        const cohort = Object.keys(index.schools).filter(h => index.schools[h][1] === region);
        const data = await readLive(index.weeks[0][0], week, cohort);
        const scoped = { ...index, rounds: index.rounds.map(r => ({ ...r, series: r.series.filter(s => s[0] === region) })) };
        const scored = scoreLiveIndex(scoped, data, asOf);
        index = scored.index;
        const scoredGames = index.rounds.flatMap(r => r.series.flatMap(s => s[7]));
        const selectedGameId = game[0];
        game = scoredGames.find(g => g[0] === selectedGameId)!;
        // Match the hub's Monday lead: last week's final stays on the front
        // page until the new week's first inning reaches the bottom.
        const clock = scored.innings[String(game[0])];
        if (input.period.cadence === 'daily' && clock?.day === 0 && clock.phase === 'top') {
          game = scoredGames.find(g => g[1] === week - 1 && (String(g[2]) === input.hsid || String(g[3]) === input.hsid)) || game;
        }
        matchup = toTribuneMatchup({ game, index, box: scored.boxes[String(game[0])], liveInning: scored.innings[String(game[0])], asOf });
      }
    } else notices.push('The tournament source has not published this school’s current matchup. No opponent or result has been invented.');
  } catch { notices.push('The fantasy matchup could not be loaded. The alumni tables use the separately verified real-game feed.'); }
  const allRows = [...homeRoster.batting.rows, ...homeRoster.pitching.rows, ...(follows?.batting.rows || []), ...(follows?.pitching.rows || [])];
  const selectedIds = new Set([...home, ...extras].map(p => String(p.playerid)));
  return { homeRoster, follows, matchup, dataStatus: live && !populationMismatch && allRows.every(r => r.state !== 'unavailable') ? 'verified' : 'unavailable', notices,
    statLineCount: live?.lines.filter(l => selectedIds.has(l[1]) && (day == null || l[2] === day)).length || 0 };
}
