import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

export type SharedFantasyGame={
  id:number; week:number; home:number; away:number; winner:number|null;
  innings:number[]; homeName:string; awayName:string; stage:string;
};

type IndexFile={
  schools:Record<string,[string,number,number]>;
  rounds:Array<{r:number;series:any[]}>;
  lbt:Array<{game:any[]}>;
  gf:any[][];
};

let cache:{index:IndexFile;lb:any[]}|null=null;
function files(){
  if(cache)return cache;
  const base=path.join(process.cwd(),'public','bracket-lab','2026');
  const index=JSON.parse(fs.readFileSync(path.join(base,'index.json'),'utf8')) as IndexFile;
  const lbRaw=JSON.parse(fs.readFileSync(path.join(base,'lb.json'),'utf8')) as {games?:any[]};
  cache={index,lb:Array.isArray(lbRaw)?lbRaw:(lbRaw.games||[])};
  return cache;
}
export function getSharedFantasyGame(id:number):SharedFantasyGame|null{
  if(!Number.isFinite(id)||id<=0)return null;
  const {index,lb}=files();
  let row:any[]|undefined,stage='';
  for(const r of index.rounds||[]){
    for(const s of r.series||[]){
      row=(s[7]||[]).find((g:any[])=>Number(g[0])===id);
      if(row){stage=`Round ${r.r} · Game ${((Number(row[1])-1)%3)+1}`;break;}
    }
    if(row)break;
  }
  if(!row){
    row=lb.find((g:any[])=>Number(g[0])===id);
    if(row)stage=`Regional leaderboard · Week ${row[1]}`;
  }
  if(!row){
    const found=(index.lbt||[]).map(x=>x.game).find((g:any[])=>Number(g[0])===id);
    if(found){row=found;stage=Number(row[1])===33?'Championship Game':`Championship Round ${Number(row[1])-30}`;}
  }
  if(!row){
    row=(index.gf||[]).find((g:any[])=>Number(g[0])===id);
    if(row)stage='YAT?STATS World Series';
  }
  if(!row)return null;
  const home=Number(row[2]),away=Number(row[3]);
  return {
    id:Number(row[0]),week:Number(row[1]),home,away,winner:row[6]===null?null:Number(row[6]),
    innings:Array.isArray(row[5])?row[5].map(Number):[],
    homeName:index.schools[String(home)]?.[0]||`School ${home}`,
    awayName:index.schools[String(away)]?.[0]||`School ${away}`,
    stage,
  };
}
export function fantasyGameScore(g:SharedFantasyGame){
  let h=0,a=0;
  g.innings.forEach((v,i)=>{if(i%2===0)h+=v;else a+=v;});
  return {home:h,away:a};
}
export function cleanSchoolLabel(s:string){return s.replace(/,\s*/g,', ').trim();}
