// scripts/rebuild-bracket-fixture-2026.ts
// Rebuilds the 2026 preview fixture from its existing school/week OPS+/FIP-
// measurements plus the complete 2026 Neon alumni roster. This is deliberately
// deterministic: it gives every active alumnus a weekly W-L record, rescoring
// inning 9 and then regenerating advancement, leaderboards and postseason.
// It never writes to Neon. Rebuilds are committed only after the integrity audit passes.

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const ROOT = process.cwd();
const DIR = path.join(ROOT, 'public', 'bracket-lab', '2026');
const INDEX_PATH = path.join(DIR, 'index.json');
const LB_PATH = path.join(DIR, 'lb.json');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

type Game = [number, number, number, number, string, number[], number | null];
type PlayerRow = [string,string,string,0|1,number[]|0,number[]|0,number|null,number|null,([number,number]|null)?,(0|1)?];
type SideBox = { p: PlayerRow[]; wl: [number,number] };
type Box = { d: (number|null)[][]; h: SideBox; a: SideBox };
type School = [string, number, number];
type Roster = { id:string; name:string; level:string; pitcher:boolean };
type Metrics = { d: number[][]; source?: SideBox };

async function main() {
const index = JSON.parse(fs.readFileSync(INDEX_PATH,'utf8')) as any;
const oldLbRaw = JSON.parse(fs.readFileSync(LB_PATH,'utf8')) as any;
const oldLb: any[] = Array.isArray(oldLbRaw) ? oldLbRaw : oldLbRaw.games || [];
const schools = new Map<number,School>(Object.entries(index.schools).map(([k,v])=>[Number(k),v as School]));
const schoolIds = new Set(schools.keys());

function hash(s:string){
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  return h>>>0;
}
function rand01(key:string){ return hash(key)/4294967296; }
function syntheticWL(playerid:string,week:number,level:string):[number,number]{
  const college=/NCAA|NAIA|JUCO|NJCAA|CCCAA|NWAC|COLLEGE/i.test(level);
  const games=college?4:6;
  const wins=hash(`yatstats-2026-wl:${playerid}:${week}:${level}`)%(games+1);
  return [wins,games-wins];
}
function pct([w,l]:[number,number]){ return w+l ? w/(w+l) : .5; }
function scoreFlat(inn:number[]){ let h=0,a=0; inn.forEach((v,i)=>i%2?h+=0:a+=0); for(let i=0;i<inn.length;i+=2){h+=inn[i]||0;a+=inn[i+1]||0;} return [h,a] as [number,number]; }
function deterministicWinner(home:number,away:number,week:number){ return hash(`sim-v3-tie:${week}:${home}:${away}`)%2 ? home : away; }

const oldGames = new Map<number,{g:Game,file:string}>();
for(const r of index.rounds||[]) for(const s of r.series||[]) for(const g of s[7]||[]) oldGames.set(Number(g[0]),{g,file:`d-${r.r}-${Number(s[0]||0)}`});
for(const g of oldLb) oldGames.set(Number(g[0]),{g:g.slice(0,7) as Game,file:`d-lb-${g[1]}-${g[7]}`});
for(const x of index.lbt||[]) oldGames.set(Number(x.game[0]),{g:x.game,file:'d-lbt'});
for(const g of index.gf||[]) oldGames.set(Number(g[0]),{g,file:'d-gf'});

const metricBySchoolWeek = new Map<string,Metrics>();
const oldSideBySchoolWeek = new Map<string,SideBox>();
const detailFiles = fs.readdirSync(DIR).filter(f=>/^d-.*\.json$/.test(f));
for(const file of detailFiles){
  let obj:any={};
  try{ obj=JSON.parse(fs.readFileSync(path.join(DIR,file),'utf8')); }catch{ continue; }
  for(const [idStr,boxRaw] of Object.entries(obj)){
    const meta=oldGames.get(Number(idStr)); if(!meta) continue;
    const box=boxRaw as Box, g=meta.g, week=Number(g[1]);
    const hd=(box.d||[]).slice(0,8).map(r=>[Number(r?.[0]??100),Number(r?.[2]??100)]);
    const ad=(box.d||[]).slice(0,8).map(r=>[Number(r?.[1]??100),Number(r?.[3]??100)]);
    metricBySchoolWeek.set(`${g[2]}|${week}`,{d:hd});
    metricBySchoolWeek.set(`${g[3]}|${week}`,{d:ad});
    if(box.h) oldSideBySchoolWeek.set(`${g[2]}|${week}`,box.h);
    if(box.a) oldSideBySchoolWeek.set(`${g[3]}|${week}`,box.a);
  }
}

function syntheticMetrics(h:number,w:number):number[][]{
  return Array.from({length:8},(_,i)=>{
    const o=65+(hash(`ops:${h}:${w}:${i}`)%91);
    const p=65+(hash(`fip:${h}:${w}:${i}`)%91);
    return [o,p];
  });
}
function metrics(h:number,w:number){
  const m=metricBySchoolWeek.get(`${h}|${w}`);
  const d=m?.d?.length===8 ? m.d : syntheticMetrics(h,w);
  return d.map(([o,p])=>[Number.isFinite(o)?o:100,Number.isFinite(p)?p:100]);
}

const pool=new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false}});
const rosterRows=(await pool.query(`
  -- Fantasy roster membership mirrors the visible Active Baseball Alumni
  -- flip-card gallery. Stats never decide whether an alumnus exists on the
  -- fantasy roster: new graduates and other zero-stat players still belong.
  WITH season_rows AS (
    SELECT playerid::text AS playerid, teamid, NULLIF(highlevel,'') AS raw_level, false AS pitcher
      FROM tbc_batting_2026_season_raw
     WHERE year='2026'
    UNION ALL
    SELECT playerid::text AS playerid, teamid, NULLIF(highlevel,'') AS raw_level, true AS pitcher
      FROM tbc_pitching_2026_season_raw
     WHERE year='2026'
  ),
  season_meta AS (
    SELECT sr.playerid,
           MAX(sr.raw_level) AS raw_level,
           MAX(tum.level_label) AS mapped_level,
           bool_or(sr.pitcher) AS pitcher
      FROM season_rows sr
      LEFT JOIN teamid_universe_mapping tum ON tum.teamid=sr.teamid
     GROUP BY sr.playerid
  )
  SELECT f.hsid,
         f.playerid::text AS playerid,
         COALESCE(
           NULLIF(trim(f.display_name),''),
           NULLIF(trim(concat_ws(' ',f.first_name,f.last_name)),''),
           f.playerid::text
         ) AS name,
         COALESCE(
           NULLIF(f.level_label,''),
           NULLIF(sm.mapped_level,''),
           NULLIF(sm.raw_level,''),
           'UNKNOWN'
         ) AS level,
         COALESCE(
           sm.pitcher,
           CASE
             WHEN upper(COALESCE(f.position,'')) ~ '(^|[^A-Z])(P|RHP|LHP|PITCHER)([^A-Z]|$)' THEN true
             ELSE false
           END
         ) AS pitcher
    FROM flip_card_front_stage f
    LEFT JOIN season_meta sm ON sm.playerid=f.playerid::text
   WHERE COALESCE(upper(trim(f.status_label)),'') <> 'RETIRED'
     AND COALESCE(upper(trim(f.level_label)),'') NOT IN ('HIGH SCHOOL','HS')
`)).rows as any[];
await pool.end();

