'use client';

// Row 4 of the Connect & Contribute Portal: what each option is, why we need
// it and what we take, under the same icon it has in row 3 and around the
// site. Contribute sections open the drawer; the Connect sections are where
// row 3's Connect icons scroll to.

import { CONTRIBUTE_OPTIONS, DATA_KINDS, PHOTO_TYPES, openContribute, type ContributeTab } from '@/lib/contribute';

const icon = (id: string) => CONTRIBUTE_OPTIONS.find((o) => o.id === id)?.icon || '';

function Section({ id, title, children, tab, cta, soon }: { id: string; title: string; children: React.ReactNode; tab?: ContributeTab; cta?: string; soon?: boolean }) {
  const option = CONTRIBUTE_OPTIONS.find((o) => o.id === id)!;
  return (
    <section className="ccg-sec" id={option.section}>
      <div className="ccg-icon"><i className={icon(id)} aria-hidden="true" /></div>
      <div className="ccg-body">
        <h3>{title}{soon ? <span className="ccg-soon">Coming soon</span> : null}</h3>
        {children}
        {tab ? (
          <button type="button" className="ccg-btn" onClick={() => openContribute({ tab })}>{cta}</button>
        ) : null}
      </div>
    </section>
  );
}

export default function ContributeGuide({ schoolName }: { schoolName: string }) {
  return (
    <div className="ccg">
      <header className="ccg-intro">
        <h2>Connect &amp; Contribute Portal</h2>
        <p>
          YAT?STATS is built by the people who know these players best: their families, coaches, teammates and fans.
          Every next-level alum from {schoolName || 'your school'} gets a flip card, a profile and a Career Path Timeline,
          and a lot of them are still missing a photo, a season or a stat. Instead of wishing it were there, add it.
        </p>
        <p className="ccg-muted">
          Look for these icons on cards and pages all over YAT?STATS. Wherever you see one, that&apos;s something we need,
          and tapping it opens the right form with the player already filled in. Sending takes a free fan account, and we
          review everything before it goes on the site.
        </p>
      </header>

      <h2 className="ccg-group">Contribute</h2>

      <Section id="photo" title="Photos" tab="photo" cta="Send photos">
        <p>
          A silhouette where a photo should be means we don&apos;t have one yet. The <b>High School Photo</b> on the front of
          his flip card is the hardest to find and the one we need most. It&apos;s often in a family album, a yearbook or a
          team photographer&apos;s files.
        </p>
        <ul className="ccg-list">
          {PHOTO_TYPES.map((t) => (
            <li key={t.id}><b>{t.prefix} · {t.label}</b> {t.spec}</li>
          ))}
        </ul>
        <p className="ccg-muted">
          You pick the player and the season, then place each photo in the frame it will have on the site. Please send
          only photos you took or have permission to share, with no watermarks.
        </p>
      </Section>

      <Section id="data" title="Update Data" tab="data" cta="Update data">
        <p>
          Our stats come from public sources, and some leagues and box scores never reach us. If a season is missing,
          a number is wrong or his graduation year is off, tell us, season by season.
        </p>
        <ul className="ccg-list">
          {DATA_KINDS.map((k) => (
            <li key={k.id}><b>{k.label}</b> {k.hint}</li>
          ))}
        </ul>
      </Section>

      <Section id="missing" title="Missing Next-Level Alumni" tab="missing" cta="Add a missing alum">
        <p>
          If he played college, pro or independent ball after high school, he belongs on his school&apos;s YAT?STATS. Tell us
          who he is, his class and where he played, and we&apos;ll add him.
        </p>
      </Section>

      <Section id="tip" title="News Tip" tab="tip" cta="Send a news tip">
        <p>
          A call-up, an award, a big game, a feature story. Send us the link. One tip can show up in Alumni News, on his
          profile and on his flip card.
        </p>
      </Section>

      <p className="ccg-memories">
        * Looking to share personal memories of a player? Post them on his profile page, on his Career Path Timeline:
        click the Polaroid icon at the bottom left of the timeline. Stories there let you tell what happened, and let
        others like, comment, share and tag.
      </p>

      <h2 className="ccg-group">Connect</h2>

      <Section id="player" title="Connect with a Player" soon>
        <p>
          Players will record a short hello for the Connect tab of their profile. From there you&apos;ll be able to request a
          personal video: a birthday shout-out, an answer to your question, or his take on a video of your swing or your
          delivery.
        </p>
      </Section>

      <Section id="sponsor" title="Sponsor this Page" soon>
        <p>
          Put your business on {schoolName ? `${schoolName}'s` : 'this'} YAT?STATS, next to the players and stories the town
          already follows. Sponsorships help keep the hub running and growing.
        </p>
      </Section>

      <style jsx global>{`
        .ccg { max-width: 980px; margin: 0 auto; padding: 18px 16px 48px; display: flex; flex-direction: column; gap: 14px; }
        .ccg h2 { margin: 0; font: 600 26px/1.05 Oswald, sans-serif; letter-spacing: .03em; text-transform: uppercase; }
        .ccg-intro p { margin: 8px 0 0; font-size: 15px; line-height: 1.55; max-width: 760px; }
        .ccg-muted { opacity: .7; }
        .ccg-group { margin-top: 14px !important; padding-bottom: 6px; border-bottom: 2px solid #FFD700; color: #FFD700; font-size: 22px !important; }
        body.light-theme .ccg-group { color: #9a6f00; border-color: #9a6f00; }
        .ccg-sec { display: grid; grid-template-columns: 56px 1fr; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--line);
          scroll-margin-top: calc(var(--row1-h, 56px) + var(--row2-h, 56px) + 96px); }
        .ccg-icon { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; border: 2px solid #FFD700; color: #FFD700; font-size: 25px; }
        body.light-theme .ccg-icon { border-color: #9a6f00; color: #9a6f00; }
        .ccg-body h3 { margin: 4px 0 6px; font: 600 20px/1.1 Oswald, sans-serif; letter-spacing: .03em; text-transform: uppercase; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .ccg-body p { margin: 0 0 8px; font-size: 14px; line-height: 1.55; }
        .ccg-soon { padding: 3px 8px; border: 1px solid currentColor; border-radius: 999px; font: 500 11px/1 Oswald, sans-serif; letter-spacing: .08em; opacity: .7; }
        .ccg-list { margin: 0 0 10px; padding-left: 18px; font-size: 13px; line-height: 1.5; }
        .ccg-list li { margin-bottom: 4px; }
        .ccg-list b { margin-right: 4px; }
        .ccg-btn { min-height: 40px; padding: 0 18px; border-radius: 8px; border: 0; background: #FFD700; color: #000; font: 500 15px/1 Oswald, sans-serif; letter-spacing: .07em; text-transform: uppercase; cursor: pointer; }
        .ccg-memories { margin: 4px 0 0; font-size: 13px; line-height: 1.5; opacity: .8; }
      `}</style>
    </div>
  );
}
