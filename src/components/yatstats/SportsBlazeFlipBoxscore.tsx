// src/components/yatstats/SportsBlazeFlipBoxscore.tsx
// Server component: renders real SportsBlaze boxscores directly on flip-card backs.
// It never exposes SPORTSBLAZE_KEY to the browser.

import { getSportsBlazeHamiltonWatch } from "@/lib/sportsblaze";

interface SportsBlazeFlipBoxscoreProps {
  playerName: string;
  playerTeam?: string;
}

export default async function SportsBlazeFlipBoxscore({ playerName, playerTeam }: SportsBlazeFlipBoxscoreProps) {
  const activity = await getSportsBlazeHamiltonWatch({
    league: "nfl",
    date: "2025-02-09",
    hsid: "5004",
  });

  const games = activity.games || [];
  const teamNeedle = String(playerTeam || "").toLowerCase();
  const matchedGame = teamNeedle
    ? games.find((game) =>
        game.homeTeam.toLowerCase().includes(teamNeedle) ||
        game.awayTeam.toLowerCase().includes(teamNeedle) ||
        teamNeedle.includes(game.homeTeam.toLowerCase()) ||
        teamNeedle.includes(game.awayTeam.toLowerCase())
      )
    : null;
  const game = matchedGame || games[0];

  return (
    <div className="sb-card-back-boxscore" data-sportsblaze-mode={activity.mode}>
      <div className="sbcb-head">
        <span className="sbcb-source">SportsBlaze Live Boxscore</span>
        <span className={`sbcb-mode sbcb-mode-${activity.mode}`}>{activity.mode.toUpperCase()}</span>
      </div>

      {activity.mode !== "live" ? (
        <div className="sbcb-error">
          {activity.mode === "missing-key"
            ? "Missing SPORTSBLAZE_KEY in Vercel Preview/Production env."
            : activity.error || "SportsBlaze API error."}
        </div>
      ) : game ? (
        <div className="sbcb-game">
          <div className="sbcb-teams">
            <span>{game.awayTeam}</span>
            <strong>{game.awayScore}</strong>
            <em>@</em>
            <span>{game.homeTeam}</span>
            <strong>{game.homeScore}</strong>
          </div>
          <div className="sbcb-detail">
            <span>{game.status}</span>
            <span>{activity.league}</span>
            <span>{activity.date}</span>
          </div>
          <div className="sbcb-note">
            Showing real SportsBlaze boxscore data on {playerName}&apos;s flip-card back. Player-level matching comes next.
          </div>
        </div>
      ) : (
        <div className="sbcb-error">SportsBlaze returned live data, but no game array was found.</div>
      )}

      <style>{`
        .sb-card-back-boxscore{
          margin:clamp(3px,1.2cqi,7px) clamp(5px,2.5cqi,12px) 0;
          padding:clamp(4px,1.5cqi,8px);
          border:1px solid rgba(30,22,14,.28);
          background:rgba(255,255,255,.42);
          color:#1a1208;
          flex-shrink:0;
        }
        .sbcb-head{
          display:flex;
          justify-content:space-between;
          gap:6px;
          align-items:center;
          margin-bottom:clamp(3px,1cqi,6px);
        }
        .sbcb-source{
          font:700 clamp(5px,1.8cqi,8px)/1 Oswald,sans-serif;
          letter-spacing:.1em;
          text-transform:uppercase;
          color:rgba(30,22,14,.78);
        }
        .sbcb-mode{
          font:700 clamp(5px,1.7cqi,7px)/1 Oswald,sans-serif;
          letter-spacing:.08em;
          text-transform:uppercase;
          padding:3px 5px;
          border:1px solid rgba(30,22,14,.25);
        }
        .sbcb-mode-live{color:#006b38;border-color:#006b38;background:rgba(0,107,56,.08)}
        .sbcb-mode-missing-key,.sbcb-mode-api-error{color:#7a1d1d;border-color:#7a1d1d;background:rgba(122,29,29,.08)}
        .sbcb-error{
          font:600 clamp(6px,2cqi,9px)/1.35 Oswald,sans-serif;
          color:#7a1d1d;
        }
        .sbcb-game{display:flex;flex-direction:column;gap:clamp(2px,.8cqi,5px)}
        .sbcb-teams{
          display:grid;
          grid-template-columns:1fr auto auto 1fr auto;
          gap:clamp(3px,1cqi,7px);
          align-items:center;
          font:700 clamp(7px,2.3cqi,11px)/1.1 Oswald,sans-serif;
          text-transform:uppercase;
        }
        .sbcb-teams span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sbcb-teams strong{font:700 clamp(10px,3.2cqi,16px)/1 "Bebas Neue",sans-serif;color:#111}
        .sbcb-teams em{font-style:normal;color:rgba(30,22,14,.45);font-size:clamp(6px,1.8cqi,8px)}
        .sbcb-detail{
          display:flex;
          gap:6px;
          flex-wrap:wrap;
          font:700 clamp(5px,1.7cqi,7px)/1 Oswald,sans-serif;
          letter-spacing:.08em;
          color:rgba(30,22,14,.55);
          text-transform:uppercase;
        }
        .sbcb-note{
          font:400 clamp(5px,1.8cqi,8px)/1.35 Oswald,sans-serif;
          color:rgba(30,22,14,.65);
        }
      `}</style>
    </div>
  );
}
