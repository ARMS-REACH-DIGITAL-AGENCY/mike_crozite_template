# Merge audit - November 1, 2026

Production: `Easter-NEWS` at `3ad500b0`. Nothing was merged or pushed to any
branch during this audit. Every test merge was done in a throwaway copy.

## How this was checked

1. **Trial merge** of every candidate branch into today's `Easter-NEWS`
   (`git merge-tree`, in memory): clean / conflict, and which files.
2. **Already in production?** For each branch, the share of its added lines
   that already exist in production's version of the same files. This
   catches work that went in by squash or by a later branch, which plain git
   ancestry cannot see.
3. **Full proof for #621:** merged into a copy of production, conflicts
   resolved, then all 20 build checks, `tsc --noEmit` and `next build` run.
4. **Database (read only):** checked that #621's columns exist and that
   retired-player submissions are being saved.

Candidates: the 27 open PRs into `Easter-NEWS` from Oct 25 on, plus every
branch with unmerged work touched since Oct 25 (69 in all). Bracket test
branches are excluded (see `docs/bracket-live-test-2026.md`).

## Headline findings

- **About 30 of the 69 recent branches are already in production.** The
  whole Team ID / stage / retirement cluster from Oct 31 (11 branches) went
  in as direct commits on `Easter-NEWS`. The few lines still "missing" are
  lines production later extended. These need closing, not merging.
- **#640 is superseded.** Production already has its exact rule: only 2026
  college stats (NCAA-D1 ... NWAC) can make a player ACTIVE; MLB status comes
  from the MLB roster and INDY needs a roster source.
  `fix/stage-2026-activity-classification-audit-20261031` (INDY from
  iScore stats) was deliberately dropped by that rule.
- **#621 Where YAT Now is not months of old history.** All 290 commits are
  Where YAT work from Oct 29 - Nov 1 (one merge, from production). Merged
  onto today's production, the only conflicts are the `build` line in
  `package.json` and one cron entry in `vercel.json` - keep both sides.
  After that: **all 20 build checks pass, TypeScript is clean, `next build`
  succeeds.** All its database columns already exist in production.
- **#621 has one real bug, in bracket code:** it removes the `next/font`
  loaders from `src/components/bracket/SchoolBracket.tsx` and
  `BracketTicker.tsx` (to avoid a build-time font download). Roboto Condensed
  is then never loaded and `--yfp-sb` is never defined, so every Fantasy game
  card silently falls back to Arial Narrow/Oswald. Fix: keep production's
  version of both bracket files. (Vercel builds fine with `next/font`.)
- **#621 submissions are saving** (4 since Oct 31, all with photos). CRM sync
  shows `not_sent` because the ARMS sync cron only runs on production; it
  starts after the merge. Submissions #6 and #7 both replace #4, 80 seconds
  apart - looks like a double submit; worth a guard.
- **#651 has a confirmed one-character bug:** `AND na.uuid = ${... ? 3 : 2}`
  is missing a `$` (should be `$${...}`), so single-article test mode fails.
  The normal nightly run is unaffected.
- **#652's test passes** but is not in the build chain (taken out to avoid a
  `package.json` clash with #621). Add it back when integrating.
- **Most "conflicts" are the same line.** Every branch appends its check
  script to the single-line `build` command, so they all collide there. That
  is mechanical, not a sign of risk.

## Follow-up checks (after the other agents' second round)

- **Production data vs. old code.** Every candidate branch was searched for
  added writes to `flip_card_front_stage`, `teamid_universe_mapping`,
  `player_team_override` or `player_source_map`. **None of the branches in
  waves 1-5 write to them.** Every branch that does is either already in
  production or old. The two dangerous old ones are **#429**
  (`fix/player-current-metadata-20261018`, 719 commits behind) and **#405**
  (`fix/canonical-current-team-groups-20261016`, 884 behind). Both rewrite
  `tbc-safe-ingest`, the job that writes the stage table. Close them; never
  merge them. The canonical-team guard and audit triggers are live in the
  database (`canonical_team_identity_guard`, `canonical_team_identity_audit`).
