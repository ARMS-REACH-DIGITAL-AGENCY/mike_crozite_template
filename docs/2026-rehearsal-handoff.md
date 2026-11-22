# 2026 rehearsal: resume and recovery

This guide belongs to the existing production-parity rehearsal in draft
[PR #862](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/862).
Its purpose is to let another authorized agent resume from GitHub and the saved
QA checkpoint without needing a previous chat's filesystem.

This repository is public. Keep provider account identifiers, connection details,
credentials, private infrastructure metadata and private exports in authorized
account configuration. This guide contains repository references and recovery
steps only.

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
2. Advance exactly one day and pause for publication review. Bulk rehearsal is
   disabled by the existing runner.
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

The next day after that checkpoint is March 27. Do not run it until Pete has
reviewed March 26. Opening a page or an archived Digest does not advance the day.

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

## Recovery principle

GitHub preserves the code and these instructions. The connected QA database
preserves the simulation checkpoint and review output. A named working
environment can speed up resumption, but it is not the only recovery copy.
Future agents still need authorized access to the relevant connected accounts.
