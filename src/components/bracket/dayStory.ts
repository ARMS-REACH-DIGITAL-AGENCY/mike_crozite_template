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
const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// The story of game g's latest settled inning (day), told the way a
// broadcast updates a game in progress: who put runs up in which half
// inning and what it did to the score, then who did it in real life. A day
// is an inning; the visitors bat in the top, the home school in the bottom.
// null before any inning settles.
export function dayStory(index: Index, g: GameRow, box: GameBox | undefined, me: number): DayStory | null {
  if (!box?.f) return null;
  const home = g[2] === me;
  let d = -1;
  for (let k = 0; k < 7; k++) if (box.f[k]?.[0] && box.f[k]?.[1]) d = k;
  if (d < 0) return null;
  const school = shortName(index.schools[me]?.[0] || '');
  const opp = shortName(index.schools[home ? g[3] : g[2]]?.[0] || '');
  const runs = g[5] || [];
  const mineAt = (k: number) => Number(runs[k * 2 + (home ? 0 : 1)] || 0);
  const theirsAt = (k: number) => Number(runs[k * 2 + (home ? 1 : 0)] || 0);
  let bm = 0, bt = 0;
  for (let k = 0; k < d; k++) { bm += mineAt(k); bt += theirsAt(k); }
  const mine = mineAt(d), theirs = theirsAt(d);
  const inning = ORD(d + 1);
  const S = school.toUpperCase(), O = opp.toUpperCase();
  const myRows = (home ? box.h : box.a).days?.[d] || [];
  const oppRows = (home ? box.a : box.h).days?.[d] || [];
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
  const score = m === t ? (m ? `It's tied ${m}-${t} after ${d + 1}.` : `Still scoreless through ${d + 1}.`)
    : `${m > t ? school : opp} leads ${Math.max(m, t)}-${Math.min(m, t)} after ${d + 1}.`;
  const lead = plays.length ? `${plays.join(', and ')}.` : `Zeros on both sides in the ${inning}. ${score}`;

  let title: string;
  if (mine && !theirs) {
    const bat = shouts.find((x) => x.kind === 'bat' && x.value >= 150);
    const pit = shouts.find((x) => x.kind === 'pit' && x.value <= 60);
    title = m > t && bm <= bt ? `${S} TAKES THE LEAD`
      : m === t ? `${S} TIES IT IN THE ${inning.toUpperCase()}`
      : bat && (!pit || bat.value - 100 >= 100 - pit.value) ? `${surname(bat.name)} SPARKS ${S}`
      : pit ? `${surname(pit.name)} DEALS FOR ${S}`
      : `${S} ADDS ${mine === 1 ? 'ONE' : mine} IN THE ${inning.toUpperCase()}`;
  } else if (theirs && !mine) {
    title = t > m && bt <= bm ? `${O} TAKES THE LEAD` : t === m ? `${O} TIES IT` : `${O} ADDS ${theirs === 1 ? 'ONE' : theirs} IN THE ${inning.toUpperCase()}`;
  } else if (mine && theirs) {
    title = `RUNS TRADED IN THE ${inning.toUpperCase()}`;
  } else {
    title = m === t && !m ? `SCORELESS THROUGH ${d + 1}` : `ZEROS IN THE ${inning.toUpperCase()}`;
  }

  const mineSay = standouts(myRows), theirSay = standouts(oppRows);
  const who = [
    mineSay.length ? `For ${school}, ${joinAnd(mineSay)}.` : '',
    theirSay.length ? `For ${opp}, ${joinAnd(theirSay)}.` : '',
  ].filter(Boolean).join(' ');
  const summary = [lead, who].filter(Boolean).join(' ');
  // The hero picture: the bigger of the two days (OPS+ above 100, FIP- below).
  const hero = [...shouts].sort((a, b) => (b.kind === 'bat' ? b.value - 100 : 100 - b.value) - (a.kind === 'bat' ? a.value - 100 : 100 - a.value))[0];
  return { day: DAYS[d], title, summary, shouts, hero };
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
  // A walk-off: the home school's last scoring half inning, from the 9th on,
  // put it ahead for good.
  let walkOff = false;
  if (homeWon) {
    const last = innings - 1;
    if (last >= 8 && Number(runs[last * 2] || 0) > 0) {
      let h = 0, a = 0;
      for (let k = 0; k < last; k++) { h += Number(runs[k * 2] || 0); a += Number(runs[k * 2 + 1] || 0); }
      a += Number(runs[last * 2 + 1] || 0);
      walkOff = h <= a;
    }
  }
  const flip = g[4] === 'flip';
  const title = walkOff ? `${W.toUpperCase()} WALKS IT OFF`
    : !ls ? `${W.toUpperCase()} BLANKS ${L.toUpperCase()}`
    : `${W.toUpperCase()} WINS GAME ${gameNo}`;
  const lastRuns = Number(runs[(innings - 1) * 2] || 0);
  const how = flip ? `${W} won it on the commissioner's flip.`
    : walkOff ? `${W} won it with ${runsWord(lastRuns)} in the bottom of the ${ORD(innings)}.`
    : `${W} scored in the ${joinAnd(winIn)}${loseIn.length ? `, ${L} in the ${joinAnd(loseIn)}` : `, and ${L} never got on the board`}.`;
  const weekRows = (home ? box?.h : box?.a)?.p || [];
  const shouts = shoutsOf(weekRows);
  const star = shouts.find((x) => x.kind === 'bat') || shouts[0];
  const starLine = star ? ` ${star.name} led ${name(me)} for the week, ${star.line} (${star.value} ${star.kind === 'bat' ? 'OPS+' : 'FIP-'}).` : '';
  const summary = `Final: ${W} ${ws}, ${L} ${ls} in Game ${gameNo}. ${how}${starLine} ${series}`.trim();
  return { day: 'Final', title, summary, shouts, hero: star };
}
