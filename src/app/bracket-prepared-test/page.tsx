import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { TEST_BRACKET, TEST_OPENING_DAY } from '@/lib/bracket/testSeason';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Prepared Bracket Comparison | YAT?STATS', robots: {index:false,follow:false} };
type Season = {season_key:string; opening_day:string; last_day:string};
type Game = {round:number; week:number; game_no:number; series_no:number; game_id:number; game_start_date:string;game_end_date:string; home_school_name:string|null;away_school_name:string|null;home_hsid:number|null;away_hsid:number|null;status:string;home_runs:number|null;away_runs:number|null;winner_hsid:number|null; locked_at:string|null};
export default async function PreparedBracketComparison() {
  if(process.env.VERCEL_ENV==='production') notFound();
  const season = (await query<Season>(`SELECT season_key,opening_day::text,last_day::text FROM public.fantasy_seasons
    WHERE is_test=true AND opening_day=$1::date AND regions=6 AND schools_per_region=16
    ORDER BY season_key LIMIT 1`,[TEST_OPENING_DAY])).rows[0];
  if(!season) return <main style={{padding:32,fontFamily:'Arial'}}><h1>Comparison held</h1><p>Expected isolated test season not found. No scores generated.</p></main>;
  const games=(await query<Game>(`SELECT round,week,game_no,series_no,game_id,game_start_date::text,game_end_date::text,
    home_school_name,away_school_name,home_hsid,away_hsid,status,home_runs,away_runs,winner_hsid,locked_at::text
    FROM public.master_bracket WHERE season_key=$1 AND region=$2 AND stage='bracket'
    ORDER BY round,series_no,game_no`,[season.season_key,TEST_BRACKET])).rows;
  const rounds=[...new Set(games.map(g=>g.round))];
  const c={bg:'#10171d',panel:'#1c252e',ink:'#f4f4f1',muted:'#b5c2cc',gold:'#f4ca52',line:'#3b4854'};
  return <main style={{fontFamily:'Arial,sans-serif',background:c.bg,color:c.ink,minHeight:'100vh',padding:'24px clamp(12px,3vw,44px)'}}>
    <header style={{borderBottom:'3px solid '+c.gold,paddingBottom:18,marginBottom:24}}>
      <p style={{letterSpacing:2,color:c.gold,fontSize:13,margin:'0 0 8px'}}>YAT?STATS · TEST BRACKET {TEST_BRACKET}A · PREPARED RESULTS</p>
      <h1 style={{fontSize:'clamp(24px,4vw,40px)',margin:'0 0 8px'}}>Stored-result comparison</h1>
      <p style={{color:c.muted,margin:0}}>Season {season.season_key} · {season.opening_day} through {season.last_day} · Region {TEST_BRACKET}</p>
      <p style={{fontSize:13,color:c.gold}}>Read-only database display. No live scoring, recomputation, writes, or email.</p>
    </header>
    <section style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:26}}>
      {[['Games in stored schedule',games.length],['Final',games.filter(g=>g.status==='final').length],['Locked',games.filter(g=>!!g.locked_at).length],['Unpaired',games.filter(g=>g.home_hsid==null||g.away_hsid==null).length]].map(([k,v])=>
        <div key={String(k)} style={{background:c.panel,border:'1px solid '+c.line,padding:16,minWidth:135,flex:'1 1 135px'}}>
          <div style={{fontSize:12,color:c.muted}}>{k}</div><strong style={{fontSize:28,color:c.gold}}>{v}</strong>
        </div>)}
    </section>
    {rounds.map(round=><section key={round} style={{marginBottom:28}}>
      <h2 style={{borderBottom:'1px solid '+c.line,paddingBottom:12}}>Round {round}</h2>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,330px),1fr))',gap:12}}>
      {games.filter(g=>g.round===round).map(g=><article key={g.game_id} style={{background:c.panel,border:'1px solid '+c.line,padding:16}}>
        <p style={{fontSize:12,color:c.muted,margin:'0 0 12px'}}>Series {g.series_no} · Game {g.game_no} · Week {g.week} · {g.game_start_date}–{g.game_end_date}</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10}}>
          <span>{g.home_school_name||'Awaiting opponent'}</span><strong>{g.home_runs??'—'}</strong>
          <span>{g.away_school_name||'Awaiting opponent'}</span><strong>{g.away_runs??'—'}</strong>
        </div>
        <p style={{fontSize:12,color:g.status==='final'?c.gold:c.muted,margin:'12px 0 0'}}>
          {g.status.toUpperCase()}{g.locked_at?' · FROZEN':''}{g.winner_hsid?' · Winner '+g.winner_hsid:''}
        </p>
      </article>)}
      </div>
    </section>)}
    <footer style={{color:c.muted,fontSize:12}}>Each result comes from public.master_bracket on the branch-specific isolated Neon database.</footer>
  </main>;
}
