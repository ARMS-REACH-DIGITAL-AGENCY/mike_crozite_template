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
export async function GET(request:NextRequest) {
 if(process.env.VERCEL_ENV!=='preview')return NextResponse.json({error:'preview_only'},{status:403});
 // This route reads ONLY the branch-scoped isolated Neon connection. No scoring, writes, cron, or email.
 if(!process.env.PLAYERS_DATABASE_URL&&!process.env.DATABASE_URL)
  return NextResponse.json({error:'database_not_configured'},{status:503});
 const mode=request.nextUrl.searchParams.get('view')||'index';
 try{
  if(mode==='boxes')return NextResponse.json({},{headers:{'Cache-Control':'no-store'}});
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
