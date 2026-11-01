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
