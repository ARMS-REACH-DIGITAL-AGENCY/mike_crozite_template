// Read-only post-publication contract and small-sample lookup benchmark.
// Run against the SAME Neon branch as the application preview. Uses DATABASE_URL
// from the runner environment; never prints credentials or mutates production.
// Example: TBC_SOURCE_RUN_ID=<verified-uuid> node scripts/verify-tbc-published-universe.mjs
import pg from "pg";
const { Pool } = pg;
const runId=process.env.TBC_SOURCE_RUN_ID;
if(!/^[0-9a-f-]{36}$/i.test(runId||"")||!process.env.DATABASE_URL){
  console.error("Set TBC_SOURCE_RUN_ID and DATABASE_URL in the runner environment.");
  process.exit(2);
}
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:10000,statement_timeout:15000});
const query=async(sql,args=[]) => (await pool.query(sql,args)).rows;
const tests=[];
function check(name,passed,details={}){tests.push({name,passed:Boolean(passed),...details});}
try{
  const [counts]=await query(`
    SELECT
      (SELECT count(*)::int FROM public.tbc_complete_batting_history) AS batting,
      (SELECT count(*)::int FROM public.tbc_complete_pitching_history) AS pitching,
      (SELECT count(*)::int FROM public.tbc_verified_2026_participation) AS played2026,
      (SELECT count(*)::int FROM public.tbc_player_verified_school_links) AS school_links,
      (SELECT count(*)::int FROM public.flip_card_front_stage) AS card_total,
      (SELECT count(*)::int FROM public.tbc_flip_card_publication_holds WHERE source_run_id=$1) AS identity_holds,
      (SELECT count(*)::int FROM public.tbc_player_hsid_candidates WHERE source_run_id=$1 AND review_reason='UNIQUE_SCHOOL_NEEDS_CARD') AS publishable,
      (SELECT count(*)::int FROM public.flip_card_front_stage
        WHERE source_summary->>'source'='tbc_player_feed'
          AND source_summary->>'source_run_id'=$1::text) AS cards_created
  `,[runId]);
  check("historical source complete",counts.batting===501242&&counts.pitching===438097,counts);
  const [sourceAudit]=await query(`
    SELECT captured_at,source_rows,unique_ids,quarantined_rows,status
    FROM public.tbc_players_full_feed_audit_runs WHERE run_id=$1::uuid
  `,[runId]);
  const ageHours=sourceAudit?.captured_at
    ? (Date.now()-new Date(sourceAudit.captured_at).getTime())/3600000 : Infinity;
  check("immutable source is no older than 24 hours",ageHours>=0&&ageHours<=24,
    {sourceCapturedAt:sourceAudit?.captured_at,ageHours:Math.round(ageHours*10)/10});
  check("source contains the latest observed 208465-player feed",
    Number(sourceAudit?.source_rows)>=208465 &&
    Number(sourceAudit?.source_rows)===Number(sourceAudit?.unique_ids) &&
    ["complete","partial"].includes(sourceAudit?.status),
    {sourceRows:sourceAudit?.source_rows,uniqueIds:sourceAudit?.unique_ids,
     quarantined:sourceAudit?.quarantined_rows});
  const [knownProfiles]=await query(`
    SELECT
      (SELECT count(*)::int FROM public.v_tbc_batting_all_seasons_resolved
         WHERE playerid='240673') AS matt_batting,
      (SELECT count(*)::int FROM public.v_tbc_batting_all_seasons_resolved
         WHERE playerid='12401') AS greg_batting,
      (SELECT count(*)::int FROM public.v_tbc_pitching_all_seasons_resolved
         WHERE playerid='12401') AS greg_pitching
  `);
  check("known retired player profiles retain complete career-season history",
    knownProfiles.matt_batting>=5 &&
    knownProfiles.greg_batting>=9 && knownProfiles.greg_pitching>=22,
    {knownProfiles});
  // Five additional players occur only in the continuing daily 2026 feeds.
  // The post-cutover overlay refresh must include at least 44,433 identities,\n  // with the independent daily-coverage check preventing omissions as feed grows.
  check("merged historical + daily 2026 coverage",counts.played2026>=44433);
  check("verified school associations",counts.school_links>=206846);
  check("all publishable new cards exist",counts.publishable===counts.cards_created);
  const [dailyCoverage]=await query(`
    SELECT COUNT(DISTINCT daily.playerid)::int AS omitted
    FROM (
      SELECT playerid FROM public.tbc_batting_2026_season_raw WHERE year='2026'
      UNION
      SELECT playerid FROM public.tbc_pitching_2026_season_raw WHERE year='2026'
    ) daily
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tbc_verified_2026_participation e
      WHERE e.playerid=daily.playerid
    )
  `);
  check("daily 2026 players included in activity evidence",dailyCoverage.omitted===0,{dailyCoverage});
  const [progress]=await query(`
    SELECT r.completed AS raw_done,r.processed_valid_rows::int AS raw_processed,
           f.completed AS cards_done,f.newly_created_cards::int AS cards_created
    FROM public.tbc_player_raw_promotion_progress r
    JOIN public.tbc_flip_card_publication_progress f USING(source_run_id)
    WHERE r.source_run_id=$1::uuid
  `,[runId]);
  check("both resumable batch jobs completed",progress?.raw_done&&progress?.cards_done,{progress});
  const [coverage]=await query(`
    SELECT
      COUNT(*) FILTER(WHERE f.hsid::integer<>l.hsid)::int AS incorrect_hsid,
      COUNT(*) FILTER(WHERE f.current_teamid IS NOT NULL OR f.current_team_name IS NOT NULL)::int AS invented_current_team,
      COUNT(*) FILTER(WHERE e.playerid IS NULL AND f.status_label='ACTIVE')::int AS active_without_2026,
      COUNT(*) FILTER(WHERE e.playerid IS NOT NULL AND f.status_label<>'ACTIVE')::int AS evidence_missing_active
    FROM public.flip_card_front_stage f
    JOIN public.tbc_player_verified_school_links l USING(playerid)
    LEFT JOIN public.tbc_verified_2026_participation e USING(playerid)
    WHERE f.source_summary->>'source'='tbc_player_feed'
      AND f.source_summary->>'source_run_id'=$1::text
  `,[runId]);
  check("published schools/status/teams grounded in source",
    Object.values(coverage).every(v=>v===0),{coverage});
  const [status]=await query(`
    SELECT count(*)::int AS corrected
    FROM public.flip_card_front_stage f
    WHERE f.source_summary#>>'{status_classification,source}'='tbc_complete_history_2026'
      AND f.source_summary#>>'{status_classification,supersedes}'='yatstats_retirement_cutoff'
  `);
  check("2026 automatic retirement correction",status.corrected>=11216,{status});
  const kennedy=await query(`
    SELECT playerid,status_label
      FROM public.flip_card_front_stage
     WHERE playerid=ANY($1::text[]) AND hsid='2025'
  `,[["368002","304329","299616","327486"]]);
  check("Kennedy four 2026 players ACTIVE",
    kennedy.length===4&&kennedy.every(r=>r.status_label==="ACTIVE"),{kennedy});
  // Query-only database measurements, never claim these are end-to-end page times.
  const lookups=[];
  for(const hsid of [5004,2025,3920,13562]){
    const result=await query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT playerid FROM public.player_hsids WHERE hsid=$1",[hsid]);
    const plan=result[0]["QUERY PLAN"][0];
    lookups.push({hsid,execution_ms:plan["Execution Time"],rows:plan.Plan["Actual Rows"]});
  }
  console.log(JSON.stringify({checks:tests,school_lookup_benchmarks:lookups,measurement:"database query only"},null,2));
  if(tests.some(t=>!t.passed))process.exitCode=1;
}catch(error){console.error("Read-only verification failed:",error.message);process.exitCode=1}
finally{await pool.end()}
