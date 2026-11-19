#!/usr/bin/env ts-node
// scripts/audit-mlb-player-links.ts
// YAT?STATS - audit every alumni <-> MLB player link (YAT Registry, yat_mlb_links;
// MLB ID -> YAT ID) against MLB's own birthdate / birth city.
//
// Until Sep 2026 the roster and transactions syncs linked an alumnus to an
// MLB player on name alone (and the birthdate check compared "4/15/2005"
// to "2005-04-15", so it never fired). Common names collided: a Maranatha
// HS pitcher became the Cubs catcher Carson Kelly, one "Carlos Martinez"
// absorbed five different pros. This finds those links.
//
// Default is a report only - nothing is written. With --apply, in one
// transaction:
//   - each failing link is marked match_method = 'rejected_bad_identity_match'
//     (kept as a record; resolvePlayerFromSourceMap ignores it from now on)
//   - the latest roster run's resolution rows for those MLB ids -> unmatched
//   - the wrong person's transactions are deleted, and the affected
//     players' MLB game logs (the game-log sync re-pulls any valid link)
//   - flip-card MLB fields that came from the wrong person are cleared
//
// Usage:
//   npx tsx scripts/audit-mlb-player-links.ts            # report only
//   npx tsx scripts/audit-mlb-player-links.ts --apply    # fix

import { appendFileSync } from "fs";
import { Pool } from "pg";
import {
  identityVerdict,
  REJECTED_MATCH_METHOD,
  toIsoDate,
  type IdentityVerdict,
} from "./lib/player-identity";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const BATCH_SIZE = 100;
const apply = process.argv.includes("--apply");

// Links a person made by hand are trusted as-is.
const TRUSTED_METHODS = new Set(["manual_review", "manual"]);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface LinkRow {
  playerid: string;
  yatid: string;
  source_player_id: string;
  source_player_name: string | null;
  match_method: string | null;
  firstname: string | null;
  lastname: string | null;
  borndate: string | null;
  place: string | null;
  high_school: string | null;
}

interface MlbPerson {
  id: number;
  fullName?: string;
  rosterEntries?: {
    team?: { id?: number; name?: string };
    status?: { description?: string };
    startDate?: string;
    endDate?: string;
    statusDate?: string;
  }[];
  birthDate?: string;
  birthCity?: string;
  birthStateProvince?: string;
  birthCountry?: string;
}

interface AuditedLink extends LinkRow {
  verdict: IdentityVerdict;
  mlb: MlbPerson;
}

async function fetchPeople(ids: string[]): Promise<Map<string, MlbPerson>> {
  const out = new Map<string, MlbPerson>();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const res = await fetch(
      `${MLB_API_BASE}/people?personIds=${batch.join(",")}&hydrate=rosterEntries`
    );
    if (!res.ok) throw new Error(`MLB /people HTTP ${res.status} for batch starting ${batch[0]}`);
    const data = (await res.json()) as { people?: MlbPerson[] };
    for (const person of data.people ?? []) out.set(String(person.id), person);
  }
  return out;
}

function describe(link: AuditedLink): string {
  const ours = `${link.firstname ?? ""} ${link.lastname ?? ""}`.trim();
  return (
    `${ours} (playerid ${link.playerid}; born ${toIsoDate(link.borndate) ?? "?"} / ${link.place ?? "?"}; ${link.high_school ?? "?"})` +
    ` -> MLB ${link.mlb.fullName ?? link.source_player_name} (${link.source_player_id}; born ${link.mlb.birthDate ?? "?"} / ${
      [link.mlb.birthCity, link.mlb.birthStateProvince ?? link.mlb.birthCountry].filter(Boolean).join(", ") || "?"
    })`
  );
}

