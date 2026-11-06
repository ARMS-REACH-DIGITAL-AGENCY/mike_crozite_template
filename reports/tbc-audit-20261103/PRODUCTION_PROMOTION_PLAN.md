# YAT?STATS — full player-universe production promotion handoff

**Status:** Development only. No production import/promotion or canonical changes.
**Coordination issue:** https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/issues/675
**Previous source audit:** `reports/tbc-audit-20261103/README.md`

## Verified evidence

- Full Baseball Cube Players snapshot stored independently: 208,427 unique Player IDs (run `c771515b-cd92-49a0-a6e8-bb045bd9d8fa`). A later live parser test saw 208,456 IDs, but those 29 newer IDs are not part of this stored snapshot.
- Production before full promotion: 124,948 raw TBC players and 124,379 flip cards.
- The production ingestion cron intentionally verifies Players without promoting them: `promotedToRaw=false`. The 3 AM / 3 PM sync still processes 2026 batting and pitching.
- Current full-snapshot crosswalk, tested in an *isolated Neon branch* `br-green-firefly-a4idix79`: 208,427 source candidates (no duplicates); 206,861 matched to a single canonical HSID across 17,052 programs; 82,970 unique-HSID candidates need a flip card. Existing source cards: 123,876 matched correctly; 13 mismatched HSIDs and 2 blank HSIDs.
- Identity exceptions: 848 unmatched HSID text keys, 715 ambiguous multiple HSIDs, and 3 source row quarantine cases. These + 15 incorrect/blank existing-card HSIDs give 1,581 candidate records requiring review.
- Historic ZIP includes 44,428 distinct players with 2026 stat lines, while the existing production 2026 season tables contain only 14,266 distinct players. Their exact ID diff and feed provenance must be reconciled before calling school active counts complete.
- Historical ZIP 2026 Team ID directory: 1,854 Team IDs, 25 unresolved/incomplete mappings.

## Architecture and order of operations

### Phase 1 — immutable source capture (existing but not automated full-row daily)
1. Separate the live endpoint read from the transaction that updates canonical player records.
2. Store full normalized source rows and source hash under `run_id`; verify count, ID uniqueness, schema, and payload completeness against the observed baseline. Quarantine malformed physical records by ID, without dropping adjacent rows.
3. Do NOT classify `capture_only` as success of canonical production player import. Store per-run counts for the source, validated rows, quarantined rows, raw promotion, stage promotion and errors.
4. Test a daily/incremental capture against 208K+ rows on an isolated branch. Measure source transfer, COPY/bulk-load duration and DB units. Avoid 500-row INSERT loops.

### Phase 2 — permanent source identity and HSID candidates (implemented here, isolated-test verified)
- Migration: `migrations/20261104_prepare_tbc_player_hsid_candidates.sql` adds the `public.tbc_player_hsid_candidates` table and `prepare_tbc_player_hsid_candidates(uuid)` function. It preserves `source_run_id`, source identity/name/school/row position, unique HSID candidates, existing-card conflicts, quarantine reason, and review status.
- Read-only confirmation from isolated branch (run UUID above): **208,427 rows**, **123,876 `VERIFIED_EXISTING_CARD`**, **82,970 `UNIQUE_SCHOOL_NEEDS_CARD`**, **848 `NO_MATCHING_SCHOOL`**, **715 `AMBIGUOUS_SCHOOL`**, **13 `EXISTING_CARD_HSID_MISMATCH`**, **2 `EXISTING_CARD_HSID_MISSING`**, **3 `SOURCE_QUARANTINED`**.
- This candidate table is *not a fan-facing read model*. It does not write to `tbc_players_raw`, `flip_card_front_stage`, `player_hsids`, or school caches. It preserves existing fan-created YAT IDs and source-to-player identity mappings.
- Before any canonical promotion: resolve school aliases via reviewed key + jurisdiction; do not choose the first match or invent HSIDs. Add durable manual exception/alias rules with provenance and allow reversible correction.

### Phase 3 — raw merge and card materialization (NOT YET IMPLEMENTED)
1. On a production-like clone, copy a *validated snapshot only* into a durable staging layer. Bulk merge by `playerid`, insert new only, and update changed fields with a source-field diff. Never overwrite fan-owned fields with null.
2. Populate verified source-to-YAT mappings and HSIDs. Run identity collision checks against contributed IDs and same-name/school matches.
3. Build prepared `flip_card_front_stage` records through the source authority hierarchy: verified school link; 2026 activity and documented IL/redshirt; verified MLB current roster where relevant; canonical team and level mapping; retired highest career level prepared from season data. Do **not** assign `ACTIVE`, `RETIRED`, `PRO`, or team names simply because a Player ID exists.
4. Ensure the existing `guard_flip_card_canonical_promotion` function approves all new team/level assignments. Exceptions remain in an explicit review queue and do not silently populate incorrect fan-facing filters.
5. Materialize 2026 activity and All-Time school counts outside page render. Refresh only affected school/player summaries after successful changes.

### Phase 4 — controlled release and post-verification
- Pure release-policy module: `scripts/lib/tbc-ingest-release-gates.mjs`. Tests: `node scripts/test-tbc-ingest-release-gates.mjs` (5 checks passing).
- **Pre-promotion:** full fresh source ID set and landing count match; quarantines documented; HSID ambiguity handled; historical 2026 stats reconciled; isolated load/SQL, timeouts, transfer cost, p95, mobile/desktop functional parity and rollback rehearsal approved.
- **Post-promotion:** every publishable ID has verified raw identity and card; every published card has supported HSID, status, level, team provenance or a reviewed exception; counts recomputed across school hubs. Verify no repeat of school-page filter regression and no transaction-long locks.
- Promote in small batches with checkpoint+resume and backout. Never combine 208K raw/flip cards and 939K historical stat rows into one unbounded serverless transaction.

## Reporting policy
- Report independently: `source_downloaded`, `source_unique`, `source_validated`, `quarantined`, `staged`, `canonical_raw`, `card_materialized`, `card_published`, `school_linked`, `status_verified`, `level_verified`, `last_complete_run`.
- **Only call the entire ingest successful when the explicitly enabled promotion stage has passed its own acceptance criteria.** A successful feed download must never be misrepresented as 208K published cards.

## Integration/agent guardrails
- All pipeline development should coordinate via issue #675 to avoid conflicting PRs and expensive query regressions.
- Player profile performance PR #607 and school-shell performance PR #525 are unmerged. Rebase/test independently; don't merge blindly.
- Code in this PR is staging/release policy only. Source feed production cron remains capture-only; no production schema migrations or mass imports in this PR.
