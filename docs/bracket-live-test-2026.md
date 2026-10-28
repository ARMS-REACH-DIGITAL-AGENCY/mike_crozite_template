# Bracket live test - October 2026

**Read this before touching the bracket code or any `test/bracket-*` branch.**
It records what the owner (Pete) and Claude agreed on Oct 5, 2026. If a
conversation is lost or a new session starts, this file is the source of truth.

## What the test is for

Numbers and the pipeline only: live MLB stats coming in, every inning
computed correctly by the bracket engine (`src/lib/bracket/engine.ts`), and the
main scoreboard, the Stat Ledger drawer tallies and the leaderboard all adding
up. It is **not** a layout test.

## The six test branches

`test/bracket-1` ... `test/bracket-6`, all cut from `Easter-NEWS` on Oct 5, 2026
(base `61edb63a`, after PR #339). Each runs one bracket of 16.

- **Opening day:** Monday Oct 5, 2026 = Week 1, Round 1 Game 1 (Oct 5-11).
  Only games from Oct 5 on count. Earlier games are ignored.
- **"Today"** on the test branches is the real date in Arizona.
- **Field:** the 69 schools with an alum on an active MLB playoff roster (the 8
  clubs left on Oct 4; injured-list-only schools excluded). The 27 with the most
  starters (SP = 2+ starts, everyday = 10+ games with 3+ PA, since Sept 1)
  appear twice, never twice in one bracket. 96 slots = 6 x 16. The brackets
  and seeds are in `src/lib/bracket/testBrackets.ts`. Bracket 1 is Hamilton's
  (Hamilton is also in bracket 6).
- **Stats source:** `player_game_logs` (the 10-minute MLB feed, which also
  carries the Arizona Fall League).
- Practice-season data (box scores, leaderboard games, stars, later rounds,
  champions from `public/bracket-lab/2026`) is switched off on the test branches.

## The rules

1. **Layout changes go to `Easter-NEWS` only:** their own branch off
   `Easter-NEWS`, a preview, then a merge with Pete's OK. `Easter-NEWS` is the
   production branch: a merge goes live on yatstats.com within minutes.
2. **The test branches only get stats/pipeline changes.** Never layout.
3. **Layout changes are NOT synced into the test branches.** The tests live
   with the Oct 5 layout. No hand-merging of layout onto the test branches.
4. **Commit labels on the test branches:**
   - `TEST-ONLY:` = test setup (opening day, the 16-school field, switching
     off practice data). **Never goes to Easter-NEWS.**
   - `PIPELINE:` = live stats, scoring, saving results, the drawers and
     leaderboard reading real numbers. **This is what goes to Easter-NEWS.**
   A commit is one or the other, never both. Keep `PIPELINE:` code in its own
   files where possible, so it moves cleanly.
5. A pipeline change is made once and applied to all six test branches.

The test-only commits so far (made before the labels; they count as TEST-ONLY):
- `4e543c68` the bracket season opens Mon Oct 5, 2026
- `73897004` run test bracket 1 (the 69-school field), not the practice season
- one commit per branch on `test/bracket-2`...`-6` setting `TEST_BRACKET`

Test-only code lives in `src/lib/bracket/testSeason.ts`,
`src/lib/bracket/testBrackets.ts` and a few marked lines ("Test branch:") in
`src/components/bracket/gallery.tsx`, `simulationState.ts` and
`schoolSeason.ts`.

## When the test is over

1. Make a fresh branch off the current `Easter-NEWS`.
2. Copy over **only the `PIPELINE:` commits** (`git cherry-pick`), oldest first.
   Never merge a `test/bracket-*` branch into `Easter-NEWS`.
3. `Easter-NEWS` keeps the **Feb 1 start and the 1,024-school field**. Nothing
   from `TEST-ONLY:` commits comes along.
4. If `Easter-NEWS` layout work changed the same lines as a pipeline commit,
   fix that once on this branch and tell Pete.
5. Preview, check the numbers, then merge with Pete's OK. Then delete or
   archive the six test branches.

## Status log

Add a dated line for each milestone.

- 2026-10-05: six test branches built. Opening day Oct 5 and the test field
  are showing. Live stats are **not wired yet** (drawers say "Loading box
  score…"). Next: feed `player_game_logs` into the innings, drawers and
  leaderboard (PIPELINE).
- Known open items: scoring needs the per-level baselines (adjusted mode);
  Sunday-night games must count on Sunday (the feed has stamped at least one
  as Monday).
- 2026-10-18 (end of week 2): Pete asked for both lines together. The 25
  `PIPELINE:` commits were ported by file (not cherry-picked: they import
  `testSeason.ts` and collide with the blank 2027 season) onto branch
  `ccr-0ad18095-umgndf` off `Easter-NEWS`, keeping Feb 1 and the 1,024
  field. Fix: MLB's "Not Necessary" postseason games now count as over.
  Prepared for the six test branches: a `TEST-ONLY:` merge of the current
  `Easter-NEWS` (#376-#437, clean) plus that fix - waiting on Pete's OK.
- 2026-10-19: Pete OK'd it. Each test branch got the `TEST-ONLY:` merge of
  `Easter-NEWS` (through #450), then one `PIPELINE:` recap fix (also on
  `ccr-0ad18095-umgndf` for `Easter-NEWS`). Weeks 1-2 replayed against the
  live feed: no random coin flips. Nine Week 2 games are tied after every
  tiebreaker and wait on the commissioner (`COMMISSIONER_DECISIONS` in
  `src/lib/bracket/commissioner.ts`): eight with nobody in action on either
  side, one (bracket 3, JSerra Catholic @ Mission Viejo) where only JSerra's
  Austin Hedges batted (0-for-1, HBP) and both schools' alumni are on
  Cleveland (same W-L and run differential).
- 2026-10-19 (later): Pete asked for the Fantasy tab's new look on the test
  brackets too, to see it with real stories - an exception to rule 3. Each
  test branch got a `TEST-ONLY:` merge of `ccr-0ad18095-umgndf` (the
  ballpark scene behind rows 1-3, the splash's three towers, the 5x7 card
  picture, the box-score series, the players who played well as the
  picture). Still waiting on Pete's OK for `Easter-NEWS`.
- 2026-10-19 (later): Pete ruled the nine tied Week 2 games: each goes to
  the school that lost Game 1, so those series are tied 1-1. Recorded in
  `COMMISSIONER_DECISIONS` as a `TEST-ONLY:` commit on all six test branches
  (test games only; nothing for `Easter-NEWS`).
- 2026-10-19 (later): the Fantasy tab's picture now dissolves at the bottom
  and the timeline is outlined; Pete asked for it on the test brackets too
  (a `TEST-ONLY:` merge of `ccr-0ad18095-umgndf`, as before).
- 2026-10-19 (later): Pete OK'd both. PR #453 merged `ccr-0ad18095-umgndf`
  into `Easter-NEWS`: the Fantasy tab look is live, and so is the nightly
  Alumni Daily (`/api/cron/fan-daily-pilot`, midnight Arizona, test1-6 and
  pcdaction@gmail.com) with `YATSTATS_SENDING_DOMAIN_VERIFIED=true` set in
  production.
- 2026-10-21: the Alumni Daily's first two nights (Oct 20, 21) sent nothing:
  the app role had no access to `alumni_daily_email_delivery` (granted Oct
  21, `migrations/20261021_...`). Pete moved it to 4:00 AM Arizona (11:00
  UTC), an hour after the 3:00 AM Baseball Cube ingest.
- 2026-10-26: Pete asked for the test brackets with the current
  `Easter-NEWS` look. Each test branch got a `TEST-ONLY:` merge of
  `Easter-NEWS` (#555-#578: splash, Alumni News, roster and card fixes).
  None of those commits touch a bracket file or the bracket's stats
  source, and bracket 1's `/api/bracket/live` returned the same rosters,
  stat lines, club results and fan counts before and after.
- 2026-10-26 (end of week 3): 12 Game 3s were still tied after every
  tiebreaker (nobody in action, even club run differentials, even fan
  bases). Pete: "you need to be the commissioner." Ruled, in order: the
  better series run differential over Games 1-2; then the series game won
  on the field rather than by a commissioner's decision; then the higher
  seed. Recorded in `COMMISSIONER_DECISIONS` as a `TEST-ONLY:` commit on
  all six test branches. Found at the same time: nothing builds Round 2
  from the Round 1 winners (the test field and `blankSeason` on
  `Easter-NEWS` both leave rounds 2-10 empty), so every Round 2 opponent
  shows TBD; and the page moves to Round 2 by the calendar, with no Round 1
  recap. Waiting on Pete's OK for the tiebreaker rule in the engine and
  for both fixes (PIPELINE).
- 2026-10-27: Pete: "just give me the stat table, rebuild the schedule". In
  the live database: `stat_lines` (the landing table: every stat line, any
  source, with its teamid and official level; the MLB feed lands in it by
  trigger) and `master_bracket` (both seasons' schedules: this test, six
  brackets, and 2027 on the Feb 1 calendar; results, history, locked
  finals, `commissioner_rulings`, `needs_decision`). Pete: the team list must
  be complete - all 350 teams on MLB's lists now have a teamid and a level.
  His levels: Arizona Fall League = MLB; Mexican League, winter leagues and
  Caribbean Series = INTERNATIONAL. The test pages still score the Fall
  League as DOUBLE-A (the feed's "WIN"), until the bracket reads levels from
  `stat_lines` - waiting on Pete (Round 1 was played that way).
- 2026-10-27 (later): production `master_bracket` now holds the test
  season's Round 1 results (144 games, final and locked, checksum-matched
  to the results job's offline run as of Oct 26), the Round 2 pairings (72
  games) and the 21 `commissioner_rulings` (weeks 2-3). Week 4 (Round 2
  Game 1) is scored when `scripts/master-bracket-results.ts` runs; it isn't
  scheduled yet (its workflow needs an `Easter-NEWS` merge, Pete's OK). The
  newsletter should read `master_bracket` / `master_bracket_series` /
  `stat_lines` rather than copy the bracket's scoring code.
- 2026-10-28: Pete: the season is two tournaments in one, 15,368 games.
  Every school plays every week; knocked-out schools are paired each round,
  across regions, real-life teammates' schools first (publicly "randomly
  selected"). Built and proven offline
  (`docs/total-runs-proof-2026-10-28.md`); nothing applied to production.
- Note for anyone replaying the brackets: `/api/bracket/live` takes at most
  64 schools per request (the field is 69), so ask one bracket at a time.
- Before Feb 1: `/api/bracket/live` is one uncached request per page load
  for every school in the field (16 on a test branch, 1,024 live). It must
  be scoped to a region/bracket and cached server-side before opening day.
- 2026-10-28 (later): tests 1A-6A (`release/bracket-test-Na-20261027`, each
  with its own Neon copy) draw the stored results (`/api/bracket/prepared`),
  never score in the browser. Each copy got the knocked-out schools' 51
  games (Rounds 2-4, ids 46-96). The results job runs on the server:
  `/api/cron/bracket-results` (PIPELINE), one bracket per test
  (`BRACKET_TEST_REGION`), live stats read from production
  (`BRACKET_LIVE_BASE_URL=https://5004.yatstats.com`; each copy's own stats
  stopped Oct 27), authorised by `BRACKET_RESULTS_KEY`. Vercel cron only
  runs on production, so the hourly run is a Claude scheduled task that
  calls the six routes. In production it will be a Vercel cron with
  `CRON_SECRET` (needs the `Easter-NEWS` merge, Pete's OK).
