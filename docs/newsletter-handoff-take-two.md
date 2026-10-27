# Newsletter handoff, take two (Oct 27, 2026)

For the newsletter team (ChatGPT, with Manus advising), from Claude, built
on Pete's decisions. **This replaces the first handoff completely.** The first one only
described what exists today. It led everyone back to the old approach: the
newsletter reading raw stats and scoring games itself. That approach is
dropped.

The rules behind this handoff are in `docs/decisions-2026-10-27.md`. Pete
decides, not this file.

---

## 1. The one rule

**The newsletter reads finished rows and prints them. It never computes.**

- Claude's pipeline writes every stat line, game story, scoreboard and box
  score **once**, into tables. The bracket pages read the same rows, so the
  site and the email always agree.
- The newsletter's job:
  1. pick the recipients;
  2. pick their rows;
  3. add the sponsor;
  4. lay out the email;
  5. send it through HighLevel;
  6. save a copy of what was sent.
- **The newsletter never:**
  - scores a game, adds up stats, or computes OPS+, FIP- or W-L;
  - formats a stat line (the pipeline writes the finished text);
  - reads `stat_lines`, `player_game_logs`, `/api/bracket/live` or
    `/bracket-lab/2026/index.json`;
  - uses copies of `src/lib/bracket/scoreLive.ts` or `productionIndex.ts`.
  Remove all of those from the newsletter code.
- **The newsletter doesn't need to know:**
  - how ties are broken. Print a tie decision as the row says it
    ("Commissioner's decision") and never explain it;
  - how late or corrected stats are handled (section 2);
  - how eliminated schools are matched.
  Those are the pipeline's job.

## 2. Timing: wait for the ready row

- Each stats day closes at **4 a.m. Arizona (11:00 UTC)** the next morning.
  Everything in by then is that day's, and the day is frozen for good.
- Each week (one bracket game) closes at **4 a.m. Arizona Monday**. Then
  it's final and locked for good.
- When a day's or a week's rows are complete, the pipeline adds one row to
  `edition_ready`. **Send an edition only after its ready row exists.** The
  rows behind it never change after that, so there's nothing to re-check.
- If the ready row hasn't appeared by send time, don't send. Pete decides
  whether to wait or skip (not decided yet).

## 3. The Daily Digest

Sent every morning after the day's ready row. "Yesterday" below means the
stats day that just closed (`stats_date`).

1. **The fan's favorites' stat lines.** The same for fans and superfans:
   only the players they favorited. There's no home-school roster unless
   they favorited those players. Superfans get all of their favorites.
   - No favorites: "You haven't picked any favorites yet", plus a link to
     pick some.
   - Favorites, but none played yesterday: "None of your players were in
     action yesterday."
2. **The home school's game story**, from the home school's side, through
   the latest inning.
   - Tuesday's Daily covers inning 1 (Monday's stats). Thursday's is through
     3, Friday's through 4, and so on.
   - Monday's Daily shows the final.
3. **The scoreboard:** 12 games, like Wrigley Field's (Pete has the photo).
   - The home school's game sits bottom left, with red lines above and
     below.
   - **The other 11 slots are the schools the fan picked**, in the fan's
     order (5.4).
   - Each game appears once. If two picked schools play each other, or the
     fan picked the home school's opponent, the game takes one slot and the
     rest stay blank.
   - Slots the fan hasn't filled stay blank, with the invitation "Pick your
     own favorite 11 and we'll send them to you every day" and a link to the
     pick page.
   - A fan who has picked nobody sees the home game and 11 blank slots.
   - Each game shows inning-by-inning runs so far.
   - Underneath: a "See the full scoreboard" link to the site's homepage.

If the home school has no game (it isn't in the field), leave out the story
and the home slot. The favorites' lines and the fan's picks still go out.

## 4. The Weekly Gazette

Sent Monday after the week's ready row.

1. **The full home-school roster:** every rostered alumnus and their week,
   including the ones who didn't play.
2. **The home game's box score**, like an MLB box score (Pete has the
   Phillies-Mets example):
   - the line score;
   - each school's batting and pitching tables;
   - extra-base hits underneath.
3. **Scores around the league:** the week's finals in the home school's
   region, from `master_bracket`. Whether it's every region game or a
   shorter list, Pete decides after seeing it.

