# Review list and handoff - Oct 18, 2026 (end of bracket test week 2)

Everything from the Oct 18 session in one place, so nobody has to scroll a
chat. Part 1 is Pete's review list (each item waits on his look and OK).
Part 2 is the starting point for the stats-ingestion thread.

## Part 1 - Pete's review list

### Bracket (needs Pete's OK)

1. **Six test brackets: bring them up to Easter-NEWS.** Prepared locally,
   not pushed. Each test branch gets a `TEST-ONLY:` merge of Easter-NEWS
   (#376-#437, no conflicts) plus the "Not Necessary" fix (item 3). Built
   and tested on bracket 1; the six differ only by bracket number.
   Decision: OK to push all six?
2. **Live site: the test-bracket pipeline on Easter-NEWS.** Branch
   `ccr-0ad18095-umgndf`, preview
   https://mike-crozite-template-ica2woxhj-arms-reach-digital-agency.vercel.app
   - all 25 `PIPELINE:` commits (live scoring, TOP/BOT innings, the 34-dot
   timeline with weekly stories, Monday leading with last week's final, the
   tiebreaker ladder), keeping Feb 1 and the 1,024 field. Nothing changes on
   the site before Feb 1. Decision: after clicking through the preview, OK
   to merge?
3. **Fix: MLB "Not Necessary" playoff games count as over.** Done on both
   lines (in items 1 and 2). Verified on the preview with week 1-2 data.

### Site health (for Pete to decide or do)

4. **Database size: already fine.** Pete's 3 CU on `main` in "Players" is
   in effect (the production branch). The 78k connection timeouts were the
   Oct 11-12 crawler burst, before the change; 2 since. Left: ~270 slow
   queries (search, All-Time roster) - code work.
5. **Before Feb 1: bracket results computed once on the server** every 10
   minutes and served as small per-game files, instead of every phone
   downloading and scoring all 1,024 schools. Needed for traffic of any
   size. Plus firewall rate limits for crawlers, and a load test.
6. **Rotate the database password** if it hasn't been changed since Dec
   2025 (a real one is in git history, `yatstats-microsite/.env.local`).
7. **Three site checks out of date since PR #433** (Active Alumni rework):
   `scripts/test-active-school-page.cjs`, `test-gallery-membership.cjs`,
   `test-school-search-contract.cjs`. Row 3 no longer hides cards without
   2026 stats, so the gallery layer must - check Hamilton's Active count.
8. **Smaller:** GoHighLevel token rejected (sign-ups), photo cut-out API
   key invalid, Indy and ALPB imports blocked by a database permission
   error, `/api/schools/search` sends 6 parameters to a 5-parameter query.

### Stats sources (Part 2)

9. **No stats source for Feb 1-14** (the pro feed had zero lines then in
   2026) and none for college. Presto and SIDEARM are Part 2.

## Part 2 - Handoff for the stats-ingestion thread

### Where things stand

- Live scoring reads one table, `player_game_logs` (unique on playerid,
  source, source_game_id, stat_type). Today only `source = 'mlb_api'` writes
  it (`src/app/api/cron/mlb-live-gamelogs/route.ts`, every 10 minutes).
- Outside player IDs map to ours in `player_source_map` (source,
  source_player_id, playerid, match_method; 'rejected_bad_identity_match'
  blocks a bad pair). 3,345 `mlb_api` rows, 1 `SIDEARM` test row.
- The engine already scores every level against its own average, college
  included (`liveSeason.ts` level map: NCAA D1/D2/D3, NAIA, JUCO).
- The bracket reads lines as MLB field names: batting [plateAppearances,
  atBats, hits, doubles, triples, homeRuns, baseOnBalls, hitByPitch,
  sacFlies], pitching [inningsPitched, homeRuns, baseOnBalls, hitByPitch,
  strikeOuts, hits, runs, earnedRuns] (`src/app/api/bracket/live/route.ts`).
  A new source only has to write those names.
- Club W-L and run differential come from `team_schedules` and the lines'
  results; a college source must supply final scores.
- Active alumni by level (Oct 18): NCAA D1 ~3,800, D2 ~2,300, D3 ~2,500,
  NAIA ~900, junior college ~2,200 (NJCAA, CCCAA, NWAC, JUCO), pro ~3,000.

### What Presto said (Drive: "Presto/Frank Convo Thread")

- Mar 24-25, 2026 (Frank McCathran, VP Sales): a school can send its own
  XML to anyone ("it is their data"). The XML is generated **after a game**
  and can be emailed automatically or dropped on a server we run; once a
  school sets it up it's "set it and forget it". Schedules, rosters and
  photos are a separate workflow (school or NCAA). The NCAA's database is
  the official D1-D3 source (most schools enter stats with Presto, the data
  ends up at the NCAA); it doesn't cover NJCAA, NAIA, 3C2A, USCAA. API:
  $5,000/yr for non-live stats; for-profit use restricted; a new API not
  before end of 2026. Schools pay $625/yr for PrestoStats.
- Sep 2026: an API license is OK for a "derivative" product ("making it
  dance" in our own platform), not for showing or reselling the data as is.
- The sample XML was attached to Frank's Mar 25 email to
  pete@yatstats.com. Needed: that file, in Drive or forwarded to
  pcdaction@gmail.com.

### First tasks

1. One ingest seam: any provider (Presto XML or API, SIDEARM, NCAA) turns
   its game into rows for `player_game_logs` + a final score, behind one
   adapter interface. MLB stays as is.
2. A Presto XML adapter, written against the real sample (likely
   StatCrew-style per-game XML - confirm). Plus an inbox: an email address
   or upload endpoint the schools' "send XML" setting can point at.
3. Player matching: Presto/SIDEARM player -> our playerid by name, college,
   year and hometown/high school; auto-accept confident matches into
   `player_source_map`, the rest to a review screen for Pete.
4. Rules per the owner's live-test doc (`docs/bracket-live-test-2026.md`):
   new ingest code is `PIPELINE:` work, in its own files.