- **`teamid_universe_mapping`, for Pete (not changed, reported only):** of
  20,727 rows, 17,248 have `source_system = 'YATSTATS_HIGH_SCHOOL'`, added by
  script on Oct 27 (notes: "Pete: every high school..."). That matches the
  unmerged branch `fix/high-school-team-ids`: its data is live, but its code
  (the add-player form, YAT numbers, C + hsid teams) is not. Another 434 rows
  came from the Oct 31 repair migrations (308 college history, 86 TBC team
  pages, 28 INTERNATIONAL, 6 Pioneer, 6 web). Pete to confirm these were his
  calls.
- **#621 also changes site-wide behavior**, beyond Where YAT (deliberate; it
  has its own check, `verify-first-flip-tab.cjs`):
  1. flipping any player card opens the **7-Day Snapshot** tab first;
  2. Flip All now goes Snapshot -> Stats -> News ... (was Stats first);
  3. the retired player's tab label is now "YAT?" (was "WHERE YAT NOW?");
  4. a placeholder "ADVERTISER PLACEMENT" in-feed card in Stories when the
     Contribute drawer is open;
  5. the bracket font bug above (the only one that is not intended).
  Pete checks 1-4 on the preview; 5 is reverted.
- **#525** (`perf/lightweight-school-shell-20261023`): 296 behind, conflicts
  in `src/app/[hsid]/layout.tsx` and `src/lib/db.ts`, only 31 added lines.
  Cheaper to redo on current production than to merge.
- **Freeze:** #621 was still being pushed this morning. Each wave should use
  a fixed commit, with the authors not pushing to that branch while it is
  being integrated.
- **#653** (`fix/instagram-sync-quota-20261101`, opened after the first
  pass): merges cleanly, 4 files, but shares
  `src/app/api/cron/instagram-sync/route.ts` with #639. Same wave, #653 first.
  Acceptance: real posts on Trevor Bauer's Social tab after scheduled runs.
- **#621's ARMS/HighLevel sync** (`/api/cron/where-yat-arms-sync`, every 10
  min) runs only when `VERCEL_ENV=production`, so no preview can test it. It
  has a lease (no double send between runs) and stops after 15 attempts, but
  no on/off switch. It creates real CRM contacts, notes and tasks, which a
  database snapshot cannot undo. Add an env switch, off by default; merge
  with it off; switch it on and watch the first record. Its first run would
  also send the 4 existing pending submissions (ids 4-7, 6 and 7 both
  replacing 4) - decide first whether those are real or tests.
- **Before each wave:** a Neon snapshot of the production branch (code
  rollback does not undo data).

## Branch-by-branch

### A. Already in production - close, do not merge

bracket/results-job-20261029, fix/tbc-teamid-discovery-queue-20261031,
fix/canonical-2026-leagues-and-college-recovery-20261031,
fix/enforce-all-canonical-stage-identity-edits-20261031,
fix/reinstate-verified-college-after-2026-data-arrives-20261031,
fix/stage-retirement-rule-and-authority-20261031,
fix/20261031-protect-canonical-team-universe,
fix/career-stats-canonical-level-buckets-20261031,
fix/retired-tbc-highlevel-backfill-20261031,
fix/clear-retired-post-transaction-stale-team-20261031,
fix-2026-stage-null-team-id-reconciliation,
fix-20261030-stage-provenance-and-2026-classification (production has the
Oct 31 version of the provenance migration),
fix/team-logo-coverage-historical-20261028,
fix/historical-team-logo-assets-20261029,
fix/historical-logo-webp-derivative-20261029,
fix/unified-sponsor-layout-current-easter, fix/afl-season-stats-universal-20261029,
fix/restore-story-edit-player-tagging-20261029,
fix/shared-anchor-tagline-image-alignment-20261029,
chore/production-protection-20261028, fix/news-embed-auth-20261028,
fix/unified-news-headlines-20261028, fix/splash-rotation-sponsor-no-flash-20261028,
fix/social-scout-active-alumni-ai-20261031, fix/all-news-share-images-20261030,
fix/city-based-school-subdomains-20261029, fix/school-social-preview-20261030,
fix/contribute-current-team-global-search-20261025.

