# YAT?STATS — 208,427-player source and player-stage audit (2026-11-03)

## Audit scope and source
- Direct live TBC Players-feed download at 2026-11-04 03:14:56 UTC: **208,427 distinct Player IDs**, 208,427 physical source data lines, **0 duplicated Player IDs**, 0 invalid Player IDs, HTTP 200, 20,608,141 bytes.
- Original response SHA-256: `25e9fad9cf9f8f0e5197470a64a2c0b2db3db3483c8060f6f6b6252d18fcf76b`.
- Source URL: https://www.thebaseballcube.com/data/feed/yatstats/players/?pw=yattbc
- Entire original response and normalized CSV are preserved in isolated Vercel sandbox `tbc-universe-preserved-source-20261103` (persistent snapshot `snap_cWpZD2WRQJlC2heJow8LxihUtGKr`), **not** promoted to Neon or production.
- The source contains **17,404 unique nonempty high-school text descriptions**, but those are *not* guaranteed to be unique HSIDs/programs; only 2 source records lack a school description.
- The source includes Player IDs 180979 and 368402.
- Three malformed physical CSV records: 248578 and 266578 (unpaired quote in unquoted height) and 214777 (14 instead of 13 fields; uncertain name alignment). **Never fabricate a name/HSID for 214777.** Report as quarantined pending verified correction.

## Live production state BEFORE full import
- `tbc_players_raw`: **124,937** records.
- `flip_card_front_stage`: **124,369** cards.
- Latest stored feed landing: 101,070 distinct IDs, so do not equate an HTTP 200 with complete ingestion.
- At least one live record already corrupted: `tbc_players_raw.playerid=248578` has the next player's CSV line inside its high-school field. The adjacent Player ID 347384 is not present in that raw table.
- Existing raw-player linkage issues: 674 distinct players: 663 missing flip cards, 9 unresolved/mismatched school crosswalks, 2 existing cards with blank HSIDs. See `raw_player_missing_flipcard_or_hsid_link.csv`.
- Existing card data quality: 350 without usable status; 46,933 without usable level; 81 with a team ID but blank team name and organization; 124,162 without class_of; 124,116 without roster_years. **Graduation year and varsity roster years are not furnished by this Players feed and should not be fabricated.** Evaluate applicability by player type before declaring defects.
- Current raw-linked school programs: 7,954; currently 1,026 have alumni with 2026 stat rows, and 1,031 have either 2026 stat rows or recorded IL/redshirt status without 2026 stats. These counts are the *existing* crosswalk only, not the eventual 208,427-player universe. See `school_program_directory_existing_crosswalk.csv`.
- 2026 batting/pitching raw tables cover 14,266 distinct stat players, including 11 with no raw-player record/flip card. See `2026_stat_players_missing_raw_or_card.csv`.
- 2026 raw stats reference 1,705 distinct Team IDs. Every ID has a mapping row; **Team ID 0** is invalid/placeholder (UNKNOWN TEAM 0, 2 players), missing conference/org. See `2026_teamid_directory.csv`.

## Deliverables in this directory
1. `2026_teamid_directory.csv` — **all 1,705 Team IDs** from existing 2026 batting and pitching, with mapped team name, level, conference/org, both stat row counts and unique-player counts, TBC link and review flag.
2. `school_program_directory_existing_crosswalk.csv` — all **7,954 currently linked HS programs**, exact school name, HSID, location, current all-time alumni count, 2026-stat alumni, and documented IL/redshirt-without-2026-stat counts.
3. `raw_player_missing_flipcard_or_hsid_link.csv` — **674 raw players** with missing card or unresolved/mismatched HSID crosswalk.
4. `2026_stat_players_missing_raw_or_card.csv` — **11** named players with 2026 stats who lack raw-player/card entries.

## Important limitations
- **This is NOT a completed 208,427-card audit.** No complete feed was inserted into production or the Neon audit branch. No claim of 208,427 properly linked cards can be made.
- **There is not yet an exact Player ID set difference** between the 208,427 live source IDs and the 190,134 IDs in the historical batting/pitching ZIP. The 18,293 difference between totals does not establish 18,293 players missing statistics (different universes and players with no stats are possible).
- IL/redshirt counts are based on documented existing status only. Blank status does not imply injured, redshirt, or inactive.
- All 2026 stats are from current production season tables, not a fully reconciled combination of all historical provider exports.
- The protective importer PR adds a minimum-count guard, per-record parsing, quarantining of malformed source lines, and append-only ingestion outcomes. It has not been merged or deployed to production; verify TypeScript, staging ingest performance and production transaction duration before release.

## Correct acceptance criteria for the eventual ingestion
1. Complete current live response downloaded and source hash, timestamp, source-line count and 208,427 distinct playerids preserved.
2. Strict schema validation and a quarantine list for source mistakes. A quarantined row is **not** a completed player import.
3. All valid source IDs stored in a new immutable landing snapshot; raw player merge has reconciled IDs and no accidental overwrites of other provenance.
4. For each intended player, either a verified HSID and flip card or an explicit named, reviewed exception. Unknown source HSIDs require official school registry reconciliation (e.g. Legendary Prep).
5. All new cards pass fan-facing data quality checks; unknown grad year and varsity years remain unknown, not invented.
6. Full all-time vs. 2026 status and school-program reports recomputed against the completed universe, with source attribution and repeatable delta tracking.
