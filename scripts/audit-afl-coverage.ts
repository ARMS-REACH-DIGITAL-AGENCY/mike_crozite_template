// scripts/audit-afl-coverage.ts
// Read-only check of Arizona Fall League (sportId 17) coverage: every AFL
// roster player, whether he's in our universe (player_source_map, mlb_api),
// how many AFL games MLB has for him, how many AFL game lines we stored
// (player_game_logs), and what MLB lists as his current team - the game-log
// sync only asks MLB for AFL games when that current team is an AFL club
// (or his team stints say so).
//
//   DATABASE_URL=... npx tsx scripts/audit-afl-coverage.ts [--season 2026] [--name hansell]

import { Pool } from "pg";

const MLB = "https://statsapi.mlb.com/api/v1";
const args = process.argv.slice(2);
const SEASON = Number(args[args.indexOf("--season") + 1]) || new Date().getUTCFullYear();
const NAME = args.includes("--name") ? String(args[args.indexOf("--name") + 1] || "").toLowerCase() : "";
const AFL = 17;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function aflGames(personId: string, group: "hitting" | "pitching"): Promise<number> {
  const data = await json(`${MLB}/people/${personId}/stats?stats=gameLog&group=${group}&season=${SEASON}&sportId=${AFL}&gameType=R,F,D,L,W,C,P`).catch(() => null);
  const split = data?.stats?.find((s: { splits?: unknown[] }) => s.splits?.length) ?? data?.stats?.[0];
  return split?.splits?.length ?? 0;
}

async function currentTeam(personId: string): Promise<{ name: string; sport: number | null }> {
  const data = await json(`${MLB}/people/${personId}?hydrate=currentTeam`).catch(() => null);
  const team = data?.people?.[0]?.currentTeam;
  if (!team?.id) return { name: "-", sport: null };
  const t = await json(`${MLB}/teams/${team.id}`).catch(() => null);
  return { name: t?.teams?.[0]?.name || team.name || String(team.id), sport: t?.teams?.[0]?.sport?.id ?? null };
}

