# Active and All-Time regression verification

These are the two fixtures completed during the October 18 repair, preserved
with repository-relative paths. They run locally with synthetic data. They do
not read credentials, call production services, or write to a live database.

## Actual school page

From the repository root, with the application's existing dependencies installed:

```sh
node scripts/test-active-school-page.cjs
```

This loads and renders the actual `src/app/[hsid]/page.tsx`, with database and
unrelated child components mocked. Its four existing groups check:

1. Confirmed 2026 players remain in Active after retirement or free agency;
   historical `UNKNOWN` players and stage-only `ACTIVE` statuses stay out.
2. Missing current-season coverage preserves the historical roster and a direct
   All-Time link.
3. Shared team-year links preserve their selected year and All-Time roster.
4. Nate Rogalski's tribute remains on his historical identity without making
   borrowed statistics evidence of his own current-season participation.

The fixture uses the existing TypeScript, React, and React DOM dependencies.
It inspects the rendered page's element output rather than requiring an
additional DOM emulator. The assertions cover the same four groups as the
completed temporary fixture.

**Preservation rerun: PASS, all four groups.**

## Actual PostgreSQL membership and Search SQL

The second fixture executes the actual `activeAlumni.ts` helper and school Search
route against an in-memory PostgreSQL-compatible database. Its optional test
dependency is pinned to **`@electric-sql/pglite@0.3.14`**. Install it outside the
repository; this does not change application dependencies or the lockfile:

```sh
yatstats_test_deps="$(mktemp -d)"
npm install --prefix "$yatstats_test_deps" --no-audit --no-fund @electric-sql/pglite@0.3.14
NODE_PATH="$yatstats_test_deps/node_modules" node scripts/test-active-alumni-postgres.cjs
```

Keep that temporary directory to reuse the same test dependency for subsequent
runs. The fixture never installs packages itself and never opens a network or
production database connection.

Its 18 existing checks cover current-season source membership and deduplication;
verified raw MLB person IDs; rejected, ambiguous, or missing identities;
ineligible games and seasons; positive and zero counts with missing coverage;
canonical school exclusions; full statewide results and ranking; normal Search
limits and location filters; retained school links and bracket eligibility; and
counts for newly resolved canonical school IDs.

**Preservation rerun: PASS, all 18 checks.**

## Related existing contract check

```sh
node scripts/test-school-search-contract.cjs
```

The repair's completed run passed all 21 cases. This continues to protect
matching, ranking, state limits, pending schools, URL preservation, and bracket
eligibility while allowing the explicitly requested 2026 membership correction.
