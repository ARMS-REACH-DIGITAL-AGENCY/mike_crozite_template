import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { TEST_BRACKET, TEST_OPENING_DAY } from '@/lib/bracket/testSeason';
import { TEST_BRACKETS } from '@/lib/bracket/testBrackets';
import type { Index, LbGame, GameRow, SeriesRow, GameBox } from '@/components/bracket/gallery';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Row = { region:number; round:number; series_no:number; game_no:number; week:number;
 home_hsid:number|null; away_hsid:number|null; home_seed:number|null; away_seed:number|null;
 competition:string; result_state:string; home_runs:number; away_runs:number;
 inning_states:unknown; advances_hsid:number|null; };
type Series = { round:number;series_no:number;home_hsid:number|null;away_hsid:number|null;
 home_wins:number;away_wins:number;advancing_hsid:number|null;game3_active:boolean };
type Day = { region:number;round:number;series_no:number;game_no:number;stats_date:string;home_runs:number;away_runs:number;score_state:string };
const dataSql = `SELECT s.region,s.round,s.series_no,s.game_no,s.week,s.home_hsid,s.away_hsid,
 s.home_seed,s.away_seed,s.competition,p.result_state,p.home_runs,p.away_runs,p.inning_states,p.advances_hsid
 FROM isolated_pipeline.schedule_games s
 JOIN isolated_pipeline.prepared_game_states p USING(season_key,region,round,series_no,game_no)
 WHERE s.season_key='test-2026' AND s.region=$1 AND s.round<=4
 ORDER BY s.round,s.series_no,s.game_no`;
const seriesSql = `SELECT round,series_no,home_hsid,away_hsid,home_wins,away_wins,
 advancing_hsid,game3_active FROM isolated_pipeline.prepared_series_states
 WHERE season_key='test-2026' AND region=$1 AND round<=4 ORDER BY round,series_no`;
const daySql = `SELECT region,round,series_no,game_no,stats_date::text,home_runs,away_runs,score_state
 FROM isolated_pipeline.day_game_innings WHERE season_key='test-2026' AND region=$1
 ORDER BY round,series_no,game_no,stats_date`;
const iso = (v:Date) => v.toISOString().slice(0,10);
function mapInnings(row:Row,days:Day[]):number[] {
 if (Array.isArray(row.inning_states) && row.inning_states.every(v=>typeof v==='number'))
  return row.inning_states as number[];
 const result:number[] = [];
 for(const d of days.filter(d=>d.round===row.round&&d.series_no===row.series_no&&d.game_no===row.game_no)) {
  const dayOffset=Math.round((Date.parse(d.stats_date+'T00:00:00Z')-
   Date.parse(iso(new Date(Date.parse(TEST_OPENING_DAY+'T00:00:00Z')+(row.week-1)*7*86400000))+'T00:00:00Z'))/86400000);
  if(dayOffset<0||dayOffset>6)continue;
  result[dayOffset*2]=d.home_runs;
  result[dayOffset*2+1]=d.away_runs;
 }
 return Array.from({length:result.length},(_,i)=>result[i]||0);
}
function game(row:Row,days:Day[]):GameRow {
 const id = (row.round-1)*1000+(row.series_no-1)*3+row.game_no;
 return [id,row.week,row.home_hsid||0,row.away_hsid||0,
 row.result_state==='final'?'stored_final':row.result_state==='provisional'?'stored_provisional':'',
 mapInnings(row,days),row.result_state==='final'?row.advances_hsid:null];
}

type Snapshot = { hsid:number; stats_date:string; player_lines: Array<Record<string,unknown>> };
function n(v:unknown):number {const x=Number(v);return Number.isFinite(x)?x:0;}
function asPlayerRow(item:Record<string,unknown>,names:Record<string,string>):import('@/components/bracket/gallery').PlayerRow {
 const id=String(item.playerid||'');
 const bat=[n(item.bat_pa),n(item.bat_ab),n(item.bat_h),n(item.bat_2b),n(item.bat_3b),
   n(item.bat_hr),n(item.bat_bb),n(item.bat_hbp),n(item.bat_sf)];
 const pit=[n(item.pit_outs),n(item.pit_hr),n(item.pit_bb),n(item.pit_hbp),n(item.pit_so),0,0,0,0];
 const hasBat=bat.some(v=>v>0),hasPit=pit.some(v=>v>0);
 return [id,names[id]||id,String(item.level||'MLB'),0,hasBat?bat:0,hasPit?pit:0,null,null,null,0];
}
async function preparedBoxes(rows:Row[]):Promise<Record<string,GameBox>> {
 const saved=await query<Snapshot>(`SELECT hsid,stats_date::text,player_lines
 FROM isolated_pipeline.day_school_inputs
 WHERE season_key='test-2026' AND region=$1 AND stats_date BETWEEN DATE '2026-10-26' AND DATE '2026-10-27'`,[TEST_BRACKET]);
 const allIds=[...new Set(saved.rows.flatMap(s=>(s.player_lines||[]).map(x=>String(x.playerid||'')).filter(Boolean)))];
 const identity=allIds.length?await query<{playerid:string;display_name:string}>(`
 SELECT DISTINCT ON (playerid::text) playerid::text AS playerid,display_name
 FROM public.flip_card_front_stage WHERE playerid::text=ANY($1::text[])
 ORDER BY playerid::text`,[allIds]):{rows:[]};
 const names=Object.fromEntries(identity.rows.map(x=>[x.playerid,x.display_name]));
 const snapshot=new Map(saved.rows.map(x=>[x.hsid+'/'+x.stats_date,x]));
 const out:Record<string,GameBox>={};
 for(const g of rows.filter(r=>r.round===2&&r.game_no===1&&r.home_hsid&&r.away_hsid)){
  const id=(g.round-1)*1000+(g.series_no-1)*3+g.game_no;
  function side(hsid:number):GameBox['h']{
   const days:Array<import('@/components/bracket/gallery').PlayerRow[]>=Array.from({length:7},()=>[]);
   const weekly=new Map<string,Record<string,unknown>>();
   for(let d=0;d<2;d++){
    const date=d===0?'2026-10-26':'2026-10-27';
    const lines=snapshot.get(hsid+'/'+date)?.player_lines||[];
    days[d]=lines.map(x=>asPlayerRow(x,names));
    for(const x of lines) {
      const pid=String(x.playerid||'');if(!pid)continue;
      const old=weekly.get(pid)||{...x};
      if(weekly.has(pid)){
       for(const key of ['bat_pa','bat_ab','bat_h','bat_2b','bat_3b','bat_hr','bat_bb','bat_hbp','bat_sf',
         'pit_outs','pit_hr','pit_bb','pit_hbp','pit_so'])
         old[key]=n(old[key])+n(x[key]);
      }
      weekly.set(pid,old);
    }
   }
   return {p:[...weekly.values()].map(x=>asPlayerRow(x,names)),wl:[0,0],days};
  }
  out[String(id)]={d:[],f:[[true,true],[false,false],...Array.from({length:7},()=>[false,false]) as [boolean,boolean][]],
    h:side(g.home_hsid!),a:side(g.away_hsid!)};
 }
 return out;
}

