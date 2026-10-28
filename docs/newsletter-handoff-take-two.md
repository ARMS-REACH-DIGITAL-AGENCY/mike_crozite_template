# Newsletter handoff, take two (Oct 27, 2026)

For the newsletter team (ChatGPT, with Manus advising), from Claude, built
on Pete's decisions. **This replaces the first handoff completely.** The
first one described only what exists today. It led everyone back to the old
approach, where the newsletter reads raw stats and scores games itself. That
approach is dropped.

The rules behind this contract are in `docs/decisions-2026-10-27.md`. Pete
decides, not this file.

**Status of this document (updated Oct 27, evening):**
- It is a contract. The publication tables in section 4 exist in
  production and hold one finished Daily (stats day 2026-10-26) and one
  finished Weekly (test-2026 week 3, Oct 19-25), each with its ready row.
  They were written by a manual run of `scripts/newsletter-publish.ts`,
  with Pete's go. There is no schedule.
- The section 13 queries have been run, by `scripts/newsletter-preview.ts`,
  for the 14 test previews (`docs/newsletter-publication-run-2026-10-27.md`).

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
| The 7 tables in section 4 | **Created** (Oct 27, with Pete's go; `migrations/20261027_newsletter_publication_tables.sql`). The guard and the corrections log are in place, and the newsletter role has SELECT only. **One Daily and one Weekly are published** (2 ready rows; see the run report). `user_scoreboard_schools` is empty: no fan has picked yet. |
| The old `public.daily_stat_lines` | **Replaced.** It was an older, empty, unused table with a different layout. The migration dropped it only because it had 0 rows. |
| `newsletter_recipients`, `newsletter_favorites` (views) | **Created** (Oct 27, with Pete's go; `migrations/20261027_newsletter_reads_fans.sql`). All seven test recipients resolve with their home school and favorites. |
| The pipeline job that writes them | **Built, run by hand** (`scripts/newsletter-publish.ts`). Not scheduled; scheduling needs Pete's go. |
| A preview reader and renderer | **Built** (`scripts/newsletter-preview.ts`): the section 13 queries as the newsletter role, printed as HTML and text. A reference for the newsletter's own renderer; it never sends. |
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

**The pipeline's schedule** (proposed; Pete turns it on):
- **When it runs:** a GitHub Actions workflow at **11:05 UTC** every day
  (4:05 a.m. Arizona), just after the cutoff.
  - The raw stats load all day: MLB's feed every 10 minutes, plus a full
    re-sync every 4 hours.
  - What counts is what was in by 11:00 UTC.
- **How long it takes:** measured on the test season before the schedule
  goes on. The target is under 10 minutes.
- **If it runs late:** the rows come out the same.
  - The pipeline keeps each stat line's history, and it builds the day from
    the lines as they stood at the cutoff, not as they are when it happens
    to run.
  - The newsletter just waits for the ready row.
- **If it fails:** it retries every 15 minutes until the ready row is
  written. A rerun after a failure writes nothing twice.
- **How Pete hears about a failure:** GitHub's failed-run email, plus a
  `needs_decision` row (`kind = 'edition_late'`). If Pete wants a text or a
  direct email instead, he says so.
- **Which ready row the newsletter uses:** each `(cadence, period_start)`
  it hasn't sent yet, oldest first.
- **Corrections:** by Pete's rule there are no corrected versions (section
  9).

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
  PRIMARY KEY (stats_date, hsid, region, game_id)
);
```

- **Row identity:** `(stats_date, hsid, region, game_id)`. Every game gets
  two rows a day, one from each school's side, about its own players.
  - A fan follows **one season** (one bracket), so the newsletter reads only
    that bracket's rows: `season_key` and `region` always go with `hsid`.
    In 2027 a school is in one bracket and plays one game a week.
  - **The October test is six separate test seasons** stored as Regions 1-6
    of `test-2026`. Each is its own tournament; a school in two of them
    (Hamilton is in Test Seasons 1 and 6) is two separate entries. Each
    test fan follows one: test1@yatstats.com Test Season 1 ...
    test6@yatstats.com Test Season 6 (Pete, Oct 27). Never combine them.
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
  line_score           jsonb    NOT NULL,
  home_batting         jsonb    NOT NULL,
  away_batting         jsonb    NOT NULL,
  home_pitching        jsonb    NOT NULL,
  away_pitching        jsonb    NOT NULL,
  extra_base_hits      jsonb    NOT NULL,  -- {"home":["2B: Smith (Rays, MLB) 2, Jones (Ducks, NCAA-D1)","HR: Smith (Rays, MLB) 2"],"away":[...]}
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
  team_name    text     NOT NULL,  -- the player's latest team that week: "Tampa Bay Rays"
  team_short   text     NOT NULL,  -- "Rays"
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
  - **The Oct 27 manual run wrote the 69 test-field schools only** (all
    seven test recipients' schools are in the field). Every school comes
    with the scheduled job.
- The roster is the bracket's own rule: the current alumni statuses, with no
  high school players.
- `line` follows the Daily style for the week. As written on Oct 27:
  - `Jacob Misiorowski (Brewers, MLB): 5.0 IP, 4 H, 1 ER, 1 BB, 3 K, 1-0`
  - `Pascanel Ferreras (Gigantes del Cibao, INTERNATIONAL): 0-for-4`
  - `Lucas Williams (Gwinnett Stripers, TRIPLE-A): Did not play`
  - a player whose card has no team or no official level prints what is
    known: `Jake Wong (DOUBLE-A): Did not play`, `Max Gieg: Did not play`.

  Pete approves the format.

## 5. The Daily Digest: which rows

**Inputs:**
- the recipient's `firebase_uid`;
- their `home_hsid` (from `newsletter_recipients`);
- `D`, the `period_start` of a daily `edition_ready` row.

Send each daily ready row once to each eligible recipient. Who's eligible
(plans, subscriptions, unsubscribes, the approval gate) is the newsletter's
existing logic; this contract doesn't change it.

1. **Wait** for `edition_ready (cadence 'daily', period_start D)`.
2. **Favorites' stat lines:**
   - all `daily_stat_lines` with `stats_date = D` whose `playerid` is one of
     the recipient's `newsletter_favorites`, in `sort_key` order;
   - the same rule for fans and superfans, with no home roster;
   - **no favorites at all:** print "You haven't picked any favorites yet"
     and a link to pick some;
   - **favorites, zero rows:** print "None of your players were in action
     yesterday."
3. **The home school's game story:** the `daily_game_stories` row for
   `(D, home_hsid)` in the fan's own season and bracket (4.3). At most one.
   If there's no row, leave out the section.
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

## 6. The YAT-A-BOY Weekly Tribune: which rows

**Inputs:**
- the recipient's `firebase_uid` and `home_hsid`;
- `M`, the Monday that is the weekly ready row's `period_start` (the week
  that just ended);
- the ready row's `season_key` and `week`.

1. **Wait** for `edition_ready (cadence 'weekly', period_start M)`.
2. **The full home roster:** `weekly_player_lines` for `(M, home_hsid)`,
   in `sort_key` order.
3. **The home game's box score:** the `weekly_box_scores` row for
   `(season_key, week)` in the fan's own bracket (`region`), with
   `home_hsid` in `(home_hsid, away_hsid)`. At most one. If there's none,
   leave out the section.
4. **The recap** (optional; Pete decides whether the Weekly prints it): the
   home school's final story, `daily_game_stories` for
   `(period_end, home_hsid)` with `is_final`.
5. **Scores around the league:** the `master_bracket` rows for that week in
   the home game's `region`, `status = 'final' AND locked_at IS NOT NULL`
   (query in section 13).
   - Print the school names and runs.
   - When `decided_by = 'commissioner'`, print "Commissioner's decision"
     and nothing more.
   - A weekly ready row means every game of the week is final and locked.
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
- **`tribune_private` has no tables in this production database** (checked
  Oct 27). The Tribune connects with `TRIBUNE_DATABASE_URL`, and where that
  points hasn't been checked. Where these tables live is Pete's decision
  (section 14).
- **The sponsor tables in production `public`** (columns checked Oct 27):

| Table | Columns |
|---|---|
| `sponsor_brands` | `id`, `slug`, `name`, `logo_url`, `website_url`, `external_partner_id`, `is_active`, `created_at`, `updated_at` |
| `school_splash_sponsorships` | `id`, `hsid`, `sponsor_id`, `sponsor_order_id`, `status`, `priority`, `starts_at`, `ends_at`, `source`, `created_at`, `updated_at` |
| `v_school_splash_sponsor_assignments` (view) | `assignment_id`, `hsid`, `sponsor_id`, `sponsor_slug`, `sponsor_name`, `logo_url`, `website_url`, `sponsor_order_id`, `status`, `priority`, `starts_at`, `ends_at`, `source`, `created_at`, `updated_at`, `serving_now` |
| `microsite_sponsors` | `id`, `hsid`, `sponsor_name`, `sponsor_image_url`, `sponsor_link_url`, `sponsor_label`, `placement`, `is_active`, `display_order`, `starts_at`, `ends_at`, `created_at`, `updated_at` |
| `player_profile_sponsors` | `id`, `playerid`, `hsid`, `sponsor_name`, `sponsor_image_url`, `sponsor_link_url`, `sponsor_message`, `sponsor_label`, `is_active`, `starts_at`, `ends_at`, `created_at`, `updated_at` |
| `sponsor_orders` | `id`, `sponsorship_type`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `hsid`, `playerid`, `purchaser_name`, `purchaser_email`, `sponsor_name`, `sponsor_link_url`, `sponsor_message`, `uploaded_image_url`, `status`, `created_at`, `updated_at` |

- None of these has a newsletter cadence, a creative version, disclosure
  text, or an annual-versus-weekly assignment. Those exist only in the
  Tribune branch's `tribune_private` design.
- Which sponsor tables are authoritative for the newsletter is the
  newsletter team's proposal, for Pete to approve. The newsletter role can't
  read any of them today (section 11).

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
- **The database enforces it.** The trigger `publication_guard` rejects any
  update or delete of a published row.
- **A mistake found later** in a frozen row:
  - It's fixed only if Pete orders it. The transaction must set
    `publication.unlock = 'on'` and a `publication.reason`.
  - The old and new row go into `publication_corrections`, so the original
    edition can always be rebuilt.
  - A sent email is never resent or changed.
  - The newsletter doesn't read the log.
- **ChatGPT proposed** that a correction create a new versioned set of rows
  and a new ready row. Pete's rule is that nothing changes after the
  cutoff, so this document has no versions. That's Pete's call
  (section 14).
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
  - `daily_game_stories (stats_date, hsid, region, game_id)`;
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
| **Newsletter runtime** (`yatstats_tribune_app`) | **SELECT only** on every table in section 4, `master_bracket`, `fantasy_active_season`, and the views `newsletter_recipients` and `newsletter_favorites`. **No write** to any of them. |
| **Newsletter runtime**, its own tables | Writes its sent copies, deliveries and attempts, and reads its preferences. It doesn't write the approval gate or `alumni_newsletter_control`. |

- The SELECT grants on the new tables come with their creation.
- `yatstats_tribune_app` already reads `master_bracket` and the stat
  tables.
- **Checked Oct 27:** `yatstats_tribune_app` can read `master_bracket` and
  `fantasy_active_season`. It **can't** read `user_profiles`,
  `user_favorites` or the sponsor tables. (The production pilot reads them
  through the app's main connection.)
  - **Fan data comes through two narrow views, not the tables:**
    - `newsletter_recipients`: `firebase_uid`, `email`, `first_name`,
      `home_hsid`, `home_school_name`, `plan` and `is_superfan` (the
      pilot's own rule).
    - `newsletter_favorites`: `firebase_uid`, `playerid`.
  - `user_profiles` also holds Stripe and HighLevel ids, promo codes and
    roles, and the newsletter gets none of those. The views are in
    `migrations/20261027_newsletter_reads_fans.sql`, for Pete to approve.
  - Sponsor grants wait for the sponsor decision (section 8).

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

**Run on Oct 27** by `scripts/newsletter-preview.ts`, as the newsletter's
read-only role, for the 14 test previews.

### Daily, stats day 2026-10-26

```sql
-- 0. Ready? No row: wait 5 minutes and check again. Never skip.
SELECT ready_at FROM edition_ready
 WHERE cadence = 'daily' AND period_start = DATE '2026-10-26';

