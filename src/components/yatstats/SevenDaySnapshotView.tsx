'use client';

import type { SnapshotItem } from './PlayerSevenDaySnapshot';

// Box-score style: "2-4 | 2B, 1 RBI, 1 R, BB, 1K" - the only divider sits
// after hits-at-bats, everything else is comma-separated (the batting
// line_summary stores " | " between every stat; pitching lines are already
// all commas). Each stat is unbreakable, so a long line wraps to a second
// line at a comma instead of being cut off mid-stat.
function StatLine({ text, className }: { text: string; className: string }) {
  const pieces = text.split(/\s*\|\s*|,\s+/).filter(Boolean);
  const leadsWithHitsAtBats = /^\d+-\d+$/.test(pieces[0] || '') && pieces.length > 1;
  const rest = leadsWithHitsAtBats ? pieces.slice(1) : pieces;
  return (
    <div className={className}>
      {leadsWithHitsAtBats && (
        <>
          <span className="yat-snap-stat-piece">{pieces[0]}</span>
          <span className="yat-snap-stat-bar" aria-hidden="true"> | </span>
        </>
      )}
      {rest.map((piece, i) => (
        <span key={i}>
          <span className="yat-snap-stat-piece">{piece}</span>
          {i < rest.length - 1 ? ', ' : ''}
        </span>
      ))}
    </div>
  );
}

/**
 * Lives inside FunZone's GAME LOG tab panel (passed in as a prop from
 * PlayerCardBack, since this is an async Server Component and FunZone is a
 * Client Component) - not a standalone section above the tab strip, and not
 * its own CTA (FunZone's YatiCta strip already says "See X's full season
 * schedule & game log..." for this tab). Typography matches the rest of
 * FunZone: Bebas Neue for headlines, Oswald for labels/body - no script font.
 */