const rosters=new Map<number,Roster[]>();
for(const r of rosterRows){
  const h=Number(r.hsid); if(!schoolIds.has(h)) continue;
  const row:Roster={id:String(r.playerid),name:String(r.name||`Player ${r.playerid}`),level:String(r.level||'MLB'),pitcher:Boolean(r.pitcher)};
  if(!rosters.has(h)) rosters.set(h,[]);
  rosters.get(h)!.push(row);
}
for(const [h,rows] of rosters) rows.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));

function extendPit(x:number[]){ if(x.length>=9)return x; const [outs=0,hr=0,bb=0,hbp=0,k=0]=x; const ip=outs/3; const hits=outs?Math.max(hr,Math.round(ip*.9)):0; const runs=outs?Math.max(hr,Math.round((hits+bb+hbp)*.38)):0; const er=Math.max(0,runs-(runs>2?1:0)); const fip=outs?(13*hr+3*(bb+hbp)-2*k)/ip+3.1:0; return [outs,hr,bb,hbp,k,hits,runs,er,+fip.toFixed(2)]; }

function ensureVisibleWeeklyProduction(h:number,w:number,players:PlayerRow[]){
  const [targetOps,targetFip]=metrics(h,w)[7] || [100,100];
  const totalAb=players.reduce((s,p)=>s+(Array.isArray(p[4])?Number(p[4][1]||0):0),0);
  if(!totalAb && players.length){
    const candidates=players.filter(p=>!Array.isArray(p[5]) || Number((p[5] as number[])[0]||0)===0);
    const p=candidates[hash(`bat-fill:${h}:${w}`) % Math.max(1,candidates.length)] || players[0];
    const ab=4 + (hash(`ab:${h}:${w}:${p[0]}`) % 7);
    const hts=Math.max(1,Math.min(ab,Math.round(ab*(0.20 + (hash(`avg:${h}:${w}`)%26)/100))));
    const d2=Math.min(hts,hash(`2b:${h}:${w}`)%3);
    const hr=Math.min(Math.max(0,hts-d2),hash(`hr:${h}:${w}`)%2);
    const bb=hash(`bb:${h}:${w}`)%3;
    const hbp=hash(`hbp:${h}:${w}`)%2;
    const sf=hash(`sf:${h}:${w}`)%2;
    p[4]=[ab+bb+hbp+sf,ab,hts,d2,0,hr,bb,hbp,sf];
    p[6]=Math.round(targetOps);
  }
  const totalOuts=players.reduce((s,p)=>s+(Array.isArray(p[5])?Number(p[5][0]||0):0),0);
  if(!totalOuts && players.length){
    const candidates=players.filter(p=>Array.isArray(p[5]));
    const p=candidates[hash(`pit-fill:${h}:${w}`) % Math.max(1,candidates.length)] || players[0];
    const outs=9 + (hash(`outs:${h}:${w}:${p[0]}`) % 10);
    const ip=outs/3;
    const hits=Math.max(1,Math.round(ip*(0.65+(hash(`hits:${h}:${w}`)%45)/100)));
    const bb=hash(`pbb:${h}:${w}`)%3;
    const hbp=hash(`phbp:${h}:${w}`)%2;
    const hr=hash(`phr:${h}:${w}`)%2;
    const k=Math.max(1,Math.round(ip*(0.8+(hash(`pk:${h}:${w}`)%80)/100)));
    const runs=Math.max(hr,Math.round((hits+bb+hbp)*0.32));
    const er=Math.max(0,runs-(runs>2?1:0));
    const fip=Math.max(0.1,4.2*(Number(targetFip||100)/100));
    p[5]=[outs,hr,bb,hbp,k,hits,runs,er,+fip.toFixed(2)];
    p[7]=Math.round(targetFip);
  }
}

