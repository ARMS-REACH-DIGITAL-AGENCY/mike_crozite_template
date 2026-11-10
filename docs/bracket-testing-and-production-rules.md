# YAT?STATS — Bracket Testing and Production Rules

**Purpose:** Keep the February 1, 2027 Fantasy tournament safe while we verify the complete scoring and display process. These rules apply to every person or AI agent working on the tournament.

**Launch date: February 1, 2027. It does not move.** The job is to be ready on that date, not to change the date or the game.

## 1. What we are building

YAT?STATS has a real, date-driven tournament with **1,024 high schools in eight regions of 128**, 30 regular-season weeks and a four-week postseason (34 weeks total).

The intended Production flow is straightforward:

1. Real professional and college baseball statistics arrive through the authorized data sources and APIs.
2. The scheduled backend scoring job runs automatically (normally hourly). It calculates the Fantasy games using the approved scoring rules, respects daily and weekly locks, and saves the official outcomes in Neon.
3. **`public.master_bracket` holds the official, stored game records**: school pairings, innings, scores, status, winners, Stat Ledger details and locks. Other prepared standings and views may summarize those records.
4. The fan-facing bracket, game stories and Stat Ledgers **read the stored results**. A fan opening a page does **not** run a separate scoring calculation, invent a result or change a saved score.

The Production system must follow the real 2027 dates. It must be ready for the first game on **February 1, 2027**, even though there will be no legitimate 2027 game results before then.

## 2. The six existing test brackets are the test environments

The **1A–6A test brackets** were specifically built to test the scoring and presentation without risking the real tournament. They are not an optional extra step or an invitation to create another simulation on Production.

Each has its own GitHub release branch, separate Neon database branch and Vercel preview:

| Test | GitHub branch | Neon branch |
| --- | --- | --- |
| 1A | `release/bracket-test-1a-20261027` | `isolated-bracket-test-1a-20261027` |
| 2A | `release/bracket-test-2a-20261027` | `isolated-bracket-test-2a-20261027` |
| 3A | `release/bracket-test-3a-20261027` | `isolated-bracket-test-3a-20261027` |
| 4A | `release/bracket-test-4a-20261027` | `isolated-bracket-test-4a-20261027` |
| 5A | `release/bracket-test-5a-20261027` | `isolated-bracket-test-5a-20261027` |
| 6A | `release/bracket-test-6a-20261027` | `isolated-bracket-test-6a-20261027` |

The test schedule starts **October 5, 2026**; its season key is `test-2026` **inside each separate test database**. The code uses the real Arizona date to determine which test games have started or finished. The test brackets use the real daily statistics ingested from the authorized API sources for those corresponding dates. Their separate test schedule does not overlap the February 2027 Production schedule.

A shared season-key string does **not** make two databases the same database. Always verify which Neon **branch/database connection** and which GitHub/Vercel deployment the code actually uses.

The six test branches are **never to be merged wholesale into `Easter-NEWS`**. When a feature or fix is proven in a test branch, copy **only the relevant, reviewed code** into the appropriate Production integration. Leave the test branches and their data available for continued comparison.

## 3. Hard Production boundaries — no exceptions

- **No fabricated, simulated, backdated, or test player statistics, Fantasy results, matchups, game stories, or test-season data may be written to the Production database or shown on the live fan-facing tournament.**
- **Never change the live 2027 tournament dates or trigger it early** just to make a test easier to see.
- **Never use `Easter-NEWS` or its live database as a test fixture.** A ready build or a blank preseason preview is not permission to seed it with test scores.
- **Never merge a complete 1A–6A test branch into `Easter-NEWS`.** Preserve existing Production features, fields, visual behavior and approved scoring rules; transfer only verified changes.
- **Never introduce a bye during Weeks 1–30.** Every school plays its scheduled weekly game. After losing its championship-bracket path, a school continues playing another eliminated school for Total Runs, without being limited to its original region.
- **Never invent facts to fill a missing feed.** A missing college schedule, roster, player game log or transaction is missing coverage—not permission to manufacture an official result or claim the data is complete.
- **Never call work "done," "fixed," "ready," or "verified" solely because a build or automated integration check is green.** Report precisely which code path and actual database results were examined.
- **Never merge or deploy Production changes without the user's authorization and the agreed review/verification.** Protect the February 1 launch.

Read-only inspection of Production is allowed when necessary to establish the actual state. Writes that belong to testing are confined to the existing isolated test environments, following their established rules and safeguards.

## 4. How to prove that a scoring change works

A valid end-to-end test must prove the **same changed implementation** works all the way through. It cannot simply show an already-correct score that an older test job calculated.

For an authorized test in 1A–6A:

