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
the original announcement date and source description, and uses the existing
`mlb-transaction:<transaction row id>` UUID. Atomic bounded inserts and the
unique UUID support retries and concurrent publishers. The news-only cron
uses the writer pool and runs every 15 minutes. Notification delivery and
its cursor are not part of this change.

The shared readers include every canonical school membership. Distinct
transactions with identical headlines remain separate. The flip-card tab
loads the newest three, retains each story's link and source date, and
recovers after cancelled requests. Only the news cache is invalidated;
stats, game logs, and other profile caches keep their normal lifetime.

The MLB importer now calls the shared publisher immediately after persisting
each receipt and establishing its verified identity. Duplicate receipts repair
a missing article without changing source timestamps. A failed publication
keeps the source transaction and fails the workflow visibly after processing
the rest of the feed. The separate scheduled publisher remains recovery.

Visible News panels refresh when opened or refocused. Profile history is
paginated completely; the first current page appears immediately while the
remaining cached history is retained during refresh. Closed panels do not
poll. Explicit fresh API requests bypass the short CDN news cache.

Publication dates use valid MLB `payload.date` (when the news broke), falling
back to `effective_date` only when needed. All 25,952 stored payload dates
are valid. There are 580 eligible events whose announcement date differs
from their effective roster date; retroactive details stay in their text.

## Validation and remaining release gate

QA database: Neon project `round-recipe-12286668`, branch
`br-winter-voice-a4ghbyns` (`qa-player-transaction-news-20261122`). Vercel
preview variables are scoped to this Git branch and this database copy.

- All 80 build regression commands and the complete TypeScript check passed locally on the final revision.
- Publisher SQL was executed read-only against the QA copy, including the
  real latest transaction candidates and canonical identities.
- Revised reader SQL returns Ronan Kopp's article `mlb-transaction:228953`
  on his secondary school, HSID 18077, with correct player metadata.
- Behavioral tests cover all types, source dates, old history, retries,
  duplicates, newest-three ordering, independent story links, tab reopening,
  player changes, and targeted cache invalidation.
- The initial QA write was blocked. Pete subsequently explicitly authorized
  adding the backlog now and posting future transactions on receipt.
- Actual QA publication then passed: eight Royce cards, repeat run creating
  zero duplicates, plus a 1,000-card batch. QA has 2,078 transaction articles
  with zero announcement-date mismatches and zero duplicate UUIDs.
- Deployed preview at initial commit `e0bd2a2b` was READY. It returned Royce's
  eight cards in the profile HTML and school API, and exactly the newest
  three on the flip-card API. The final revision adds immediate receipt
  publication, announcement-date priority and fresh-on-open readers.

## Completion checks

The authorized production catch-up is being executed with the shared article
builder and SQL in bounded batches. Verify zero remaining eligible rows,
original announcement dates, canonical YAT identity, original payloads and
unique UUIDs. Keep the 29 unplaced and 39 pending-identity transactions queued;
exclude the eight wrong-person duplicates whose correct counterparts exist.

After the final code revision is deployed, verify the exact merge deployment
and the live profile, school and flip-card News views. Michael Sansone
(YAT106032) has eight separate Worcester assignments with identical
descriptions; they must all remain visible. The fan-alert route is not part
of this backfill.
