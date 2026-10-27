// The bracket results job: scores every started game of a fantasy season
// with the bracket engine - the scoreboard's own code (liveSeason.ts
// scoreLive) on the scoreboard's own data (/api/bracket/live) - and writes
// the results into master_bracket, so the school pages, the newsletters and
// the Monday email all read one stored answer.
//
//   - Each started game gets its innings, score, status and stat-drawer box.
//   - A game is final at 4 a.m. Arizona the Monday after its week; it's then
//     locked. If a later run scores a locked final differently (a stat
//     correction), the stored result stays and the difference goes on Pete's
//     needs-decision list.
//   - A game tied after every tiebreaker with no ruling in
//     commissioner_rulings waits as 'awaiting_commissioner' and goes on the
//     needs-decision list. The next run after a ruling is recorded finishes it.
//   - Once a series is decided its winner fills the next round's slot. Home is
//     the better (lower) original seed; two equal seeds go on the
//     needs-decision list rather than being guessed.
//   - Held stat lines are landed again first (stat_lines_reland_held), so a
//     team or level Pete adds takes effect on its own.
//
//   DATABASE_URL=... npx --yes tsx scripts/master-bracket-results.ts [--season <key>] [--asof YYYY-MM-DD] [--dry-run]
//     Every season live on the bracket's day (or the Monday after its last
//     week) unless --season. Live data from
//     ${BRACKET_LIVE_BASE_URL:-https://yatstats.com}/api/bracket/live.
//
//   npx --yes tsx scripts/master-bracket-results.ts --offline <dir> --season <key> --asof YYYY-MM-DD [--no-box]
//     No database: reads <dir>/season.json, rows.json, rulings.json and
//     live.json (the rows as the database returns them, the live data as the
//     API does) and prints the SQL it would run.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
import { COMMISSIONER_DECISIONS } from '@/lib/bracket/commissioner';
import { scoreLive, type Live } from '@/components/bracket/liveSeason';
import { tieNote, type GameBox, type GameRow, type Index, type SeriesRow } from '@/components/bracket/gallery';

type Season = { season_key: string; is_test: boolean; opening_day: string; last_day: string; weeks: number; regions: number; schools_per_region: number };
type Row = {
  stage: string; region: number; round: number; series_no: number; game_no: number; game_id: number; week: number;
  home_hsid: number | null; away_hsid: number | null; home_seed: number | null; away_seed: number | null;
  home_school_name: string | null; away_school_name: string | null; status: string;
  innings: number[] | null; winner_hsid: number | null; decided_by: string | null; locked_at: string | null;
  box_missing?: boolean;
};
type Ruling = { region: number; week: number; home_hsid: number; away_hsid: number; winner_hsid: number };
type Result = {
  region: number; game_id: number; status: string; innings: number[]; home_runs: number; away_runs: number;
  winner_hsid: number | null; decided_by: string | null; decided_note: string | null; box: GameBox | null; lock: boolean;
};
type Fill = { region: number; game_id: number; home_hsid: number; away_hsid: number; home_seed: number; away_seed: number; home_school_name: string | null; away_school_name: string | null };
type Decision = { kind: string; ref: string; summary: string; details: unknown };
type BoxFill = { region: number; game_id: number; box: GameBox };

const iso =(t: number) => new Date(t).toISOString().slice(0, 10);
// The bracket's day: the date in Arizona (UTC-7, no DST), turning over at 4 a.m.
const bracketDay = (now = Date.now()) => iso(now - 11 * 3600000);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

// The live data for a set of schools, asked 64 at a time (the route's limit)
// and merged.
async function fetchLive(base: string, start: string, weeks: number, hsids: number[]): Promise<Live> {
  const out: Live = { asOf: '', roster: {}, lines: [], clubs: {}, games: {}, fans: {} } as unknown as Live;
  for (let i = 0; i < hsids.length; i += 64) {
    const url = `${base}/api/bracket/live?start=${start}&weeks=${weeks}&h=${hsids.slice(i, i + 64).join(',')}`;
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    mergeLive(out, await res.json() as Live);
  }
  return out;
}
function mergeLive(into: Live, part: Live) {
  into.asOf = into.asOf || part.asOf;
  Object.assign(into.roster, part.roster);
  into.lines.push(...part.lines);
  Object.assign(into.fans || (into.fans = {}), part.fans || {});
  for (const key of ['clubs', 'games'] as const) {
    const target = (into[key] || (into[key] = {})) as Record<string, unknown[][]>;
    for (const [club, list] of Object.entries((part[key] || {}) as Record<string, unknown[][]>)) {
      const have = new Set((target[club] || []).map((g) => String(g[1])));
      target[club] = [...(target[club] || []), ...list.filter((g) => !have.has(String(g[1])))];
    }
  }
}