function sideBox(h:number,w:number):SideBox{
  const old=oldSideBySchoolWeek.get(`${h}|${w}`);
  const by=new Map<string,PlayerRow>((old?.p||[]).map(p=>[String(p[0]),p]));
  const roster=rosters.get(h)||[];
  const players:PlayerRow[]=roster.map(r=>{
    const p=by.get(r.id);
    let row:PlayerRow;
    if(p){ row=[...p] as PlayerRow; if(row[5]) row[5]=extendPit([...(row[5] as number[])]); }
    else {
      const college=/NCAA|NAIA|JUCO|NJCAA|CCCAA|NWAC|COLLEGE/i.test(r.level);
      row=[r.id,r.name,r.level,college?1:0,0,0,null,null,null,1];
    }
    if(!row[4]&&!row[5]){
      if(r.pitcher){ row[5]=[0,0,0,0,0,0,0,0,0]; row[7]=0; }
      else { row[4]=[0,0,0,0,0,0,0,0,0]; row[6]=0; }
    }
    if(!row[8]){ row[8]=syntheticWL(r.id,w,r.level); row[9]=1; }
    return row;
  });
  // Keep any source row not found by the canonical query.
  for(const p of by.values()) if(!players.some(x=>String(x[0])===String(p[0]))){
    const row=[...p] as PlayerRow; if(row[5]) row[5]=extendPit([...(row[5] as number[])]);
    if(!row[8]){row[8]=syntheticWL(String(row[0]),w,String(row[2]||'MLB'));row[9]=1;}
    players.push(row);
  }
  // The preview is intentionally complete. If a carried-forward weekly
  // OPS+/FIP- metric has no visible player production behind it, create a
  // deterministic weekly line so the box score and the metric cannot
  // contradict each other (e.g. OPS+ 88 with every batter at 0 AB).
  ensureVisibleWeeklyProduction(h,w,players);
  const wl=players.reduce<[number,number]>((s,p)=>{const x=p[8]||[0,0];return [s[0]+x[0],s[1]+x[1]]},[0,0]);
  return {p:players,wl};
}