## 5. The tables

All in the production database (Neon project `round-recipe-12286668`,
branch `main`, database `neondb`, schema `public`). The newsletter role
(`yatstats_tribune_app`) gets **SELECT only**.

**Status:**
- **Built today:** `master_bracket` and `fantasy_active_season`.
- **Coming:** the seven tables in 5.1 to 5.6 aren't built yet. Their names
  and columns below are the contract; build against them now. With Pete's go,
  Claude creates them empty first so the code can point at them, then fills
  them.

### 5.1 `edition_ready` (coming): the go signal

One row per finished period.

| column | meaning |
|---|---|
| `season_key` | `test-2026`, `2027` |
| `cadence` | `daily` or `weekly` |
| `period_start`, `period_end` | Daily: the stats day for both. Weekly: Monday and Sunday. |
| `week` | the season week (bracket game) |
| `cutoff_at` | the 4 a.m. Arizona cutoff the rows were frozen at |
| `ready_at` | when the rows were complete |

```sql
SELECT * FROM edition_ready
 WHERE cadence = 'daily' AND period_start = $1;   -- no row: don't send
```

### 5.2 `daily_stat_lines` (coming): one finished line per player per game

Every player with a stat line that day, from any school. Favorites outside
the bracket field are included.

| column | meaning |
|---|---|
| `stats_date` | the stats day |
| `playerid` | matches `user_favorites.playerid` |
| `player_name`, `team_name`, `level`, `opponent_name` | for sorting and display, if wanted |
| `stat_type` | `batting` or `pitching`; a two-way day has both |
| `line` | **the finished text; print it as is** |
| `sort_key` | print in this order |

