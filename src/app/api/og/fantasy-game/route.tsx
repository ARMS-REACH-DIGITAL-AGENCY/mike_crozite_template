import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { cleanSchoolLabel, fantasyGameScore, getSharedFantasyGame } from '@/lib/bracket/shareGame';

export const runtime='nodejs';
export const size={width:1200,height:630};
export const contentType='image/png';

function abbr(s:string){
  const base=s.replace(/\s*\([^)]*\)\s*/g,'').trim();
  const words=base.split(/\s+/).filter(Boolean);
  return (words.length===1?words[0].slice(0,4):words.map(w=>w[0]).join('').slice(0,4)).toUpperCase();
}

function Cell({children,wide=false,win=false}:{children:React.ReactNode;wide?:boolean;win?:boolean}){
  return <div style={{display:'flex',width:wide?78:66,height:56,alignItems:'center',justifyContent:'center',
    background:win?'#f2c632':'#0d2d20',color:win?'#142319':'#fff',borderRadius:8,
    fontSize:wide?34:29,fontWeight:900,marginLeft:7}}>{children}</div>;
}

export async function GET(req:NextRequest){
  const id=Number(req.nextUrl.searchParams.get('gameId')||0);
  const snap=req.nextUrl.searchParams.get('snapshot')==='1';
  const raw=req.nextUrl.searchParams.get('scoreInnings')||'';
  const valid=/^(?:\d{1,3},){17}\d{1,3}$/.test(raw);
  const snapHome=(req.nextUrl.searchParams.get('homeName')||'').slice(0,120);
  const snapAway=(req.nextUrl.searchParams.get('awayName')||'').slice(0,120);
  const g=snap && valid && snapHome && snapAway ? {id,week:Number(req.nextUrl.searchParams.get('week'))||1,home:1,away:2,winner:null,innings:raw.split(',').map(Number),homeName:snapHome,awayName:snapAway,stage:'Fantasy Game'} : getSharedFantasyGame(id,Number(req.nextUrl.searchParams.get('week'))||undefined,Number(req.nextUrl.searchParams.get('homeId'))||undefined,Number(req.nextUrl.searchParams.get('awayId'))||undefined);
  if(!g)return new ImageResponse(
    <div style={{display:'flex',width:1200,height:630,background:'#0b0b0b',color:'#fff',alignItems:'center',justifyContent:'center',fontSize:48}}>YAT?STATS Fantasy Game</div>,
    size
  );
  const supplied=req.nextUrl.searchParams.get('scoreInnings')||'';
  const parsed=/^(?:\d{1,3},){17,}\d{1,3}$/.test(supplied) ? supplied.split(',').map(Number) : [];
  const innings=parsed.length>=18 && parsed.length<=30 && parsed.length%2===0 ? parsed : g.innings;
  const score=fantasyGameScore({...g,innings});
  const winner=score.home===score.away?null:score.home>score.away?g.home:g.away;
  const inning=(side:'h'|'a',i:number)=>innings[i*2+(side==='h'?0:1)]??0;
  const home=cleanSchoolLabel(g.homeName),away=cleanSchoolLabel(g.awayName);

  const row=(side:'h'|'a',name:string,total:number)=>(
    <div style={{display:'flex',alignItems:'center',width:'100%',marginTop:side==='a'?0:12}}>
      <div style={{display:'flex',flexDirection:'column',width:220}}>
        <div style={{display:'flex',fontSize:30,fontWeight:900,color:side==='h'?'#ffd64d':'#fff'}}>{abbr(name)}</div>
        <div style={{display:'flex',fontSize:14,color:'rgba(255,255,255,.72)',marginTop:3}}>{name}</div>
      </div>
      {[0,1,2,3,4,5,6,7,8].map(i=><Cell key={i}>{inning(side,i)}</Cell>)}
      <Cell wide win={winner===(side==='h'?g.home:g.away)}>{total}</Cell>
    </div>
  );

  const status=(req.nextUrl.searchParams.get('scoreStatus') || (snap?'LIVE':'FINAL')).slice(0,16);
  const round=Math.max(1,Math.min(10,Number(req.nextUrl.searchParams.get('round'))||Math.ceil(g.week/3)));
  const gameNo=Math.max(1,Math.min(3,Number(req.nextUrl.searchParams.get('gameNo'))||((g.week-1)%3+1)));
  const activeMatch=/^(?:TOP|BOT)\s+(\d)$/i.exec(status);
  const activeInning=activeMatch?Number(activeMatch[1]):null;
  const visibleThrough=status==='FINAL'?9:activeInning??(status==='LIVE'?null:0);
  const boardRow=(side:'h'|'a',name:string,total:number)=>(
    <div style={{display:'flex',alignItems:'center',width:'100%',height:105,gap:8}}>
      <div style={{display:'flex',flexDirection:'column',width:250,alignItems:'flex-end',justifyContent:'center',paddingRight:12}}>
        <div style={{display:'flex',fontSize:25,fontWeight:900,textAlign:'right',color:'#fff'}}>{name.replace(/\\s*\\([^)]*\\)/g,'').toUpperCase()}</div>
        <div style={{display:'flex',fontSize:14,color:'#c9dfd3'}}>{name.includes('(') ? name.split('(')[1]?.split(')')[0] : ''}</div>
      </div>
      {[0,1,2,3,4,5,6,7,8].map(i=>{const v=inning(side,i);const played=visibleThrough===null?true:i<visibleThrough;const current=activeInning===i+1;const lit=played&&(current||v>0);return <div key={i} style={{display:'flex',flex:1,height:69,alignItems:'center',justifyContent:'center',borderRadius:7,background:lit?'#e6bb2f':'#103a2b',color:lit?'#173526':'#fff',fontSize:32,fontWeight:900}}>{played?v:''}</div>})}
      <div style={{display:'flex',width:76,height:69,alignItems:'center',justifyContent:'center',borderRadius:7,background:'#e6bb2f',color:'#103a2b',fontSize:39,fontWeight:900}}>{total}</div>
    </div>
  );
  return new ImageResponse(
    <div style={{display:'flex',flexDirection:'column',width:1200,height:630,background:'#111',color:'#fff',padding:'35px',fontFamily:'Arial, sans-serif'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:75,padding:'0 12px'}}>
        <div style={{display:'flex',flexDirection:'column'}}><div style={{display:'flex',fontSize:29,fontWeight:900}}>YAT?STATS HIGH SCHOOL ALUMNI</div><div style={{display:'flex',fontSize:19,fontWeight:800,color:'#e8c24a'}}>FANTASY BRACKET TOURNAMENT</div></div>
        <div style={{display:'flex',fontSize:38,fontWeight:900}}>YAT?STATS</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',border:'7px solid #d2a929',borderRadius:20,overflow:'hidden',width:'100%',marginTop:18,background:'#155a3f'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:65,background:'#2d8b61',padding:'0 22px',fontWeight:900,fontSize:26}}><div style={{display:'flex'}}>ROUND {round}  |  GAME {gameNo}</div><div style={{display:'flex'}}>WEEK {g.week}  |  {status}</div></div>
        <div style={{display:'flex',flexDirection:'column',padding:'14px 17px 20px',background:'#155a3f'}}>
          <div style={{display:'flex',alignItems:'center',height:42,gap:8,color:'#f2d27a',fontSize:21,fontWeight:900}}><div style={{display:'flex',width:250,justifyContent:'flex-end',paddingRight:12}}>{status}</div>{[1,2,3,4,5,6,7,8,9].map(n=><div key={n} style={{display:'flex',flex:1,justifyContent:'center'}}>{n}</div>)}<div style={{display:'flex',width:76,justifyContent:'center'}}>R</div></div>
          {boardRow('a',away,score.away)}{boardRow('h',home,score.home)}
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'center',marginTop:26,fontSize:23,fontWeight:800,color:'#e5d49a'}}>FOLLOW THE GAME  •  YAT?STATS</div>
    </div>,size
  );
}
