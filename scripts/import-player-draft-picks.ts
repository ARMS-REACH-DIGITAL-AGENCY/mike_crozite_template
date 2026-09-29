// scripts/import-player-draft-picks.ts
// Fills public.player_draft_picks: every time a player on the platform was
// drafted (year, round, overall pick, team, where he was drafted from). The
// Career Path Timeline shows it as a "DRAFTED" milestone on that year.
//
// Sources, in order of trust:
//   1. MLB Stats API (source 'mlb_api'): /people?personIds=...&hydrate=draft
//      for players linked in player_source_map (links rejected as a
//      different person are skipped, same as the game log sync). Gives the
//      round, overall pick, pick in the round, team, school and bonus.
//   2. The Baseball Cube's draft_info (source 'tbc') in tbc_batting_raw /
//      tbc_pitching_raw, formatted YEAR-ROUND-OVERALL-TEAMCODE (e.g.
//      2013-4-124-LAN). Used for any draft year MLB doesn't list for him.
//      Anything else in that field (e.g. "2018-2025", a span of years) is
//      not a draft and is skipped.
// One row per (playerid, draft_year). An MLB row always replaces a TBC row
// for the same year; a TBC row never replaces an MLB row.
//
// Usage:
//   npx tsx scripts/import-player-draft-picks.ts              # everyone
//   npx tsx scripts/import-player-draft-picks.ts --player 317316
//   npx tsx scripts/import-player-draft-picks.ts --dry-run
//
// Env: DATABASE_URL.

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
const ONLY_PLAYER = argValue("--player");
const DRY_RUN = args.includes("--dry-run");

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const BATCH = 100;
const TBC_DRAFT = /^(\d{4})-(\d+)-(\d+)-([A-Z0-9]*)$/;

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

type Pick = {
  playerid: string;
  draft_year: number;
  draft_round: string | null;
  draft_round_pick: number | null;
  draft_overall_pick: number | null;
  draft_team_name: string | null;
  drafted_from: string | null;
  signing_bonus: number | null;
  source: "mlb_api" | "tbc";
};

// TBC (Retrosheet-style) franchise codes -> the team's name in that draft year.
function tbcTeamName(code: string, year: number): string | null {
  switch (code) {
    case "ANA":
      return year < 2005 ? "Anaheim Angels" : "Los Angeles Angels";
    case "CAL":
      return "California Angels";
    case "TBA":
      return year < 2008 ? "Tampa Bay Devil Rays" : "Tampa Bay Rays";
    case "MIA":
      return year < 2012 ? "Florida Marlins" : "Miami Marlins";
    case "FLO":
      return "Florida Marlins";
    case "CLE":
      return year < 2022 ? "Cleveland Indians" : "Cleveland Guardians";
    case "OAK":
      return "Oakland Athletics";
    case "ATH":
      return "Athletics";
  }
  const names: Record<string, string> = {
    ARI: "Arizona Diamondbacks",
    ATL: "Atlanta Braves",
    BAL: "Baltimore Orioles",
    BOS: "Boston Red Sox",
    CHA: "Chicago White Sox",
    CHN: "Chicago Cubs",
    CIN: "Cincinnati Reds",
    COL: "Colorado Rockies",
    DET: "Detroit Tigers",
    HOU: "Houston Astros",
    KCA: "Kansas City Royals",
    KC1: "Kansas City Athletics",
    LAN: "Los Angeles Dodgers",
    MIL: "Milwaukee Brewers",
    MLN: "Milwaukee Braves",
    MIN: "Minnesota Twins",
    MON: "Montreal Expos",
    NYA: "New York Yankees",
    NYN: "New York Mets",
    NY1: "New York Giants",
    PHI: "Philadelphia Phillies",
    PIT: "Pittsburgh Pirates",
    SDN: "San Diego Padres",
    SEA: "Seattle Mariners",
    SE1: "Seattle Pilots",
    SFN: "San Francisco Giants",
    SLN: "St. Louis Cardinals",
    TEX: "Texas Rangers",
    TOR: "Toronto Blue Jays",
    WAS: "Washington Nationals",
    WS1: "Washington Senators",
    WS2: "Washington Senators",
  };
  return names[code] || null;
}

