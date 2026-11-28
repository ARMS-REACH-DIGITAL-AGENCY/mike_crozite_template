# Replay day runbook (paste-ready for any agent)

Pete's standing instruction for the 2026 replay. Follow it exactly; do not ask
between steps unless a STOP condition below happens.

## A. Setup (once per workspace)
1. Branch `test/2026-production-parity-20261121`, latest from GitHub.
2. Node 20. `rm -rf node_modules` then ONE plain `npm install` (as CI does). Never `npm ci`, never edit `package-lock.json`, never install packages one by one.
3. Database: the isolated QA Neon branch via the Neon connector or a workspace secret (handoff §12). Before anything, print the endpoint host and confirm it is the QA branch, not production. If Postgres port 5432 is blocked, use the WebSocket `pg` shim (§12). Never Vercel env pull.
4. Read the checkpoint: `SELECT report_date, phase FROM bracket_rehearsal_days WHERE season_key='2027' ORDER BY report_date DESC LIMIT 3;` The next day = last report_date + 1.

5. Two tools the repo doesn't install (they came preinstalled in Claude's container):
   - **`server-only`** (a Next.js marker; outside Next.js it must be an empty module). Use the repo's own pattern — `scripts/test-player-display.cjs` line 92 returns `{}` for `server-only`: put that in a small `--require` hook (e.g. `scripts/lib/stub-server-only.cjs`, commit it to the test branch) and run the audit/runner with `node --require ./scripts/lib/stub-server-only.cjs …` (or `NODE_OPTIONS="--require=…"` for tsx).
   - **Playwright** for drawing pictures: `npm install --no-save playwright` then `npx playwright install --with-deps chromium`. `--no-save` keeps package.json and the lockfile untouched.

6. **The reader.** The runner checks its results against a running copy of the site (`--base`). Start the app from the same checkout with the same QA connection (`npm run dev` or `next start`, with `DATABASE_URL`/`PLAYERS_DATABASE_URL` = QA and the `pg` shim if needed) and pass its address as `--base`. This is the step that needs a server process — any sandbox that can run `node` works; it does not need Vercel.

**Complete list of what Claude's container had that the repo doesn't install:** Playwright + Chromium, the `server-only` stub, the WebSocket `pg` shim, the Neon connector, a local connection file. Nothing else. With A1–A6 done, the workspace matches.

**Permanent fix (owner: the active agent, next task after April 12):** a manual GitHub Actions workflow on the test branch, "Run rehearsal days" (input: through-date). It installs with `npm install` on Node 20, installs Playwright Chromium, stubs `server-only`, starts the reader, connects to QA from GitHub repository secrets (Pete adds them once; GitHub runners reach Postgres directly, no shim), runs section B day by day to the through-date, commits pictures to `ccr-0ad18095-umgndf/nl/`, uploads the editions as artifacts, and stops at the first failure. After that, no agent sandbox is involved.

## B. For each day, in order (standing approval: 0 audit mismatches = approved by Pete)
1. Score the day: `scripts/rehearse-production-bracket.ts --day <D> --reviewed-day <D-1> --season 2027 …` (rehearsal guide on the test branch).
2. Audit it: `scripts/audit-production-rehearsal.ts` for that day. 0 mismatches → continue.
3. Pictures: `npx tsx scripts/newsletter-draw-pictures.ts --season 2027 --hsid 5004 --daily <D>` (on a Sunday also `--weekly <that week's Monday>`) → copy into branch `ccr-0ad18095-umgndf` folder `nl/` → push.
4. Build the edition with the five picture variables pointed at `https://raw.githubusercontent.com/arms-reach-digital-agency/mike_crozite_template/ccr-0ad18095-umgndf/nl/<digest|gazette/banner|gazette/logo|gazette/bracket|gazette/leaders>`. Every image link must return 200.
5. Next day.

A light Monday is normal: minor leagues don't play Mondays and we have no college feed yet (PrestoSports). Zeros are not a failure if the source has no lines for those players — check `player_game_logs` before calling it a bug.

## C. STOP only if
- an audit shows a mismatch, or the runner refuses (wrong database, checkpoint gap), or
- an image link fails after a redraw.
Then report the exact first error line and what you checked. Do not "fix" scoring without Pete.

## D. Never
Send email · change production · merge into Easter-NEWS · swap a tournament school · edit the lockfile.

## E. Before ending ANY session
Commit and push all code/doc changes (test branch; shared fixes on a branch off Easter-NEWS with a PR for Pete). Update `docs/handoffs/NEWSLETTER-BRACKET-HANDOFF.md` §5 with the last completed day. Report: days run, audit counts per day, picture commit, edition links, branch + SHAs.

## F. Status at end of Claude's session (Nov 25 2026, ~23:55 UTC)

**How a run works now (no agent workspace):** workflow `.github/workflows/rehearsal-days.yml` on `test/2026-production-parity-20261121`. Any change to `rehearsal/RUN_THROUGH` (one date) starts it: from the saved checkpoint, one day at a time — score, draw pictures (committed to `ccr-0ad18095-umgndf/nl/`), check pictures load, audit; stops at the first failure. Editions + audit reports = run Artifacts. Logs: `gh api repos/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/jobs/<job>/logs`. Secrets QA_DATABASE_URL / QA_PLAYERS_DATABASE_URL (role neondb_owner, pooled), QA_NEON_BRANCH, QA_NEON_ENDPOINT, QA_REVIEW_EMAIL are set. The runner refuses to run unless all 82 files in src/lib/newsletter, src/lib/bracket, src/components/bracket, src/app/api/bracket, src/app/api/cron match Easter-NEWS (5 TEST-ONLY clock/archive files exempt).

**Done:** April 6, 7, 8 scored and audited clean. PR #907 (a club game MLB moved from Apr 7 to Apr 9 was credited twice → freeze credited game IDs) merged to Easter-NEWS `348924c6`, merged into the test branch `2609d4f9`.

**QA database:** rewound to the April 8 checkpoint (last row 2026-04-08, awaiting_review). Copies: `qa-2026-after-apr8-20261125` (state right after April 8) and `qa-2026-ingestion-before-apr9-rewind-20261125` (state before the rewind). Do not modify it until the fix below is merged.

**Current blocker (run 45723757784):** April 9 stops with `Locked club game identity cannot be reconciled: game 21, player YAT066037, day 1`. April 6–8 were locked before #907 and have no stored game IDs.

**Next task:** in shared code (branch off Easter-NEWS, test reproducing this case, PR for Pete), when a locked day lacks game IDs, recover them exactly from that day's archived source (bracket_rehearsal_provider_inputs / the checkpoint's source_snapshot, or the MLB gamePk in the stored source lines); never guess; if not exactly recoverable, stop as now. After Pete merges: merge Easter-NEWS into the test branch, change `rehearsal/RUN_THROUGH` (content must change, e.g. 2026-04-12 → 2026-04-12 plus a blank line or the reverse), watch the run through April 12, report each day's audit and the April 13 Digest + April 6–12 Gazette from the Artifacts. No hand-patched ledgers, no email.