// The scoreboard's index for a set of rows: the season's weeks, its
// schools and every bracket series whose two schools are known.
function buildIndex(season: Season, rows: Row[]): Index {
  const weeks = tournamentWeeks(season.opening_day, season.weeks);
  const schools: Index['schools'] = {};
  const rounds = new Map<number, SeriesRow[]>();
  const series = new Map<string, SeriesRow>();
  const sorted = [...rows].sort((a, b) => a.round - b.round || a.region - b.region || a.series_no - b.series_no || a.game_no - b.game_no);
  for (const r of sorted) {
    if (r.stage !== 'bracket' || r.home_hsid == null || r.away_hsid == null) continue;
    schools[r.home_hsid] ||= [r.home_school_name || String(r.home_hsid), r.region, r.home_seed ?? 0];
    schools[r.away_hsid] ||= [r.away_school_name || String(r.away_hsid), r.region, r.away_seed ?? 0];
    const key = `${r.round}:${r.region}:${r.series_no}`;
    let s = series.get(key);
    if (!s) {
      s = [r.region, r.home_hsid, r.away_hsid, r.home_seed ?? 0, r.away_seed ?? 0, 0, [0, 0], []];
      series.set(key, s);
      (rounds.get(r.round) || rounds.set(r.round, []).get(r.round)!).push(s);
    }
    s[7].push([r.game_id, r.week, r.home_hsid, r.away_hsid, '', [], null] as GameRow);
  }
  return {
    season: Number(season.opening_day.slice(0, 4)), weeks, schools,
    rounds: [...rounds.entries()].sort(([a], [b]) => a - b).map(([r, list]) => ({
      r, name: `Round ${r}`, start: weeks[(r - 1) * 3]?.[0] || '', end: weeks[r * 3 - 1]?.[1] || '', series: list,
    })),
    lbt: [], gf: [], champion: 0, lbLeaders: [], lbChampion: 0,
  } as unknown as Index;
}

const ref = (season: string, r: { region: number; week: number; home_hsid: number | null; away_hsid: number | null }) =>
  `${season}:${r.region}:${r.week}:${r.home_hsid}:${r.away_hsid}`;

