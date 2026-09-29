// scripts/build-player-team-stints.ts
// Builds public.player_team_stints: which team each player was on, from when
// to when, for one season. The Game Log tab shows every game a player's team
// played during each stint (his line where he played, "Did not play" where
// he didn't), so the Fantasy Bracket and the Game Log agree on which team he
// was with on any day.
//
// Pro players (MLB Stats API data) - his games and transactions are walked
// in date order:
//   - A transaction that puts him on a team (assigned, optioned, recalled,
//     selected, outrighted, ...) starts a stint on its effective date.
//   - A signing, trade or claim to an MLB club is usually followed by an
//     assignment to an affiliate; the stint goes to the affiliate, dated from
//     the signing. On one day, an assignment beats a signing.
//   - A release (or declared free agency, retirement) ends a stint.
//   - A game for a team he isn't on yet means a move the transactions
//     missed: his games are the hard evidence and always win.
//   - The roster sync (every 3 hours) says whether his latest stint is still
//     open (stint_end NULL). A roster team that differs from his latest stint
//     opens a new stint and is reported.
// College players: one stint per college team from The Baseball Cube's
//   season stats, dated by that team's first and last game in
//   college_schedule_games_raw (Feb 1 - Jun 30 when we don't have its
//   schedule), ending the day before his first pro stint that season.
//
// Team ids: stints use our (TBC) teamid. MLB Stats API team ids are mapped
// with team_id_map; a team missing there is matched by its exact name to one
// pro team in teamid_universe_mapping (never a partial or fuzzy match), and
// the pair is added to team_id_map (source 'exact_name_match') so the Game
// Log can load that team's schedule. Names that match no team, or more than
// one, are reported, not guessed.
//
// Each run replaces the season's rows player by player. The report lists
// every disagreement it found.
//
// Usage:
//   npx tsx scripts/build-player-team-stints.ts                 # current season
//   npx tsx scripts/build-player-team-stints.ts --season 2026
//   npx tsx scripts/build-player-team-stints.ts --player 317316 # one player, printed, not written
//   npx tsx scripts/build-player-team-stints.ts --dry-run       # build and report, don't write
//
// Env: DATABASE_URL. REPORT_PATH (default stint-report.csv).

import { writeFileSync } from "node:fs";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const args = process.argv.slice(2);
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
};
const CURRENT_YEAR = new Date().getUTCFullYear();
const SEASON = Number(argValue("--season") || CURRENT_YEAR);
const ONLY_PLAYER = argValue("--player");
const DRY_RUN = args.includes("--dry-run") || Boolean(ONLY_PLAYER);
const REPORT_PATH = process.env.REPORT_PATH || "stint-report.csv";
const IS_CURRENT_SEASON = SEASON === CURRENT_YEAR;

