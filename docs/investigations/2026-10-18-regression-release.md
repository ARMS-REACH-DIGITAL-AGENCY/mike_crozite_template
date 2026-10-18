# Search, alumni, headshot, and year-rail regression release

This repair branch starts at production `65a85a3de138cf3c049806a0a437044654ca0434` (`Easter-NEWS`). It consolidates the six issues reported on October 18, 2026. Deployment and visual acceptance evidence are recorded in the accompanying pull request.

## What failed and what changes

| Area | Cause established by the audit | Repair |
| --- | --- | --- |
| Search in light mode | The older Search rules introduced in `0eb72da56` kept gold `--accent` text. The subsequent visible-URL change in `5071470e5` also inherited that accent. | Scope neutral text, links, favorites, and bracket colors to Global Search. Use a darker green for positive counts in light mode. |
| Search layout and typography | Search retained its own bordered rows and older display faces after Connect & Contribute received its approved visual refresh. `f88a9a391` also preserved that older school-identity treatment. | Use Archivo names/headings, Barlow Condensed context, open rows without dividers, and subtle neutral hover/focus treatment. Preserve the approved bracket position immediately before the right-aligned tally. |
| Active versus All-Time | The school page constructed the Active display from the All-Time collection; status-based additions, default filters, client cloning, the strip, and separately computed tallies could disagree. Newly expanded school identities also exceeded the statistics feed's school coverage. | Build Active from actual 2026 participation, deduplicate exact player IDs, use shared membership for tallies and cards, preserve All-Time and independent Fantasy rules, and visibly qualify incomplete totals. |
| Two Matthew Boyds in Cubs results | Two distinct people survived a legacy name-matched current-team import. September identity hardening (`cf57da6c`) could not identify all older stage rows lacking source provenance. | Reconcile only tightly guarded legacy assignments. Keep the verified MLB pitcher with the Cubs and resolve the Patriot/Mary Washington pitcher from exact-ID 2026 evidence. Preserve both people. |
| Missing or inconsistent headshots | Earlier importer/fallback work (`e138dbd2`) had not reached production. Several consumers guessed one asset path and stopped before trying available alternatives. | Prefer approved headshots, continue through same-player stored formats and verified MLB/MiLB images, and style only the final placeholder for light mode. Restore the guarded recurring importer without replacing approved photos. |
| All-Time year-circle fade | `4b352055e` introduced the approved dissolve. The sponsor addition in `ae023c0e4` appended an overriding mask that became transparent only inside 48px, although each fixed sign extends 72px from the edge. | Consolidate one symmetric mask: transparent beneath the signs, a 32px transition between 72px and 104px, and an opaque center. Preserve sign geometry, scroll padding, and year selection. |

The Active/All-Time drift has a traceable history: `19e926fc` and `884acb57` (April 3) put the full All-Time universe into the Active DOM; `d49e190c` (April 26) established the later All-Time-plus-stat-overlay construction. `db950e63` (October 11) made unknown status part of the default Active filter, and `a9ed53fd` (October 12) reused status-based membership for tallies and Search. The later unmerged `1eee3601` batches those status counts but does not implement the requested 2026 participation rule, so it was not merged wholesale.

## Data coverage is a separate release dependency

The application must not turn a missing feed into a zero or substitute the historical roster total. The dedicated TBC statistics responses still cover almost entirely the original 1,024 schools, although the identity directory expanded by thousands of schools. Verified 2026 MLB game logs can establish additional participation, but incomplete game logs cannot be labeled complete season totals.

The repaired UI shows a confirmed minimum with a `+` and a pending qualification where source coverage is incomplete. If no participation is yet confirmed for such a school, it shows a pending marker rather than a false numeric zero. Players established only through incomplete season sources retain access to their game history while the season-stat panel displays pending totals.

The [coverage investigation](2026-10-18-new-school-stats-coverage.md) contains the exact read-only evidence and a reviewable provider feed-expansion/backfill request. No request was sent to the provider, and this code change does not assert that the missing college statistics are now present.

## Review boundaries and preservation

- The [identity/headshot investigation](2026-10-18-player-identity-headshots.md) documents the two Boyd identities, the conservative correction guard, importer behavior, and measured source-query results.
- Approved Login, Career Timeline upload, Teammates, and Contribute layouts remain based on the current production version. The shared contribution preview only adopts the same player-metadata resolver; its layout and upload flow are preserved.
- Shared school-picker markup remains unchanged unless the additive API coverage field explicitly identifies pending statistics. Global Search opts into its own refreshed presentation.
- The existing search debounce, immediate request cancellation, stale-response protection, bounded query cache, retry behavior, and upload-crest handoff remain covered by the actual-source client checks.
- Independent review caught and corrected two integration edges: explicit Favorites galleries retain historical/cross-school portraits, and generic NCAA remains selectable without being mislabeled NCAA-D1.
- Current-season feeds remain authoritative over historical raw snapshots. Review found a corrected player identity in archived 2026 data; automatically unioning that archive into current participation would recreate the bad assignment. Tightening team reconciliation to current feeds preserved every intended correction.
- School-stage and Active cache keys are versioned for the new behavior. Single-player reconciliation is scoped to the requested ID so a batch of profile identities does not repeatedly reconcile the entire legacy candidate set.
- The full production build exposed pre-existing invalid `size` / `contentType` exports in two API image routes. Their dimensions remain local to the image response; removing the invalid route exports preserves image output and allows the required build gate to pass.
- Production data reads and source-image checks were read-only. The branch contains no production database migration, bulk identity deletion, or replacement of approved photo assets.

## Verification approach

Validation combines actual-source client tests, rendered card/proof tests, importer tests with isolated storage, read-only queries against the production data, a full optimized Next.js build, and independent integration review. The pull request records the final deployed commit, preview URL, browser observations, and any remaining limitations so the release can be assessed against the exact code proposed for merge.