function play(home:number,away:number,week:number,id:number){
  const hm=metrics(home,week), am=metrics(away,week);
  const d:number[][]=[]; const inn:number[]=[];
  for(let i=0;i<8;i++){
    const [ho,hp]=hm[i], [ao,ap]=am[i];
    const hr=(ho>ao?1:0)+(hp<ap?1:0);
    const ar=(ao>ho?1:0)+(ap<hp?1:0);
    inn.push(hr,ar); d.push([ho,ao,hp,ap]);
  }
  const hb=sideBox(home,week), ab=sideBox(away,week);
  const hwp=pct(hb.wl), awp=pct(ab.wl);
  inn.push(hwp>awp?1:0,awp>hwp?1:0);
  const [hs,as]=scoreFlat(inn);
  const winner=hs===as?deterministicWinner(home,away,week):hs>as?home:away;
  const g:Game=[id,week,home,away,hs===as?'coin':'runs',inn,winner];
  return {g,box:{d,h:hb,a:ab} as Box};
}

let gid=0;
const outDetails=new Map<string,Record<string,Box>>();
function saveBox(file:string,id:number,box:Box){ if(!outDetails.has(file))outDetails.set(file,{});outDetails.get(file)![String(id)]=box; }
const elimWeek=new Map<number,number>();
const rounds:any[]=[];
let aliveSeries=index.rounds[0].series.map((s:any)=>({a:Number(s[1]),b:Number(s[2]),region:Number(s[0]),sa:Number(s[3]),sb:Number(s[4])}));
for(let r=1;r<=10;r++){
  const series:any[]=[]; const winners:number[]=[];
  for(let i=0;i<aliveSeries.length;i++){
    const x=aliveSeries[i], home=x.sa<=x.sb?x.a:x.b, away=x.sa<=x.sb?x.b:x.a;
    const hs=schools.get(home)?.[2]??999, as=schools.get(away)?.[2]??999;
    const region=r<=7?(schools.get(home)?.[1]||0):0;
    const games:Game[]=[];
    for(let k=0;k<3;k++){ const week=(r-1)*3+k+1; const p=play(home,away,week,++gid); games.push(p.g);saveBox(`d-${r}-${region}`,gid,p.box); }
    const hw=games.filter(g=>g[6]===home).length, aw=3-hw;
    const winner=hw>aw?home:away, loser=winner===home?away:home;
    elimWeek.set(loser,r*3); winners.push(winner);
    series.push([region,home,away,hs,as,winner,[hw,aw],games]);
  }
  const old=index.rounds[r-1]||{};
  rounds.push({r,name:old.name||`Round ${r}`,start:index.weeks[(r-1)*3][0],end:index.weeks[r*3-1][1],series});
  if(r<10){
    const next:any[]=[];
    for(let i=0;i<winners.length;i+=2){const a=winners[i],b=winners[i+1];next.push({a,b,region:r+1<=7?(schools.get(a)?.[1]||0):0,sa:schools.get(a)?.[2]??999,sb:schools.get(b)?.[2]??999});}
    aliveSeries=next;
  }
}
const champion=rounds[9].series[0][5] as number;

