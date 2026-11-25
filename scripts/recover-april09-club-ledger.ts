// TEST-ONLY: one guarded repair of the rejected April 9, 2026 QA checkpoint.
// Read the original captured provider results; never change the April 8 checkpoint
// or reingest any day. Default is read-only proof. --apply is authorized only on
// the rehearsal workflow after the shared fix matches Easter-NEWS.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';
import { scoreLive, type Live, type FrozenClubDays } from '@/components/bracket/liveSeason';
import type { GameBox, GameRow, Index, SeriesRow, SideBox } from '@/components/bracket/gallery';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
import { stableJson } from '@/lib/newsletter/finishedPublication';
import { acquireRehearsalCheckpointLock } from './lib/rehearsal-checkpoint-lock';

const SEASON='2027', DAY='2026-04-09', CUTOFF='2026-04-10T11:00:00Z', OPENING='2026-03-23';
const BRANCH='br-falling-wind-a4ew8f1p', ENDPOINT='ep-shy-forest-a4s3qsv6';
const BAD='c89bada00641ad8522d454bcbf0f7f34dc340ab1a11e9de151b1e351b222ccbe';
const PRIOR='e375cddc0372ae3c1bdd90872023cd6371927b6f091b117e81f9a79b45a1d7d9';
const FIRST='2026-04-06';
const digest=(v:unknown)=>createHash('sha256').update(stableJson(JSON.parse(JSON.stringify(v)))).digest('hex');
const next=(s:string)=>new Date(Date.parse(s+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const arg=(s:string)=>{const i=process.argv.indexOf(s);return i<0?undefined:process.argv[i+1];};
type Stored={game_id:number;week:number;region:number;stage:string;home_hsid:number;away_hsid:number;status:string;computed_at:string;locked_at:string|null;innings:number[];box:GameBox};
type Saved={report_date:string;phase:string;branch_id:string;effective_at:string;evidence:Record<string,any>;stored_results:Stored[];source_snapshot:{start:string;branch:string;live:Live}};
const SELECT_RESULTS=`SELECT stage,region,round,series_no,game_no,game_id,week,home_hsid,away_hsid,
  status,innings,home_runs,away_runs,winner_hsid,decided_by,computed_at::text,locked_at::text,box
  FROM master_bracket WHERE season_key=$1 AND computed_at IS NOT NULL ORDER BY stage,region,round,series_no,game_no`;
function snapshotIndex(rows:Stored[]):Index {
  const series:SeriesRow[]=rows.map(g=>[g.region,g.home_hsid,g.away_hsid,1,2,0,[0,0],[[g.game_id,g.week,g.home_hsid,g.away_hsid,'',[],null] as GameRow]] as SeriesRow);
  return {weeks:tournamentWeeks(OPENING,34),schools:{},rounds:[{r:1,name:'Recovery',series,start:FIRST,end:'2026-04-12'}],lbt:[],gf:[],champion:0,lbLeaders:[],lbChampion:0} as unknown as Index;
}
function assertWl(a:unknown,b:unknown,description:string){if(stableJson(a)!==stableJson(b))throw Error('W-L proof failed: '+description+' expected '+JSON.stringify(a)+' computed '+JSON.stringify(b));}
type Change={game_id:number;side:'h'|'a';yatid:string;before:number[];after:number[]};
function addFacts(saved:GameBox,fresh:GameBox,day:number,id:number,changes:Change[]) {
  const box=structuredClone(saved);
  for(const k of ['h','a'] as const) {
    const before=box[k],after=fresh[k];
    assert(before.days?.length===7 && after.days?.length===7 && after.clubGames, 'missing daily game facts for '+id);
    const generated=new Map(after.p.map(row=>[row[0],row]));
    assert.equal(generated.size,before.p.length,'roster size mismatch '+id+'/'+k);
    const indices=after.days.map(rows=>new Map(rows.map(r=>[r[0],r])));
    for(const p of before.p) {
      const n=generated.get(p[0]);assert(n,'Missing player '+p[0]+' for '+id);
      assertWl(p[8],n[8],id+'/'+p[0]+'/week');
      assert(after.clubGames[p[0]]?.length===7,'missing provenance for '+p[0]);
      for(let d=0;d<7;d++){
        const prior=before.days[d].find(row=>row[0]===p[0]);
        const computed=indices[d].get(p[0]);assert(prior&&computed,'roster mismatch '+id+'/'+p[0]+'/'+d);
        const old=prior[8]||[0,0],correct=computed[8]||[0,0];
        if(stableJson(old)===stableJson(correct))continue;
        // The only allowed score-data change is removal of the same final game
        // that was already credited on Tuesday, from Thursday's duplicate.
        assert.equal(day,3,'prior checkpoint discrepancy');
        assert.equal(d,3,'attempt to alter a different day');
        const duplicate=after.clubGames[p[0]][1].find(g=>g[0]==='820363');
        assert(duplicate && !after.clubGames[p[0]][3].some(g=>g[0]==='820363'),'not a proven relocated game '+p[0]);
        assertWl(old,[correct[0]+duplicate[1],correct[1]+1-duplicate[1]],id+'/'+p[0]+'/duplicate');
        changes.push({game_id:id,side:k,yatid:p[0],before:[...old],after:[...correct]});
        prior[8]=[...correct];
      }
    }
    assertWl(before.wl,after.wl,id+'/'+k+'/school');
    assert.equal(before.rd,after.rd,'unexpected change to run differential '+id+'/'+k);
    before.clubGames=after.clubGames;
    // Audit the same independent invariant on the corrected in-memory ledger.
    for(const p of before.p){
      const sums=before.days.reduce((v,rows)=>{const w=rows.find(r=>r[0]===p[0])?.[8]||[0,0];return [v[0]+w[0],v[1]+w[1]];},[0,0]);
      assertWl(p[8],sums,id+'/'+p[0]+'/reconciled');
    }
  }
  return box;
}
async function main(){
  const apply=process.argv.includes('--apply');
  const config=arg('--connection-file')?JSON.parse(readFileSync(arg('--connection-file')!,'utf8')):{DATABASE_URL:process.env.DATABASE_URL,PLAYERS_DATABASE_URL:process.env.PLAYERS_DATABASE_URL,branch_id:process.env.REHEARSAL_NEON_BRANCH};
  assert(config.DATABASE_URL&&config.DATABASE_URL===config.PLAYERS_DATABASE_URL,'both QA connections must match');
  assert.equal(config.branch_id,BRANCH,'wrong branch');
  const host=new URL(config.DATABASE_URL).hostname;
  assert.equal(host.split('.')[0].replace(/-pooler$/,''),ENDPOINT,'wrong host');
  assert.notEqual(process.env.VERCEL_ENV,'production');
  if(apply) {
    assert.equal(process.env.GITHUB_REF,'refs/heads/test/2026-production-parity-20261121','apply only on authorized rehearsal branch');
    execFileSync('git',['diff','--quiet','origin/Easter-NEWS','HEAD','--','scripts/master-bracket-results.ts','scripts/master-bracket-clock.test.ts','src/components/bracket/gallery.tsx','src/components/bracket/liveSeason.ts']);
  }
  const pool=new Pool({connectionString:config.DATABASE_URL,ssl:{rejectUnauthorized:false},max:2});
  const client=await pool.connect(); let release:(()=>Promise<void>)|undefined;
  try{
    if(apply) release=await acquireRehearsalCheckpointLock(pool,BRANCH,SEASON);
    await client.query(apply?'BEGIN ISOLATION LEVEL SERIALIZABLE':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identity=(await client.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint")).rows[0]?.endpoint;
    assert.equal(identity,ENDPOINT,'actual Neon endpoint differs');
    const latest=(await client.query("SELECT report_date::text,phase,evidence FROM public.bracket_rehearsal_days WHERE season_key=$1 ORDER BY report_date DESC LIMIT 1",[SEASON])).rows[0];
    assert(latest,'missing rehearsal checkpoint');
    if(latest.report_date>DAY || (latest.report_date===DAY && latest.evidence.clubLedgerRecovery?.originalHash===BAD)){
      console.log('April 9 recovery already completed or checkpoint advanced');await client.query('ROLLBACK');return;
    }
    assert.equal(latest.report_date,DAY,'recovery requires April 9 as latest day');
    assert.equal(latest.phase,'awaiting_review');
    assert.equal(latest.evidence.storedHash,BAD,'unexpected failed checkpoint hash');
    const {rows:checkpoints}=await client.query<Saved>(`SELECT report_date::text,phase,branch_id,effective_at::text,evidence,stored_results,source_snapshot
      FROM public.bracket_rehearsal_days WHERE season_key=$1 AND report_date BETWEEN $2 AND $3 ORDER BY report_date`,[SEASON,FIRST,DAY]);
    assert.equal(checkpoints.length,4);
    assert.equal(checkpoints[2].evidence.storedHash,PRIOR,'April 8 checkpoint changed');
    const current=(await client.query<Stored>(SELECT_RESULTS,[SEASON])).rows;
    assert.equal(digest(current),BAD,'current stored results differ from failed checkpoint');
    let last=new Map<number,GameBox>();
    const changes:Change[]=[];
    for(let d=0;d<checkpoints.length;d++){
      const cp=checkpoints[d];
      assert.equal(cp.report_date,new Date(Date.parse(FIRST+'T00:00:00Z')+d*86400000).toISOString().slice(0,10));
      assert.equal(cp.branch_id,BRANCH);assert.equal(cp.source_snapshot.branch,BRANCH);assert.equal(cp.source_snapshot.start,OPENING);
      assert.equal(digest(cp.stored_results),cp.evidence.storedHash,'invalid stored checkpoint hash');
      assert.equal(digest(cp.source_snapshot.live),cp.evidence.sourceHash,'invalid captured source hash');
      const rows=cp.stored_results.filter(row=>row.week===3);
      assert.equal(rows.length,512);
      const frozen:FrozenClubDays=new Map([...last].map(([id,box])=>[id,{closed:d,box}]));
      const boxes=scoreLive(snapshotIndex(rows),cp.source_snapshot.live,next(cp.report_date),frozen);
      last=new Map(rows.map(row=>{
        assert.equal(row.status,'in_progress');assert.equal(row.locked_at,null);
        assert(boxes[String(row.game_id)],'missing computed game '+row.game_id);
        return [row.game_id,addFacts(row.box,boxes[String(row.game_id)],d,row.game_id,changes)];
      }));
    }
    assert.equal(changes.length,30,'must reconcile exactly the 30 reported discrepancies');
    assert.equal(new Set(changes.map(x=>x.game_id+'/'+x.side+'/'+x.yatid)).size,30,'duplicate corrections');
    const corrected=current.map(row=>row.week===3?{...row,box:last.get(row.game_id)!}:row);
    const correctedHash=digest(corrected);
    const report={day:DAY,cutoff:CUTOFF,originalHash:BAD,april8Hash:PRIOR,correctedHash,games:512,corrections:changes,lockedGamesUnchanged:1024,mode:apply?'apply':'read-only'};
    if(apply){
      await client.query("SET LOCAL master_bracket.reason = 'QA-only April 9 rejected audit: relocated club game 820363; closed days retained'");
      await client.query(`CREATE TABLE IF NOT EXISTS public.bracket_rehearsal_failed_checkpoints (
        season_key text NOT NULL, report_date date NOT NULL, original_hash text NOT NULL, evidence jsonb NOT NULL,
        stored_results jsonb NOT NULL, archived_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(season_key,report_date,original_hash))`);
      const archive=await client.query(`INSERT INTO public.bracket_rehearsal_failed_checkpoints(season_key,report_date,original_hash,evidence,stored_results)
        SELECT season_key,report_date,evidence->>'storedHash',evidence,stored_results FROM public.bracket_rehearsal_days
        WHERE season_key=$1 AND report_date=$2 AND evidence->>'storedHash'=$3`,[SEASON,DAY,BAD]);
      assert.equal(archive.rowCount,1);
      const payload=corrected.filter(row=>row.week===3).map(row=>({game_id:row.game_id,box:row.box}));
      const updated=await client.query(`UPDATE public.master_bracket m SET box=x.box FROM jsonb_to_recordset($2::jsonb) x(game_id integer,box jsonb)
        WHERE m.season_key=$1 AND m.week=3 AND m.game_id=x.game_id AND m.locked_at IS NULL AND m.status='in_progress' AND m.computed_at=$3::timestamptz`,[SEASON,JSON.stringify(payload),CUTOFF]);
      assert.equal(updated.rowCount,512);
      const persisted=(await client.query<Stored>(SELECT_RESULTS,[SEASON])).rows;
      assert.equal(digest(persisted),correctedHash,'persisted repair differs from verified plan');
      const checkpoint=await client.query(`UPDATE public.bracket_rehearsal_days SET stored_results=$3::jsonb,
        evidence=evidence||jsonb_build_object('storedHash',$4::text,'clubLedgerRecovery',$5::jsonb,'workflowVerified',false),updated_at=now()
        WHERE season_key=$1 AND report_date=$2 AND evidence->>'storedHash'=$6`,[SEASON,DAY,JSON.stringify(persisted),correctedHash,JSON.stringify(report),BAD]);
      assert.equal(checkpoint.rowCount,1);
      const prior=await client.query("SELECT stored_results,evidence FROM public.bracket_rehearsal_days WHERE season_key=$1 AND report_date='2026-04-08'",[SEASON]);
      assert.equal(digest(prior.rows[0].stored_results),PRIOR);assert.equal(prior.rows[0].evidence.storedHash,PRIOR);
      await client.query('COMMIT');
    }else await client.query('ROLLBACK');
    if(arg('--report'))writeFileSync(arg('--report')!,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({day:DAY,mode:report.mode,games:report.games,corrections:changes.length,originalHash:BAD,correctedHash,april8Hash:PRIOR}));
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
  finally{client.release();try{await release?.();}finally{await pool.end();}}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
