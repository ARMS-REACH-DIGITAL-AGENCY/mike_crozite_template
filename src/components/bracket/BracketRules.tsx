// src/components/bracket/BracketRules.tsx
// The Fantasy Bracket Tourney tab's rules drawer: how the
// tournament runs and how every run is figured - the fine print, on demand.

import { TOURNAMENT_2027, bracketRoundWeeks } from '@/lib/bracket/tournamentCalendar';
import { LEVEL_AVERAGES, LEVEL_AVERAGES_SEASON } from '@/lib/bracket/levelAverages';
import { useParams } from 'next/navigation';

// The school's Connect & Contribute page (/<hsid>/connect-contribute).
function ContributeLink() {
  const params = useParams<{ hsid?: string }>();
  const hsid = params?.hsid;
  return <a href={hsid ? `/${hsid}/connect-contribute` : '/connect-contribute'}>Connect &amp; Contribute</a>;
}

export default function BracketRules() {
  return (
    <div className="ybr-rules">
      <section>
        <h4>Bracket Tournament (weeks 1–30)</h4>
        <ul>
          <li>1,024 high schools in 8 regions of 128, seeded 1–128 in each region.</li>
          <li>The 2027 season runs 34 weeks, Feb 1 – Sep 26. The bracket is weeks 1–30 (Feb 1 – Aug 29). Weeks run Monday–Sunday.</li>
          <li>10 bracket rounds of 3 weeks each. Every matchup is a best-of-3 series, one game per week, and all three games are always played. Win 2 to advance.</li>
        </ul>
        <table className="ybr-sched">
          <tbody>
            {[512, 256, 128, 64, 32, 16, 8, 4, 2, 1].map((n, i) => {
              const [a, b] = bracketRoundWeeks(i + 1);
              return <tr key={n}><td>Round {i + 1}</td><td>{n} 3-game series</td><td>Weeks {a}–{b}</td></tr>;
            })}
          </tbody>
        </table>
        <ul>
          <li>After week {TOURNAMENT_2027.bracketLastWeek} the Bracket Champion is announced and gets a 3-week bye during the single-elimination Season Championship Tournament (weeks 31–33).</li>
        </ul>
      </section>

      <section>
        <h4>Season Championship Tournament (weeks 31–33)</h4>
        <ul>
          <li>The Most Runs Scored Leaderboard ends after week 30. The top team in each of the 8 regions is reseeded into a 3-week single-elimination tournament. (If a region&apos;s top team is the Bracket Champion, the region sends its next school.)</li>
        </ul>
        <table className="ybr-sched">
          <tbody>
            <tr><td>Round 1</td><td>4 elimination games</td><td>Week 31</td></tr>
            <tr><td>Round 2</td><td>2 elimination games</td><td>Week 32</td></tr>
            <tr><td>Season Championship Game</td><td>Winner advances to YSWS</td><td>Week 33</td></tr>
          </tbody>
        </table>
      </section>

      <section className="ybr-world-series">
        <h4>YAT?STATS<br />High School Alumni<br />Fantasy World Series</h4>
        <p>Bracket Champ vs. Season Champ<br />Week #34</p>
      </section>

      <ScoringRules />

      <section>
        <h4>Most Runs Scored Leaderboard</h4>
        <ul>
          <li>Every school is on its region&apos;s leaderboard all season (weeks 1–30), ranked on total runs scored. Run differential breaks ties.</li>
          <li>Schools score in their bracket games while they&apos;re alive. Once eliminated, a school is paired with another eliminated school in its region for the next round and plays that same opponent in all three weekly games. A new opponent may be drawn for the following round.</li>
          <li>After week 30 each region&apos;s top team goes to the Season Championship Tournament. If it&apos;s the Bracket Champion, the region sends its next school.</li>
        </ul>
      </section>

      <section>
        <h4>Fans and the raffle</h4>
        <ul>
          <li>The bracket champion&apos;s registered fans are entered: one entry for each round they&apos;ve been registered (a fan since Round 1 has 10; one who joined before Round 10 has 1).</li>
          <li>SuperFans get 3× the entries.</li>
          <li>Before the Season Championship Tournament starts, each active alumnus of those 8 schools nominates one fan (one entry each).</li>
        </ul>
      </section>

      <section>
        <h4>Stats and disclaimers</h4>
        <ul>
          <li>Stats are included to the best of our ability, from official box scores and league sources. MLB spring training counts.</li>
          <li>A week&apos;s results are final after the deadline. Stats verified later add runs to a school&apos;s season total (the leaderboards) but never change a game&apos;s winner, and the other school never loses runs.</li>
        </ul>
      </section>

      <RulesStyles />
    </div>
  );
}

