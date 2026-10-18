# Player identity and headshot regression audit

Date: 2026-10-18. Worktree base: production commit `65a85a3d`.

This change repairs displayed identity and photo resolution without editing production player records or replacing contributed photos. Production database checks were read-only against the Players project `round-recipe-12286668`, branch `br-polished-lab-a4i35u5j`, database `neondb`. No production database, S3, or deployed application was mutated by this audit.

## Matthew Boyd: two people, one stale affiliation

The name search should retain both people. The Cubs team search should contain only the verified MLB player.

| Evidence | MLB Matthew Boyd | College Matthew Boyd |
| --- | --- | --- |
| Canonical player ID | `157347` | `290278` |
| High school | Eastside Catholic, Sammamish, WA; `hsid=329` | Patriot, Nokesville, VA; `hsid=14511` |
| Recorded birthplace | Mercer Island, WA | Bristow, VA |
| Verified MLB identity | `571510`, `name_and_identity`, verified | None |
| Stored stage team before this change | Chicago Cubs | Chicago Cubs, incorrectly |
| Current evidence | Verified MLB source, refreshed 2026-10-18 | 2026 pitching rows, canonical team `21549` |
| Resolved team after this change | Chicago Cubs | Mary Washington College |
| Resolved level | MLB | NCAA-D3 |

Official sources:

- MLB person record: <https://statsapi.mlb.com/api/v1/people/571510>
- MLB player page: <https://www.mlb.com/player/matthew-boyd-571510>
- University of Mary Washington 2026 roster: <https://umweagles.com/sports/baseball/roster/matthew-boyd/17295>. This is the right-handed pitcher from Bristow, Virginia, who attended Patriot; the roster lists him as a senior.

The incorrect college row has an old `player_current_team` assignment verified on `2026-04-26T00:43:22.929Z`, raw MLB team ID `112`, and the source note `MLB refresh: player_current_team`. Its staging source and source-player ID were blank. Current 2026 TBC evidence identifies Mary Washington team `21549`, with the Coast-to-Coast Athletic Conference. The canonical history also distinguishes earlier Richard Bland College seasons (`21664`) from Mary Washington (`21549`). No name-based merge or deletion is appropriate.

### How the bad assignment survived

Commit `cf57da6c` (2026-09-26, “MLB links: same name is not the same person”) fixed identity matching and supplied `scripts/audit-mlb-player-links.ts`. Its cleanup operates on rejected source links and recognizably sourced staging fields. Old staging records copied from `player_current_team` before provenance fields were populated could survive after their wrong MLB link disappeared. The college Boyd is one such leftover.

`src/lib/playerStageIdentity.ts` now applies the same guarded reconciliation to search, gallery card data, player identity, and transaction-status reads. Every request reads the guard; a later sync of the old unsupported record cannot by itself make it authoritative again.

The guard requires all of these conditions, rather than treating an absent MLB ID as proof of an error:

1. An old `mlb_api` current-team row, more than 48 hours since verification.
2. Empty stage source and source-player ID, plus the exact legacy refresh provenance note.
3. A stage team matching that legacy assignment, with no separate canonical team ID. A raw team ID equal to the legacy source-team ID is recognized as the old MLB namespace.
4. No current non-rejected MLB mapping, manual team override, verified/reviewed school submission, transaction application, or explicit retired/free-agent affiliation.

For those candidates only, an unambiguous 2026 team from the dedicated current-season batting/pitching tables is resolved through canonical team mappings. If current play is evidenced but multiple teams are present, the player stays active without guessing one team. If there is no current evidence, the unsupported MLB affiliation is cleared in the read result; the code does not invent retirement. Reviewed and verified assignments remain authoritative.

Independent review found that raw archives can retain a discarded person ID after a current-feed identity correction (the two Shane Timmons records provide a concrete example in the companion coverage audit). Team repair therefore excludes the archive tables. Comparing every candidate before and after that restriction produced identical results for all 180 guarded rows: all 32 players with current evidence already had dedicated current-season rows, and the same 30 teams resolved unambiguously.