1. **Identify the exact change.** Record the GitHub source, commit and the version of the scoring job/reader being evaluated. Compare with the version proposed for `Easter-NEWS`. If they differ, identify the differences before calling the test representative.
2. **Use the existing isolated test dates and real imported game statistics.** Do not manipulate the 2027 Production clock, schedule or results.
3. **Exercise the scoring writer under test.** Verify the intended job actually ran, ingested the expected real stat lines and wrote its own result to **that test branch's** `public.master_bracket`. Confirm job execution evidence and any lock/finalization state.
4. **Exercise the reader under test.** Verify the test preview's prepared-results API and fan-facing bracket read **that same stored result**. Compare the teams, dates, scores, all nine innings, winners, Stat Ledger and available game stories against its Neon record.
5. **Verify live behavior, not only finals.** Test the intended `TOP` / `BOT` / posted innings, yellow provisional values, scheduled/in-progress real-life game indicators, daily 4 a.m. Arizona turnover and recovery after temporary request failures, where applicable.
6. **Repeat across the existing test brackets and representative weeks.** Confirm no cross-branch database access, no change to Production, and no drift between the scorer's stored result and the fan-facing display.
7. **Record evidence.** Supply the test branch/deployment, database branch, source commit, game IDs, expected/actual results, logs and any failed checks. A screenshot is useful for layout, but cannot by itself establish scoring correctness.

Passing a Vercel build or the `integration-gate` check proves only what those checks actually exercised. It does not prove the entire live statistics → scoring job → stored Neon result → reader → browser chain.

### Critical lesson from PR #732

PR #732 ported a stored-results reader to `Easter-NEWS`. A suggested check was to take a game scored by the **1A test job** and see whether the **PR #732 reader** could display it.

**That is not sufficient proof of the proposed Production integration.** The 1A result was calculated by 1A's own job, which already contained prior test fixes. Successfully displaying its stored result would not establish that the Production scoring job includes those same fixes or that the *entire changed flow* works. It could let missing scoring fixes pass unnoticed.

Worse, suggesting that test statistics or game results be passed through `Easter-NEWS` or the Production database violates the central separation that the test brackets were created to enforce. **Do not perform that test on Production.**

### Historical PR #732 review — not an open task list

PR #732 initially left out three behaviors that were already present in the isolated 1A–6A implementations: the live `TOP` / `BOT` / posted phase, the real-life alumni `In Action Today` state, and retry after a transient Stat Ledger request failure. The post-merge [Codex review of PR #732](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/732) raised these same three items.

**Subsequent status:** The project owner has confirmed that all three corrections were merged after PR #732. This section is a *historical lesson about transferring and verifying all tested behavior*, **not a list of outstanding fixes**. Never infer the current state of a feature from the age of a review comment: compare the actual target branch, merged commits, and isolated test evidence before reporting a present-day defect.

No change to the 2027 scoring, dates, data, or site is authorized or required by this documentation.

## 5. What "ready for February 1" means

The launch is **February 1, 2027, regardless**. Preparation is measured by evidence and corrections before that day—not by moving the date or practicing with fabricated results on the public tournament.

Before calling a relevant integration verified, demonstrate:

- The correct code version runs the scheduled scoring writer and the stored-results reader in an isolated test bracket.
- Real ingested test-period stats produce the expected official stored game result, with locks and innings preserved.
- The fan-facing test preview displays that exact result and its Stat Ledger without scoring again in the browser.
- Relevant fixes are confirmed in the actual proposed release commit and isolated tests, with no regression in the verified 1A–6A behaviors. Previously addressed review findings are not treated as unresolved merely because they appear in a historical PR.
- The proposed Production change is limited to the tested code, with unchanged 2027 dates and no test data in Production.
- The actual release is reviewed and authorized. A successful CI/build alone is not final approval.

College coverage from PrestoSports remains an expected dependency. Use real 2027 rosters and team schedules, when available, to estimate daily player participation and coverage; **never present a forecast as actual stats or a completed Fantasy result**.

## 6. Instructions to any future agent

**Start by reading this document.** Identify the branch, deployment, Neon database branch, tournament season and authorized scope *before* any operation.

If a proposed test could change `Easter-NEWS`, its Production database, its scheduled games or anything a live fan sees before the real result exists, **stop that test and use the established isolated 1A–6A environments instead**.

Do not reinterpret tournament rules, create replacement test systems, invent fixes, merge test branches, change the launch date, or call success before the actual affected code path has been verified.

---

**Documentation scope:** This file describes the user's explicit testing and Production boundaries, the verified existing branch structure, and PR #732's review history. It changes **no application code, database record, game schedule, deployment setting or scoring job**.
