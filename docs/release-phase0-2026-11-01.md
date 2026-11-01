# Release Phase 0 - November 1, 2026

Release coordinator record. Approved by Pete: Phase 0, Steps 1-5. Not
approved: closing branches, turning on outside integrations, merging into
`Easter-NEWS`.

## Step 2 - Production baseline

| Item | Value |
|------|-------|
| Production code | `Easter-NEWS` at `3ad500b06f3e34bb851ab4bcf63d494ad95edbc3` |
| Production deployment | `dpl_3WoQgQGfx1Jk1gxNqM4m32VtHDzt` (READY) |
| Rollback deployments | `dpl_86suqUsui9p2s8gL2RdkgcDogLtL` (`50b563e`), `dpl_DMp3gFKTSQ9etyVyvxLMCo4KKn7N` (`2389035`) |
| Database restore point | Neon snapshot `snap-shy-mode-a4nlmleg` "release-baseline-phase0-20261101-easter-3ad500b", 2026-11-01 16:33 UTC, of `main` (`br-polished-lab-a4i35u5j`) |

### Page weight (production deployment, server HTML)

| Page | HTML size |
|------|-----------|
| Hamilton home `/5004` | 4,926,114 chars (155 flip cards, 376 img, 472 script tags) |
| Marcos de Niza home `/5976` | 579,047 chars |
| Cody Bellinger profile `/5004/player/180827/cody-bellinger` | 1,289,525 chars |

### Database load (pg_stat_statements since 2026-10-14 11:46 UTC)

- 117.9 million statements, 2,212,528 s total execution time (about 1.4 s
  of query time per wall-clock second) on a 0.25 CU compute.
- Top statement: school roster query (`WITH school_players AS ...`,
  queryid 6951858365628656567): 441,080 calls, mean 2,240 ms, 988,107 s
  total (45% of all database time).
- Next: same roster family at 914 ms, 512 ms, 500 ms, 260 ms means;
  `identity_legacy_mlb` family at 425 / 230 / 78 ms means.
- `UPDATE flip_card_front_stage SET next_game_date ...`: 1,867 calls,
  mean 7,796 ms.

