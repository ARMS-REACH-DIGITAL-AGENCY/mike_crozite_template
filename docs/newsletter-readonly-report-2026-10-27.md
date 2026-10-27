# Newsletter tables: read-only report (Oct 27, 2026)

> **Update, later Oct 27: applied with Pete's go.** Both migrations were
> applied to production, each as one transaction:
> - `migrations/20261027_newsletter_publication_tables.sql`
> - `migrations/20261027_newsletter_reads_fans.sql`
>
> Checked afterwards:
> - **The tables:** all seven exist, owned by `neondb_owner`, with **0 rows**.
>   `daily_stat_lines` has the contract's layout, and the old empty table is
>   gone.
> - **The guard:** 12 guard and log triggers are in place.
> - **The newsletter role:** it has SELECT on the seven tables and on the
>   two views, and no INSERT anywhere. It can't read `user_profiles`,
>   `user_favorites` or `publication_corrections`.
> - **The site role:** `authenticated` has no access.
> - **The test recipients:** all seven resolve through
>   `newsletter_recipients`, as superfans with their home school, and
>   `newsletter_favorites` gives their favorites (40, 6, 19, 17, 19, 18
>   and 4).
>
> Not applied (they need separate decisions):
> - the optional revoke of raw-stat reads (section 8);
> - any sponsor grant.
>
> The report below is the state before the apply.

Checked against production by read-only queries on Oct 27, 2026:
- Neon project `round-recipe-12286668`;
- branch `main` (`br-polished-lab-a4i35u5j`);
- database `neondb`, schema `public`.

**Nothing in production was changed for this report.** The draft SQL was
tested only on a throwaway local PostgreSQL 16 database, which was deleted
afterwards.

The contract this checks against is `docs/newsletter-handoff-take-two.md`.

---

## 1. `public.daily_stat_lines` as it exists now

**Table** (relkind `r`), owner `neondb_owner`, **0 rows**.

| column | type | not null | default |
|---|---|---|---|
| `game_id` | integer | yes | |
| `week` | integer | yes | |
| `day` | integer | yes | |
| `hsid` | integer | yes | |
| `team_name` | text | yes | |
| `opponent_hsid` | integer | yes | |
| `playerid` | text | yes | |
| `firstname` | text | yes | |
| `lastname` | text | yes | |
| `stat_type` | text | yes | |
| `ab` | integer | no | `0` |
| `h` | integer | no | `0` |
| `doubles` | integer | no | `0` |
| `triples` | integer | no | `0` |
| `hr` | integer | no | `0` |
| `bb` | integer | no | `0` |
| `hbp` | integer | no | `0` |
| `sf` | integer | no | `0` |
| `ops` | numeric(6,3) | no | |
| `ip_outs` | integer | no | `0` |
| `hr_allowed` | integer | no | `0` |
| `bb_allowed` | integer | no | `0` |
| `hbp_allowed` | integer | no | `0` |
| `so` | integer | no | `0` |
| `fip` | numeric(6,2) | no | |
| `created_at` | timestamptz | no | `now()` |

