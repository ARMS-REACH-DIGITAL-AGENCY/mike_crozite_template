import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { cleanSchoolLabel, fantasyGameScore, getSharedFantasyGame } from '@/lib/bracket/shareGame';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';
import { getBatchDesignatedPlayerImages } from '@/lib/db';

export const runtime='nodejs';
export const size={width:1200,height:630};
export const contentType='image/png';

type PlayerRow=[string,string,string,number,number[]|0,number[]|0,number|null,number|null];
type GameBox={h?:{p?:PlayerRow[]};a?:{p?:PlayerRow[]}};

function shortName(s:string){return s.split(' (')[0].replace(/\bHigh School\b/gi,'').trim();}
function place(s:string){return (s.match(/\(([^)]+)\)/)?.[1]||'').trim();}
function abbr(s:string){
  const base=shortName(s); const words=base.split(/\s+/).filter(Boolean);
  return (words.length===1?words[0].slice(0,4):words.map(w=>w[0]).join('').slice(0,4)).toUpperCase();
}
function gameNo(g:{week:number;stage:string}){
  const m=g.stage.match(/Game\s+(\d+)/i); return m?.[1]||String(((g.week-1)%3)+1);
}
function roundNo(stage:string){return stage.match(/Round\s+(\d+)/i)?.[1]||'';}
function boxFor(dataFile:string,id:number):GameBox|null{
  if(!dataFile)return null;
  try{
    const raw=JSON.parse(fs.readFileSync(path.join(process.cwd(),'public','bracket-lab','2026',`${dataFile}.json`),'utf8'));
    const all=Array.isArray(raw)?raw:(raw.games||raw);
    if(Array.isArray(all)){
      const found=all.find((x:any)=>Number(x?.[0]??x?.id)===id);
      if(Array.isArray(found)&&found.length>8)return found[8]||null;
      if(found?.box)return found.box;
    }
    return all?.[String(id)]||null;
  }catch{return null;}
}
async function story(box:GameBox|null,homeName:string,awayName:string){
  const rows=[
    ...(box?.h?.p||[]).map(p=>({p,school:shortName(homeName)})),
    ...(box?.a?.p||[]).map(p=>({p,school:shortName(awayName)})),
  ];
  const hitters=rows.filter(x=>Array.isArray(x.p[4])&&Number((x.p[4] as number[])[0]||0)>0&&Number.isFinite(Number(x.p[6])))
    .sort((a,b)=>Number(b.p[6])-Number(a.p[6]));
  const pitchers=rows.filter(x=>Array.isArray(x.p[5])&&Number.isFinite(Number(x.p[7]))&&(x.p[5] as number[]).slice(0,5).some(v=>Number(v||0)>0))
    .sort((a,b)=>Number(a.p[7])-Number(b.p[7]));
  const h=hitters[0],p=pitchers[0];
  const hEdge=h?Number(h.p[6])-100:-Infinity,pEdge=p?100-Number(p.p[7]):-Infinity;
  const lead=hEdge>=pEdge?h:p;
  if(!lead)return {headline:'FANTASY GAME UPDATE',summary:'The matchup is taking shape one inning at a time.',headshot:'',star:''};
  const surname=(lead.p[1]||'').trim().split(/\s+/).pop()?.toUpperCase()||'ALUMNI';
  const headline=lead===p?`${surname} DEALS`:`${surname} POWERS ${lead.school.toUpperCase()}`;
  let summary='';
  if(lead===p) summary=`${lead.p[1]} leads ${lead.school}'s pitching at ${Math.round(Number(lead.p[7]))} FIP-.`;
  else{
    const bat=Array.isArray(lead.p[4])?lead.p[4] as number[]:[];
    const ab=Number(bat[1]||0),hits=Number(bat[2]||0),bb=Number(bat[6]||0);
    summary=`${lead.p[1]}: ${hits}-for-${ab}${bb?`, ${bb} BB`:''} · ${Math.round(Number(lead.p[6]))} OPS+.`;
  }
  let headshot='';
  try{headshot=(await getBatchDesignatedPlayerImages([String(lead.p[0])],'HEADSHOT')).get(String(lead.p[0]))?.image_url||'';}catch{}
  return {headline,summary,headshot,star:lead.p[1]};
}
function Cell({children,active=false}:{children:React.ReactNode;active?:boolean}){
  return <div style={{display:'flex',width:66,height:58,alignItems:'center',justifyContent:'center',background:'#08291d',color:active?'#ffd43b':'#fff',borderRadius:7,fontSize:30,fontWeight:900,marginLeft:6,boxShadow:'inset 0 0 10px rgba(0,0,0,.5)'}}>{children}</div>;
}