// How a game is scored - innings, OPS+ and FIP- with every level's league
// average, W-L%, absences, whose stats count and when, tiebreakers. One
// text in both places it appears: the full rules and the bottom of every
// stat drawer.
export function ScoringRules() {
  return (
    <>
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
          <li><b>FIP-</b> = 100 × his FIP ÷ league FIP. FIP = (13 × HR + 3 × (BB + HBP) − 2 × K) ÷ IP + the level&apos;s FIP constant. Lower is better: 80 is 20% better than average.</li>
          <li>A school&apos;s OPS+ for a day or week is its hitters&apos; OPS+ averaged, weighted by plate appearances; its FIP- is its pitchers&apos; FIP- averaged, weighted by innings pitched. Every comparison is an average, so having more alumni never helps by itself.</li>
          <li>There&apos;s no minimum: one plate appearance or one out counts.</li>
          <li>A player who plays at two levels in a week (a call-up, a rehab stint) is measured against each level&apos;s average for the games he played there.</li>
          <li>Comparisons use the exact values. The scoreboard rounds to whole numbers, so two cells can show the same number and one still wins.</li>
        </ul>
      </section>

      <section>
        <h4>League averages by level ({LEVEL_AVERAGES_SEASON} season)</h4>
        <p className="ybr-note">What 100 means at each level: the {LEVEL_AVERAGES_SEASON} totals of every alumnus in our database at that level (NJCAA, CCCAA and NWAC together as JUCO). They&apos;re locked for the season, so a number never moves mid-season. A level&apos;s league FIP equals its ERA; the FIP constant is what makes that true.</p>
        <div className="ybr-scroll">
          <table className="ybr-avg">
            <thead>
              <tr><th>Level</th><th>OBP</th><th>SLG</th><th>OPS</th><th>FIP</th><th>FIP const.</th></tr>
            </thead>
            <tbody>
              {LEVEL_AVERAGES.map((a) => (
                <tr key={a.level}>
                  <td>{a.level}</td>
                  <td>{rate(a.obp)}</td><td>{rate(a.slg)}</td><td>{rate(a.ops)}</td>
                  <td>{a.fip.toFixed(2)}</td><td>{a.cfip.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul>
          <li>Example: a Double-A hitter with a .344 OBP and .417 SLG is exactly average: OPS+ 100. With a .400 OBP and .500 SLG: 100 × (.400 ÷ .344 + .500 ÷ .417 − 1) = 136.</li>
          <li>Example: an MLB pitcher with a 3.34 FIP has an FIP- of 100 × 3.34 ÷ 4.17 = 80.</li>
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
          <li>A school with nobody playing can&apos;t score. The school that did play scores only by beating league average: an OPS+ above 100, or an FIP- below 100. Exactly 100 doesn&apos;t score.</li>
          <li>If a school doesn&apos;t have enough active alumni, that&apos;s on the school: it can&apos;t win a comparison it didn&apos;t play in.</li>
        </ul>
      </section>

      <section>
        <h4>Whose stats count, and when</h4>
        <ul>
          <li>A school&apos;s team is its active alumni: everyone on its Active Baseball Alumni gallery, including players on the injured list. Current high school players don&apos;t play.</li>
          <li>A player counts as a pitcher or a hitter by what he does: a listed pitcher, or anyone who pitches much more than he bats. Any line he puts up still counts for the side it belongs to.</li>
          <li>Days run on Arizona time, Monday through Sunday. Each day ends at 4 a.m. Arizona time the next morning, for every game at once.</li>
          <li>The scoreboard works like a ballpark&apos;s: at 4 a.m. the day&apos;s inning starts in the <b>TOP</b>, with a yellow 0 for the visitors. Once the last real game of the day for the two schools&apos; alumni has started (the whole bracket&apos;s last game, if neither school has anyone playing), it&apos;s the <b>BOTTOM</b>: a yellow 0 for both. A yellow number isn&apos;t final, so no run is announced early.</li>
          <li>When those games are over, the day&apos;s runs go up in yellow. At 4 a.m. the next morning they turn white (final) and the next inning starts. Until a day&apos;s runs are up, the stat drawers outline the school that would get each run if the day ended now.</li>
          <li>Inning 8 (the week) and inning 9 (W-L%) go up in yellow with Sunday&apos;s runs, and the game is final at 4 a.m. Monday.</li>
          <li>Some alumni&apos;s stats may not make it to YAT?STATS: a league we don&apos;t track yet, or a box score that&apos;s late or missing. Know of a game or a stat we&apos;re missing? Tell us on the <ContributeLink /> page.</li>
        </ul>
      </section>

      <section>
        <h4>Tiebreakers · extra innings</h4>
        <ol>
          <li>If the score is tied after inning 9, <b>inning 10</b> is Tiebreaker #1: each school&apos;s #1 hitter (OPS+) and #1 pitcher (FIP-) are compared head-to-head, one run for each winning comparison.</li>
          <li>If inning 10 is tied, <b>inning 11</b> is Tiebreaker #2 using the #2 hitter and #2 pitcher. Inning 12 uses the #3 pair, and so on. Every tiebreak is shown on the scoreboard as its own inning.</li>
          <li>The ladder continues only while both schools can supply the next required hitter and pitcher. There is no league-average substitute in extra innings.</li>
          <li>Only if the teams are still tied when the next complete player pair is unavailable does the commissioner&apos;s deterministic coin flip apply. The flip winner receives <b>one additional run</b>, so a completed game never displays a tied final score.</li>
        </ol>
      </section>
    </>
  );
}

// .400 / 0.715 -> ".400" / ".715"
const rate = (v: number) => v.toFixed(3).replace(/^0/, '');

// The scoring rules on their own (the bottom of a stat drawer).
export function ScoringRulesPanel() {
  return (
    <div className="ybr-rules ybr-panel">
      <ScoringRules />
      <RulesStyles />
    </div>
  );
}

function RulesStyles() {
  return (
    <>
      <style>{`
        .ybr-rules { max-width:900px; margin:0 auto; display:grid; gap:14px; }
        .ybr-rules section { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 16px 6px; }
        .ybr-rules h4 { margin:0 0 6px; font:500 14px/1.2 Oswald, sans-serif; letter-spacing:.1em; text-transform:uppercase; color:var(--gold); }
        .ybr-rules .ybr-world-series { text-align:center; }
        .ybr-world-series p { margin:0 0 8px; color:var(--text); font-size:14px; line-height:1.5; }
        .ybr-rules ul, .ybr-rules ol { margin:0 0 8px; padding-left:20px; color:var(--text); font-size:14px; line-height:1.5; }
        .ybr-rules li { margin:0 0 5px; }
        .ybr-rules b { color:var(--gold); font-weight:600; }
        .ybr-sched { width:100%; border-collapse:collapse; margin:0 0 10px; font-size:13.5px; color:var(--text); }
        .ybr-sched td { padding:4px 8px; border-top:1px solid var(--line); }
        .ybr-sched td:first-child { color:var(--gold); font:500 13.5px/1.3 Oswald, sans-serif; letter-spacing:.06em; text-transform:uppercase; }
        .ybr-sched td:last-child { color:var(--muted); white-space:nowrap; text-align:right; }
        .ybr-note { margin:0 0 8px; color:var(--muted); font-size:13px; line-height:1.45; }
        .ybr-scroll { overflow-x:auto; margin:0 0 8px; }
        .ybr-avg { width:100%; border-collapse:collapse; font-size:13px; color:var(--text); font-variant-numeric:tabular-nums; }
        .ybr-avg th { padding:4px 6px; color:var(--gold); font:500 12px/1.2 Oswald, sans-serif; letter-spacing:.06em; text-transform:uppercase; text-align:right; white-space:nowrap; border-bottom:1px solid var(--line); }
        .ybr-avg td { padding:4px 6px; text-align:right; border-top:1px solid var(--line); white-space:nowrap; }
        .ybr-avg th:first-child, .ybr-avg td:first-child { text-align:left; }
        .ybr-avg td:first-child { font-weight:600; }
        /* In a stat drawer: the same rules, sized for the narrower column. */
        .ybr-panel { gap:10px; margin-top:8px; }
        .ybr-panel section { padding:10px 12px 4px; }
        .ybr-panel h4 { font-size:13px; }
        .ybr-panel ul, .ybr-panel ol, .ybr-panel .ybr-sched { font-size:12.5px; }
        .ybr-panel .ybr-note, .ybr-panel .ybr-avg { font-size:12px; }
      `}</style>
    </>
  );
}
