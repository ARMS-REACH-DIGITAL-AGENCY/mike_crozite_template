"use client";
import { useEffect, useState } from "react";
import PlayerScheduleTable, { type ScheduleTableRow } from "@/components/yatstats/PlayerScheduleTable";
type Data = {rows: ScheduleTableRow[];statHeaders:string[];todayIso:string;defaultSeason:number};
export default function ProfileGameLogLoader({playerId}:{playerId:string}) {
  const [data,setData]=useState<Data|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    let cancelled=false, controller:AbortController|null=null;
    const panel=document.getElementById("ppTab-schedule");
    if(!panel)return;
    const load=()=>{
      if(cancelled||controller||data||loading)return;
      controller=new AbortController();
      setLoading(true);
      fetch("/api/player-game-log?playerId="+encodeURIComponent(playerId),{signal:controller.signal})
        .then(async r=>{if(!r.ok)throw new Error("Game log unavailable");return r.json()})
        .then(result=>{if(!cancelled)setData(result)})
        .catch(e=>{if(!cancelled && e.name!=="AbortError")setError(e.message)})
        .finally(()=>{if(!cancelled)setLoading(false)});
    };
    const check=()=>{if(panel.classList.contains("active")||panel.classList.contains("is-active")||panel.classList.contains("pp-fz-panel-active")||!panel.hidden&&getComputedStyle(panel).display!=="none")load()};
    const observer=new MutationObserver(check);
    observer.observe(panel,{attributes:true,attributeFilter:["class","style","hidden"]});
    const onClick=()=>requestAnimationFrame(check);
    document.addEventListener("click",onClick);
    check();
    return ()=>{cancelled=true;controller?.abort();observer.disconnect();document.removeEventListener("click",onClick)};
  },[playerId]);
  if(error)return <div className="pp-fz-placeholder">{error}</div>;
  if(!data)return <div className="pp-fz-placeholder">{loading?"Loading Game Log…":"Select Game Log to load schedule."}</div>;
  return data.rows.length ? <PlayerScheduleTable rows={data.rows} statHeaders={data.statHeaders} todayIso={data.todayIso} defaultSeason={data.defaultSeason}/> : <div className="pp-fz-placeholder">Schedule will appear here once available.</div>;
}
