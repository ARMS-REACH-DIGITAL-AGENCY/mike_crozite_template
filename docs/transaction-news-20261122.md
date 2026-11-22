# Transaction news coverage — November 22, 2026

## Scope and source

Pete requested every player transaction as a news card on the player profile
News tab, school Active Alumni News, and the three most recent cards on the
flip-card News tab. Branch: `fix/player-transaction-news-20261122`, based on
production `Easter-NEWS` commit `60d58c879bdc28d5cb7049371d7f0fe8b61c9bbf`.

## Findings measured from production

- Royce Lewis: YAT100750, JSerra HSID 12546, eight stored MLB transactions,
  zero news articles. Latest: November 20 trade, transaction row 333028.
- Stored MLB transactions: 25,952. Existing transaction articles: 1,070.
- Eligible missing cards: 24,806, including 39 transactions with a verified
  Home Schooled link but no existing card row.
- Pending: 39 transactions whose MLB identity is under review, and 29 with
  no school link. Eight stale wrong-person rows are excluded; every one has
  a correctly linked transaction counterpart.
- Existing article publication ended November 6; imported transactions
  continue through November 21. The existing publisher depends on the fan
  alert cursor and a transaction-type whitelist. Prior catch-up PR #667
  remains unmerged and conflicting.

## Changes

`transactionNews.ts` selects missing articles across all stored history and
all transaction types. It verifies the MLB-to-YAT link and school, preserves
the original event date and source description, and uses the existing
`mlb-transaction:<transaction row id>` UUID. Atomic bounded inserts and the
unique UUID support retries and concurrent publishers. The news-only cron
uses the writer pool and runs every 15 minutes. Notification delivery and
its cursor are not part of this change.

The shared readers include every canonical school membership. Distinct
transactions with identical headlines remain separate. The flip-card tab
loads the newest three, retains each story's link and source date, and
recovers after cancelled requests. Only the news cache is invalidated;
stats, game logs, and other profile caches keep their normal lifetime.

## Validation and remaining release gate

QA database: Neon project `round-recipe-12286668`, branch
`br-winter-voice-a4ghbyns` (`qa-player-transaction-news-20261122`). Vercel
preview variables are scoped to this Git branch and this database copy.

- All 79 build regression commands and the complete TypeScript check passed locally.
- Publisher SQL was executed read-only against the QA copy, including the
  real latest transaction candidates and canonical identities.
- Revised reader SQL returns Ronan Kopp's article `mlb-transaction:228953`
  on his secondary school, HSID 18077, with correct player metadata.
- Behavioral tests cover all types, source dates, old history, retries,
  duplicates, newest-three ordering, independent story links, tab reopening,
  player changes, and targeted cache invalidation.
- Actual QA publication was blocked by the database tool with
  `user rejected MCP tool call`; no additional reason was supplied. The QA
  database still has 1,070 transaction articles and zero for Royce.

Before marking this complete: obtain approval for the news-only catch-up on
the named QA branch, execute it, repeat the same IDs to verify no duplicate
articles, and inspect the three views on the deployed preview. Royce should
show eight articles and exactly three on his flip card. Check Michael
Sansone (YAT106032), whose eight separate Worcester assignments have the
same description on different dates, to verify they all remain visible.

After Pete approves the reviewed merge, verify the exact production merge
deployment, run the same news-only catch-up on production, and check live
views and job health. Do not execute the fan-alert route for backfill.