-- 1. The recipient.
SELECT firebase_uid, email, first_name, plan, is_superfan, home_hsid::int AS home_hsid
  FROM newsletter_recipients WHERE firebase_uid = $1;

-- 2. Favorites' lines. "No favorites" = newsletter_favorites has no rows for $1.
SELECT l.stats_date, l.stat_line_id, l.line
  FROM daily_stat_lines l
 WHERE l.stats_date = DATE '2026-10-26'
   AND l.playerid IN (SELECT f.playerid FROM newsletter_favorites f WHERE f.firebase_uid = $1)
 ORDER BY l.sort_key;

-- 3. The home school's story, in the fan's own bracket (test1: Test Season 1 = region 1).
SELECT * FROM daily_game_stories
 WHERE stats_date = DATE '2026-10-26' AND hsid = 5004
   AND season_key = 'test-2026' AND region = 1;

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

-- 4. Scores around the league: the home game's region, final and locked.
SELECT m.home_school_name, m.home_runs, m.away_school_name, m.away_runs, m.decided_by
  FROM master_bracket m
 WHERE m.season_key = 'test-2026' AND m.stage = 'bracket' AND m.week = 3
   AND m.region = (SELECT region FROM weekly_box_scores
                    WHERE season_key = 'test-2026' AND week = 3 AND 5004 IN (home_hsid, away_hsid))
   AND m.status = 'final' AND m.locked_at IS NOT NULL
 ORDER BY m.series_no, m.game_no;
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
   - applying `migrations/20261027_newsletter_publication_tables.sql`. It
     creates the 7 tables, the guard and the corrections log, and replaces
     the old, empty `daily_stat_lines`;
   - applying `migrations/20261027_newsletter_reads_fans.sql`, which creates
     the two fan views the newsletter role can read;
   - whether a correction makes a new version (section 9);
   - the Weekly line format (4.7);
   - the box score columns (4.6);
   - whether the Weekly prints the recap (6.4);
   - how many league scores to print (6.5).
