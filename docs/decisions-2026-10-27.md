# Decisions with Pete - Oct 27, 2026

Every rule Pete settled on Oct 27. Build from this file, and add to it as new
rules are decided. If anything elsewhere disagrees, this file wins until Pete
says otherwise.

## One source for everything

- Compute once, store, and read only the stored results. Bracket pages,
  newsletters and anything else read the same stored tables. Nothing
  recomputes in a fan's browser or in a newsletter.
- Each bracket day closes at 4 a.m. Arizona (7 a.m. Eastern). A closed day is
  frozen and never read or recomputed again.

## Stat cutoffs

- **Day innings (1-7):** count only the stats in by that day's 4 a.m. cutoff.
  The day is frozen then.
- **A late stat** (example: a JUCO game whose stats reach Presto the next day)
  misses its day's inning but counts in the weekly total, which decides
  inning 8.
- **A correction to an earlier day during the week** works the same way: it
  changes the weekly total, never the day's inning.
- **Hard deadline: 4 a.m. Arizona Monday.** The week (the game) is final and
  locked. Nothing after that changes it.
- **Inning 9 (club W-L)** is decided by the same Monday 4 a.m. deadline.

## Levels of games (Pete, Oct 27)

- **Every stat line has an official level. None is ever blank.**
- **A game in a league based outside the United States is INTERNATIONAL.**
  That covers the Mexican League and the winter leagues (Mexico's Liga
  Mexicana del Pacifico, the Dominican and Venezuelan leagues) and the
  Caribbean Series. MLB's feed labels them "WIN" or "IND", which are not
  levels.
- **The Arizona Fall League is MLB**: MLB-level exhibition games, like all
  spring training games.
- **College summer leagues** (wood-bat leagues of mixed college players,
  not sanctioned by the NCAA, NAIA, NJCAA and so on): Pete may leave them
  out entirely. No such lines are in the database today.

## Storage

- `stat_lines`: every line as the source reports it now, with when it first
  arrived. Late and corrected lines land here.
- Frozen copies, never changed:
  - a **day copy** at each day's cutoff (innings 1-7, the Daily);
  - a **week copy** at Monday 4 a.m. (inning 8, the Weekly).
- `master_bracket`: game results, computed once from the frozen copies.
- Comparing the frozen copies with `stat_lines` is the history of what was
  published and what changed later.

## The commissioner

- Publicly it says only "the commissioner decides". Never publish the
  method: not on the rules page, the site, or the newsletters.
- The code decides automatically, so Pete never has to make a ruling. A
  ruling recorded by hand still comes first.
  - **Game 2:** the school that lost Game 1.
  - **Game 3:** the better series run differential over Games 1-2; then the
    school that won a series game on the field (not by a ruling); then the
    higher seed.
  - **Game 1, or anything still even:** the bigger roster; then the most MLB
    players, then TRIPLE-A, and on down the official levels; then a random
    draw fixed by the game.

## The season: two tournaments in one (Pete, Oct 28)

- **15,368 games is the number.** The season is more than the bracket.
- **Every one of the 1,024 schools plays 30 games**, one a week in Weeks
  1-30: 512 games a week, 1,024 x 30 / 2 = 15,360. A school knocked out of
  the bracket keeps playing every week.
- **Tournament 1, the National Bracket:** 10 rounds of best-of-3 series
  inside those 30 weeks (games 1-3,084; see "Bracket rounds" below).
- **Tournament 2, Total Runs:** each school's run total over its 30 games
  is ranked against the other 127 schools in its region. The top run scorer
  in each of the 8 regions plays single games in Week 31 (4 games), Week 32
  (2) and Week 33 (1). These are the 8 regional **Total Runs** winners,
  announced after Week 30, not the 8 regional **bracket** winners.
- **Week 34, the World Series:** the Total Runs winner plays the Main
  Bracket winner (1 game). The Main Bracket winner has byes in Weeks 31-33,
  so it is never one of the 8 Total Runs schools: if it leads its region's
  Total Runs, the region's next school goes (Pete, Oct 28).
- Total: 15,360 + 7 + 1 = **15,368**. The system fills Weeks 31-34 itself
  from the stored Week 30 results and the stored regional standings, never
  by hand.
