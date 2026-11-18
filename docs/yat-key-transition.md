# YAT ID key transition: map and plan

**Goal (Pete, Nov 18 2026):** the YAT ID becomes the key for every person on
the platform before the PrestoSports API is connected. The Baseball Cube (TBC)
playerid becomes one outside number attached in `yat_registry_ids`, like the
MLB ID: kept forever for reference and imports, never used as a key.

**Owner of this area during the transition:** one agent at a time, named in
the step table below. Any agent (Claude, Codex, ChatGPT) may continue the work,
following the rules in section 5.

Every fact here was measured on Nov 18 2026 (read-only queries and a repo
search). Groupings marked "first pass" were made by table name, and each table
is checked again when its step comes up.

---

## 1. The map

### 1.1 Database tables that hold a player number: 124

Two already have a `yatid` column: `flip_card_front_stage` and `player_game_logs`.

**C. Live tables that must key by YAT ID: 46 (first pass)**
flip_card_front_stage (207,640 rows), player_game_logs (188,475),
mlb_draft_picks_all (78,263; `matched_playerid`), player_draft_picks (48,540),
player_moment_players (48,500), player_moment_submissions (48,359),
player_profile_historical_stats_stage (44,811), mlb_person_profile (40,918),
player_source_map (40,599), player_team_stints (26,034),
player_transactions (25,816), mlb_debut_events (10,918),
sim_daily_pitching (7,423), fan_activity (3,694),
indy_iscore_player_source_map (3,272; `yatstats_playerid`),
player_current_team (1,696), news_articles (1,691), weekly_player_lines (1,330),
news_article_derivatives (352), sportsblaze_mlb_player_map (347; `yatstats_playerid`),
user_favorites (332), afl_current_roster_overlays (179), media_upload (136),
daily_stat_lines (66), news_tip_queue (56; `matched_playerid`), social_sources (39),
alumni_where_yat_now (3), player_school_profile, player_consent,
player_current_status, player_hsid_exclusion, sponsor_orders,
social_post_player_mentions, sim_daily_batting, player_hsid_metadata,
external_players (`yatstats_playerid`), player_identity_override,
connect_video_players, player_team_override, college_player_match_review
(`candidate_playerid_1..3`), alumni_where_yat_memory_tags, user_roles,
player_photos, tbc_flip_card_publication_holds, player_profile_sponsors,
missing_player_submission (`published_playerid`).
Row counts are Postgres estimates; tables without a count have not been
analyzed yet.