export async function GET(req:NextRequest){
  const id=Number(req.nextUrl.searchParams.get('gameId')||0),g=getSharedFantasyGame(id);
  if(!g)return new ImageResponse(<div style={{display:'flex',width:1200,height:630,background:'#071b14',color:'#fff',alignItems:'center',justifyContent:'center',fontSize:48}}>YAT?STATS Fantasy Game</div>,size);
  const requestedDays=Number.parseInt(req.nextUrl.searchParams.get('days')||'9',10);
  const status=(req.nextUrl.searchParams.get('status')||'END 9').toUpperCase();
  const complete=status==='END 9';
  const visibleInnings=complete?Math.max(9,Math.ceil(g.innings.length/2)):Math.max(0,Math.min(9,Number.isFinite(requestedDays)?requestedDays:0));
  const score=fantasyGameScore(g,visibleInnings);
  const inning=(side:'h'|'a',i:number)=>i<visibleInnings?(g.innings[i*2+(side==='h'?0:1)]??0):'';
  const home=cleanSchoolLabel(g.homeName),away=cleanSchoolLabel(g.awayName);
  const homeShort=shortName(home),awayShort=shortName(away);
  const homeCrest=getSchoolCrestUrl(g.home),awayCrest=getSchoolCrestUrl(g.away);
  const s=await story(boxFor(g.dataFile,g.id),home,away);
  const round=roundNo(g.stage),gn=gameNo(g);
  const row=(side:'h'|'a',name:string,total:number,crest:string)=>(
    <div style={{display:'flex',alignItems:'center',width:'100%',marginTop:side==='h'?8:0}}>
      <div style={{display:'flex',alignItems:'center',width:250}}>
        <img src={crest} width="55" height="55" style={{objectFit:'contain',marginRight:12}} alt=""/>
        <div style={{display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',fontSize:27,fontWeight:900,color:side==='h'?'#ffd43b':'#fff'}}>{shortName(name).toUpperCase()}</div>
          <div style={{display:'flex',fontSize:14,color:'rgba(255,255,255,.7)'}}>{place(name)}</div>
        </div>
      </div>
      {[0,1,2,3,4,5,6,7,8].map(i=><Cell key={i} active={!complete&&i===Math.max(0,visibleInnings-1)}>{inning(side,i)}</Cell>)}
      <div style={{display:'flex',width:72,height:58,alignItems:'center',justifyContent:'center',marginLeft:8,fontSize:36,fontWeight:900,color:'#ffd43b'}}>{total}</div>
    </div>
  );
  return new ImageResponse(
    <div style={{display:'flex',flexDirection:'column',width:1200,height:630,background:'linear-gradient(180deg,#071a2f 0%,#092d22 100%)',color:'#fff',fontFamily:'Arial,sans-serif',overflow:'hidden'}}>
      <div style={{display:'flex',height:292,padding:'28px 42px 0',position:'relative',background:'radial-gradient(circle at 75% 30%,#14518c 0%,#071a2f 58%)'}}>
        <div style={{display:'flex',flexDirection:'column',width:s.headshot?'70%':'100%'}}>
          <div style={{display:'flex',fontSize:27,fontWeight:900,letterSpacing:1}}>YAT?<span style={{fontWeight:400}}>STATS</span></div>
          <div style={{display:'flex',fontSize:17,fontWeight:900,color:'#ffd43b',letterSpacing:1}}>HIGH SCHOOL ALUMNI FANTASY BASEBALL TOURNAMENT</div>
          <div style={{display:'flex',fontSize:20,fontWeight:900,marginTop:28}}>{round?`ROUND ${round} · `:''}GAME {gn} · WEEK {g.week}</div>
          <div style={{display:'flex',fontSize:54,fontWeight:1000,lineHeight:.95,marginTop:8,color:'#fff'}}>{s.headline}</div>
          <div style={{display:'flex',fontSize:22,marginTop:12,maxWidth:680}}>{s.summary}</div>
          <div style={{display:'flex',fontSize:19,fontWeight:900,color:'#ffd43b',marginTop:10}}>★ {awayShort.toUpperCase()} {score.away} · {homeShort.toUpperCase()} {score.home}</div>
        </div>
        {s.headshot?<img src={s.headshot} width="330" height="300" style={{position:'absolute',right:34,bottom:0,objectFit:'contain',objectPosition:'bottom'}} alt={s.star}/>:null}
      </div>
      <div style={{display:'flex',height:62,alignItems:'center',justifyContent:'space-between',padding:'0 34px',background:'#2f9467',borderTop:'2px solid #4ab184',fontSize:24,fontWeight:900}}>
        <div style={{display:'flex',gap:18}}><span>{round?`ROUND ${round}`:'FANTASY GAME'}</span><span style={{opacity:.55}}>|</span><span style={{background:'#ffd84b',color:'#173423',padding:'9px 18px',borderRadius:8}}>GAME {gn}</span></div>
        <div style={{display:'flex',gap:16}}><span>WEEK {g.week}</span></div>
      </div>
      <div style={{display:'flex',flexDirection:'column',flex:1,background:'linear-gradient(180deg,#0a5b3e,#073a29)',padding:'12px 28px 18px'}}>
        <div style={{display:'flex',alignItems:'center',width:'100%',fontSize:20,fontWeight:900,color:'#fff',marginBottom:5}}>
          <div style={{display:'flex',width:250}}><span style={{background:'#d9272f',borderRadius:8,padding:'5px 12px'}}>{status}</span></div>
          {[1,2,3,4,5,6,7,8,9].map(n=><div key={n} style={{display:'flex',width:66,justifyContent:'center',marginLeft:6}}>{n}</div>)}
          <div style={{display:'flex',width:72,justifyContent:'center',marginLeft:8,color:'#ffd43b'}}>R</div>
        </div>
        {row('a',away,score.away,awayCrest)}
        {row('h',home,score.home,homeCrest)}
      </div>
    </div>,size
  );
}
