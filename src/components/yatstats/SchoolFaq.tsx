"use client";

import type { ReactNode } from "react";

type FaqItem = {
  question: string;
  answer: ReactNode;
};

function FaqGroup({ title, items }: { title: string; items: FaqItem[] }) {
  return (
    <section className="espn-faq-group">
      <h3>{title}</h3>
      <div className="espn-faq-list">
        {items.map((item) => (
          <details key={item.question} className="espn-faq-item">
            <summary>
              <span>{item.question}</span>
              <span className="espn-faq-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div className="espn-faq-answer">{item.answer}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function SchoolFaq({ schoolName }: { schoolName: string }) {
  const groups: Array<{ title: string; items: FaqItem[] }> = [
    {
      title: "About YAT?STATS",
      items: [
        {
          question: "What is YAT?STATS?",
          answer: (
            <>
              YAT?STATS is a hometown baseball community built around two questions fans keep asking after graduation:
              <strong> “Where are they at?” and “What are their stats?”</strong> We reconnect next-level players with the
              high school communities that helped shape their journeys by combining stats, player profiles, news, stories,
              photos, memories and career milestones in one place.
            </>
          ),
        },
        {
          question: `Why does ${schoolName} have its own YAT?STATS Community Hub?`,
          answer: (
            <>
              YAT?STATS spotlights high school baseball programs with meaningful next-level alumni history. This hub gives
              fans, families, alumni, former teammates, coaches and community members one place to follow those players after
              graduation and preserve the stories connecting them back to {schoolName}.
            </>
          ),
        },
        {
          question: "Is YAT?STATS affiliated with the school, MLB, MiLB or the NCAA?",
          answer: (
            <>
              A YAT?STATS Community Hub does not by itself mean YAT?STATS is operated by or officially affiliated with the
              school, MLB, Minor League Baseball or the NCAA. Some school programs and booster organizations may choose to
              work directly with YAT?STATS as their communities develop.
            </>
          ),
        },
        {
          question: "Why just baseball? Why not softball, football, soccer, hockey, golf or another sport?",
          answer: (
            <>
              We had to start somewhere, and baseball is the founder&apos;s passion. It also happens to be a sport where
              statistics are woven into the fabric of its history, making “WHERE THEY YAT?” and “WHAT&apos;S THEIR STATS?”
              a natural starting point. Baseball is where our story begins.{" "}
              <a href="https://yatstats.com" target="_blank" rel="noreferrer">Read more about YAT?STATS and take the guided tour.</a>
            </>
          ),
        },
      ],
    },
    {
      title: "Players, Stats & Coverage",
      items: [
        {
          question: `Which ${schoolName} players are included?`,
          answer: (
            <>
              YAT?STATS focuses on alumni who continued playing baseball beyond high school and for whom we have identifiable
              next-level information. Our player and school databases continue to expand, so today&apos;s list should not be
              interpreted as the final or complete history of {schoolName} baseball.
            </>
          ),
        },
        {
          question: "Where does YAT?STATS get its statistics and player information?",
          answer: (
            <>
              YAT?STATS works with baseball data providers and other verifiable sources to assemble current and historical
              player information. Our partners do their best to provide comprehensive, accurate and current data, but gaps can
              occur as players transfer, change teams, move between levels, retire or compete in leagues with different
              reporting systems.
            </>
          ),
        },
        {
          question: "I found a missing player, transfer, award or incorrect information. What should I do?",
          answer: (
            <>
              Tell us. Players, families, coaches, school representatives and knowledgeable fans can help close data gaps.
              Send verifiable information about missing players, transfers, team changes, promotions, retirements, draft
              selections, honors, awards or other career developments to your school representative or{" "}
              <a href="mailto:info@yatstats.com">info@yatstats.com</a>.
            </>
          ),
        },
        {
          question: "What is a Flip Card?",
          answer: (
            <>
              A Flip Card is YAT?STATS&apos; quick visual snapshot of a player and his baseball journey. Think of it as a
              digital baseball card connected to a much deeper player profile where you can explore available stats, games,
              news, social content, stories and career information.
            </>
          ),
        },
        {
          question: "What happens when a player changes teams?",
          answer: (
            <>
              His hometown connection does not change. YAT?STATS follows the player&apos;s journey while keeping him connected
              to the high school community where that story began.
            </>
          ),
        },
      ],
    },
    {
      title: "Career Path Timeline & STORIES",
      items: [
        {
          question: "What is the Career Path Timeline?",
          answer: (
            <>
              The Career Path Timeline is the visual history of a player&apos;s baseball journey. It can begin with his birth
              and early baseball years, continue through high school, college and professional baseball, and keep moving
              forward as new chapters are added.
            </>
          ),
        },
        {
          question: "Where do I post a personal story or memory about a player?",
          answer: (
            <>
              Personal memories and milestone moments are added directly from the player&apos;s Career Path Timeline—not from
              the Connect & Contribute Portal. A brief memorable moment appears on the visual timeline, while the full story
              lives in the player&apos;s <strong>STORIES</strong> FunZone, where fans can like, comment, share and tag other
              YAT?STATS alumni who were part of the experience.
            </>
          ),
        },
        {
          question: "What is the STORIES tab?",
          answer: (
            <>
              Think of STORIES as a living digital scrapbook of the player&apos;s baseball journey. It is where the full
              fan-submitted stories behind timeline moments live—giving former teammates, families and fans a place to relive
              memories, reconnect friendships and preserve the human side of the player&apos;s history.
            </>
          ),
        },
        {
          question: "What if my memory includes more than one YAT?STATS player?",
          answer: (
            <>
              Tag the other alumni who shared the moment. When another YAT?STATS player is tagged, that same moment can also
              become part of his Career Path Timeline, helping one shared memory reconnect multiple player histories.
            </>
          ),
        },
      ],
    },
    {
      title: "Connect & Contribute",
      items: [
        {
          question: "What is the Connect & Contribute Portal?",
          answer: (
            <>
              YAT?STATS takes the lead in building each Community Hub and estimates that as much as 90% of a newly launched
              hub&apos;s content is provided by YAT?STATS. The Connect & Contribute Portal gives logged-in coaches, players,
              families and fans an easy way to help fill the remaining gaps with useful, verifiable information.
            </>
          ),
        },
        {
          question: "What can I contribute through the Connect & Contribute Portal?",
          answer: (
            <>
              Depending on the available submission options, contributions can include missing headshots, high-school photos,
              historical team images, graduating-class information, player updates, transfers, honors, awards, news tips and
              corrections that improve the underlying Community Hub. Personal fan stories and memories belong on the
              player&apos;s Career Path Timeline instead.
            </>
          ),
        },
        {
          question: "Do I have to pay to submit information, photos or corrections?",
          answer: (
            <>
              No. Helping improve the Community Hub is not a paid activity. The same portal may also contain optional paid
              player/fan interaction experiences for participating alumni, but those are separate from ordinary community
              contributions.
            </>
          ),
        },
      ],
    },
    {
      title: "Fans, SuperFans & Fantasy Alumni Baseball",
      items: [
        {
          question: "Do I need an account to use YAT?STATS?",
          answer: (
            <>
              No. Visitors can explore much of the public YAT?STATS experience without registering. A free Fan account unlocks
              deeper participation around a home-school community, while SuperFan expands the experience across the network.
            </>
          ),
        },
        {
          question: "What is the difference between a Fan and a SuperFan?",
          answer: (
            <>
              A Fan account is free and centers your experience around your home-school community. SuperFan expands access
              across the wider YAT?STATS network so you can follow players from multiple schools and build a more personalized
              experience. SuperFan is currently <strong>$2.99 per month</strong>.{" "}
              <a href="https://yatstats.com" target="_blank" rel="noreferrer">Take the Fan Guided Tour for a visual walkthrough.</a>
            </>
          ),
        },
        {
          question: "What is YAT?STATS Fantasy Alumni Baseball?",
          answer: (
            <>
              It is fantasy baseball with a hometown twist. There is no draft and no fantasy roster for you to manage. A
              participating high school&apos;s real next-level alumni form its fantasy team, and their real-world performance
              drives the school&apos;s results. <strong>You do not manage the team. You root for it.</strong>
            </>
          ),
        },
        {
          question: "Are all YAT?STATS schools in the national fantasy bracket?",
          answer: (
            <>
              No. The season-long national bracket has a designated field of <strong>1,024 high school programs</strong>.
              YAT?STATS can include additional schools and players outside that tournament field as the network expands.
            </>
          ),
        },
        {
          question: "Where can I find the fantasy scoring rules and tournament format?",
          answer: (
            <>
              We keep the detailed scoring system, standings, schedule, tournament structure and tiebreakers with the fantasy
              experience itself so the rules stay current. <a href="#sec-fantasy">Open the Fantasy Alumni Baseball section.</a>
            </>
          ),
        },
      ],
    },
    {
      title: "More Help",
      items: [
        {
          question: "I am a player, coach, booster representative or business owner. Where should I go?",
          answer: (
            <>
              Visit <a href="https://yatstats.com" target="_blank" rel="noreferrer">YATSTATS.com</a> for the full guided-tour
              experience and the deeper FAQ created specifically for Fans, Players & Alumni, Coaches & Booster Clubs, and
              Local Businesses & Sponsors.
            </>
          ),
        },
        {
          question: "I still cannot find what I am looking for. How do I contact YAT?STATS?",
          answer: (
            <>
              Email <a href="mailto:info@yatstats.com">info@yatstats.com</a>. Questions, corrections, historical information,
              missing players and suggestions are welcome.
            </>
          ),
        },
      ],
    },
  ];

  return (
    <div className="espn-faq-shell">
      <header className="espn-faq-header">
        <div className="espn-faq-kicker">{schoolName} Community Hub</div>
        <h2>Frequently Asked Questions</h2>
        <p>
          Start here for the most common questions about YAT?STATS, this Community Hub and how fans can participate.
        </p>
      </header>

      {groups.map((group) => (
        <FaqGroup key={group.title} title={group.title} items={group.items} />
      ))}

      <div className="espn-faq-contact">
        <strong>Still have a question?</strong>
        <span>
          Email <a href="mailto:info@yatstats.com">info@yatstats.com</a> or visit{" "}
          <a href="https://yatstats.com" target="_blank" rel="noreferrer">YATSTATS.com</a> for the full guided tour.
        </span>
      </div>

      <style jsx global>{`
        .espn-faq-shell{
          width:min(860px,calc(100% - 28px));
          margin:0 auto;
          padding:34px 0 56px;
          font-family:var(--yat-font-ui,"Archivo","Helvetica Neue",Arial,sans-serif);
          color:var(--fg,#f2f2f2);
        }
        .espn-faq-header{
          max-width:760px;
          padding:0 0 24px;
          border-bottom:1px solid var(--line,rgba(255,255,255,.12));
        }
        .espn-faq-kicker{
          color:#d2b45c;
          font:700 11px/1 var(--yat-font-ui,"Archivo",Arial,sans-serif);
          letter-spacing:.06em;
          text-transform:uppercase;
        }
        .espn-faq-header h2{
          margin:8px 0 10px;
          font:800 clamp(34px,6vw,56px)/.98 var(--yat-font-display,"Archivo",Arial,sans-serif);
          letter-spacing:-.04em;
        }
        .espn-faq-header p{
          max-width:680px;
          margin:0;
          color:var(--muted,#b7b7b7);
          font:500 15px/1.55 var(--yat-font-ui,"Archivo",Arial,sans-serif);
          letter-spacing:-.01em;
        }
        .espn-faq-group{
          margin-top:34px;
        }
        .espn-faq-group h3{
          margin:0 0 8px;
          color:var(--fg,#fff);
          font:800 19px/1.15 var(--yat-font-ui,"Archivo",Arial,sans-serif);
          letter-spacing:-.025em;
        }
        .espn-faq-list{
          border-top:1px solid var(--line,rgba(255,255,255,.12));
        }
        .espn-faq-item{
          border-bottom:1px solid var(--line,rgba(255,255,255,.12));
          background:transparent;
        }
        .espn-faq-item summary{
          list-style:none;
          cursor:pointer;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:18px;
          padding:17px 2px;
          color:var(--fg,#fff);
          font:700 16px/1.35 var(--yat-font-ui,"Archivo",Arial,sans-serif);
          letter-spacing:-.018em;
        }
        .espn-faq-item summary::-webkit-details-marker{display:none}
        .espn-faq-chevron{
          flex:0 0 auto;
          color:var(--muted,#999);
          font:500 24px/1 var(--yat-font-ui,"Archivo",Arial,sans-serif);
          transform:translateY(-2px);
          transition:transform .16s ease;
        }
        .espn-faq-item[open] .espn-faq-chevron{
          transform:rotate(180deg) translateY(2px);
        }
        .espn-faq-answer{
          max-width:760px;
          padding:0 34px 22px 2px;
          color:color-mix(in srgb,var(--fg,#fff) 84%,transparent);
          font:400 18px/1.62 var(--yat-font-editorial,"Source Serif 4",Georgia,serif);
          letter-spacing:0;
        }
        .espn-faq-answer strong{
          color:var(--fg,#fff);
          font-weight:700;
        }
        .espn-faq-answer a{
          color:#4b9fe1;
          text-decoration:none;
          font-weight:600;
        }
        .espn-faq-answer a:hover{text-decoration:underline}
        .espn-faq-contact{
          display:grid;
          gap:5px;
          margin-top:36px;
          padding:20px 0 0;
          border-top:1px solid var(--line,rgba(255,255,255,.12));
          font-family:var(--yat-font-ui,"Archivo",Arial,sans-serif);
        }
        .espn-faq-contact strong{
          font-size:17px;
          line-height:1.2;
        }
        .espn-faq-contact span{
          color:var(--muted,#aaa);
          font-size:14px;
          line-height:1.55;
        }
        .espn-faq-contact a{
          color:#4b9fe1;
          font-weight:700;
        }
        @media(max-width:640px){
          .espn-faq-shell{width:calc(100% - 24px);padding:24px 0 42px}
          .espn-faq-header{padding-bottom:20px}
          .espn-faq-header h2{font-size:34px;line-height:1}
          .espn-faq-header p{font-size:14px;line-height:1.5}
          .espn-faq-group{margin-top:28px}
          .espn-faq-group h3{font-size:18px}
          .espn-faq-item summary{padding:16px 0;font-size:15px;line-height:1.35}
          .espn-faq-answer{padding:0 20px 20px 0;font-size:17px;line-height:1.6}
        }
        body.light-theme .espn-faq-answer{color:rgba(20,20,20,.84)}
        body.light-theme .espn-faq-answer strong{color:#111}
        body.light-theme .espn-faq-answer a,
        body.light-theme .espn-faq-contact a{color:#1565a8}
      `}</style>
    </div>
  );
}
