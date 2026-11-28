# Newsletter + Fantasy Bracket — permanent handoff (Nov 25 2026)

Original handoff: Claude Code. Updated and verified by ChatGPT on Nov 25, 2026.
Coordinating issue: **#901**. This file is the single entry point; it supersedes
`docs/handoff-2026-11-25.md` (that one is redacted on this branch) and updates the
test branch's `docs/2026-rehearsal-handoff.md` (kept current with the QA checkpoint).

No secrets, account IDs, connection strings or recipient data are in this file.
Every value marked *(authorized config)* lives in Vercel env / Neon / the
connector settings, not in Git.

Rules that override everything here: `CLAUDE.md` and `AGENTS.md`. Pete is the
architect. Nothing merges into `Easter-NEWS` without his explicit OK. No email is
sent, no simulation day advanced, without his explicit OK.

---

## 0. Start here — the next task

**Current checkpoint: April 6, 2026, `awaiting_review`; scoring and publication saved, independent audit not completed.** The last fully audited day is April 5 (880 lines, 0 mismatches).

Pete explicitly authorized April 6–12 sequentially with zero audit mismatches constituting approval for the next day. The April 6 audit stopped with `Cannot find module 'server-only'` in `src/lib/db.ts` imported by `src/lib/bracket/preparedIndex.ts`. Do not treat this as a scoring mismatch or recompute the saved day.

1. Fetch the current test branch and production HEAD. Read AGENTS.md and the QA recovery guide. Query the saved QA checkpoint and its evidence.
2. Obtain the isolated QA connection through Neon (see §12), never through Vercel production env. Both database URLs must target the same QA endpoint and the runner's independent database identity check must pass.
3. Reproduce the missing audit dependency in a safe QA workspace; install the missing `server-only` package and the TypeScript runner in the workspace if necessary. Run the **read-only** audit for April 6 at 2026-04-07 11:00 UTC, through week 2. Confirm source conservation separately: 276 logs and 276 landed, zero held/unresolved/landing errors at the recorded checkpoint.
4. If the audit passes with zero mismatches, resume April 7, one date at a time through April 12, auditing each day and stopping at the first failure. The standing approval covers only this date range. Do not advance beyond April 12.
5. Build the April 13 Daily Digest (April 12 results) and Gazette for April 6–12 as review copies. No emails. Verify series decisions, Round 2 pairings, full-width mobile boards, and stat drawer agreement.

The production-to-test synchronization is already committed in the test branch at `85b5b4e79048ce5f1ff6e3176a58f3bfc32ffe0f` (production comparison `e4012618cb98d9baa565401b0dd1ed9e5741e644`); that deployment is READY. Check the latest remote ref and deployment before further work. Preserve old editions and locked results.

## 1. Goal and dates

Production-ready **YAT?STATS Fantasy Bracket Tournament** for **Feb 1 2027**
(season key `2027`, 1,024 schools, 8 regions). First **Daily Digest Feb 2
2027**, first **YAT-A-BOY Weekly Gazette Feb 8 2027**. It is rehearsed as a
day-by-day **2026 replay** on an isolated QA database (Week 1 = Mar 23–29 2026).

## 2. Branches, commits, PRs, deployments (verified Nov 25 2026)

| Branch | Head | Purpose |
|---|---|---|
| `Easter-NEWS` | `e4012618cb98d9baa565401b0dd1ed9e5741e644` | Live, auto-deploys yatstats.com. Includes PR #903. Recheck current HEAD before work. |
| `test/2026-production-parity-20261121` | `85b5b4e79048ce5f1ff6e3176a58f3bfc32ffe0f` (April 6 execution commit; docs may advance HEAD) | 2026 replay runner + replay site; production synced before April 6. Never merge it into Easter-NEWS. |
| `ccr-0ad18095-umgndf` | `ac056a23` | Test pictures for replay emails, folder `nl/` (digest boards, gazette banner/logo/bracket/leaders), served by raw.githubusercontent.com. Not code for Easter-NEWS. |
| `docs/newsletter-bracket-handoff-20261125` | this commit | This handoff. |
| `docs/gazette-locked-reference-20261124` | — | Gazette reference (PR #877, open). Preserve. |

PRs merged Nov 24–25 (all green: build, Vercel, integration-gate): #884 approved
Digest reference, #888/#889 stat lines, #890 7 closest schools, #892 Gazette
rebuild, #894 pictures drawn+stored by the live job, #895 all Fans/SuperFans,
#896 banner job, #897 fan-contacts job, #898 (another agent: MLB transaction
identity), **#899** Gazette fixes, **#900** slideshow eyebrow. Open: #862
(test-only rehearsal PR), #877 (Gazette reference).