async function main() {
  console.log(`=== Audit alumni <-> MLB player links (${apply ? "APPLY" : "report only"}) ===`);

  const { rows: links } = await pool.query<LinkRow>(`
    -- YAT key step 9: every MLB link in the YAT Registry (MLB ID -> YAT ID),
    -- checked against the TBC record attached to the same YAT ID.
    SELECT l.playerid,
           l.yatid,
           l.mlb_id AS source_player_id,
           NULL::text AS source_player_name,
           l.match_method,
           TRIM(p.firstname) AS firstname,
           TRIM(p.lastname) AS lastname,
           p.borndate::text AS borndate,
           TRIM(p.place) AS place,
           TRIM(p.high_school) AS high_school
      FROM public.yat_mlb_links l
      LEFT JOIN LATERAL (
        SELECT t.* FROM public.yat_registry_ids r
          JOIN public.tbc_players_raw t ON t.playerid::text = r.source_id
         WHERE r.yatid = l.yatid AND r.source = 'tbc'
         ORDER BY r.source_id LIMIT 1
      ) p ON true
  `);
  console.log(`Links to check: ${links.length}`);

  const people = await fetchPeople([...new Set(links.map((l) => l.source_player_id))]);
  console.log(`MLB people fetched: ${people.size}`);

  const audited: AuditedLink[] = [];
  let trusted = 0;
  let noPlayerRow = 0;
  let noMlbPerson = 0;
  for (const link of links) {
    if (link.match_method && TRUSTED_METHODS.has(link.match_method)) { trusted++; continue; }
    if (!link.firstname && !link.lastname) { noPlayerRow++; continue; }
    const mlb = people.get(link.source_player_id);
    if (!mlb) { noMlbPerson++; continue; }
    audited.push({ ...link, mlb, verdict: identityVerdict(link, mlb) });
  }

  const confirmed = audited.filter((l) => l.verdict === "confirmed");
  // Birth dates differ but the birth city (or birth state and year) agrees:
  // never rejected or kept on our own say-so. The link stays, and Pete
  // decides in yat_registry_review (Pete, Nov 19 2026).
  const review = audited.filter((l) => l.verdict === "review");
  const rejected = audited.filter((l) => l.verdict === "conflict" || l.verdict === "unverified");
  for (const l of review) {
    await pool.query(
      `INSERT INTO public.yat_registry_review (source, source_id, source_name, source_fields, candidates, reason)
       VALUES ('mlb', $1, $2, $3::jsonb, $4::jsonb, $5)
       ON CONFLICT DO NOTHING`,
      [
        l.source_player_id,
        l.mlb.fullName ?? null,
        JSON.stringify({ birth_date: l.mlb.birthDate ?? null, birth_city: l.mlb.birthCity ?? null, birth_state: l.mlb.birthStateProvince ?? null }),
        JSON.stringify([{ yatid: l.yatid, playerid: l.playerid, name: `${l.firstname ?? ""} ${l.lastname ?? ""}`.trim(), birth_date: l.borndate, birthplace: l.place, high_school: l.high_school }]),
        "Linked earlier. Birth dates differ, but the birthplace agrees. The link stays until Pete decides.",
      ]
    );
  }
  const conflicts = rejected.filter((l) => l.verdict === "conflict");
  const unverified = rejected.filter((l) => l.verdict === "unverified");

  const rejectedIds = rejected.map((l) => l.source_player_id);
  const affectedPlayerIds = [...new Set(rejected.map((l) => l.playerid))];
  const stillLinked = new Set(confirmed.map((l) => l.playerid));
  const unlinkedPlayerIds = affectedPlayerIds.filter((id) => !stillLinked.has(id));

  console.log("");
  console.log(`Confirmed (kept):                    ${confirmed.length}`);
  console.log(`Waiting for Pete (yat_registry_review): ${review.length}`);
  console.log(`Different person (birthdate+city):   ${conflicts.length}`);
  console.log(`Unverified (no birthdate/city match): ${unverified.length}`);
  console.log(`Skipped - trusted manual link:       ${trusted}`);
  console.log(`Skipped - no tbc_players_raw row:     ${noPlayerRow}`);
  console.log(`Skipped - MLB returned no person:     ${noMlbPerson}`);
  console.log(`Alumni affected: ${affectedPlayerIds.length} (${unlinkedPlayerIds.length} left with no MLB link)`);
  console.log("");
  for (const l of rejected) console.log(`${l.verdict.toUpperCase().padEnd(10)} ${describe(l)}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      `## Alumni <-> MLB link audit (${apply ? "applied" : "report only"})`,
      "",
      `| Result | Links |`,
      `|---|---|`,
      `| Confirmed (kept) | ${confirmed.length} |`,
      `| Waiting for Pete (yat_registry_review) | ${review.length} |`,
      `| Different person | ${conflicts.length} |`,
      `| Unverified | ${unverified.length} |`,
      `| Alumni affected | ${affectedPlayerIds.length} |`,
      "",
      "| Verdict | Link |",
      "|---|---|",
      ...rejected.map((l) => `| ${l.verdict} | ${describe(l).replace(/\|/g, "/")} |`),
      "",
    ];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
  }

  const integrity = await integrityChecks(people);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, integrity.markdown);
  }

  // A scheduled run fails (so GitHub emails the repo owner) when a link to
  // the wrong person exists - the syncs should never create one now.
  if (!apply && rejected.length > 0) process.exitCode = 1;

  if (!apply || rejected.length === 0) {
    if (!apply) console.log("\nReport only - nothing written. Re-run with --apply to fix.");
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const today = new Date().toISOString().slice(0, 10);
    for (const l of rejected) {
      const note = `Rejected ${today} by audit-mlb-player-links (${l.verdict}): ${describe(l)}`;
      // The YAT Registry link goes, and the pair is recorded so no job links
      // it again (yat_registry_rejections).
      await client.query(`SELECT public.yat_reject_link('mlb', $1, $2, 'not the same person (audit-mlb-player-links)', $3)`,
        [l.source_player_id, l.yatid, note]);
      // Kept in step with the old table until the site code moves off it.
      await client.query(
        `UPDATE public.player_source_map
            SET match_method = $2,
                match_confidence = 0,
                is_verified = false,
                notes = $3,
                updated_at = NOW()
          WHERE source = 'mlb_api' AND source_player_id = $1`,
        [l.source_player_id, REJECTED_MATCH_METHOD, note]
      );
    }

    const resolution = await client.query(
      `UPDATE public.mlb_org_roster_resolution r
          SET match_status = 'unmatched',
              match_method = 'identity_check_failed',
              notes = 'Link rejected by audit-mlb-player-links: same name, different person',
              updated_at = NOW()
        WHERE r.source_player_id = ANY($1::text[])
          AND r.match_status = 'matched'
          AND r.run_id = (
            SELECT run_id FROM public.source_ingest_runs
             WHERE source = 'mlb_api' AND feed_name = 'mlb_full_org_roster' AND status = 'completed'
             ORDER BY completed_at DESC NULLS LAST, started_at DESC
             LIMIT 1
          )`,
      [rejectedIds]
    );

    const transactions = await client.query(
      `DELETE FROM public.player_transactions
        WHERE source = 'mlb_api'
          AND playerid::text = ANY($1::text[])
          AND payload->'person'->>'id' = ANY($2::text[])`,
      [affectedPlayerIds, rejectedIds]
    );

    const gameLogs = await client.query(
      `DELETE FROM public.player_game_logs
        WHERE source = 'mlb_api' AND playerid::text = ANY($1::text[])`,
      [affectedPlayerIds]
    );

    // Clear every MLB-derived flip-card field that came from the wrong
    // person: rows whose current team was set from a rejected MLB id, and
    // rows of alumni left with no MLB link at all whose team/status came
    // from the MLB roster or transactions pipelines.
    const stage = await client.query(
      `UPDATE public.flip_card_front_stage
          SET current_team_name = NULL,
              current_team_level = NULL,
              current_team_source = NULL,
              current_team_source_player_id = NULL,
              current_team_source_team_id = NULL,
              current_team_roster_status = NULL,
              current_team_last_verified = NULL,
              current_team_absent_since = NULL,
              current_org_or_conference_name = NULL,
              level_label = NULL,
              display_level_label = NULL,
              status_label = NULL,
              display_status_label = NULL,
              team_affiliation_status = NULL,
              is_on_40man = NULL,
              forty_man_org_name = NULL,
              forty_man_org_abbr = NULL,
              next_game_date = NULL,
              next_game_time_local = NULL,
              next_game_time_utc = NULL,
              next_game_home_away = NULL,
              next_game_opponent = NULL,
              next_game_status_label = NULL,
              previous_team_name = CASE WHEN last_transaction_applied_at IS NOT NULL THEN NULL ELSE previous_team_name END,
              previous_org_or_conference_name = CASE WHEN last_transaction_applied_at IS NOT NULL THEN NULL ELSE previous_org_or_conference_name END,
              last_transaction_type = NULL,
              last_transaction_date = NULL,
              last_transaction_team_name = NULL,
              last_transaction_applied_at = NULL,
              stage_updated_at = NOW()
        WHERE (current_team_source = 'mlb_api' AND current_team_source_player_id = ANY($1::text[]))
           OR (playerid::text = ANY($2::text[])
               AND (current_team_source = 'mlb_api' OR last_transaction_applied_at IS NOT NULL))`,
      [rejectedIds, unlinkedPlayerIds]
    );

    await client.query("COMMIT");
    console.log("");
    console.log(`Applied: ${rejected.length} links rejected`);
    console.log(`  roster resolution rows unmatched: ${resolution.rowCount}`);
    console.log(`  wrong-person transactions deleted: ${transactions.rowCount}`);
    console.log(`  MLB game logs deleted (re-synced for valid links): ${gameLogs.rowCount}`);
    console.log(`  flip cards cleared: ${stage.rowCount}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Daily data-integrity report (report only; nothing is written):
//   - cards whose MLB team isn't where MLB says the player is now (his open
//     roster entry), e.g. a traded player stuck on his old club
//   - alumni linked to more than one MLB player
//   - status labels the site's filters don't know
const KNOWN_STATUSES = new Set([
  "ACTIVE",
  "RETIRED",
  "FREE AGENT",
  "REHAB ASSIGNMENT",
  "DEVELOPMENT LIST",
  "DESIGNATED FOR ASSIGNMENT",
  "DFA",
  "INJURED - FULL SEASON",
]);

function isKnownStatus(status: string): boolean {
  return (
    KNOWN_STATUSES.has(status) ||
    /^INJURED/.test(status) ||
    /(SUSPENDED|RESTRICTED|BEREAVEMENT|REASSIGNED|OPTION|MINOR|PATERNITY|TEMPORARY)/.test(status)
  );
}

async function integrityChecks(
  people: Map<string, MlbPerson>
): Promise<{ markdown: string }> {
  const { rows: cards } = await pool.query<{
    playerid: string;
    display_name: string | null;
    current_team_name: string | null;
    current_team_source_player_id: string | null;
    current_team_source_team_id: string | null;
    status_label: string | null;
  }>(`
    SELECT playerid::text AS playerid, display_name, current_team_name,
           current_team_source_player_id::text AS current_team_source_player_id,
           current_team_source_team_id::text AS current_team_source_team_id,
           status_label
      FROM public.flip_card_front_stage
     WHERE current_team_source = 'mlb_api'
  `);

  const wrongTeam: string[] = [];
  for (const card of cards) {
    const person = card.current_team_source_player_id
      ? people.get(card.current_team_source_player_id)
      : undefined;
    if (!person || !card.current_team_name) continue;
    const open = (person.rosterEntries ?? []).filter((e) => !e.endDate);
    if (open.length === 0) {
      wrongTeam.push(`${card.display_name} (${card.playerid}): card says ${card.current_team_name}, MLB has no current roster entry`);
      continue;
    }
    const openTeamIds = new Set(open.map((e) => String(e.team?.id ?? "")));
    if (card.current_team_source_team_id && !openTeamIds.has(card.current_team_source_team_id)) {
      wrongTeam.push(
        `${card.display_name} (${card.playerid}): card says ${card.current_team_name}, MLB says ${open
          .map((e) => `${e.team?.name} (${e.status?.description})`)
          .join(" / ")}`
      );
    }
  }

  const { rows: multi } = await pool.query<{ playerid: string; n: number; names: string }>(`
    -- One person (YAT ID) with more than one MLB ID in the YAT Registry.
    SELECT max(m.playerid) AS playerid, count(*)::int AS n,
           string_agg(m.mlb_id, ', ') AS names
      FROM public.yat_mlb_links m
     GROUP BY m.yatid
    HAVING count(*) > 1
  `);

  const unknownStatus = cards
    .filter((c) => c.status_label && !isKnownStatus(c.status_label.toUpperCase()))
    .map((c) => `${c.display_name} (${c.playerid}): ${c.status_label}`);

  const sections: [string, string[]][] = [
    ["Card team differs from MLB's current assignment", wrongTeam],
    ["Alumni linked to more than one MLB player", multi.map((m) => `playerid ${m.playerid}: ${m.names}`)],
    ["Unrecognized status labels", unknownStatus],
  ];

  console.log("");
  console.log("=== Data integrity ===");
  const md = ["", "## Data integrity", ""];
  for (const [title, items] of sections) {
    console.log(`${title}: ${items.length}`);
    for (const item of items.slice(0, 50)) console.log(`  ${item}`);
    md.push(`### ${title}: ${items.length}`, "", ...items.slice(0, 100).map((i) => `- ${i}`), "");
  }
  return { markdown: md.join("\n") };
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exitCode = 1;
});
