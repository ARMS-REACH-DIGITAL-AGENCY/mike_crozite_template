# Newsletter publication run, Oct 27, 2026

The first real Daily Digest and YAT-A-BOY Weekly Tribune content: the
pipeline run by hand, the publication tables filled with finished rows, and
14 previews for the seven test recipients. **Nothing was sent.** No
schedule, no merge, no HighLevel call.

The contract is `docs/newsletter-handoff-take-two.md`; Pete's rules are in
`docs/decisions-2026-10-27.md`.

> **Update (Pete, Oct 27): one test season per fan.** Each test bracket is
> its own season-long tournament. The previews are now **12, for six
> recipients**, and pcdaction@gmail.com gets none:
>
> - **test1@yatstats.com through test6@yatstats.com** each follow the test
>   season with their number (`--seasons`).
> - **Each preview reads only its own season's rows:** one game story and
>   one box score at most, and that bracket's 8 final scores.
> - **Where this report says otherwise,** this note wins: the two-bracket
>   rows in the tables below, item 13's "two games at once", and the seven
>   recipients.
> - **What didn't change:** the production rows. The pipeline already
>   scored and stored each bracket separately.
>
> | Recipient | Season | Daily: favorite lines, story, home game | Weekly: roster (did not play), box, league finals |
> |---|---|---|---|
> | test1 | Test Season 1, Hamilton | 1, 1, vs. Henry B. Plant | 47 (46), 1, 8 |
> | test2 | Test Season 2, St. John's Prep | 3, 0, none (out after Round 1) | 19 (19), 1, 8 |
> | test3 | Test Season 3, Grain Valley | 2, 1, vs. St. Pius X | 12 (11), 1, 8 |
> | test4 | Test Season 4, Saint John's | 5, 1, vs. Gulliver Prep | 15 (14), 1, 8 |
> | test5 | Test Season 5, Parkview | 4, 0, none (out after Round 1) | 24 (23), 1, 8 |
> | test6 | Test Season 6, Mira Costa | 1, 0, none (out after Round 1) | 20 (20), 1, 8 |

## 1. Branch and commits