Deployments: production = yatstats.com (Easter-NEWS). Replay site = the Vercel
preview of `test/2026-production-parity-20261121` (alias
`mike-crozite-template-git-test-a81a21-arms-reach-digital-agency.vercel.app`,
behind Vercel protection).

## 3. What was built — and what is actually tested

| Item | Implemented | Tested how | Not tested |
|---|---|---|---|
| Daily Digest (approved layout `daily-digest-phone8-v2`) | Easter-NEWS | Replay days through Apr 6 archived; Apr 6 independent audit pending; unit tests | Live in-season send (season starts Feb 2027) |
| Gazette (`gazette-test3-v1`) order §4 | #892, #899 | 16 unit tests; rendered Apr 5 locally at 360/390px with and without the style block; columns of Batters/Pitchers measured identical; 74 KB (< Gmail's 102 KB clip); emailed to Pete (pre-#899 version) Nov 25 | Real-client screenshots (iPhone Mail/Gmail/Outlook) of the #899 version — Pete approved sending it, then the handoff stop came, **not sent** |
| Boards: series record includes the board's own game once final | #899 | Apr 5 boards redrawn from QA: Hamilton/Clear Falls 1-1, all Region 3 series correct | Live S3 copies (none drawn yet) |
| Boards full width in Gazette | #899 | Local render | Mail apps |
| Stat tables = stat drawer grid | #899 | Local render + test pins widths 25,25,17×8,28×3 for both tables | Mail apps |
| Slideshow eyebrow: series always current; game/inning on line 2 | #900 (`src/components/bracket/FantasyTimeline.tsx`) | Typecheck, Vercel preview build | **Never seen on screen** (needs Week ≥2 data → replay site after the Easter-NEWS merge) |
| Live job draws + stores pictures to S3 | #894 | Pixel-identical local drawing; route builds | **First live run unverified** |
| Banner job `/api/cron/newsletter-banners` | #896 | Build | **Failed or didn't run**: Hamilton's banner URL returns 403 (= not stored) on Nov 25 14:00 UTC |
| Fan-contacts job `/api/cron/fan-contacts` | #897 | Unit-level logic; build | First run (10:30 UTC Nov 25) **not checked** |
| Every registered Fan/SuperFan gets both editions | #895 | Unit tests | In-season send |
| AI sportswriter | **Not implemented** (§6) | — | — |

## 4. Approved templates and references

- **Daily Digest:** `docs/newsletter-reference/daily-digest-approved-2026-11-24.html` + `DAILY-DIGEST.md` (#884). Code: `src/lib/newsletter/dailyDigestLayout.ts`.
- **Gazette:** code `src/lib/newsletter/weeklyGazetteLayout.ts` (layout id `gazette-test3-v1`). Definitive proof: Pete's "Week 4 TEST 2" PDF ("the closest thing we have to an approved Gazette") **plus** his Nov 24–25 changes, which #892/#899 implement. PR #877's TEST 3 reference is the earlier proof — keep it, but the code is now the source of truth. Pete has **not yet given final approval** of the Gazette.
- Final Gazette order (Pete): 1 banner · 2 HAMILTON ALUMNI WEEKLY STATS · 3 SUPERFAN WEEKLY STATS (SuperFans only, favorites outside the home school) + favorites' transactions · 4 the school's Week: recap article, its board (its game between the red rules + 7 closest schools, full width), Pete's promo sentence, sponsor thank-you **verbatim**, "See you online!" · 5 SEASON-LONG TOURNAMENT: Bracket Madness (4 two-region Wrigley boards, medallion on top, fan's region first, upsets first) then It Ain't Over Till It's Over (Total Runs leaderboards) · 6 CONNECT / CONTRIBUTE / REMEMBER placeholders. Headings all caps, flush left.
- Reference graphics: art in `public/img/newsletter/gazette-banner-blank.jpg`, `public/img/splash-sponsors/brands/asb-medallion.png`, `public/fonts/oswald-latin.woff2`. Replay pictures on branch `ccr-0ad18095-umgndf` under `nl/`.

