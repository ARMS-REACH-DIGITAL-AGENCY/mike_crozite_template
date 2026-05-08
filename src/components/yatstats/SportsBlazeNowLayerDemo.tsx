// src/components/yatstats/SportsBlazeNowLayerDemo.tsx
// SportsBlaze trial screen. This intentionally displays only real provider data
// when SPORTSBLAZE_KEY is present. No invented Hamilton alumni stat lines.

import type { YatAlumniActivity } from "@/lib/sportsblaze";

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sb-pill">
      <div className="sb-pill-value">{value}</div>
      <div className="sb-pill-label">{label}</div>
    </div>
  );
}

export default function SportsBlazeNowLayerDemo({ activity }: { activity: YatAlumniActivity }) {
  const firstGame = activity.games[0];
  const secondGame = activity.games[1] || firstGame;

  return (
    <section className="sportsblaze-yat-demo" aria-label="SportsBlaze YAT Now Layer Demo">
      <div className="sb-proofbar">
        <div>
          <div className="sb-kicker">SPORTSBLAZE API TEST → YAT?STATS NOW LAYER</div>
          <h1>Real provider feed test before YAT?STATS player matching</h1>
          <p>
            Provider mode: <strong>{activity.mode.toUpperCase()}</strong> · League: <strong>{activity.league}</strong> · Date: <strong>{activity.date}</strong>
          </p>
          {activity.sourceUrl && <p>Source: <strong>{activity.sourceUrl}</strong></p>}
          {activity.error && <p className="sb-error">{activity.error}</p>}
        </div>
        <div className="sb-proof-meta">
          <span>{activity.rawShape?.gameArrayPath || "provider shape pending"}</span>
          <span>{activity.rawShape?.gameCount ?? 0} provider games</span>
        </div>
      </div>

      <div className="sb-school-strip">
        <div>
          <div className="sb-school-small">CHANDLER, AZ</div>
          <div className="sb-school-name">HAMILTON HIGH SCHOOL</div>
          <div className="sb-school-sub">SPORTSBLAZE TRIAL: RAW SPORTS DATA → FUTURE ALUMNI ACTIVITY</div>
        </div>
        <div className="sb-strip-stats">
          <StatPill label="PROVIDER GAMES" value={activity.summary.providerGames} />
          <StatPill label="FINAL" value={activity.summary.finalGames} />
          <StatPill label="UPCOMING" value={activity.summary.upcomingGames} />
          <StatPill label="YAT MATCHED" value={activity.summary.matchedPlayers} />
        </div>
      </div>

      {activity.mode !== "live" ? (
        <article className="sb-card sb-wide">
          <div className="sb-card-label">Not live yet</div>
          <h2>No real SportsBlaze payload is being rendered</h2>
          <p className="sb-muted">
            The app is deliberately not showing fake alumni stat lines anymore. Add SPORTSBLAZE_KEY to the Vercel Preview environment for this project and redeploy this branch.
          </p>
          <pre className="sb-errorbox">{activity.error}</pre>
        </article>
      ) : (
        <div className="sb-grid">
          <article className="sb-card sb-home-module">
            <div className="sb-card-label">Real SportsBlaze games returned</div>
            <h2>Provider Game Feed</h2>
            <p className="sb-muted">
              These are real games from SportsBlaze. The next implementation step is mapping provider teams/players to YAT?STATS playerids before placing it inside FlipCards.
            </p>
            <div className="sb-watch-list">
              {activity.games.map((g) => (
                <div className="sb-watch-row" key={g.id}>
                  <div>
                    <strong>{g.awayTeam} @ {g.homeTeam}</strong>
                    <span>{g.label}</span>
                    {g.venue && <span>{g.venue}</span>}
                  </div>
                  <em>{g.status}</em>
                </div>
              ))}
            </div>
          </article>

          <article className="sb-card sb-flip-card">
            <div className="sb-card-label">Future FlipCard back slot</div>
            <div className="sb-faux-card">
              <div className="sb-faux-hero">
                <div>
                  <h3>{firstGame?.awayTeam || "Away"} @ {firstGame?.homeTeam || "Home"}</h3>
                  <p>SportsBlaze real game object</p>
                </div>
                <span>{firstGame?.status || "--"}</span>
              </div>
              <div className="sb-faux-body">
                <div className="sb-mini-label">REAL GAME LABEL</div>
                <strong>{firstGame?.label || "No provider game returned"}</strong>
                <div className="sb-mini-label">SCORES</div>
                <strong>{firstGame ? `${firstGame.awayScore} - ${firstGame.homeScore}` : "--"}</strong>
                <p className="sb-yati">
                  YaTi should not talk about a Hamilton alum until this SportsBlaze game/player is matched to a YAT?STATS playerid.
                </p>
              </div>
            </div>
          </article>

          <article className="sb-card sb-profile-module">
            <div className="sb-card-label">Future Player Profile Current YAT Status</div>
            <h2>Provider Game Detail</h2>
            <h3>{secondGame?.label || "No second game"}</h3>
            <div className="sb-status-grid">
              <div><span>Away</span><strong>{secondGame?.awayTeam || "--"}</strong></div>
              <div><span>Home</span><strong>{secondGame?.homeTeam || "--"}</strong></div>
              <div><span>Away Score</span><strong>{secondGame?.awayScore || "--"}</strong></div>
              <div><span>Home Score</span><strong>{secondGame?.homeScore || "--"}</strong></div>
            </div>
            <p className="sb-yati">This becomes a profile module only after sportsblaze_player_map links provider IDs to a YAT playerid.</p>
          </article>

          <article className="sb-card sb-funzone">
            <div className="sb-card-label">Future FunZone</div>
            <h2>Real Game Pick'em</h2>
            <p className="sb-muted">A FunZone prompt can be generated from real provider games today, then scoped to alumni after matching.</p>
            {activity.games.slice(0, 3).map((g, idx) => (
              <button className="sb-pick" key={g.id}>
                <span>{idx + 1}</span>
                <strong>{g.awayTeam} @ {g.homeTeam}</strong>
                <em>{g.label}</em>
              </button>
            ))}
            <div className="sb-points">Yadaboy points should only activate after we confirm this game contains a tracked YAT alum.</div>
          </article>
        </div>
      )}

      <details className="sb-json" open>
        <summary>Show real normalized provider object / error state</summary>
        <pre>{JSON.stringify(activity, null, 2)}</pre>
      </details>

      <style>{`
        .sportsblaze-yat-demo{max-width:1180px;margin:0 auto;padding:24px 16px 80px;color:#f5f1e8;font-family:Oswald,Arial,sans-serif;background:#080808}
        .sb-proofbar{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border:1px solid rgba(255,255,255,.14);background:#111;padding:18px;margin-bottom:14px}
        .sb-kicker,.sb-card-label,.sb-mini-label{font:700 11px/1 Oswald,sans-serif;letter-spacing:.14em;color:#39d98a;text-transform:uppercase}
        .sb-proofbar h1{font:700 34px/1 Bebas Neue,Impact,sans-serif;margin:7px 0 6px;letter-spacing:.04em;text-transform:uppercase}
        .sb-proofbar p{margin:0 0 4px;color:#bdb7ab;font-size:13px;line-height:1.45}.sb-error{color:#ffb3b3!important;margin-top:8px!important}.sb-proof-meta{display:flex;flex-direction:column;gap:6px;align-items:flex-end;font-size:11px;color:#9d9588;text-transform:uppercase}.sb-proof-meta span{border:1px solid rgba(255,255,255,.16);padding:6px 8px;background:#050505}
        .sb-school-strip{display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid rgba(255,255,255,.14);background:#050505;padding:14px 16px;margin-bottom:16px}.sb-school-small{font-size:10px;color:#aaa;letter-spacing:.12em}.sb-school-name{font:700 28px/1 Bebas Neue,Impact,sans-serif;letter-spacing:.04em}.sb-school-sub{font-size:12px;color:#39d98a;letter-spacing:.08em}.sb-strip-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sb-pill{min-width:88px;text-align:center;border:1px solid rgba(255,255,255,.16);padding:8px 10px;background:#111}.sb-pill-value{font:700 28px/1 Bebas Neue,Impact,sans-serif}.sb-pill-label{font-size:9px;color:#9b958a;letter-spacing:.13em}
        .sb-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.sb-card{border:1px solid rgba(255,255,255,.14);background:#111;padding:16px;min-height:300px}.sb-wide{grid-column:1/-1;min-height:160px}.sb-card h2{font:700 28px/1 Bebas Neue,Impact,sans-serif;margin:8px 0 10px;letter-spacing:.04em;text-transform:uppercase}.sb-card h3{font:700 22px/1 Bebas Neue,Impact,sans-serif;margin:8px 0;text-transform:uppercase}.sb-muted{color:#aaa;font-size:13px;line-height:1.45}.sb-watch-list{display:flex;flex-direction:column;gap:8px;margin:14px 0}.sb-watch-row{display:flex;justify-content:space-between;gap:10px;padding:10px;border:1px solid rgba(255,255,255,.12);background:#080808}.sb-watch-row strong{display:block;font-size:15px}.sb-watch-row span{display:block;color:#aaa;font-size:12px;margin-top:2px}.sb-watch-row em{font-style:normal;color:#39d98a;font-size:11px}.sb-points{margin-top:14px;border:1px dashed rgba(57,217,138,.5);padding:10px;color:#39d98a;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.sb-errorbox{white-space:pre-wrap;background:#260b0b;border:1px solid rgba(255,100,100,.35);color:#ffb3b3;padding:12px}
        .sb-faux-card{background:#c2b9ae;color:#1b1712;border:5px solid #2a2118;max-width:360px;margin:10px auto 0;min-height:420px}.sb-faux-hero{height:132px;background:linear-gradient(120deg,#111,#333);color:white;display:flex;justify-content:space-between;align-items:flex-start;padding:12px}.sb-faux-hero h3{margin:0;color:white}.sb-faux-hero p{font-size:12px;margin:3px 0 0;color:#ddd}.sb-faux-hero span{font-size:10px;color:#39d98a;border:1px solid #39d98a;padding:4px 6px}.sb-faux-body{padding:14px}.sb-faux-body strong{display:block;margin:4px 0 12px;font-size:18px}.sb-yati{font-size:13px;line-height:1.45;color:inherit;background:rgba(57,217,138,.12);border-left:3px solid #39d98a;padding:10px;margin:12px 0}
        .sb-status-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.sb-status-grid div{background:#080808;border:1px solid rgba(255,255,255,.12);padding:12px}.sb-status-grid span{display:block;color:#9b958a;font-size:10px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px}.sb-status-grid strong{font-size:16px}.sb-pick{width:100%;display:grid;grid-template-columns:28px 1fr;gap:8px;text-align:left;align-items:center;margin:8px 0;background:#080808;color:#f5f1e8;border:1px solid rgba(255,255,255,.14);padding:8px 10px;font:700 11px/1 Oswald,sans-serif;text-transform:uppercase;cursor:pointer}.sb-pick span{grid-row:span 2;color:#39d98a;font:700 24px/1 Bebas Neue,Impact,sans-serif}.sb-pick em{font-style:normal;color:#aaa;font-size:11px;grid-column:2}.sb-json{margin-top:16px;border:1px solid rgba(255,255,255,.14);background:#050505;padding:12px}.sb-json summary{cursor:pointer;color:#39d98a;text-transform:uppercase;font-size:12px;letter-spacing:.08em}.sb-json pre{white-space:pre-wrap;font-size:11px;color:#ccc;overflow:auto;max-height:620px}
        @media(max-width:860px){.sb-grid{grid-template-columns:1fr}.sb-school-strip,.sb-proofbar{flex-direction:column}.sb-strip-stats{grid-template-columns:repeat(2,1fr);width:100%}.sb-proof-meta{align-items:flex-start}.sb-status-grid{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