Branch `ccr-0ad18095-umgndf`:
- `9b7ed679` the publication tables and fan views applied (Pete's go);
- `34c4cfc7` `stat_lines.source_level` in the official level names (Pete);
- `4f481db2` the pipeline, `scripts/newsletter-publish.ts`;
- the commit carrying this report: the preview reader and renderer
  (`scripts/newsletter-preview.ts`), the 14 previews
  (`docs/previews/2026-10-27/`), and the contract updates.

## 2. Commands

1. **Build the two editions** (offline; there is no direct database
   connection from the build machine):

   ```
   npx --yes tsx scripts/newsletter-publish.ts --dir <dir> --daily 2026-10-26 --week 3
   ```

   It writes `daily.json` (6 statements) and `weekly.json` (5 statements).
2. **Publish:** each file's statements run as **one transaction** in
   production (Neon `round-recipe-12286668`, branch `main`, database
   `neondb`).
   - Each transaction refuses to run if the edition already exists.
   - It checks every count before the ready row goes in last.
   - The Weekly's box-score insert also checks the md5 of its own data
     (`e5e832119d52fba90e7e091d6c66838c`), so a single changed character
     would have inserted nothing and rolled the whole edition back.
3. **Previews:**

   ```
   DATABASE_URL=<the newsletter's read-only role> npx --yes tsx scripts/newsletter-preview.ts \
     --daily 2026-10-26 --weekly 2026-10-19 --out docs/previews/2026-10-27 \
     --emails pcdaction@gmail.com,test1@yatstats.com,test2@yatstats.com,test3@yatstats.com,test4@yatstats.com,test5@yatstats.com,test6@yatstats.com
   ```

   - **How it ran today:** with no direct production connection, the
     script ran against a copy of the finished rows. It connected as a
     `yatstats_tribune_app` role with SELECT only.
   - **The copy matched production byte for byte.** Each table's
     checksum, computed in production and in the copy:

| Rows | md5 (production = copy) |
|---|---|
| `weekly_box_scores` (48) | `4d3f0f7deea79c2821a66bbf84a0a855` |
| `daily_game_stories` (48) | `937ab97a633fd1abca4d650931d82824` |
| `daily_game_scores` (24) | `d68e0455966ae0254486773daa0ded63` |
| `daily_stat_lines` (66) | `f1f25ddfd1bb66c9974abc552d4b0728` |
| `weekly_player_lines`, the six home schools (137) | `087838986a9caaac9f323c555f7bb9ac` |
| `newsletter_favorites`, the seven recipients (123) | `2c9acfe82ea89af2f7d53315dc75b4d4` |
| `master_bracket`, test-2026 week 3 (48) | `4ed815ef38e8ec1afc93c2d552862775` |

## 3. Sources and code

**The pipeline reads:**
- `master_bracket` (test-2026: locked results and the Round 2 pairings);
- `commissioner_rulings`;
- `stat_lines` joined to `player_game_logs`. A line counts only if it
  arrived by the cutoff (`player_game_logs.created_at`); the line's
  official level comes from its teamid;
- `flip_card_front_stage` (names, roster status, card level).

**It scores with the site's own code:**
- `scoreLive` (`src/components/bracket/liveSeason.ts`);
- `inningStory` (`src/components/bracket/dayStory.ts`);
- `shortName` (`src/components/bracket/gallery.tsx`);
- the commissioner rulings (`src/lib/bracket/commissioner.ts`);
- the calendar (`src/lib/bracket/tournamentCalendar.ts`).

**The previews read only:**
- the publication tables `edition_ready`, `daily_stat_lines`,
  `daily_game_stories`, `daily_game_scores`, `user_scoreboard_schools`,
  `weekly_box_scores` and `weekly_player_lines`;
- `master_bracket` (final and locked rows only);
- the views `newsletter_recipients` and `newsletter_favorites`.

## 4. Daily reporting date

**Stats day 2026-10-26** (test-2026, week 4: Round 2, Game 1 of 3,
through inning 1).
- **Why this day:** it is the most recent complete stats day. Its cutoff,
  2026-10-27 11:00 UTC (4 a.m. Arizona), had passed when it was published.

## 5. Weekly season and week

**test-2026, week 3: Oct 19-25** (Round 1, Game 3).
- **Why this week:** all 48 games are final and locked, and its cutoff was
  2026-10-26 11:00 UTC. It is the most recent complete week.
- **Week 4 is still being played** (24 games, through inning 1), so it
  isn't published.

## 6. Row counts (production, after the run)

| Table | Rows |
|---|---|
| `edition_ready` | 2 |
| `daily_stat_lines` | 66 (45 batting, 21 pitching; 65 MLB, 1 INTERNATIONAL) |
| `daily_game_stories` | 48 (two per game) |
| `daily_game_scores` | 24 |
| `user_scoreboard_schools` | 0 (no fan has picked yet) |
| `weekly_box_scores` | 48 |
| `weekly_player_lines` | 1,330 (all 69 schools in the test field) |
| `publication_corrections` | 0 |

## 7. Ready rows inserted: 2

| cadence | period | season, week | cutoff (UTC) | ready_at (UTC) | row_counts |
|---|---|---|---|---|---|
| daily | 2026-10-26 | test-2026, 4 | 2026-10-27 11:00 | 2026-10-27 17:10:06 | lines 66, scores 24, stories 48 |
| weekly | 2026-10-19 to 10-25 | test-2026, 3 | 2026-10-26 11:00 | 2026-10-27 18:28:05 | lines 1,330, boxes 48, schools 69 |

## 8. The seven recipients

All seven resolved in `newsletter_recipients`, each with plan `superfan`.

| Recipient | Home school | Favorites | Daily favorite lines | Daily stories | Scoreboard games | Weekly roster | Did not play | Box scores | League finals |
|---|---|---|---|---|---|---|---|---|---|
| pcdaction@gmail.com | 5004 Hamilton | 40 | 0 | 2 | 2 of 12 | 47 | 46 | 2 | 16 |
| test1@yatstats.com | 5004 Hamilton | 6 | 1 | 2 | 2 of 12 | 47 | 46 | 2 | 16 |
| test2@yatstats.com | 7737 St. John's Prep | 19 | 3 | 0 | 0 of 12 | 19 | 19 | 1 | 8 |
| test3@yatstats.com | 4895 Grain Valley | 17 | 2 | 1 | 1 of 12 | 12 | 11 | 2 | 16 |
| test4@yatstats.com | 7733 Saint John's | 19 | 5 | 2 | 2 of 12 | 15 | 14 | 2 | 16 |
| test5@yatstats.com | 1613 Parkview | 18 | 4 | 0 | 0 of 12 | 24 | 23 | 2 | 16 |
| test6@yatstats.com | 1546 Mira Costa | 4 | 1 | 1 | 1 of 12 | 20 | 20 | 2 | 16 |

## 9. HTML previews (14)

- `docs/previews/2026-10-27/daily/pcdaction-gmail-com.html`
- `docs/previews/2026-10-27/daily/test1-yatstats-com.html`
- `docs/previews/2026-10-27/daily/test2-yatstats-com.html`
- `docs/previews/2026-10-27/daily/test3-yatstats-com.html`
- `docs/previews/2026-10-27/daily/test4-yatstats-com.html`
- `docs/previews/2026-10-27/daily/test5-yatstats-com.html`
- `docs/previews/2026-10-27/daily/test6-yatstats-com.html`
- `docs/previews/2026-10-27/weekly/pcdaction-gmail-com.html`
- `docs/previews/2026-10-27/weekly/test1-yatstats-com.html`
- `docs/previews/2026-10-27/weekly/test2-yatstats-com.html`
- `docs/previews/2026-10-27/weekly/test3-yatstats-com.html`
- `docs/previews/2026-10-27/weekly/test4-yatstats-com.html`
- `docs/previews/2026-10-27/weekly/test5-yatstats-com.html`
- `docs/previews/2026-10-27/weekly/test6-yatstats-com.html`

`docs/previews/2026-10-27/index.html` lists all 14. `report.json` in the
same folder has each preview's subject, ready row, counts, warnings, and
the keys of every row it printed.

## 10. Plain-text previews (14)

The same 14 paths, each ending in `.txt` instead of `.html`.

## 11. Sponsor status

**Sponsor-incomplete: all 14.** No production sponsor source is usable
today (checked Oct 27):
- **`tribune_private`** has no tables in this database. That's where the
  Tribune branch's sponsorship, creative and settings tables would live.
- **`public.sponsor_brands`** has 0 active brands.
- **The six home schools** have no school splash sponsorship serving now
  and no active microsite sponsor.
- **The newsletter role** (`yatstats_tribune_app`) has no grant on any
  sponsor table.

**What's missing:**
1. Pete's decision on which sponsor tables are authoritative and where
   they live (handoff section 8).
2. The SELECT grant for the newsletter role.
3. Real sponsor rows.

**What the previews show:** a labeled empty slot ("SPONSOR SLOT: not
filled"). No sponsor is invented, and no fallback is used: Pete hasn't
approved one.

## 12. Missing content

- **The pick page:** it isn't built, so the "Pick your teams" link has no
  address.
- **Scoreboard picks:** none of the seven has saved any, so the 11 pick
  slots are blank under the invitation. Per Pete's note, the invitation
  now sits large on the board itself.
- **The Weekly recap story:** there is no final story for Oct 25, because
  the Daily stories start Oct 26. The optional recap section is left out.
- **Four roster lines** with no team or no official level on the player's
  card:
  - Miles Garrett (Parkview);
  - Max Gieg and Brady O'Brien (St. John's Prep);
  - Jake Wong (Hamilton: level, no team).

  They print what is known ("Jake Wong (DOUBLE-A): Did not play"). They
  belong to the pending fix of the blank-level cards.
- **Weekly coverage:** `weekly_player_lines` covers the 69 test-field
  schools, not every school. Every school comes with the scheduled job.
- **Fall League clubs print as MLB** (for example "Jake Cook (Mesa Solar
  Sox, MLB)"). That is correct: Pete's rule is that the Arizona Fall League
  is MLB-level exhibition play, like spring training. (An earlier version of
  this report wrongly listed it as an open question.)
- **`stat_lines.source_level` was empty on 1,193 lines** (921 Fall League,
  272 Mexican, Dominican and Venezuelan league lines). Their `level` column
  was right, but Pete wants no line without a level.
  `migrations/20261027_stat_lines_league_levels.sql` sets them to MLB and
  INTERNATIONAL and fixes the feed's view. It is written but **not applied
  yet**: the production database call is waiting on approval.
- **Home school names:** `newsletter_recipients.home_school_name` is empty
  for the six test profiles, so the previews take the name from the
  finished story or box score row. Pete's own profile reads "Hamilton
  (Chandler,  AZ)", with two spaces.

## 13. Recipient-specific limitations

- **Two games at once (test season only):** Hamilton (Regions 1 and 6),
  Grain Valley (3 and 4), Saint John's (2 and 4), Parkview (2 and 5) and
  Mira Costa (1 and 6) are each in two of the six test brackets.
  - **Daily:** the two stories print one after the other. The second home
    game takes scoreboard slot 1.
  - **Weekly:** both box scores print, with both regions' scores.
  - **In 2027 a school is in one bracket**, so this goes away.
- **No game on Oct 26:**
  - St. John's Prep and Parkview have no Round 2 game, so they get no Daily
    story and their home slot is blank.
  - Grain Valley and Mira Costa have a Round 2 game in one of their two
    brackets only.
- **Pete:** none of his 40 favorites played on Oct 26, so his Daily reads
  "None of your players were in action yesterday."
- **St. John's Prep:** all 19 rostered alumni did not play in week 3, and
  its box score has no alumni rows.

## 14. Finished rows only

**Yes.**
- **Only SELECTs:** every preview query is a SELECT of the publication
  tables, final and locked `master_bracket` rows and the two fan views.
- **A read-only role:** it ran as a role with SELECT only.
- **Identical to production:** the rows read match production byte for
  byte (item 2).

## 15. No computation in the newsletter

- **The newsletter code itself didn't run:** ChatGPT's renderer wasn't
  used. The Tribune branch's renderer reads other tables and isn't built
  for these.
- **The preview renderer is a reference:**
  - it prints each finished `line`, `story`, `title`, line score, box
    table and `decision` exactly as stored;
  - it adds only layout and dates;
  - its counts appear only in the yellow preview panel, never in the email.
- **None of these is computed by the renderer:** statistics, OPS+, FIP-,
  W-L, scores or results.

## 16. No schedule, merge or send

**Confirmed:**
- no recurring schedule;
- no merge to `Easter-NEWS`;
- no Vercel change;
- no HighLevel call;
- no email to anyone.

**Production writes in this run:** only the publication tables and their
2 ready rows.

## 17. The approval needed to send the 14 test emails

Pete's go, covering these five points:

1. **Send:** exactly these 14 editions (the Daily for 2026-10-26 and the
   Weekly for test-2026 week 3), once each, to exactly the seven addresses
   above.
   - Through HighLevel (`conversations/messages`), from
     `YAT?STATS Daily <daily@yatstats.com>`, as handoff section 12
     describes.
2. **Who sends:** the newsletter team's code, or a one-off send by Claude
   through the existing pilot sender.
3. **Sponsor:** send them sponsor-incomplete (with the empty slot left out),
   or approve a labeled fallback.
4. **Pick link:** until the page exists, it points to the homepage, or the
   button is left out.
5. **Where the sent copies go:** the `tribune_private` tables don't exist in
   this database. Name a place, or approve skipping the record for this
   test only.
