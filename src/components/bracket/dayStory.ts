// The hero's news, told like a game broadcast: once a day's runs are settled
// the round slide leads with that inning - who put runs up, in which half,
// what it did to the score, and who did it in real life - with a shout-out
// to the school's top OPS+ and top FIP- of the day. Once a game is over, its
// recap: the final, how it was won and where the series stands.
import { type GameBox, type GameRow, type Index, type PlayerRow, shortName } from './gallery';

export type DayShout = { id: string; name: string; kind: 'bat' | 'pit'; value: number; line: string };
export type DayStory = { day: string; title: string; summary: string; shouts: DayShout[]; hero?: DayShout };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const lastName = (name: string) => name.trim().split(/\s+/).pop() || name;
const surname = (name: string) => lastName(name).toUpperCase();

// "2-for-4, HR, 2 BB" from [PA AB H 2B 3B HR BB HBP SF].
function batLine(s: number[]) {
  const parts = [`${s[2]}-for-${s[1]}`];
  if (s[5]) parts.push(s[5] > 1 ? `${s[5]} HR` : 'HR');
  if (s[4]) parts.push(s[4] > 1 ? `${s[4]} 3B` : '3B');
  if (s[3]) parts.push(s[3] > 1 ? `${s[3]} 2B` : '2B');
  if (s[6]) parts.push(`${s[6]} BB`);
  return parts.join(', ');
}
// "6.0 IP, 8 K" from [outs HR BB HBP K ...].
function pitLine(s: number[]) {
  const parts = [`${Math.floor(s[0] / 3)}.${s[0] % 3} IP`];
  if (s[4]) parts.push(`${s[4]} K`);
  return parts.join(', ');
}

// The school's top hitter (highest OPS+, then most PA) and top pitcher
// (lowest FIP-, then most outs) of the day - a shout-out, so only for an
// average day or better (OPS+ 100 and up, FIP- 100 and down).
function shoutsOf(rows: PlayerRow[]): DayShout[] {
  const bats = rows.filter((p) => Array.isArray(p[4]) && p[4][0] > 0 && p[6] !== null && Number(p[6]) >= 100)
    .sort((a, b) => Number(b[6]) - Number(a[6]) || (b[4] as number[])[0] - (a[4] as number[])[0]);
  const pits = rows.filter((p) => Array.isArray(p[5]) && p[5].slice(0, 5).some((v) => v > 0) && p[7] !== null && Number(p[7]) <= 100)
    .sort((a, b) => Number(a[7]) - Number(b[7]) || (b[5] as number[])[0] - (a[5] as number[])[0]);
  const out: DayShout[] = [];
  const b = bats[0], p = pits[0];
  if (b) out.push({ id: b[0], name: b[1], kind: 'bat', value: Number(b[6]), line: batLine(b[4] as number[]) });
  if (p) out.push({ id: p[0], name: p[1], kind: 'pit', value: Number(p[7]), line: pitLine(p[5] as number[]) });
  return out;
}

