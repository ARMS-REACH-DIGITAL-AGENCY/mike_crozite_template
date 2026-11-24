# The Daily Digest: the approved layout (Pete, Nov 24 2026)

Pete, Nov 24 2026: "That is the daily digest. Until we start adding articles
and ads." **Never lose it.** `daily-digest-approved-2026-11-24.html` is the
exact email Pete approved (the 2026 replay's April 2 edition, sent through
HighLevel). The production code that makes it is
`src/lib/newsletter/dailyDigestLayout.ts`; any change to the Digest is
compared with this file first, and only Pete changes the design.

## What it is, top to bottom

1. **Masthead**, white (Outlook darkens any tinted background): one line,
   "YOUR HOMETOWN. THEIR NEXT CHAPTER."; the school's name and its city on
   the left in the favorites' size; a small Daily Digest logo on the right.
   No dateline, no greeting.
2. **MY FAVORITES** bar with the date on the right (e.g. "Thursday, April 2,
   2026"), then each favorite in two tight lines, all in ONE table:
   name (bold) | yesterday's stat line, then team (level) | season slash line.
   Names left, stats right, full width, no Next Game. One size for all of it.
3. **Transactions** (when a favorite had one), the same style.
4. **The Fantasy Desk**: the day's story in the small size, left-justified,
   series note, shout-outs.
5. **The region scoreboard picture**, full width: Pete's Nov 13 Gazette board
   design (nl/gz3/55.png on branch `ccr-0ad18095-umgndf`), drawn once per
   school per day by `scripts/newsletter-draw-boards.ts`: the fan's home
   school's game first, framed by red lines, then 7 more games (for now the
   region's top scores; later the 7 schools nearest the home school).
6. Daily Double, Connect, Contribute, Remember, footer (content to come).

White page, no cream or gray background anywhere.
