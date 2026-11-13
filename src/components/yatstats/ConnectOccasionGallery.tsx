'use client';

// Shared, platform-wide preview for Player Profile Connect and the
// Connect & Contribute portal. These cards are request ideas, NOT recorded
// videos or statements that individual alumni have opted in.
const OCCASIONS = [
  { title: 'Birthday', icon: 'ri-cake-2-line', tone: 'gold', description: 'Make their day' },
  { title: 'Pep Talk', icon: 'ri-fire-line', tone: 'maroon', description: 'A little motivation' },
  { title: 'Team Shoutout', icon: 'ri-team-line', tone: 'blue', description: 'For the whole squad' },
  { title: 'Advice', icon: 'ri-lightbulb-flash-line', tone: 'green', description: 'Words that stick' },
] as const;

export default function ConnectOccasionGallery({ playerName }: { playerName?: string }) {
  return (
    <div className="yat-connect-occasions" aria-label="Personalized video message ideas">
      <div className="yat-connect-occasions-head">
        <span>VIDEO MESSAGE IDEAS</span>
        <small>SWIPE TO EXPLORE <i className="ri-arrow-right-line" aria-hidden="true" /></small>
      </div>
      <div className="yat-connect-occasions-track" role="list">
        {OCCASIONS.map((occasion) => (
          <div key={occasion.title} className={`yat-connect-occasion yat-connect-occasion-${occasion.tone}`} role="listitem">
            <span className="yat-connect-occasion-top">PERSONALIZED VIDEO</span>
            <span className="yat-connect-occasion-visual" aria-hidden="true">
              <i className={occasion.icon} />
            </span>
            <span className="yat-connect-occasion-footer">
              <strong>{occasion.title}</strong>
              <small>{occasion.description}</small>
            </span>
          </div>
        ))}
      </div>
      <p className="yat-connect-occasions-note">
        These are examples of what fans could request{playerName ? ` from ${playerName}` : ''}.
        Sample videos will appear when alumni introductions are approved. Bookings are not open yet.
      </p>
      <style jsx>{`
        .yat-connect-occasions{width:100%;min-width:0;}
        .yat-connect-occasions-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 9px;color:inherit;}
        .yat-connect-occasions-head>span{font:800 13px/1.1 var(--yat-font-compact,'Arial Narrow',sans-serif);letter-spacing:.075em;}
        .yat-connect-occasions-head>small{display:flex;align-items:center;gap:4px;color:var(--muted,#a8a8a8);font:700 10px/1.1 var(--yat-font-ui,Arial,sans-serif);white-space:nowrap;}
        .yat-connect-occasions-track{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(125px, min(38%, 175px));gap:16px;width:100%;padding:0 7px 10px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:thin;scrollbar-color:#c99832 transparent;}
        .yat-connect-occasion{position:relative;isolation:isolate;display:flex;flex-direction:column;justify-content:space-between;min-width:0;aspect-ratio:4/5;min-height:150px;padding:10px;border:1px solid #ffffff57;border-radius:15px;color:#fff;overflow:hidden;scroll-snap-align:start;box-shadow:inset 0 -35px 55px #0009;}
        .yat-connect-occasion::before{content:'';position:absolute;z-index:-1;inset:20% -30% auto;aspect-ratio:1;border:1px solid #ffffff25;border-radius:50%;box-shadow:0 0 0 23px #ffffff09,0 0 0 58px #ffffff06;transform:rotate(-14deg);}
        .yat-connect-occasion-gold{background:radial-gradient(circle at 35% 35%,#a77b32,#493016 58%,#17120e);}
        .yat-connect-occasion-maroon{background:radial-gradient(circle at 30% 30%,#9b4350,#4a1429 57%,#180a15);}
        .yat-connect-occasion-blue{background:radial-gradient(circle at 35% 30%,#397eae,#1b3857 55%,#0a1526);}
        .yat-connect-occasion-green{background:radial-gradient(circle at 40% 33%,#507c66,#214336 57%,#0b1a16);}
        .yat-connect-occasion-top{font:700 9px/1.15 var(--yat-font-ui,Arial,sans-serif);letter-spacing:.11em;opacity:.92;}
        .yat-connect-occasion-visual{display:flex;align-items:center;justify-content:center;align-self:center;width:65px;height:65px;margin:4px 0;border:2px solid #ffffffb8;border-radius:50%;background:#0003;}
        .yat-connect-occasion-visual i{font-size:35px;line-height:1;}
        .yat-connect-occasion-footer{display:flex;flex-direction:column;gap:3px;text-shadow:0 1px 5px #000;}
        .yat-connect-occasion-footer strong{font:900 clamp(17px,2vw,22px)/1.05 var(--yat-font-compact,'Arial Narrow',sans-serif);text-transform:uppercase;}
        .yat-connect-occasion-footer small{font:500 10px/1.3 var(--yat-font-ui,Arial,sans-serif);color:#eee;}
        .yat-connect-occasions-note{margin:5px 0 0;color:var(--muted,#a8a8a8);font:400 11px/1.4 var(--yat-font-ui,Arial,sans-serif);}
        @media(max-width:600px){
          .yat-connect-occasions-track{grid-auto-columns:minmax(118px,41%);gap:16px;padding:0 9px 10px;}
          .yat-connect-occasion{padding:10px;min-height:160px;}
          .yat-connect-occasion-visual{width:60px;height:60px;}
        }
      `}</style>
    </div>
  );
}