`line` examples (Pete's approved format):
- `Jake Smith (Rays, MLB) vs. Brewers: 2-for-4, HR, 2 RBI, BB`
- `Tom Jones (Ducks, NCAA-D1) vs. Beavers: 6.0 IP, 3 H, 1 ER, 2 BB, 8 K, W`

```sql
SELECT line FROM daily_stat_lines
 WHERE stats_date = $1 AND playerid = ANY($2::text[])   -- the fan's favorites
 ORDER BY sort_key;
```

Zero rows means "None of your players were in action yesterday."

### 5.3 `daily_game_stories` (coming): one story per school per day

Every game gets two stories, one from each school's side, about its own
players.

| column | meaning |
|---|---|
| `season_key`, `stats_date`, `hsid` | whose story, for which day |
| `opponent_hsid`, `region`, `game_id` | the game (matches `master_bracket`) |
| `through_inning` | 1-7 during the week; 9 or more once final |
| `is_final` | true in Monday's edition |
| `school_runs`, `opponent_runs` | the score so far, from this school's side |
| `title` | e.g. `HAMILTON TAKES THE LEAD` |
| `story` | the paragraph, e.g. "Hamilton put up two runs in the bottom of the 5th to take the lead..." |
| `shout_outs` | jsonb list of `{playerid, name, line}`: the day's top OPS+ and FIP- lines, text ready |

```sql
SELECT * FROM daily_game_stories WHERE stats_date = $1 AND hsid = $2;
```

### 5.4 The scoreboard (coming): every game's score, plus the fan's picks

**`daily_game_scores`:** one row per game per stats day, every game in the
field.

| column | meaning |
|---|---|
| `season_key`, `stats_date`, `region`, `game_id` | the game, on that day |
| `home_hsid`, `away_hsid` | the schools |
| `away_label`, `home_label` | short names for the board, e.g. `HAMILTON` |
| `away_innings`, `home_innings` | runs by inning so far, one text cell per inning (visitors on top, as on a scoreboard) |
| `away_runs`, `home_runs` | the score so far |
| `through_inning`, `is_final` | where the game stands |

**`user_scoreboard_schools`:** the fan's picks, written by the pick page on
the site.

| column | meaning |
|---|---|
| `firebase_uid` | the fan (matches `user_profiles`) |
| `position` | 1-11, the fan's order |
| `hsid` | the school picked |

```sql
-- the home game (slot bottom left)
SELECT * FROM daily_game_scores WHERE stats_date = $1 AND $2::int IN (home_hsid, away_hsid);

-- the fan's picks, in their order
SELECT p.position, g.*
  FROM user_scoreboard_schools p
  JOIN daily_game_scores g ON g.stats_date = $1 AND p.hsid IN (g.home_hsid, g.away_hsid)
 WHERE p.firebase_uid = $3
 ORDER BY p.position;
```

Picking rows like this is fine; it's not computing. Show a game only once,
and leave unfilled slots blank (section 3).

### 5.5 `weekly_box_scores` (coming): one per game per week

| column | meaning |
|---|---|
| `season_key`, `week`, `region`, `game_id` | the game |
| `home_hsid`, `away_hsid`, `home_name`, `away_name` | the schools |
| `line_score` | jsonb `{columns: ["1",...,"9",(tiebreaks),"R"], away: [...], home: [...]}`, all text |
| `away_batting`, `home_batting`, `away_pitching`, `home_pitching` | jsonb `{columns: [...], rows: [[...]], totals: [...]}`, every cell text, ready to print as a table |
| `extra_base_hits` | text list, e.g. `2B: Smith (Rays, MLB) 2, Jones (Ducks, NCAA-D1)` |
| `decision` | e.g. `Final` or `Final (Commissioner's decision)` |

```sql
SELECT * FROM weekly_box_scores
 WHERE season_key = $1 AND week = $2 AND $3::int IN (home_hsid, away_hsid);
```

### 5.6 `weekly_player_lines` (coming): the full roster, one line per player

| column | meaning |
|---|---|
| `season_key`, `week`, `hsid`, `playerid` | the player and their school |
| `player_name`, `team_name`, `level` | for display |
| `line` | finished text: the player's week, or `Did not play` |
| `sort_key` | print in this order |

```sql
SELECT line FROM weekly_player_lines
 WHERE season_key = $1 AND week = $2 AND hsid = $3 ORDER BY sort_key;
```

### 5.7 `master_bracket` (built): results, for "scores around the league"

One row per game. Use only rows that are `status = 'final' AND locked_at IS
NOT NULL`. Print `home_school_name`, `home_runs`, `away_school_name`,
`away_runs`. When `decided_by = 'commissioner'`, print "Commissioner's
decision" and nothing more.

```sql
SELECT home_school_name, home_runs, away_school_name, away_runs, decided_by
  FROM master_bracket
 WHERE season_key = $1 AND stage = 'bracket' AND week = $2 AND region = $3
   AND status = 'final' AND locked_at IS NOT NULL
 ORDER BY series_no, game_no;
```

`fantasy_active_season` (built) gives today's `season_key` and
`current_week`.

## 6. Recipients and sending (the newsletter's side, as today)

- **Recipients:** `user_profiles` (plan, `home_hsid`, email) and
  `user_favorites`, as the current pilot reads them. The approval gate and
  `alumni_newsletter_control` stay as they are.
- **Sponsor:** the newsletter's existing sponsor tables. The Tribune
  branch's code expects `tribune_private.*` tables. Those don't exist in
  this database; see section 8.
- **Sending:** HighLevel, as today. HighLevel's sending limits at full
  scale (tens of thousands of fans a day) are the newsletter team's to
  plan for.
- **Copy of each send:** for each recipient and edition, save:
  - the recipient;
  - the edition (cadence and period);
  - the sponsor shown;
  - the rendered email;
  - the HighLevel message id;
  - the time sent.

  The pipeline's rows never change after the ready row, so that copy is the
  full record.

## 7. What the newsletter team can do now

Build the reader and renderer against section 5, on its own branch:
- remove the scoring copies (section 1);
- add the sponsor slot and the copy of each send;
- make each change one commit, so Vercel builds don't fail on half-pushed
  files.

Rules while building:
- read-only database access;
- no sends;
- nothing merges to `Easter-NEWS` without Pete's go.

## 8. Open items (Pete and Claude, not the newsletter)

1. Claude builds and fills the tables in section 5, the frozen day and week
   copies, and the pick page, and schedules the results job. Each step
   needs Pete's go.
2. If the ready row is late: wait or skip? Pete to decide.
3. Where the newsletter's own tables (`tribune_private.*`, sponsors, the
   copy of each send) live.
4. The pick page's address, for the email's link: set when it's built.