## 5. Simulation state (historical replay)

| Checkpoint | Status |
|---|---|
| April 5, 2026 (end of Week 2) | Last fully audited day: 880 source lines, zero mismatches; Hamilton defeated Clear Falls 8–4, series 1–1. |
| April 6, 2026 (Week 3, day 1) | Saved `awaiting_review`; effective cutoff April 7, 11:00 UTC; 1,536 stored game rows. |
| April 6 source landing | 276 logs, 276 landed; zero held, unresolved identities, or new landing errors; zero minor-league lines on that date. This is not the independent results audit. |
| April 6 independent audit | **Did not complete**: missing Node package `server-only`, before a verified mismatch count. Do not report 0 audit mismatches. |
| April 6 review edition | Daily Digest archived with layout `daily-digest-phone8-v2`, content hash `691774bab9024ebe8c67c411b61741f48d968129caa714b9466e1afaa018b12f`. |
| April 7–12 | Not processed. |
| April 13 publications | Not generated. |
| Email delivery for current replay | None authorized or sent. |

April 6 application commit: `85b5b4e79048ce5f1ff6e3176a58f3bfc32ffe0f`.
Production parity reference: `e4012618cb98d9baa565401b0dd1ed9e5741e644`.

- Read the persisted `public.bracket_rehearsal_days` and `public.bracket_rehearsal_editions` records, not the local output directory, to recover state.
- Review: [April 6 Digest](https://mike-crozite-template-git-test-a81a21-arms-reach-digital-agency.vercel.app/api/rehearsal/edition?cadence=daily&date=2026-04-06). [Replay bracket](https://mike-crozite-template-git-test-a81a21-arms-reach-digital-agency.vercel.app/5004#sec-fantasy). Archived publication exists; current email-client visual quality is not certified by this record.
- The previously archived April 5 Digest and March 30–April 5 Gazette are preserved.
- Recheck the latest checkpoint using authorized QA connection:

```sql
SELECT season_key, report_date::text, phase, effective_at::text,
       evidence->'ingestion'->'landing' AS landing,
       evidence->>'storedGames' AS stored_games
FROM public.bracket_rehearsal_days ORDER BY report_date DESC LIMIT 3;
```

- Recovery and precise audit/run invocations: `docs/2026-rehearsal-handoff.md` on the test branch, especially the latest checkpoint section. Review editions are not delivery receipts. Do not send email.

## 6. Architecture

- **Engine:** innings 1–7 = Mon–Sun (each day an OPS+ run and a FIP- run), inning 8 = the week, inning 9 = club W-L. `master_bracket.innings` interleaved `[h1,a1,…]`; `box.d[i] = [homeOPS+, awayOPS+, homeFIP-, awayFIP-]`; `box.h/a.days` per-day lines. Round k+1 series n is fed by series 2n-1 and 2n.
- **Facts → HTML:** stored facts (`weekly_player_lines`, `weekly_player_totals`, `daily_game_scores`, `master_bracket`, `school_nearest_schools`) → `finishedPublication.ts` → `dailyDigestLayout.ts` / `weeklyGazetteLayout.ts`.
- **Article:** `src/lib/newsletter/weeklyStory.ts` — deterministic templates (turning point, contributors OPS+ ≥100 / FIP- ≤100, quiet innings, what's next). No AI model.
- **Images:** `newsletterImages.ts` (picture pages) + `newsletterImagesServer.ts` (@sparticuz/chromium, S3 put/head). Live store: S3 bucket `yatstats-assets`, prefix `newsletter/` (`digest/<day>/<hsid>.png`, `gazette/banner/<hsid>.png`, `gazette/logo/<teamid>.png`, `gazette/bracket/<sunday>/…`, `gazette/leaders/<sunday>/…`). Overrides: `NEWSLETTER_BOARD_IMAGE_BASE`, `NEWSLETTER_GAZETTE_BANNER_BASE`, `NEWSLETTER_TEAM_LOGO_BASE`, `NEWSLETTER_BRACKET_MADNESS_BASE`, `NEWSLETTER_RUNS_LEADERBOARD_BASE` (empty = off). S3 keys: `YATSTATS_AWS_ACCESS_KEY_ID` / `YATSTATS_AWS_SECRET_ACCESS_KEY` (or `AWS_*`) *(authorized config)*.
- **Scheduling (`vercel.json`, UTC):** `/api/cron/fan-contacts` 10:30 → `/api/cron/newsletter-banners` 10:40 → `/api/cron/fan-daily-pilot` 11:00 (4 AM Arizona; draws pictures then sends the prior day's edition).
- **Gates:** table `alumni_newsletter_control` (enabled + `approved_layout_version` = comma list `daily-digest-phone8-v2,gazette-test3-v1`); `fantasy_seasons` (2027 = 2027-02-01..2027-09-26; outside it the job sends only the pilot report to the pilot list); `YATSTATS_SENDING_DOMAIN_VERIFIED`.
- **Recipients:** view `newsletter_recipients` over `user_profiles` (`is_superfan`); preferences in `scheduledPublication.ts` (no row = both editions, HTML; unsubscribe stops both); an email on more than one account is refused.
- **Delivery: HighLevel** (Conversations API, Email type, sender "YAT?STATS Daily", each fan's own contact). `src/lib/gohighlevel.ts`; `src/lib/fanContacts.ts` keeps every fan's contact (`arms_contact_id` on `user_profiles`). Location/contact IDs and keys: *(authorized config / ARMS Client Bridge connector)*. Pete declined storing a HighLevel key in the cloud agent environment.

## 7. Known bugs, workarounds, failed checks

1. **Banner job didn't store banners** — `https://yatstats-assets.s3.us-west-2.amazonaws.com/newsletter/gazette/banner/5004.png` → 403 at 14:00 UTC Nov 25. Check the Vercel runtime log line `[newsletter-banners]` and whether the S3 keys are set in production. Until fixed, live Gazettes would show no banner.
2. **Fan-contacts first run unverified** — check log line `[fan-contacts]` and that all 39 unique fan emails have a HighLevel contact (13 lacked one before).
3. Resolved at code level: production synchronized into test branch at `85b5b4e`; Vercel READY verified. Visual review of the final April 13 editions remains outstanding.
4. Claude's prior workspace required WebSockets; ChatGPT verified direct Postgres connectivity to the QA endpoint. Use a shim only if a fresh workspace actually lacks direct connectivity.
5. Mail apps lack Oswald; Gazette labels fall back to Arial, auto-sized. Large schools could approach Gmail's 102 KB clip — not measured.
6. `docs/handoff-2026-11-25.md` on Easter-NEWS contains account/database IDs (merged in #899). This branch redacts the file; the IDs remain in Git history — Pete to decide on rotation/history cleanup.

## 8. AI sportswriter — status: designed, NOT implemented

No code calls a model. Plan agreed in principle with Pete:
1. **Fact sheet (code):** per school per week — line score, scoring streaks, turning point, hitting vs pitching runs (from `box.d`), each player's week and best day, team + level from `teamid_universe_mapping`, series state and what's next, Most Runs standing.
2. **Writer:** Claude via the Anthropic API (key would be `ANTHROPIC_API_KEY`, added by Pete in Vercel; model name to be set in config), given only the fact sheet + Pete's editorial instructions + approved example articles. Once per school per week, never per recipient; save article, inputs and prompt version.
3. **Checker (code):** every number and name must be in that school's fact sheet; official levels; nothing after the week; 175–300 words; fail → one rewrite → deterministic `weeklyStory.ts` fallback.

Evidence for the checker: Pete's Clear Falls model article said Clear Falls had "seven runs" on the season — the data says **8** (4 + 4). The Hamilton model article checked out fully (8 straight scoring innings, 2nd–9th; Murphy 33 FIP- in the 3rd; Bellinger 361 OPS+ Saturday; Clear Falls' 4 runs all from pitching, Fisher -12 FIP- in the 5th; Hamilton 11, The Woodlands 12).

Pete's editorial instructions (verbatim) are in `docs/handoff-2026-11-25.md` §6 on Easter-NEWS — keep them as the writer's system prompt.

## 9. Pete's decisions still open / approvals not yet carried out

1. AI writer: which sentences stay word for word (greeting, rubber-game sentence, promo, sponsor, "See you online!"); OK to call Claude with his key; start with fact sheet + checker.
2. Greeting: "Hi Pete," vs "Good morning, Pete,".
3. Gazette final approval (the #899 version was approved to email him but not sent — handoff stop).
4. Production-to-test merge completed at `85b5b4e`; visual review pending.
5. One email on three accounts — which account wins (that person gets nothing meanwhile).
6. 125 social HighLevel contacts — his corrections to the proposed types; no deletes/merges without explicit OK. 56 already tagged by type.
7. Source for Connect / Contribute / Remember stories.

## 10. Prioritized remaining work

1. Fix the missing `server-only` audit dependency and audit the already-saved April 6 checkpoint. Only then resume April 7–12, one audited day at a time.
2. Fix the banner job (bug 1); verify fan-contacts (bug 2).
3. Verify updated eyebrow and other November 25 fixes on the existing replay site.
4. Build April 13 review copies after April 12 succeeds. No email for this rehearsal.
5. AI sportswriter: fact sheet + checker first, then the model.
6. Gazette "Swept and Moving On" (after Week 2 of each round: 2-0 sweeps; promote next-round matchups whose two feeder series are decided — Week 2: 294 of 512 swept, 95 Round 2 matchups set).
7. 6–8 spotlight runs-only matchups under the leaderboards (needs Week 4 pairings, Apr 12).
8. Pre-send rendering check (360px, with/without style block, size < 102 KB) and real-client screenshots.

A new agent with this file, `CLAUDE.md`, `AGENTS.md`, `docs/2026-rehearsal-handoff.md` (test branch) and issue #901 can resume without this conversation.

## 11. PrestoSports integration and coverage audit (Pete, Nov 25 2026)

Status: license agreement not signed yet. Pete asked Presto to change the License
Details "AI Services" box from "Not permitted" to permitting Anthropic (Claude,
Claude Code, Claude API) and OpenAI (ChatGPT) for developing and operating the
platform and newsletters, including recaps of YATSTATS fantasy games, with no
training on Licensed Data. AI training or fine-tuning stays "Not permitted".
Pricing offer expires 11/27/2026. License scope: baseball, NCAA, NAIA, NJCAA,
CCCAA (3C2A), NWAC and summer collegiate leagues; no high school customers.

Pete's plan once signed, as soon as possible:
1. Wire up the API and ingest 2027 college rosters (they arrive daily before the season) and stats.
2. Match each Presto player ID to a YAT ID in `yat_registry_ids` (one outside number = one person). Pete sets the matching rule (open task "Presto matching rule"); never fuzzy-guess.
3. **Coverage audit:** for every school in the tournament, list its active 2027 alumni by level, and whether we have a daily stats source for each (MLB/MiLB feed, Presto, INDY, INTERNATIONAL, ...). Report each school's coverage %, worst first, by region and seed.
4. Run the audit daily as rosters arrive and **send Pete a daily coverage update**. Swapping a school out of the field is **Pete's decision only**: no agent may swap, remove or replace a tournament school, or recommend it to fans, without Pete's explicit approval of that specific school (Pete, Nov 25 2026). Reason: once a school is promoted and its fans sign up, pulling it hurts them. Report gaps; never act on them. After the tournament starts (Feb 1 2027) no swaps at all.
5. Tour rules: add a data-coverage disclaimer so the tournament and sweepstakes continue on our best available statistics (draft wording to be reviewed by Pete's attorney).

## 12. How the outgoing agent actually reached the QA database (read this if blocked)

The simulation is not blocked by code. It needs a connection to the **isolated QA
Neon branch** (not production). Claude ran every replay day this way:
1. **Neon access** through the Neon connector (MCP) on Pete's Neon account: `run_sql` on the QA branch for checks, and the branch's connection string written to a local, uncommitted JSON file (`{"DATABASE_URL": ...}`) passed to the runner with `--connection-file`.
2. **Network:** the cloud container could not open Postgres TCP 5432, only HTTPS. Claude loaded a small local shim that swaps the `pg` driver for `@neondatabase/serverless` over WebSockets (443) — `node --require <shim>.cjs …`. Repository code unchanged. An environment with direct 5432 access does not need it.
3. **Not Vercel.** Pulling Vercel env vars is unnecessary and risky (production values point at the live database). Do not use `vercel env pull` for the simulation.

To unblock a new agent, Pete gives it **one** of these (never in Git, never in chat if avoidable):
- a Neon connector/MCP on his Neon account, or
- the QA branch's pooled connection string as an environment secret in the agent's workspace (`DATABASE_URL`, `PLAYERS_DATABASE_URL`, plus `REHEARSAL_NEON_BRANCH` / `REHEARSAL_NEON_ENDPOINT` = that branch's id and the URL's host).

Permanent fix (recommended): a manual GitHub Actions workflow on the test branch ("Run rehearsal day", input = target date) that reads the QA connection from GitHub repository secrets, runs one day at a time from the checkpoint to the target with `rehearse-production-bracket.ts` + `audit-production-rehearsal.ts`, and stops at the first audit failure. Then any agent or Pete can advance the replay with one click, with no workspace setup.

Calendar note: in 2026, Round 1 ends **Sunday April 12**; the next editions are the **Monday April 13** Daily Digest (reporting April 12) and the Gazette for April 6–12. April 6 was saved; audit it without rescoring, then process April 7–12 in order.

## 13. Standing durability rule — owner instruction Nov 25, 2026

- Nothing important may live only in an agent's sandbox. After every fix and at the end of every work session, commit and push all intentional source, script, test, and documentation changes. Do not leave a local-only fix.
- Shared/production changes: one scoped branch starting at current `Easter-NEWS`, with a PR for Pete's explicit approval. Never merge a rehearsal branch into production.
- Test-only rehearsal changes: commit and push to `test/2026-production-parity-20261121` (PR #862). Maintain stored results, original simulation path, and QA isolation.
- For newsletter/bracket work, update `docs/handoffs/NEWSLETTER-BRACKET-HANDOFF.md` with the latest verified saved simulation date, what was processed, audit status, exact blocker if any, review links, and next authorized step. Also keep `docs/2026-rehearsal-handoff.md` current on the test branch. The QA database, not this document or a local log, is the authoritative checkpoint.
- Before reporting completion or a blocker, verify the remote branch heads and report every branch name, commit SHA, PR and relevant deployment/check status. Distinguish committed, tested, deployed, audited and approved. No claims of completion based on a local commit.
- Never commit credentials, secret-bearing connection files, private fan data, raw private exports, build caches, generated local artifacts or logs containing secrets. Record secure configuration names and reproducible recovery commands instead. A generated build artifact is not an intentional source change.

The "Run rehearsal day" GitHub Actions entry point is still a follow-up, only after the daily run and audit are working. Do not claim it exists. Keep QA credentials in a protected secret, not Git. The original shared scorer and publisher remain the execution path.
