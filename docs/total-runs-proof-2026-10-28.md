# 2027: 15,368 games, proven offline (Oct 28, 2026)

Pete, Oct 28: "15,368 is the number." The season is two tournaments in one:
every one of the 1,024 schools plays every week of Weeks 1-30 (15,360
games), the 8 regional Total Runs leaders play Weeks 31-33 (7 games), and
the Total Runs winner plays the National Bracket winner in Week 34 (1 game).
The rules are in `docs/decisions-2026-10-27.md` ("The season: two
tournaments in one").

## What was built (not applied to production)

- `migrations/20261028_master_bracket_total_runs.sql`:
  - a new stage, `total_runs`, for the knocked-out schools' games;
  - the `total_runs_standings` view (each school's runs over the 30 weeks,
    ranked inside its region);
  - `master_bracket_series` updated so a knocked-out pair's three games
    count like a series.
- `scripts/master-bracket-seed.cjs`: the 12,291 empty knocked-out slots
  (games 3,070-15,360, Weeks 4-30, region 0), so 2027 is 15,368 games. The
  script refuses to write a season where any week of Weeks 1-30 has other
  than 512 games. A test season gets 51 such slots per bracket (16 schools x
  12 weeks / 2 = 96 games), paired only inside its own bracket.
- `scripts/master-bracket-results.ts`, the results job:
  - scores the knocked-out games and Weeks 31-34 with the scoreboard's own
    code, exactly like bracket games;
  - pairs the knocked-out schools when a round ends;
  - reseeds Round 8 (Pete's Oct 27 rule);
  - fills Weeks 31-34 from the stored Week 30 results and standings.

  Its bracket results are unchanged: rerun on the Oct 26 test inputs, its
  output is byte-for-byte the Oct 27 run's.
- `scripts/master-bracket-season-proof.ts`: the full-season proof below.

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

All 14 checks pass:

| Check | Result |
|---|---|
| Games | 15,368: bracket 3,069, knocked-out 12,291, Weeks 31-33 7, Week 34 1 |
| Every game has two schools and is final and locked | 15,368 of 15,368 |
| Weeks 1-30 | 512 games every week, 15,360 in all (1,024 x 30 / 2) |
| Every school plays every week, once | 1,024 schools x 30 weeks; no school plays twice in a week |
| Knocked-out pairs = exactly the schools out so far | Round 2: 512 schools (256 pairs) ... Round 10: 1,022 (511) |
| Teammates' schools matched first | Round 2: 244 of 256 pairs share a team (20 with the draw alone); 234 of 256 cross regions |
| Round 8 reseeded 1 v 8, 4 v 5, 2 v 7, 3 v 6 | yes, by original seed |
| Total Runs counts 30 games per school | 1,024 schools, 30 games each |
| Week 31 = the 8 regional leaders, seeded 1 v 8, 4 v 5, 2 v 7, 3 v 6 | matches the stored standings view |
| Weeks 32-33: winners advance | yes |
| Week 34 = bracket champion v Total Runs winner | yes |
| Every empty slot filled by the job, from stored results | 13,832 of 13,832 (in `master_bracket_history`) |
| A rerun of every day changes nothing | table identical; no new history; 0 needs-decision items |
| A locked final can't be changed | the UPDATE was refused |

**When each was drawn, automatically:**

| What | When |
|---|---|
| Round 2's knocked-out pairs | Mon Feb 22, the run after Week 3 went final |
| Later rounds' pairs | each round's first Monday |
| Round 8 reseeding | Mon Jun 28, after Round 7 |
| Week 31 | Mon Aug 30, after Week 30 went final |
| Weeks 32, 33 and 34 | Sep 6, Sep 13, Sep 20 |

The teammate share is high because the stand-in teams are crowded: about 14
alumni per team. Real rosters will link fewer schools; the rest are drawn.

## Still open

- **Pete to decide:**
  - Does the bracket champion sit out Weeks 31-33? As built, yes: its region
    sends the next school (`CHAMPION_SITS_OUT`).
  - The tiebreak for a region's lead: as built, runs, then run
    differential, wins, seed.
  - Home team in Week 34: as built, the bracket champion.
- **Not blocked:** deleting a locked final (it's logged, not refused). This
  was an audit finding and is not fixed here.
- **Not proven:** the pairing on real data. It needs a read of
  `player_team_stints` for the field's alumni.
- **Nothing is in production:**
  - the migration isn't applied;
  - the slots aren't seeded;
  - the job's new version isn't deployed or scheduled.

  Each step needs Pete's go.

Rerun it: start a local Postgres, then
`npx tsx --tsconfig tsconfig.json scripts/master-bracket-season-proof.ts --db postgresql://postgres@localhost:5499/proof --out proof.json`
(about 18 minutes).
