// The Gazette's "Hamilton's Week" letter (Pete, Nov 24 2026), worded as the
// approved TEST 2 / TEST 3 proofs (docs/newsletter-reference/). Written once
// per school per week by the publisher from stored results; every fan's email
// only reads it. Nothing here scores a game.

export type StoryPlayer = [string, string, string, 0 | 1, number[] | 0, number[] | 0, number | null, number | null, ([number, number] | null)?, (0 | 1)?];
export type StoryGame = {
  stage: string; round: number; round_name?: string | null; region: number; series_no: number; game_no: number; week: number;
  home_hsid: number | null; away_hsid: number | null; home_seed: number | null; away_seed: number | null;
  home_runs?: number | null; away_runs?: number | null; winner_hsid: number | null;
  box?: { h: { p: StoryPlayer[] }; a: { p: StoryPlayer[] } } | null;
};
export type SchoolInfo = { name: string; city?: string | null; nickname?: string | null };
export type WeeklyStory = { title: string; paragraphs: string[] };

const MONTH = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' });
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const ip = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;
const seedOf = (g: StoryGame, h: number) => (g.home_hsid === h ? g.home_seed : g.away_seed);
const runsOf = (g: StoryGame, h: number) => Number(g.home_hsid === h ? g.home_runs : g.away_runs) || 0;
const sideOf = (g: StoryGame, h: number): 'h' | 'a' => (g.home_hsid === h ? 'h' : 'a');
const named = (seed: number | null | undefined, name: string) => (seed ? `No. ${seed} ${name}` : name);

/** The alumni who carried the week (or the series): best two hitters by OPS+, best pitcher by FIP-. */
function carried(players: StoryPlayer[], levelOf: (id: string) => string | undefined = () => undefined): string[] {
  const bats = players.filter((p) => Array.isArray(p[4]) && (p[4][1] > 0 || p[4][0] > 0) && p[6] != null)
    .sort((a, b) => Number(b[6]) - Number(a[6]) || (b[4] as number[])[2] - (a[4] as number[])[2]).slice(0, 2);
  const arms = players.filter((p) => Array.isArray(p[5]) && (p[5][0] > 0) && p[7] != null)
    .sort((a, b) => Number(a[7]) - Number(b[7]) || (b[5] as number[])[0] - (a[5] as number[])[0]).slice(0, 1);
  return [
    ...bats.map((p) => {
      const s = p[4] as number[];
      const extras = [s[5] && plural(s[5], 'homer'), s[3] && plural(s[3], 'double'), s[4] && plural(s[4], 'triple'), s[6] && plural(s[6], 'walk')].filter(Boolean);
      return `${p[1]} (${levelOf(p[0]) || p[2]}) went ${s[2]}-for-${s[1]}${extras.length ? ' with ' + extras.join(', ') : ''}`;
    }),
    ...arms.map((p) => {
      const s = p[5] as number[];
      return `${p[1]} (${levelOf(p[0]) || p[2]}) worked ${ip(s[0])} innings with ${plural(s[4], 'strikeout')} and ${plural(s[7], 'earned run')}`;
    }),
  ];
}

/** Sum the same players across several stored games (a series), keeping a PA- / outs-weighted OPS+ / FIP-. */
function sumPlayers(lists: StoryPlayer[][]): StoryPlayer[] {
  const by = new Map<string, { p: StoryPlayer; b: number[] | 0; q: number[] | 0; o: [number, number]; f: [number, number] }>();
  for (const list of lists) for (const p of list) {
    const x = by.get(p[0]) || { p, b: 0 as number[] | 0, q: 0 as number[] | 0, o: [0, 0] as [number, number], f: [0, 0] as [number, number] };
    if (Array.isArray(p[4])) { x.b = x.b ? x.b.map((v, i) => v + (p[4] as number[])[i]) : [...p[4]]; if (p[6] != null) { x.o[0] += p[6] * p[4][0]; x.o[1] += p[4][0]; } }
    if (Array.isArray(p[5])) { x.q = x.q ? x.q.map((v, i) => v + (p[5] as number[])[i]) : [...p[5]]; if (p[7] != null) { x.f[0] += p[7] * p[5][0]; x.f[1] += p[5][0]; } }
    by.set(p[0], x);
  }
  return [...by.values()].map(({ p, b, q, o, f }) => [p[0], p[1], p[2], p[3], b, q, o[1] ? o[0] / o[1] : null, f[1] ? f[0] / f[1] : null] as StoryPlayer);
}