**A. Raw source and import data: 38 (keep the source's own number)**
These record what a source sent us, so they keep that source's number. The
link to the person is the registry.
tbc_players_full_feed_audit_rows (2,502,980), tbc_player_hsid_candidates
(2,502,268), tbc_complete_batting_history (501,242), mlb_org_roster_raw
(497,185), mlb_org_roster_resolution (495,436), tbc_complete_pitching_history
(438,097), tbc_players_raw (208,703), tbc_player_verified_school_links
(206,846), stat_lines (188,308), tbc_batting_raw (142,520),
tbc_batting_feed_snapshots, tbc_pitching_raw (115,013),
tbc_pitching_feed_snapshots, tbc_players_feed_snapshots,
tbc_players_landing_latest, tbc_verified_2026_participation (44,436),
tbc_batting/pitching_2026_season_raw, tbc_batting/pitching_landing_latest,
tbc_batting/pitching_daily_deltas, tbc_legacy_player_school_links,
indy_iscore_raw_payloads, indy_iscore_*_2026_season_raw,
indy_iscore_player_stats_raw, indy_iscore_player_game_stats_raw,
college_roster_players_raw, hamilton_all_time_import_stage,
hamilton_prototype_player_seed, pro_team_150_reference_2026,
school_player_profile_submission_raw, mlb_player_master_raw,
mlb_roster_snapshot_raw, official_college_batting_season_raw,
official_college_season_sources, sportsblaze_mlb_player_gamelogs.
*Check per table:* `tbc_verified_2026_participation`,
`tbc_player_verified_school_links` and `stat_lines` are read by live code and
may belong in group C.

**D. Change-history audit tables: 2 (keep as written)**
flip_card_stage_change_audit (508,506), contribution_change_audit (153,592).

**B. Dated backups and one-off copies: 38**
For example tbc_*_backup_*, *_baseline_*, flip_card_front_stage_backup_20261003,
yat_identity_cutover_backup_20261113. Not part of the transition. **PETE
DECIDES** whether to keep or archive them.

### 1.2 Database views, functions and triggers that refer to a player number

* **Views: 29.** hs_rosters_simple, newsletter_favorites,
  player_high_school_info_for_2025_season, player_hsids, player_next_game,
  player_seasons, player_source_crosswalk, stat_line_holds, stat_lines_ready,
  v_2026_college_player_team_candidates, v_2026_college_player_team_resolved,
  v_active_players, v_flip_card_college_coverage_audit,
  v_mlb_org_roster_unresolved, v_news_player_context,
  v_player_current_team_resolved, v_player_external_source_ids,
  v_player_hsids_verified_prepared, v_player_next_game_resolved,
  v_player_primary_team, v_player_teams_2025, v_player_upcoming_games,
  v_school_stat_lines, v_stat_lines_from_mlb, v_tbc_batting_all_seasons_resolved,
  v_tbc_pitching_all_seasons_resolved, vw_player_batting_seasons,
  vw_player_pitching_seasons, yat_bracket_unresolved_game_log_sources.
* **Functions: 20.** assign_game_log_yatid, audit_yatstats_media_changes,
  audit_yatstats_player_changes, compute_player_highest_level,
  prepare_tbc_player_hsid_candidates, prepare_tbc_verified_2026_participation,
  prepare_tbc_verified_school_links, promote_verified_tbc_player_raw_batch,
  publish_verified_tbc_flip_cards_batch, reconcile_auto_retired_2026_batch,
  reconcile_pending_tbc_2026_batch, record_flip_card_stage_field_changes,
  refresh_flip_card_front_stage, refresh_flip_card_front_stage_from_truth,
  refresh_flip_card_yatid_on_source_link, resolve_flip_card_yatid_on_identity_change,
  stat_lines_land_mlb, sync_game_log_yatid_on_verified_source,
  yat_auto_register_on_stage, yat_auto_register_tbc.
* **Triggers: 8.** yatstats_audit_stage_change, yatstats_stage_field_provenance,
  trg_stage_player_yatid, trg_yat_auto_register (on flip_card_front_stage);
  yatstats_audit_media_change (on media_upload); trg_assign_game_log_yatid
  (on player_game_logs); trg_yat_source_link_updates_stage,
  trg_sync_game_log_verified_yat (on yat_registry_ids).

### 1.3 Code that uses a player number (files containing playerid / player_id / playerId)

| Area | Files using the old number | Files already using the YAT ID |
|---|---|---|
| `src/app/api` (APIs) | 51 | 4 |
| `src/app` (pages, incl. APIs) | 65 | 6 |
| `src/components` | 71 | 3 |
| `src/lib` | 56 | 5 |
| `scripts` (imports, jobs, tests) | 75 | 6 |
| `.github/workflows` | 3 (of 45 that run a script) | 0 |
| `migrations` / `db` | 29 / 14 | 4 / 0 |

### 1.4 Stored photos (S3, bucket `yatstats-assets`)

Folders named by player number: `players/then`, `then-card`, `then-cutouts`,
`then-web`, `back`, `back-card`, `back-cutouts`, `back-web`, `back-archive`,
`now`, `now-thumb`, `now-cutouts`, `now-web`, `season-headshots`,
`season-photos`, `season-cutouts`, `connect-videos`, and the share pictures in
`share-previews/`.
**Not yet measured:** the number of files per folder. This session can't list
the bucket, so it needs a read-only GitHub job run, approved by Pete.

### 1.5 Already on the YAT ID

* Profile addresses (`/player/YAT…/name`), with old addresses forwarding (#809).
* Global search links and the sitemap.
* Automatic YAT IDs for new Baseball Cube players (database trigger, Nov 17).
* `flip_card_front_stage.yatid` and `player_game_logs.yatid` columns.

---

## 2. Decisions (all made, Nov 18 2026)

1. **Card key: DECIDED (Pete, Nov 18 2026).** The person = YAT ID; a card =
   YAT ID + hsid. Example: Greg Bordes, YAT000073, has a RETIRED player card
   at Dobson (hsid 2623, today keyed `55184`) and a COACH card at Hamilton
   (hsid 5004, today keyed `YAT000073`): `YAT000073 + 2623` and
   `YAT000073 + 5004`.
2. **Bracket: DECIDED (Pete, Nov 18 2026).** The bracket switches to YAT IDs
   before the 2027 tournament starts (Mon Feb 1, 2027,
   `src/lib/bracket/tournamentCalendar.ts`), after steps 3-5, once the
   before-and-after scoring test on the October test season matches exactly.
3. **Backups (group B): DECIDED (Pete, Nov 18 2026).** Keep every backup
   until the transition is finished and checked. Then archive the dated
   one-off copies: export each to S3 as a file, check the file, then remove
   the table from the database. A table a job still reads stays (e.g. check
   `tbc_*_feed_snapshots`, `*_baseline_yesterday`, `*_level_baselines`
   before touching them). From then on, no new dated backup tables in the
   live database: one-off backups go to S3 or a Neon restore point.
4. **One person, one YAT ID (Pete, Nov 18 2026; CLAUDE.md registry rule).**
   Already Pete's rule, not an open question. Madden Pezzorello got the first
   YAT ID (YAT000001) when TBC didn't have him; when TBC later added him
   (384172), a second card appeared. He is one person: 384172 is attached to
   YAT000001 in `yat_registry_ids`. Same for everyone: every person gets a
   YAT ID, and every outside number (TBC, MLB, Presto, ...) attaches to it.
   The card keyed `384172` (no high school) goes away in step 8 after
   everything pointing at 384172 moves to YAT000001.
5. **`player_source_map` (same rule).** Its links fold into
   `yat_registry_ids`, then it is retired (step 9).

---

## 3. The steps

Rules for every step: a test copy of the database first (Neon branch), the
site keeps working after each step, a test is added to the build, the step can
be undone, and nothing merges without Pete's approval.

| # | Step | Changes | Test | Undo | Status |
|---|---|---|---|---|---|
| 0 | Map (this file) | Nothing | - | - | Done, Nov 18 (Claude) |
| 0b | Count photos per S3 folder | Nothing (read-only job) | - | - | Not started; needs Pete's OK |
| 1 | Rules for all agents | `CLAUDE.md` + `AGENTS.md` point to this file | Review | Revert | Done in this PR (#817), Nov 18 (Claude) |
| 2 | Find people without a YAT ID | Nothing: count group-C rows whose number has no registry link | - | - | Done Nov 18 (Claude): every number linked; 4 leftovers below |
| 3 | Add `yatid` to every group-C table | Column + fill from registry + trigger for new rows. Nobody reads it yet. | Every row filled; site unchanged | Drop column | Not started |
| 4 | Site reads by YAT ID, one area per PR (profile, gallery/cards, search, favorites, news, stories, photos, social, transactions, sponsors) | App code | Preview + build guard for that area | Revert PR | Not started |
| 5 | Jobs and imports write the YAT ID (TBC sync, MLB roster sync, transactions, game logs, draft, news, contributions) | Scripts, workflows, functions | Run on test copy; compare outputs | Revert PR | Not started |
| 6 | Photos to YAT-ID names | Copy each file (keep the originals); uploads and cutout jobs write YAT names; site reads YAT names | Spot check + counts | Readers back to old names | Not started |
| 7 | Bracket on YAT IDs | Roster/stat tuples | Exact before-and-after scoring match | Revert | Not started; before Feb 1, 2027, after steps 3-5 (decision 2) |
| 8 | Card key change | `flip_card_front_stage` key per decision 1 | Full test copy | Restore | Not started; decision 1 made (YAT ID + hsid) |
| 9 | Retire the old key | The old number stays only as a source reference. Build guard: no new joins on it in group C. | Build | Revert | Not started |

---

## 4. Progress log

Each agent adds an entry when it starts or stops: date and time (UTC), agent,
step, branch, what was done, what is next.

* 2026-11-18, Claude: step 0 done. Map built from read-only queries and a repo
  search. Waiting on Pete: decisions in section 2, approval for steps 0b and 1.
* 2026-11-18, Claude: decision 1 recorded (card = YAT ID + hsid; person = YAT ID).
* 2026-11-18, Claude: decision 2 recorded (bracket on YAT IDs before Feb 1, 2027).
* 2026-11-18, Claude: decision 3 recorded (backups kept until the end, then archived to S3).
* 2026-11-18, Claude: step 2 done on the `claude-test` copy (live data,
  04:18 UTC). All 46 group-C tables checked (12 are empty). Every player
  number in them is a YAT ID or attached to one, and no outside number
  belongs to two people. Leftovers for Pete:
  1. `player_identity_override` has one unfinished row from May 3
     (`DJ_PLAYERID_HERE` / `MESQUITE_HSID_HERE`, DJ Barrett, "TBC wrongly
     links him to Hamilton; correct school is Mesquite"). DJ Barrett already
     has a Mesquite card (300720, YAT156556), so the row looks obsolete.
  2. Three cards have no high school: 384172 (Madden Pezzorello, YAT000001;
     his Hamilton card exists), YAT208675 (Jacopo Tamburini, from Beloit's
     2026 roster only) and 337041 (Zachary Johnston, YAT183847; TBC's text
     says "Hamilton (Chandler,AZ)" but there is no verified school link).
  3. Three people carry two TBC numbers each (TBC duplicates, correctly on
     one YAT ID): YAT040182, YAT056635, YAT057973.
  4. Two people have two cards: YAT000073 (Greg Bordes, Dobson + Hamilton)
     and YAT000001 (above).
* 2026-11-18, Claude: step 1 done (CLAUDE.md + AGENTS.md point here). Next: step 0b (photo count, read-only) and step 2.
* 2026-11-18, Claude: decisions 4-5 follow from Pete's registry rule (one person = one YAT ID; outside numbers attach to it). All decisions made.

---

## 5. Rules for any agent working on this

1. Read this file first. Take only the next open step, and mark it "In
   progress (agent, branch)" before starting.
2. One step at a time. Don't touch a step another agent has in progress.
3. Test copy first, then a preview. Pete approves every merge and every live
   database change.
4. Add the step's build test so it can't be undone by accident.
5. Before stopping, update the step table and add a log entry. Nothing may
   live only in one agent's memory.
6. Nothing is assumed: cite where each fact came from (CLAUDE.md, "Pete is
   the architect").
