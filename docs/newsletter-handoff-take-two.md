# Newsletter handoff, take two (Oct 27, 2026)

For the newsletter team (ChatGPT, with Manus advising), from Claude, built
on Pete's decisions. **This replaces the first handoff completely.** The
first one described only what exists today. It led everyone back to the old
approach, where the newsletter reads raw stats and scores games itself. That
approach is dropped.

The rules behind this contract are in `docs/decisions-2026-10-27.md`. Pete
decides, not this file.

**Status of this document:**
- It is a contract. The publication tables in section 4 **don't exist yet**.
- None of the SQL here has been executed, because the tables it reads
  aren't built.
- No production change was made for it.

---

## 1. The one rule

**The newsletter reads finished rows and prints them. It never computes.**

- Claude's pipeline writes every stat line, game story, score and box score
  **once**, into the tables in section 4. The bracket pages will read the
  same rows, so the site and the email always agree.
- The newsletter's job:
  1. pick the recipients;
  2. pick their rows;
  3. add the sponsor;
  4. lay out the email;
  5. send it through HighLevel;
  6. save a copy of what was sent.
- **The newsletter never:**
  - scores a game, adds up stats, or computes OPS+, FIP- or W-L;
  - formats a stat line (every `line` column is finished text);
  - reads `stat_lines`, `player_game_logs`, `flip_card_front_stage`,
    `/api/bracket/live` or `/bracket-lab/2026/index.json`;
  - uses copies of `src/lib/bracket/scoreLive.ts` or `productionIndex.ts`.
  Remove all of those from the newsletter code.
- **The newsletter doesn't need to know:**
  - how ties are broken. Print the `decision` text as it is, and never
    explain it;
  - how late or corrected stats are handled. They're already reflected in
    the rows;
  - how eliminated schools are matched.

## 2. What's built and what's coming

| Piece | Status |
|---|---|
| `fantasy_seasons`, `fantasy_active_season` (view) | **Built** in production |
| `master_bracket`, `master_bracket_series` (view) | **Built.** Holds test-2026 Round 1 results (final and locked) and the Round 2 pairings. The newsletter doesn't need it (section 6.5). |
| The 7 tables in section 4 | **Coming.** Not created. With Pete's go, Claude creates them empty first, so the newsletter can point at them, then fills them. |
| The pipeline job that writes them | **Coming** (Claude; needs Pete's go) |
| The page where fans pick their 11 scoreboard schools | **Coming** (Claude; needs Pete's go) |

Everything is in one database:
- Neon project `round-recipe-12286668`
- branch `main` (`br-polished-lab-a4i35u5j`)
- database `neondb`
- schema `public`

## 3. Timing and readiness

- **Stats day:** each stats day closes at **4 a.m. Arizona = 11:00 UTC**
  the next morning. Arizona has no daylight time.
  - What's in by then belongs to that day, and the day is frozen.
  - A stat that arrives later never goes into any Daily. It counts only in
    the Weekly.
- **Week:** a week (Monday-Sunday, one bracket game) closes at **4 a.m.
  Arizona Monday**. Then it's final and locked.
  - A correction to an earlier day during the week counts in the Weekly
    only.
  - Nothing changes the week after Monday's cutoff.
- **The ready row.** The pipeline writes a period's rows and its
  `edition_ready` row **in one transaction**.
  - If the ready row exists, every row for that period is there and final.
  - If it doesn't, none of them is visible.
- **The newsletter's rule (Pete):**
  - Send an edition only after its ready row exists.
  - If it isn't there at send time, wait and check again (every 5 minutes
    is fine), then send when it appears.
  - **Never skip an edition, and never send a partial one.**
  - If the pipeline was down for two days, send both editions, in order.
- **What a ready row covers:**
  - **Daily:** `daily_stat_lines`, `daily_game_stories` and
    `daily_game_scores` for that `stats_date`.
  - **Weekly:** `weekly_player_lines` and `weekly_box_scores` for that week.
- **Monday:** the Monday morning run writes Sunday's Daily (with the final
  stories and scores) and the Weekly together.

## 4. The publication tables

All in `public`. Every one except 4.5 is written only by the pipeline.

