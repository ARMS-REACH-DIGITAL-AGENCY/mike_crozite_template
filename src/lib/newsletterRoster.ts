export function rosterStatRows<T extends {playerid:string}>(roster:T[], stats:Map<string,unknown>) { return roster.map(player => ({...player, stats:stats.get(String(player.playerid)) ?? null})); }