Superseded by a later production rule: **#640**,
fix/stage-2026-activity-classification-audit-20261031.

### B. Clean merge, ready (own area, small)

| PR | Branch | Files | Note |
|----|--------|-------|------|
| #652 | feat/webz-discovery-coverage-20261031 | 3 | add its test to `build` |
| #651 | feat/source-grounded-alumni-news-20261031 | 3 | fix the `$` first |
| #639 | fix/instagram-social-reel-overlay-20261031 | 7 | also edits `vercel.json` |
| #636 | feat/news-youtube-dates-thumbnails-program-team-year | 9 | draft; shares `ContributeDrawer.tsx` with #621 |
| #624 | fix/contribute-cutout-queue-20261029 | 3 | |
| #625 | fix/targeted-rembg-cutouts-20261029 | 1 | same script as #628 |
| #590 | fix/mlb-five-minute-reliable-alerts-20261027 | 4 | has a migration |
| #586 | fix/per-hub-splash-cookie-20261027 | 3 | check against #599's splash first |
| #588 | feature/player-card-share-modern | 7 | |
| #561 | copy/connect-contribute-remember-20261025 | 1 | one line |
| -   | fix/social-news-digest-operational-health-20261031 | 2 | no PR yet |

### C. Conflict on the build line only (mechanical)

**#621** (proven above), #635 fix/flip-card-front-replacement-20261030,
#629 fix/x-news-video-embeds-20261029.

### D. Real code conflicts - rebase by hand, small

#628 cutout head (same script as #625), #622 MLB transaction share preview
(3 lines in `src/app/[hsid]/page.tsx`), #592 Contribute sign-in
(`ContributeDrawer.tsx`, also touched by #621 and #636), #607 profile
performance (clean merge but 67 behind and shares the player page with #621;
keep it separate and run its parity tests).

### E. Probably replaced by later production work - Pete to look

Splash: #585, #589, #564 (production has #599). Sponsor towers: #601, #603
(production has #604). Older News UI: #579, #559,
feat/news-author-edit-untag-video-poster-20261025,
claude/instagram-player-consistency-vm58za, fix/news-instagram-share-20261028
(production has #594-#596, #602, #617). #563 global search tabs (178 behind).

### F. Tribune / Publisher's Desk - separate decision

#577, #516, feat/tribune-desk-splash-assignment-20261025,
fix/daily-digest-compact-lines, release/tribune-digest-controlled-cutover-20261026:
four or five versions of ~7,000 lines, up to 300 commits behind. Pick one
version before anything else happens with these.

### G. Bracket branches - follow the bracket rules

test/bracket-1...6, release/bracket-test-*, ccr-0ad18095-umgndf,
feature/newsletter-staging-results. Never merged; `PIPELINE:` commits only.

### H. Older than Oct 25

About 170 more branches and ~45 open PRs (Sept - Oct 23, some from March and
May, some targeting `main`). Suggest closing them as stale unless Pete names
one he still wants.

## Proposed order

Each wave: its own branch off the current `Easter-NEWS`, Vercel preview,
Pete's OK, merge, watch for an hour, then the next wave.

1. **Wave 0 - housekeeping (no code):** close the PRs and branches in A.
2. **Wave 1 - news backend:** #652 + #651 (with the `$` fix and the Webz
   test in `build`). Back-end scripts only; no UI.
3. **Wave 2 - Where YAT Now:** #621 with both-sides conflict resolution and
   production's two bracket files restored. Preview: submit, receipt, photos,
   reload, reviewer queue; then the ARMS sync on production.
4. **Wave 3 - images:** #624, #625, #628 together, then #635.
5. **Wave 4 - News media:** #639, #636, #629, #622.
6. **Wave 5 - the rest of B/D:** #590, #588, #592, #586, #561, then #607 on
   its own.
7. Section E and F after Pete has looked at them.
