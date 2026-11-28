# Newsletter layouts: the locked reference (Pete, Nov 24 2026)

These are the layouts Pete designed and approved. The production newsletter
code must reproduce them. Before any newsletter is sent, compare it with these
files, section by section.

How they were lost once: the Gazette was built on Nov 12-13 by a script in a
temporary Claude container and emailed through HighLevel. Only its images were
committed. When the container was replaced, the script was gone, and production
kept a plain stand-in layout. The HTML below was recovered on Nov 24 from
HighLevel's copy of the emails actually sent to Pete.

## Files

| File | What it is |
|---|---|
| `gazette-round1-test3-2026-11-13.html` | **The Gazette to build from.** "YAT-A-BOY Weekly Gazette · After Round 1 (TEST 3 · 2026 simulation)", sent Nov 13 2026. Pete, Nov 24: "Yes" — build from TEST 3, plus the Nov 19 changes below. |
| `gazette-week4-test2-2026-11-12.html` | The earlier approved proof, "Week 4 (TEST 2 · real 2026 pro stats)", sent Nov 12 2026. |
| `daily-digest-oct07-phone.pdf` | The Daily Digest layout Pete supplied ("Use this format"). The masthead, Next Game line and ASB medallion were then updated from Pete's Nov 22 phone mockups (see `src/lib/newsletter/dailyDigestLayout.ts`). |

The Gazette images (masthead, scoreboards, region boards, runs leaders, team
logos, Daily Double cards) are served from the branch
`ccr-0ad18095-umgndf`, folders `nl/gz3/` and `nl/gz4b/`. **Never delete that
branch**: the reference emails load their images from it.

## The Gazette, section by section (TEST 3)

1. Masthead image: YATABOY gazette, "Connect. Contribute. Remember.", school logo,
   "your local alumni weekly recap & more". Under it: school, city and state on
   the left; "WEEKLY EDITION · WEEK n" and the date on the right.
2. **Hamilton's Week**: headline ("Hamilton sweeps Campo Verde, 3-0."), a letter
   to the fan ("Hi Pete, ..."): the series result, the next opponent, and the
   alumni who carried the week.
3. The region scoreboard (image): ASB medallion, "REGION n | YAT?STATS",
   "BEST OF 3 SERIES", each school's series record, seed and name, innings 1-10
   and R. The home game is first, framed by red lines.
4. **Hamilton Alumni Stats**: "Week of ...", "Hamilton's n active alumni. Your
   favorites are in bold." Batters table (team logo, last name, OPS+, W-L, AB,
   H, 2B, 3B, HR, BB, HBP, SF, OBP, SLG, OPS, total row) and pitchers table
   (FIP-, W-L, IP, H, R, ER, HR, BB, HBP, K, WHIP, K/BB, FIP, total row).
   Then **Your n Superfan Favorites**: the same two tables for the fan's
   favorites. Note: "OPS+, FIP- and club W-L come from each school's bracket
   game and show a dash for players outside Hamilton's." Link: "See each day
   of the week in the stat drawer →".
5. **The Daily Double**: the In the News card and the Founding Partner card.
6. **Bracket Madness Around the Country**: the week's finals, the top eight
   series in every region, one board image per region.
7. **It Ain't Over Till It's Over**: the Total Runs explanation, then for each
   pair of regions: a Runs Leaders board image, This Week's Storylines, Look
   for These Matchups (real-life teammates on opposite sides), and the
   Knocked-out Schools' next-week matchups.
8. **Connect**, **Contribute**, **Remember**: editorial sections, placed between
   the runs-leader pairs as in the reference.

## Pete's changes after these proofs (Nov 19 handoff)

1. Each player's weekly real-team W-L, from the team of each game line (a
   player on two teams that week gets one line per team).
2. School listings the same everywhere, in two lines: **Seed, Team Name,
   Score** / **City, ST**.
3. Scoreboards one column wide on phones; no side-by-side boards on a phone.
4. Nothing internal is ever printed (no test, commissioner or pipeline notes).
5. "It has to look like baseball": a recognizable scoreboard and box score.