export default function SevenDaySnapshotView({ items, todayIso, profileHref }: { items: SnapshotItem[]; todayIso: string; profileHref: string }) {
  return (
    <div className="yat-snap" aria-label="7-Day Snapshot - schedule and game log">
      <div className="yat-snap-title">7-Day Snapshot</div>

      <div className="yat-snap-rows">
        {items.map((item, idx) => {
          const isToday = item.iso === todayIso;
          const d = new Date(`${item.iso}T00:00:00Z`);
          const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
          const dayNum = d.getUTCDate();
          const dow = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();

          return (
            <a
              className={`yat-snap-row${isToday ? ' yat-snap-row-today' : ''}`}
              href={profileHref}
              key={`${item.iso}-${idx}`}
            >
              <div className={`yat-snap-date${isToday ? ' yat-snap-date-today' : ''}`}>
                {!isToday && <span className="yat-snap-date-mon">{mon}</span>}
                <div className="yat-snap-date-stack">
                  <span className="yat-snap-date-day">{isToday ? 'TODAY' : dayNum}</span>
                  <span className="yat-snap-date-dow">{dow}</span>
                </div>
              </div>

              {item.kind === 'game' ? (
                <>
                  <div className="yat-snap-team">
                    <span className="yat-snap-logo">
                      {item.game.logoUrl && <img src={item.game.logoUrl} alt="" loading="lazy" />}
                    </span>
                    <div className="yat-snap-team-text">
                      <div className="yat-snap-matchup">
                        <span className="yat-snap-matchup-prefix">{item.game.isHome ? 'vs' : '@'}</span>
                        <span className="yat-snap-matchup-team">{item.game.opponentLabel}</span>
                      </div>
                      {item.game.venue && <div className="yat-snap-venue">{item.game.venue}</div>}
                    </div>
                  </div>

                  {item.game.resultClass === 'time' && !item.game.subLine ? (
                    // Upcoming game, no line yet: the start time gets the
                    // score + line columns instead of a lone "-".
                    <div className="yat-snap-score yat-snap-score-time yat-snap-score-wide">{item.game.resultLine}</div>
                  ) : (
                    <>
                      <div className={`yat-snap-score yat-snap-score-${item.game.resultClass}`}>{item.game.resultLine}</div>
                      <StatLine className="yat-snap-statline" text={item.game.subLine || '-'} />
                    </>
                  )}
                </>
              ) : item.kind === 'doubleheader' ? (
                // Game 1 sits where every other row's opponent sits (same
                // logo slot, same "vs/@ TEAM"); game 2 starts at the line
                // score column, about halfway across.
                <>
                  {item.games.slice(0, 2).map((g, gi) => (
                    <div className={`yat-snap-dh-game yat-snap-dh-game-${gi + 1}`} key={gi}>
                      <span className="yat-snap-logo">
                        {g.logoUrl && <img src={g.logoUrl} alt="" loading="lazy" />}
                      </span>
                      <div className="yat-snap-matchup">
                        <span className="yat-snap-matchup-prefix">{g.isHome ? 'vs' : '@'}</span>
                        <span className="yat-snap-matchup-team">{g.opponentLabel}</span>
                      </div>
                      <div className={`yat-snap-dh-score yat-snap-score-${g.resultClass}`}>{g.resultLine}</div>
                      {!(g.resultClass === 'time' && !g.subLine) && (
                        <StatLine className="yat-snap-dh-stat" text={g.subLine || '-'} />
                      )}
                    </div>
                  ))}
                </>
              ) : item.kind === 'offday' ? (
                <div className="yat-snap-offday">Off Day</div>
              ) : (
                <div className="yat-snap-offday yat-snap-unknown">Schedule unavailable</div>
              )}
            </a>
          );
        })}
      </div>

      <style>{`
        .yat-snap{
          --snap-logo:clamp(15px,5cqi,26px);
          --snap-logo-gap:clamp(3px,1cqi,7px);
          --snap-col-gap:clamp(4px,1.4cqi,8px);
          display:flex;
          flex-direction:column;
          height:100%;
          min-height:0;
          overflow:hidden;
          background:linear-gradient(180deg,#f7f3ea,#ece5d5);
          border:1px solid rgba(30,22,14,0.18);
          border-radius:clamp(4px,1.2cqi,8px);
          padding:clamp(3px,1.2cqi,7px);
        }
        .yat-snap-title{
          flex:0 0 auto;
          text-align:center;
          font:700 clamp(8px,2.8cqi,14px)/1 "Bebas Neue",sans-serif;
          letter-spacing:.1em;
          text-transform:uppercase;
          color:#3a2f24;
          padding-bottom:clamp(2px,.8cqi,5px);
          margin-bottom:clamp(2px,.8cqi,5px);
          border-bottom:1px solid rgba(30,22,14,0.16);
        }
        .yat-snap-rows{
          flex:1;
          min-height:0;
          display:flex;
          flex-direction:column;
          gap:clamp(2px,.8cqi,5px);
        }
        .yat-snap-row{
          flex:1;
          min-height:0;
          display:grid;
          grid-template-columns:clamp(34px,12.5cqi,52px) clamp(60px,21.5cqi,98px) clamp(26px,9cqi,44px) minmax(0,1fr);
          align-items:center;
          gap:var(--snap-col-gap);
          text-decoration:none;
          color:inherit;
          background:rgba(255,255,255,0.72);
          border:1px solid rgba(30,22,14,0.10);
          border-radius:clamp(4px,1.2cqi,7px);
          padding:clamp(2px,1cqi,6px) clamp(6px,1.6cqi,10px);
          box-shadow:0 1px 2px rgba(0,0,0,0.06);
          min-width:0;
          overflow:hidden;
        }
        .yat-snap-row-today{
          background:rgba(255,255,255,0.94);
          border-color:rgba(30,22,14,0.24);
        }
        .yat-snap-date{
          display:flex;
          align-items:center;
          gap:clamp(3px,1cqi,6px);
          line-height:1;
          min-width:0;
        }
        .yat-snap-date-mon{
          font:700 clamp(6px,1.9cqi,9px)/1 Oswald,sans-serif;
          letter-spacing:.05em;
          color:#8a7c68;
        }
        .yat-snap-date-stack{
          display:flex;
          flex-direction:column;
          align-items:flex-start;
          line-height:1;
        }
        .yat-snap-date-day{
          font:700 clamp(10px,3.6cqi,18px)/1.05 "Bebas Neue",sans-serif;
          color:#17120c;
          white-space:nowrap;
        }
        .yat-snap-date-dow{
          font:700 clamp(6px,1.9cqi,9px)/1 Oswald,sans-serif;
          letter-spacing:.05em;
          color:#8a7c68;
        }
        .yat-snap-date-today .yat-snap-date-day{
          font-size:clamp(9px,3.2cqi,15px);
          letter-spacing:.04em;
          color:#8a4a2c;
        }
        .yat-snap-team{
          display:flex;
          align-items:center;
          gap:var(--snap-logo-gap);
          min-width:0;
        }
        /* Fixed logo slot, kept even when a logo is missing, so every
           row's "vs/@ TEAM" (and OFF DAY) starts at the same x. */
        .yat-snap-logo{
          width:var(--snap-logo);
          height:var(--snap-logo);
          flex:0 0 auto;
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .yat-snap-logo img{
          width:100%;
          height:100%;
          object-fit:contain;
        }
        .yat-snap-team-text{
          min-width:0;
          display:flex;
          flex-direction:column;
        }
        .yat-snap-matchup{
          display:flex;
          align-items:baseline;
          gap:.3em;
          min-width:0;
          white-space:nowrap;
          overflow:hidden;
        }
        .yat-snap-matchup-prefix{
          font:400 clamp(6.5px,2.1cqi,10px)/1 Oswald,sans-serif;
          text-transform:lowercase;
          color:#8a7c68;
          flex:0 0 auto;
        }
        .yat-snap-matchup-team{
          font:700 clamp(8px,2.7cqi,13px)/1.15 Oswald,sans-serif;
          letter-spacing:.02em;
          text-transform:uppercase;
          color:#221a12;
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-venue{
          font:400 clamp(6.5px,2.1cqi,9.5px)/1.15 Oswald,sans-serif;
          color:#8a7c68;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-score{
          font:700 clamp(8px,2.6cqi,13px)/1.1 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.02em;
          white-space:nowrap;
          text-align:left;
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-score-wide{ grid-column:3 / -1; word-spacing:.2em; }
        .yat-snap-score-win{ color:#1c7a3e; }
        .yat-snap-score-loss{ color:#b4232c; }
        .yat-snap-score-tie{ color:#4a4038; }
        .yat-snap-score-live{ color:#b4232c; }
        .yat-snap-score-time{ color:#221a12; }
        .yat-snap-score-ppd{ color:#8a7c68; }
        .yat-snap-statline{
          font:400 clamp(10px,3.6cqi,16px)/1.05 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.02em;
          color:#221a12;
          min-width:0;
          max-height:2.1em;
          overflow:hidden;
        }
        .yat-snap-stat-piece{ white-space:nowrap; }
        .yat-snap-stat-bar{ color:#a89a86; }
        .yat-snap-offday{
          grid-column:2 / -1;
          padding-left:calc(var(--snap-logo) + var(--snap-logo-gap));
          min-width:0;
          text-align:left;
          font:700 clamp(7px,2.4cqi,11px)/1 Oswald,sans-serif;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:#a89a86;
        }
        .yat-snap-unknown{ color:#c2b9ae; }

        /* Doubleheader: one calendar day, two games - side by side in the
           same row instead of a second row, so the window always stays at
           exactly 7 rows regardless of how many games fall in it. */
        .yat-snap-dh-game{
          min-width:0;
          display:flex;
          align-items:center;
          gap:var(--snap-logo-gap);
          overflow:hidden;
        }
        .yat-snap-dh-game-1{ grid-column:2 / 4; }
        .yat-snap-dh-game-2{
          grid-column:4 / 5;
          position:relative;
          overflow:visible;
        }
        .yat-snap-dh-game-2::before{
          content:"";
          position:absolute;
          left:calc(var(--snap-col-gap) / -2);
          top:10%;
          bottom:10%;
          border-left:1px solid rgba(30,22,14,0.14);
        }
        .yat-snap-dh-game .yat-snap-matchup{ flex:0 0 auto; }
        .yat-snap-dh-score{
          flex:0 0 auto;
          font:700 clamp(7px,2.3cqi,10.5px)/1.1 "Bebas Neue",Oswald,sans-serif;
          white-space:nowrap;
        }
        .yat-snap-dh-stat{
          flex:1;
          min-width:0;
          font:400 clamp(7.5px,2.7cqi,12px)/1.05 "Bebas Neue",Oswald,sans-serif;
          letter-spacing:.03em;
          color:#221a12;
          max-height:2.1em;
          overflow:hidden;
        }
      `}</style>
    </div>
  );
}
