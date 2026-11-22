import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameBox } from '@/components/bracket/gallery';
import { dailyFromStored, weeklyFromStored, requireStoredBoundary, assertStoredCountingStats, type StoredBracketGame } from './storedPublication';
import { buildNewsletterPublication, publishDaily, type Row, type Season, type InLine } from '../../../scripts/newsletter-publish';
import type { Pool, PoolClient } from 'pg';

function fixture(): StoredBracketGame {
  const box: GameBox = {
    d: Array.from({ length: 8 }, () => [100, 100, 100, 100]),
    f: Array.from({ length: 9 }, () => [true, true]),
    h: { p: [], wl: [4, 2], days: Array.from({ length: 7 }, () => []) },
    a: { p: [], wl: [2, 4], days: Array.from({ length: 7 }, () => []) },
  };
  // Home 1 in Monday, away 2 on Tuesday, home 3 Wednesday, home 1 in the ninth.
  const innings = [1, 0, 0, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
  return {
    stage: 'bracket', region: 3, game_id: 42, week: 4,
    home_hsid: 5004, away_hsid: 2992, status: 'final',
    innings, home_runs: 5, away_runs: 2,
    winner_hsid: 5004, decided_by: 'runs', locked_at: '2026-05-04T11:00:00Z', box,
  };
}

test('daily score is a projection of only the saved, settled innings', () => {
  const row = fixture();
  const mon = dailyFromStored(row, 0);
  const tue = dailyFromStored(row, 1);
  assert.deepEqual(mon.homeInnings, [1]);
  assert.deepEqual(tue.awayInnings, [0, 2]);
  assert.equal(mon.homeRuns, 1);
  assert.equal(tue.awayRuns, 2);
  assert.equal(tue.throughInning, 2);
  assert.equal(tue.isFinal, false);
  assert.equal(tue.game[0], 42);
});

test('Sunday Daily shares the stored official final nine-inning result', () => {
  const row = fixture();
  const sun = dailyFromStored(row, 6);
  const weekly = weeklyFromStored(row);
  assert.equal(sun.homeRuns, weekly.homeRuns);
  assert.equal(sun.awayRuns, weekly.awayRuns);
  assert.equal(sun.storyInning, 8);
  assert.equal(sun.throughInning, 9);
  assert.equal(sun.isFinal, true);
  assert.equal(weekly.winnerHsid, row.winner_hsid);
});

test('total-runs games use the same saved projection', () => {
  const row = fixture();
  row.stage = 'total_runs';
  assert.equal(dailyFromStored(row, 2).homeRuns, 4);
  assert.equal(weeklyFromStored(row).homeRuns, 5);
});

test('fails closed if daily player ledger or posting is absent', () => {
  const row = fixture();
  row.box!.f![1][0] = false;
  assert.throws(() => dailyFromStored(row, 1), /not settled/);
  row.box!.f![1][0] = true;
  row.box!.h.days = undefined;
  assert.throws(() => dailyFromStored(row, 1), /Missing stored/);
});

test('fails closed on mismatched final scores, missing locks or missing boxes', () => {
  const row = fixture();
  row.home_runs = 99;
  assert.throws(() => weeklyFromStored(row), /disagree/);
  row.home_runs = 5;
  row.locked_at = null;
  assert.throws(() => dailyFromStored(row, 6), /final locked/);
  row.locked_at = '2026-05-04T11:00:00Z';
  row.box = null;
  assert.throws(() => weeklyFromStored(row), /Missing stored/);
});

test('the stored score is authoritative; no fantasy result is inferred', () => {
  const row = fixture();
  row.winner_hsid = null;
  assert.throws(() => weeklyFromStored(row), /final locked/);
  assert.throws(() => dailyFromStored(row, 6), /final locked/);
});

test('extra innings are included in final Daily and Weekly results', () => {
  const row = fixture();
  row.innings = [...(row.innings as number[]), 0, 2];
  row.away_runs = 4;
  const sunday = dailyFromStored(row, 6);
  const weekly = weeklyFromStored(row);
  assert.equal(sunday.throughInning, 10);
  assert.equal(sunday.awayRuns, 4);
  assert.equal(weekly.awayRuns, 4);
  assert.equal(weekly.awayInnings.length, 10);
  assert.equal(dailyFromStored(row, 0).awayInnings.length, 1);
});

test('invalid single extra-inning score cannot be read as a completed game', () => {
  const row = fixture();
  row.innings = [...(row.innings as number[]), 1];
  assert.throws(() => weeklyFromStored(row), /invalid stored fantasy innings/);
});

const publicationSeason: Season = {season_key:'2027',is_test:false,opening_day:'2026-03-23',last_day:'2026-11-15',weeks:34,regions:1,schools_per_region:2};
const cutoffAt = '2026-03-26T11:00:00.000Z';
function publicationRow(): Row {
  return {...fixture(),week:1,status:'in_progress',winner_hsid:null,locked_at:null,
    computed_at:cutoffAt,round:1,round_name:'Round 1',series_no:1,game_no:1,
    home_seed:1,away_seed:128,home_school_name:'Home',away_school_name:'Away'};
}

function isolatedPublicationTest(name: string, run: () => Promise<void>) {
  test(name, async () => {
    // These tests use mocked database clients. Their fixture target must not
    // inherit the branch or environment of the Vercel build running them.
    const previous = { env: process.env.VERCEL_ENV, branch: process.env.REHEARSAL_NEON_BRANCH };
    process.env.VERCEL_ENV = 'preview';
    process.env.REHEARSAL_NEON_BRANCH = 'br-isolated';
    try {
      await run();
    } finally {
      if (previous.env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous.env;
      if (previous.branch === undefined) delete process.env.REHEARSAL_NEON_BRANCH; else process.env.REHEARSAL_NEON_BRANCH = previous.branch;
    }
  });
}

test('daily readiness requires every preceding inning and the exact persisted boundary', () => {
  const row=publicationRow();
  requireStoredBoundary(row,cutoffAt);
  for(const value of [null,'2026-03-26T10:59:59Z','2026-03-27T11:00:00Z']) {
    row.computed_at=value;
    assert.throws(()=>requireStoredBoundary(row,cutoffAt),/publication cutoff/);
  }
  row.box!.f![0][0]=false;
  assert.throws(()=>dailyFromStored(row,2),/not settled/);
});

test('canonical counting facts must match saved daily rows without recalculating scores', () => {
  const player: GameBox['h']['p'][number]=['YAT000001','Home batter','MLB',0,[4,4,2,0,0,1,0,0,0],0,123,null,[1,0],0];
  const source=[{yatid:'YAT000001',kind:'b' as const,stats:[4,4,2,0,0,1,0,0,0]}];
  assertStoredCountingStats([player],source,'fixture');
  assert.throws(()=>assertStoredCountingStats([player],[],'fixture'),/differs from stored/);
  assert.throws(()=>assertStoredCountingStats([player,player],source,'fixture'),/identity/);
  const simulated=structuredClone(player);simulated[9]=1;
  assert.throws(()=>assertStoredCountingStats([simulated],source,'fixture'),/simulated/);
});

test('a complete day yields strict SQL; any absent box, pairing, or duplicate blocks the plan', () => {
  const row=publicationRow();
  const input={season:publicationSeason,rows:[row],lines:[] as InLine[],date:'2026-03-25',cutoffAt,historicalReplay:true};
  const plan=buildNewsletterPublication(input);
  assert.equal(plan.report.daily?.scores,1);
  assert.equal(plan.report.daily?.stories,2);
  assert.equal(plan.facts.scores[0].home_runs,4);
  assert.match(plan.daily.at(-1)!,/INSERT INTO public.edition_ready/);
  assert.ok(plan.daily.some(sql=>/RAISE EXCEPTION 'Incomplete Daily/.test(sql)));
  assert.ok(!plan.daily.some(sql=>/RAISE NOTICE/.test(sql)));
  assert.throws(()=>buildNewsletterPublication({...input,rows:[]}),/No stored games/);
  assert.throws(()=>buildNewsletterPublication({...input,rows:[row,row]}),/Incomplete edition|Duplicate publication/);
  assert.throws(()=>buildNewsletterPublication({...input,season:{...publicationSeason,schools_per_region:4}}),/Incomplete edition/);
  assert.throws(()=>buildNewsletterPublication({...input,rows:[{...row,away_hsid:null}]}),/Missing stored pairing/);
  assert.throws(()=>buildNewsletterPublication({...input,rows:[{...row,box:null}]}),/Missing stored/);
  assert.throws(()=>buildNewsletterPublication({...input,cutoffAt:'2026-03-26T10:59:59Z'}),/cutoff must/);
});

isolatedPublicationTest('canonical source discrepancy stops publication before an INSERT', async () => {
  const calls:string[]=[];
  const row=publicationRow();
  const line:InLine=['5004','YAT000001','Home batter','2026-03-25','b',[4,4,2,0,0,1,0,0,0],'game1','Home club','MLB','MLB','Away club',[1,2,0,0],true];
  row.box!.h.days![2]=[['YAT000001','Home batter','MLB',0,[4,4,1,0,0,0,0,0,0],0,100,null,[1,0],0]];
  const client={query:async(sql:string)=>{
    calls.push(sql);
    if(sql.includes("current_setting('neon.endpoint_id'"))return {rows:[{endpoint:'ep-isolated'}]};
    if(sql.includes('FROM public.fantasy_seasons'))return {rows:[publicationSeason]};
    if(sql.includes('FROM public.master_bracket'))return {rows:[row]};
    if(sql.includes(' AS source_id'))return {rows:[{source_id:'1',line}]};
    return {rows:[]};
  },release(){}} as unknown as PoolClient;
  const pool={connect:async()=>client} as unknown as Pool;
  await assert.rejects(publishDaily(pool,{season:'2027',date:'2026-03-25',cutoffAt,expectedBranch:'br-isolated',expectedEndpoint:'ep-isolated.test',historicalReplay:true}),/differs from stored/);
  assert.equal(calls.filter(sql=>!sql.includes('pg_advisory_unlock')).at(-1),'ROLLBACK');
  assert.ok(!calls.some(sql=>sql.startsWith('INSERT INTO')));
  assert.ok(!calls.includes('COMMIT'));
});

isolatedPublicationTest('a failed full-edition SQL check rolls back every publication row and never marks ready', async () => {
  const calls:string[]=[];
  const client={query:async(sql:string)=>{
    calls.push(sql);
    if(sql.includes("current_setting('neon.endpoint_id'"))return {rows:[{endpoint:'ep-isolated'}]};
    if(sql.includes('FROM public.fantasy_seasons'))return {rows:[publicationSeason]};
    if(sql.includes('FROM public.master_bracket'))return {rows:[publicationRow()]};
    if(sql.includes(' AS source_id'))return {rows:[]};
    if(sql.includes("RAISE EXCEPTION 'Incomplete Daily"))throw new Error('Incomplete Daily');
    return {rows:[]};
  },release(){}} as unknown as PoolClient;
  const pool={connect:async()=>client} as unknown as Pool;
  await assert.rejects(publishDaily(pool,{season:'2027',date:'2026-03-25',cutoffAt,expectedBranch:'br-isolated',expectedEndpoint:'ep-isolated.test',historicalReplay:true}),/Incomplete Daily/);
  assert.ok(calls.some(sql=>sql.includes('INSERT INTO public.daily_game_scores')));
  assert.equal(calls.filter(sql=>!sql.includes('pg_advisory_unlock')).at(-1),'ROLLBACK');
  assert.ok(!calls.some(sql=>sql.startsWith('INSERT INTO public.edition_ready')));
  assert.ok(!calls.includes('COMMIT'));
});

isolatedPublicationTest('a ready edition retries from exact saved row counts without reading raw sources or inserting', async () => {
  const calls:string[]=[];
  let corrupt=false;
  const ready={season_key:'2027',period_start:'2026-03-25',period_end:'2026-03-25',cutoff_at:cutoffAt,week:1,
    row_counts:{daily_stat_lines:0,daily_game_scores:1,daily_game_stories:2,expected_game_scores:1,missing_game_scores:0,missing_game_stories:0}};
  const client={query:async(sql:string)=>{
    calls.push(sql);
    if(sql.includes("current_setting('neon.endpoint_id'"))return {rows:[{endpoint:'ep-isolated'}]};
    if(sql.includes('FROM public.edition_ready'))return {rows:[ready]};
    if(sql.startsWith('SELECT (SELECT count'))return {rows:[{daily_stat_lines:0,daily_game_scores:1,daily_game_stories:corrupt?1:2}]};
    if(sql.includes('stat_lines s')||sql.includes('FROM public.master_bracket'))assert.fail('Ready retry must use its immutable publication rows');
    return {rows:[]};
  },release(){}} as unknown as PoolClient;
  const pool={connect:async()=>client} as unknown as Pool;
  const opts={season:'2027',date:'2026-03-25',cutoffAt,expectedBranch:'br-isolated',expectedEndpoint:'ep-isolated.test',historicalReplay:true};
  const result=await publishDaily(pool,opts);
  assert.equal(result.alreadyPublished,true);
  assert.ok(calls.includes('COMMIT'));
  assert.ok(!calls.some(sql=>sql.startsWith('INSERT')));
  corrupt=true;calls.length=0;
  await assert.rejects(publishDaily(pool,opts),/incomplete daily_game_stories/);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.includes('COMMIT'));
});