const toInt = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
};

async function fetchMlbDrafts(personIds: string[]): Promise<Map<string, Record<string, unknown>[]>> {
  const out = new Map<string, Record<string, unknown>[]>();
  const url = `${MLB_API_BASE}/people?personIds=${personIds.join(",")}&hydrate=draft`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { people?: { id: number; drafts?: Record<string, unknown>[] }[] };
      for (const p of data.people || []) out.set(String(p.id), p.drafts || []);
      return out;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  return out;
}

async function main() {
  console.log(`Draft picks${ONLY_PLAYER ? ` for ${ONLY_PLAYER}` : ""}${DRY_RUN ? " (dry run)" : ""}`);
  const picks = new Map<string, Pick>(); // `${playerid}:${year}`
  const key = (p: Pick) => `${p.playerid}:${p.draft_year}`;

  // ---- 1. MLB Stats API --------------------------------------------------
  const links = await pool.query<{ playerid: string; source_player_id: string }>(
    `SELECT m.playerid, m.source_player_id
       FROM player_source_map m JOIN flip_card_front_stage f ON f.playerid = m.playerid
      WHERE m.source = 'mlb_api' AND m.match_method IS DISTINCT FROM 'rejected_bad_identity_match'
        AND coalesce(m.source_player_id, '') <> '' ${ONLY_PLAYER ? "AND m.playerid = $1" : ""}`,
    ONLY_PLAYER ? [ONLY_PLAYER] : []
  );
  const playeridsByMlb = new Map<string, string[]>();
  for (const l of links.rows) playeridsByMlb.set(l.source_player_id, [...(playeridsByMlb.get(l.source_player_id) || []), l.playerid]);
  const mlbIds = [...playeridsByMlb.keys()];
  let mlbPicks = 0;
  let mlbFailedBatches = 0;
  for (let i = 0; i < mlbIds.length; i += BATCH) {
    let drafts: Map<string, Record<string, unknown>[]>;
    try {
      drafts = await fetchMlbDrafts(mlbIds.slice(i, i + BATCH));
    } catch (error) {
      mlbFailedBatches += 1;
      console.warn(`MLB batch ${i / BATCH + 1} failed: ${(error as Error).message}`);
      continue;
    }
    for (const [mlbId, list] of drafts) {
      for (const d of list) {
        if (d.isDrafted === false || d.isPass === true) continue;
        const year = toInt(d.year);
        if (!year) continue;
        const team = d.team as { name?: string } | undefined;
        const school = d.school as { name?: string } | undefined;
        for (const playerid of playeridsByMlb.get(mlbId) || []) {
          const pick: Pick = {
            playerid,
            draft_year: year,
            draft_round: d.pickRound != null ? String(d.pickRound) : null,
            draft_round_pick: toInt(d.roundPickNumber),
            draft_overall_pick: toInt(d.pickNumber),
            draft_team_name: team?.name || null,
            drafted_from: school?.name || null,
            signing_bonus: d.signingBonus != null && Number.isFinite(Number(d.signingBonus)) ? Number(d.signingBonus) : null,
            source: "mlb_api",
          };
          // Two picks the same year (e.g. January and June drafts before
          // 1987): keep the earlier/higher pick.
          const had = picks.get(key(pick));
          if (!had || (pick.draft_overall_pick ?? 1e9) < (had.draft_overall_pick ?? 1e9)) picks.set(key(pick), pick);
          mlbPicks += 1;
        }
      }
    }
  }
  console.log(`MLB API: ${mlbIds.length} linked players, ${mlbPicks} draft picks${mlbFailedBatches ? `, ${mlbFailedBatches} batches failed` : ""}`);

  // ---- 2. The Baseball Cube ---------------------------------------------
  const tbc = await pool.query<{ playerid: string; draft_info: string }>(
    `SELECT DISTINCT r.playerid, trim(r.draft_info) AS draft_info
       FROM (SELECT playerid, draft_info FROM tbc_batting_raw UNION ALL SELECT playerid, draft_info FROM tbc_pitching_raw) r
       JOIN flip_card_front_stage f ON f.playerid = r.playerid
      WHERE coalesce(trim(r.draft_info), '') <> '' ${ONLY_PLAYER ? "AND r.playerid = $1" : ""}`,
    ONLY_PLAYER ? [ONLY_PLAYER] : []
  );
  let tbcAdded = 0;
  let tbcSkipped = 0;
  const unknownCodes = new Map<string, number>();
  for (const r of tbc.rows) {
    const m = TBC_DRAFT.exec(r.draft_info);
    if (!m) {
      tbcSkipped += 1;
      continue;
    }
    const year = Number(m[1]);
    const code = m[4];
    const teamName = code ? tbcTeamName(code, year) : null;
    if (code && !teamName) unknownCodes.set(code, (unknownCodes.get(code) || 0) + 1);
    const pick: Pick = {
      playerid: r.playerid,
      draft_year: year,
      draft_round: String(Number(m[2])),
      draft_round_pick: null,
      draft_overall_pick: toInt(m[3]),
      draft_team_name: teamName,
      drafted_from: null,
      signing_bonus: null,
      source: "tbc",
    };
    const had = picks.get(key(pick));
    if (had?.source === "mlb_api") continue;
    if (!had || (pick.draft_overall_pick ?? 1e9) < (had.draft_overall_pick ?? 1e9)) {
      if (!had) tbcAdded += 1;
      picks.set(key(pick), pick);
    }
  }
  console.log(`TBC: ${tbc.rows.length} draft_info values, ${tbcAdded} picks MLB doesn't list, ${tbcSkipped} not a draft (skipped)`);
  if (unknownCodes.size) console.log(`TBC team codes with no name: ${[...unknownCodes].map(([c, n]) => `${c} ${n}`).join(", ")}`);

  const all = [...picks.values()];
  const players = new Set(all.map((p) => p.playerid)).size;
  console.log(`Picks: ${all.length} for ${players} players (mlb_api ${all.filter((p) => p.source === "mlb_api").length}, tbc ${all.filter((p) => p.source === "tbc").length})`);
  if (ONLY_PLAYER || DRY_RUN) {
    for (const p of all.slice(0, ONLY_PLAYER ? all.length : 10)) {
      console.log(`  ${p.playerid} ${p.draft_year} round ${p.draft_round} #${p.draft_overall_pick ?? "?"} overall, ${p.draft_team_name ?? "?"}${p.drafted_from ? ` from ${p.drafted_from}` : ""} [${p.source}]`);
    }
  }
  if (DRY_RUN) {
    await pool.end();
    return;
  }

  let written = 0;
  for (let i = 0; i < all.length; i += 1000) {
    const batch = all.slice(i, i + 1000);
    const res = await pool.query(
      `INSERT INTO player_draft_picks (playerid, draft_year, draft_round, draft_round_pick, draft_overall_pick,
                                       draft_team_name, drafted_from, signing_bonus, source, updated_at)
       SELECT x.playerid, x.draft_year, x.draft_round, x.draft_round_pick, x.draft_overall_pick,
              x.draft_team_name, x.drafted_from, x.signing_bonus, x.source, now()
         FROM jsonb_to_recordset($1::jsonb) AS x(playerid text, draft_year int, draft_round text, draft_round_pick int,
              draft_overall_pick int, draft_team_name text, drafted_from text, signing_bonus numeric, source text)
       ON CONFLICT (playerid, draft_year) DO UPDATE
         SET draft_round = EXCLUDED.draft_round, draft_round_pick = EXCLUDED.draft_round_pick,
             draft_overall_pick = EXCLUDED.draft_overall_pick, draft_team_name = EXCLUDED.draft_team_name,
             drafted_from = EXCLUDED.drafted_from, signing_bonus = EXCLUDED.signing_bonus,
             source = EXCLUDED.source, updated_at = now()
         WHERE player_draft_picks.source = 'tbc' OR EXCLUDED.source = 'mlb_api'`,
      [JSON.stringify(batch)]
    );
    written += res.rowCount || 0;
  }
  console.log(`Written: ${written}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
