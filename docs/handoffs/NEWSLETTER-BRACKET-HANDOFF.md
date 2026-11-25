# Newsletter + Fantasy Bracket — permanent handoff (Nov 25 2026)

Outgoing agent: Claude Code (session ended for usage limits). Coordinating issue:
**#901**. This file is the single entry point; it supersedes
`docs/handoff-2026-11-25.md` (that one is redacted on this branch) and updates the
test branch's `docs/2026-rehearsal-handoff.md` (which still says March 26).

No secrets, account IDs, connection strings or recipient data are in this file.
Every value marked *(authorized config)* lives in Vercel env / Neon / the
connector settings, not in Git.

Rules that override everything here: `CLAUDE.md` and `AGENTS.md`. Pete is the
architect. Nothing merges into `Easter-NEWS` without his explicit OK. No email is
sent, no simulation day advanced, without his explicit OK.

---

## 0. Start here — the next task

**Next task: get Pete's review of the April 5 checkpoint, then (only on his
explicit "go") run April 6 2026 — one day, nothing more.**

Before that, three things a new agent should do read-only:
1. Query the checkpoint (§5) and confirm it still reads `2026-04-05`, `awaiting_review`.
2. Find out why the newsletter-banners job did **not** store Hamilton's banner
   (§7, bug 1) — this blocks the live Gazette.
3. Bring `Easter-NEWS` into the test branch (§2) so the replay site shows the
   Nov 25 fixes (#899, #900). Pete approved that on Nov 25; it was not done.

Acceptance for April 6: the runner's audit passes with 0 mismatches; the April 6
Daily Digest archives in `bracket_rehearsal_editions`; its board, series records
and stat tables match the site; Pete reviews it before any email.

---

## 1. Goal and dates

Production-ready **YAT?STATS Fantasy Bracket Tournament** for **Feb 1 2027**
(season key `2027`, 1,024 schools, 8 regions). First **Daily Digest Feb 2
2027**, first **YAT-A-BOY Weekly Gazette Feb 8 2027**. It is rehearsed as a
day-by-day **2026 replay** on an isolated QA database (Week 1 = Mar 23–29 2026).

## 2. Branches, commits, PRs, deployments (as of Nov 25 2026, ~14:00 UTC)

| Branch | Head | Purpose |
|---|---|---|
| `Easter-NEWS` | `26e2d0af` | Live, auto-deploys yatstats.com. Contains everything in §3. |
| `test/2026-production-parity-20261121` | `ef33ea59` | 2026 replay runner + replay site. **50 ahead / 9 behind Easter-NEWS** (missing #898–#900). Never merge it into Easter-NEWS. |
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
| Daily Digest (approved layout `daily-digest-phone8-v2`) | Easter-NEWS | Replay days through Apr 5 archived; unit tests | Live in-season send (season starts Feb 2027) |
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

- **Current date: April 5 2026 (Sunday, end of Week 2), phase `awaiting_review`** (verified independently by ChatGPT on the QA database, #901).
- Processed: Mar 23 → Apr 5 (Weeks 1–2, Round 1 Games 1–2). Apr 5 audit: 880 lines, 0 mismatches. Hamilton beat Clear Falls 8-4, series 1-1.
- Published (archived in `bracket_rehearsal_editions`, not proof of delivery): Daily Digest for Apr 5; Weekly Gazette for Mar 30–Apr 5.
- Emailed to Pete only (test delivery via HighLevel): earlier Digest/Gazette versions, and the pre-#899 Gazette on Nov 25 (queued 201).
- **Next authorized step: none.** April 6 runs only after Pete reviews April 5 and says go.
- Check the checkpoint (read-only, QA connection from authorized config):
  ```sql
  SELECT season_key, report_date::text, phase, effective_at::text, updated_at::text
  FROM public.bracket_rehearsal_days ORDER BY report_date DESC LIMIT 3;
  ```
- Continue / verify: follow `docs/2026-rehearsal-handoff.md` §"Resume in a fresh workspace" on the test branch — `scripts/rehearse-production-bracket.ts` (`--day 2026-04-06 --reviewed-day 2026-04-05 --season 2027 --expected-branch … --expected-endpoint …`), then `scripts/audit-production-rehearsal.ts`. Env names: `DATABASE_URL`, `PLAYERS_DATABASE_URL`, `REHEARSAL_NEON_BRANCH`, `REHEARSAL_NEON_ENDPOINT` *(authorized config)*.
- Pictures for a replay day: `npx tsx scripts/newsletter-draw-pictures.ts --season 2027 --hsid 5004 --daily 2026-04-06 [--weekly <Monday>] --connection-file <json with DATABASE_URL> --out <dir>`, copy into `ccr-0ad18095-umgndf:nl/`, and set the five picture env vars (§6) to those raw URLs when rendering.
- Render an edition locally: `renderFinishedEdition(facts)` from `src/lib/newsletter/finishedPublication.ts`. Tests: `npx tsx --test src/lib/newsletter/*.test.ts` (31 pass on Easter-NEWS `26e2d0af`).

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
3. Test branch lacks #898–#900 → replay site shows the old eyebrow and old board/series behaviour.
4. Local dev against QA needs a websocket shim for `pg` (container has no TCP 5432); scripts in the old workspace only — recreate if needed.
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
4. Approved but not done: merge Easter-NEWS into the test branch (replay site).
5. One email on three accounts — which account wins (that person gets nothing meanwhile).
6. 125 social HighLevel contacts — his corrections to the proposed types; no deletes/merges without explicit OK. 56 already tagged by type.
7. Source for Connect / Contribute / Remember stories.

## 10. Prioritized remaining work

1. Pete reviews April 5 → on "go", run April 6 (§0).
2. Fix the banner job (bug 1); verify fan-contacts (bug 2).
3. Merge Easter-NEWS into the test branch; look at the eyebrow on the replay site.
4. Email Pete the April 5 Gazette with #899 (only when he asks again).
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
