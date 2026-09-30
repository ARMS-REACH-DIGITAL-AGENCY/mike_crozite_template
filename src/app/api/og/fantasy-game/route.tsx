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

export async function GET(req:NextRequest){
  const id=Number(req.nextUrl.searchParams.get('gameId')||0);
  const g=getSharedFantasyGame(id);
  if(!g)return new ImageResponse(<div style={{display:'flex',width:'1200px',height:'630px',background:'#0b0b0b',color:'#fff',alignItems:'center',justifyContent:'center',fontSize:48}}>YAT?STATS Fantasy Game</div>,size);
  const score=fantasyGameScore(g);
  const inning=(side:'h'|'a',i:number)=>g.innings[i*2+(side==='h'?0:1)]??0;
  const home=cleanSchoolLabel(g.homeName),away=cleanSchoolLabel(g.awayName);
  return new ImageResponse(
    <div style={{display:'flex',flexDirection:'column',width:'1200px',height:'630px',background:'#090909',color:'#fff',padding:'42px 52px',fontFamily:'Arial, sans-serif'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <div style={{fontSize:28,fontWeight:800,letterSpacing:2,color:'#d5b44a'}}>YAT?STATS HIGH SCHOOL ALUMNI FANTASY GAME</div>
          <div style={{fontSize:22,color:'rgba(255,255,255,.72)'}}>{g.stage} · Week {g.week}</div>
        </div>
        <div style={{fontSize:34,fontWeight:900}}>YAT?STATS</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',marginTop:48,border:'2px solid #2f7a5a',borderRadius:18,overflow:'hidden',boxShadow:'0 12px 40px rgba(0,0,0,.35)'}}>
        <div style={{display:'grid',gridTemplateColumns:'220px repeat(9,1fr) 92px',background:'#9d7e1e',padding:'14px 18px',fontSize:20,fontWeight:800,color:'#fff7d6'}}>
          <div style={{display:'flex'}}>FINAL</div>{[1,2,3,4,5,6,7,8,9].map(n=><div key={n} style={{display:'flex',justifyContent:'center'}}>{n}</div>)}<div style={{display:'flex',justifyContent:'center',color:'#ffd64d'}}>R</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',background:'linear-gradient(180deg,#1f694a,#164d37)',padding:'18px'}}>
          {([['a',away,score.away],['h',home,score.home]] as const).map(([side,name,total])=>(
            <div key={side} style={{display:'grid',gridTemplateColumns:'220px repeat(9,1fr) 92px',gap:8,alignItems:'center',marginBottom:side==='a'?10:0}}>
              <div style={{display:'flex',flexDirection:'column'}}>
                <span style={{fontSize:30,fontWeight:900,color:side==='h'?'#ffd64d':'#fff'}}>{abbr(name)}</span>
                <span style={{fontSize:15,color:'rgba(255,255,255,.72)'}}>{name}</span>
              </div>
              {[0,1,2,3,4,5,6,7,8].map(i=><div key={i} style={{display:'flex',height:56,alignItems:'center',justifyContent:'center',background:'#0d2d20',borderRadius:8,fontSize:30,fontWeight:900}}>{inning(side,i)}</div>)}
              <div style={{display:'flex',height:56,alignItems:'center',justifyContent:'center',background:g.winner===(side==='h'?g.home:g.away)?'#f2c632':'#0d2d20',color:g.winner===(side==='h'?g.home:g.away)?'#142319':'#ffd64d',borderRadius:8,fontSize:34,fontWeight:900}}>{total}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:'flex',marginTop:34,fontSize:24,color:'rgba(255,255,255,.78)'}}>Follow the game, comment, and share on YAT?STATS.</div>
    </div>,size
  );
}
