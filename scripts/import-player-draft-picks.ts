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
//      2013-4-124-LAN). Used only for players MLB has no draft record for
//      (MLB lists every time a player was drafted, signed or not, so a TBC
//      year that MLB doesn't have would be a mismatch, not another draft).
//      Anything else in that field (e.g. "2018-2025", a span of years) is
//      not a draft and is skipped.
// One row per (playerid, draft_year). An MLB row always replaces a TBC row
// for the same year; a TBC row never replaces an MLB row.
//
// Then every pick gets a Draft Day story in the player's Stories tab
// (player_moment_submissions, stage 'Draft Day', posted by YAT?STATS):
// "Drafted by the X · Round N · #N Overall · from School", dated the draft
// month, with the drafting club's logo as its photo (teams/{teamid}.png;
// clubs matched by current name only - a former name like the Montreal
// Expos gets no logo and the site shows the YAT?STATS crest). Fans comment
// and add photos to it like any story. Stories are only added or have
// their wording / logo brought up to date - never removed, so fans'
// comments are never lost.
//
// Usage:
//   npx tsx scripts/import-player-draft-picks.ts              # everyone
//   npx tsx scripts/import-player-draft-picks.ts --player 317316
//   npx tsx scripts/import-player-draft-picks.ts --dry-run
//   npx tsx scripts/import-player-draft-picks.ts --stories-only   # skip the fetch
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
const STORIES_ONLY = args.includes("--stories-only");

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

// ---------------------------------------------------------------------------
// Draft Day stories
// ---------------------------------------------------------------------------
const DRAFT_STAGE = "Draft Day";

// One row per pick: the story it should have. The draft moved from June to
// July in 2021 (same as the timeline's pennant); stories keep the month.
const WANT = `
  SELECT d.playerid, d.draft_year,
         make_date(d.draft_year, CASE WHEN d.draft_year >= 2021 THEN 7 ELSE 6 END, 1) AS taken,
         concat_ws(' · ',
           CASE WHEN nullif(trim(d.draft_team_name), '') IS NOT NULL THEN 'Drafted by the ' || trim(d.draft_team_name) ELSE 'Drafted' END,
           CASE WHEN nullif(trim(d.draft_round), '') IS NOT NULL THEN 'Round ' || trim(d.draft_round) END,
           CASE WHEN d.draft_overall_pick IS NOT NULL THEN '#' || d.draft_overall_pick || ' Overall' END,
           CASE WHEN nullif(trim(d.drafted_from), '') IS NOT NULL THEN 'from ' || trim(d.drafted_from) END
         ) AS caption,
         t.teamid, f.hsid, f.player_name
    FROM player_draft_picks d
    LEFT JOIN LATERAL (
      SELECT u.teamid::text AS teamid FROM teamid_universe_mapping u
       WHERE u.level_label = 'MLB' AND lower(u.current_team_name) = lower(d.draft_team_name)
       ORDER BY u.teamid LIMIT 1
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT f.hsid::text AS hsid, nullif(trim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, '')), '') AS player_name
        FROM flip_card_front_stage f WHERE f.playerid::text = d.playerid
       ORDER BY f.updated_at DESC NULLS LAST LIMIT 1
    ) f ON true
   WHERE ($1::text IS NULL OR d.playerid = $1)`;

// The Draft Day story already made for a pick.
const HAVE = `
  SELECT DISTINCT ON (m.playerid, m.photo_taken_year) m.id, m.playerid, m.photo_taken_year, m.caption
    FROM player_moment_submissions m
   WHERE m.stage = '${DRAFT_STAGE}' AND m.contributor_firebase_uid IS NULL
   ORDER BY m.playerid, m.photo_taken_year, m.id`;