Wave 6 (#607) is measured against these numbers.

## Step 3 - Preview isolation

- Neon branch `release-preview-isolated-20261101` (`br-calm-cake-a44njii7`),
  a copy of production at 2026-11-01 16:33 UTC; 0.25 CU, suspends after 5 min.
- Vercel preview settings scoped to one git branch only (production and every
  other branch untouched), applied to `claude/merge-audit-risk-plan-qzfgea`
  first and to each wave branch when it is created:
  - `DATABASE_URL`, `PLAYERS_DATABASE_URL` -> the isolated branch, same
    `authenticator` role as production;
  - every HighLevel key/location/webhook alias blanked
    (`GHL_API_KEY`, `HIGHLEVEL_API_KEY`, `GOHIGHLEVEL_API_KEY`,
    `GOHIGHLEVEL_AGENCY_API_KEY`, `LEADCONNECTOR_API_KEY`, the four
    `*_LOCATION_ID`, `ARMS_PLAYER_ALERT_WEBHOOK_URL`,
    `GHL_GOLDEN_LINE_WEBHOOK_URL`, `ARMS_GOLDEN_LINE_WEBHOOK_URL`);
    `gohighlevel.ts` skips the call when no key is set;
  - `YATSTATS_ISOLATED_PREVIEW=1` marker.
- Scheduled jobs do not run on previews (Vercel runs crons on production
  only).
- **Not yet isolated: photo storage (S3).** See the open items below.

## Step 1 - Frozen commits (2026-11-01 16:30 UTC)

Each wave is built from these exact commits. A branch that moves after this
gets re-checked before it is used.

| Branch | Commit | Last change |
|--------|--------|-------------|
| `bracket/results-job-20261029` | `9fd2e48ffa` | 2026-10-29 |
| `ccr-0ad18095-umgndf` | `757c604d26` | 2026-10-28 |
| `chore/production-protection-20261028` | `4f8f5ba568` | 2026-10-28 |
| `claude/instagram-player-consistency-vm58za` | `3d5ad5c5ba` | 2026-10-28 |
| `copy/connect-contribute-remember-20261025` | `09f322ba59` | 2026-10-25 |
| `feat/news-author-edit-untag-video-poster-20261025` | `9720a153fe` | 2026-10-25 |
| `feat/news-youtube-dates-thumbnails-program-team-year` | `d3c6438aca` | 2026-10-31 |
| `feat/social-news-scout-20261029` | `8a6946667f` | 2026-10-29 |
| `feat/source-grounded-alumni-news-20261031` | `f92515332e` | 2026-10-31 |
| `feat/tribune-desk-splash-assignment-20261025` | `fff0b1a171` | 2026-10-25 |
| `feat/webz-discovery-coverage-20261031` | `1b1c5aa4b5` | 2026-10-31 |
| `feat/yat-a-boy-tribune` | `6427cb5350` | 2026-10-25 |
| `feature/newsletter-staging-results` | `0adaa89042` | 2026-10-27 |
| `feature/player-card-share-modern` | `32630fcb14` | 2026-10-27 |
| `feature/share-any-player-flip-card` | `1bc4ee7f5c` | 2026-10-27 |
| `fix-2026-stage-null-team-id-reconciliation` | `6c8f4079ee` | 2026-10-30 |
| `fix-20261030-stage-provenance-and-2026-classification` | `8bb79b3887` | 2026-10-30 |
| `fix/20261031-protect-canonical-team-universe` | `3767aafed2` | 2026-10-31 |
| `fix/afl-season-stats-universal-20261029` | `cf0de68beb` | 2026-10-29 |
| `fix/all-news-share-images-20261030` | `c9730c036a` | 2026-10-30 |
| `fix/canonical-2026-leagues-and-college-recovery-20261031` | `d19ba5fbae` | 2026-10-31 |
| `fix/career-stats-canonical-level-buckets-20261031` | `82f479d55b` | 2026-10-31 |
| `fix/city-based-school-subdomains-20261029` | `dd3ef78040` | 2026-10-29 |
| `fix/clear-retired-post-transaction-stale-team-20261031` | `a2a0cd492b` | 2026-10-31 |
| `fix/college-2026-status-mlb-api-authority-20261031` | `79c3a5d323` | 2026-10-31 |
| `fix/contribute-current-team-global-search-20261025` | `29ece4e068` | 2026-10-25 |
| `fix/contribute-cutout-queue-20261029` | `d27d9bd442` | 2026-10-29 |
| `fix/contribute-touch-auth-20261028` | `feda632bad` | 2026-10-28 |
| `fix/daily-digest-compact-lines` | `2766f86ce9` | 2026-10-26 |
| `fix/enforce-all-canonical-stage-identity-edits-20261031` | `42f95f803d` | 2026-10-31 |
| `fix/flip-card-front-replacement-20261030` | `afe7568b67` | 2026-10-30 |
| `fix/high-school-team-ids` | `5947a9c70b` | 2026-10-27 |
| `fix/historical-logo-webp-derivative-20261029` | `f50b83b1f7` | 2026-10-29 |
| `fix/historical-team-logo-assets-20261029` | `32d9ce4b4f` | 2026-10-29 |
| `fix/instagram-social-reel-overlay-20261031` | `ba70a23d8a` | 2026-10-31 |
| `fix/instagram-sync-quota-20261101` | `5e9d3f0b3b` | 2026-11-01 |
| `fix/mlb-five-minute-reliable-alerts-20261027` | `b50e78de61` | 2026-10-27 |
| `fix/news-embed-auth-20261028` | `095fdba16a` | 2026-10-28 |
| `fix/news-instagram-share-20261028` | `8a91251c92` | 2026-10-28 |
| `fix/news-mobile-rail-and-contributed-video-20261025` | `863723166c` | 2026-10-25 |
| `fix/news-share-mlb-transaction-og-20261029` | `df7af451ae` | 2026-10-29 |
| `fix/per-hub-splash-cookie-20261027` | `0a82df97ba` | 2026-10-27 |
| `fix/player-cutout-head-preservation-20261030` | `b3b560c82a` | 2026-10-29 |
| `fix/reinstate-verified-college-after-2026-data-arrives-20261031` | `631c8eecf6` | 2026-10-31 |
| `fix/restore-global-search-controls-20261025` | `b89118d8fb` | 2026-10-25 |
| `fix/restore-story-edit-player-tagging-20261029` | `6c8f73cd1d` | 2026-10-29 |
| `fix/retired-tbc-highlevel-backfill-20261031` | `d22f1c632f` | 2026-10-31 |
| `fix/school-social-preview-20261030` | `c2ddc59c6f` | 2026-10-30 |
| `fix/shared-anchor-tagline-image-alignment-20261029` | `4beba75554` | 2026-10-29 |
| `fix/social-news-digest-operational-health-20261031` | `1bd4f2cb54` | 2026-10-31 |
| `fix/social-scout-active-alumni-ai-20261031` | `6779765c41` | 2026-10-31 |
| `fix/splash-player-rotation-20261027` | `e8e7a6e034` | 2026-10-27 |
| `fix/splash-rotation-sponsor-no-flash-20261028` | `953dcc2dd3` | 2026-10-28 |
| `fix/splash-single-entrance-20261025` | `aa7e96baa5` | 2026-10-25 |
| `fix/stage-2026-activity-classification-audit-20261031` | `23673ce624` | 2026-10-31 |
| `fix/stage-retirement-rule-and-authority-20261031` | `037d9005f8` | 2026-10-31 |
| `fix/stories-sponsor-tower-refinement-20261028` | `85b4e6eb58` | 2026-10-28 |
| `fix/targeted-rembg-cutouts-20261029` | `e0078dc04f` | 2026-10-29 |
| `fix/tbc-teamid-discovery-queue-20261031` | `050b849929` | 2026-10-31 |
| `fix/team-logo-coverage-historical-20261028` | `dc1cf3b249` | 2026-10-29 |
| `fix/unified-news-headlines-20261028` | `aba2fccac9` | 2026-10-28 |
| `fix/unified-sponsor-layout-current-easter` | `c599b33f87` | 2026-10-28 |
| `fix/unify-instagram-news-viewer-engagement-20261025` | `aa459ed019` | 2026-10-26 |
| `fix/unify-splash-rotation-per-hub-20261027` | `19cf86fe82` | 2026-10-27 |
| `fix/universal-news-desktop-sponsor-20261028` | `ea846c2378` | 2026-10-28 |
| `fix/where-yat-form-branding-20261029` | `b8d3e5f61a` | 2026-11-01 |
| `fix/x-news-video-embeds-20261029` | `7e53a16c97` | 2026-10-30 |
| `perf/profile-stage-first-20261028` | `4a58c14260` | 2026-10-29 |
| `release/publisher-desk-safe-post-566-20261025` | `bf8979839b` | 2026-10-25 |
| `release/tribune-digest-controlled-cutover-20261026` | `0483e1ad89` | 2026-10-27 |
| `perf/lightweight-school-shell-20261023` | `68cab6abff` | 2026-10-23 |
| `fix/player-current-metadata-20261018` | `eae206e138` | 2026-10-17 |
| `fix/canonical-current-team-groups-20261016` | `25442705dc` | 2026-10-16 |

## Step 3 - isolation proof

Preview `dpl_AXQ1Eobhui4ryjMcdwcWH2xPqiUn` (commit `ee54dbc`, built after the
overrides) loaded `/5976` (579,384 chars, same as production). On the
isolated branch the roster query went 0 -> 1, all statements 0 -> 881, and 8
`authenticator` connections appeared. The site's writer uses the same
`DATABASE_URL`, so preview writes land there too. Every HighLevel call in
production and in #621 goes through the blanked keys (`gohighlevel.ts`,
`alumniEmailSender.ts`, `whereYatArmsSync.ts`,
`whereYatReviewNotifications.ts`, the three webhook routes).