// Score one group of rows (a test bracket, or a whole 2027 season) and say
// what to write.
function scoreGroup(season: Season, rows: Row[], rulings: Ruling[], live: Live, asof: string, withBox: boolean) {
  const idx = buildIndex(season, rows);
  for (const k of Object.keys(COMMISSIONER_DECISIONS)) delete COMMISSIONER_DECISIONS[k];
  for (const r of rulings) COMMISSIONER_DECISIONS[`${r.week}:${r.home_hsid}:${r.away_hsid}`] = r.winner_hsid;
  const boxes = scoreLive(idx, live, asof);

  const byId = new Map(rows.map((r) => [r.game_id, r]));
  const results: Result[] = [];
  const decisions: Decision[] = [];
  const boxFills: BoxFill[] = [];
  for (const round of idx.rounds) for (const s of round.series as SeriesRow[]) for (const g of s[7]) {
    const row = byId.get(g[0])!;
    const [ws] = idx.weeks[g[1] - 1] || [];
    if (!ws || ws > asof) continue; // not started
    const innings = g[5];
    const decided = g[4];
    const status = !decided ? 'in_progress' : decided === 'commissioner-pending' ? 'awaiting_commissioner' : 'final';
    const res: Result = {
      region: row.region, game_id: g[0], status, innings,
      home_runs: innings.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0),
      away_runs: innings.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0),
      winner_hsid: status === 'final' ? g[6] : null,
      decided_by: decided || null,
      decided_note: decided && decided !== 'runs' ? tieNote(decided) || null : null,
      box: withBox ? boxes[String(g[0])] || null : null,
      lock: status === 'final',
    };
    if (row.locked_at) {
      const was = { status: row.status, innings: (row.innings || []).map(Number), winner: num(row.winner_hsid), by: row.decided_by };
      const now = { status: res.status, innings: res.innings, winner: res.winner_hsid, by: res.decided_by };
      if (JSON.stringify(was) !== JSON.stringify(now)) {
        decisions.push({
          kind: 'locked_final_changed', ref: `${season.season_key}:${row.region}:${row.game_id}`,
          summary: `${row.away_school_name} at ${row.home_school_name} (week ${row.week}) was locked final; the stats now score it differently. The locked result stands until you decide.`,
          details: { locked: was, now },
        });
      } else if (row.box_missing && res.box) {
        // A final locked without its stat drawer gets it once, the result
        // untouched (the newsletters print the drawer's lines).
        boxFills.push({ region: row.region, game_id: g[0], box: res.box });
      }
      continue;
    }
    if (status === 'awaiting_commissioner') {
      decisions.push({
        kind: 'commissioner_ruling', ref: ref(season.season_key, row),
        summary: `${row.away_school_name} at ${row.home_school_name} (week ${row.week}, ${season.is_test ? `bracket ${row.region}` : `region ${row.region}`}) is tied after every tiebreaker: it needs the commissioner's ruling.`,
        details: { innings, home_runs: res.home_runs, away_runs: res.away_runs },
      });
    }
    results.push(res);
  }
  return { results, decisions, boxFills };
}

// Fill the next round's slots from decided series (results applied first).
function nextRoundFills(season: Season, rows: Row[], results: Result[]) {
  const regionRounds = Math.log2(season.schools_per_region);
  const lastRound = season.is_test ? regionRounds : regionRounds + Math.log2(season.regions);
  const now = new Map(results.map((r) => [`${r.region}:${r.game_id}`, r]));
  const state = (r: Row) => {
    const x = now.get(`${r.region}:${r.game_id}`);
    return x ? { status: x.status, winner: x.winner_hsid } : { status: r.status, winner: num(r.winner_hsid) };
  };
  type Series = { region: number; round: number; series_no: number; games: Row[] };
  const series = new Map<string, Series>();
  for (const r of rows) {
    if (r.stage !== 'bracket') continue;
    const k = `${r.round}:${r.region}:${r.series_no}`;
    (series.get(k) || series.set(k, { region: r.region, round: r.round, series_no: r.series_no, games: [] }).get(k)!).games.push(r);
  }
  // A series' winner: 2 wins.
  const winnerOf = (s: Series) => {
    const g0 = s.games[0];
    if (g0.home_hsid == null || g0.away_hsid == null) return null;
    let h = 0, a = 0;
    for (const g of s.games) {
      const st = state(g);
      if (st.status !== 'final') continue;
      if (st.winner === num(g0.home_hsid)) h++;
      else if (st.winner === num(g0.away_hsid)) a++;
    }
    if (h >= 2) return { hsid: num(g0.home_hsid)!, seed: num(g0.home_seed)!, name: g0.home_school_name };
    if (a >= 2) return { hsid: num(g0.away_hsid)!, seed: num(g0.away_seed)!, name: g0.away_school_name };
    return null;
  };
  // Where a series' winner goes: [round, region, series_no, first or second].
  const next = (s: Series): [number, number, number, 0 | 1] | null => {
    if (s.round >= lastRound) return null;
    if (s.round < regionRounds) return [s.round + 1, s.region, Math.ceil(s.series_no / 2), (s.series_no % 2 ? 0 : 1)];
    if (s.round === regionRounds) return [s.round + 1, 0, Math.ceil(s.region / 2), (s.region % 2 ? 0 : 1)];
    return [s.round + 1, 0, Math.ceil(s.series_no / 2), (s.series_no % 2 ? 0 : 1)];
  };
  const feeders = new Map<string, [ReturnType<typeof winnerOf>, ReturnType<typeof winnerOf>]>();
  for (const s of series.values()) {
    const to = next(s);
    if (!to) continue;
    const k = `${to[0]}:${to[1]}:${to[2]}`;
    const pair = feeders.get(k) || [null, null];
    pair[to[3]] = winnerOf(s);
    feeders.set(k, pair);
  }
  const fills: Fill[] = [];
  const decisions: Decision[] = [];
  for (const [k, [first, second]] of feeders) {
    const target = series.get(k);
    if (!target || !first || !second) continue;
    const g0 = target.games[0];
    if (g0.home_hsid != null) {
      const have = new Set([num(g0.home_hsid), num(g0.away_hsid)]);
      if (!have.has(first.hsid) || !have.has(second.hsid)) {
        decisions.push({
          kind: 'pairing_changed', ref: `${season.season_key}:${target.round}:${target.region}:${target.series_no}`,
          summary: `Round ${target.round} series ${target.series_no} already has ${g0.away_school_name} at ${g0.home_school_name}, but the series before it now send ${first.name} and ${second.name}.`,
          details: { stored: [g0.home_hsid, g0.away_hsid], now: [first.hsid, second.hsid] },
        });
      }
      continue;
    }
    if (first.seed === second.seed) {
      decisions.push({
        kind: 'home_team', ref: `${season.season_key}:${target.round}:${target.region}:${target.series_no}`,
        summary: `${first.name} and ${second.name} are both seed ${first.seed}: who is home in Round ${target.round}?`,
        details: { first, second },
      });
      continue;
    }
    const [home, away] = first.seed < second.seed ? [first, second] : [second, first];
    for (const g of target.games) {
      fills.push({ region: g.region, game_id: g.game_id, home_hsid: home.hsid, away_hsid: away.hsid, home_seed: home.seed, away_seed: away.seed, home_school_name: home.name, away_school_name: away.name });
    }
  }
  return { fills, decisions };
}

