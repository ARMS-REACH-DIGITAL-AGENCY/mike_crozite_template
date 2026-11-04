# YAT?STATS — 208,427 Player Universe Audit

**Captured:** November 3, 2026 Arizona time. **Status:** Full isolated source capture and safe branch-only merge tested. **NOT production-promoted.**

## Verified sources
- **TBC live Players feed:** 208,427 distinct Player IDs, 208,427 source records, 20,608,141 bytes. SHA256 `25e9fad9cf9f8f0e5197470a64a2c0b2db3db3483c8060f6f6b6252d18fcf76b`.
- Original raw response also preserved in persistent Vercel sandbox `tbc-universe-preserved-source-20261103` snapshot `snap_cWpZD2WRQJlC2heJow8LxihUtGKr`.
- **Independent 208,427-row Neon capture completed** using GitHub Actions run [41770262029](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/41770262029). Canonical production player tables were not touched. New audit tables: `tbc_players_full_feed_audit_runs`, `tbc_players_full_feed_audit_rows`. Capture run ID `c771515b-cd92-49a0-a6e8-bb045bd9d8fa`.
- Source CSV has 3 malformed rows `214777`, `248578`, `266578`, with source lines preserved and player IDs retained but other columns quarantined. `248578` previously corrupted an adjacent record in production `tbc_players_raw`. Treat no quarantined record as fully ingested.

## Exact reconciliation to existing production
- Production raw players: **124,937**; source IDs already in raw: **124,935**; source IDs missing from raw: **83,492**, of which **83,490** have syntactically valid source rows. Two legacy raw IDs are absent from today's source.
- Production flip cards: **124,369**; source IDs already with cards **124,273**; source IDs with missing cards **84,154**.
- Existing source-associated cards: 15 with HSID disagreement vs uniquely resolved source school, 350 missing usable status, 46,932 missing level, 81 with teamid but missing current team name, 124,160 without graduation year and 124,112 without varsity years. Birth/graduate and roster years must NOT be invented: source Players file does not supply them.
- Full-source HSID resolution: **206,861 unique-match player IDs** across **17,052 school programs**, **848 no-match**, **715 ambiguous multi-HSID** (72 duplicate normalized school-name keys in canonical registry), and **3 source rows quarantined**. Total unresolved **1,566**. Home-schooled/no high school is not automatically an erroneous mapping or a site.
- `audit_tbc_player_hsid_reconciliation_20261103`, `audit_complete_school_programs_20261103`, and `audit_complete_school_card_quality_20261103` are temporary audit/report tables in production. They do not modify canonical tables.

## Safe shadow-branch promotion test — NOT production
- Neon branch `br-frosty-sun-a4aowmn2` (`test-208427-player-and-card-merge-20261103`) copied from production.
- Inserted 83,490 valid new raw players with `ON CONFLICT DO NOTHING`, resulting in **208,427 total raw players** on test branch, 2 captured source IDs still absent due to malformed fields.
- Inserted **82,970** unique-HSID baseline flip cards, resulting in **207,339 total flip cards** on test branch; **1,184** captured source IDs still have no flip card, and **15** existing HSIDs disagree with unique source school.
- Test cards remain incomplete: **83,320** missing status, **129,903** missing level. Do NOT promote this staged result as pristine, nor invent player status based on highest historical level.

## 2026 stats — critical separate gap
- The historical batting/pitching ZIP has **44,428 distinct 2026 player IDs** and **52,348 2026 batting/pitching stat rows**, spanning **1,854 team IDs**.
- Existing production `tbc_batting_2026_season_raw` and `tbc_pitching_2026_season_raw` cover only **14,266 distinct players** and **1,705 team IDs**. These are materially different from historical ZIP; a specific exact Player ID diff is still required to quantify uncovered IDs.
- Existing school-program reports count only production 2026 stat activity; **they understate full 2026 historical ZIP coverage** and are intentionally labeled provisional.
- All 14,266 players in current production 2026 stat tables appear in the captured 208,427 Players feed and are uniquely school-linked.
- For historical ZIP 2026 team IDs, **1,829** have populated canonical name, level and conference/org; **4** have incomplete mappings; **21** are missing Team IDs entirely.

## Available detailed CSV reports
1. **`2026_historical_zip_all_1854_teamids_mapped.csv`**: all 1,854 historical ZIP 2026 team IDs, known mapped team names, levels, conference/org, source stat counts, 25 mapping exceptions.
2. **`2026_teamid_directory.csv`**: all 1,705 team IDs from production 2026 season stats, mapped college/team names, level and conference.
3. **`full_universe_school_rosters_and_card_gaps.csv`**: all 17,052 uniquely resolved HS programs, names, HSIDs, all-time alumni from full source, **provisional** 2026 active/IL coverage, and per-program card gap counts. These uniquely resolved schools account for 82,970 missing cards before branch test.
4. **`complete_208427_source_unresolved_hsids.csv`**: 1,566 source player IDs with no or ambiguous HSID, source details, and quarantine reason.
5. **`complete_208427_source_school_programs.csv`**: 17,052 school programs with unique-match source all-time counts and **provisional** current production 2026 stats/IL counts.
6. **`raw_player_missing_flipcard_or_hsid_link.csv`**: 674 canonical production raw-player crosswalk/card errors before source expansion.
7. **`2026_stat_players_missing_raw_or_card.csv`**: 11 player IDs with 2026 production stats but no raw player and flip card before expansion.
8. **`school_program_directory_existing_crosswalk.csv`**: original 7,954 old raw-player-linked schools for before/after comparison.

## Engineering status
- Pull request **#677** proposes per-physical-source-record parsing, incomplete-feed count and unique-ID safeguards, quarantining malformed rows, permanent per-run auditing, and the isolated capture workflow.
- Preview builds must pass and tests must validate replay of exact 208K source with no record bleed, preservation of source's existing fields and runtime duration before production merge.
- The once-off audit workflow has succeeded. It is **not** an automatic canonical 208K ingestion pipeline. Do not claim it has fixed production yet.
- Critical work remaining: map 1,566 HSID exceptions (including 72 ambiguous school names); fix and verify 3 malformed source rows; perform safe bulk promotion with rollback checkpoint; source-authoritative status/level enrichment for all new cards; 2026 ZIP-to-Neon stats reconciliation; recalc all-school active and all-time counts; run production QA and monitor next 3 AM/3 PM feeds.