### Open isolation items (block Waves 2 and 3 submission tests, not Wave 1)

- **S3 photo storage.** `contributeServer.ts` and `player-moments` upload to
  the production bucket, and the cutout workers scan that bucket, so a
  preview upload could become a production cutout. Needs either a test
  bucket with preview-only credentials (AWS console, Pete) or a small code
  guard on the wave branch that writes preview uploads under a separate
  prefix the workers ignore (Pete's OK needed for code).
- **remove.bg** (`REMOVE_BG_API_KEY`): paid credits per cutout. Blank it on
  wave previews unless a test needs it.

## Step 5 - Team mapping reconciliation (read only, nothing changed)

### High-school rows (`source_system = 'YATSTATS_HIGH_SCHOOL'`): all correct

| Batch | Rows | Checked against | Result |
|-------|------|-----------------|--------|
| Added Oct 27 from `school_success` | 14,868 | `school_success` | all match ID, name prefix and location |
| Added Oct 27 from `tbc_schools_raw` | 1,356 | `tbc_schools_raw` | all match; none collide with a `school_success` ID |
| Earlier seed | 1,024 | `school_success` | all match |

All 17,248: unique IDs, all `C` + number, all level `HIGH SCHOOL`.

**Existing identities were changed on Oct 27.** On Oct 26 (Neon branch
`isolated-tribune-unified-ledger-20261026`) the 1,024 seeded schools had
team IDs `YAT` + school ID (e.g. `YAT5004` = Hamilton Huskies); now they are
`C` + school ID (`C5004`). Backups were taken first
(`teamid_universe_mapping_hs_yat_backup_20261027`,
`flip_card_front_stage_hs_team_backup_20261027`, 13 cards). No live table
still references a `YAT` team ID (checked `flip_card_front_stage` x4 columns,
`player_current_team`, `player_current_status`, `player_team_override`,
`player_team_stints`, `stat_lines`, `news_article_derivatives`,
`school_player_profile_submission_raw`). Production code only builds `YAT`
IDs for players. Both of `fix/high-school-team-ids`' database steps are live
(the rows and `yat_playerid_seq`, at 210000); only its code is not.

### Oct 31 - Nov 1 changes (`teamid_universe_change_audit`)

776 updates to 776 teams, no inserts, no deletes, every one with an
"Owner-directed" reason. 766 moved a placeholder level `PRO` to an official
level (TRIPLE-A, DOUBLE-A, HIGH-A, SINGLE-A, ROOKIE, INDY, INTERNATIONAL);
776 set a league; 27 changed a team name. 0 left an unofficial level. (My
earlier figure of 434 rows was a partial count by source tag.) Some Oct 31
work ran before the audit trigger existed (e.g. 298 of the 308
`manual_verified_tbc_college_history` rows) and is not in the log.

### For Pete to decide (not touched)

- **371 teams still have level `PRO`** and **1 has `UNKNOWN`** - neither is
  an official level. No guessing; listed for your research.
- Confirm the Oct 27 `YAT` -> `C` re-key of 1,024 schools was your call.

## Step 4 - Release matrix

Frozen commits as of 2026-11-01 16:30 UTC. "Already in prod" = share of the
branch's added lines that already exist in production's same files. Nothing
is closed until Pete reviews this table.

| Disposition | PR | Branch | Frozen commit | Behind prod | Trial merge | Already in prod | Notes / required checks |
|---|---|---|---|---|---|---|---|
| NEVER MERGE | #405 | `fix/canonical-current-team-groups-20261016` | `25442705` | 884 | conflict: route.ts route.ts  | 6% of 60 | Rewrites tbc-safe-ingest; 884 behind |
| NEVER MERGE | #429 | `fix/player-current-metadata-20261018` | `eae206e1` | 719 | conflict: test-global-search-client.cjs test-player-display.cjs route.ts route.ts PlayerCard.tsx PlayerCardFront.tsx db.ts playerDisplay.ts  | 14% of 2485 | Rewrites tbc-safe-ingest; 719 behind; could undo current stage data |
| Wave 1 | #651 | `feat/source-grounded-alumni-news-20261031` | `f9251533` | 0 | clean | 7% of 197 | Fix missing $ in uuid filter; Drew Swift single-story dry run; next scheduled run |
| Wave 1 | #652 | `feat/webz-discovery-coverage-20261031` | `1b1c5aa4` | 0 | clean | 0% of 173 | Add its test to build; Webz credit cap; next scheduled run |
| Wave 2 | #621 | `fix/where-yat-form-branding-20261029` | `b8d3e5f6` | 24 | conflict: package.json vercel.json  | 2% of 3561 | Keep both sides of build/cron; restore prod bracket files; CRM + reviewer switches OFF; one-ID allowlist; idempotent submit; Pete UI decisions; full workflow on isolated preview |
| Wave 3 | #624 | `fix/contribute-cutout-queue-20261029` | `d27d9bd4` | 44 | clean | 4% of 112 | Needs S3 + remove.bg isolation; test one player |
| Wave 3 | #635 | `fix/flip-card-front-replacement-20261030` | `afe7568b` | 12 | conflict: package.json  | 13% of 192 | Build-line conflict only; shares db.ts with #636, contributeServer.ts with #624 |
| Wave 3 | #628 | `fix/player-cutout-head-preservation-20261030` | `b3b560c8` | 34 | conflict: process-player-cutouts-s3.py  | 0% of 260 | Conflict in process-player-cutouts-s3.py; Jamie Westbrook test |
| Wave 3 | #625 | `fix/targeted-rembg-cutouts-20261029` | `e0078dc0` | 43 | clean | 36% of 22 | Same script as #628 - combine |
| Wave 4 | #636 | `feat/news-youtube-dates-thumbnails-program-team-year` | `d3c6438a` | 12 | clean | 2% of 205 | Draft; shares ContributeDrawer.tsx with #621/#592, db.ts with #635 |
| Wave 4 | #639 | `fix/instagram-social-reel-overlay-20261031` | `ba70a23d` | 10 | clean | 1% of 122 | Drop its 6-hour schedule change; keep the rest |
| Wave 4 | #653 | `fix/instagram-sync-quota-20261101` | `5e9d3f0b` | 0 | clean | 5% of 67 | First in wave; keep 15-min schedule; Bauer posts must appear |
| Wave 4 | #622 | `fix/news-share-mlb-transaction-og-20261029` | `df7af451` | 44 | conflict: page.tsx  | 0% of 3 | 3-line conflict in [hsid]/page.tsx; shares it with #588 |
| Wave 4 | #629 | `fix/x-news-video-embeds-20261029` | `7e53a16c` | 32 | conflict: package.json  | 2% of 168 | Build-line conflict only; shares ProfileNewsList.tsx with #636 |
| Wave 5 | #561 | `copy/connect-contribute-remember-20261025` | `09f322ba` | 184 | clean | 0% of 1 | One line |
| Wave 5 | #588 | `feature/player-card-share-modern` | `32630fcb` | 81 | clean | 0% of 218 | Pete visual check |
| Wave 5 | #592 | `fix/contribute-touch-auth-20261028` | `feda632b` | 80 | conflict: ContributePlayerInfoForm.tsx  | 22% of 22 | Conflict; shares ContributeDrawer.tsx with #621 - rebase after Wave 2 |
| Wave 5 | #590 | `fix/mlb-five-minute-reliable-alerts-20261027` | `b50e78de` | 81 | clean | 12% of 176 | Has a migration; HighLevel alerts - isolated preview only |
| Wave 5 | #586 | `fix/per-hub-splash-cookie-20261027` | `0a82df97` | 81 | clean | 8% of 50 | Check against #599 first; shares layout.tsx with #621 |
| Wave 5 | - | `fix/social-news-digest-operational-health-20261031` | `1bd4f2cb` | 10 | clean | 0% of 53 | No PR yet |
| Wave 6 | #607 | `perf/profile-stage-first-20261028` | `4a58c142` | 67 | clean | 3% of 676 | Alone; parity vs baseline; shares player page with #621 |
| In production - close after review | - | `bracket/results-job-20261029` | `9fd2e48f` | 69 | clean | 100% of 1943 | Remaining lines were later extended in production |
| In production - close after review | - | `chore/production-protection-20261028` | `4f8f5ba5` | 73 | conflict: verify-production-contracts.mjs  | 100% of 67 | Remaining lines were later extended in production |
| In production - close after review | - | `fix-2026-stage-null-team-id-reconciliation` | `6c8f4079` | 32 | conflict: verify-current-team-source-authority.cjs route.ts route.ts officialLevels.ts  | 94% of 154 | Remaining lines were later extended in production |
| In production - close after review | - | `fix-20261030-stage-provenance-and-2026-classification` | `8bb79b38` | 31 | clean | 0% of 147 | Production has the Oct 31 version of the same provenance migration |
| In production - close after review | - | `fix/20261031-protect-canonical-team-universe` | `3767aafe` | 9 | conflict: route.ts officialLevels.ts  | 99% of 204 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/afl-season-stats-universal-20261029` | `cf0de68b` | 50 | conflict: route.ts  | 100% of 163 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/all-news-share-images-20261030` | `c9730c03` | 30 | conflict: package.json  | 99% of 138 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/canonical-2026-leagues-and-college-recovery-20261031` | `d19ba5fb` | 8 | clean | 100% of 116 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/career-stats-canonical-level-buckets-20261031` | `82f479d5` | 7 | conflict: route.ts officialLevels.ts  | 99% of 122 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/city-based-school-subdomains-20261029` | `dd3ef780` | 50 | conflict: package.json  | 99% of 125 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/clear-retired-post-transaction-stale-team-20261031` | `a2a0cd49` | 4 | conflict: verify-current-team-source-authority.cjs route.ts officialLevels.ts  | 98% of 64 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/contribute-current-team-global-search-20261025` | `29ece4e0` | 101 | conflict: ReviewQueue.tsx route.ts route.ts ContributePlayerInfoForm.tsx  | 98% of 276 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/enforce-all-canonical-stage-identity-edits-20261031` | `42f95f80` | 2 | conflict: verify-current-team-source-authority.cjs  | 100% of 85 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/historical-logo-webp-derivative-20261029` | `f50b83b1` | 65 | clean | 100% of 22 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/historical-team-logo-assets-20261029` | `32d9ce4b` | 66 | conflict: backfill-historical-team-logos.py test-team-logo-coverage.py  | 93% of 114 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/news-embed-auth-20261028` | `095fdba1` | 76 | clean | 100% of 28 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/reinstate-verified-college-after-2026-data-arrives-20261031` | `631c8eec` | 3 | conflict: verify-current-team-source-authority.cjs  | 100% of 84 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/restore-story-edit-player-tagging-20261029` | `6c8f73cd` | 55 | clean | 100% of 122 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/retired-tbc-highlevel-backfill-20261031` | `d22f1c63` | 5 | conflict: route.ts officialLevels.ts  | 98% of 68 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/school-social-preview-20261030` | `c2ddc59c` | 31 | conflict: test-school-social-previews.cjs  | 98% of 96 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/shared-anchor-tagline-image-alignment-20261029` | `4beba755` | 56 | clean | 100% of 71 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/social-scout-active-alumni-ai-20261031` | `6779765c` | 12 | conflict: package.json  | 99% of 368 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/splash-rotation-sponsor-no-flash-20261028` | `953dcc2d` | 74 | clean | 100% of 9 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/stage-retirement-rule-and-authority-20261031` | `037d9005` | 6 | conflict: verify-current-team-source-authority.cjs route.ts officialLevels.ts  | 99% of 246 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/tbc-teamid-discovery-queue-20261031` | `050b8499` | 1 | clean | 100% of 124 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/team-logo-coverage-historical-20261028` | `dc1cf3b2` | 67 | conflict: test-team-logo-coverage.py  | 100% of 251 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/unified-news-headlines-20261028` | `aba2fcca` | 71 | conflict: page.tsx  | 100% of 17 | Remaining lines were later extended in production |
| In production - close after review | - | `fix/unified-sponsor-layout-current-easter` | `c599b33f` | 70 | conflict: StoriesFeed.tsx  | 100% of 166 | Remaining lines were later extended in production |
| Bracket rules | - | `ccr-0ad18095-umgndf` | `757c604d` | 416 | conflict: master-bracket-results.ts db.ts  | 26% of 7452 | PIPELINE: commits only, per docs/bracket-live-test-2026.md |
| Bracket rules | - | `feature/newsletter-staging-results` | `0adaa890` | 94 | conflict: master-bracket-results.ts  | 70% of 702 | PIPELINE: commits only, per docs/bracket-live-test-2026.md |
| Close after review | #587 | `feature/share-any-player-flip-card` | `1bc4ee7f` | 3317 | conflict: fetch-hs-logos.yml mlb-schedule-sync.yml mlb_roster-sync.yml tbc-ingest.yml fetch_hs_logos.py page.tsx layout.tsx AccountDrawer.tsx PlayerCardFront.tsx ProfileFunZoneStabilizer.tsx  | 17% of 2267 | Targets main; 3,317 behind; #588 is the current version |
| Finish code, do not rerun data | - | `fix/high-school-team-ids` | `5947a9c7` | 94 | conflict: contributionPublisher.ts  | 4% of 244 | Its HS rows and yat_playerid_seq are already live; code only |
| Pete to compare | - | `claude/instagram-player-consistency-vm58za` | `3d5ad5c5` | 91 | conflict: page.tsx route.ts page.tsx  | 8% of 134 | Older News UI; production has #594-#596, #602, #617 |
| Pete to compare | - | `feat/news-author-edit-untag-video-poster-20261025` | `9720a153` | 104 | conflict: page.tsx route.ts NewsEngagement.tsx PlayerInstagramFeed.tsx ProfileNewsList.tsx  | 12% of 186 | Older News UI; production has #594-#596, #602, #617 |
| Pete to compare | - | `fix/news-instagram-share-20261028` | `8a91251c` | 78 | conflict: page.tsx NewsEngagement.tsx  | 69% of 36 | Older News UI; production has #594-#596, #602, #617 |
| Pete to compare | #559 | `fix/news-mobile-rail-and-contributed-video-20261025` | `86372316` | 187 | conflict: page.tsx route.ts FunZone.tsx NewsEngagement.tsx NewsGallery.tsx ProfileNewsList.tsx contributionPublisher.ts newsVideo.ts  | 43% of 352 | Older News UI; production has #594-#596, #602, #617 |
| Pete to compare | #563 | `fix/restore-global-search-controls-20261025` | `b89118d8` | 178 | clean | 23% of 13 | 178 behind; check search tabs on production first |
| Pete to compare | #585 | `fix/splash-player-rotation-20261027` | `e8e7a6e0` | 81 | conflict: verify-splash-sponsor.mjs SchoolSplash.tsx  | 15% of 13 | Production has #599 splash rotation |
| Pete to compare | #564 | `fix/splash-single-entrance-20261025` | `aa7e96ba` | 178 | conflict: SchoolSplash.tsx  | 5% of 37 | Production has #599 splash rotation |
| Pete to compare | #601 | `fix/stories-sponsor-tower-refinement-20261028` | `85b4e6eb` | 71 | conflict: StoriesFeed.tsx  | 40% of 5 | Production has #604 towers |
| Pete to compare | #579 | `fix/unify-instagram-news-viewer-engagement-20261025` | `aa459ed0` | 101 | conflict: route.ts NewsEngagement.tsx PlayerInstagramFeed.tsx ProfileNewsList.tsx  | 35% of 224 | Older News UI; production has #594-#596, #602, #617 |
| Pete to compare | #589 | `fix/unify-splash-rotation-per-hub-20261027` | `19cf86fe` | 81 | conflict: verify-splash-sponsor.mjs SchoolSplash.tsx  | 12% of 58 | Production has #599 splash rotation |
| Pete to compare | #603 | `fix/universal-news-desktop-sponsor-20261028` | `ea846c23` | 70 | conflict: page.tsx  | 54% of 24 | Production has #604 towers |
| Pete: pick one Tribune version | - | `feat/tribune-desk-splash-assignment-20261025` | `fff0b1a1` | 300 | conflict: package.json page.tsx route.ts route.ts layout.tsx liveSeason.ts GalleryFilterController.tsx PlayerCardFront.tsx  | 0% of 7172 | 4-5 copies of ~7,000 lines |
| Pete: pick one Tribune version | #516 | `feat/yat-a-boy-tribune` | `6427cb53` | 300 | conflict: package.json page.tsx route.ts route.ts layout.tsx liveSeason.ts GalleryFilterController.tsx PlayerCardFront.tsx  | 0% of 7172 | 4-5 copies of ~7,000 lines |
| Pete: pick one Tribune version | - | `fix/daily-digest-compact-lines` | `2766f86c` | 300 | conflict: package.json page.tsx route.ts route.ts layout.tsx liveSeason.ts GalleryFilterController.tsx PlayerCardFront.tsx  | 0% of 7202 | 4-5 copies of ~7,000 lines |
| Pete: pick one Tribune version | #577 | `release/publisher-desk-safe-post-566-20261025` | `bf897983` | 108 | conflict: package.json  | 0% of 6880 | 4-5 copies of ~7,000 lines |
| Pete: pick one Tribune version | - | `release/tribune-digest-controlled-cutover-20261026` | `0483e1ad` | 94 | clean | 0% of 1994 | 4-5 copies of ~7,000 lines |
| Redo, do not merge | #525 | `perf/lightweight-school-shell-20261023` | `68cab6ab` | 296 | conflict: layout.tsx db.ts  | 25% of 31 | 296 behind; 31 lines; conflicts in layout.tsx and db.ts |
| Superseded - close after review | - | `feat/social-news-scout-20261029` | `8a694666` | 56 | conflict: route.ts socialNewsScout.ts vercel.json  | 68% of 421 | Early Hamilton-only Scout; production has #612, #615, #637 |
| Superseded - close after review | #640 | `fix/college-2026-status-mlb-api-authority-20261031` | `79c3a5d3` | 10 | conflict: verify-current-team-source-authority.cjs officialLevels.ts  | 28% of 14 | Production already has the college-only ACTIVE rule |
| Superseded - close after review | - | `fix/stage-2026-activity-classification-audit-20261031` | `23673ce6` | 12 | conflict: verify-current-team-source-authority.cjs route.ts officialLevels.ts  | 86% of 294 | INDY-from-stats path deliberately dropped by the college-only rule |

### Older open PRs (before Oct 25)

Default: close as stale unless Pete names one he still wants. #357 is
`TEST-ONLY:` for `test/bracket-6` (bracket rules).

#549, #548, #541, #523, #522, #508, #505, #493, #478, #476, #473, #468,
#466, #464, #459, #449, #434, #425, #422, #415, #411, #406, #402, #396,
#392, #391, #369, #368, #367, #357, #356, #326, #325, #319, #259, #255,
#250, #121, #120, #119, #117, #109, #108, #107, #106, #105.