const lbGames:any[]=[];
const board=new Map<number,{h:number,g:number,w:number,l:number,t:number,rf:number,ra:number}>();
function addBoard(g:Game){const [hs,as]=scoreFlat(g[5]);for(const [h,rf,ra] of [[g[2],hs,as],[g[3],as,hs]] as any){const s=board.get(h)||{h,g:0,w:0,l:0,t:0,rf:0,ra:0};s.g++;s.rf+=rf;s.ra+=ra;if(g[6]===h)s.w++;else if(g[6]===null)s.t++;else s.l++;board.set(h,s);}}
for(const r of rounds) for(const s of r.series) for(const g of s[7]) addBoard(g);

for(let r=2;r<=10;r++){
  const first=(r-1)*3+1;
  for(let region=1;region<=8;region++){
    const pool=[...elimWeek.entries()].filter(([h,w])=>w<first&&schools.get(h)?.[1]===region).map(([h])=>h);
    pool.sort((a,b)=>(hash(`lb:${r}:${region}:${a}`)-hash(`lb:${r}:${region}:${b}`))||a-b);
    for(let i=0;i+1<pool.length;i+=2){
      const a=pool[i],b=pool[i+1];
      for(let k=0;k<3;k++){const w=first+k,p=play(a,b,w,++gid);const row=[...p.g,region];lbGames.push(row);saveBox(`d-lb-${w}-${region}`,gid,p.box);addBoard(p.g);}
    }
  }
}
for(const h of schools.keys()) if(!board.has(h)) board.set(h,{h,g:0,w:0,l:0,t:0,rf:0,ra:0});
const rank=(a:number,b:number)=>{const x=board.get(a)!,y=board.get(b)!;return y.rf-x.rf||(y.rf-y.ra)-(x.rf-x.ra)||y.w-x.w||(schools.get(a)?.[2]??999)-(schools.get(b)?.[2]??999)};
const leaders:number[]=[];
for(let region=1;region<=8;region++){const list=[...schools.keys()].filter(h=>schools.get(h)?.[1]===region).sort(rank);leaders.push(list.find(h=>h!==champion)!);}
leaders.sort(rank);
const seed=new Map(leaders.map((h,i)=>[h,i+1]));
const order=[0,7,3,4,1,6,2,5];
let alive=order.map(i=>leaders[i]);
const lbt:any[]=[];
for(let week=31;week<=33;week++){
  const next:number[]=[];
  for(let i=0;i<alive.length;i+=2){
    const a=alive[i],b=alive[i+1], home=(seed.get(a)||99)<=(seed.get(b)||99)?a:b, away=home===a?b:a;
    const p=play(home,away,week,++gid); saveBox('d-lbt',gid,p.box);
    lbt.push({seeds:[seed.get(home),seed.get(away)],game:p.g});next.push(p.g[6]!);
  }
  alive=next;
}
const lbChampion=alive[0];
const gfPlay=play(champion,lbChampion,34,++gid);saveBox('d-gf',gid,gfPlay.box);
const gf=[gfPlay.g],grandChampion=gfPlay.g[6];

for(const file of fs.readdirSync(DIR)) if(/^d-.*\.json$/.test(file)) fs.rmSync(path.join(DIR,file));
for(const [file,obj] of outDetails) fs.writeFileSync(path.join(DIR,`${file}.json`),JSON.stringify(obj));
fs.writeFileSync(LB_PATH,JSON.stringify({games:lbGames}));
const outIndex={
  ...index,
  snapshot:{id:'sim-2026-v3',schema:3,source:'fixture-metrics+neon-roster',seed:'yatstats-2026-v3'},
  rounds,lbt,gf,champion,lbLeaders:leaders,lbChampion,grandChampion,
  rosters:Object.fromEntries([...rosters.entries()].map(([h,rs])=>[h,rs.map(r=>[r.id,r.name,r.level,r.pitcher?1:0])])),
};
fs.writeFileSync(INDEX_PATH,JSON.stringify(outIndex));
console.log(JSON.stringify({schools:schools.size,rosters:rosters.size,games:gid,champion,lbChampion,grandChampion},null,2));

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
