// The Gazette's "Hamilton's Week" letter (Pete, Nov 24 2026), worded as the
// approved TEST 2 / TEST 3 proofs (docs/newsletter-reference/). Written once
// per school per week by the publisher from stored results; every fan's email
// only reads it. Nothing here scores a game.

export type StoryPlayer = [string, string, string, 0 | 1, number[] | 0, number[] | 0, number | null, number | null, ([number, number] | null)?, (0 | 1)?];
export type StoryGame = {
  stage: string; round: number; round_name?: string | null; region: number; series_no: number; game_no: number; week: number;
  home_hsid: number | null; away_hsid: number | null; home_seed: number | null; away_seed: number | null;
  home_runs?: number | null; away_runs?: number | null; winner_hsid: number | null;
  /** The line score, home and away interleaved per inning: [h1, a1, h2, a2, ...] (master_bracket.innings). */
  innings?: number[] | null;
  /** days: each day's (inning 1-7's) player lines; wl: the alumni's real clubs' W-L that week. */
  box?: { h: { p: StoryPlayer[]; days?: StoryPlayer[][]; wl?: [number, number] }; a: { p: StoryPlayer[]; days?: StoryPlayer[][]; wl?: [number, number] };
    /** Innings 1-8: each side's team OPS+ and FIP- [home OPS+, away OPS+, home FIP-, away FIP-] (null: no one played). */
    d?: (number | null)[][] } | null;
};
export type SchoolInfo = { name: string; city?: string | null; nickname?: string | null };
export type WeeklyStory = { title: string; paragraphs: string[] };

const ORD = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const listOf = (xs: string[]) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const batted = (p: StoryPlayer) => Array.isArray(p[4]) && p[4][0] > 0;
const pitched = (p: StoryPlayer) => Array.isArray(p[5]) && p[5][0] > 0;

/**
 * The full recap (Pete, Nov 25 2026): a written story, not an inning-by-inning
 * list. It leads with the turning point (the inning the winner went ahead for
 * good) and who drove it, names the week's best contributors with their OPS+ /
 * FIP-, then the other innings worth a line; a run of quiet innings is one
 * phrase. Innings 1-7 are the week's days (one run for the better OPS+, one for
 * the better FIP-, a school with no one playing can't score: the live 'hold'
 * rule), the 8th is the whole week, the 9th the alumni's real clubs' W-L.
 */
