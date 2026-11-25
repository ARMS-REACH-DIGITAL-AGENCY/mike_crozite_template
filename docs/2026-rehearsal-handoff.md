# 2026 rehearsal: resume and recovery

This guide belongs to the existing production-parity rehearsal in draft
[PR #862](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/862).
Its purpose is to let another authorized agent resume from GitHub and the saved
QA checkpoint without needing a previous chat's filesystem.

This repository is public. Keep provider account identifiers, connection details,
credentials, private infrastructure metadata and private exports in authorized
account configuration. This guide contains repository references and recovery
steps only.

## Latest checkpoint (verified Nov 25, 2026)

- Read [`docs/handoffs/NEWSLETTER-BRACKET-HANDOFF.md`](handoffs/NEWSLETTER-BRACKET-HANDOFF.md) first for the current status and owner durability rule.
- April 6, 2026 is saved in `awaiting_review`; 276/276 logs landed, zero held/unresolved/landing errors, 1,536 stored game rows. The separate audit stopped before completion because `server-only` was missing. April 5 was the last audited day (880 lines, zero mismatches).
- April 6 ran at `85b5b4e79048ce5f1ff6e3176a58f3bfc32ffe0f`, production ref `e4012618cb98d9baa565401b0dd1ed9e5741e644`. Its test deployment was verified READY. April 7–12 are not processed. No email.
- Do not repeat April 6 scoring; run the audit against the saved cutoff, then advance only on zero mismatches.

## Source of truth

- Repository branch: `test/2026-production-parity-20261121`.
- Fetch the current branch head before resuming. The saved day's evidence records
  its exact application commit, shared-code hashes and production comparison ref.
- Tracking and deployment references: PR #862 and its existing Vercel status.
- Current simulation day: query the connected QA database checkpoint. Do not
  infer it from the wall clock, branch name, conversation memory or old logs.
- Code changes and updated instructions: commit and push to the test branch.
  A local commit alone does not make changes available to another workspace.

## Preserve the existing test contract

1. Never merge this rehearsal branch, or promote its deployment, into
   `Easter-NEWS`. Port individually reviewed shared fixes on separate branches.
2. Run exactly one day per invocation. Normally pause for review; Pete's explicit April 6–12 authorization treats each completed audit with zero mismatches as approval for the next day within that range. Stop on the first failure and never exceed April 12 under that authorization.
3. Keep the existing production scorer, results writer, stored-result readers,
   roster rules and UX. Do not build another simulation interface.
4. Use stored results and the report-date cutoff. Do not include future games
   or fabricate records for days without games.
5. Preserve the checked-in newsletter renderer and publication archive.
6. Verify that all connections target the same isolated QA database using the
   runner's existing branch and endpoint checks.

## Durable checkpoint records

The committed runner `scripts/rehearse-production-bracket.ts` saves:

| Record | Purpose |
| --- | --- |
| `public.bracket_rehearsal_days` | Day, phase, effective clock, source snapshot, evidence and result checkpoint |
| `public.master_bracket` | Stored bracket results |
| `public.bracket_rehearsal_editions` | Archived review editions, facts and hashes |
| `public.bracket_rehearsal_provider_inputs` | Original MLB responses, replay responses, hashes and omitted future records |

These database records preserve progress independently of local output files.
The runner's local output directory is a convenience copy.

On the verified QA connection, inspect the checkpoint without changing it:

```sql
SELECT season_key, report_date::text, phase, effective_at::text,
       updated_at::text
FROM public.bracket_rehearsal_days
ORDER BY report_date DESC
LIMIT 3;
```

Read `scripts/rehearsal-day.ts` and `scripts/lib/rehearsal-resume.ts` for the day/resume rules:
the next date must follow the last checkpoint by exactly one day, and advancing
requires the prior day's review. An interrupted current day follows the runner's
resume path; an already completed review checkpoint is not blindly replayed.

The March 26 run was saved in `awaiting_review`. It processed 11 completed MLB
games and landed all 248 player-log rows in `stat_lines`, with no held rows,
unresolved identities or new landing errors. Its 512 stored games and 1,024-school
field passed the source-conservation and prepared-reader audits. Query the
checkpoint again before acting: later authorized work may supersede this note.

That March 26 note is historical only; see the latest checkpoint below. Opening a page or an archived Digest does not advance the day.

## Production parity and the historical boundary

The production fixes are separately tracked in PRs #865, #867 and #868. Inspect
their current status and the current `Easter-NEWS` head; do not merge this test
branch to move a fix into production.

The runner compares 21 shared runtime files with the supplied `--production-ref`
before writing data. These cover the actual ingestion workers, results job,
scorer, stored readers, roster API and newsletter publisher. Use a freshly fetched
production ref. If validating a not-yet-promoted candidate, identify it as a
candidate in the evidence and verify the same hashes against merged production
before describing the run as production parity.

Historical provider responses enter `runLiveScheduleRefresh` and
`runMlbLiveGameLogs`. Their normal database writes trigger the same staging
landing functions. `runBracketResultsJob` performs the usual held-line relanding
and team checks before scoring. The shared scheduled publisher runs the cutoff
job before archiving the finished Daily Digest.

Only the provider response and effective clock are substituted. The test adapter
archives responses before consuming them and omits future result records. It
does not fabricate future games as scheduled, or reconstruct the original
intraday arrival times and provider corrections. Successful captured responses
are reused on retry; failed responses remain recorded but can be retried.

Active source tables must contain no results after the reporting cutoff. When
preparing a full-season historical copy, preserve the original QA branch and
archive the exact original source rows in the new isolated target before clearing
future rows from its active inputs. Never apply that preparation to production.

## Resume in a fresh workspace

1. Fetch the test branch from GitHub. Read `AGENTS.md`, this guide, PR #862 and
   the current runner. Record the checked-out commit. Preserve any existing
   uncommitted work before changing a reused checkout.
2. Use an authorized existing execution environment, or recreate a checkout
   from GitHub and install the lockfile dependencies and required script runner.
   Reusing a particular previous sandbox is optional.
3. Resolve the QA target and credentials through the authorized provider
   configuration. Do not copy secret values into this repository.
   Confirm `DATABASE_URL`, `PLAYERS_DATABASE_URL`, `REHEARSAL_NEON_BRANCH` and
   `REHEARSAL_NEON_ENDPOINT` satisfy the existing isolation checks. The endpoint
   must equal the connection URL's actual hostname, including its pooled-host
   suffix when present. The runner also verifies the database-reported endpoint.
4. Query the saved checkpoint. Compare it with the latest user instruction
   before selecting the next day. Resolve any newer saved progress first.
5. Start a controlled application reader using the same checked-out code and QA
   connection as the runner. Record its commit and verified endpoint. The runner
   checks its own connection; the HTTP reader's launch must be verified too.
   Invoke `scripts/rehearse-production-bracket.ts` using its existing arguments:
   `--day`, `--reviewed-day`, `--season`, `--expected-branch`,
   `--expected-endpoint`, `--connection-file`, `--email`, `--base`,
   `--public-base`, `--production-ref` and `--output`. `--connection-file` is
   optional when the verified connection is supplied through environment
   variables. Obtain their values from the verified
   checkpoint, authorized configuration and user instructions. This step writes
   scoring/publication state; reading this guide does not run it.
6. Audit the saved day with `scripts/audit-production-rehearsal.ts`, using the
   same verified QA branch and season, an explicit checkpoint time and the
   appropriate week scope. For March 26 use `--through-week 0`: week one is still
   in progress, so it must not be required to have final results. Check the
   existing bracket and archived publication
   in the preview referenced by PR #862.
7. Pause for the required review. Commit and push any code or documentation
   changes before handoff. Report the verified saved day, exact deployed
   commit, review links and unresolved blockers in the authorized task context.

## Publication references

The runner uses the ordinary Node/tsx environment. The separate prepared-reader
audit needs its documented `--conditions=react-server` setting. Do not apply that
audit-only setting to the runner, which also loads the shared scorer module.

After publication, a same-day resume reads the saved source and immutable edition
without re-ingesting or rescoring. Verify that stored hashes remain unchanged.
Publication review does not enable sending or change the delivery approval gate.

- Renderer: `src/lib/newsletter/dailyDigestLayout.ts`.
- Stored review reader: `src/lib/newsletter/rehearsalEditionArchive.ts`.
- Read-only review route: `/api/rehearsal/edition`, with the existing
  `cadence` and `date` parameters.
- Opening an archived edition does not score a day or send an email.
  Verify actual delivery separately from archive creation.

## Checkpoint lock recovery

An earlier same-day retry was blocked by a session advisory lock left on a pooled
connection. The runner now reserves one client, opens a transaction, acquires
`pg_try_advisory_xact_lock`, and rolls back before releasing the client. It keeps
the same branch/season lock key, so an earlier session lock can still block a
retry.

If the runner reports another checkpoint holder, inspect active jobs and database
locks read-only on the verified QA target before retrying or considering cleanup.
Do not bypass the lock or change its key to force a run. Never terminate a database
backend without the required authorization. Preserve the saved checkpoint while
waiting for the holder to release the lock or for authorized cleanup.

## Recovery principle

GitHub preserves the code and these instructions. The connected QA database
preserves the simulation checkpoint and review output. A named working
environment can speed up resumption, but it is not the only recovery copy.
Future agents still need authorized access to the relevant connected accounts.

## Reproduce the April 6 audit and resume

Use a fresh checkout or the recovered authorized QA workspace. Install lockfile dependencies (and a compatible TypeScript runner); the prior direct QA Postgres connection worked without Vercel CLI authentication. The audit separately needs the `server-only` package; it is neither declared nor installed in the recovered workspace. A proposed workspace-only correction is `npm install --no-save --package-lock=false server-only@0.0.1`. Verify package resolution and audit behavior before claiming the dependency issue fixed. If a shared dependency declaration is needed, propose it on a scoped production-based PR; do not silently alter the production lockfile.

Use protected configuration, not credentials in the repo or command history. Set `QA_CONNECTION_FILE` to a secure JSON file with DATABASE_URL, PLAYERS_DATABASE_URL and branch_id; set `QA_BRANCH`, `QA_ENDPOINT`, `REVIEW_EMAIL`, `QA_PREVIEW_BASE` and `PRODUCTION_REF` through authorized configuration. Obtain the QA connection through Neon; verify the endpoint against actual database identity. The replay site is the existing test deployment. Never pull production Vercel credentials for QA.

First run only the missing read-only audit:

```bash
NODE_OPTIONS=--conditions=react-server npx tsx scripts/audit-production-rehearsal.ts \\
  --connection-file "$QA_CONNECTION_FILE" --expected-branch "$QA_BRANCH" \\
  --season 2027 --through-week 2 --now 2026-04-07T11:00:00Z \\
  --report "$QA_REPORT_DIR/2026-04-06.audit.json"
```

Inspect `ok`, `failureCount`, `checks`, and `boxesChecked` in that report. Confirm source ingestion counts independently from the stored checkpoint. Do not publish private raw reports; store a redacted audit receipt in the handoff and keep the report in authorized storage. If the result is not successful with `failureCount === 0`, stop and record the actual error. Do not advance or resend.

After the April 6 audit succeeds, start the local application reader with the QA-only environment (both database URLs and rehearsal branch/endpoint verified), and verify `/api/bracket/live?start=2026-03-23&weeks=3&h=5004` returns the school roster and line data. Use the existing runner and audit, one date per iteration. This example is the prior loop preserved as a runbook, not a new production workflow:

```bash
set -euo pipefail
mkdir -p "$QA_REPORT_DIR"
for n in 07 08 09 10 11 12; do
  DAY=2026-04-$n
  PREV=$(date -u -d "$DAY -1 day" +%F)
  NEXT=$(date -u -d "$DAY +1 day" +%F)
  W=2; if [ "$n" = 12 ]; then W=3; fi
  npx tsx scripts/rehearse-production-bracket.ts \\
    --day "$DAY" --reviewed-day "$PREV" --season 2027 \\
    --expected-branch "$QA_BRANCH" --expected-endpoint "$QA_ENDPOINT" \\
    --connection-file "$QA_CONNECTION_FILE" --email "$REVIEW_EMAIL" \\
    --base http://127.0.0.1:3000 --public-base "$QA_PREVIEW_BASE" \\
    --production-ref "$PRODUCTION_REF" --output "$QA_REPORT_DIR"
  NODE_OPTIONS=--conditions=react-server npx tsx scripts/audit-production-rehearsal.ts \\
    --connection-file "$QA_CONNECTION_FILE" --expected-branch "$QA_BRANCH" \\
    --season 2027 --through-week "$W" --now "${NEXT}T11:00:00Z" \\
    --report "$QA_REPORT_DIR/$DAY.audit.json"
  node -e 'const a=require(process.argv[1]); if(!a.ok||a.failureCount!==0)process.exit(1); console.log(JSON.stringify({day:process.argv[2],checks:a.checks,boxesChecked:a.boxesChecked,mismatches:a.failureCount,finalGames:a.finalGames}))' \\
    "$QA_REPORT_DIR/$DAY.audit.json" "$DAY"
done
```

Before starting this example, verify the live checkpoint is April 6 and the April 6 audit has passed; if later progress exists, start at the next unprocessed date instead. No send step is present. Verify archive content and Round 2 results at April 12. Update the permanent handoff and commit/push after each fix and at the end of the session, reporting branch names and exact SHAs.
