// src/app/sweepstakes-rules/page.tsx
// Official Rules for the Fall Classic Tickets Sweepstakes.
//
// DRAFT for legal review (Nov 2026). Facts come from the bracket code and the
// sweepstakes panel (AccountDrawer FallClassicRaffle); entry math is
// src/lib/bracket/sweepstakesEntries.ts. Bracketed [ ] items are for the
// lawyer and Pete to fill. Remove DRAFT and the noindex once approved.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fall Classic Tickets Sweepstakes: Official Rules | YAT?STATS',
  description: 'Official Rules for the YAT?STATS Fall Classic Tickets Sweepstakes: four 2027 World Series tickets. No purchase necessary.',
  robots: { index: false, follow: true }, // until legal approval
};

const H = { font: '700 15px/1.3 Archivo, Arial, sans-serif', letterSpacing: '.04em', textTransform: 'uppercase' as const, margin: '26px 0 8px', color: '#fff' };

export default function SweepstakesRulesPage() {
  return (
    <main style={{ background: '#0a0a0a', color: '#e5e5e5', minHeight: '100vh', padding: '28px 16px 60px' }}>
      <article style={{ maxWidth: 760, margin: '0 auto', font: '400 15px/1.65 Archivo, Arial, sans-serif' }}>
        <p style={{ border: '1px solid #b45309', background: '#2a1a05', color: '#fcd34d', padding: '10px 12px', margin: '0 0 18px', fontSize: 13 }}>
          DRAFT: under legal review. These rules are not final and no entries are being accepted under them yet.
        </p>
        <h1 style={{ font: '800 26px/1.15 Archivo, Arial, sans-serif', color: '#fff', margin: 0 }}>Fall Classic Tickets Sweepstakes</h1>
        <p style={{ margin: '6px 0 0', color: '#a3a3a3' }}>Official Rules</p>

        <p style={{ fontWeight: 700, color: '#fff', marginTop: 20 }}>
          NO PURCHASE OR PAYMENT OF ANY KIND IS NECESSARY TO ENTER OR WIN. A PURCHASE OR SUBSCRIPTION DOES NOT IMPROVE YOUR CHANCES OF WINNING. VOID WHERE PROHIBITED.
        </p>

        <h2 style={H}>1. Sponsor</h2>
        <p>[Sponsor legal name], [address] (&quot;Sponsor&quot;), operator of YAT?STATS (yatstats.com). This sweepstakes is not sponsored, endorsed or administered by Major League Baseball, any MLB club, any school, or any player.</p>

        <h2 style={H}>2. Eligibility</h2>
        <p>Open to legal residents of the 50 United States and D.C. who are [18 or older / the age of majority in their state] when they enter. Employees of Sponsor and their immediate families and household members are not eligible. [Lawyer: confirm any state exclusions.]</p>

        <h2 style={H}>3. Entry period</h2>
        <p>The sweepstakes runs with the 2027 YAT?STATS Fantasy Bracket, which begins Monday, February 1, 2027. Entries close at 11:59 PM Arizona time on Sunday, September 26, 2027. The bracket has 10 rounds of three weeks each (weeks 1-30, February 1 through August 29, 2027).</p>

        <h2 style={H}>4. How to enter</h2>
        <p>Register as a YAT?STATS Fan (free) or Super Fan at yatstats.com and choose your school. Simply visiting the site does not enter you. Only registered fans of the school that wins the 30-week Bracket (the &quot;Bracket Champion&quot;) are eligible for the drawing, plus Lucky Fan nominees (below).</p>

        <h2 style={H}>5. Number of entries</h2>
        <p>Entries are counted per bracket round. No one may receive more than <strong>3 entries in any round</strong> (30 for the season), however they enter.</p>
        <ul>
          <li><strong>Registration:</strong> 1 entry for each round in which you are registered on or before the round&apos;s last day. A fan registered since Round 1 has 10; a fan who joins in Round 10 has 1.</li>
          <li><strong>Photo bonus (free):</strong> 1 additional entry for each high school photo of any player on YAT?STATS that you upload and that YAT?STATS approves, up to 2 per round. Uploading photos is free. A photo counts in the round in which it was uploaded. You must own the photo or have permission to share it.</li>
          <li><strong>Super Fan:</strong> 1 entry for each week of the round your Super Fan plan is active, in place of the registration entry. Photo entries can top up a round, but never above 3.</li>
          <li><strong>Lucky Fan:</strong> before the Season Championship Tournament, each active alumnus of the eight Regional Champions may nominate one fan, who receives 1 entry. Nominees must register to be eligible.</li>
        </ul>

        <h2 style={H}>6. Drawing</h2>
        <p>One winner will be drawn at random from all eligible entries on October 3, 2027, with the drawing planned to stream live on yatstats.com. Odds of winning depend on the number of eligible entries received. The winner will be notified by the email used to register and must respond within [5] days and sign an affidavit of eligibility and release, or an alternate winner may be drawn.</p>

        <h2 style={H}>7. Prize</h2>
        <p>One prize: four tickets to one game of the 2027 MLB World Series, or two tickets each to two games, at Sponsor&apos;s choice of game and seats, plus one hotel night near the stadium. Approximate retail value: $[ARV]. Airfare, travel, meals and all other costs are not included. If the World Series is not played or tickets cannot be obtained, Sponsor will award [a substitute prize of equal or greater value / $ARV]. The winner is responsible for all taxes.</p>

        <h2 style={H}>8. General</h2>
        <p>Sponsor may disqualify entries made by automated means, multiple accounts, or photos that the entrant does not have the right to share, and may cancel or modify the sweepstakes if it cannot run as planned. Bracket results are determined under the YAT?STATS bracket rules. [Lawyer: release, limitation of liability, disputes, governing law, privacy, and winner&apos;s list request address.]</p>
      </article>
    </main>
  );
}