| | |
|---|---|
| Primary key | `daily_stat_lines_pk PRIMARY KEY (game_id, day, playerid, stat_type)` |
| Check constraints | `daily_stat_lines_stat_type_check CHECK (stat_type = ANY (ARRAY['BATTING','PITCHING']))` |
| Unique constraints | none besides the primary key |
| Indexes | `CREATE UNIQUE INDEX daily_stat_lines_pk ON public.daily_stat_lines USING btree (game_id, day, playerid, stat_type)` (the primary key's) |
| Triggers | none |
| Row-level security | off (`relrowsecurity = false`, `relforcerowsecurity = false`); no policies |
| Depended on by | no views, no functions (no function body names it) |
| Used by code | no file on any branch fetched here names it |

## 2. Is it the contract's table?

**No.** It's an older, unrelated table that happens to have the same name.
- It holds raw per-day counting stats with `ops` and `fip`, keyed by
  `game_id` and `day`, from an earlier bracket design.
- It has no `stats_date`, no `line`, no `sort_key`, no `level`, no
  `opponent_name` and no `player_name`.
- It's empty, and nothing reads or writes it.

## 3. Owner and grants on the old `public.daily_stat_lines`

ACL: `{neondb_owner=arwdDxtm/neondb_owner, authenticated=arwd/neondb_owner, authenticator=arwd/neondb_owner}`

| role | privileges |
|---|---|
| `neondb_owner` (owner) | all (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) |
| `authenticated` | SELECT, INSERT, UPDATE, DELETE |
| `authenticator` | SELECT, INSERT, UPDATE, DELETE |
| `yatstats_tribune_app` | **none** |
| `PUBLIC` | none |

## 4. Rows and dates in the old table

- **0 rows.**
- It has no `stats_date` column, so there's no minimum or maximum date and
  no count by date.
- It has no `line` column, so it holds no display-ready text.

## 5. The seven contract tables in production

| table | status |
|---|---|
| `public.edition_ready` | **missing** |
| `public.daily_stat_lines` | **present but incompatible** (the old table above) |
| `public.daily_game_stories` | **missing** |
| `public.daily_game_scores` | **missing** |
| `public.user_scoreboard_schools` | **missing** |
| `public.weekly_box_scores` | **missing** |
| `public.weekly_player_lines` | **missing** |

The two built objects the contract also reads are present:
`public.master_bracket` and `public.fantasy_active_season`.

## 6. The SQL drafts (not applied)

- **`migrations/20261027_newsletter_publication_tables.sql`:**
  - **The old table:** drops the old `daily_stat_lines` **only if it has
    the old layout and 0 rows**. Otherwise it raises an error and changes
    nothing.
  - **New tables:** creates the seven tables as in the contract, plus
    `publication_corrections`.
  - **Frozen rows:** the `publication_guard` trigger refuses any update or
    delete of a published row unless the transaction sets
    `publication.unlock = 'on'` and a `publication.reason`. The
    `publication_log` trigger records the old and new row in
    `publication_corrections`.
  - **Access:** resets every grant on the new objects (section 8).
- **`migrations/20261027_newsletter_reads_fans.sql`:** creates the two
  narrow fan views `newsletter_recipients` and `newsletter_favorites`
  (section 9).

## 7. What the drafts would touch in production

**Removed** (by the guarded drop of the empty old table):
- table `public.daily_stat_lines` (old layout, 0 rows);
- its constraints `daily_stat_lines_pk` and `daily_stat_lines_stat_type_check`;
- its index `daily_stat_lines_pk`;
- its grants: `authenticated` and `authenticator` SELECT, INSERT, UPDATE and
  DELETE.

No view, function, trigger, policy or code depends on it.

**Created:**
- **Tables:**
  - `edition_ready`
  - `daily_stat_lines` (new layout)
  - `daily_game_stories`
  - `daily_game_scores`
  - `user_scoreboard_schools`
  - `weekly_box_scores`
  - `weekly_player_lines`
  - `publication_corrections`, with sequence `publication_corrections_id_seq`
- **Indexes:**
  - each table's primary key;
  - the `user_scoreboard_schools (firebase_uid, hsid)` unique index;
  - `daily_stat_lines_player_idx`;
  - `daily_game_scores_home_idx` and `daily_game_scores_away_idx`;
  - `weekly_box_scores_week_idx`;
  - `weekly_player_lines_week_idx`.
- **Functions:** `publication_guard()` and `publication_log()`.
- **Triggers:** `<table>_guard` and `<table>_log` on the six pipeline
  tables.
- **Views:** `newsletter_recipients` and `newsletter_favorites`.
- **Foreign keys:** from `season_key` to `fantasy_seasons(season_key)`.
  - Adding them briefly locks `fantasy_seasons`, which has 2 rows.
  - Afterwards, a season can't be deleted while publication rows point at
    it.

**Name conflicts:** none. None of the new table, index, view, sequence or
function names exist in production today.

**Production's default grants for new objects in `public`:**

| new object | gets by default |
|---|---|
| tables and views | `authenticator` SELECT; `authenticated` SELECT, INSERT, UPDATE, DELETE |
| sequences | `authenticated` USAGE |
| functions | `authenticated` EXECUTE |

The drafts revoke these on every new table, view and sequence, then grant
exactly section 8. The two trigger functions keep the default EXECUTE,
which is harmless: a trigger function can't be called directly.

**Existing objects:** no other table's data, constraints or grants change.
The local test compared them before and after.

## 8. The minimum grants for `yatstats_tribune_app`

The role today:
- can log in;
- isn't a superuser and doesn't bypass row-level security;
- belongs to no other roles;
- has USAGE on `public`, without CREATE.

It already has SELECT on `master_bracket`, `master_bracket_series`,
`master_bracket_history`, `fantasy_seasons`, `fantasy_active_season`,
`commissioner_rulings`, `needs_decision`, `stat_lines`,
`stat_lines_ready`, `v_school_stat_lines`, `stat_line_holds` and
`stat_line_load_errors`.

**Needed:**
1. **Finished rows:** SELECT on `edition_ready`, `daily_stat_lines`,
   `daily_game_stories`, `daily_game_scores`, `user_scoreboard_schools`,
   `weekly_box_scores` and `weekly_player_lines`. This is in the tables
   draft. `master_bracket` and `fantasy_active_season` are already granted.
2. **Recipients and favorites:** SELECT on the views
   `newsletter_recipients` and `newsletter_favorites` only. This is in the
   fan-views draft. There's no grant on `user_profiles` or
   `user_favorites`.
3. **Sponsors, only if Pete picks the school splash sponsorships as the
   newsletter's sponsor:** SELECT on `v_school_splash_sponsor_assignments`.
   That one view already carries the sponsor name, logo, link, dates,
   priority and `serving_now`. Not drafted as a file until Pete decides:

   ```sql
   GRANT SELECT ON public.v_school_splash_sponsor_assignments TO yatstats_tribune_app;
   ```

**Recommended, to enforce "the newsletter never reads raw stats"** (Pete's
call; not in a file):

```sql
REVOKE SELECT ON public.stat_lines, public.stat_lines_ready, public.v_school_stat_lines,
  public.stat_line_holds, public.stat_line_load_errors, public.commissioner_rulings,
  public.needs_decision, public.master_bracket_history
  FROM yatstats_tribune_app;
```

No write grant anywhere: no INSERT, UPDATE or DELETE on any result or
publication table.

## 9. Fan data: direct grants or a restricted view?

**Recommendation: the two restricted views,** not direct SELECT on the
tables and not a security-definer function.

- **Direct SELECT is too wide.** `user_profiles` also holds
  `stripe_customer_id`, `stripe_subscription_id`, `arms_contact_id`,
  `arms_location_id`, `promo_code`, `role` and `last_name`, and
  row-level security is off. A table grant hands all of that to the
  newsletter.
- **Column-level grants would work,** but the newsletter also needs to know
  who is a superfan. That takes the Stripe, promo and status columns, and a
  later table-wide GRANT would silently widen access.
- **A security-definer function** adds code, a `search_path` risk and
  calls the newsletter has to make, for no gain over a view.
- **The views** (owned by `neondb_owner`, so they read with the owner's
  rights) expose only:
  - `firebase_uid`, `email`, `first_name`, `home_hsid`, `home_school_name`,
    `plan` and `is_superfan`;
  - `firebase_uid` and `playerid`.

  `is_superfan` is computed in the database with exactly the Daily pilot's
  rule (`isSuperfan` in `src/app/api/admin/fan-newsletter-pilot/route.ts`),
  so the newsletter never sees Stripe or promo data.

The exact SQL is `migrations/20261027_newsletter_reads_fans.sql`.

## 10. Production changes

**Since the newsletter take-two work began, I made no production changes.**
Everything since then has been read-only queries and files on the branch
`ccr-0ad18095-umgndf`.

Earlier on Oct 27, with Pete's go each time, I made these production
database changes:

| change | what |
|---|---|
| `migrations/20261027_stat_lines_landing.sql` | created the stat landing tables, views, functions and triggers; loaded 106,720 stat lines from `player_game_logs` |
| `migrations/20261027_master_bracket.sql` | created `fantasy_seasons`, `master_bracket`, `master_bracket_history`, `commissioner_rulings`, `needs_decision` and the views; granted SELECT to `authenticator` and `yatstats_tribune_app`, and UPDATE on `master_bracket` plus INSERT/UPDATE on `needs_decision` to `authenticator` |
| `migrations/20261027_mlb_feed_teams.sql` | team rows the landing table needs for MLB's feed |
| Bracket data | both seasons' schedules (3,347 games); test-2026 Round 1 results (144 finals, locked) and Round 2 pairings; 21 `commissioner_rulings` rows; 216 `master_bracket_history` rows |
| `migrations/20261027_high_school_teams_all_schools.sql` | high school team rows (team id C + hsid) for every school |
| `migrations/20261027_yat_playerid_sequence.sql` | the YAT player id sequence (next id YAT210001) |

**Not changed by me today:**
- **Schedules:** none created or changed. The results workflow exists only
  on the unmerged branch `feature/newsletter-staging-results`, and GitHub
  doesn't run schedules from non-default branches.
- **Environment variables:** none. I only read the list of names.
- **Production deploys:** none from me.

**The production site branch did move today.** `Easter-NEWS` went from
`8c257479` to `e7b654e7` when PR #584 (Instagram News fixes) was merged at
10:56 UTC. As far as my notes show, that wasn't work from this session.

## 11. Local test of the drafts

The test ran on a throwaway PostgreSQL 16 database set up like production:
- the same three roles;
- production's default grants for new tables, sequences and functions;
- the old `daily_stat_lines`, with its exact constraints;
- a `user_profiles` and `user_favorites` with the real columns, and six
  sample fans.

| check | result |
|---|---|
| Runs twice without error (tables draft, fan-views draft) | **pass** |
| Drops the old table only while it's empty | **pass** |
| Refuses unsafe replacement: with a row in the old table it raised "The old public.daily_stat_lines has rows; stopping so nothing is lost", and the row and layout were kept | **pass** |
| Keeps other tables' data, constraints and grants (compared before and after) | **pass** |
| The newsletter role reads the publication tables and the views | **pass** |
| The newsletter role is refused on `user_profiles` itself ("permission denied") | **pass** |
| The newsletter role is refused on writes ("permission denied for table daily_stat_lines") | **pass** |
| Update or delete of a published row without unlock: refused | **pass** |
| Unlock without a reason: refused | **pass** |
| Unlock with a reason: changed, with old and new rows logged in `publication_corrections` | **pass** |
| `is_superfan` matches the pilot's rule on six sample fans: plain superfan, active Stripe, cancelled, expired promo, past due, empty-string ids | **pass** |
| Grants after: tables `authenticator` SELECT (+ INSERT for the pipeline), `yatstats_tribune_app` SELECT; views `yatstats_tribune_app` SELECT only; `authenticated` nothing | **pass** |

## 12. Scope of this report

Production stayed as it was:
- no SQL applied;
- no deploy;
- no grant changes;
- no schedule changes;
- no email sent.

## Summary table

| table | status | owner | newsletter-role access | rows | date or week coverage | finished-row contract met | production action required | migration file |
|---|---|---|---|---|---|---|---|---|
| `public.edition_ready` | missing | n/a | none | n/a | n/a | no | create (Pete's go) | `migrations/20261027_newsletter_publication_tables.sql` |
| `public.daily_stat_lines` | incompatible (old, empty, unused) | `neondb_owner` | none | 0 | none (no date column) | no | replace while empty (Pete's go) | `migrations/20261027_newsletter_publication_tables.sql` |
| `public.daily_game_stories` | missing | n/a | none | n/a | n/a | no | create (Pete's go) | `migrations/20261027_newsletter_publication_tables.sql` |
| `public.daily_game_scores` | missing | n/a | none | n/a | n/a | no | create (Pete's go) | `migrations/20261027_newsletter_publication_tables.sql` |
| `public.user_scoreboard_schools` | missing | n/a | none | n/a | n/a | no | create (Pete's go) | `migrations/20261027_newsletter_publication_tables.sql` |
| `public.weekly_box_scores` | missing | n/a | none | n/a | n/a | no | create (Pete's go) | `migrations/20261027_newsletter_publication_tables.sql` |
| `public.weekly_player_lines` | missing | n/a | none | n/a | n/a | no | create (Pete's go) | `migrations/20261027_newsletter_publication_tables.sql` |

Creating the tables doesn't fill them. Filling them takes the pipeline job,
which isn't built yet. Until then, every table above stays empty, and no
`edition_ready` row means no edition can be sent.
