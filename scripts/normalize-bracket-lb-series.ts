import fs from 'node:fs';
import path from 'node:path';
import { pairEliminated } from '../src/lib/bracket/engine';

type Game=any[];
type SideSnap={runs:number[]; metrics:Array<[number|null,number|null]>; box:any};
const base=path.join(process.cwd(),'public','bracket-lab','2026');
const lbPath=path.join(base,'lb.json');
const raw=JSON.parse(fs.readFileSync(lbPath,'utf8'));
const oldGames:Game[]=Array.isArray(raw)?raw:(raw.games||[]);
const outGames:Game[]=[];
const played=new Map<number,number>();
const seed='yatstats-2026';

function detailPath(week:number,region:number){return path.join(base,`d-lb-${week}-${region}.json`);}
function readDetail(week:number,region:number){
  const p=detailPath(week,region);
  return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{};
}
function sideSnap(g:Game, side:'h'|'a', detail:any):SideSnap{
  const off=side==='h'?0:1, pit=side==='h'?2:3;
  const runs:number[]=[];
  for(let i=0;i<9;i++)runs.push(Number(g[5]?.[i*2+(side==='h'?0:1)]||0));
  return {
    runs,
    metrics:Array.from({length:8},(_,i)=>[detail?.d?.[i]?.[off]??null,detail?.d?.[i]?.[pit]??null]),
    box:detail?.[side]||{p:[],wl:[0,0]},
  };
}
function blank():SideSnap{return {runs:Array(9).fill(0),metrics:Array.from({length:8},()=>[null,null]),box:{p:[],wl:[0,0]}};}
function total(s:SideSnap){return s.runs.reduce((a,b)=>a+b,0);}
function interleave(h:SideSnap,a:SideSnap){const x:number[]=[];for(let i=0;i<9;i++){x.push(h.runs[i]||0,a.runs[i]||0);}return x;}
function details(h:SideSnap,a:SideSnap){return {d:Array.from({length:8},(_,i)=>[h.metrics[i]?.[0]??null,a.metrics[i]?.[0]??null,h.metrics[i]?.[1]??null,a.metrics[i]?.[1]??null]),h:h.box,a:a.box};}

for(let round=2;round<=10;round++){
  const first=(round-1)*3+1;
  for(let region=1;region<=8;region++){
    const weeks=[first,first+1,first+2];
    const weekOld=new Map<number,Game[]>();
    const snaps=new Map<number,Map<number,SideSnap>>();
    const poolSet=new Set<number>();
    for(const week of weeks){
      const games=oldGames.filter(g=>Number(g[1])===week&&Number(g[7])===region).sort((a,b)=>Number(a[0])-Number(b[0]));
      weekOld.set(week,games);
      const det=readDetail(week,region);
      const sm=new Map<number,SideSnap>();
      for(const g of games){
        const d=det[String(g[0])]||{};
        sm.set(Number(g[2]),sideSnap(g,'h',d));
        sm.set(Number(g[3]),sideSnap(g,'a',d));
        poolSet.add(Number(g[2]));poolSet.add(Number(g[3]));
      }
      snaps.set(week,sm);
    }
    const pool=[...poolSet].sort((a,b)=>a-b);
    if(pool.length<2){
      for(const week of weeks)outGames.push(...(weekOld.get(week)||[]));
      continue;
    }
    const {pairs}=pairEliminated(pool,played,`${seed}:lb:round:${round}:${region}`);
    for(const [a,b] of pairs){played.set(a,(played.get(a)||0)+3);played.set(b,(played.get(b)||0)+3);}
    for(const week of weeks){
      const ids=(weekOld.get(week)||[]).map(g=>Number(g[0])).sort((a,b)=>a-b);
      const sm=snaps.get(week)!;
      const newDetail:Record<string,unknown>={};
      pairs.forEach(([home,away],i)=>{
        const id=ids[i]??(900000+round*10000+region*100+i);
        const hs=sm.get(home)||blank(),as=sm.get(away)||blank();
        const hr=total(hs),ar=total(as);
        const winner=hr===ar?null:(hr>ar?home:away);
        outGames.push([id,week,home,away,hr===ar?'tie':'runs',interleave(hs,as),winner,region]);
        newDetail[String(id)]=details(hs,as);
      });
      fs.writeFileSync(detailPath(week,region),JSON.stringify(newDetail));
    }
  }
}
// Weeks before the first eliminated-school round are untouched.
outGames.push(...oldGames.filter(g=>Number(g[1])<4));
outGames.sort((a,b)=>Number(a[1])-Number(b[1])||Number(a[7])-Number(b[7])||Number(a[0])-Number(b[0]));
fs.writeFileSync(lbPath,JSON.stringify({games:outGames,seriesPattern:'one opponent per 3-game round'}));

const violations:string[]=[];
for(let round=2;round<=10;round++){
  const first=(round-1)*3+1;
  const byTeam=new Map<number,Set<number>>();
  for(const g of outGames.filter(x=>Number(x[1])>=first&&Number(x[1])<=first+2)){
    const h=Number(g[2]),a=Number(g[3]);
    if(!byTeam.has(h))byTeam.set(h,new Set()); if(!byTeam.has(a))byTeam.set(a,new Set());
    byTeam.get(h)!.add(a);byTeam.get(a)!.add(h);
  }
  for(const [team,opps] of byTeam)if(opps.size>1)violations.push(`R${round} team ${team}: ${[...opps].join(',')}`);
}
if(violations.length)throw new Error(`Series invariant failed:\n${violations.slice(0,20).join('\n')}`);
console.log(`Normalized ${outGames.length} leaderboard games. Every team has at most one opponent per three-week round.`);
