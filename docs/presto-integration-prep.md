# PrestoSports integration: what we know, and what Pete still decides

Prepared Nov 18 2026. Rule (CLAUDE.md, "Pete is the architect"): every fact here
cites its source. Anything not proven is marked **UNCONFIRMED**. Anything that
needs a decision is marked **PETE DECIDES**. Nothing is built until Pete approves.

## 1. The agreement (sources: email threads, addendum)

| Fact | Source |
|---|---|
| Non-live stats API, $5,000/yr, "open up any/all data that we have for Baseball (NCAA, NAIA, NJCAA, 3C2A, NWAC, and summer collegiate leagues)", "historical and in-year" | Frank McCathran, email Oct 27 2026 |
| "Non-live" came from Pete's own Oct 22 note ("Non-Live is fine. Daily lines are essential.") and Frank's Oct 27 suggestion of a once-a-day pull. It is not a restriction. | Emails Oct 22 and Oct 27 2026 |
| Presto "can't really do a cross reference" of which players/teams are included; "no guarantees" which schools use the platform in spring (most renew in January); there is "NO single source" for complete data | Frank, Oct 27 2026 |
| Derivative use in our own platform is the intended use; reselling the raw feed is not | Frank, Sep 18 2026; addendum §2 |
| Credentials within 24-48 hours of signing | Frank, Oct 29 2026 |
| Addendum (proposed, unsigned): read-only access to "all available baseball-related data, historical records, metadata, response fields, and associated content"; exclusions only by a written list; availability depends on what schools supply; term starts when credentials work; we keep lawfully retrieved history; Presto to confirm bandwidth/storage/request limits in writing before activation | Proposed addendum "API License Scope & Activation Clarification" |
| On Nov 17, Pete asked Juan for the API link page and a sample XML; no reply in the thread yet | Email Nov 17 2026 |
| A sample game XML was attached to Frank's Mar 25 2026 email; the file itself is not in the repo or Drive copies we have | Email Mar 25 2026 |

Never describe our coverage as complete (CLAUDE.md).

## 2. The API (source: Presto's OpenAPI document)

Docs: https://gameday-api.prestosports.com/swagger-ui/index.html (spec at
`/v3/api-docs`, "PrestoSports Network API" v0.1). Sign-in: `POST /api/auth/token`
returns a bearer token; `POST /api/auth/token/refresh` renews it. The spec has
no field descriptions, so meanings below come from field names and are
**UNCONFIRMED** until the first real call.

Read endpoints relevant to us:

| Need | Endpoint |
|---|---|
| Seasons we can see | `GET /api/seasons/`, `GET /api/me/seasons` |
| Teams in a season | `GET /api/seasons/{seasonId}/teams` |
| A team's games (schedule) | `GET /api/teams/{teamId}/events`, `GET /api/schedules/{seasonId}/sites/{siteId}` |
| Scores / record | `GET /api/teams/{teamId}/scores`, `GET /api/stats/teams/{teamId}/record` |
| Box score | `GET /api/events/{eventId}/stats` |
| **Live stats during a game** | `GET /api/events/{eventId}/livestats` |
| Raw PrestoStats game data | `GET /api/events/{eventId}/prestostats/data` |
| Roster / player | `GET /api/teams/{teamId}/players`, `GET /api/player/{playerId}` |
| Player career | `GET /api/stats/player/{playerId}/career/season` |
| Headshots, photos, videos, releases | `PlayerDTO.headshot`, `GET /api/player/{playerId}/photos` etc. |

Player record (`PlayerDTO`): `playerId`, `teamId`, `careerId`, first/last name,
position, uniform, height, weight, hometown, headshot, dob, year, starter,
active, playerStatus, `attributes`, `data`. Team record (`TeamDTO`): `teamId`,
`seasonId`, conference, division, NJCAA/NAIA conference and division. Season:
`seasonId`, `previousSeasonId`.

Live stats: the endpoint exists. Whether a given school's games have live data
depends on that school (Pete, Nov 18). If live data is there, it can feed the
bracket as games happen. **PETE DECIDES** how live lines are used before a game is final.

## 3. How Presto identifies a player (source: Presto's public sites)

Example: Ethan Garza, RHP #17, Our Lady of the Lake (NAIA). Presto-hosted
pages for www.ollusaintsathletics.com, fetched Nov 18 2026.

* **A new player record every season. PROVEN.** His roster bio links are
  `2023-24/bios/garza_ethan_racv`, `2024-25/.../garza_ethan_4z39`,
  `2025-26/.../garza_ethan_a09p`, and `2026-27/.../garza_ethan_cef4`. His
  2026-27 stats code `ethangarza67jl` returns "Page Not Found" under 2024-25.
* **The seasons are linked into one career. PROVEN.** His Career view lists
  2023-24 through 2026-27. This matches `careerId` in the API.
* **Codes are network-wide. PROVEN.** `ethangarza67jl` is the same on
  naiastats.prestosports.com and on his school's site.
* **High school is on the profile. PROVEN for the public bio.** His 2025-26
  bio shows Hometown: Mission, Texas; Position: RHP; Year: Jr.; Bats/Throws:
  R/R; High School: Mission Veterans Memorial High School. **UNCONFIRMED**
  that the API returns it (likely in `attributes`/`data`).
* **UNCONFIRMED:** whether a transfer keeps one `careerId` across colleges,
  how soon box scores appear after a game, and whether codes can ever repeat.
* Presto's association sites (naiastats etc.) sit behind a Cloudflare robot
  check, and Frank said Presto blocks scrapers. We did not get around it.

He is already in our registry: YAT175996, Mission Veterans Memorial, Our Lady
of the Lake, NAIA, 2026 GP 12. Presto's bio shows gp 12. Presto lists him as
RHP; our card shows UT.

## 4. First day of access: checks before building anything

1. Sign in; list seasons, associations and teams we can see.
2. Pull 3-4 known careers, including a transfer. Compare `playerId` and
   `careerId` season by season.
3. Read one roster: does the API include the high school, hometown and dob?
4. Read one finished game's box score and one live game's stats. Record the
   field names and how quickly box scores appear after the game.
5. Get the request limits in writing (addendum §5).

## 5. Open decisions for Pete

1. **Identity key:** attach `careerId`, plus every season `playerId`, to the
   YAT ID. Is an institution scope needed? Decide after step 4.2.
2. **Players with no clear match** in our registry: give them a new YAT ID,
   or hold their lines until evidence matches them?
3. **Same-person merge rule** for two YAT IDs (e.g. same name + same college +
   same dob or hometown → merge, one ID forwards to the other)?
4. **Which colleges to pull daily:** all, or only colleges with our alumni?
5. **Live lines:** score them in the bracket as they happen, or only when the
   game is final?
6. **Presto data that differs from ours** (e.g. position RHP vs UT): fill
   blanks only, flag for Pete, or replace?
7. **Headshots:** copy Presto headshots for linked alumni into our storage
   (through the free cutout job)?