The live read-only audit found **180** records meeting every guard condition. **32** have actual 2026 season rows; **30** resolve to a unique team. The other two have current-stat evidence without a unique team. The 148 without current rows receive no manufactured team or status. These are display corrections, not physical database updates.

### Actual query verification

- The player-name SQL for `Matthew Boyd` returned both canonical people: Eastside Catholic/Cubs and Patriot/Mary Washington. Measured database execution: **311 ms** on the observed production dataset.
- The Chicago Cubs team SQL returned only the MLB Boyd. Measured execution: **415 ms**.
- The audit query reproduced the college row changing from stored team `112`/Cubs/MLB to resolved team `21549`/Mary Washington/NCAA-D3 while leaving the verified MLB row unchanged.
- The source CTE is explicitly `NOT MATERIALIZED` because name search references it twice. Only the bounded repair set is materialized. Stats lookups use an array of affected IDs to avoid a planner choice that rescanned pitching history for every candidate. These timings are observed measurements, not latency guarantees.

The identity endpoint supports up to 100 IDs, so its single-ID consumers use a fixed-`$1` scoped version of the exact guard rather than redoing global discovery for each person. A one-time candidate gate also skips all season lookups for unaffected players. The final repaired-player stage lookup measured **4.89 ms**; an unaffected lookup measured **0.22 ms**. A representative correlated SQL batch of exactly **100** identities—98 Saguaro/Hamilton players plus both Boyds—measured **4.19 ms** after removing archive scans. This is database execution time for the reconciled identity reads, not an end-to-end API latency promise; the endpoint still performs its existing other metadata reads. No request value is interpolated into SQL. Global search semantics remain unchanged.

The school-stage cache key is versioned as `getFlipCardFrontStageByHsid-identity-20261018`, preventing a new deployment from reusing a prior cached stage result for the existing ten-minute data cache window.

The reviewable audit is:

```sh
node scripts/audit-legacy-mlb-assignments.cjs --print-sql
node scripts/audit-legacy-mlb-assignments.cjs --playerids=157347,290278
node scripts/audit-legacy-mlb-assignments.cjs
```

It uses the application's exact guard SQL, requires the normal database environment, starts a PostgreSQL `READ ONLY` transaction, and has no apply/write mode. The last command reports all guarded assignments. `guarded_assignment_has_2026_stats` describes the guarded repair evidence only; it is not a general player activity flag for unaffected rows.

## Headshots

The earlier fix `e138dbd2` (2026-10-17, “Fix automatic MLB headshot imports and gallery fallbacks”) was still outside production. This patch reuses its importer and fallback work, preserving the separate All-Time carousel CSS changes.

There were two delivery problems. The gallery attempted a cutout and then jumped directly to a silhouette even when a usable current JPG or thumbnail existed. Search guessed a current-photo path without receiving approved-photo or verified MLB identity information. Competing React and native error handlers could also reset an image's fallback progress.

`getBatchPlayerHeadshots` now reads approved `HEADSHOT` photo roles and unique, verified, non-rejected MLB mappings. The helper never links players by name. An approved designated photo wins. Official MLB URLs are generated only from a numeric, unambiguous verified ID. Multiple eligible IDs remain in the ambiguity check even if only one is marked verified.

The shared delivery order is:

1. An approved designated contribution, when present.
2. Same-player stored cutout, thumbnail, JPG, and PNG candidates.
3. A verified official MLB headshot, then that same MLB person's MiLB endpoint.
4. The stable local silhouette.

Both search APIs now provide `headshotUrl` and the ordered `headshotSources`. The school gallery, player-identity endpoint, and embedded card resolve the same sources. A shared client helper keeps each image's fallback position stable through hydration, recycled DOM elements, duplicate error events, and missing final assets. In light mode, only the final silhouette is inverted and fills its circular frame; real photos are unchanged.