- **Knocked-out schools are paired each round (Pete, Oct 28).**
  - The 512 schools out after Round 1 (Week 3) are matched up for Round 2
    (256 games a week). After Round 2 (Week 6), 768 schools are out: 384
    Round 3 matchups. And so on through Round 7.
  - Rounds 8-10: the 1,016 schools out of the regional brackets (all but the
    8 regional bracket winners) are paired each round, 508 matchups.
  - Matchups can cross regions.
  - **Publicly they are "randomly selected".** Never publish the method (like
    the commissioner's).
  - **The method:** look at the real-life pro and college teams of each
    school's alumni, and match up real-life teammates' high schools first.
    The rest are drawn.
  - As built: one opponent for the round's three weeks; each alumnus's
    latest team in `player_team_stints`, by teamid (never by name); two
    schools that have already played each other aren't paired again if it
    can be avoided; the draw is fixed by the round, so it never changes once
    made.
- **Still to decide (Pete):** the tiebreak when two schools lead a region
  with the same run total (as built: run differential, then wins, then
  seed); who is home in Week 34 (as built: the Main Bracket winner).

## Bracket rounds (2027)

Pete, Oct 28. This replaces the Oct 27 Rounds 9-10.

- **Rounds 1-7 (Weeks 1-21):** the eight 128-school regions play their own
  brackets: 3,048 games and eight regional bracket winners. Winners advance
  automatically, round after round.
- **Rounds 8-10 (Weeks 22-30):** the 8 regional bracket winners play each
  other for all nine weeks, four 3-game series a round (36 games).
- **Reseeding:** the 8 use their regional seeds, 1-8, for all three rounds.
  A tie in regional seed goes to more total runs through Round 7. Pete's
  example: Region 6 and Region 2 winners were both #2 seeds; Region 6 is the
  higher seed with 91 runs to Region 2's 90.
- **Round 8 (Weeks 22-24):** Series 1: #1 v #8. Series 2: #4 v #5.
  Series 3: #3 v #6. Series 4: #2 v #7. The better seed is at home.
- **Round 9 (Weeks 25-27):**
  - Series 5 (Bracket Semi 1): winners of Series 1 and 2.
  - Series 6 (Bracket Semi 2): winners of Series 3 and 4.
  - Series 7 (Bracket Semi 1 Loser): losers of Series 1 and 2.
  - Series 8 (Bracket Semi 2 Loser): losers of Series 3 and 4.
- **Round 10 (Weeks 28-30):**
  - Series 9, the Bracket Championship: winners of Series 5 and 6. Its
    winner is the Main Bracket winner.
  - Series 10: loser of Series 5 v winner of Series 8.
  - Series 11: loser of Series 6 v winner of Series 7.
  - Series 12: losers of Series 7 and 8.
- The rules page must be updated to match. It currently says there's no
  reseeding.
- How eliminated schools are matched for their weekly games: decided Oct 28,
  see "The season: two tournaments in one" above.

## The tests

- The test brackets exist to find problems before the real season. Who
  wins them doesn't matter.
- Tests 1-6 stay as they are. Tests 1A-6A run the new way (reading stored
  results) with the same schools and the same data. They should match tests
  1-6 apart from known timing differences.
- **Each test bracket is its own season-long tournament**, independent of
  the others (Pete, Oct 27). The six run at the same time (Oct 5 to Oct 31)
  but are never intertwined. A school in two test brackets is two separate
  entries in two separate seasons.
- **Each test fan follows one test season**, and every newsletter reports
  only that season, exactly as a 2027 fan's will:
  - test1@yatstats.com: Test Season 1, ..., test6@yatstats.com: Test Season 6
    (each one's home school is in the bracket with its number);
  - pcdaction@gmail.com gets no test newsletter.

## Daily Digest (every morning after the cutoff)

1. **Stat lines for the fan's favorites only**, fans and superfans alike.
   - No home-school roster unless the fan favorited those players.
   - No favorites: "You haven't picked any favorites yet" plus a link to pick
     some.
   - Favorites, but none played: "None of your players were in action
     yesterday."
   - A stat line that arrives after the 4 a.m. cutoff never appears in a
     Daily, not even the next day's. It shows up only in the Weekly (Pete,
     Oct 27).
2. **Stat line format**, written once per player per day by the pipeline:
   - "Jake Smith (Rays, MLB) vs. Brewers: 2-for-4, HR, 2 RBI, BB"
   - "Tom Jones (Ducks, NCAA-D1) vs. Beavers: 6.0 IP, 3 H, 1 ER, 2 BB, 8 K, W"
3. **The home school's game story**, written by the pipeline from that
   school's side.
   - The score through the latest inning: Thursday morning through 3,
     Friday through 4, and so on.
   - A note for each scoring inning (who scored, thanks to whom; top OPS+ and
     FIP- shout-outs).
   - Every game gets two stories, one from each school's side, about its own
     players. Stored by school.
4. **A Wrigley Field-style scoreboard: 12 games.**
   - The home game sits bottom left, between red lines.
   - **The fan picks the other 11 schools** (Pete, Oct 27; this replaced
     the idea of computing the nearest schools, so no map lookup).
     - Until they pick, those 11 slots are blank, with the invitation:
       "Pick your own favorite 11 and we'll send them to you every day."
       After the first previews Pete said the invitation "must be bigger,
       repositioned": it now sits on the board itself, above the games,
       in large type with a "Pick your teams" button.
   - **Each empty pick slot looks like a search box** (Pete's mockup): "Add
     a team to your daily scoreboard" with a magnifying glass. Email can't
     run a search, so the box is a link to the site's pick page, opened on
     that slot. The fan searches and picks there.
   - **The board's shape is Wrigley's** (Pete's mockup): a title bar across
     the top, "YAT?STATS ALUMNI BASEBALL" on the left and "BRACKET
     TOURNAMENT (2027)" on the right, with the sponsor's round logo standing
     on the bar in the middle, where Wrigley's clock is.
     - They pick on a page on the site, up to 11 schools from the bracket
       field. The newsletter links to it.
     - Why: we can't get it wrong. And fans who aren't superfans get used to
       following other schools, which gives them a reason to upgrade for
       those schools' players' stats.
   - Inning-by-inning runs so far.
   - Underneath, a link to the full scoreboard on the homepage.

## YAT-A-BOY Weekly Tribune (Monday, when the week is final)

- The full home-school roster.
- A full box score of the home game (week = game):
  - the line score;
  - each school's batting and pitching tables for the week;
  - extra-base hits underneath.
- Scores around the league: every final in the region, or a shorter list.
  Pete will decide after seeing it.

## Who does what

- **Claude:** the pipeline. Stat lines, stories, every game's daily score,
  box scores, results, frozen copies. All stored. Plus the page where fans
  pick their 11 scoreboard schools, and the table that holds their picks.
- **The newsletter (ChatGPT):** reads the stored rows, adds the sponsor,
  lays out the email, sends through HighLevel. No math, no formatting of
  stats, no rescoring, no `/api/bracket/live`.
- The newsletter saves a copy of exactly what each edition sent.
- When a day's or a week's content is completely written, the pipeline
  marks it ready. The newsletter sends only after that mark. If the content
  is late, the newsletter waits for it and sends late. **It never skips a
  day** (Pete, Oct 27).
