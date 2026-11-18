#!/usr/bin/env tsx
// scripts/mlb-moves-since-roster-sync.ts
//
// RULE (Pete, Nov 18 2026; CLAUDE.md "The MLB feed is the authority"): the
// newest MLB move always replaces an older one on the card. The roster sync
// (scripts/refresh-flip-card-front-stage-from-mlb.ts) reads each player's
// current team and status straight from MLB, but it only ran every 8-11 hours,
// so a move like Kody Huff's Nov 17 "Selected" waited that long.
//
// This check runs after every MLB Transactions Sync (every 15 minutes) and
// prints how many MLB moves for players with a card arrived after the last
// completed roster sync. The workflow starts the roster sync when it is > 0.
// Read-only: one query.

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const { rows } = await pool.query<{ moves: number; last_roster_sync: string | null }>(`
    WITH last_run AS (
      SELECT MAX(completed_at) AS completed_at
        FROM public.source_ingest_runs
       WHERE source = 'mlb_api' AND feed_name = 'mlb_full_org_roster' AND status = 'completed'
    )
    SELECT COUNT(*)::int AS moves, (SELECT completed_at::text FROM last_run) AS last_roster_sync
      FROM public.player_transactions t
     WHERE t.source = 'mlb_api'
       AND t.created_at > COALESCE((SELECT completed_at FROM last_run), '-infinity'::timestamptz)
       AND EXISTS (SELECT 1 FROM public.flip_card_front_stage f WHERE f.playerid::text = t.playerid::text)
  `);
  const { moves, last_roster_sync } = rows[0] ?? { moves: 0, last_roster_sync: null };
  console.error(`MLB moves for card players since the last roster sync (${last_roster_sync ?? "never"}): ${moves}`);
  // stdout carries only the number, for the workflow.
  console.log(String(moves));
}

main()
  .catch((err) => {
    console.error("ERROR:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