function computeSeason(season: Season, rows: Row[], rulings: Ruling[], live: Live, asof: string, withBox: boolean) {
  // A test bracket is its own field; the 2027 regions share one.
  const groups = season.is_test ? [...new Set(rows.map((r) => r.region))].map((g) => rows.filter((r) => r.region === g)) : [rows];
  const results: Result[] = [];
  const decisions: Decision[] = [];
  const boxFills: BoxFill[] = [];
  for (const group of groups) {
    const region = group[0]?.region;
    const out = scoreGroup(season, group, season.is_test ? rulings.filter((r) => r.region === region) : rulings, live, asof, withBox);
    results.push(...out.results);
    decisions.push(...out.decisions);
    boxFills.push(...out.boxFills);
  }
  const { fills, decisions: more } = nextRoundFills(season, rows, results);
  return { results, fills, decisions: [...decisions, ...more], boxFills };
}

const startedWeeks = (season: Season, asof: string) =>
  tournamentWeeks(season.opening_day, season.weeks).filter(([a]) => a <= asof).length;
const fieldOf = (rows: Row[]) =>
  [...new Set(rows.flatMap((r) => (r.stage === 'bracket' ? [r.home_hsid, r.away_hsid] : [])).filter((h): h is number => h != null).map(Number))];

const SQL_RESULTS = `
UPDATE public.master_bracket m SET
  status = x.status, innings = x.innings, home_runs = x.home_runs, away_runs = x.away_runs,
  winner_hsid = x.winner_hsid, decided_by = x.decided_by, decided_note = x.decided_note,
  box = CASE WHEN $3 THEN x.box ELSE m.box END, computed_at = now(),
  locked_at = CASE WHEN x.lock THEN now() ELSE NULL END
FROM jsonb_to_recordset($2::jsonb) AS x(region smallint, game_id integer, status text, innings smallint[], home_runs smallint,
  away_runs smallint, winner_hsid integer, decided_by text, decided_note text, box jsonb, lock boolean)
WHERE m.season_key = $1 AND m.region = x.region AND m.game_id = x.game_id AND m.locked_at IS NULL`;
const SQL_FILLS = `
UPDATE public.master_bracket m SET
  home_hsid = x.home_hsid, away_hsid = x.away_hsid, home_seed = x.home_seed, away_seed = x.away_seed,
  home_school_name = x.home_school_name, away_school_name = x.away_school_name, status = 'scheduled'
FROM jsonb_to_recordset($2::jsonb) AS x(region smallint, game_id integer, home_hsid integer, away_hsid integer,
  home_seed smallint, away_seed smallint, home_school_name text, away_school_name text)
WHERE m.season_key = $1 AND m.region = x.region AND m.game_id = x.game_id AND m.status = 'tbd'`;
const SQL_DECISIONS = `
INSERT INTO public.needs_decision (kind, season_key, ref, summary, details)
SELECT x.kind, $1, x.ref, x.summary, x.details FROM jsonb_to_recordset($2::jsonb) AS x(kind text, ref text, summary text, details jsonb)
ON CONFLICT (kind, ref) DO NOTHING`;
// Only the box of a locked final that has none; run with the lock lifted
// for this purpose (the guard trigger), last in the transaction.
const SQL_BOXES = `
UPDATE public.master_bracket m SET box = x.box
FROM jsonb_to_recordset($2::jsonb) AS x(region smallint, game_id integer, box jsonb)
WHERE m.season_key = $1 AND m.region = x.region AND m.game_id = x.game_id AND m.locked_at IS NOT NULL AND m.box IS NULL`;

