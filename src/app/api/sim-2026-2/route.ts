import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { query } from '@/lib/db';
import { fetchBracketLiveBatches } from '@/lib/bracket/fetchLiveBatches';
import { computeSeason, clubsOf } from '../../../../../scripts/master-bracket-results';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const START = '2026-03-25';
const END = '2026-11-18';
const STAGES: Record<string,number> = {bracket:0,total_runs:1,season_championship:2,world_series:3};
let snapshot: Promise<unknown> | null = null;

async function calculate() {
  const seasonRows = await query<any>(
    "SELECT season_key,name,is_test,opening_day::text,last_day::text,weeks,regions,schools_per_region FROM public.fantasy_seasons WHERE season_key='2026bracketsim'"
  );
  const source = seasonRows.rows[0];
  if (!source || source.weeks !== 34 || source.regions !== 8 || source.schools_per_region !== 128) {
    throw new Error('2026.2 source tournament not available');
  }
  const season = {...source,season_key:'2026.2',opening_day:START,last_day:'2026-11-17'};
  const base = await query<any>(
    "SELECT stage,region,round,round_name,series_no,game_no,game_id,week,home_hsid,away_hsid,home_seed,away_seed,home_school_name,away_school_name FROM public.master_bracket WHERE season_key='2026bracketsim' ORDER BY stage,region,round,series_no,game_no"
  );
  const rows = base.rows.map((r: any) => ({
    ...r,season_key:'2026.2',
    status:r.stage==='bracket' && r.round===1?'scheduled':'tbd',
    home_hsid:r.stage==='bracket' && r.round===1?r.home_hsid:null,
    away_hsid:r.stage==='bracket' && r.round===1?r.away_hsid:null,
    home_seed:r.stage==='bracket' && r.round===1?r.home_seed:null,
    away_seed:r.stage==='bracket' && r.round===1?r.away_seed:null,
    home_school_name:r.stage==='bracket' && r.round===1?r.home_school_name:null,
    away_school_name:r.stage==='bracket' && r.round===1?r.away_school_name:null,
    innings:null,home_runs:null,away_runs:null,winner_hsid:null,decided_by:null,locked_at:null,
  }));
  const field=[...new Set(rows.filter((r: any) => r.stage==='bracket' && r.round===1).flatMap((r: any) => [r.home_hsid,r.away_hsid]))] as number[];
  if (field.length!==1024 || rows.length!==15368) throw new Error('Invalid opening field or game schedule');
  const live = await fetchBracketLiveBatches('https://hamilton.az.yatstats.com',START,34,field);
  const stints = await query<{playerid:string;teamid:string}>(
    "SELECT playerid::text,teamid::text FROM public.player_team_stints WHERE stint_start <= '2026-11-18' AND level IS DISTINCT FROM 'HIGH SCHOOL' ORDER BY playerid,stint_start DESC,teamid"
  );
  const teamOf = new Map<string,string>();
  for(const t of stints.rows) if(!teamOf.has(t.playerid)) teamOf.set(t.playerid,t.teamid);
  const clubs=clubsOf(live,teamOf);
  const byId = new Map(rows.map((r: any) => [r.region+':'+r.game_id,r]));
  let passes=0;
  for(let pass=1;pass<=24;pass++){
    const out=computeSeason(season,rows,[],live,END,false,clubs);
    if(out.decisions.length) throw new Error('Unresolved simulation decisions: '+out.decisions.length);
    for(const g of out.results){
      const row:any=byId.get(g.region+':'+g.game_id);
      if(!row) throw new Error('Unknown scored game');
      if(row.locked_at){
        if(row.winner_hsid!==g.winner_hsid || JSON.stringify(row.innings)!==JSON.stringify(g.innings)) throw new Error('Locked score changed');
        continue;
      }
      Object.assign(row,g,{locked_at:g.lock?END:null});
    }
    for(const fill of out.fills){
      const row:any=byId.get(fill.region+':'+fill.game_id);
      if(!row || row.home_hsid!=null) throw new Error('Repeated or invalid tournament pairing');
      Object.assign(row,fill,{status:'scheduled'});
    }
    passes=pass;
    if(!out.fills.length) break;
  }
  if(rows.filter((r: any)=>r.status==='final').length!==15368) throw new Error('Full season has unfinalized games');
  const games=rows.map((r:any)=>[
    r.week,STAGES[r.stage],r.round,r.region,r.series_no,r.game_no,r.game_id,
    r.home_hsid,r.away_hsid,r.home_seed,r.away_seed,r.home_school_name,r.away_school_name,
    r.home_runs,r.away_runs,r.winner_hsid,r.decided_by,r.innings
  ]);
  const champion=rows.find((r:any)=>r.stage==='world_series');
  return {
    version:1,season:'2026.2',start:START,end:'2026-11-17',weeks:34,schools:1024,
    gamesTotal:games.length,lines:live.lines.length,passes,
    fingerprint:createHash('sha256').update(JSON.stringify(live)).digest('hex'),
    champion:{hsid:champion.winner_hsid,home:champion.home_school_name,away:champion.away_school_name,homeRuns:champion.home_runs,awayRuns:champion.away_runs},
    games
  };
}

export async function GET(req:NextRequest) {
  try {
    if (!snapshot) snapshot = calculate().catch((err)=>{snapshot=null;throw err;});
    const data:any=await snapshot;
    if(req.nextUrl.searchParams.has('meta')){
      const {games,...summary}=data;
      return NextResponse.json(summary,{headers:{'Cache-Control':'public,s-maxage=86400,stale-while-revalidate=86400'}});
    }
    return NextResponse.json(data,{headers:{'Cache-Control':'public,s-maxage=86400,stale-while-revalidate=86400'}});
  } catch(error) {
    console.error('[2026.2 readonly replay]',error);
    return NextResponse.json({error:'2026.2 preview calculation unavailable'},{status:500});
  }
}
