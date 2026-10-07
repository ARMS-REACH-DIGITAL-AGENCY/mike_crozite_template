import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { getBatchDesignatedPlayerImages } from '@/lib/db';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';

export const runtime='nodejs';
export const size={width:1200,height:630};
export const contentType='image/png';

type Cell={v:string;now:boolean};
const q=(u:URLSearchParams,k:string,f='')=>String(u.get(k)||f);
function cells(raw:string):Cell[]{
  const a=raw.split('.').slice(0,9).map(x=>x==='_'?{v:'',now:false}:{v:x.replace(/[yw]$/,''),now:x.endsWith('y')});
  while(a.length<9)a.push({v:'',now:false}); return a;
}
function place(s:string){return s.replace(/,\s*/g,', ').trim();}
function abbr(s:string){const w=s.split(/\s+/).filter(Boolean);return (w.length===1?w[0].slice(0,4):w.map(x=>x[0]).join('').slice(0,4)).toUpperCase();}
function CellBox({cell}:{cell:Cell}){return <div style={{display:'flex',width:66,height:55,alignItems:'center',justifyContent:'center',background:'#08291d',color:cell.now?'#ffd43b':'#fff',borderRadius:7,fontSize:28,fontWeight:900,marginLeft:5,boxShadow:'inset 0 0 9px rgba(0,0,0,.55)'}}>{cell.v}</div>;}

