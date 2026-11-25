export type RoundResult = { week: number; region: number; round_name: string; game_no: number; home_hsid: number; away_hsid: number; home_name: string; away_name: string; winner_hsid: number | null };
export function gazetteAdvancement(rows: RoundResult[], week: number) {
  if (!Number.isInteger(week) || week < 1 || week > 30 || (week - 1) % 3 === 0) return undefined;
  const round = Math.floor((week - 1) / 3) + 1, start = (round - 1) * 3 + 1, game = week - start + 1;
  const series = new Map<string, RoundResult[]>();
  for (const r of rows) {
    if (r.round_name !== 'Round ' + round || Number(r.week) < start || Number(r.week) > week || Number(r.game_no) !== Number(r.week) - start + 1) continue;
    const home = Number(r.home_hsid), away = Number(r.away_hsid), win = Number(r.winner_hsid);
    if (!home || !away || home === away || ![home,away].includes(win)) continue;
    const key = [r.region,Math.min(home,away),Math.max(home,away)].join('/');
    const list = series.get(key) || [];
    if (list.some(x => Number(x.game_no) === Number(r.game_no))) throw new Error('Duplicate final game in Gazette round results');
    list.push(r); series.set(key,list);
  }
  const groups = new Map<number, {region:number; advancing:string[]; eliminated:string[]}>();
  for (const list of series.values()) {
    if (list.length !== game) continue;
    const first = list.find(r => Number(r.game_no) === 1)!;
    const home = Number(first.home_hsid), away = Number(first.away_hsid);
    const hw = list.filter(r => Number(r.winner_hsid) === home).length, aw = list.filter(r => Number(r.winner_hsid) === away).length;
    if (Math.max(hw,aw) < 2) continue;
    const group = groups.get(Number(first.region)) || { region:Number(first.region), advancing:[], eliminated:[] };
    const homeWon = hw > aw;
    group.advancing.push((homeWon ? first.home_name : first.away_name) + ' (' + Math.max(hw,aw) + '-' + Math.min(hw,aw) + ')');
    group.eliminated.push(homeWon ? first.away_name : first.home_name);
    groups.set(group.region, group);
  }
  const regions = [...groups.values()].sort((a,b) => a.region-b.region);
  for (const r of regions) { r.advancing.sort(); r.eliminated.sort(); }
  return regions.length ? { heading: game === 2 ? 'Swept and Moving On' : 'Round ' + round + ' — Advancing and Eliminated', regions } : undefined;
}