These are the exact definitions Claude will create (with Pete's go). All
text columns hold finished display text.

### 4.1 `edition_ready`: the go signal

```sql
CREATE TABLE edition_ready (
  cadence      text        NOT NULL CHECK (cadence IN ('daily','weekly')),
  period_start date        NOT NULL,  -- daily: the stats day; weekly: the Monday
  period_end   date        NOT NULL,  -- daily: same day; weekly: the Sunday
  season_key   text        REFERENCES fantasy_seasons(season_key),  -- NULL when no fantasy season is live
  week         smallint,                                            -- season week; NULL outside a season
  cutoff_at    timestamptz NOT NULL,  -- the 4 a.m. Arizona cutoff the rows are frozen at
  ready_at     timestamptz NOT NULL DEFAULT now(),
  row_counts   jsonb       NOT NULL,  -- e.g. {"daily_stat_lines": 812, "daily_game_stories": 96, "daily_game_scores": 48}
  PRIMARY KEY (cadence, period_start),
  CHECK ((cadence = 'daily'  AND period_end = period_start)
      OR (cadence = 'weekly' AND period_end = period_start + 6 AND extract(isodow FROM period_start) = 1))
);
```

**Row identity:** `(cadence, period_start)`. One row per edition period,
written once.

### 4.2 `daily_stat_lines`: one finished line per player per game

```sql
CREATE TABLE daily_stat_lines (
  stats_date     date    NOT NULL,  -- the game's official date
  stat_line_id   bigint  NOT NULL,  -- the pipeline's id for the line; record it in the sent copy
  playerid       text    NOT NULL,  -- matches user_favorites.playerid
  player_name    text    NOT NULL,  -- "Jake Smith"
  hsid           integer,           -- the player's high school, when known
  team_name      text    NOT NULL,  -- "Tampa Bay Rays"
  team_short     text    NOT NULL,  -- "Rays" (the name used in line)
  level          text    NOT NULL,  -- an official level: MLB, TRIPLE-A, ... NCAA-D1, ... NJCAA, ...
  opponent_name  text    NOT NULL,  -- "Milwaukee Brewers"
  opponent_short text    NOT NULL,  -- "Brewers"
  stat_type      text    NOT NULL CHECK (stat_type IN ('batting','pitching')),
  line           text    NOT NULL,  -- print as is
  sort_key       text    NOT NULL,  -- print in this order
  PRIMARY KEY (stats_date, stat_line_id)
);
CREATE INDEX daily_stat_lines_player_idx ON daily_stat_lines (stats_date, playerid);
```

- **Row identity:** `(stats_date, stat_line_id)`. There's one row per
  player, game and stat type in by the cutoff, for **every** player with a
  line that day: from any school, in or out of the bracket field.
- A two-way day has a batting row and a pitching row. A doubleheader has
  one row per game, and its `line` says "(Game 1)" or "(Game 2)".
- `line` format (Pete approved):
  - `Jake Smith (Rays, MLB) vs. Brewers: 2-for-4, HR, 2 RBI, BB`
  - `Tom Jones (Ducks, NCAA-D1) vs. Beavers: 6.0 IP, 3 H, 1 ER, 2 BB, 8 K, W`
- `sort_key` orders by player last name, first name, game, then batting
  before pitching.

### 4.3 `daily_game_stories`: one story per school per day

```sql
CREATE TABLE daily_game_stories (
  stats_date     date     NOT NULL,
  hsid           integer  NOT NULL,  -- the school whose side the story is told from
  season_key     text     NOT NULL REFERENCES fantasy_seasons(season_key),
  week           smallint NOT NULL,
  region         smallint NOT NULL,
  game_id        integer  NOT NULL,  -- (season_key, region, game_id) = the master_bracket game
  opponent_hsid  integer  NOT NULL,
  school_name    text     NOT NULL,  -- "Hamilton"
  opponent_name  text     NOT NULL,
  series_note    text,               -- "Game 2 of 3. Hamilton leads the series 1-0."
  through_inning smallint NOT NULL,  -- 1-7 during the week; 9 or more when final
  is_final       boolean  NOT NULL,
  school_runs    smallint NOT NULL,  -- the score so far, from this school's side
  opponent_runs  smallint NOT NULL,
  title          text     NOT NULL,  -- "HAMILTON TAKES THE LEAD"
  story          text     NOT NULL,  -- "Hamilton put up two runs in the bottom of the 5th to take the lead..."
  shout_outs     jsonb    NOT NULL DEFAULT '[]',  -- [{"playerid":"209830","name":"Jake Smith","line":"Jake Smith (Rays, MLB) vs. Brewers: 2-for-4, HR, 2 RBI, BB"}]
  PRIMARY KEY (stats_date, hsid)
);
```

- **Row identity:** `(stats_date, hsid)`. Every game gets two rows a day,
  one from each school's side, about its own players.
- **The day's stats and the inning:**
  - Monday's stats are inning 1 (Tuesday's Daily); Wednesday's stats are
    inning 3 (Thursday's Daily); Sunday's are inning 7.
  - Sunday's row is written at the Monday cutoff, when the week is final.
    It has `is_final = true` and is the game's recap.
- A school with no game that week has no row.

### 4.4 `daily_game_scores`: every game's score, every day

```sql
CREATE TABLE daily_game_scores (
  stats_date     date     NOT NULL,
  season_key     text     NOT NULL REFERENCES fantasy_seasons(season_key),
  region         smallint NOT NULL,
  game_id        integer  NOT NULL,
  week           smallint NOT NULL,
  home_hsid      integer  NOT NULL,
  away_hsid      integer  NOT NULL,
  home_label     text     NOT NULL,  -- short name for the board: "HAMILTON"
  away_label     text     NOT NULL,
  home_innings   text[]   NOT NULL,  -- one cell per inning so far: {"0","2","1"}
  away_innings   text[]   NOT NULL,
  home_runs      smallint NOT NULL,
  away_runs      smallint NOT NULL,
  through_inning smallint NOT NULL,
  is_final       boolean  NOT NULL,
  PRIMARY KEY (stats_date, season_key, region, game_id)
);
CREATE INDEX daily_game_scores_home_idx ON daily_game_scores (stats_date, home_hsid);
CREATE INDEX daily_game_scores_away_idx ON daily_game_scores (stats_date, away_hsid);
```

- **Row identity:** `(stats_date, season_key, region, game_id)`. One row
  per game in the field per day.
- The board shows at least 9 inning columns. Cells past the array are
  blank. Tiebreak innings (10 and up) add columns.

### 4.5 `user_scoreboard_schools`: the fan's 11 picks

Written by the pick page on the site, not by the pipeline. It changes
whenever the fan edits their picks.

```sql
CREATE TABLE user_scoreboard_schools (
  firebase_uid text        NOT NULL,  -- matches user_profiles.firebase_uid
  position     smallint    NOT NULL CHECK (position BETWEEN 1 AND 11),
  hsid         integer     NOT NULL,
  label        text        NOT NULL,  -- short name for the board, saved by the pick page
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (firebase_uid, position),
  UNIQUE (firebase_uid, hsid)
);
```

**Row identity:** `(firebase_uid, position)`. A fan picks up to 11 schools
from the bracket field.

### 4.6 `weekly_box_scores`: one box score per game per week

```sql
CREATE TABLE weekly_box_scores (
  season_key           text     NOT NULL REFERENCES fantasy_seasons(season_key),
  region               smallint NOT NULL,
  game_id              integer  NOT NULL,
  week                 smallint NOT NULL,
  period_start         date     NOT NULL,  -- Monday
  period_end           date     NOT NULL,  -- Sunday
  round_name           text     NOT NULL,  -- "Round 1"
  game_no              smallint NOT NULL,  -- 1-3 in the series
  home_hsid            integer  NOT NULL,
  away_hsid            integer  NOT NULL,
  home_name            text     NOT NULL,  -- "Hamilton (Chandler, AZ)"
  away_name            text     NOT NULL,
  home_runs            smallint NOT NULL,
  away_runs            smallint NOT NULL,
  winner_hsid          integer  NOT NULL,
  decision             text     NOT NULL,  -- "Final", or e.g. "Final (Commissioner's decision)"; print as is
  score_line           text     NOT NULL,  -- "Hamilton (Chandler, AZ) 5, Xavier Prep (Phoenix, AZ) 3"
  line_score           jsonb    NOT NULL,
  home_batting         jsonb    NOT NULL,
  away_batting         jsonb    NOT NULL,
  home_pitching        jsonb    NOT NULL,
  away_pitching        jsonb    NOT NULL,
  home_extra_base_hits text[]   NOT NULL,  -- {"2B: Smith (Rays, MLB) 2, Jones (Ducks, NCAA-D1)", "HR: Smith (Rays, MLB) 2"}
  away_extra_base_hits text[]   NOT NULL,
  PRIMARY KEY (season_key, region, game_id)
);
CREATE INDEX weekly_box_scores_week_idx ON weekly_box_scores (season_key, week, region);
```

**Row identity:** `(season_key, region, game_id)`, one row per game, which
is one week.

The jsonb shapes. Every cell is text, ready to print as an HTML table.
- `line_score`:
  `{"columns":["1","2","3","4","5","6","7","8","9","R"],"away":["0","1","0","0","2","0","0","1","1","5"],"home":[...]}`
  - Innings 1-7 are Monday-Sunday, 8 is the week, 9 is the clubs' W-L.
  - Tiebreak innings add columns before "R".
- Batting:
  ```json
  {"columns":["Player","Team","AB","R","H","2B","3B","HR","RBI","BB","SO","OPS+"],
   "rows":[["Jake Smith","Rays, MLB","22","4","7","1","0","2","5","3","4","162"]],
   "totals":["Totals","","..."]}
  ```
- Pitching: the same shape, with
  `"columns":["Pitcher","Team","IP","H","R","ER","BB","SO","HR","W-L","FIP-"]`.

The tables list the alumni who played. The full roster, including who
didn't play, is 4.7. The columns are Claude's proposal; Pete approves the
look.

### 4.7 `weekly_player_lines`: the full roster, one line per player

```sql
CREATE TABLE weekly_player_lines (
  period_start date     NOT NULL,  -- Monday
  hsid         integer  NOT NULL,
  playerid     text     NOT NULL,
  period_end   date     NOT NULL,  -- Sunday
  season_key   text     REFERENCES fantasy_seasons(season_key),  -- NULL outside a fantasy season
  week         smallint,
  player_name  text     NOT NULL,
  team_short   text     NOT NULL,  -- the player's latest team that week
  level        text     NOT NULL,  -- official level
  games        smallint NOT NULL,  -- 0 = didn't play
  line         text     NOT NULL,  -- print as is
  sort_key     text     NOT NULL,
  PRIMARY KEY (period_start, hsid, playerid)
);
```

- **Row identity:** `(period_start, hsid, playerid)`.
- It covers every rostered alumnus of **every** school, frozen at the
  Monday cutoff. That includes schools outside the bracket field, so every
  fan's Weekly works.
- The roster is the bracket's own rule: the current alumni statuses, with no
  high school players.
- `line` follows the Daily style for the week, e.g.:
  - `Jake Smith (Rays, MLB): 7-for-22, 2 HR, 5 RBI, 3 BB`
  - `Tom Jones (Ducks, NCAA-D1): 2 GS, 12.0 IP, 2 ER, 15 K, 1-0`
  - `Sam Lee (Bees, TRIPLE-A): Did not play`

  Pete approves the format.

## 5. The Daily Digest: which rows

**Inputs:**
- the recipient's `firebase_uid`;
- their `home_hsid` (from `user_profiles`);
- `D`, the `period_start` of a daily `edition_ready` row.

Send each daily ready row once to each eligible recipient. Who's eligible
(plans, subscriptions, unsubscribes, the approval gate) is the newsletter's
existing logic; this contract doesn't change it.

1. **Wait** for `edition_ready (cadence 'daily', period_start D)`.
2. **Favorites' stat lines:**
   - all `daily_stat_lines` with `stats_date = D` whose `playerid` is one of
     the recipient's `user_favorites`, in `sort_key` order;
   - the same rule for fans and superfans, with no home roster;
   - **no favorites at all:** print "You haven't picked any favorites yet"
     and a link to pick some;
   - **favorites, zero rows:** print "None of your players were in action
     yesterday."
3. **The home school's game story:** the `daily_game_stories` row
   `(D, home_hsid)`. If there's no row, leave out the section.
4. **The scoreboard** (12 slots, laid out like Wrigley Field's):
   1. **Home slot,** bottom left between red lines: the `daily_game_scores`
      row for `D` with `home_hsid` in `(home_hsid, away_hsid)`. If there's
      none, the home slot is blank.
   2. **Slots 1-11:** the recipient's `user_scoreboard_schools` in
      `position` order. Each one's game is the `daily_game_scores` row for
      `D` that includes that `hsid`.
      - **Each game appears once.** Skip a game already on the board (the
        home game, or an earlier pick's).
      - A picked school with no game that day: show its `label` with empty
        cells.
   3. **Slots still empty:** blank, with "Pick your own favorite 11 and
      we'll send them to you every day" and a link to the pick page.
   4. **Under the board:** "See the full scoreboard", linking to the site's
      homepage.
5. **Sponsor:** section 8.

## 6. The Weekly Gazette: which rows

**Inputs:**
- the recipient's `firebase_uid` and `home_hsid`;
- `M`, the Monday that is the weekly ready row's `period_start` (the week
  that just ended);
- the ready row's `season_key` and `week`.

1. **Wait** for `edition_ready (cadence 'weekly', period_start M)`.
2. **The full home roster:** `weekly_player_lines` for `(M, home_hsid)`,
   in `sort_key` order.
3. **The home game's box score:** the `weekly_box_scores` row for
   `(season_key, week)` with `home_hsid` in `(home_hsid, away_hsid)`. There
   is at most one. If there's none, leave out the section.
4. **The recap** (optional; Pete decides whether the Weekly prints it): the
   home school's final story, `daily_game_stories` for
   `(period_end, home_hsid)` with `is_final`.
5. **Scores around the league:** `weekly_box_scores.score_line` and
   `decision` for every game that week in the home game's `region`.
   - This needs no `master_bracket` read.
   - Whether to print every region game or a shorter list, Pete decides
     after seeing it.
6. **Sponsor:** section 8.

## 7. Game stories and articles

- **Game stories:** only `daily_game_stories`. The pipeline writes them
  with the site's own story code (`src/components/bracket/dayStory.ts`):
  - the title;
  - the scoring innings and who drove them;
  - the top OPS+ and FIP- shout-outs;
  - the final recap on Sunday's row.
- **Publisher notes and articles** (Pete's own words, not game stories):
  the newsletter's side. The Tribune code reads one note per school and
  cadence from `tribune_private.publisher_notes`.
- There are no other article sources.

## 8. Sponsors and partners (the newsletter's side)

The pipeline provides no sponsor data, and no sponsor is tied to results.

- **What the Tribune code already uses**
  (`src/lib/partners/publication.ts` on
  `release/tribune-digest-controlled-cutover-20261026`):
  - one sponsor per school, cadence and send time, from
    `tribune_private.school_tribune_sponsorships`, `public.sponsor_brands`
    and `tribune_private.tribune_sponsor_creatives`;
  - the masthead, official rules and postal address from
    `tribune_private.tribune_publication_settings`;
  - the publisher note from `tribune_private.publisher_notes`.
- **`public.sponsor_brands` exists in production.** Columns, checked Oct
  27: `id`, `slug`, `name`, `logo_url`, `website_url`,
  `external_partner_id`, `is_active`, `created_at`, `updated_at`.
- **The `tribune_private` tables don't exist in this production
  database.** The Tribune connects with `TRIBUNE_DATABASE_URL`, and where
  that points hasn't been checked. Where these tables live is Pete's
  decision (section 14).
- **Also in `public`** (columns not checked for this document):
  `microsite_sponsors`, `player_profile_sponsors`, `sponsor_orders`,
  `school_splash_sponsorships`, `v_school_splash_sponsor_assignments`.

## 9. History and corrections

- **Pipeline tables (4.1-4.4, 4.6, 4.7):**
  - Rows are inserted once, with their ready row, and **never updated or
    deleted**.
  - Every past day and week stays queryable by its date.
- **Late stats and corrections never change a past day.**
  - A line that arrives after its day's cutoff is never added to that day,
    or to a later day.
  - Late lines and corrections made during the week count only in that
    week's rows.
  - After Monday's cutoff, nothing changes the week.
- **A mistake found later** in a frozen row:
  - It's fixed only if Pete orders it, and the change is logged with its
    old and new values.
  - A sent email is never resent or changed.
  - The newsletter doesn't read the log.
- **`user_scoreboard_schools` is the one live table.** Read it at send
  time, and record in the sent copy which schools filled the board.

## 10. The sent copy (the newsletter's tables)

The newsletter keeps a copy of each send, in its own tables. **Claude
doesn't create these.** The Tribune branch already has designs:

- **`tribune_private.alumni_newsletter_editions`**
  (`src/lib/tribune/archive.ts`): `id uuid`, `firebase_uid`, `school_id`,
  `report_start`, `report_end`, `edition jsonb`, `public_edition jsonb`.
- **`tribune_private.newsletter_deliveries` and
  `tribune_private.newsletter_delivery_attempts`**
  (`migrations/20261026_tribune_unified_delivery.sql`, marked "isolated
  only, not approved for production"). One delivery per
  `(firebase_uid, publication_type, report_start, report_end)`, with the
  provider message id and each attempt.
- **A mismatch to fix on that branch:** the code reads
  `tribune_private.alumni_newsletter_control` and
  `tribune_private.alumni_newsletter_preferences`, but the migration creates
  `tribune_private.newsletter_control` and
  `tribune_private.newsletter_preferences`.

Each sent copy must hold:
- the recipient (`firebase_uid`, email, `home_hsid`);
- the edition: `cadence`, `period_start`, and the ready row's `ready_at`;
- the keys of every pipeline row printed:
  - `daily_stat_lines (stats_date, stat_line_id)`;
  - `daily_game_stories (stats_date, hsid)`;
  - `daily_game_scores (stats_date, season_key, region, game_id)`, by slot;
  - `weekly_box_scores (season_key, region, game_id)`;
  - `weekly_player_lines (period_start, hsid, playerid)`;
- the scoreboard picks used (`position`, `hsid`);
- the sponsor shown: brand id, creative id and revision;
- the rendered email (subject and HTML);
- the HighLevel message id and the time sent.

The pipeline's rows never change, so this copy plus those keys is the
complete record.

## 11. Permissions

| Who | Can |
|---|---|
| **Pipeline** (Claude's job, in GitHub Actions with the `DATABASE_URL` secret) | Writes 4.1-4.4, 4.6, 4.7. Never touches HighLevel or the newsletter's tables. |
| **Site** (the pick page, as the app's role `authenticator`) | Writes `user_scoreboard_schools` for the signed-in fan only |
| **Newsletter runtime** (`yatstats_tribune_app`) | **SELECT only** on every table in section 4, `fantasy_active_season`, `user_profiles` and `user_favorites`. **No write** to any of them. |
| **Newsletter runtime**, its own tables | Writes its sent copies, deliveries and attempts, and reads its preferences. It doesn't write the approval gate or `alumni_newsletter_control`. |

- The SELECT grants on the new tables come with their creation.
- `yatstats_tribune_app` already reads `master_bracket` and the stat
  tables.
- **Not verified:** whether `yatstats_tribune_app` can read `user_profiles`
  and `user_favorites` today. The production pilot reads them through the
  app's main connection. Check this before relying on it.

## 12. HighLevel boundary

- **The pipeline never contacts HighLevel and never sends.**
- **The newsletter sends**, as the production pilot does today
  (`src/app/api/admin/fan-newsletter-pilot/route.ts`,
  `src/lib/alumniEmailSender.ts`, `src/lib/gohighlevel.ts`). Per recipient:
  1. **Find the contact:** look up the recipient's HighLevel contact by
     email in the location (`lookupGHLContactByEmail`, which calls
     `services.leadconnectorhq.com/contacts/search/duplicate`).
  2. **Send:** `POST https://services.leadconnectorhq.com/conversations/messages`
     with `{type: "Email", contactId, subject, html, emailFrom}`. Today's
     sender is `YAT?STATS Daily <daily@yatstats.com>`.
  3. **Credentials:** from the deployment's environment (`GHL_API_KEY`,
     `GHL_LOCATION_ID`). Never in code or logs.
  4. **Record:** HighLevel's accepted response and message id go in the
     sent copy.
     - Each `(recipient, cadence, period)` is sent at most once.
     - A send whose outcome is unknown is checked in HighLevel before any
       retry.
- **Sending limits, retries, bounces and unsubscribes at full scale** (tens
  of thousands of fans a day) are the newsletter team's to plan.

## 13. Sample queries: one Daily and one Weekly

The example is the Hamilton fan (`home_hsid` 5004), with `$1` = their
`firebase_uid`.
- **Daily:** stats day Oct 26, 2026 (test-2026, week 4, inning 1).
- **Weekly:** the week of Oct 19-25 (test-2026, week 3).

**Not executed:** the tables don't exist yet.

### Daily, stats day 2026-10-26

```sql
-- 0. Ready? No row: wait 5 minutes and check again. Never skip.
SELECT ready_at FROM edition_ready
 WHERE cadence = 'daily' AND period_start = DATE '2026-10-26';

-- 1. The recipient.
SELECT firebase_uid, email, plan, home_hsid::int AS home_hsid
  FROM user_profiles WHERE firebase_uid = $1;

-- 2. Favorites' lines. "No favorites" = user_favorites has no rows for $1.
SELECT l.stats_date, l.stat_line_id, l.line
  FROM daily_stat_lines l
 WHERE l.stats_date = DATE '2026-10-26'
   AND l.playerid IN (SELECT f.playerid::text FROM user_favorites f WHERE f.firebase_uid = $1)
 ORDER BY l.sort_key;

-- 3. The home school's story.
SELECT * FROM daily_game_stories
 WHERE stats_date = DATE '2026-10-26' AND hsid = 5004;

-- 4. Scoreboard, home slot.
SELECT * FROM daily_game_scores
 WHERE stats_date = DATE '2026-10-26' AND 5004 IN (home_hsid, away_hsid);

-- 5. Scoreboard, the fan's picks in order. A NULL game = no game today.
--    Skip any game already on the board (section 5, step 4).
SELECT p.position, p.hsid, p.label, g.*
  FROM user_scoreboard_schools p
  LEFT JOIN daily_game_scores g
    ON g.stats_date = DATE '2026-10-26' AND p.hsid IN (g.home_hsid, g.away_hsid)
 WHERE p.firebase_uid = $1
 ORDER BY p.position;
```

### Weekly, week of 2026-10-19

```sql
-- 0. Ready?
SELECT season_key, week, period_end, ready_at FROM edition_ready
 WHERE cadence = 'weekly' AND period_start = DATE '2026-10-19';
-- -> test-2026, 3, 2026-10-25

-- 1. The full home roster.
SELECT playerid, line FROM weekly_player_lines
 WHERE period_start = DATE '2026-10-19' AND hsid = 5004
 ORDER BY sort_key;

-- 2. The home game's box score.
SELECT * FROM weekly_box_scores
 WHERE season_key = 'test-2026' AND week = 3 AND 5004 IN (home_hsid, away_hsid);

-- 3. The recap (if Pete wants it in the Weekly).
SELECT title, story, shout_outs FROM daily_game_stories
 WHERE stats_date = DATE '2026-10-25' AND hsid = 5004 AND is_final;

-- 4. Scores around the league: the home game's region.
SELECT b.game_id, b.score_line, b.decision
  FROM weekly_box_scores b
 WHERE b.season_key = 'test-2026' AND b.week = 3
   AND b.region = (SELECT region FROM weekly_box_scores
                    WHERE season_key = 'test-2026' AND week = 3 AND 5004 IN (home_hsid, away_hsid))
 ORDER BY b.game_id;
```

## 14. Open items (Pete and Claude, not the newsletter)

1. **Claude's builds, each needing Pete's go:**
   - create the section 4 tables (empty first, then filled);
   - the pipeline job that fills them;
   - the pick page;
   - schedule the results job.
2. **Where the newsletter's own tables live:** `tribune_private.*` (sponsors,
   settings, notes, sent copies, deliveries). They aren't in this production
   database.
3. **The pick page's address,** for the email's link: set when it's built.
4. **For Pete to approve:**
   - the Weekly line format (4.7);
   - the box score columns (4.6);
   - whether the Weekly prints the recap (6.4);
   - how many league scores to print (6.5).