/** The letter for one school's game this week. games: every stored game of the season. */
export function weeklyStory(game: StoryGame, hsid: number, games: StoryGame[], info: (h: number) => SchoolInfo,
  monday: string, sunday: string, nextMonday: string,
  /** The level each player played at this week (from his game lines); his roster level otherwise. */
  levelOf: (id: string) => string | undefined = () => undefined): WeeklyStory {
  const opp = game.home_hsid === hsid ? Number(game.away_hsid) : Number(game.home_hsid);
  const me = info(hsid), them = info(opp);
  const mine = runsOf(game, hsid), theirs = runsOf(game, opp);
  const won = game.winner_hsid === hsid;
  const round = game.round_name || `Round ${game.round}`;
  const dates = `(${MONTH(monday)}–${MONTH(sunday)})`;
  const result = `${named(seedOf(game, hsid), me.name)} ${won ? 'beat' : 'lost to'} ${named(seedOf(game, opp), them.name)} ${Math.max(mine, theirs)}-${Math.min(mine, theirs)}`;
  const weekPlayers = game.box ? game.box[sideOf(game, hsid)].p : [];
  if (game.stage !== 'bracket') {
    const who = carried(weekPlayers, levelOf);
    return { title: won ? `${me.name} beats ${them.name}, ${mine}-${theirs}.` : `${me.name} falls to ${them.name}, ${theirs}-${mine}.`,
      paragraphs: [`${result} in Week ${game.week} ${dates}. Every run counts toward the Total Runs race.`,
        who.length ? `The alumni who carried the week: ${who.join('; ')}.` : `No ${me.name} alumni played this week.`] };
  }
  const series = games.filter((g) => g.stage === game.stage && g.round === game.round && g.region === game.region && g.series_no === game.series_no && g.week <= game.week)
    .sort((a, b) => a.game_no - b.game_no);
  const wins = series.filter((g) => g.winner_hsid === hsid).length, losses = series.filter((g) => g.winner_hsid === opp).length;
  const over = series.length === 3 && game.game_no === 3;
  if (!over) {
    const status = wins === losses ? `The series is tied ${wins}-${losses}.` : `${wins > losses ? me.name : them.name} leads the series ${Math.max(wins, losses)}-${Math.min(wins, losses)}.`;
    const who = carried(weekPlayers, levelOf);
    return { title: won ? `${me.name} beats ${them.name}, ${mine}-${theirs}.` : `${me.name} falls to ${them.name}, ${theirs}-${mine}.`,
      paragraphs: [`${result} in Week ${game.week} of ${round} ${dates}. ${status}`,
        who.length ? `Leading the way for the ${me.nickname || me.name}: ${who.join('; ')}.` : `No ${me.name} alumni played this week.`] };
  }
  const scores = series.map((g) => `${runsOf(g, hsid)}-${runsOf(g, opp)}`).join(', ');
  const forRuns = series.reduce((t, g) => t + runsOf(g, hsid), 0), against = series.reduce((t, g) => t + runsOf(g, opp), 0);
  const seriesWon = wins > losses;
  const title = seriesWon
    ? (losses === 0 ? `${me.name} sweeps ${them.name}, ${wins}-0.` : `${me.name} wins the series over ${them.name}, ${wins}-${losses}.`)
    : `${them.name} wins the series over ${me.name}, ${losses}-${wins}.`;
  const first = `${round} is in the books${seriesWon && losses === 0 ? `, and the ${me.nickname || me.name} didn't drop a game` : ''}. ` +
    `${named(seedOf(game, hsid), me.name)} ${seriesWon ? 'beat' : 'lost to'} ${named(seedOf(game, opp), them.name)} ${wins}-${losses} in the best-of-three (${scores}), ` +
    `${forRuns >= against ? 'outscoring them' : 'outscored'} ${Math.max(forRuns, against)}-${Math.min(forRuns, against)} over the three weeks.`;
  const next = games.find((g) => g.week === game.week + 1 && (g.home_hsid === hsid || g.away_hsid === hsid));
  let nextLine = '';
  if (next) {
    const n = next.home_hsid === hsid ? Number(next.away_hsid) : Number(next.home_hsid);
    const ni = info(n);
    nextLine = next.stage === 'bracket'
      ? ` Next up: ${named(seedOf(next, n), ni.name)}${ni.city ? ` (${ni.city})` : ''} in ${next.round_name || `Round ${next.round}`}, starting today, ${MONTH(nextMonday)}.`
      : ` Next up: ${ni.name}${ni.city ? ` (${ni.city})` : ''}, starting today, ${MONTH(nextMonday)}. Every run counts toward the Total Runs race.`;
  }
  const who = carried(sumPlayers(series.map((g) => (g.box ? g.box[sideOf(g, hsid)].p : []))), levelOf);
  return { title, paragraphs: [first + nextLine, who.length ? `The alumni who carried the series: ${who.join('; ')}.` : `No ${me.name} alumni played in the series.`] };
}