async function main() {
  const teams: { id: number; name: string }[] = (await json(`${MLB}/teams?sportId=${AFL}&season=${SEASON}`)).teams || [];
  console.log(`AFL ${SEASON}: ${teams.length} teams - ${teams.map((t) => t.name).join(", ")}`);
  const aflTeamIds = teams.map((t) => String(t.id));

  // Every AFL roster player.
  const roster: { personId: string; name: string; team: string; pos: string }[] = [];
  for (const t of teams) {
    for (const type of ["fullSeason", "active"]) {
      const data = await json(`${MLB}/teams/${t.id}/roster?season=${SEASON}&rosterType=${type}`).catch(() => null);
      for (const r of data?.roster || []) {
        const personId = String(r.person?.id || "");
        if (personId && !roster.some((x) => x.personId === personId)) {
          roster.push({ personId, name: r.person?.fullName || "", team: t.name, pos: r.position?.abbreviation || "" });
        }
      }
      if (data?.roster?.length) break;
    }
    await delay(150);
  }
  console.log(`AFL roster players: ${roster.length}`);

  const { rows: mapped } = await pool.query<{ source_player_id: string; playerid: string; match_method: string | null; display_name: string | null; hsid: string | null }>(
    `SELECT m.source_player_id, m.playerid::text AS playerid, m.match_method,
            (SELECT f.display_name FROM flip_card_front_stage f WHERE f.playerid::text = m.playerid::text LIMIT 1) AS display_name,
            (SELECT f.hsid::text FROM flip_card_front_stage f WHERE f.playerid::text = m.playerid::text LIMIT 1) AS hsid
       FROM player_source_map m WHERE m.source = 'mlb_api' AND m.source_player_id = ANY($1::text[])`,
    [roster.map((r) => r.personId)]
  );
  // One MLB person can be linked to more than one of our player ids (an
  // old and a new card for the same man): keep all of them.
  const idsByPerson = new Map<string, typeof mapped>();
  for (const m of mapped) idsByPerson.set(m.source_player_id, [...(idsByPerson.get(m.source_player_id) || []), m]);
  const byPerson = new Map(mapped.map((m) => [m.source_player_id, m]));
  const { rows: stored } = await pool.query<{ playerid: string; n: number }>(
    `SELECT playerid::text AS playerid, count(DISTINCT source_game_id)::int AS n
       FROM player_game_logs
      WHERE source = 'mlb_api' AND source_team_id::text = ANY($1::text[]) AND game_date::date >= make_date($2, 1, 1)
      GROUP BY 1`,
    [aflTeamIds, SEASON]
  );
  const storedBy = new Map(stored.map((s) => [s.playerid, s.n]));

  const inUniverse = roster.filter((r) => byPerson.has(r.personId));
  console.log(`In our universe (mapped): ${inUniverse.length}\n`);
  console.log(["player", "AFL team", "pos", "playerid", "hsid", "MLB AFL games (bat/pit)", "stored AFL games", "MLB current team (sport)", "status"].join(" | "));

  let complete = 0, missing = 0, partial = 0, none = 0;
  for (const r of inUniverse) {
    const m = byPerson.get(r.personId)!;
    const [bat, pit] = await Promise.all([aflGames(r.personId, "hitting"), aflGames(r.personId, "pitching")]);
    const cur = await currentTeam(r.personId);
    const links = idsByPerson.get(r.personId) || [m];
    const perId = links.map((l) => `${l.playerid}${l.match_method === 'rejected_bad_identity_match' ? '(rejected)' : ''}:${storedBy.get(l.playerid) || 0}`).join(' ');
    const have = Math.max(...links.map((l) => storedBy.get(l.playerid) || 0));
    const mlbGames = Math.max(bat, pit);
    const status = mlbGames === 0 ? "no AFL games yet" : have === 0 ? "MISSING" : have < mlbGames ? "PARTIAL" : "complete";
    if (status === "complete") complete++; else if (status === "MISSING") missing++; else if (status === "PARTIAL") partial++; else none++;
    console.log([r.name, r.team, r.pos, perId, m.hsid || "-", `${bat}/${pit}`, have, `${cur.name} (${cur.sport ?? "-"})`, status].join(" | "));
    await delay(150);
  }
  console.log(`\nSummary: ${complete} complete, ${partial} partial, ${missing} missing, ${none} with no AFL games yet (of ${inUniverse.length} in our universe)`);

  // Not mapped: AFL players we couldn't link to anyone in our universe.
  const unmapped = roster.filter((r) => !byPerson.has(r.personId));
  console.log(`\nAFL players not linked to our universe: ${unmapped.length}`);

  if (NAME) {
    console.log(`\nLookup "${NAME}":`);
    for (const r of roster.filter((x) => x.name.toLowerCase().includes(NAME))) {
      console.log(`  AFL roster: ${r.name} (${r.team}, ${r.pos}) mlb ${r.personId} -> ${byPerson.has(r.personId) ? `playerid ${byPerson.get(r.personId)!.playerid}` : "NOT LINKED"}`);
    }
    const { rows } = await pool.query(
      `SELECT f.playerid::text AS playerid, f.display_name, f.hsid::text AS hsid, f.status_label, f.current_team_name,
              (SELECT string_agg(m.source_player_id || ':' || coalesce(m.match_method, ''), ', ') FROM player_source_map m WHERE m.playerid::text = f.playerid::text AND m.source = 'mlb_api') AS mlb
         FROM flip_card_front_stage f WHERE lower(f.display_name) LIKE '%' || $1 || '%'`,
      [NAME]
    );
    for (const row of rows) console.log(`  our universe: ${JSON.stringify(row)}`);
    if (!rows.length) console.log("  our universe: no card with that name");
  }
}

main().then(() => pool.end()).catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
