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
