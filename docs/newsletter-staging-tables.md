# Newsletter staging tables (Oct 27, 2026)

Pete's rule: the computing happens once, the results land in staging tables,
and the newsletters (Daily and Weekly, fans and superfans) only read them.
The newsletter never scores a game or re-computes a stat itself. The test
season and the 2027 season use the same tables and the same code; only the
season and its dates differ.

## Which season is live

`fantasy_active_season` (view): the season whose dates include today's
bracket day (4 a.m. Arizona turnover), with `season_key`, `opening_day`,
`last_day`, `bracket_day` and `current_week`. Today that's `test-2026`
(Oct 5 - Dec 27, 2026). From Feb 1, 2027 it is `2027`, with no code change.

## Results: `master_bracket`, one row per game

Written by the bracket results job (`scripts/master-bracket-results.ts`,
workflow `Bracket Results (master_bracket)`, hourly at :05 UTC) with the
scoreboard's own scoring code on the scoreboard's own data.

| column | meaning |
|---|---|
| `season_key`, `stage` (`bracket`, `season_championship`, `world_series`), `region`, `round`, `round_name`, `series_no`, `game_no`, `game_id`, `week` | where the game sits |
| `game_start_date`, `game_end_date` | its Monday and Sunday |
| `home_hsid`, `away_hsid`, `home_seed`, `away_seed`, `home_school_name`, `away_school_name` | the schools (NULL until the round before is decided) |
| `status` | `tbd`, `scheduled`, `in_progress`, `final` |
| `innings` | runs by inning, home then away: `{h1,a1,h2,a2,...}`; innings 1-7 Monday-Sunday, 8 the week, 9 club W-L, then any tiebreak innings |
| `home_runs`, `away_runs`, `winner_hsid` | the score; the winner once final |
| `decided_by`, `decided_note` | `runs`, `players-N`, `cross`, `runDiff`, `fans`, `commissioner`, and the scoreboard's words for it |
| `box` | the stat drawer (below) |
| `computed_at`, `locked_at` | last scored; locked final (4 a.m. Arizona Monday) |

`master_bracket_series` (view): one row per series, with `home_wins`,
`away_wins`, runs and `winner_hsid`.

A school's game for a week:

```sql
SELECT * FROM master_bracket
 WHERE season_key = $1 AND stage = 'bracket' AND week = $2
   AND $3::int IN (home_hsid, away_hsid);
```

### `box`: the stat drawer (the hub's `GameBox`, `src/components/bracket/gallery.tsx`)

- `box.h`, `box.a`: each school's `SideBox`: `p` = the week's rows, `days` =
  rows for Monday..Sunday (`days[0]` is Monday), `wl` = the alumni's club
  W-L `[w, l]`, `rd` = club run differential.
- A row (`PlayerRow`): `[playerid, name, level, 0, bat, pit, OPS+, FIP-, [w, l], 0]`.
  `bat` = `[PA, AB, H, 2B, 3B, HR, BB, HBP, SF]` or 0;
  `pit` = `[outs, HR, BB, HBP, SO, H, R, ER, FIP]` or 0. These are the rows the Tribune's
  `toTribuneRoster` already takes as `sideBox`.
- `box.d`: per inning 1-8, `[home OPS+, away OPS+, home FIP-, away FIP-]`.
- `box.f`: whether each inning's [offense, pitching] run has posted yet.

Daily edition for day `d`: `box.<side>.days[d]`. Weekly: `box.<side>.p`.
The matchup block: `status`, `innings`, the runs, `decided_by`, `box.d` and
`box.<side>.wl`.

## Every stat line: `stat_lines`

One row per player, game and stat type, from every source (MLB's feed by
trigger as it writes; more sources later). Each line has its `teamid` and
official `level`, looked up, never guessed. Use `stat_lines_ready` (no held
or removed lines) or `v_school_stat_lines` (adds the player's school `hsid`,
name and status). Columns: `playerid`, `stat_type`, `game_date`,
`game_type`, `team_name`, `opponent_name`, `teamid`, `level`, `game_status`,
`is_final`, `team_won`, `stats` (the source's full line), the `bat_*` and
`pit_*` columns, `source`, `loaded_at`, `updated_at`.

Use it for players outside the bracket field (a followed player from a
school that isn't playing): counting stats only. OPS+ and FIP- come from
`box`; don't compute them in the newsletter.

## What the Tribune should stop doing

- Scoring from `/api/bracket/live` and `/bracket-lab/2026/index.json` with
  its own copies (`src/lib/bracket/scoreLive.ts`, `productionIndex.ts`):
  read `master_bracket` instead, so the newsletter and the hub always agree.
- Pushing one file per commit: each commit is a Vercel build, and the ones
  in between fail on missing imports. One commit per change.

Access: `authenticator` and `yatstats_tribune_app` can read all of these. Nothing
merges to `Easter-NEWS` without Pete's OK; the approval gate and
`alumni_newsletter_control` don't change without him.
