# PrestoSports college feed - plan and decisions (Oct 28, 2026)

## The deal (Pete)
Contract on its way: open read access to every level Presto covers (NCAA-D1,
NCAA-D2, NCAA-D3, NAIA, NJCAA, CCCAA, NWAC, plus summer teams). Access opens
when the contract is signed; $5,000 is due within 30 days. Target: signed
within about 3 months.

## What we have to build from
- The API definition (78 endpoints): `https://gameday-api.prestosports.com/v3/api-docs`.
  Login is username/password -> bearer token.
- Pete's sample feed (PDF, Sept 17 2026): the PrestoStats `bsgame` box score
  in XML and JSON - venue, both teams (Presto team `code` and `id`), every
  player (Presto `playerId`) with hitting/pitching/fielding, play by play,
  `status complete="Y"`. The XML looks complete; the JSON looks trimmed.

## Open questions for Presto
1. Which endpoint returns `bsgame` (probably `/api/events/{id}/prestostats/data`),
   and does `/api/events/{id}/livestats` return the same during a game?
2. One real API response (not a write-up) - is the JSON complete?
3. The pitcher's decision (W/L/S) - the sample's `win="3-0"` looks like a record.
4. How to pull a whole day's games across every school; rate limits.
5. Is `playerId` permanent across seasons and transfers (else `careerId`)?
6. Photo/video rights for the site and emails; credit wording.
7. A test login before signing.

## Order of work
1. Team crosswalk: Presto team code -> our teamid, Pete approves; its own
   table, never automated writes to `teamid_universe_mapping`.
2. Rosters into a staging table (not the player universe).
3. Player crosswalk: Presto `playerId` -> YAT player id (one per player for
   life). Exact links only; anything uncertain to Pete's needs-decision list.
   No fuzzy names, no hometowns. The Baseball Cube ~8,000 go through the same.
4. Coverage report: schools and alumni by level, who's missing.
5. Field scenarios for 2027 (see decision 1).
6. Schedules (next game), 7. stats into `stat_lines` (nightly finals, then
   live every 10-15 minutes, only for games our alumni are in),
8. headshots/photos/news (`releases`), historical backfill,
9. the player card: NEXT/LIVE on the front, Game Logs with live scores, live
   box scores.
Also: stat corrections (locked finals stay; differences to Pete), feed health
alerts, never show dates of birth.

## Pete's decisions
1. **2027 field freeze / re-seed:** decided from the coverage results. Run
   scenarios comparing the current 1,024 field with a re-seeded one. If the
   gain is negligible, keep the current field; if it's considerable, weigh it
   against the calendar.
2. **Summer ball:** not decided yet. Pete will compare the summer calendar
   with the bracket schedule. Leaning toward including summer games, applied
   to each alum's results, but only if what we receive represents the large
   majority of the sanctioned summer games played - never cherry-picked. A
   summer level would need an official name from Pete before any data uses it.
3. **Standing rule:** never claim to be a complete statistical source (also
   in CLAUDE.md). It's a sweepstakes; expect complaints. The rules say we do
   our diligence to collect the most comprehensive data available to us.
