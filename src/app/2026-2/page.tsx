'use client';
import { useEffect, useMemo, useState } from 'react';

type Game = [number,number,number,number,number,number,number,number,number,number,number,string,string,number,number,number,string,number[]];
type Replay={season:string;start:string;end:string;weeks:number;schools:number;gamesTotal:number;lines:number;passes:number;fingerprint:string;champion:{hsid:number;home:string;away:string;homeRuns:number;awayRuns:number};games:Game[]};
const stageNames=['Main Bracket','Total Runs','Season Championship','World Series'];
const formatSchool=(s:string)=>s?.replace(/\\s*\\([^)]+\\)$/,'').trim() || 'Unknown School';
const date=(week:number, offset=0)=>new Date(Date.parse('2026-03-25T12:00:00Z')+(week-1)*604800000+offset*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const labelWeek=(week:number)=>`Week ${week} · ${date(week)}–${date(week,6)}`;

function GameCard({game}:{game:Game}){
  const [open,setOpen]=useState(false);
  const [w,stage,round,region,series,gameNo,id,home,away,seedH,seedA,nameH,nameA,scoreH,scoreA,winner,by,innings]=game;
  const homeWon=home===winner;
  const awayWon=away===winner;
  return <article className="r26-card">
    <button type="button" className="r26-gameButton" aria-expanded={open} onClick={()=>setOpen(!open)}>
      <div className="r26-gameMeta"><span>{stageNames[stage]} · {stage===2||stage===3?'Championship':`Round ${round}`}</span><span>{region>0?`Region ${region} · `:''}Game {gameNo}</span></div>
      <div className={'r26-team '+(homeWon?'r26-win':'')}><span className="r26-seed">{seedH||'–'}</span><span className="r26-teamName">{formatSchool(nameH)}<small>{nameH?.match(/\\(([^)]+)\\)/)?.[1]||''}</small></span><strong>{scoreH}</strong></div>
      <div className={'r26-team '+(awayWon?'r26-win':'')}><span className="r26-seed">{seedA||'–'}</span><span className="r26-teamName">{formatSchool(nameA)}<small>{nameA?.match(/\\(([^)]+)\\)/)?.[1]||''}</small></span><strong>{scoreA}</strong></div>
      <div className="r26-gameFooter"><span>{winner===home?formatSchool(nameH):formatSchool(nameA)} wins · {by?.replaceAll('-',' ')||'Runs'}</span><span>{open?'Hide innings −':'View all 9 innings +'}</span></div>
    </button>
    {open&&<div className="r26-innings"><div className="r26-scroll"><table><thead><tr><th>School</th>{Array.from({length:9},(_,i)=><th key={i}>{i+1}</th>)}<th>R</th></tr></thead><tbody><tr><td>{formatSchool(nameH)}</td>{Array.from({length:9},(_,i)=><td key={i}>{innings?.[2*i]??0}</td>)}<td><b>{scoreH}</b></td></tr><tr><td>{formatSchool(nameA)}</td>{Array.from({length:9},(_,i)=><td key={i}>{innings?.[2*i+1]??0}</td>)}<td><b>{scoreA}</b></td></tr></tbody></table></div><p className="r26-legend">Innings 1–7: daily results · 8: weekly stats · 9: club W–L. ID: {id} · Series: {series}</p></div>}
  </article>
}

