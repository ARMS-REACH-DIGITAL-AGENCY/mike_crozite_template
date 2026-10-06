// The hero's daily news story: once a day's runs are settled (offense and
// pitching both), the round slide leads with that day - a headline, a short
// recap (the runs, each school's best bat and arm - good day or bad - and
// where the week stands) and a
// shout-out to the school's top OPS+ and top FIP- of the day.
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

function headline(school: string, opp: string, day: string, mine: number, theirs: number, shouts: DayShout[]) {
  const S = school.toUpperCase(), O = opp.toUpperCase(), D = day.toUpperCase();
  if (mine > theirs) {
    const bat = shouts.find((s) => s.kind === 'bat' && s.value >= 150);
    const pit = shouts.find((s) => s.kind === 'pit' && s.value <= 60);
    if (bat && (!pit || bat.value - 100 >= 100 - pit.value)) return `${surname(bat.name)} POWERS ${S}`;
    if (pit) return `${surname(pit.name)} DEALS FOR ${S}`;
    return mine === 2 ? `${S} SWEEPS ${D}` : `${S} TAKES ${D}`;
  }
  if (theirs > mine) return theirs === 2 ? `${O} SWEEPS ${D}` : `${O} TAKES ${D}`;
  return mine ? `${S}, ${O} SPLIT ${D}` : `NO RUNS ON ${D}`;
}

// A school's day in a sentence - its best bat and best arm, good day or bad:
// "Hamilton: Bellinger 1-for-4 (42 OPS+)", or "Cardinal Newman had no one in action".
function sideDay(school: string, rows: PlayerRow[]) {
  const bat = rows.filter((p) => Array.isArray(p[4]) && p[4][0] > 0 && p[6] !== null)
    .sort((a, b) => Number(b[6]) - Number(a[6]) || (b[4] as number[])[0] - (a[4] as number[])[0])[0];
  const arm = rows.filter((p) => Array.isArray(p[5]) && p[5].slice(0, 5).some((v) => v > 0) && p[7] !== null)
    .sort((a, b) => Number(a[7]) - Number(b[7]) || (b[5] as number[])[0] - (a[5] as number[])[0])[0];
  const parts = [
    bat && `${lastName(bat[1])} ${batLine(bat[4] as number[])} (${bat[6]} OPS+)`,
    arm && `${lastName(arm[1])} ${pitLine(arm[5] as number[])} (${arm[7]} FIP-)`,
  ].filter(Boolean);
  return parts.length ? `${school}: ${parts.join(', ')}` : `${school} had no one in action`;
}

// The story for game g's latest settled day, or null before any day settles.
export function dayStory(index: Index, g: GameRow, box: GameBox | undefined, me: number): DayStory | null {
  if (!box?.f) return null;
  const home = g[2] === me;
  let d = -1;
  for (let k = 0; k < 7; k++) if (box.f[k]?.[0] && box.f[k]?.[1]) d = k;
  if (d < 0) return null;
  const school = shortName(index.schools[me]?.[0] || '');
  const opp = shortName(index.schools[home ? g[3] : g[2]]?.[0] || '');
  const day = DAYS[d];
  const runs = g[5] || [];
  const mine = Number(runs[d * 2 + (home ? 0 : 1)] || 0), theirs = Number(runs[d * 2 + (home ? 1 : 0)] || 0);
  // Runs through the settled days of the week.
  let wm = 0, wt = 0;
  for (let k = 0; k <= d; k++) { wm += Number(runs[k * 2 + (home ? 0 : 1)] || 0); wt += Number(runs[k * 2 + (home ? 1 : 0)] || 0); }
  const shouts = shoutsOf((home ? box.h : box.a).days?.[d] || []);

  const verb = mine > theirs ? (mine === 2 ? 'swept' : 'took') : theirs > mine ? 'dropped' : 'split';
  const sides = `${sideDay(school, (home ? box.h : box.a).days?.[d] || [])}. ${sideDay(opp, (home ? box.a : box.h).days?.[d] || [])}.`;
  const week = `Week ${g[1]}`;
  const stands = box.f[7]?.[0] && box.f[7]?.[1] && g[6]
    ? `${g[6] === me ? school : opp} wins ${week}.`
    : wm === wt ? `${week} is tied ${wm}-${wt}.` : `${wm > wt ? school : opp} leads ${week}, ${Math.max(wm, wt)}-${Math.min(wm, wt)}.`;
  const lead = mine || theirs ? `${school} ${verb} ${day} ${mine}-${theirs} against ${opp}` : `No runs ${day} for ${school} or ${opp}`;
  const summary = `${lead}. ${sides} ${stands}`;
  // The hero picture: the bigger of the two days (OPS+ above 100, FIP- below).
  const hero = [...shouts].sort((a, b) => (b.kind === 'bat' ? b.value - 100 : 100 - b.value) - (a.kind === 'bat' ? a.value - 100 : 100 - a.value))[0];
  return { day, title: headline(school, opp, day, mine, theirs, shouts), summary, shouts, hero };
}
