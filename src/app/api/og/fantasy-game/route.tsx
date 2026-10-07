import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { cleanSchoolLabel, fantasyGameScore, getSharedFantasyGame } from '@/lib/bracket/shareGame';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';

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
  const g=getSharedFantasyGame(id);
  if(!g)return new ImageResponse(
    <div style={{display:'flex',width:1200,height:630,background:'#0b0b0b',color:'#fff',alignItems:'center',justifyContent:'center',fontSize:48}}>YAT?STATS Fantasy Game</div>,
    size
  );
  const requestedDays=Number.parseInt(req.nextUrl.searchParams.get('days')||'9',10);
  const status=(req.nextUrl.searchParams.get('status')||'END 9').toUpperCase();
  const complete=status==='END 9';
  const visibleInnings=complete?Math.max(9,Math.ceil(g.innings.length/2)):Math.max(0,Math.min(9,Number.isFinite(requestedDays)?requestedDays:0));
  const score=fantasyGameScore(g,visibleInnings);
  const inning=(side:'h'|'a',i:number)=>i<visibleInnings?(g.innings[i*2+(side==='h'?0:1)]??0):'';
  const home=cleanSchoolLabel(g.homeName),away=cleanSchoolLabel(g.awayName);
  const homeCrest=getSchoolCrestUrl(g.home),awayCrest=getSchoolCrestUrl(g.away);

  const row=(side:'h'|'a',name:string,total:number)=>(
    <div style={{display:'flex',alignItems:'center',width:'100%',marginTop:side==='a'?0:12}}>
      <div style={{display:'flex',flexDirection:'column',width:220}}>
        <div style={{display:'flex',fontSize:30,fontWeight:900,color:side==='h'?'#ffd64d':'#fff'}}>{abbr(name)}</div>
        <div style={{display:'flex',fontSize:14,color:'rgba(255,255,255,.72)',marginTop:3}}>{name}</div>
      </div>
      {[0,1,2,3,4,5,6,7,8].map(i=><Cell key={i}>{inning(side,i)}</Cell>)}
      <Cell wide win={g.winner===(side==='h'?g.home:g.away)}>{total}</Cell>
    </div>
  );

  return new ImageResponse(
    <div style={{display:'flex',flexDirection:'column',width:1200,height:630,background:'#090909',color:'#fff',padding:'42px 52px',fontFamily:'Arial, sans-serif'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',width:'100%'}}>
        <div style={{display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',fontSize:28,fontWeight:800,letterSpacing:2,color:'#d5b44a'}}>YAT?STATS HIGH SCHOOL ALUMNI FANTASY GAME</div>
          <div style={{display:'flex',fontSize:22,color:'rgba(255,255,255,.72)',marginTop:8}}>{g.stage} · Week {g.week}</div>
        </div>
        <div style={{display:'flex',fontSize:34,fontWeight:900}}>YAT?STATS</div>
      </div>

      <div style={{display:'flex',alignItems:'center',justifyContent:'center',width:'100%',marginTop:28,gap:28}}>
        <img src={awayCrest} width="92" height="92" style={{objectFit:'contain'}} alt=""/>
        <div style={{display:'flex',alignItems:'center',gap:22}}>
          <div style={{display:'flex',fontSize:62,fontWeight:900}}>{score.away}</div>
          <div style={{display:'flex',fontSize:24,fontWeight:800,color:'rgba(255,255,255,.55)'}}>—</div>
          <div style={{display:'flex',fontSize:62,fontWeight:900}}>{score.home}</div>
        </div>
        <img src={homeCrest} width="92" height="92" style={{objectFit:'contain'}} alt=""/>
      </div>
      <div style={{display:'flex',justifyContent:'center',width:'100%',fontSize:20,fontWeight:800,marginTop:8,color:'#ffd64d'}}>{away} vs {home} · {status}</div>

      <div style={{display:'flex',flexDirection:'column',marginTop:24,border:'2px solid #2f7a5a',borderRadius:18,overflow:'hidden',width:'100%'}}>
        <div style={{display:'flex',alignItems:'center',background:'#9d7e1e',padding:'14px 18px',fontSize:20,fontWeight:800,color:'#fff7d6'}}>
          <div style={{display:'flex',width:220}}>{status}</div>
          {[1,2,3,4,5,6,7,8,9].map(n=><div key={n} style={{display:'flex',width:66,justifyContent:'center',marginLeft:7}}>{n}</div>)}
          <div style={{display:'flex',width:78,justifyContent:'center',marginLeft:7,color:'#ffd64d'}}>R</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',background:'#1b5d42',padding:'18px'}}>
          {row('a',away,score.away)}
          {row('h',home,score.home)}
        </div>
      </div>

      <div style={{display:'flex',marginTop:22,fontSize:22,color:'rgba(255,255,255,.78)'}}>
        Follow the YAT?STATS High School Alumni Fantasy Game between {away} and {home}.
      </div>
    </div>,
    size
  );
}