if (!Number.isInteger(SEASON) || SEASON < 1900 || SEASON > CURRENT_YEAR + 1) {
  console.error(`Invalid --season: ${argValue("--season")}`);
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Transaction types. Status and number changes don't move anyone; a DFA
// leaves him on the team until he's traded, outrighted or released.
const IGNORE_TYPES = /status change|number change|designated for assignment/i;
const END_TYPES = /released|retired|free agency|contract terminated/i;
// Moves that usually name the MLB club before an assignment to an affiliate.
const ORG_TYPES = /signed|trade|claimed|purchased|acquired/i;
const SCHOOL_LEVELS = /HIGH SCHOOL|NCAA|NAIA|NJCAA|CCCAA|NWAC/i;
const COLLEGE_LEVELS = "NCAA|NAIA|NJCAA|CCCAA|NWAC";
// A signing/trade to an MLB club that isn't followed by an assignment or a
// game within this many days is a stint with the MLB club itself.
const ORG_HOLD_DAYS = 14;

type Stint = { teamid: string; start: string; end: string | null; source: string };
type Move = { date: string; teamid: string; org: boolean };
type ReportRow = { playerid: string; issue: string; detail: string };

const report: ReportRow[] = [];
const note = (playerid: string, issue: string, detail: string) => report.push({ playerid, issue, detail });

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const maxDate = (a: string, b: string) => (a > b ? a : b);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

async function main() {
  console.log(`Season ${SEASON}${ONLY_PLAYER ? `, player ${ONLY_PLAYER}` : ""}${DRY_RUN ? " (dry run)" : ""}`);
  // Only players on the platform.
  const onlyPlayer = ONLY_PLAYER ? "AND f.playerid = $2" : "";
  const params = ONLY_PLAYER ? [SEASON, ONLY_PLAYER] : [SEASON];
  const inSeason = (col: string) => `${col} >= make_date($1, 1, 1) AND ${col} < make_date($1 + 1, 1, 1)`;

  // ---- Team lookups ------------------------------------------------------
  const universe = await pool.query<{ teamid: string; name: string | null; level: string | null }>(
    `SELECT teamid, current_team_name AS name, level_label AS level FROM teamid_universe_mapping`
  );
  const teamInfo = new Map(universe.rows.map((r) => [r.teamid, r]));
  // Exact team name -> the one pro (non-school) teamid with that name.
  const proByName = new Map<string, string | null>();
  for (const r of universe.rows) {
    if (!r.name || SCHOOL_LEVELS.test(r.level || "")) continue;
    const key = r.name.trim().toLowerCase();
    proByName.set(key, proByName.has(key) ? null : r.teamid); // null = more than one
  }

  const idMap = await pool.query<{ tbc_teamid: string; mlb_stats_api_id: string; team_name: string | null }>(
    `SELECT tbc_teamid, mlb_stats_api_id::text, team_name FROM team_id_map WHERE mlb_stats_api_id IS NOT NULL`
  );
  const byMlbId = new Map<string, string>();
  const mappedTeamids = new Set<string>();
  const byName = new Map<string, string>();
  for (const r of idMap.rows) {
    byMlbId.set(r.mlb_stats_api_id, r.tbc_teamid);
    mappedTeamids.add(r.tbc_teamid);
    if (r.team_name) byName.set(r.team_name.trim().toLowerCase(), r.tbc_teamid);
  }
  const teamidForName = (name: string | null | undefined) => {
    if (!name) return null;
    const key = name.trim().toLowerCase();
    return byName.get(key) || proByName.get(key) || null;
  };

  // MLB team ids seen this season (his games, the schedule) that team_id_map
  // doesn't have yet: add them by exact name.
  const seen = await pool.query<{ mlb_id: string; name: string }>(
    `SELECT DISTINCT source_team_id AS mlb_id, team_name AS name FROM player_game_logs
      WHERE ${inSeason("game_date")} AND source_team_id IS NOT NULL
     UNION SELECT DISTINCT home_team_id::text, home_team_name FROM team_schedules WHERE ${inSeason("game_date")}
     UNION SELECT DISTINCT away_team_id::text, away_team_name FROM team_schedules WHERE ${inSeason("game_date")}`,
    [SEASON]
  );
  const newPairs: { mlbId: string; teamid: string; name: string }[] = [];
  const unmappedMlb = new Map<string, string>();
  for (const r of seen.rows) {
    if (!r.mlb_id || byMlbId.has(r.mlb_id)) continue;
    const key = (r.name || "").trim().toLowerCase();
    const teamid = proByName.get(key);
    if (teamid && !mappedTeamids.has(teamid)) {
      byMlbId.set(r.mlb_id, teamid);
      mappedTeamids.add(teamid);
      byName.set(key, teamid);
      newPairs.push({ mlbId: r.mlb_id, teamid, name: r.name });
    } else {
      unmappedMlb.set(r.mlb_id, r.name);
    }
  }

  // ---- Player data -------------------------------------------------------
  const games = await pool.query<{ playerid: string; game_date: string; source_team_id: string; team_name: string }>(
    `SELECT DISTINCT g.playerid, g.game_date::text, g.source_team_id, g.team_name
       FROM player_game_logs g JOIN flip_card_front_stage f ON f.playerid = g.playerid
      WHERE ${inSeason("g.game_date")} ${onlyPlayer}
      ORDER BY g.playerid, g.game_date`,
    params
  );
  const txs = await pool.query<{ playerid: string; d: string; transaction_type: string; to_team_name: string | null }>(
    `SELECT t.playerid, t.effective_date::date::text AS d, t.transaction_type, t.to_team_name
       FROM player_transactions t JOIN flip_card_front_stage f ON f.playerid = t.playerid
      WHERE ${inSeason("t.effective_date")} ${onlyPlayer}
      ORDER BY t.playerid, t.effective_date, t.id`,
    params
  );
  const roster = await pool.query<{ playerid: string; mlb_team_id: string; team_name: string | null }>(
    `SELECT f.playerid, f.current_team_source_team_id AS mlb_team_id, f.current_team_name AS team_name
       FROM flip_card_front_stage f
      WHERE f.current_team_source = 'mlb_api' AND coalesce(f.current_team_source_team_id, '') <> ''
        ${ONLY_PLAYER ? "AND f.playerid = $1" : ""}`,
    ONLY_PLAYER ? [ONLY_PLAYER] : []
  );
  const teamFirstGame = await pool.query<{ team_id: string; first_game: string }>(
    `SELECT team_id, min(game_date)::text AS first_game FROM (
       SELECT home_team_id::text AS team_id, game_date FROM team_schedules WHERE ${inSeason("game_date")}
       UNION ALL SELECT away_team_id::text, game_date FROM team_schedules WHERE ${inSeason("game_date")}) s
     GROUP BY 1`,
    [SEASON]
  );
  const firstGameByMlb = new Map(teamFirstGame.rows.map((r) => [r.team_id, r.first_game]));

  const college = await pool.query<{ playerid: string; teamid: string }>(
    `SELECT DISTINCT r.playerid, r.teamid
       FROM (SELECT playerid, teamid, year FROM tbc_batting_raw
             UNION SELECT playerid, teamid, year FROM tbc_pitching_raw
             UNION SELECT playerid, teamid, year FROM tbc_batting_2026_season_raw
             UNION SELECT playerid, teamid, year FROM tbc_pitching_2026_season_raw) r
       JOIN teamid_universe_mapping u ON u.teamid = r.teamid
       JOIN flip_card_front_stage f ON f.playerid = r.playerid
      WHERE r.year = $1::text AND u.level_label ~* '${COLLEGE_LEVELS}' ${onlyPlayer}`,
    params
  );
  const collegeDates = await pool.query<{ teamid: string; first_game: string; last_game: string }>(
    `SELECT teamid, min(game_date)::text AS first_game, max(game_date)::text AS last_game
       FROM college_schedule_games_raw
      WHERE ${inSeason("game_date")} AND teamid IS NOT NULL
      GROUP BY 1`,
    [SEASON]
  );
  const collegeWindow = new Map(collegeDates.rows.map((r) => [r.teamid, r]));

  // ---- Group by player ---------------------------------------------------
  const gamesBy = new Map<string, { date: string; teamid: string }[]>();
  for (const g of games.rows) {
    const teamid = byMlbId.get(g.source_team_id);
    if (!teamid) {
      note(g.playerid, "unmapped_game_team", `${g.game_date} ${g.team_name} (MLB id ${g.source_team_id})`);
      continue;
    }
    const list = gamesBy.get(g.playerid) || [];
    list.push({ date: g.game_date, teamid });
    gamesBy.set(g.playerid, list);
  }
  const movesBy = new Map<string, Move[]>();
  const endsBy = new Map<string, string[]>();
  for (const t of txs.rows) {
    if (IGNORE_TYPES.test(t.transaction_type)) continue;
    if (END_TYPES.test(t.transaction_type)) {
      endsBy.set(t.playerid, [...(endsBy.get(t.playerid) || []), t.d]);
      continue;
    }
    if (!t.to_team_name) continue;
    const teamid = teamidForName(t.to_team_name);
    if (!teamid) {
      note(t.playerid, "unmapped_transaction_team", `${t.d} ${t.transaction_type} -> ${t.to_team_name}`);
      continue;
    }
    const org = ORG_TYPES.test(t.transaction_type) && teamInfo.get(teamid)?.level === "MLB";
    movesBy.set(t.playerid, [...(movesBy.get(t.playerid) || []), { date: t.d, teamid, org }]);
  }
  const rosterBy = new Map<string, { teamid: string | null; mlbId: string; name: string | null }>();
  for (const r of roster.rows) {
    const teamid = byMlbId.get(r.mlb_team_id) || null;
    if (!teamid && IS_CURRENT_SEASON) note(r.playerid, "unmapped_roster_team", `${r.team_name} (MLB id ${r.mlb_team_id})`);
    rosterBy.set(r.playerid, { teamid, mlbId: r.mlb_team_id, name: r.team_name });
  }
  const collegeBy = new Map<string, string[]>();
  for (const c of college.rows) collegeBy.set(c.playerid, [...(collegeBy.get(c.playerid) || []), c.teamid]);

  const players = new Set<string>([...gamesBy.keys(), ...movesBy.keys(), ...collegeBy.keys()]);
  if (IS_CURRENT_SEASON) for (const [pid, r] of rosterBy) if (r.teamid) players.add(pid);

  const rows: { playerid: string; stints: Stint[] }[] = [];
  for (const pid of players) {
    const pro = buildProStints(
      pid,
      gamesBy.get(pid) || [],
      movesBy.get(pid) || [],
      endsBy.get(pid) || [],
      IS_CURRENT_SEASON ? rosterBy.get(pid) : undefined,
      firstGameByMlb
    );
    const stints = [...buildCollegeStints(collegeBy.get(pid) || [], collegeWindow, pro), ...pro];
    if (stints.length) rows.push({ playerid: pid, stints });
  }

  if (ONLY_PLAYER) {
    for (const r of rows) {
      for (const s of r.stints) {
        const info = teamInfo.get(s.teamid);
        console.log(`  ${s.start} -> ${s.end ?? "(current)"}  ${info?.name || s.teamid} [${s.teamid}, ${info?.level}]  from ${s.source}`);
      }
    }
    for (const r of report) console.log(`  report: ${r.issue} ${r.detail}`);
  }
  if (newPairs.length) {
    console.log(`Teams added to team_id_map by exact name${DRY_RUN ? " (dry run: not written)" : ""}: ${newPairs.length}`);
    for (const p of newPairs) console.log(`  MLB ${p.mlbId} ${p.name} -> ${p.teamid}`);
  }
  if (unmappedMlb.size) {
    console.log(`MLB teams with no single exact-name match (left unmapped): ${unmappedMlb.size}`);
    for (const [id, name] of unmappedMlb) console.log(`  MLB ${id} ${name}`);
  }

  // ---- Write -------------------------------------------------------------
  let written = 0;
  if (!DRY_RUN) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const p of newPairs) {
        await client.query(
          `INSERT INTO team_id_map (tbc_teamid, team_name, mlb_stats_api_id, source, updated_at)
           VALUES ($1, $2, $3, 'exact_name_match', now()) ON CONFLICT (tbc_teamid) DO NOTHING`,
          [p.teamid, p.name, Number(p.mlbId)]
        );
      }
      await client.query("COMMIT");
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const flat = batch.flatMap((r) => r.stints.map((s) => ({ playerid: r.playerid, ...s })));
        await client.query("BEGIN");
        await client.query(`DELETE FROM player_team_stints WHERE season = $1 AND playerid = ANY($2::text[])`, [
          SEASON,
          batch.map((r) => r.playerid),
        ]);
        await client.query(
          `INSERT INTO player_team_stints (playerid, teamid, team_name, level, season, stint_start, stint_end, start_source, updated_at)
           SELECT x.playerid, x.teamid, x.team_name, x.level, $1, x.stint_start::date, x.stint_end::date, x.start_source, now()
             FROM jsonb_to_recordset($2::jsonb) AS x(playerid text, teamid text, team_name text, level text,
                                                     stint_start text, stint_end text, start_source text)
           ON CONFLICT (playerid, season, stint_start, teamid) DO UPDATE
             SET stint_end = EXCLUDED.stint_end, team_name = EXCLUDED.team_name, level = EXCLUDED.level,
                 start_source = EXCLUDED.start_source, updated_at = now()`,
          [
            SEASON,
            JSON.stringify(
              flat.map((s) => ({
                playerid: s.playerid,
                teamid: s.teamid,
                team_name: teamInfo.get(s.teamid)?.name || null,
                level: teamInfo.get(s.teamid)?.level || null,
                stint_start: s.start,
                stint_end: s.end,
                start_source: s.source,
              }))
            ),
          ]
        );
        await client.query("COMMIT");
        written += flat.length;
      }
      // Players who no longer have any stint this season.
      const gone = await client.query(
        `DELETE FROM player_team_stints WHERE season = $1 AND NOT (playerid = ANY($2::text[]))`,
        [SEASON, rows.map((r) => r.playerid)]
      );
      if (gone.rowCount) console.log(`Removed ${gone.rowCount} stints of players who no longer have one`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  const total = rows.reduce((n, r) => n + r.stints.length, 0);
  const multi = rows.filter((r) => new Set(r.stints.map((s) => s.teamid)).size > 1).length;
  console.log(
    `Players: ${rows.length} (more than one team: ${multi}). Stints: ${total}${DRY_RUN ? " (dry run: not written)" : `, written ${written}`}`
  );
  const issues = new Map<string, Set<string>>();
  for (const r of report) issues.set(r.issue, (issues.get(r.issue) || new Set()).add(r.playerid));
  console.log(`Report (players): ${[...issues].map(([k, v]) => `${k} ${v.size}`).join(", ") || "no issues"}`);
  writeFileSync(
    REPORT_PATH,
    ["playerid,issue,detail", ...report.map((r) => [r.playerid, r.issue, JSON.stringify(r.detail)].join(","))].join("\n")
  );
  console.log(`Report written to ${REPORT_PATH}`);
  await pool.end();
}

