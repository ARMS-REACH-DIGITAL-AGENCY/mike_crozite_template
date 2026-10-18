# TBC player metadata and source coverage audit

**Audit date:** October 18, 2026 (UTC). **Affected example:** Centennial High School, Peoria, Arizona, `hsid=3722`. **Deployed code inspected:** [`57677c98775b5266f911e1a60385b8fa29cae0ac`](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/commit/57677c98775b5266f911e1a60385b8fa29cae0ac).

## Finding

The 24 Centennial cards have identity records but no matching statistics in the inspected feeds or database statistics sources. Newly created identity baselines also lack recurring metadata enrichment. Together, these gaps prevent the intended `playerid → statistics.teamid → team metadata` lookup from supplying the card fields. A separate CSV parsing defect loses other player identities; all 24 Centennial identities survive it, so the parser repair cannot restore their missing statistics. A missing current-season row, or an older last-recorded season, does not establish retirement.

The [read-only audit SQL](../../scripts/sql/audit-tbc-player-coverage.sql) reproduces database coverage, season distribution, team mapping candidates and bounded ingest-health evidence. Counts below are the October 18 audit snapshot; subsequent imports can change them.

## Verified deployed data path

The deployed [ingest route](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/blob/57677c98775b5266f911e1a60385b8fa29cae0ac/src/app/api/cron/tbc-safe-ingest/route.ts) downloads three configured TBC feeds. It recreates each landing table, inserts parsed rows, then merges identities or replaces a statistics target using common columns.

| Feed | Landing table | Canonical destination |
|---|---|---|
| Players | `tbc_players_landing_latest` | `tbc_players_raw` (merge) |
| Batting | `tbc_batting_landing_latest` | `tbc_batting_2026_season_raw` (replace) |
| Pitching | `tbc_pitching_landing_latest` | `tbc_pitching_2026_season_raw` (replace) |

The live `v_tbc_batting_all_seasons_resolved` view selects `tbc_batting_raw` rows whose `year <> '2026'`, plus `tbc_batting_2026_season_raw` rows whose `year = '2026'`. Pitching follows the same rule. Catalog inspection found no additional statistics table behind these views. The [application reader](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/blob/57677c98775b5266f911e1a60385b8fa29cae0ac/src/lib/db.ts) queries the current-season tables and these resolved views.

The application reader prefers `PLAYERS_DATABASE_URL` over `DATABASE_URL`. Its deployed `PLAYERS_DATABASE_URL` was directly verified against the **Players project, main branch, `neondb`**, endpoint beginning `ep-tiny-bird`. The ingest route uses `DATABASE_URL`. Its deployed value was **not directly verified** because the environment response was truncated. Matching ingest-health counts and timestamps support continuity with the inspected database, but do not prove the writer's environment value. No credentials or feed query strings are included here.

## Source and database coverage

The exact configured feeds were downloaded without adding player-ID parameters and compared locally. Both statistics responses contained only 2026 rows.

| Measure | Batting | Pitching |
|---|---:|---:|
| Downloaded rows | 8,997 | 8,144 |
| Distinct player IDs | 8,053 | 7,048 |
| Latest landing rows | 8,997 | 8,144 |
| Canonical 2026 rows | 8,997 | 8,144 |
| Centennial player IDs represented | 0 of 24 | 0 of 24 |

The last observed successful `tbc_safe_ingest` run was **2026-10-17 22:00:23.183 UTC**, with zero consecutive failures. Its downloaded, inserted and target statistics counts match this table. The feeds were fetched around **01:25–01:26 UTC on October 18**. HTTP dates establish retrieval timing; the responses supplied no authoritative dataset-update timestamp.

All 24 Centennial IDs exist in the identity feed and canonical identities. None occur in either latest statistics landing table, either historical raw table, either canonical 2026 table, or either resolved all-season view. Across the platform, **65,764 stage rows created since October 15 lacked all four audited metadata fields** (status, level, team and organization/conference). Separately, among **65,779 stage rows with null status overall**, **11** had current 2026 statistics. These measurements concern different populations and do not establish the narrower new-row cohort's statistics coverage. The issue extends beyond display behavior.

## The 2025 hypothesis