Live official image checks:

| Player | Endpoint | Result |
| --- | --- | --- |
| Matthew Boyd, MLB `571510` | `/people/571510/headshot/67/current` | HTTP 200, JPEG, 25,416 bytes |
| Cam Caminiti, MLB `807284` | `/people/807284/headshot/67/current` | HTTP 404 |
| Cam Caminiti, MLB `807284` | `/people/807284/headshot/milb/current` | HTTP 200, JPEG, 25,683 bytes |

The full URL prefix is `https://img.mlbstatic.com/mlb-photos/image/upload/w_400,q_auto:good/v1`. Cam's real MLB/MiLB behavior demonstrates why the alternate endpoint is necessary. The verified source map connects canonical player `331408` to MLB `807284`. Historical T.J. Beam (`25638`) had no verified MLB mapping in this audit, so no new photo identity was guessed for him.

### Recurring photo import

The restored scheduled importer runs daily, with manual runs defaulting to dry-run. It selects verified, non-rejected MLB identities, rejects ambiguous identities, retries transient failures, distinguishes unpublished headshots from errors, and avoids importing provider default silhouettes. It fills a missing current photo without replacing an existing one, uses race-safe conditional writes, and creates a thumbnail from the actual preserved current image. Existing current photos require an explicit replacement option. It does not write high-school/action photos or change contribution approval records.

The importer was tested locally with mocked storage and fetches. It was not run against production storage in this task.

## Consistent metadata and honest pending totals

The focused display work from `24510e3e` was reused in `playerDisplay.ts` and the card/proof/profile consumers. Explicit current status and recorded departure evidence are consistent on both faces and filters. Missing status stays unknown; an old season alone cannot imply retirement. Generic NCAA history is not promoted to NCAA-D1. Transaction facts retain precedence and the 40-man label stays a separate badge.

The Active roster work is owned by the companion current-stat audit. Its `has2026Stats` flag now drives the gallery strip and mirrored-card membership rather than a non-retired status label. All-Time keeps the complete historical membership.

Independent review also checked the surrounding surfaces: the explicit Favorites gallery retains its historical and cross-school portrait mirrors using the existing Favorites-view marker, while normal Active membership remains strict. Generic NCAA is preserved by the older utility as well as the new display helper and sorts with the other NCAA records; the companion layout change adds a matching selectable filter option.

When independently verified 2026 game logs establish participation but full season totals are missing, `PlayerCardBack` displays **2026 STATS PENDING**, with dashes and no season buckets. It does not aggregate a partial game-log sample into a season total. The All-Time career record and individual-game snapshot remain available.

The broader source-coverage limitation is documented separately in [2026-10-18-new-school-stats-coverage.md](2026-10-18-new-school-stats-coverage.md). The metadata routing fix alone cannot supply rows missing from the provider's feed.

## Verification

- 16 rendered display/profile tests passed, including both pitcher and batter pending-stat records, All-Time preservation, explicit departures, unknown metadata, college level, and 40-man badges.
- 9 client headshot tests passed, covering ordered fallback, approved-image precedence, stale/duplicate errors, recycled images, and final fallback behavior.
- The focused gallery integration test executes the actual DOM/filter helpers and parses the actual layout choices. Normal Active membership, in-season retirement, Favorites entry/exit, hidden wrappers, All-Time history, Select All, NCAA-only filtering, and consistent NCAA sorting all passed.
- 22 Python importer tests passed, including existing-photo preservation, race protection, HTTP error handling, ambiguity, and dry-run behavior.
- TypeScript `--noEmit --incremental false` passed before the final pending-label addition. The consolidated root build rechecks the full combined change.
- Live production-data read queries confirmed both Boyd identities and the strict candidate counts above. Official image endpoints were read directly. No production records or assets were written.

The complete combined preview and visual verification belong to the consolidated regression branch; this audit does not claim a production deployment.