function recap(game: StoryGame, hsid: number, me: SchoolInfo, them: SchoolInfo, levelOf: (id: string) => string | undefined): string[] {
  const inn = game.innings || [];
  const n = Math.min(9, Math.floor(inn.length / 2));
  if (!n || !game.box) return [];
  const home = game.home_hsid === hsid;
  const mine = (i: number) => Number(inn[2 * i + (home ? 0 : 1)]) || 0, theirs = (i: number) => Number(inn[2 * i + (home ? 1 : 0)]) || 0;
  const boxOf = (forMe: boolean) => game.box![forMe === home ? 'h' : 'a'];
  const winnerIsMe = game.winner_hsid === hsid;
  const wName = winnerIsMe ? me.name : them.name, lName = winnerIsMe ? them.name : me.name;
  const w = (i: number) => (winnerIsMe ? mine(i) : theirs(i)), l = (i: number) => (winnerIsMe ? theirs(i) : mine(i));
  // Who drove a side's run(s) in an inning: the day's best bat when the side won the
  // OPS+ run, the day's best arm when it won the FIP- run (the stored team numbers, box.d;
  // the live 'hold' rule: a side with no one playing can't score, and the other side
  // scores only by beating league average, 100).
  const won = (forMe: boolean, i: number) => {
    const d = game.box?.d?.[i];
    if (!d) return { bat: false, arm: false };
    const isHome = forMe === home;
    const [mo, oo, mp, op] = isHome ? [d[0], d[1], d[2], d[3]] : [d[1], d[0], d[3], d[2]];
    return { bat: mo != null && mo > (oo ?? 100), arm: mp != null && mp < (op ?? 100) };
  };
  const drivers = (forMe: boolean, i: number): string[] => {
    if (i === 8) { const wl = boxOf(forMe).wl; return wl && wl[0] + wl[1] ? [`their real clubs' ${wl[0]}-${wl[1]} week`] : []; }
    const list = i === 7 ? boxOf(forMe).p : boxOf(forMe).days?.[i] || [];
    const bat = list.filter((p) => batted(p) && p[6] != null).sort((a, b) => Number(b[6]) - Number(a[6]))[0];
    const arm = list.filter((p) => pitched(p) && p[7] != null).sort((a, b) => Number(a[7]) - Number(b[7]))[0];
    const runs = won(forMe, i), out: string[] = [];
    if (runs.bat && bat) out.push(`${bat[1]}'s bat (${Math.round(Number(bat[6]))} OPS+)`);
    if (runs.arm && arm) out.push(`${arm[1]} on the mound (${Math.round(Number(arm[7]))} FIP-)`);
    return out;
  };
  // The turning point: the first inning of the winner's final, unbroken lead.
  let ws = 0, ls = 0, turn = 0;
  for (let i = 0; i < n; i++) { ws += w(i); ls += l(i); if (ws <= ls) turn = i + 1; }
  if (game.winner_hsid == null || turn >= n) return [];
  const before = Array.from({ length: turn }, (_, i) => i);
  const wBefore = before.reduce((t, i) => t + w(i), 0), lBefore = before.reduce((t, i) => t + l(i), 0);
  const quietStart = before.every((i) => !w(i) && !l(i));
  const ti = turn;
  const tRuns = w(ti);
  const credit = drivers(winnerIsMe, ti);
  const runWord = tRuns === 1 ? 'a run' : `${WORDS[tRuns] || tRuns} runs`;
  const put = ti === 8
    ? `${wName} won the 9th, the inning for the alumni's real clubs${credit.length ? ` (${credit[0]})` : ''}`
    : `${wName} put up ${runWord}${ti === 7 ? ' in the 8th, the inning that scores the whole week' : ''}${credit.length ? ` with the help of ${listOf(credit)}` : ''}`;
  const inN = (x: number) => (x === 1 ? 'the 1st inning' : `the first ${WORDS[x] || x} innings`);
  const lead = turn === 0
    ? `${wName} took the lead in the 1st${credit.length ? ` with the help of ${listOf(credit)}` : ''} and never gave it back.`
    : quietStart
      ? `${turn === 1 ? 'Neither side scored in the 1st' : `Both teams struggled to put up any runs in ${inN(turn)}`}, but ${ti === 8 ? '' : `in the ${ORD(ti + 1)}, `}${put}.`
      : `It was ${wBefore === lBefore ? `tied ${wBefore}-${lBefore}` : `${lName} ${lBefore}, ${wName} ${wBefore}`} after ${WORDS[turn] || turn} innings, but ${ti === 8 ? '' : `in the ${ORD(ti + 1)}, `}${put}.`;
  const after = Array.from({ length: n - ti - 1 }, (_, k) => ti + 1 + k);
  const wAdds = after.filter((i) => w(i) > 0).map((i) => ORD(i + 1)), lAdds = after.filter((i) => l(i) > 0);
  const sentences = [lead];
  if (wAdds.length) sentences.push(`${wName === me.name ? `The ${me.name} alumni` : wName} never looked back, adding runs in the ${listOf(wAdds)}.`);
  // The loser's runs, and who got them.
  const lInnings = [...before.filter((i) => l(i) > 0), ...lAdds];
  if (lInnings.length) {
    const who = [...new Set(lInnings.flatMap((i) => drivers(!winnerIsMe, i)).map((x) => x.replace(/ \(.*\)$/, '').replace(/'s bat$| on the mound$/, '')).filter((x) => !x.startsWith('their real clubs')))];
    sentences.push(`${lName} answered in the ${listOf(lInnings.map((i) => ORD(i + 1)))}${who.length ? `, mostly behind ${listOf(who)}` : ''}.`);
  }
  // Runs of two or more innings after the turn where nobody scored: one phrase.
  const quiet: string[] = [];
  let k = 0;
  while (k < after.length) {
    let j = k; while (j < after.length && !w(after[j]) && !l(after[j])) j++;
    if (j - k >= 2) quiet.push(j - k === 2 ? `the ${ORD(after[k] + 1)} and ${ORD(after[j - 1] + 1)}` : `the ${ORD(after[k] + 1)} through the ${ORD(after[j - 1] + 1)}`);
    k = Math.max(j, k + 1);
  }
  if (quiet.length) sentences.push(`Neither side scored in ${quiet.join(' or ')}.`);
  return sentences;
}

/** The week's best contributors with their numbers: up to two bats with OPS+ 100 or better, up to two arms with FIP- 100 or better. */
function contributors(players: StoryPlayer[], levelOf: (id: string) => string | undefined): string[] {
  const level = (p: StoryPlayer) => levelOf(p[0]) || p[2];
  const bats = players.filter((p) => batted(p) && p[6] != null && Number(p[6]) >= 100).sort((a, b) => Number(b[6]) - Number(a[6])).slice(0, 2);
  const arms = players.filter((p) => pitched(p) && p[7] != null && Number(p[7]) <= 100).sort((a, b) => Number(a[7]) - Number(b[7])).slice(0, 2);
  return [
    ...bats.map((p) => { const b = p[4] as number[]; return `${p[1]} (${level(p)}) went ${b[2]}-for-${b[1]} (${Math.round(Number(p[6]))} OPS+)`; }),
    ...arms.map((p) => { const q = p[5] as number[]; return `${p[1]} (${level(p)}) worked ${ip(q[0])} innings with ${plural(q[4], 'strikeout')} (${Math.round(Number(p[7]))} FIP-)`; }),
  ];
}

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
  // The recap's opening and the rest (Pete, Nov 25 2026), for every kind of week.
  const story = recap(game, hsid, me, them, levelOf);
  const best = contributors(weekPlayers, levelOf);
  const forUs = me.nickname ? `the ${me.nickname}` : me.name;
  const opening = story.length ? [story[0] + (best.length ? ` ${won ? 'Leading the way' : 'Doing their part'} for ${forUs}: ${listOf(best)}.` : ''),
    ...(story.length > 1 ? [story.slice(1).join(' ')] : [])] : [];
  const title = won ? `${me.name} beats ${them.name}, ${mine}-${theirs}.` : `${me.name} falls to ${them.name}, ${theirs}-${mine}.`;
  const nextOf = (g: StoryGame | undefined) => {
    if (!g) return '';
    const n = g.home_hsid === hsid ? Number(g.away_hsid) : Number(g.home_hsid);
    const ni = info(n);
    return g.stage === 'bracket'
      ? ` Next up: ${named(seedOf(g, n), ni.name)}${ni.city ? ` (${ni.city})` : ''} in ${g.round_name || `Round ${g.round}`}, starting today, ${MONTH(nextMonday)}.`
      : ` Next up: ${ni.name}${ni.city ? ` (${ni.city})` : ''}, starting today, ${MONTH(nextMonday)}. Every run counts toward the Total Runs race.`;
  };
  if (game.stage !== 'bracket') {
    if (opening.length) return { title, paragraphs: [...opening,
      `Every run counts toward the season-long Most Runs Tournament.${nextOf(games.find((g) => g.week === game.week + 1 && (g.home_hsid === hsid || g.away_hsid === hsid)))} Be sure to check out the regional leaderboards below.`] };
    const who = carried(weekPlayers, levelOf);
    return { title,
      paragraphs: [`${result} in Week ${game.week} ${dates}. Every run counts toward the Total Runs race.`,
        who.length ? `The alumni who carried the week: ${who.join('; ')}.` : `No ${me.name} alumni played this week.`] };
  }
  const series = games.filter((g) => g.stage === game.stage && g.round === game.round && g.region === game.region && g.series_no === game.series_no && g.week <= game.week)
    .sort((a, b) => a.game_no - b.game_no);
  const wins = series.filter((g) => g.winner_hsid === hsid).length, losses = series.filter((g) => g.winner_hsid === opp).length;
  const over = series.length === 3 && game.game_no === 3;
  if (!over) {
    const status = wins === losses ? `The series is tied ${wins}-${losses}.` : `${wins > losses ? me.name : them.name} leads the series ${Math.max(wins, losses)}-${Math.min(wins, losses)}.`;
    if (!story.length) {
      const who = carried(weekPlayers, levelOf);
      return { title: won ? `${me.name} beats ${them.name}, ${mine}-${theirs}.` : `${me.name} falls to ${them.name}, ${theirs}-${mine}.`,
        paragraphs: [`${result} in Week ${game.week} of ${round} ${dates}. ${status}`,
          who.length ? `Leading the way for the ${me.nickname || me.name}: ${who.join('; ')}.` : `No ${me.name} alumni played this week.`] };
    }
    const nextGame = game.game_no + 1;
    // What's next (Pete, Nov 25 2026).
    const whatsNext = wins === 2
      ? `${me.name} swept the series 2-0 and is into ${round.replace(/\d+/, (d) => String(Number(d) + 1))}. Game 3 still counts: every run goes toward the season-long Most Runs Tournament. Be sure to check out the regional leaderboards below.`
      : losses === 2
        ? `${them.name} took the series 2-0, so ${me.name} now competes in the season-long Most Runs Tournament, and Game 3 still counts there: every run does. Be sure to check out the regional leaderboards below.`
        : wins === 1 && losses === 1
          ? `That evens up this Fantasy Series with ${them.name} at a game apiece. Week ${game.week + 1} should be fun. As always, the rubber game starts today and ends on Sunday, with the winner advancing in the bracket tournament, while the loser still has a chance to be there at the end as they now compete in the season-long Most Runs Tournament. Be sure to check out the regional leaderboards below.`
          : `${status} Game ${nextGame} starts today and ends on Sunday. Be sure to check out the regional leaderboards below.`;
    return { title, paragraphs: [...opening, whatsNext] };
  }
  const scores = series.map((g) => `${runsOf(g, hsid)}-${runsOf(g, opp)}`).join(', ');
  const forRuns = series.reduce((t, g) => t + runsOf(g, hsid), 0), against = series.reduce((t, g) => t + runsOf(g, opp), 0);
  const seriesWon = wins > losses;
  const seriesTitle = seriesWon
    ? (losses === 0 ? `${me.name} sweeps ${them.name}, ${wins}-0.` : `${me.name} wins the series over ${them.name}, ${wins}-${losses}.`)
    : `${them.name} wins the series over ${me.name}, ${losses}-${wins}.`;
  const first = `${round} is in the books${seriesWon && losses === 0 ? `, and the ${me.nickname || me.name} didn't drop a game` : ''}. ` +
    `${named(seedOf(game, hsid), me.name)} ${seriesWon ? 'beat' : 'lost to'} ${named(seedOf(game, opp), them.name)} ${wins}-${losses} in the best-of-three (${scores}), ` +
    `${forRuns >= against ? 'outscoring them' : 'outscored'} ${Math.max(forRuns, against)}-${Math.min(forRuns, against)} over the three weeks.`;
  const nextLine = nextOf(games.find((g) => g.week === game.week + 1 && (g.home_hsid === hsid || g.away_hsid === hsid)));
  const who = carried(sumPlayers(series.map((g) => (g.box ? g.box[sideOf(g, hsid)].p : []))), levelOf);
  const seriesParas = [first + nextLine, who.length ? `The alumni who carried the series: ${who.join('; ')}.` : `No ${me.name} alumni played in the series.`];
  if (!opening.length) return { title: seriesTitle, paragraphs: seriesParas };
  // The week's game first (the rubber game's recap), then the series and what's next.
  return { title: seriesTitle, paragraphs: [...opening, `${first}${nextLine}${seriesWon ? '' : ` ${me.name} now competes in the season-long Most Runs Tournament, where every run still counts.`} Be sure to check out the regional leaderboards below.`] };
}