export async function GET(request:NextRequest) {
 if(process.env.VERCEL_ENV!=='preview')return NextResponse.json({error:'preview_only'},{status:403});
 // This route reads ONLY the branch-scoped isolated Neon connection. No scoring, writes, cron, or email.
 if(!process.env.PLAYERS_DATABASE_URL&&!process.env.DATABASE_URL)
  return NextResponse.json({error:'database_not_configured'},{status:503});
 const mode=request.nextUrl.searchParams.get('view')||'index';
 try{
  if(mode==='boxes') {
   const rows=(await query<Row>(dataSql,[TEST_BRACKET])).rows;
   return NextResponse.json(await preparedBoxes(rows),{headers:{'Cache-Control':'no-store'}});
  }
  const [gamesRes,seriesRes,daysRes]=await Promise.all([
   query<Row>(dataSql,[TEST_BRACKET]),query<Series>(seriesSql,[TEST_BRACKET]),query<Day>(daySql,[TEST_BRACKET])
  ]);
  const games=gamesRes.rows, series=seriesRes.rows, days=daysRes.rows;
  const fields=TEST_BRACKETS[TEST_BRACKET-1];
  const schools:Index['schools']={};
  fields.forEach(([hsid,name],seed)=>{schools[hsid]=[name,1,seed+1]});
  // Fail closed if the field or previously completed round is missing.
  if(games.filter(g=>g.round===1&&g.competition==='championship').length!==24||
     games.filter(g=>g.round===2&&g.competition==='championship'&&g.home_hsid&&g.away_hsid).length!==12)
   return NextResponse.json({error:'incomplete_prepared_bracket'},{status:503});
  const seriesByKey=new Map(series.map(s=>[`${s.round}/${s.series_no}`,s]));
  const rounds:Index['rounds']=Array.from({length:10},(_,i)=>{
   const round=i+1;const start=iso(new Date(Date.parse(TEST_OPENING_DAY+'T00:00:00Z')+(round-1)*21*86400000));
   const end=iso(new Date(Date.parse(start+'T00:00:00Z')+20*86400000));
   const group=new Map<number,Row[]>();
   for(const g of games.filter(g=>g.round===round&&g.competition==='championship')) {
    const arr=group.get(g.series_no)||[];arr.push(g);group.set(g.series_no,arr);
   }
   const mapped:SeriesRow[]=[...group.entries()].sort((a,b)=>a[0]-b[0]).map(([seriesNo,rs])=>{
    const g=rs[0], summary=seriesByKey.get(`${round}/${seriesNo}`);
    return [1,g.home_hsid||0,g.away_hsid||0,g.home_seed||0,g.away_seed||0,
     summary?.advancing_hsid||0,[summary?.home_wins||0,summary?.away_wins||0],
     rs.sort((a,b)=>a.game_no-b.game_no).map(r=>game(r,days))];
   });
   return {r:round,name:`Round ${round}`,start,end,series:mapped};
  });
  const lb:LbGame[]=games.filter(g=>g.competition==='total_runs'&&g.home_hsid&&g.away_hsid)
   .map(g=>[...game(g,days),1] as LbGame);
  if(mode==='leaderboard')return NextResponse.json(lb,{headers:{'Cache-Control':'no-store'}});
  if(mode!=='index')return NextResponse.json({error:'unsupported_view'},{status:400});
  const index:Index={season:2026,weeks:tournamentWeeks(TEST_OPENING_DAY,34),schools,rounds,
   lbt:[],gf:[],champion:0,lbLeaders:[],lbChampion:0,grandChampion:0};
  return NextResponse.json(index,{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  console.error('[prepared-bracket]',error instanceof Error?error.message:'unknown');
  return NextResponse.json({error:'prepared_results_unavailable'},{status:503});
 }
}