A missing or misrouted historical import is plausible, but the available evidence does not prove that the missing Centennial records are in an unprocessed 2025 feed. Current configured statistics feeds contain 2026 data only; no additional configured full-history endpoint was found.

There is a concrete latent routing defect: the deployed replacement function copies incoming statistics into the hardcoded 2026 target without dispatching by `year`. If a 2025 row arrives there, it remains in the 2026 table but is excluded by the all-season view's exact `year = '2026'` predicate. Today's inspected feeds do not trigger this case. The audit SQL reports rows excluded by that predicate.

The prepared [season router](../../src/lib/tbcStatRouting.ts) archives supplied older seasons into historical raw tables, adding only unambiguous missing `(playerid, teamid, year)` records and never overwriting existing history. It also preserves misrouted older rows already in current tables before considering replacement. Valid current-season rows retain their supplied values and duplicates, with only the season key normalized. A historical-only feed, malformed CSV rows, invalid years/current IDs, or unsafe/unpreserved existing history holds current-table replacement. A valid mixed feed can archive history and replace the current-season snapshot. Conflicts and hold reasons remain visible in routing results. This behavior passed isolated PostgreSQL fixture validation; it still requires an authoritative source containing the missing Centennial statistics.

The [player-season API](../../src/app/api/player-season-stats/route.ts) now restricts its current-table reads to exact `year = '2026'`, preventing duplicate historical seasons when an older row has been archived but current-table replacement is held. Historical reads remain unchanged.

## Independent identity CSV defect

The old parser treated a quote anywhere inside an unquoted field as the start of quoted CSV. Two literal quotes in malformed identity records produced one **214,340-column record** and omitted **107,156 distinct player IDs** from the parsed row IDs. The landing writer then silently truncated rows to the header width. Replaying the old parser produced **100,876 rows**, matching the recorded identity import count.

The new [CSV module](../../src/lib/tbcFeedCsv.ts) starts quoting only at a field boundary, preserves legitimate escaped quotes and multiline fields, and rejects inconsistent row widths. Offline replay accepted **208,029** valid identity records and reported **three** malformed records individually; batting and pitching retained all **8,997/8,144** records. Reports contain bounded record numbers and reasons, without raw player payloads. All 24 Centennial identities survived both parsers, so this defect does not explain their missing statistics.

## Prior fixes and the prepared repair

[PR #374](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/374) included a one-time classification cleanup; that did not create a repeatable enrichment step for later minimal baselines. The deployed baseline creation still inserts identity fields only. [PR #405](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/405) remains unmerged, and its hydrator requires a pre-existing team name, which skips these blank baselines. Its team-resolution review also identifies ambiguous mappings.

The prepared repair uses a shared card display resolver, the validated CSV parser, and repeatable [metadata enrichment](../../src/lib/playerMetadataEnrichment.ts) after baseline creation. Enrichment follows exact player IDs to statistics team IDs and verified mappings. It preserves protected/manual metadata, rejects ambiguous team choices, and leaves unsupported status claims unresolved. Current-season participation can support `ACTIVE`; historical statistics alone cannot support retirement. Coverage gaps are reported independently of successful file ingestion.

All **71 focused regression cases** across display, metadata, CSV parsing, season routing and the profile statistics reader pass. The production build also passes. A **50-statement PostgreSQL fixture transaction** verified historical preservation, repeat imports, current duplicates, canonical years, and team-ID `0` handling using temporary tables. An isolated database proof updated **131 players**; a fresh full-planner run then proposed **zero** additional patches. The other **124,025** stage rows retained an identical checksum. These are isolated validation results: **no production data writes were performed for this repair during the audit**.

## Historical recovery limits

Inspected March 25 snapshots, April 16 saved batting/pitching exports, April 19 backups/baselines, and remaining shift-repair backups contained no exact Centennial ID matches. The only name candidates in the remaining backups used different IDs: Bryce Johnson `195462` versus Centennial `213190`, and Nick Rogers `21068` versus `225583`. They cannot be substituted by name.

The saved **March 18 `tbc_batting_latest_raw.csv`**, 26,967,109 bytes, was located but remains **unverified**: the prescribed download returned HTTP 403 on both attempts. Recovering an authoritative historical dataset and directly confirming the writer connection remain open checks. Neither limitation justifies inventing teams, organizations or retirement statuses.