// The team list stays complete: every team on MLB's lists for this season
// and next must have a teamid (team_id_map) before it plays, and any stat
// line still held is one item per team on Pete's needs-decision list - never
// one per line.
const MLB_SPORTS = '1,11,12,13,14,16,17,23';
async function checkTeams(pool: Pool) {
  const year = Number(bracketDay().slice(0, 4));
  const listed = new Map<number, string>();
  for (const season of [year, year + 1]) {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/teams?sportIds=${MLB_SPORTS}&season=${season}&fields=teams,id,name,sport,league`);
    if (!res.ok) { console.log(`MLB team list ${season}: HTTP ${res.status}`); continue; }
    const { teams = [] } = await res.json() as { teams?: { id: number; name: string; sport?: { name?: string }; league?: { name?: string } }[] };
    for (const t of teams) listed.set(t.id, `${t.name} (${[t.sport?.name, t.league?.name].filter(Boolean).join(' / ')})`);
  }
  const { rows: mapped } = await pool.query<{ id: number }>('SELECT DISTINCT mlb_stats_api_id AS id FROM public.team_id_map WHERE mlb_stats_api_id IS NOT NULL');
  const known = new Set(mapped.map((r) => Number(r.id)));
  const decisions: Decision[] = [...listed].filter(([id]) => !known.has(id)).map(([id, name]) => ({
    kind: 'new_mlb_team', ref: `mlb_team:${id}`,
    summary: `MLB lists ${name} (MLB team ${id}), which isn't in the team list yet: add it with its level before it plays.`,
    details: { mlb_team_id: id, name },
  }));
  const { rows: held } = await pool.query<{ hold_reason: string; source_team_id: string | null; team_name: string | null; lines: string; first_game: string; last_game: string }>(
    `SELECT hold_reason, source_team_id, team_name, sum(lines)::text AS lines, min(first_game)::text AS first_game, max(last_game)::text AS last_game
       FROM public.stat_line_holds GROUP BY 1, 2, 3`,
  );
  for (const h of held) {
    decisions.push({
      kind: 'stat_line_hold', ref: `${h.source_team_id || h.team_name}:${h.hold_reason}`,
      summary: `${h.lines} stat lines (${h.first_game} to ${h.last_game}) are held: ${h.hold_reason}`,
      details: h,
    });
  }
  for (const d of decisions) console.log(`  needs decision: ${d.summary}`);
  if (decisions.length && !flag('dry-run')) await pool.query(SQL_DECISIONS, [null, JSON.stringify(decisions)]);
}

// innings go to Postgres as an array literal.
const forDb = (results: Result[]) => results.map((r) => ({ ...r, innings: `{${r.innings.join(',')}}` }));
const dollar = (s: string) => `$j$${s}$j$`;

