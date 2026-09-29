// src/components/bracket/BracketRules.tsx
// The Fantasy Bracket Tourney tab's rules page (row 3's Rules tile): how the
// tournament runs and how every run is figured - the fine print, on demand.

export default function BracketRules() {
  return (
    <div className="ybr-rules">
      <section>
        <h4>The tournament</h4>
        <ul>
          <li>1,024 high schools in 8 regions of 128, seeded 1–128 in each region.</li>
          <li>The season runs 30 weeks, Feb 2 – Aug 30. Weeks run Monday–Sunday.</li>
          <li>10 bracket rounds of 3 weeks each. Every matchup is a best-of-3 series, one game per week, and all three games are always played. Win 2 to advance.</li>
          <li>Rounds 1–7 are played inside each region; the 8 region champions are reseeded for the Elite Eight (by region seed, then run differential).</li>
          <li>The Leaderboard 8 (Aug 31 – Sep 20): each region&apos;s leaderboard leader plays a single-game bracket, 8 → 4 → 2 → 1. The bracket champion sits this out.</li>
          <li>The Grand Final (Sep 21 – 27): one game, the bracket champion against the Leaderboard 8 winner.</li>
        </ul>
      </section>

      <section>
        <h4>A game: one week, nine innings</h4>
        <ul>
          <li><b>Innings 1–7</b> are the days of the week. Each day has two runs on the table: one for the better OPS+ (hitting) and one for the better FIP- (pitching, lower is better).</li>
          <li><b>Inning 8</b> is the whole week: the same two runs on the week&apos;s OPS+ and FIP-.</li>
          <li><b>Inning 9</b> is one run for the better W-L% of the alumni&apos;s real teams that week.</li>
          <li>Most runs after nine innings wins the game.</li>
        </ul>
      </section>

      <section>
        <h4>OPS+ and FIP-</h4>
        <ul>
          <li>Every player is measured against the average for the level he plays at (MLB, Triple-A … college D1, JUCO), so a juco hitter and a big leaguer are compared fairly. 100 is league average.</li>
          <li><b>OPS+</b> = 100 × (his OBP ÷ league OBP + his SLG ÷ league SLG − 1). 150 is 50% better than average; 50 is half as good.</li>
          <li><b>FIP-</b> = 100 × his FIP ÷ league FIP, from strikeouts, walks, hit batters and home runs. Lower is better: 80 is 20% better than average.</li>
          <li>A school&apos;s OPS+ for a day or week is its hitters&apos; OPS+ averaged, weighted by plate appearances; its FIP- is its pitchers&apos; FIP- averaged, weighted by innings pitched. Every comparison is an average, so having more alumni never helps by itself.</li>
        </ul>
      </section>

      <section>
        <h4>W-L% (inning 9)</h4>
        <ul>
          <li>Every alumnus on a team&apos;s roster that week counts his team&apos;s record, whether he played or not. Ten players whose teams each went 3–4 make the school 30–40.</li>
          <li>The school with the higher winning percentage gets the run. A school with no alumni on a team counts as .500.</li>
        </ul>
      </section>

      <section>
        <h4>When a school has nobody playing</h4>
        <ul>
          <li>A school with nobody playing can&apos;t score. The school that did play scores only by beating league average (100).</li>
          <li>If a school doesn&apos;t have enough active alumni, that&apos;s on the school: it can&apos;t win a comparison it didn&apos;t play in.</li>
        </ul>
      </section>

      <section>
        <h4>Tiebreakers</h4>
        <ol>
          <li>Player vs player: each school&apos;s best hitter of the week (OPS+) against the other&apos;s, and best pitcher (FIP-) against the other&apos;s, one run each. The school that takes more wins.</li>
          <li>At 1–1, it goes to the #2 hitters and #2 pitchers, and on down the rosters. A player with no one left to face counts only by beating league average; a school with nobody playing can&apos;t win it.</li>
          <li>Still level when the rosters run out: the commissioner&apos;s coin flip. (Leaderboard games can end in a tie: half a win each.)</li>
        </ol>
      </section>

      <section>
        <h4>Regional leaderboards</h4>
        <ul>
          <li>Every school is on its region&apos;s leaderboard all season (weeks 1–30), ranked on total runs scored. Run differential breaks ties.</li>
          <li>Schools score in their bracket games while they&apos;re alive; once eliminated they play a weekly game against another eliminated school in their region.</li>
          <li>After week 30 each region&apos;s leader goes to the Leaderboard 8. If the leader is the bracket champion, the region sends its next school.</li>
        </ul>
      </section>

      <section>
        <h4>Fans and the raffle</h4>
        <ul>
          <li>The bracket champion&apos;s registered fans are entered: one entry for each round they&apos;ve been registered (a fan since Round 1 has 10; one who joined before Round 10 has 1).</li>
          <li>SuperFans get 3× the entries.</li>
          <li>Before the Leaderboard 8 starts, each active alumnus of those 8 schools nominates one fan (one entry each).</li>
        </ul>
      </section>

      <section>
        <h4>Stats and disclaimers</h4>
        <ul>
          <li>Stats are included to the best of our ability, from official box scores and league sources. MLB spring training counts.</li>
          <li>A week&apos;s results are final after the deadline. Stats verified later add runs to a school&apos;s season total (the leaderboards) but never change a game&apos;s winner, and the other school never loses runs.</li>
          <li>This season is a simulation on real 2026 stats: pro lines are real box scores; college lines (marked *) are simulated from each player&apos;s 2026 season totals, and college teams&apos; records aren&apos;t loaded yet (they count as .500).</li>
        </ul>
      </section>

      <style>{`
        .ybr-rules { max-width:900px; margin:0 auto; display:grid; gap:14px; }
        .ybr-rules section { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 16px 6px; }
        .ybr-rules h4 { margin:0 0 6px; font:500 14px/1.2 Oswald, sans-serif; letter-spacing:.1em; text-transform:uppercase; color:var(--gold); }
        .ybr-rules ul, .ybr-rules ol { margin:0 0 8px; padding-left:20px; color:var(--text); font-size:14px; line-height:1.5; }
        .ybr-rules li { margin:0 0 5px; }
        .ybr-rules b { color:var(--gold); font-weight:600; }
      `}</style>
    </div>
  );
}
