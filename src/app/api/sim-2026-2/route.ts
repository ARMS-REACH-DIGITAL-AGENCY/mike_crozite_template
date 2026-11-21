import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { query } from '@/lib/db';
import { fetchBracketLiveBatches } from '@/lib/bracket/fetchLiveBatches';
import { computeSeason, clubsOf } from '../../../../scripts/master-bracket-results';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
import type { GameBox, GameRow, Index, LbGame, SeriesRow } from '@/components/bracket/gallery';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const START = '2026-03-25';
const END = '2026-11-18';
const STAGES: Record<string,number> = {bracket:0,total_runs:1,season_championship:2,world_series:3};
let snapshot: Promise<unknown> | null = null;


/** Adapt the completed historical season to the EXISTING production bracket reader.
 * This is not a second rendering implementation and never writes to Neon.
 */
function toPrepared(rows: any[]) {
  const weeks = tournamentWeeks(START, 34);
  const schools: Index['schools'] = {};
  const first = rows.filter((r: any) => r.stage === 'bracket' && r.round === 1 && r.game_no === 1);
  if (first.length !== 512) throw new Error('Opening round does not have 512 series');
  for (const r of first) {
    schools[String(r.home_hsid)] = [r.home_school_name || String(r.home_hsid), Number(r.region), Number(r.home_seed) || 0];
    schools[String(r.away_hsid)] = [r.away_school_name || String(r.away_hsid), Number(r.region), Number(r.away_seed) || 0];
  }
  if (Object.keys(schools).length !== 1024) throw new Error('Incomplete replay field');
  const toGame = (r: any): GameRow => [
    Number(r.game_id), Number(r.week), Number(r.home_hsid), Number(r.away_hsid),
    r.decided_by || 'runs', (r.innings || []).map(Number), Number(r.winner_hsid),
  ];
  const rounds: Index['rounds'] = [];
  for (let n = 1; n <= 10; n++) {
    const bySeries = new Map<string, any[]>();
    for (const r of rows) {
      if (r.stage !== 'bracket' || r.round !== n) continue;
      const key = String(r.region) + ':' + String(r.series_no);
      if (!bySeries.has(key)) bySeries.set(key, []);
      bySeries.get(key)!.push(r);
    }
    const series: SeriesRow[] = Array.from(bySeries.values()).map((raw) => {
      raw.sort((a, b) => a.game_no - b.game_no);
      const [home, away] = [Number(raw[0].home_hsid), Number(raw[0].away_hsid)];
      const games = raw.map(toGame);
      const hw = games.filter((g) => g[6] === home).length;
      const aw = games.filter((g) => g[6] === away).length;
      if (games.length !== 3 || (hw < 2 && aw < 2)) throw new Error('Incomplete three-game series');
      return [Number(raw[0].region), home, away, Number(raw[0].home_seed) || 0,
        Number(raw[0].away_seed) || 0, hw >= 2 ? home : away, [hw, aw], games];
    });
    rounds.push({ r: n, name: 'Round ' + n, start: weeks[(n - 1) * 3][0],
      end: weeks[n * 3 - 1][1], series });
  }
  const lb: LbGame[] = rows.filter((r) => r.stage === 'total_runs')
    .map((r) => [...toGame(r), Number(r.region)] as LbGame);
  const championship = rows.filter((r) => r.stage === 'season_championship')
    .sort((a, b) => a.week - b.week || a.game_id - b.game_id);
  const lbt: Index['lbt'] = championship.map((r) => ({
    seeds: [Number(r.home_seed) || 0, Number(r.away_seed) || 0] as [number, number],
    game: toGame(r),
  }));
  const gf = rows.filter((r) => r.stage === 'world_series').map(toGame);
  const bracketFinal = rounds[9].series.find((s) => s[7].some((g) => g[1] === 30));
  const lbFinal = championship.find((r) => r.week === 33);
  const last = gf.find((g) => g[1] === 34);
  const lbLeaders = championship.filter((r) => r.week === 31)
    .flatMap((r) => [[Number(r.home_seed), Number(r.home_hsid)], [Number(r.away_seed), Number(r.away_hsid)]])
    .sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  if (!bracketFinal || !lbFinal || !last || lbLeaders.length !== 8)
    throw new Error('Missing replay championship path');
  const index: Index = {
    season: 2026, weeks, schools, rounds, lbt, gf, champion: bracketFinal[5],
    lbLeaders, lbChampion: Number(lbFinal.winner_hsid), grandChampion: Number(last[6]), alumni: {},
  };
  return { index, lb, live: [] as [number, number, 'top' | 'posted'][] };
}

function boxFile(r: any): string {
  if (r.stage === 'bracket') return 'd-' + r.round + '-' + r.region;
  if (r.stage === 'total_runs') return 'd-lb-' + r.week + '-' + r.region;
  if (r.stage === 'season_championship') return 'd-lbt';
  if (r.stage === 'world_series') return 'd-gf';
  throw new Error('Unknown replay stage ' + r.stage);
}

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

  // The first pass computes ALL official matchups/results using the unchanged
  // production scorer. A final read-only pass constructs the exact same
  // GameBox/Stat Ledger objects consumed by the existing school UX.
  // Make unlocked COPIES: otherwise scoreGroup omits results for locked finals.
  const ledgerPass = computeSeason(
    season, rows.map((r: any) => ({ ...r, locked_at: null })), [], live, END, true, clubs
  );
  if (ledgerPass.decisions.length || ledgerPass.results.length !== 15368)
    throw new Error('Historical Stat Ledger reconstruction incomplete');
  const boxes: Record<string, Record<string, GameBox>> = {};
  let boxCount = 0;
  for (const scored of ledgerPass.results) {
    const row: any = byId.get(scored.region + ':' + scored.game_id);
    if (!row || scored.home_runs !== row.home_runs || scored.away_runs !== row.away_runs ||
        scored.winner_hsid !== row.winner_hsid ||
        JSON.stringify(scored.innings) !== JSON.stringify(row.innings))
      throw new Error('Stat Ledger score differs from locked replay result');
    if (scored.box) {
      const file = boxFile(row);
      (boxes[file] ||= {})[String(row.game_id)] = scored.box;
      boxCount++;
    }
  }
  if (boxCount !== 15368) throw new Error('Not every replay game has a Stat Ledger');
  const prepared = toPrepared(rows);

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
    games, prepared, boxes
  };
}

export async function GET(req:NextRequest) {
  // A preview-only test harness. Never expose the replay on a Production deployment.
  if (process.env.VERCEL_ENV === 'production') return NextResponse.json({error:'Preview only'}, {status:404});
  try {
    if (!snapshot) snapshot = calculate().catch((err)=>{snapshot=null;throw err;});
    const data:any=await snapshot;

    const file = req.nextUrl.searchParams.get('boxes');
    if (file !== null) {
      if (!/^(?:d-(?:[1-9]|10)-[0-8]|d-lb-(?:[1-9]|[12][0-9]|30)-[0-8]|d-lbt|d-gf)$/.test(file))
        return NextResponse.json({error:'Invalid Stat Ledger file'}, {status:400});
      return NextResponse.json(data.boxes[file] || {});
    }
    if (req.nextUrl.searchParams.get('view') === 'prepared')
      return NextResponse.json(data.prepared);
    const { games, prepared, boxes, ...summary } = data;
    if (req.nextUrl.searchParams.has('meta')) return NextResponse.json(summary);
    return NextResponse.json({ ...summary, games });

  } catch(error) {
    console.error('[2026.2 readonly replay]',error);
    return NextResponse.json({error:'2026.2 preview calculation unavailable'},{status:500});
  }
}