async function syncDraftDayStories() {
  const player = ONLY_PLAYER || null;
  const { rows: plan } = await pool.query<{ to_add: number; add_with_logo: number; captions: number; logos: number }>(
    `WITH want AS (${WANT}), have AS (${HAVE})
     SELECT count(*) FILTER (WHERE h.id IS NULL)::int AS to_add,
            count(*) FILTER (WHERE h.id IS NULL AND w.teamid IS NOT NULL)::int AS add_with_logo,
            count(*) FILTER (WHERE h.id IS NOT NULL AND h.caption IS DISTINCT FROM w.caption)::int AS captions,
            count(*) FILTER (WHERE h.id IS NOT NULL AND w.teamid IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM player_moment_photos p WHERE p.moment_id = h.id AND p.s3_key = 'teams/' || w.teamid || '.png'))::int AS logos
       FROM want w LEFT JOIN have h ON h.playerid = w.playerid AND h.photo_taken_year = w.draft_year`,
    [player]
  );
  const p = plan[0];
  console.log(`Draft Day stories: ${p.to_add} to add (${p.add_with_logo} with a club logo), ${p.captions} to reword, ${p.logos} logos to set`);
  if (ONLY_PLAYER || DRY_RUN) {
    const { rows: sample } = await pool.query<{ playerid: string; draft_year: number; caption: string; teamid: string | null }>(
      `WITH want AS (${WANT}) SELECT playerid, draft_year, caption, teamid FROM want ORDER BY draft_year DESC, playerid LIMIT ${ONLY_PLAYER ? 50 : 5}`,
      [player]
    );
    for (const r of sample) console.log(`  ${r.playerid} ${r.draft_year}: ${r.caption} [logo ${r.teamid ? `teams/${r.teamid}.png` : "none - crest"}]`);
  }
  if (DRY_RUN) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // New picks: the story, its player and its logo, together.
    const added = await client.query(
      `WITH want AS (${WANT}), have AS (${HAVE}),
       todo AS (
         SELECT w.* FROM want w
          WHERE NOT EXISTS (SELECT 1 FROM have h WHERE h.playerid = w.playerid AND h.photo_taken_year = w.draft_year)
       ), story AS (
         INSERT INTO player_moment_submissions (
           playerid, hsid, stage, caption, contributor_name, status, player_name,
           photo_taken_date, photo_taken_year, sort_date, visibility, is_private, arms_sync_status
         )
         SELECT playerid, hsid, '${DRAFT_STAGE}', caption, 'YAT?STATS', 'live', player_name,
                taken, draft_year, taken, 'public', false, 'system'
           FROM todo
         RETURNING id, playerid, photo_taken_year
       ), players AS (
         INSERT INTO player_moment_players (moment_id, playerid, is_primary)
         SELECT id, playerid, true FROM story
       ), logo AS (
         INSERT INTO player_moment_photos (moment_id, sort_order, s3_key, web_s3_key, thumb_s3_key, mime_type)
         SELECT s.id, 0, 'teams/' || t.teamid || '.png', 'teams-web/' || t.teamid || '.webp', 'teams-web/' || t.teamid || '.webp', 'image/png'
           FROM story s JOIN todo t ON t.playerid = s.playerid AND t.draft_year = s.photo_taken_year
          WHERE t.teamid IS NOT NULL
       )
       SELECT count(*)::int AS n FROM story`,
      [player]
    );
    // Picks that changed (e.g. a TBC pick replaced by MLB's): new wording.
    const reworded = await client.query(
      `WITH want AS (${WANT}), have AS (${HAVE})
       UPDATE player_moment_submissions m SET caption = w.caption, hsid = coalesce(m.hsid, w.hsid), player_name = coalesce(m.player_name, w.player_name)
         FROM want w JOIN have h ON h.playerid = w.playerid AND h.photo_taken_year = w.draft_year
        WHERE m.id = h.id AND m.caption IS DISTINCT FROM w.caption`,
      [player]
    );
    // A club matched since (or a different club now): its logo, in place of
    // any earlier logo. Fans' comment photos live elsewhere and are untouched.
    const relogoed = await client.query(
      `WITH want AS (${WANT}), have AS (${HAVE}),
       fix AS (
         SELECT h.id, w.teamid FROM want w JOIN have h ON h.playerid = w.playerid AND h.photo_taken_year = w.draft_year
          WHERE w.teamid IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM player_moment_photos p WHERE p.moment_id = h.id AND p.s3_key = 'teams/' || w.teamid || '.png')
       ), gone AS (
         DELETE FROM player_moment_photos p USING fix WHERE p.moment_id = fix.id AND p.s3_key LIKE 'teams/%'
       )
       INSERT INTO player_moment_photos (moment_id, sort_order, s3_key, web_s3_key, thumb_s3_key, mime_type)
       SELECT id, 0, 'teams/' || teamid || '.png', 'teams-web/' || teamid || '.webp', 'teams-web/' || teamid || '.webp', 'image/png' FROM fix`,
      [player]
    );
    await client.query("COMMIT");
    console.log(`Draft Day stories written: ${added.rows[0]?.n ?? 0} added, ${reworded.rowCount || 0} reworded, ${relogoed.rowCount || 0} logos set`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  if (STORIES_ONLY) {
    await syncDraftDayStories();
    await pool.end();
    return;
  }
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
  const mlbPlayers = new Set([...picks.values()].map((p) => p.playerid));
  let tbcAdded = 0;
  let tbcSkipped = 0;
  let tbcMlbHas = 0;
  const unknownCodes = new Map<string, number>();
  for (const r of tbc.rows) {
    if (mlbPlayers.has(r.playerid)) {
      tbcMlbHas += 1;
      continue;
    }
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
    if (!had || (pick.draft_overall_pick ?? 1e9) < (had.draft_overall_pick ?? 1e9)) {
      if (!had) tbcAdded += 1;
      picks.set(key(pick), pick);
    }
  }
  console.log(
    `TBC: ${tbc.rows.length} draft_info values, ${tbcMlbHas} for players MLB already has, ${tbcAdded} picks added, ${tbcSkipped} not a draft (skipped)`
  );
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
    await syncDraftDayStories();
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
  await syncDraftDayStories();
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
