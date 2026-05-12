# ALPB / Gastonia Stats Ingestion

This repo supports a source-flexible external stat ingestion layer for Atlantic League / independent-league stats, beginning with the Gastonia Ghost Peppers.

## Current sources

### iScore Central league stats page

Configured seed URL:

```text
https://pro.iscorecentral.com/ALPB/stats
```

This source is stored as `source_system = 'iscore_central'`. The ingestion route archives the raw page response in `raw_stat_ingest_payloads` when the deployed runtime can fetch it. If the page exposes embedded JSON or internal API calls, add that parser inside `src/lib/iscore.ts` / `src/app/api/cron/alpb-stats-ingest/route.ts` without changing the database contract.

### iScore Team Website API fallback

Configured source type:

```text
source_system = 'iscore_team_website'
```

Useful endpoint pattern:

```text
https://api.iscoresports.com/teamwebsite/games.php?s=baseball&t=<team_identifier>&p=<api_password>&json=1
```

Supported endpoints in the client:

- `roster.php`
- `games.php`
- `gamestats.php`

The client prefers JSON with `json=1`, redacts the `p` API password from stored URLs/logging, and stores raw payloads before normalized player-game rows.

## Required environment variables

```bash
DATABASE_URL=postgres://...
CRON_SECRET=...
ALPB_INGEST_ENABLED=true
```

For the iScore Team Website fallback, add:

```bash
ISCORE_GASTONIA_TEAM_IDENTIFIER=<team website identifier>
ISCORE_GASTONIA_API_PASSWORD=<team website api password>
```

The iScore Central source does not require those credentials, but it currently archives the public page payload until a stable embedded stats parser is confirmed.

## Database migration

Apply:

```text
db/migrations/010_external_alpb_stats.sql
```

It creates:

- `raw_stat_ingest_payloads`
- `external_stat_source_teams`
- `external_games`
- `external_players`
- `external_player_game_stats`

It seeds two Gastonia rows:

- active `iscore_central` source pointed at `https://pro.iscorecentral.com/ALPB/stats`
- inactive `iscore_team_website` fallback waiting for Gastonia iScore team credentials

To activate the Team Website fallback after credentials exist:

```sql
update public.external_stat_source_teams
set active = true,
    source_team_identifier = null,
    metadata = metadata || jsonb_build_object('env_team_identifier', 'ISCORE_GASTONIA_TEAM_IDENTIFIER'),
    updated_at = now()
where league_code = 'ALPB'
  and team_name = 'Gastonia Ghost Peppers'
  and source_system = 'iscore_team_website';
```

## Manual ingestion

Dry run all active ALPB sources:

```text
GET /api/cron/alpb-stats-ingest?secret=<CRON_SECRET>&dryRun=true
```

Run only Gastonia sources:

```text
GET /api/cron/alpb-stats-ingest?secret=<CRON_SECRET>&team=Gastonia
```

Force re-ingest a specific game when using the Team Website API:

```text
GET /api/cron/alpb-stats-ingest?secret=<CRON_SECRET>&team=Gastonia&force=true&gameGuid=<game_guid>
```

## Production schedule

`vercel.json` runs:

```text
/api/cron/alpb-stats-ingest at 25 9 * * *
```

That is once daily. The route requires `CRON_SECRET` via bearer token or query parameter.

## Rendering

`/api/player-season-stats` now appends `externalRecentStats` for mapped players.

`ProfileSeasonStats.tsx` renders a new **Atlantic League Recent Games** table above the existing TBC batting/pitching tables.

External stats do not replace canonical TBC stats. They augment the player profile when `external_players.yatstats_playerid` is mapped.

## Player mapping

The ingestion stores source players in `external_players`. Stats render for a YAT?STATS player only when:

```text
external_players.yatstats_playerid = <canonical playerid>
```

Do not automatically overwrite canonical players through fuzzy matching. Add a future admin/debug mapping workflow for unmatched ALPB players.

Temporary manual mapping example:

```sql
update public.external_players
set yatstats_playerid = '<canonical-playerid>',
    updated_at = now()
where source_system in ('iscore_team_website', 'iscore')
  and lower(first_name) = lower('<first>')
  and lower(last_name) = lower('<last>');
```

## Troubleshooting

- `401 unauthorized`: check `CRON_SECRET`.
- `ALPB_INGEST_ENABLED=false`: set `ALPB_INGEST_ENABLED=true` or omit it.
- iScore Team Website errors about missing config: add `ISCORE_GASTONIA_TEAM_IDENTIFIER` and `ISCORE_GASTONIA_API_PASSWORD`.
- iScore Central returns 403/HTML: the raw archiver is working, but a stable data parser still needs confirmation from the deployed environment or browser network panel.
- Stats ingest but do not render: map `external_players.yatstats_playerid` to the canonical YAT?STATS `playerid`.
