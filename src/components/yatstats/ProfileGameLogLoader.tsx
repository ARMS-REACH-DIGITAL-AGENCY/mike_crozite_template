"use client";

import { useEffect, useState } from "react";
import PlayerScheduleTable, { type ScheduleTableRow } from "@/components/yatstats/PlayerScheduleTable";

type GameLog = {
  rows: ScheduleTableRow[];
  statHeaders: string[];
  todayIso: string;
  defaultSeason: number;
};

export default function ProfileGameLogLoader({
  playerId,
  isPitcher,
  mostRecentTeamId,
}: {
  playerId: string;
  isPitcher: boolean;
  mostRecentTeamId: string | null;
}) {
  const [data, setData] = useState<GameLog | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let started = false;
    const controller = new AbortController();
    const panel = document.getElementById("ppTab-schedule");
    if (!panel) return;
    const check = () => {
      if (cancelled || started) return;
      // These tabs use :target CSS. A hashchange is not a DOM mutation.
      if (window.location.hash !== "#ppTab-schedule" &&
          window.getComputedStyle(panel).display === "none") return;
      started = true;
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        playerId,
        pitcher: isPitcher ? "1" : "0",
        ...(mostRecentTeamId ? { teamid: mostRecentTeamId } : {}),
      });
      fetch("/api/player-game-log?" + params.toString(), { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error("Game Log unavailable. Try again.");
          return response.json() as Promise<GameLog>;
        })
        .then(result => { if (!cancelled) setData(result); })
        .catch(reason => {
          if (!cancelled && reason?.name !== "AbortError") {
            setError(reason instanceof Error ? reason.message : "Game Log unavailable.");
          }
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    window.addEventListener("hashchange", check);
    // Support client-side tabs that switch CSS classes instead of URL hashes.
    const observer = new MutationObserver(check);
    observer.observe(panel, { attributes: true, attributeFilter: ["class","style","hidden"] });
    check();
    return () => {
      cancelled = true;
      controller.abort();
      observer.disconnect();
      window.removeEventListener("hashchange", check);
    };
  }, [playerId, isPitcher, mostRecentTeamId, retry]);

  if (data) return data.rows.length
    ? <PlayerScheduleTable rows={data.rows} statHeaders={data.statHeaders}
        todayIso={data.todayIso} defaultSeason={data.defaultSeason} />
    : <div className="pp-fz-placeholder">Schedule will appear here once available.</div>;

  if (error) return <div className="pp-fz-placeholder" role="alert">
    <p>{error}</p>
    <button type="button" onClick={() => setRetry(value => value + 1)}>Retry Game Log</button>
  </div>;
  return <div className="pp-fz-placeholder" aria-live="polite">
    {loading ? "Loading Game Log…" : "Game Log will load when opened."}
  </div>;
}