export default function Replay20262Page(){
 const [data,setData]=useState<Replay|null>(null);
 const [error,setError]=useState('');
 const [week,setWeek]=useState(1);
 const [stage,setStage]=useState('all');
 const [search,setSearch]=useState('');
 const [region,setRegion]=useState('all');
 const [limit,setLimit]=useState(60);
 const [loading,setLoading]=useState(true);
 const [reload,setReload]=useState(0);
 useEffect(()=>{
   const controller=new AbortController();
   setLoading(true);setError('');
   fetch('/api/sim-2026-2',{cache:'force-cache',signal:controller.signal})
     .then(async r=>{if(!r.ok)throw Error('Preview results are temporarily unavailable (HTTP '+r.status+')');return r.json()})
     .then((x:Replay)=>{if(!Array.isArray(x.games)||x.games.length!==15368)throw Error('The 34-week result snapshot is incomplete');setData(x);setLoading(false)})
     .catch(e=>{if(e.name==='AbortError')return;setError(e.message||'Could not open results');setLoading(false)});
   return ()=>controller.abort();
 },[reload]);
 const weekGames=useMemo(()=>data?.games.filter(g=>g[0]===week)||[],[data,week]);
 const shown=useMemo(()=>{
   const q=search.trim().toLowerCase();
   return weekGames.filter(g=>(stage==='all'||g[1]===Number(stage))&&(region==='all'||g[3]===Number(region))&&(!q||g[11]?.toLowerCase().includes(q)||g[12]?.toLowerCase().includes(q)||String(g[7])===q||String(g[8])===q))
     .sort((a,b)=>a[1]-b[1]||a[3]-b[3]||a[2]-b[2]||a[4]-b[4]||a[5]-b[5]);
 },[weekGames,stage,search,region]);
 const changeWeek=(n:number)=>{setWeek(Math.max(1,Math.min(34,n)));setLimit(60);setStage('all');setRegion('all')};
 const currentRound=week<=30?Math.ceil(week/3):week<=33?11:12;
 return <main className="r26-root">
 <style>{`
.r26-root{background:#090b0e;color:#f5f6f8;min-height:100vh;font-family:Arial,Helvetica,sans-serif;padding:25px clamp(12px,3vw,48px) 80px;line-height:1.4}
.r26-root *{box-sizing:border-box}.r26-wrap{max-width:1460px;margin:auto}.r26-title{font-family:Impact,'Arial Narrow',sans-serif;font-size:clamp(36px,6vw,70px);letter-spacing:.8px;line-height:1;margin:10px 0 12px;text-transform:uppercase}.r26-eyebrow{font:700 12px Arial,sans-serif;letter-spacing:2px;color:#ffcb30}.r26-muted{color:#9fa5ad}.r26-banner{border:1px solid #41434a;background:linear-gradient(115deg,#1c212a,#101317);border-radius:12px;padding:18px 22px;margin:20px 0 22px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.r26-banner small{display:block;color:#aeb5be;text-transform:uppercase;letter-spacing:1.4px;font-size:11px}.r26-champion{font-size:clamp(20px,3vw,30px);font-weight:900}.r26-score{font-family:Impact,'Arial Narrow';font-size:44px;color:#ffcf39}.r26-counter{display:flex;gap:20px;flex-wrap:wrap;margin:18px 0}.r26-counter span{font-size:12px;color:#aeb4bf}.r26-counter b{display:block;color:white;font-size:24px}.r26-toolbar{background:#161a20;border:1px solid #323741;border-radius:12px;padding:16px;margin:14px 0}.r26-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.r26-label{color:#b4bbc5;text-transform:uppercase;font-size:11px;letter-spacing:1px;font-weight:800}.r26-select,.r26-input{border:1px solid #4b5260;background:#0c0f14;color:#fff;padding:11px 12px;border-radius:7px;min-height:43px;font-size:14px}.r26-input{flex:1;min-width:170px}.r26-btn{background:#292f38;border:1px solid #505763;color:#fff;padding:10px 15px;border-radius:7px;cursor:pointer;font-weight:700}.r26-btn:hover{background:#3a424c}.r26-btn:disabled{opacity:.35;cursor:default}.r26-weekBar{display:flex;gap:5px;overflow-x:auto;padding:11px 0 4px;scrollbar-width:thin}.r26-week{min-width:49px;height:40px;border:1px solid #3c424c;border-radius:6px;background:#12171c;color:#ccd0d9;font-weight:bold;cursor:pointer}.r26-week[aria-current=true]{background:#ffca2a;color:#080b11;border-color:#ffca2a}.r26-filters{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-top:16px}.r26-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:26px 0 14px}.r26-heading h2{margin:0;font-family:Impact,'Arial Narrow';letter-spacing:.3px;font-size:30px}.r26-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:12px}.r26-card{border:1px solid #383f48;background:#161a20;border-radius:9px;overflow:hidden}.r26-gameButton{display:block;width:100%;padding:0;color:inherit;background:none;text-align:left;border:0;cursor:pointer}.r26-gameButton:hover{background:#1b222a}.r26-gameMeta{display:flex;justify-content:space-between;gap:8px;font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:.45px;color:#a3abb8;border-bottom:1px solid #303740;padding:11px 12px}.r26-team{display:grid;grid-template-columns:32px 1fr 38px;align-items:center;gap:9px;padding:11px 13px}.r26-team+.r26-team{border-top:1px solid #2a3037}.r26-seed{font-size:12px;color:#8993a0;text-align:center;border:1px solid #353b47;border-radius:4px;padding:3px}.r26-teamName{font-size:15px;font-weight:700;min-width:0}.r26-teamName small{display:block;font-size:11px;color:#8f98a6;font-weight:400}.r26-team strong{font-size:24px;font-family:Impact,'Arial Narrow';text-align:right}.r26-win{background:#1b2822}.r26-win strong{color:#fed13b}.r26-gameFooter{display:flex;justify-content:space-between;gap:10px;border-top:1px solid #2c343c;padding:10px 12px;font-size:11px;color:#abb6c0}.r26-gameFooter span:last-child{color:#ffca2e;font-weight:700;white-space:nowrap}.r26-innings{padding:12px;background:#0d1117;border-top:1px solid #383e4a}.r26-scroll{overflow-x:auto}.r26-innings table{border-collapse:collapse;min-width:320px;width:100%;font-size:11px;font-variant-numeric:tabular-nums}.r26-innings th,.r26-innings td{border-bottom:1px solid #293038;padding:7px 4px;text-align:center}.r26-innings th:first-child,.r26-innings td:first-child{text-align:left;white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis}.r26-innings th{color:#8e99a7}.r26-legend{font-size:10px;color:#8f9aa7;margin:9px 0 0}.r26-empty{padding:48px;text-align:center;border:1px dashed #515d67;border-radius:9px;color:#aeb7c0}.r26-loading{padding:60px 20px;text-align:center;color:#d8dde4}.r26-loadbtn{display:block;margin:24px auto}.r26-footer{font-size:12px;color:#8c98a8;margin-top:30px;border-top:1px solid #282f37;padding-top:20px;word-break:break-word}@media(max-width:600px){.r26-root{padding:15px 10px 50px}.r26-title{font-size:44px}.r26-banner{padding:12px}.r26-score{font-size:34px}.r26-grid{grid-template-columns:1fr}.r26-gameMeta{font-size:10px}.r26-week{min-width:44px}.r26-filters .r26-select{flex:1}}
`}</style>
 <div className="r26-wrap">
 <div className="r26-eyebrow">YAT?STATS / EXPERIMENTAL SIMULATION / 2026.2</div>
 <h1 className="r26-title">34-WEEK REPLAY</h1>
 <p className="r26-muted">1,024 high schools · March 25–November 17, 2026 · Actual 2026 professional statistics · Read-only results</p>
 {data&&<><section className="r26-banner"><div><small>Simulated 2026.2 champion</small><div className="r26-champion">{formatSchool(data.champion.awayRuns>data.champion.homeRuns?data.champion.away:data.champion.home)}</div><div className="r26-muted" style={{fontSize:12}}>Week 34 World Series Championship</div></div><div className="r26-score">{data.champion.homeRuns} – {data.champion.awayRuns}</div></section>
 <div className="r26-counter"><span><b>{data.gamesTotal.toLocaleString('en-US')}</b> Completed games</span><span><b>{data.weeks}</b> Weeks</span><span><b>{data.schools.toLocaleString('en-US')}</b> Schools</span><span><b>{data.lines.toLocaleString('en-US')}</b> Historical player stat lines</span></div></>}
 <section className="r26-toolbar" aria-label="Tournament navigation">
 <div className="r26-row"><button className="r26-btn" disabled={week===1} onClick={()=>changeWeek(week-1)}>← Previous</button><select aria-label="Choose week" className="r26-select" value={week} onChange={e=>changeWeek(Number(e.target.value))}>{Array.from({length:34},(_,i)=><option value={i+1} key={i}>{labelWeek(i+1)}</option>)}</select><button className="r26-btn" disabled={week===34} onClick={()=>changeWeek(week+1)}>Next →</button><button className="r26-btn" onClick={()=>changeWeek(34)}>Final · W34</button></div>
 <div className="r26-weekBar" aria-label="Select a week">{Array.from({length:34},(_,i)=><button type="button" key={i} className="r26-week" aria-current={week===i+1} onClick={()=>changeWeek(i+1)}>{i+1}</button>)}</div>
 <div className="r26-filters"><label className="r26-label" htmlFor="r26Stage">Competition</label><select id="r26Stage" className="r26-select" value={stage} onChange={e=>{setStage(e.target.value);setLimit(60)}}><option value="all">All games</option>{stageNames.map((n,i)=><option value={i} key={i}>{n}</option>)}</select><label className="r26-label" htmlFor="r26Region">Region</label><select id="r26Region" className="r26-select" value={region} onChange={e=>{setRegion(e.target.value);setLimit(60)}}><option value="all">All regions</option>{Array.from({length:9},(_,i)=><option value={i} key={i}>{i===0?'National':`Region ${i}`}</option>)}</select><input className="r26-input" aria-label="Search schools" placeholder="Search high school name or HSID…" value={search} onChange={e=>{setSearch(e.target.value);setLimit(60)}}/>{search&&<button className="r26-btn" onClick={()=>setSearch('')}>Clear</button>}</div>
 </section>
 <div className="r26-heading"><h2>{labelWeek(week)}</h2><div className="r26-muted">{shown.length.toLocaleString('en-US')} of {weekGames.length.toLocaleString('en-US')} games {week<=30?`· Round ${currentRound}`:week===34?'· World Series':'· Total Runs Finals'}</div></div>
 {loading&&<div className="r26-loading"><h2>Loading the complete 34-week replay…</h2><p>The first load reconstructs the season from historical data and may take longer than subsequent visits.</p></div>}
 {error&&<div className="r26-empty" role="alert"><p>{error}</p><button className="r26-btn" onClick={()=>setReload(x=>x+1)}>Retry preview</button></div>}
 {data&&<>{shown.length===0?<div className="r26-empty">No games match these filters for Week {week}.</div>:<div className="r26-grid">{shown.slice(0,limit).map(g=><GameCard key={g[3]+'-'+g[6]} game={g}/>)}</div>}
 {shown.length>limit&&<button className="r26-btn r26-loadbtn" onClick={()=>setLimit(n=>n+60)}>Show 60 more games ({shown.length-limit} remaining)</button>}</>}
 <footer className="r26-footer">2026.2 is a read-only test, not official 2027 scores. Nine-inning scoring uses the unchanged tournament rules. Source: 2026 historical professional player game logs; data fingerprint: {data?.fingerprint||'Loading'}.</footer>
 </div></main>;
}
