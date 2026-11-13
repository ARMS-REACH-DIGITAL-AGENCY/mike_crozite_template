# YAT identity cutover acceptance and rollback — 2026-11-13

## Identity contract
A person has exactly one permanent YAT ID in `yat_registry`. External identifiers stay in `yat_registry_ids` keyed by provider and source ID; institution-scoped provider IDs must include an institution namespace. Split TBC careers resolve all verified source IDs. Never infer an identity match from a name alone.

The flip-card stage gains an indexed `yatid` column precomputed from the registry; **do not change TBC playerid primary keys or imported statistics**. Multiple high schools may have cards with the same YAT ID (e.g. YAT000073). This is one person with multiple school affiliations. A trigger fills YAT ID for new stage rows and refreshes it when a matching registry source link is added.

Public player routes, S3 assets, favorites and the fantasy game's historical playerid roster/game-log join remain backward compatible. The player API and search include `yatid`/`yatId`, and the live bracket feed includes a separate `yatIdentityBySourceId` map. The bracket's roster and stat tuples do **not** change their IDs. A separate complete tournament-scoring conversion must pass an exact equivalence test before those keys can change.

## Existing player IDs
Use the owner-approved canonical IDs:
- John Johnson: YAT000099, formerly YAT149256554099832, HSID 14471
- Pete DeLuca: YAT000100, formerly YAT816250826200263, HSID 5976

The atomic owner cutover migrates the two cards, favorites, attachments, moments, news favorites and fan activity, preserving row backups and installing `yat_legacy` redirect entries. Raw imported histories and the fantasy bracket are untouched.

## Release sequence
1. Clone production Neon, run `20261113_yat_owner_legacy_id_cutover.sql` and then `20261113_yat_identity_stage_authority.sql`.
2. Assert exactly 207483 original cards, zero null YAT IDs, zero lost content records, both corrected player IDs, and two verified legacy redirects. Recognize the one approved duplicate YAT ID with two school cards (YAT000073).
3. Confirm no change in `player_game_logs`, `stat_lines`, or bracket tournament data. Compare scoring outputs for representative school rosters and assert exact equality.
4. Run `node scripts/test-yat-identity-cutover.cjs`, the existing player-profile and bracket suites, Vercel preview build, SQL tests, and branch protection.
5. Apply the **reviewed** SQL to production in the same order, verify canonical aliases, stage coverage and source counts. Merge the exact reviewed commit only after schema verification.
6. After deployment READY, verify the two canonical player pages, old bookmarks, galleries, search, favorites, unified careers, and bracket live response. Confirm no increased per-visit SQL query counts.

## Fallback
An application rollback switches back to the prior production deployment; existing numeric source IDs and unchanged game-log keys still work. The additive stage YAT column and indexes can remain unused without hurting the old application. For owner-approved John/Pete corrections, old URLs redirect via verified `yat_legacy` aliases. Don't blindly restore earlier player IDs after users contribute new data; use the captured before-image rows for a reconciled rollback only if necessary.

## Deferred but required before Presto data import
The PrestoSports importer must use a stable institution-scoped source identifier, match to existing YAT IDs with reviewed evidence, and quarantine ambiguous or unverified identities. It must never mint a new YAT ID merely because its name lookup failed. `findYatIdsByProvider` implements the indexed batch lookup contract, but is not itself an end-to-end Presto ingestion pipeline.