function buildProStints(
  pid: string,
  games: { date: string; teamid: string }[],
  moves: Move[],
  ends: string[],
  roster: { teamid: string | null; mlbId: string; name: string | null } | undefined,
  firstGameByMlb: Map<string, string>
): Stint[] {
  const stints: Stint[] = [];
  let cur: Stint | null = null; // the open stint
  let pending: Move | null = null; // a signing/trade to an MLB club, waiting for its assignment
  let lastGame: string | null = null;

  const open = (teamid: string, start: string, source: string) => {
    if (cur && cur.teamid === teamid) return;
    if (cur) cur.end = maxDate(cur.start, addDays(start, -1));
    // Never start before the stint it follows ended.
    const prev = stints[stints.length - 1];
    if (prev?.end && start <= prev.end) start = addDays(prev.end, 1);
    cur = { teamid, start, end: null, source };
    stints.push(cur);
  };
  const flushPending = (before: string | null) => {
    if (pending && (before === null || daysBetween(pending.date, before) > ORG_HOLD_DAYS)) {
      const p: Move = pending;
      pending = null;
      open(p.teamid, p.date, "transaction");
    }
  };
  const endStint = (day: string) => {
    if (cur) cur.end = day;
    cur = null;
    pending = null;
  };

  const days = [...new Set([...games.map((g) => g.date), ...moves.map((m) => m.date), ...ends])].sort();
  for (const day of days) {
    flushPending(day);
    const dayMoves = moves.filter((m) => m.date === day);
    // One move per day: an assignment beats a signing to the MLB club.
    const move = dayMoves.filter((m) => !m.org).pop() || dayMoves.pop() || null;
    const dayEnd = ends.includes(day);
    // A release and a move the same day: the release comes first when he
    // moves to a new team, last when he's outrighted/assigned and then leaves.
    const endFirst = dayEnd && (!move || move.teamid !== (cur as Stint | null)?.teamid);
    if (endFirst) endStint(day);
    if (move) {
      if (move.org && (cur as Stint | null)?.teamid !== move.teamid) {
        pending = move;
      } else {
        const from: string = pending ? (pending as Move).date : move.date;
        pending = null;
        open(move.teamid, from, "transaction");
      }
    }
    if (dayEnd && !endFirst) endStint(day);
    for (const g of games.filter((x) => x.date === day)) {
      lastGame = day;
      if (cur && (cur as Stint).teamid === g.teamid) continue;
      if (pending) {
        const from: string = (pending as Move).date;
        pending = null;
        open(g.teamid, from, "transaction");
      } else {
        if (cur) note(pid, "game_without_transaction", `${day} game for ${g.teamid} while on ${(cur as Stint).teamid}`);
        open(g.teamid, day, "first_game");
      }
    }
  }

  if (roster) {
    // The roster sync is the last word on where he is now.
    if (pending && roster.teamid && roster.teamid !== (pending as Move).teamid) {
      const from: string = (pending as Move).date;
      pending = null;
      open(roster.teamid, from, "transaction");
    }
    flushPending(null);
    const now = cur as Stint | null;
    if (roster.teamid && (!now || now.teamid !== roster.teamid)) {
      const last = stints[stints.length - 1];
      const start = last
        ? addDays(maxDate(lastGame || "", last.end || last.start), 1)
        : firstGameByMlb.get(roster.mlbId) || `${SEASON}-01-01`;
      if (last) note(pid, "roster_differs_from_latest_stint", `latest ${last.teamid}, roster ${roster.teamid} ${roster.name}`);
      open(roster.teamid, start, "roster");
    }
  } else {
    flushPending(null);
    // Not on a pro roster now (or a past season): the open stint ended with
    // his last game there.
    const now = cur as Stint | null;
    if (now) now.end = maxDate(now.start, lastGame || now.start);
  }
  return stints;
}

function buildCollegeStints(
  teamids: string[],
  windows: Map<string, { first_game: string; last_game: string }>,
  pro: Stint[]
): Stint[] {
  const firstPro = pro.length ? pro.map((s) => s.start).sort()[0] : null;
  return [...new Set(teamids)]
    .map((teamid) => {
      const w = windows.get(teamid);
      let start = w?.first_game || `${SEASON}-02-01`;
      let end: string | null = w?.last_game || `${SEASON}-06-30`;
      if (firstPro && end >= firstPro) end = addDays(firstPro, -1);
      if (end < start) start = end;
      // Still in college (no pro stint this season): his college team is current.
      if (!firstPro && IS_CURRENT_SEASON) end = null;
      return { teamid, start, end, source: "college_season" };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
