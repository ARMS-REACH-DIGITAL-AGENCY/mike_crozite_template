# YAT?STATS agent operating contract

Production branch: `Easter-NEWS`. Read this file at the start of each repository task and handoff. It records the shared operating rules; Pete's latest explicit task instructions take precedence over older notes or remembered decisions.

## Before doing anything

1. Read this file, `CLAUDE.md`, applicable task documents, current production HEAD, and the code, tests and active PRs relevant to the task. Trace the existing implementation before choosing a fix.
2. Before the first edit, give a brief preflight stating the requested outcome, working branch/base commit, and the instruction file paths and relevant rules actually checked. For database work, identify the target environment without exposing credentials. Do not ask Pete to reconfirm instructions he already gave.
3. Keep unrelated work on a separate branch. Treat corrections and status questions as steering of the active task. Do not silently abandon it, expand its scope or substitute a different deliverable; ask only if the intended scope remains unclear.
4. For a returning task, locate its previous PR. Compare its merge-base with *current* `Easter-NEWS`; update/rebase/merge production into it before revising or promoting. Resolve semantic conflicts and retest all affected components. A Vercel preview from four days ago is not proof today.
5. One scoped fix per branch/PR; branches start from current `Easter-NEWS`. Avoid one-off school/player overrides. Preserve the universal shared template.

## YAT ID key transition (Pete, Nov 18 2026)

When the task touches player identity or the YAT ID transition, follow this existing migration contract: every table, job and page moves to the YAT ID as its key before the PrestoSports API goes live. Read `docs/yat-key-transition.md` first (map, decisions, step table, progress log). Take only the next open step and mark it "In progress (agent, branch)"; one step at a time; a Neon test copy first; log your work before stopping; nothing merges without Pete's approval. Person = YAT ID = one flip card; his schools only decide where that one card appears (Pete, Nov 18 2026). New code never adds a join on the old TBC number.

## Production-equivalent tournament rehearsal (Pete, Nov 21 2026)

- Test the actual production scoring, persistence, finalization and advancement code with the agreed historical inputs and clock in an isolated database. Reuse the existing scoreboard, Stat Ledger and timeline. Do not substitute a different simulation engine or user interface.
- Trace the existing path before changing it: `scripts/master-bracket-results.ts` uses the shared `liveSeason.ts` / `engine.ts` scoring and writes `master_bracket`; `preparedIndex.ts`, `/api/bracket/prepared` and `preparedSeason.ts` read those stored results for the existing UI.
- Official scores and complete Stat Ledgers must come from the same persisted result. Opening a page or drawer must not independently calculate an official outcome. A read-only prepared-data endpoint is appropriate; a replay endpoint or fixture that bypasses production storage is not proof of production parity.
- Keep test differences limited to the agreed source data, season configuration, controlled clock and isolated environment. Record those differences. Verify the database target before writes; a Git branch alone does not isolate data.
- **Never merge a test or simulation branch into `Easter-NEWS` or promote its deployment to production.** When testing finds a shared defect, prepare only the individually reviewed production fix on a fresh branch from current `Easter-NEWS`. Keep `TEST-ONLY:` setup separate from `PIPELINE:` fixes.
- Preserve the established interface and unrelated working functionality. Keep production's February 1, 2027 opening date and 1,024-school field. Use Pete's latest agreed test dates; the October six-bracket history in `docs/bracket-live-test-2026.md` does not redefine the later full-season rehearsal.
- Use actual source statistics. Never invent statistics, W-L records or results to fill gaps. Check identity mappings, queries and source coverage before concluding data is missing; report unresolved gaps plainly.
- Verify the agreed scoring rules in both environments. For early settlement, the Monday 4 a.m. Arizona safeguard does not require waiting after completeness is verified. Missing rows, an empty feed or one completed game do not establish that all relevant roster results are complete.
- A request to prove the full season requires all 34 weeks, advancement and postseason stages through the production write/read path. Identify what was actually exercised; do not describe a partial replay as complete.

## Evidence of execution, not assurances

- Reproduce the reported problem and verify the changed behavior against the original request. A shared defect needs a shared fix and representative checks, not a one-off player or school exception.
- For a bracket change, verify source input, the stored `master_bracket` result, prepared responses and the existing scoreboard, Stat Ledger and timeline for the same game and scoring state. Build success and deployment `READY` alone do not prove this.
- Report the changed files and reason, exact branch/PR/commit, checks actually run, their results and remaining gaps. Distinguish prepared, committed, merged, deployed and behavior-verified. A promoted deployment is not evidence that its code was merged.
- Carry forward authorization already given for the same task. Do necessary work without repeated permission requests. If an action is outside that authorization, prepare the reviewable result first and explain the exact missing approval and the instruction requiring it.
- Record the objective, accepted decisions, current branch/commit, verification and next action in the established task document or PR before handing off. Do not claim an interrupted tool call succeeded or promise unattended background work.
- These instructions are a reference, not an enforcement mechanism. Do not claim that adding this file guarantees another agent will read or obey it. Required checks and observed results provide evidence for the specific behaviors they actually test.

## Before merging

- Inspect the complete diff against **current** production and explain any overlapping changes with merged work since the branch was created.
- Run automated tests, including relevant regression contracts, and verify the latest preview deployment is READY.
- Run actual desktop and mobile feature/behavior checks, including screenshots when CSS changes. Build READY alone is insufficient.
- Check every linked page, sign-in flow and media/OG output impacted by the change.
- Do not report a production release as complete before the production deployment for the **exact merge SHA** is READY and critical post-deploy checks pass.
- Do not force push, revert someone else's accepted changes, bypass required checks, or merge a failing/stale branch.
- If blocked, report the specific blocker without claiming completion; never promise background work.

## Protected feature contracts

- Imported championship memories remain accessible on the career timeline **and** visible as Stories, including coach Mike Woods (1999–2026).
- Desktop profile Stories displays a distinct sticky sponsor **right column**, not a full-width inline ad; mobile placement can differ.
- Existing signed-in fans can contribute and interact from every entry path, without false sign-in prompts; APIs still verify identity.
- Alumni News Instagram posts use appropriate portrait/image/reel/carousel presentation without unnecessary outbound links.
- Sharing a News story must land on the correct story and generate story-specific OG image/title.
- Splash school-specific sponsor rotation, no restart flash; global shared layout remains universal.
- Bracket scores and advancement are server-sourced; isolated tests must not affect production.

## Definition of done

For an authorized production software release: code committed, tests passing, preview verified, PR merged, exact production deployment READY, live behavior checked. Every regression fix gains a durable automated test.

For a requested preview, investigation or documentation update, verify that deliverable and report its actual stage. Runtime and UI checks apply to affected executable behavior; a documentation-only update requires reviewing the exact diff and reading back the saved file. Always honor required repository checks. Do not imply an unrequested merge or release, or claim that this document fixes or validates the tournament.