async function main() {
  const seasonKey = arg('season');
  const asof = arg('asof') || bracketDay();
  const offline = arg('offline');
  const withBox = !flag('no-box');

  if (offline) {
    if (!seasonKey) throw new Error('--offline needs --season');
    const read = (f: string) => JSON.parse(readFileSync(join(offline, f), 'utf8'));
    const season: Season = read('season.json');
    const rows: Row[] = read('rows.json');
    const rulings: Ruling[] = read('rulings.json');
    const live: Live = read('live.json');
    const { results, fills, decisions, boxFills } = computeSeason(season, rows, rulings, live, asof, withBox);
    const sub = (sql: string, json: unknown) => sql.replaceAll('$1', `'${season.season_key}'`).replaceAll('$2', dollar(JSON.stringify(json))).replaceAll('$3', String(withBox)).trim();
    console.log(`-- ${season.season_key} as of ${asof}: ${results.length} results, ${fills.length} slots filled, ${decisions.length} for Pete, ${boxFills.length} locked finals get their box`);
    console.log(`${sub(SQL_RESULTS, forDb(results))};\n${sub(SQL_FILLS, fills)};\n${sub(SQL_DECISIONS, decisions)};`);
    if (boxFills.length) console.log(`SET LOCAL master_bracket.unlock = 'on';\n${sub(SQL_BOXES, boxFills)};`);
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const base = (process.env.BRACKET_LIVE_BASE_URL || 'https://yatstats.com').replace(/\/$/, '');
  try {
    const relanded = await pool.query('SELECT public.stat_lines_reland_held() AS n');
    console.log(`held stat lines landed again: ${relanded.rows[0].n}`);
    await checkTeams(pool);
    const { rows: seasons } = await pool.query<Season>(
      `SELECT season_key, is_test, opening_day::text, last_day::text, weeks, regions, schools_per_region
         FROM public.fantasy_seasons
        WHERE ($1::text IS NULL AND $2::date BETWEEN opening_day AND last_day + 1) OR season_key = $1`,
      [seasonKey || null, asof],
    );
    if (!seasons.length) console.log(`no fantasy season is live on ${asof}`);
    for (const season of seasons) {
      const { rows } = await pool.query<Row>(
        `SELECT stage, region, round, series_no, game_no, game_id, week, home_hsid, away_hsid, home_seed, away_seed,
                home_school_name, away_school_name, status, innings, winner_hsid, decided_by, locked_at,
                box IS NULL AS box_missing
           FROM public.master_bracket WHERE season_key = $1`,
        [season.season_key],
      );
      const { rows: rulings } = await pool.query<Ruling>(
        'SELECT region, week, home_hsid, away_hsid, winner_hsid FROM public.commissioner_rulings WHERE season_key = $1',
        [season.season_key],
      );
      const weeks = startedWeeks(season, asof);
      if (!weeks) { console.log(`${season.season_key}: nothing started by ${asof}`); continue; }
      const live = await fetchLive(base, season.opening_day, Math.min(weeks, 40), fieldOf(rows));
      const { results, fills, decisions, boxFills } = computeSeason(season, rows, rulings, live, asof, withBox);
      console.log(`${season.season_key} as of ${asof}: ${results.length} results (${results.filter((r) => r.lock).length} final), ${fills.length} slots filled, ${decisions.length} for Pete, ${boxFills.length} locked finals get their box`);
      for (const d of decisions) console.log(`  needs decision: ${d.summary}`);
      if (flag('dry-run')) continue;
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL master_bracket.reason = 'bracket results job'");
        await client.query(SQL_RESULTS, [season.season_key, JSON.stringify(forDb(results)), withBox]);
        await client.query(SQL_FILLS, [season.season_key, JSON.stringify(fills)]);
        await client.query(SQL_DECISIONS, [season.season_key, JSON.stringify(decisions)]);
        if (boxFills.length) {
          await client.query("SET LOCAL master_bracket.unlock = 'on'");
          await client.query("SET LOCAL master_bracket.reason = 'bracket results job: stat drawer added to a locked final (result unchanged)'");
          await client.query(SQL_BOXES, [season.season_key, JSON.stringify(boxFills)]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
