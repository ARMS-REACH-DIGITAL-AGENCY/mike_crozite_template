# 2027: 15,368 games, proven offline (Oct 28, 2026)

Pete, Oct 28: "15,368 is the number." The season is two tournaments in one:
every one of the 1,024 schools plays every week of Weeks 1-30 (15,360
games), the 8 regional Total Runs leaders play Weeks 31-33 (7 games), and
the Total Runs winner plays the Main Bracket winner in Week 34 (1 game). The
rules are in `docs/decisions-2026-10-27.md` ("The season: two tournaments in
one" and "Bracket rounds (2027)").

## What was built (not applied to production)

- `migrations/20261028_master_bracket_total_runs.sql`:
  - a new stage, `total_runs`, for the knocked-out schools' games;
  - the `total_runs_standings` view (each school's runs over the 30 weeks,
    ranked inside its region);
  - `master_bracket_series` updated so a knocked-out pair's three games
    count like a series;
  - production's 9 empty Round 9-10 rows renumbered to Pete's series 5, 6
    and 9.
- `scripts/master-bracket-seed.cjs`, the 2027 schedule:

  | Part | Games | Game ids | Weeks |
  |---|---|---|---|
  | Rounds 1-7 (regions) | 3,048 | 1-3,048 | 1-21 |
  | Rounds 8-10 (8 regional winners, 12 series) | 36 | 3,049-3,084 | 22-30 |
  | Knocked-out games | 12,276 | 3,085-15,360 | 4-30 |
  | Weeks 31-34 | 8 | 15,361-15,368 | 31-34 |

  The site's game ids for the main path (series 1-6 and 9) are unchanged.
  The script refuses a season whose Weeks 1-30 aren't 512 games every week.
  A test season gets 51 knocked-out slots per bracket, paired only inside
  its own bracket.
- `scripts/master-bracket-results.ts`, the results job:
  - scores the knocked-out games and Weeks 31-34 with the scoreboard's own
    code, exactly like bracket games;
  - pairs the knocked-out schools when a round ends: teammates' schools
    first, never a rematch (a draw that had one isn't stored);
  - reseeds Rounds 8-10 by regional seed and routes Series 1-12 as Pete
    wrote them;
  - fills Weeks 31-34 from the stored Week 30 results and standings.

  On the Oct 26 test inputs its output is byte-for-byte the Oct 27 run's.
- `scripts/master-bracket-season-proof.ts`: the full-season proof below.

**Production's path, checked:** start from today's 2027 rows (3,077, the Oct
27 seed), apply the migration and then the new seed, each twice. The result
is identical, row for row, to a fresh 15,368-game build.

## The proof

The proof plays the whole 2027 season on a **local** database (it refuses
any other):
- the job's own code and SQL;
- the real 1,024-school field and Round 1;
- run twice a week, Feb 1 to Sep 27, 2027 (68 runs);
- then every day run again, to check that a rerun changes nothing.

The stats are **stand-ins**: 6,656 made-up alumni on 480 made-up teams, with
680,387 lines fixed by a seed. **The scores and champions mean nothing; only
the schedule does.**

All 19 checks pass:

| Check | Result |
|---|---|
| The reseeding rule on Pete's hypothetical example (a test of the rule only; the real Round 8 is filled from the real Round 7 results) | gives the Round 8 he wrote: S1 (#8) Region 3 at (#1) Region 5; S2 (#5) Region 8 at (#4) Region 1; S3 (#6) Region 7 at (#3) Region 2; S4 (#7) Region 4 at (#2) Region 6 |
| Games | 15,368: bracket 3,084, knocked-out 12,276, Weeks 31-33 7, Week 34 1 |
| Every game has two schools and is final and locked | 15,368 of 15,368 |
| Weeks 1-30 | 512 games every week, 15,360 in all (1,024 x 30 / 2) |
| Every school plays every week, once | 1,024 schools x 30 weeks; no school plays twice in a week |
| Knocked-out pairs = exactly the schools out of the regional brackets | Round 2: 512 (256 pairs), Round 3: 768 (384) ... Round 7: 1,008 (504); Rounds 8-10: 1,016 (508) |
| No rematches | 0 knocked-out pairs had played each other before |
| Teammates' schools matched first | Round 2: 244 of 256 pairs share a team (20 with the draw alone); 234 of 256 cross regions |
| Round 8: the 8 regional winners reseeded 1 v 8, 4 v 5, 3 v 6, 2 v 7 | yes, by regional seed |
| Rounds 9-10: Series 5-12 routed as Pete wrote them | yes |
| Weeks 22-30: the 8 regional winners play only each other | 36 games, all between two of the 8 |
| Total Runs counts 30 games per school | 1,024 schools, 30 games each |
| Week 31 = the 8 regional Total Runs leaders, seeded 1 v 8, 4 v 5, 2 v 7, 3 v 6 | matches the stored standings view |
| Weeks 32-33: winners advance | yes |
| The Main Bracket winner has byes in Weeks 31-33 | 0 games in Weeks 31-33 |
| Week 34 = Main Bracket winner v Total Runs winner | yes |
| Every empty slot filled by the job, from stored results | 13,832 of 13,832 (in `master_bracket_history`) |
| A rerun of every day changes nothing | table identical; no new history; 0 needs-decision items |
| A locked final can't be changed | the UPDATE was refused |

**When each was drawn, automatically:**

| What | When |
|---|---|
| Round 2's knocked-out pairs | Mon Feb 22, the run after Week 3 went final |
| Later rounds' knocked-out pairs | each round's first Monday |
| Round 8 | Mon Jun 28, after Round 7 |
| Round 9 | each series as soon as its two Round 8 feeders were decided (Jul 12 and Jul 19) |
| Round 10 | Aug 2 |
| Week 31 | Mon Aug 30, after Week 30 went final |
| Weeks 32, 33 and 34 | Sep 6, Sep 13, Sep 20 |

The teammate share is high because the stand-in teams are crowded: about 14
alumni per team. Real rosters will link fewer schools; the rest are drawn.

**Found and fixed on the way:** the first version paired teammates' schools
first and nothing else, so with the same pool and the same teammates it
picked the same pairs round after round (in the first proof run, 327 of
Round 10's 512 matchups repeated an earlier one; on one fixed pool of 512,
186 of 256 by Round 10). Now two schools that have already played are never
paired again: before Round 10 a school has played at most 9 others, in a
pool of 512 or more, so a draw without rematches always exists, and a draw
that had one would not be stored.

## Still open

- **Pete to decide:**
  - the tiebreak for a region's Total Runs lead (as built: runs, then run
    differential, wins, seed);
  - home team in Week 34 (as built: the Main Bracket winner).
- **Not blocked:** deleting a locked final (it's logged, not refused). This
  was an audit finding and is not fixed here.
- **Not proven:** the pairing on real data. It needs a read of
  `player_team_stints` for the field's alumni.
- **Not yet updated:** the site's bracket pages still draw Rounds 9-10 the old
  way (2 series and 1). That is layout work for Easter-NEWS, only with Pete's
  OK.
- **Nothing is in production:**
  - the migration isn't applied;
  - the slots aren't seeded;
  - the job's new version isn't deployed or scheduled.

  Each step needs Pete's go.

Rerun it: start a local Postgres, then
`npx tsx --tsconfig tsconfig.json scripts/master-bracket-season-proof.ts --db postgresql://postgres@localhost:5499/proof --out proof.json`
(about 20 minutes).
