# Independent team schedules

The shared player schedule reader combines MLB, college, and independent team feeds. Independent games retain their provider identities and connect to canonical teams through a source crosswalk. No player, school, or subdomain needs a schedule override.

## Approved source configuration

The initial approved season is the Atlantic League's 2026 regular season. The [official schedule announcement](https://atlanticleague.com/atlantic-league-announces-2026-schedule/) establishes April 21 through September 13 and 126 games per team.

| Field | Approved value |
| --- | --- |
| Source system | `iscore_central` |
| League code | `ALPB` |
| League UUID | `df9fb9cc-0fdb-4b79-8a3c-ad5d7b415a56` |
| Season UUID | `9843025b-3dd7-4b1b-8776-a6b53a3bdb7a` |
| Season year and type | `2026`, `R` |
| Inclusive local date window | `2026-04-21` through `2026-09-13` |
| Schedule timezone | `America/New_York` |
| Gastonia source team UUID | `4f1038eb-7615-4b9e-ad59-9aebfa1c1bdb` |

The [official iScore app](https://pro.iscorecentral.com/) uses this public games API:

```text
GET https://api.microservices.iscoresports.com/api/public/games
    ?leagueId={league_uuid}
    &startDateFrom={utc_start}
    &startDateTo={utc_end}
    &take=1000
```

`src/lib/indySchedules.ts` fetches calendar-year windows, splits windows that reach the limit, and validates each game's league UUID, season UUID, and local date against the approved configuration. `/api/games` without `/public` returns 401 and is not the schedule endpoint. Public season metadata is available at `/api/public/leagues/{league_uuid}/seasons/summary`, but provider `active` flags and season names alone are insufficient approval: test records exist inside real seasons, and an active `DO-NOT-USE-2026 Season` also exists.

Store `scheduledDate` as `game_time_utc`; derive `game_date` in the configured timezone. For example, `2026-08-13T00:00:00Z` belongs to August 12 locally. Preserve distinct game UUIDs even when doubleheaders share a scheduled timestamp. Do not substitute `gameSummary.schedule_date`, which has observed source errors.

## Database and release gate

Apply `migrations/20261022_indy_team_schedules.sql` **before releasing application code that reads the new view**. It extends the existing `indy_iscore_games_raw` table and creates:

| Object | Purpose |
| --- | --- |
| `indy_iscore_schedule_seasons` | Explicitly approved source seasons, dates, timezone, and evidence URL |
| `indy_iscore_team_source_map` | Season-scoped source team UUID to canonical `teamid` |
| `v_indy_team_schedule_feed` | Shared schedule rows for each mapped team's side of a game |

The importer resolves an unambiguous canonical team using its name and league; conflicting or unresolved identities are reported for review. It can fill missing canonical links only where existing player/team identity evidence agrees. It does not establish a new current roster membership.

The migration copies existing SELECT access on `indy_iscore_games_raw` to the new read objects. Run migration/import through the configured writer, then verify the application's existing reader can SELECT the view and both configuration tables before deployment. Reuse the environment's configured connections; credentials do not belong in this runbook or repository.

The shared reader in `src/lib/db.ts` consumes the view. Independent rows retain `schedule_source`, `source_game_id`, season, and league. They set `tracks_player_lines=false`, so missing individual boxscore lines do not label a player “Did Not Play.”

## Expected 2026 backfill checks

Validated October 22, 2026 source input contains **639 accepted game records: 630 finals and nine stale scheduled entries**. The view preserves those nine in the source archive while hiding past scheduled entries from the displayed feed. With all ten teams mapped, expect 1,260 visible team-side rows and **126 Gastonia games: 63 home and 63 away**.

```sql
SELECT status, count(*)
FROM public.indy_iscore_games_raw
WHERE source_system = 'iscore_central'
  AND league_code = 'ALPB'
  AND season_id = '9843025b-3dd7-4b1b-8776-a6b53a3bdb7a'
GROUP BY status;

SELECT team_name, home_away, count(*)
FROM public.v_indy_team_schedule_feed
WHERE source_league_code = 'ALPB'
  AND source_season_id = '9843025b-3dd7-4b1b-8776-a6b53a3bdb7a'
GROUP BY team_name, home_away
ORDER BY team_name, home_away;
```

Final scores come from the per-game endpoint used by the official app:

```text
GET https://api.microservices.iscoresports.com/api/games/{game_uuid}/latest-score/internal
```

Attach scores only when the response says `FINAL`, both team UUIDs match, any supplied game ID matches, and runs are nonnegative integers. Of 630 captured responses, 627 pass final-status verification. Three retain stale `IN_PROGRESS` snapshots; their schedule records remain **Final with blank scores**:

| Date | Matchup | Source game UUID |
| --- | --- | --- |
| April 21 | Lexington at Charleston | `587e6810-4050-49c9-9f1a-592ff5864b39` |
| April 24 | York at Hagerstown | `2266e96e-c4d3-41f6-89d7-560ccf3a888d` |
| April 25 | High Point at Gastonia | `1f699247-1706-4429-a1f5-88eba679ff61` |

Do not infer a verified final score from a stale live snapshot. The [league's final recap](https://atlanticleague.com/rockers-close-with-win-over-peppers/) independently confirms Gastonia completed 126 games with a 71–55 record.

## Daily operation and future seasons

`/api/cron/indy-iscore-ingest` runs daily at **09:35 UTC** (`35 9 * * *` in `vercel.json`). It invokes `syncConfiguredIndySchedules` before individual-stat ingestion, including when `includeGames` is false. Authorization uses the existing ingest/cron secret; inspect `schedules.results`, `schedules.errors`, `unresolvedTeams`, and `scoreWarnings` in its response. An authorized `?league=ALPB&dryRun=true` request previews schedule writes. The wrapper still initializes the legacy individual-stat tables; use `syncIndyScheduleSeason(config, { dryRun: true })` directly when a strictly read-only schedule preview is required.

Each configured season's normal run tries at most **10 newest unscored final games**, with at most three score requests in flight. The function's `scoreLimit` option is capped at 200. Unverified scores remain eligible for later attempts. Existing verified scores are preserved and **are not periodically refreshed**; a correction requires an explicit validated replay/backfill. This is a daily schedule and bounded score backfill, not live score polling.

For a future season, verify an official current schedule, exact provider UUID, inclusive dates, timezone, game type, and canonical team mappings. Preview the proposed configuration with `syncIndyScheduleSeason(config, { dryRun: true })` and review rejected/unresolved rows. Add its evidence-backed row to `indy_iscore_schedule_seasons` with `active=false` until verification is complete, then enable `active=true` for ingestion. The cron reads only active rows. `active` controls ingestion; historical configured rows remain readable when it is false. Do not enable a season merely because a calendar year or provider flag changed.

**Gastonia 2027 remains unapproved.** The [August 31, 2026 league announcement](https://atlanticleague.com/alpb-announces-2027-championship-season-schedule/) predates [Gastonia's September 30 withdrawal](https://atlanticleague.com/gastonia-withdraws-from-alpb/). The [team homepage](https://ghostpeppersbaseball.com/) confirms operations ceased. The public feed's two calendar-2027 entries belong to `DO-NOT-USE-2026 Season`; they are not valid 2027 fixtures. Require a current league/team announcement and verified source season before enabling any replacement schedule.