export async function GET(req:NextRequest){
  const u=req.nextUrl.searchParams;
  let snap:Record<string,any>={};
  try{const raw=q(u,'s').replace(/-/g,'+').replace(/_/g,'/');if(raw)snap=JSON.parse(Buffer.from(raw,'base64').toString('utf8'));}catch{}
  const gameId=Number(q(u,'gameId','0'));
  let staticGame:any=null;
  if(gameId){try{const mod=await import('@/lib/bracket/shareGame');staticGame=mod.getSharedFantasyGame(gameId);}catch{}}
  const away=q(u,'fantasyAwayName',staticGame?.awayName||'Visitor').replace(/\s*\([^)]*\)\s*$/,'');
  const home=q(u,'fantasyHomeName',staticGame?.homeName||'Home').replace(/\s*\([^)]*\)\s*$/,'');
  const awayPlace=place(q(u,'fantasyAwayPlace')),homePlace=place(q(u,'fantasyHomePlace'));
  const awayId=Number(q(u,'fantasyAwayId','0')),homeId=Number(q(u,'fantasyHomeId','0'));
  const awayRuns=String(snap.a??q(u,'fantasyAwayRuns','0')),homeRuns=String(snap.h??q(u,'fantasyHomeRuns','0'));
  const awayCells=cells(String(snap.ac??q(u,'fantasyAwayCells'))),homeCells=cells(String(snap.hc??q(u,'fantasyHomeCells')));
  const status=String(snap.s??q(u,'fantasyStatus','LIVE')).toUpperCase(),week=q(u,'week','1'),round=String(snap.r??q(u,'fantasyRound','1')),gameNo=String(snap.g??q(u,'fantasyGameNo','1')),dates=String(snap.d??q(u,'fantasyDates'));
  const headline=String(snap.t??q(u,'fantasyHeadline',`${away.toUpperCase()} vs ${home.toUpperCase()}`));
  const summary=`${status}: ${away} ${awayRuns}, ${home} ${homeRuns}.`;
  const heroId=String(snap.p??q(u,'fantasyHeroId'));
  let hero='';
  if(heroId){try{hero=(await getBatchDesignatedPlayerImages([heroId],'HEADSHOT')).get(heroId)?.image_url||'';}catch{}}
  const awayCrest=awayId?getSchoolCrestUrl(awayId):'',homeCrest=homeId?getSchoolCrestUrl(homeId):'';

  const row=(name:string,loc:string,total:string,crest:string,cs:Cell[],homeRow=false)=>(
    <div style={{display:'flex',alignItems:'center',width:'100%',marginTop:homeRow?7:0}}>
      <div style={{display:'flex',alignItems:'center',width:250}}>
        {crest?<img src={crest} width="52" height="52" style={{objectFit:'contain',marginRight:10}} alt=""/>:null}
        <div style={{display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',fontSize:25,fontWeight:900,color:homeRow?'#ffd43b':'#fff'}}>{name.toUpperCase()}</div>
          <div style={{display:'flex',fontSize:13,color:'rgba(255,255,255,.7)'}}>{loc}</div>
        </div>
      </div>
      {cs.map((x,i)=><CellBox key={i} cell={x}/>)}
      <div style={{display:'flex',width:68,height:55,alignItems:'center',justifyContent:'center',fontSize:35,fontWeight:900,color:'#ffd43b',marginLeft:7}}>{total}</div>
    </div>
  );

  return new ImageResponse(
    <div style={{display:'flex',flexDirection:'column',width:1200,height:630,background:'#061a2d',color:'#fff',fontFamily:'Arial,sans-serif',overflow:'hidden'}}>
      <div style={{display:'flex',height:290,padding:'28px 42px 0',position:'relative',background:'radial-gradient(circle at 78% 24%,#14518c 0%,#071a2f 58%)'}}>
        <div style={{display:'flex',flexDirection:'column',width:hero?'70%':'100%'}}>
          <div style={{display:'flex',fontSize:28,fontWeight:900}}>YAT?<span style={{fontWeight:400}}>STATS</span></div>
          <div style={{display:'flex',fontSize:16,fontWeight:900,color:'#ffd43b',letterSpacing:1}}>HIGH SCHOOL ALUMNI FANTASY BASEBALL TOURNAMENT</div>
          <div style={{display:'flex',fontSize:19,fontWeight:900,marginTop:25}}>ROUND {round} · GAME {gameNo} · WEEK {week}</div>
          <div style={{display:'flex',fontSize:50,fontWeight:1000,lineHeight:.96,marginTop:8}}>{headline}</div>
          <div style={{display:'flex',fontSize:20,lineHeight:1.25,marginTop:11,maxWidth:690}}>{summary.slice(0,190)}</div>
          <div style={{display:'flex',fontSize:18,fontWeight:900,color:'#ffd43b',marginTop:9}}>★ {away.toUpperCase()} {awayRuns} · {home.toUpperCase()} {homeRuns}</div>
        </div>
        {hero?<img src={hero} width="330" height="300" style={{position:'absolute',right:30,bottom:0,objectFit:'contain',objectPosition:'bottom'}} alt=""/>:null}
      </div>
      <div style={{display:'flex',height:58,alignItems:'center',justifyContent:'space-between',padding:'0 30px',background:'#2f9467',fontSize:22,fontWeight:900}}>
        <div style={{display:'flex',gap:14}}><span>ROUND {round}</span><span>|</span><span style={{background:'#ffd84b',color:'#173423',padding:'8px 16px',borderRadius:8}}>GAME {gameNo}</span></div>
        <div style={{display:'flex',gap:13}}><span>WEEK {week}</span>{dates?<><span>|</span><span>{dates.toUpperCase()}</span></>:null}</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',flex:1,background:'linear-gradient(180deg,#0a5b3e,#073a29)',padding:'10px 26px 16px'}}>
        <div style={{display:'flex',alignItems:'center',width:'100%',fontSize:18,fontWeight:900,marginBottom:4}}>
          <div style={{display:'flex',width:250}}><span style={{background:'#d9272f',borderRadius:8,padding:'5px 11px'}}>{status}</span></div>
          {[1,2,3,4,5,6,7,8,9].map(n=><div key={n} style={{display:'flex',width:66,justifyContent:'center',marginLeft:5}}>{n}</div>)}
          <div style={{display:'flex',width:68,justifyContent:'center',marginLeft:7,color:'#ffd43b'}}>R</div>
        </div>
        {row(away,awayPlace,awayRuns,awayCrest,awayCells)}
        {row(home,homePlace,homeRuns,homeCrest,homeCells,true)}
      </div>
    </div>,size
  );
}