const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const NUM = ['no', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const runsWord = (n: number) => (n === 1 ? 'a run' : `${NUM[n] || n} runs`);

// What a half-inning's runs did to the game, from the scoring side's view:
// "to take a 2-1 lead", "to tie it 1-1", "to stretch the lead to 3-0", "to
// cut it to 2-1".
function effect(before: number, oppBefore: number, after: number, opp: number) {
  if (after > opp) return before > oppBefore ? `to stretch the lead to ${after}-${opp}` : `to take a ${after}-${opp} lead`;
  if (after === opp) return `to tie it ${after}-${after}`;
  return `to cut it to ${opp}-${after}`;
}

// A school's best bat and arm on a day, as a broadcaster would mention them:
// "Bellinger went 3-for-4, HR (215 OPS+)", "Smith threw 6.0 IP, 8 K (62 FIP-)".
function standouts(rows: PlayerRow[]) {
  const bat = rows.filter((p) => Array.isArray(p[4]) && p[4][0] > 0 && p[6] !== null)
    .sort((a, b) => Number(b[6]) - Number(a[6]) || (b[4] as number[])[0] - (a[4] as number[])[0])[0];
  const arm = rows.filter((p) => Array.isArray(p[5]) && p[5].slice(0, 5).some((v) => v > 0) && p[7] !== null)
    .sort((a, b) => Number(a[7]) - Number(b[7]) || (b[5] as number[])[0] - (a[5] as number[])[0])[0];
  return [
    bat && `${lastName(bat[1])} went ${batLine(bat[4] as number[])} (${bat[6]} OPS+)`,
    arm && `${lastName(arm[1])} threw ${pitLine(arm[5] as number[])} (${arm[7]} FIP-)`,
  ].filter(Boolean) as string[];
}
// "a 104", "an 88", "an 11".
const an = (n: number | string | null) => (/^8/.test(String(n)) || ['11', '18'].includes(String(n)) ? `an ${n}` : `a ${n}`);
const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// The story of one settled inning of game g (k: 0-6 = Monday-Sunday, 7 =
// the 8th, the week's totals, 8 = the 9th, the clubs' W-L), told the way a
// broadcast updates a game in progress: who put runs up in which half
// inning and what it did to the score, then who did it in real life. The
// visitors bat in the top, the home school in the bottom. null until the
// inning settles.
export function inningStory(index: Index, g: GameRow, box: GameBox | undefined, me: number, k: number): DayStory | null {
  if (!box?.f?.[k]?.[0] || !box.f[k]?.[1]) return null;
  const home = g[2] === me;
  const school = shortName(index.schools[me]?.[0] || '');
  const opp = shortName(index.schools[home ? g[3] : g[2]]?.[0] || '');
  const runs = g[5] || [];
  const mineAt = (i: number) => Number(runs[i * 2 + (home ? 0 : 1)] || 0);
  const theirsAt = (i: number) => Number(runs[i * 2 + (home ? 1 : 0)] || 0);
  let bm = 0, bt = 0;
  for (let i = 0; i < k; i++) { bm += mineAt(i); bt += theirsAt(i); }
  const mine = mineAt(k), theirs = theirsAt(k);
  const inning = ORD(k + 1);
  const S = school.toUpperCase(), O = opp.toUpperCase();
  const mySide = home ? box.h : box.a, oppSide = home ? box.a : box.h;
  // The players behind the inning: that day's, or the whole week's for the
  // 8th (and the 9th's shout-outs).
  const myRows = (k < 7 ? mySide.days?.[k] : mySide.p) || [];
  const oppRows = (k < 7 ? oppSide.days?.[k] : oppSide.p) || [];
  const shouts = shoutsOf(myRows);

  // The half innings in order: the visitors' top, then the home bottom.
  const halves: { name: string; mineSide: boolean; half: 'top' | 'bottom'; n: number }[] = [
    { name: home ? opp : school, mineSide: !home, half: 'top', n: home ? theirs : mine },
    { name: home ? school : opp, mineSide: home, half: 'bottom', n: home ? mine : theirs },
  ];
  let m = bm, t = bt;
  const plays: string[] = [];
  for (const h of halves) {
    if (!h.n) continue;
    const [before, oppBefore] = h.mineSide ? [m, t] : [t, m];
    if (h.mineSide) m += h.n; else t += h.n;
    const [after, oppAfter] = h.mineSide ? [m, t] : [t, m];
    plays.push(`${h.name} put up ${runsWord(h.n)} in the ${h.half} of the ${inning} ${effect(before, oppBefore, after, oppAfter)}`);
  }
  const score = m === t ? (m ? `It's tied ${m}-${t} after ${k + 1}.` : `Still scoreless through ${k + 1}.`)
    : `${m > t ? school : opp} leads ${Math.max(m, t)}-${Math.min(m, t)} after ${k + 1}.`;
  const lead = plays.length ? `${plays.join(', and ')}.` : `Zeros on both sides in the ${inning}. ${score}`;

  let title: string;
  if (mine && !theirs) {
    const bat = shouts.find((x) => x.kind === 'bat' && x.value >= 150);
    const pit = shouts.find((x) => x.kind === 'pit' && x.value <= 60);
    title = m > t && bm <= bt ? `${S} TAKES THE LEAD`
      : m === t ? `${S} TIES IT IN THE ${inning.toUpperCase()}`
      : k < 8 && bat && (!pit || bat.value - 100 >= 100 - pit.value) ? `${surname(bat.name)} SPARKS ${S}`
      : k < 8 && pit ? `${surname(pit.name)} DEALS FOR ${S}`
      : `${S} ADDS ${mine === 1 ? 'ONE' : mine} IN THE ${inning.toUpperCase()}`;
  } else if (theirs && !mine) {
    title = t > m && bt <= bm ? `${O} TAKES THE LEAD` : t === m ? `${O} TIES IT` : `${O} ADDS ${theirs === 1 ? 'ONE' : theirs} IN THE ${inning.toUpperCase()}`;
  } else if (mine && theirs) {
    title = `RUNS TRADED IN THE ${inning.toUpperCase()}`;
  } else {
    title = m === t && !m ? `SCORELESS THROUGH ${k + 1}` : `ZEROS IN THE ${inning.toUpperCase()}`;
  }

  // What decided the inning in real life.
  let who: string;
  if (k === 8) {
    const [mw, ml] = mySide.wl || [0, 0], [tw, tl] = oppSide.wl || [0, 0];
    who = `The 9th is the alumni's real clubs: ${school}'s went ${mw}-${ml} this week, ${opp}'s ${tw}-${tl}.`;
  } else {
    const wk = k === 7 && box.d?.[7]?.every((v) => v != null) ? box.d[7] : null;
    const totals = wk
      ? `The 8th is the whole week: ${school} hit for ${an(wk[home ? 0 : 1])} OPS+ to ${opp}'s ${wk[home ? 1 : 0]}, and pitched to ${an(wk[home ? 2 : 3])} FIP- to ${wk[home ? 3 : 2]}. `
      : '';
    const mineSay = standouts(myRows), theirSay = standouts(oppRows);
    who = totals + [
      mineSay.length ? `For ${school}, ${joinAnd(mineSay)}${k === 7 ? ' for the week' : ''}.` : '',
      theirSay.length ? `For ${opp}, ${joinAnd(theirSay)}${k === 7 ? ' for the week' : ''}.` : '',
    ].filter(Boolean).join(' ');
  }
  const summary = [lead, who].filter(Boolean).join(' ');
  // The hero picture: the bigger of the two days (OPS+ above 100, FIP- below).
  const hero = [...shouts].sort((a, b) => (b.kind === 'bat' ? b.value - 100 : 100 - b.value) - (a.kind === 'bat' ? a.value - 100 : 100 - a.value))[0];
  const day = k < 7 ? `${inning} · ${DAYS[k]}` : k === 7 ? '8th · Week totals' : "9th · Clubs' W-L";
  return { day, title, summary, shouts: k === 8 ? [] : shouts, hero };
}

// The story of game g's latest settled day (inning 1-7), or null.
export function dayStory(index: Index, g: GameRow, box: GameBox | undefined, me: number): DayStory | null {
  for (let k = 6; k >= 0; k--) if (box?.f?.[k]?.[0] && box.f[k]?.[1]) return inningStory(index, g, box, me, k);
  return null;
}

// A week's stories in order, for the hero to rotate through: every settled
// inning (1st-9th), then the recap once the game is final.
export function weekStories(index: Index, g: GameRow, box: GameBox | undefined, me: number, gameNo: number, series: string, final: boolean): DayStory[] {
  const out: DayStory[] = [];
  for (let k = 0; k < 9; k++) {
    const s = inningStory(index, g, box, me, k);
    if (s) out.push(s);
  }
  if (final) {
    const recap = gameStory(index, g, box, me, gameNo, series);
    if (recap) out.push(recap);
  }
  return out;
}

// The recap of a finished game: the final, how it was won (a walk-off, a
// shutout, the scoring innings) and where the series stands.
export function gameStory(index: Index, g: GameRow, box: GameBox | undefined, me: number, gameNo: number, series: string): DayStory | null {
  const runs = g[5] || [];
  if (!runs.length || g[6] == null) return null;
  const home = g[2] === me;
  const innings = Math.ceil(runs.length / 2);
  let hr = 0, ar = 0;
  for (let k = 0; k < innings; k++) { hr += Number(runs[k * 2] || 0); ar += Number(runs[k * 2 + 1] || 0); }
  const homeWon = g[6] === g[2];
  const name = (h: number) => shortName(index.schools[h]?.[0] || '');
  const W = name(homeWon ? g[2] : g[3]), L = name(homeWon ? g[3] : g[2]);
  const ws = Math.max(hr, ar), ls = Math.min(hr, ar);
  const scoredIn = (side: 0 | 1) => Array.from({ length: innings }, (_, k) => k).filter((k) => Number(runs[k * 2 + side] || 0) > 0).map((k) => ORD(k + 1));
  const winIn = scoredIn(homeWon ? 0 : 1), loseIn = scoredIn(homeWon ? 1 : 0);
  // Won in the home school's last half inning, from the 9th on: a walk-off
  // when it came from behind, "wins it in the 9th" from a tie.
  let walkOff = false, wonLast = false;
  if (homeWon) {
    const last = innings - 1;
    if (last >= 8 && Number(runs[last * 2] || 0) > 0) {
      let h = 0, a = 0;
      for (let k = 0; k < last; k++) { h += Number(runs[k * 2] || 0); a += Number(runs[k * 2 + 1] || 0); }
      a += Number(runs[last * 2 + 1] || 0);
      walkOff = h < a;
      wonLast = h === a;
    }
  }
  const flip = g[4] === 'flip';
  const title = walkOff ? `${W.toUpperCase()} WALKS IT OFF`
    : wonLast ? `${W.toUpperCase()} WINS IT IN THE ${ORD(innings).toUpperCase()}`
    : !ls ? `${W.toUpperCase()} BLANKS ${L.toUpperCase()}`
    : `${W.toUpperCase()} WINS GAME ${gameNo}`;
  const lastRuns = Number(runs[(innings - 1) * 2] || 0);
  const how = flip ? `${W} won it on the commissioner's flip.`
    : walkOff || wonLast ? `${W} won it with ${runsWord(lastRuns)} in the bottom of the ${ORD(innings)}${walkOff ? ', coming from behind' : ''}.`
    : `${W} scored in the ${joinAnd(winIn)}${loseIn.length ? `, ${L} in the ${joinAnd(loseIn)}` : `, and ${L} never got on the board`}.`;
  const weekRows = (home ? box?.h : box?.a)?.p || [];
  const shouts = shoutsOf(weekRows);
  const star = shouts.find((x) => x.kind === 'bat') || shouts[0];
  const starLine = star ? ` ${star.name} led ${name(me)} for the week, ${star.line} (${star.value} ${star.kind === 'bat' ? 'OPS+' : 'FIP-'}).` : '';
  const summary = `Final: ${W} ${ws}, ${L} ${ls} in Game ${gameNo}. ${how}${starLine} ${series}`.trim();
  return { day: 'Final', title, summary, shouts, hero: star };
}

// A finished game written up like a newspaper game story. The lede is what
// decided it - the run that put the winner ahead for good and who drove it in
// real life - then the other runs that mattered and who was behind them, how
// the 8th (week totals) and 9th (clubs' W-L) went when they didn't decide it,
// and where the series stands. clubOf names a player's real club.
export type GameArticle = { headline: string; paragraphs: string[] };
const count = (n: number, one: string, many: string) => (n === 1 ? `a ${one}` : `${NUM[n] || n} ${many}`);
// "2-for-4 with a homer and two walks" from [PA AB H 2B 3B HR BB HBP SF].
function batProse(s: number[]) {
  const extra = [s[5] && count(s[5], 'homer', 'homers'), s[4] && count(s[4], 'triple', 'triples'), s[3] && count(s[3], 'double', 'doubles'), s[6] && count(s[6], 'walk', 'walks')].filter(Boolean) as string[];
  return `${s[2]}-for-${s[1]}${extra.length ? ` with ${joinAnd(extra)}` : ''}`;
}
// "threw six innings with eight strikeouts" from [outs HR BB HBP K ...].
function pitProse(s: number[]) {
  const whole = Math.floor(s[0] / 3), part = s[0] % 3;
  const ip = part ? `${whole ? `${whole} ` : ''}${part === 1 ? '⅓' : '⅔'} inning${whole ? 's' : ''}` : whole === 1 ? 'an inning' : `${NUM[whole] || whole} innings`;
  return `threw ${ip}${s[4] ? ` with ${count(s[4], 'strikeout', 'strikeouts')}` : ''}`;
}
export function gameArticle(index: Index, g: GameRow, box: GameBox | undefined, opts: { gameNo: number; series: string; clubOf?: (id: string) => string }): GameArticle | null {
  const runs = g[5] || [];
  if (!runs.length || g[6] == null || !box) return null;
  const innings = Math.ceil(runs.length / 2);
  const name = (h: number) => shortName(index.schools[h]?.[0] || '');
  const homeWon = g[6] === g[2];
  const H = name(g[2]), A = name(g[3]);
  const W = homeWon ? H : A, L = homeWon ? A : H;
  let hr = 0, ar = 0;
  for (let k = 0; k < innings; k++) { hr += Number(runs[k * 2] || 0); ar += Number(runs[k * 2 + 1] || 0); }
  const ws = Math.max(hr, ar), ls = Math.min(hr, ar);
  const club = (id: string) => { const c = opts.clubOf?.(id); return c ? ` (${c})` : ''; };

  // Every scoring half inning, in order, with the score before and after.
  type Ev = { k: number; home: boolean; n: number; bw: number; bl: number; aw: number; al: number };
  const evs: Ev[] = [];
  let h = 0, a = 0;
  for (let k = 0; k < innings; k++) {
    for (const home of [false, true]) {
      const n = Number(runs[k * 2 + (home ? 0 : 1)] || 0);
      if (!n) continue;
      const [bw, bl] = homeWon ? [h, a] : [a, h];
      if (home) h += n; else a += n;
      const [aw, al] = homeWon ? [h, a] : [a, h];
      evs.push({ k, home, n, bw, bl, aw, al });
    }
  }
  const winnerEv = (e: Ev) => e.home === homeWon;
  // The run that put the winner ahead for good.
  const decisive = [...evs].reverse().find((e) => winnerEv(e) && e.aw > e.al && e.bw <= e.bl);

  const best = (rows: PlayerRow[] | undefined) => {
    const r = rows || [];
    const bat = r.filter((p) => Array.isArray(p[4]) && p[4][0] > 0 && p[6] !== null).sort((x, y) => Number(y[6]) - Number(x[6]))[0];
    const arm = r.filter((p) => Array.isArray(p[5]) && p[5].slice(0, 5).some((v) => v > 0) && p[7] !== null).sort((x, y) => Number(x[7]) - Number(y[7]))[0];
    return { bat, arm };
  };
  // Who was behind a half inning's runs, in a clause.
  const credit = (e: Ev): string => {
    const side = e.home ? box.h : box.a;
    const other = e.home ? box.a : box.h;
    const S = e.home ? H : A, O = e.home ? A : H;
    if (e.k < 7) {
      const d = box.d?.[e.k] || [];
      const [mo, to, mp, tp] = e.home ? [d[0], d[1], d[2], d[3]] : [d[1], d[0], d[3], d[2]];
      const off = mo != null && (to == null ? mo > 100 : mo > to);
      const pit = mp != null && (tp == null ? mp < 100 : mp < tp);
      const { bat, arm } = best(side.days?.[e.k]);
      const parts = [
        off && bat ? `${bat[1]}${club(bat[0])}, who went ${batProse(bat[4] as number[])} on ${DAYS[e.k]} (${bat[6]} OPS+)` : '',
        pit && arm ? `${arm[1]}${club(arm[0])}, who ${pitProse(arm[5] as number[])} on ${DAYS[e.k]} (${arm[7]} FIP-)` : '',
      ].filter(Boolean);
      return parts.length ? `thanks to ${joinAnd(parts)}` : `on the strength of ${S}'s ${DAYS[e.k]}`;
    }
    if (e.k === 7) {
      const d = box.d?.[7] || [];
      const [mo, to, mp, tp] = e.home ? [d[0], d[1], d[2], d[3]] : [d[1], d[0], d[3], d[2]];
      const bits = [
        mo != null && (to == null ? mo > 100 : mo > to) ? (to == null ? `hitting for ${an(mo)} OPS+` : `out-hitting ${O} ${mo} OPS+ to ${to}`) : '',
        mp != null && (tp == null ? mp < 100 : mp < tp) ? (tp == null ? `pitching to ${an(mp)} FIP-` : `out-pitching ${O} ${mp} FIP- to ${tp}`) : '',
      ].filter(Boolean);
      return bits.length ? `on the week's totals, ${joinAnd(bits)}` : `on the week's totals`;
    }
    if (e.k === 8) {
      const [w1, l1] = side.wl || [0, 0], [w2, l2] = other.wl || [0, 0];
      return `on the strength of its alumni's real clubs, which went ${w1}-${l1} this week to ${O}'s ${w2}-${l2}`;
    }
    // Extra innings: the schools' top players head to head; only the
    // matchups this side won.
    const mine = best(side.p), theirs = best(other.p);
    const vs = [
      mine.bat && theirs.bat && Number(mine.bat[6]) > Number(theirs.bat[6]) ? `its top bat, ${mine.bat[1]} (${mine.bat[6]} OPS+), out-hit ${O}'s ${theirs.bat[1]} (${theirs.bat[6]})` : '',
      mine.arm && theirs.arm && Number(mine.arm[7]) < Number(theirs.arm[7]) ? `its top arm, ${mine.arm[1]} (${mine.arm[7]} FIP-), outdueled ${O}'s ${theirs.arm[1]} (${theirs.arm[7]})` : '',
    ].filter(Boolean);
    return vs.length ? `when ${joinAnd(vs)}` : `in the tiebreaker, where each school's top hitter and pitcher go head to head`;
  };

  // The lede.
  const score = `${ws}-${ls}`;
  const verb = ls === 0 ? 'blanked' : 'beat';
  let lede = `${W} ${verb} ${L} ${score} in Game ${opts.gameNo} of their Round 1 series`;
  if (g[4] === 'flip') lede += `, winning on the commissioner's flip after the two schools couldn't be separated.`;
  else if (decisive) {
    const where = decisive.k < 9 ? `the ${ORD(decisive.k + 1)}` : `the ${ORD(decisive.k + 1)} inning, in extras`;
    const walk = decisive.home && decisive.k >= 8 && decisive.bw < decisive.bl;
    lede += decisive.k === 8
      ? `, and it came down to the 9th: ${W} ${walk ? 'walked it off' : 'won it'} with ${runsWord(decisive.n)} ${credit(decisive)}.`
      : decisive.k === 7
        ? `, and the difference was depth: ${W} took the lead for good in the 8th ${credit(decisive)}.`
        : decisive.k > 8
          ? `, needing extra innings. Tied ${decisive.bw}-${decisive.bl} after nine, it went to the ${ORD(decisive.k + 1)}, and ${W} won it ${credit(decisive)}.`
          : `. ${W} took the lead for good in ${where}, ${credit(decisive)}.`;
  } else lede += '.';

  // The other runs that mattered.
  const rest = evs.filter((e) => e !== decisive);
  const say = (e: Ev, i: number, list: Ev[]) => {
    const S = e.home ? H : A;
    const did = e.n === 1 ? 'pushed a run across' : `put ${runsWord(e.n)} on the board`;
    // The other school scoring in the same inning answers in its half.
    if (i > 0 && list[i - 1].k === e.k) return `${S} answered with ${runsWord(e.n)} in the bottom half, ${credit(e)}.`;
    return `In the ${ORD(e.k + 1)}, ${S} ${did} ${credit(e)}.`;
  };
  const shown = rest.slice(0, 5);
  const body = shown.map(say);
  if (rest.length > 5) body.push(`The two combined for ${NUM[rest.slice(5).reduce((t, e) => t + e.n, 0)] || 'several'} more runs after that.`);
  const ninth = evs.filter((e) => e.k === 8);
  const after8 = evs.filter((e) => e.k <= 7);
  const w8 = after8.reduce((t, e) => t + (winnerEv(e) ? e.n : 0), 0), l8 = after8.reduce((t, e) => t + (winnerEv(e) ? 0 : e.n), 0);
  if (!ninth.length && innings >= 9 && w8 > l8) body.push(`Nobody scored in the 9th, and ${W} didn't need to.`);
  if (ls === 0) body.push(`${L} never got on the board.`);

  // The kicker: the series, and the week's standout for the winner.
  const wSide = homeWon ? box.h : box.a;
  const star = best(wSide.p).bat;
  const close = [
    star && Number(star[6]) >= 120 ? `${star[1]}${club(star[0])} led ${W} for the week, going ${batProse(star[4] as number[])} (${star[6]} OPS+).` : '',
    opts.series,
  ].filter(Boolean).join(' ');

  const paragraphs = [lede, body.join(' '), close].filter((x) => x.trim());
  const title = gameStory(index, g, box, g[2], opts.gameNo, '')?.title || `${W.toUpperCase()} WINS GAME ${opts.gameNo}`;
  return { headline: title, paragraphs };
}
