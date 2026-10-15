import SportsBlazeRecentResults from '@/components/yatstats/SportsBlazeRecentResults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DREW_MILLAS_PLAYER_ID = '204698';

export default function SportsBlazeDrewDemoPage() {
  return (
    <main className="demo-page">
      <section className="demo-card" aria-label="Drew Millas flip card back preview">
        <div className="hero">
          <div className="meta">
            <div className="name">DREW MILLAS</div>
            <div className="team">WASHINGTON NATIONALS</div>
            <div className="sub">C • MLB • ACTIVE</div>
          </div>
        </div>

        <SportsBlazeRecentResults playerId={DREW_MILLAS_PLAYER_ID} />

        <div className="funzone-placeholder">
          <div className="bar">CAREER / SEASON STATS AREA</div>
          <div className="grid">
            {['AVG', 'AB', 'H', 'OBP', 'R', 'BB'].map((label) => (
              <div className="stat" key={label}>
                <span>{label}</span>
                <strong>--</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="note">
        Preview only: this uses the real SportsBlaze rows currently stored for YAT playerid 204698.
      </p>

      <style>{`
        .demo-page{
          min-height:100vh;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:20px;
          padding:32px;
          background:#1b1a17;
          color:white;
        }
        .demo-card{
          width:min(92vw,420px);
          aspect-ratio:2.5/3.5;
          border-radius:18px;
          overflow:hidden;
          background:#c2b9ae;
          border:10px solid #332719;
          box-shadow:0 18px 50px rgba(0,0,0,.45);
          display:flex;
          flex-direction:column;
          container-type:inline-size;
        }
        .hero{
          min-height:36%;
          position:relative;
          background:
            linear-gradient(90deg,rgba(0,0,0,.78),rgba(0,0,0,.16)),
            url('https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/669231/headshot/67/current') center top / cover no-repeat,
            #2d2d2d;
        }
        .meta{
          position:absolute;
          left:16px;
          top:14px;
          text-transform:uppercase;
          text-shadow:0 2px 8px rgba(0,0,0,.8);
        }
        .name{
          font:800 clamp(24px,7cqi,36px)/.95 'Bebas Neue',Impact,sans-serif;
          letter-spacing:.04em;
        }
        .team{
          margin-top:5px;
          font:700 clamp(12px,3cqi,16px)/1.1 Oswald,Arial,sans-serif;
          letter-spacing:.06em;
        }
        .sub{
          margin-top:3px;
          font:600 clamp(10px,2.4cqi,13px)/1.1 Oswald,Arial,sans-serif;
          color:rgba(255,255,255,.82);
          letter-spacing:.06em;
        }
        .funzone-placeholder{
          flex:1;
          color:#1a1208;
          padding:12px;
          display:flex;
          flex-direction:column;
          gap:10px;
        }
        .bar{
          text-align:center;
          border:1px solid rgba(30,22,14,.25);
          border-radius:7px;
          padding:8px;
          font:800 15px/1 'Bebas Neue',Impact,sans-serif;
          background:rgba(255,255,255,.22);
        }
        .grid{
          display:grid;
          grid-template-columns:repeat(3,1fr);
          gap:8px;
        }
        .stat{
          border-radius:8px;
          background:rgba(255,255,255,.32);
          padding:8px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          font-family:Oswald,Arial,sans-serif;
        }
        .stat span{font-size:12px;color:rgba(30,22,14,.7)}
        .stat strong{font-size:20px;color:#000}
        .note{
          max-width:420px;
          color:rgba(255,255,255,.72);
          font:500 13px/1.35 system-ui,sans-serif;
          text-align:center;
        }
      `}</style>
    </main>
  );
}
