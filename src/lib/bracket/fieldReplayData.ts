// TEST ONLY. Build the complete 2027-field school roster for the 2026 replay.
// Historical stats augment this roster; a missing day's game log never removes a player.
import type { query } from '@/lib/db';
import { scoreLive, type Live } from '@/components/bracket/liveSeason';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
import type { ActiveRosterPlayer, GameBox, GameRow, Index, SeriesRow } from '@/components/bracket/gallery';

type Read = typeof query;
type Stage = {
  yatid: string; playerid: string; hsid: string;
  display_name: string | null; first_name: string | null; last_name: string | null;
  position: string | null; level_label: string | null;
  display_level_label: string | null;
};
type Usage = { yatid: string; bats: boolean; pitches: boolean };
type RecentTeam = { yatid: string; team_name: string };
type Roster = { live: Live['roster']; public: Record<string, ActiveRosterPlayer[]>; ids: string[] };
type Game = {
  game_id: number; week: number; round: number; region: number; game_no: number;
  home_hsid: number | null; away_hsid: number | null;
  home_seed: number | null; away_seed: number | null;
  home_school_name: string | null; away_school_name: string | null;
};
type Line = {
  yatid: string; day: number; stat_type: string; stats: Record<string, unknown>;
  game: string; team: string | null; status: string | null; level: string | null;
};
type Club = { team: string; game: string; day: number; won: boolean };
type Schedule = {
  game: string; day: number; status: string | null;
  home: string; away: string; home_runs: number | null; away_runs: number | null; start: string | null;
};
const START = '2026-03-23';
const n = (x: unknown) => Number(x) || 0;
const txt = (x: unknown) => String(x ?? '').trim();
const final = (x: unknown) => /^(final|game over|completed)/i.test(txt(x));
const done = (x: unknown) => /^(final|game over|completed|postponed|cancelled|canceled|suspended|not necessary)/i.test(txt(x));
const started = (x: unknown) => done(x) || (txt(x) !== '' && !/^(scheduled|pre-game|pregame|warmup|delayed start)/i.test(txt(x)));
const isPitcher = (x: unknown) => /(^|[^A-Z])(P|RHP|LHP|PITCHER)([^A-Z]|$)/.test(txt(x).toUpperCase());
const outs = (x: unknown) => { const [a,b] = txt(x || '0').split('.'); return n(a)*3+n(b); };
const bat = (s: Record<string,unknown>) => [n(s.plateAppearances),n(s.atBats),n(s.hits),n(s.doubles),n(s.triples),n(s.homeRuns),n(s.baseOnBalls),n(s.hitByPitch),n(s.sacFlies)];
const pit = (s: Record<string,unknown>) => [outs(s.inningsPitched),n(s.homeRuns),n(s.baseOnBalls),n(s.hitByPitch),n(s.strikeOuts),n(s.hits),n(s.runs),n(s.earnedRuns)];

export async function fieldReplayRosters(read: Read, schoolIds: number[], asof = '2026-03-25'): Promise<Roster> {
  const hsids = [...new Set(schoolIds.filter(id => Number.isInteger(id) && id > 0).map(String))];
  const live: Live['roster'] = Object.fromEntries(hsids.map(id => [id, []]));
  const publicRows: Record<string, ActiveRosterPlayer[]> = Object.fromEntries(hsids.map(id => [id, []]));
  if (!hsids.length) return { live, public: publicRows, ids: [] };
  const {rows} = await read<Stage>(
    "SELECT yatid::text,playerid::text,hsid::text,display_name,first_name,last_name,position,level_label,display_level_label " +
    "FROM public.flip_card_front_stage WHERE hsid::text=ANY($1::text[]) " +
    "AND status_label='ACTIVE' AND yatid IS NOT NULL " +
    "AND UPPER(COALESCE(level_label,display_level_label,'')) NOT IN ('HIGH SCHOOL','HS') " +
    "ORDER BY hsid::text,display_name,yatid", [hsids]);
  const ids = [...new Set(rows.map(r => r.yatid))];
  const {rows:used} = ids.length ? await read<Usage>(
    "SELECT yatid::text, bool_or(stat_type='batting' AND COALESCE((stats->>'plateAppearances')::numeric,0)>0) AS bats, " +
    "bool_or(stat_type='pitching' AND COALESCE((stats->>'outs')::numeric,0)>0) AS pitches " +
    "FROM public.player_game_logs WHERE yatid=ANY($1::text[]) " +
    "AND game_date >= DATE '2026-03-23' AND game_date < DATE '2026-11-17' GROUP BY yatid",
    [ids]) : {rows: [] as Usage[]};
  const usage = new Map(used.map(x => [x.yatid,x]));
  const {rows:teams} = ids.length ? await read<RecentTeam>(
    "SELECT DISTINCT ON (yatid) yatid::text,team_name FROM public.player_game_logs " +
    "WHERE yatid=ANY($1::text[]) AND game_date >= DATE '2026-03-23' " +
    "AND game_date <= $2::date AND team_name IS NOT NULL " +
    "ORDER BY yatid,game_date DESC,updated_at DESC",
    [ids,asof]) : {rows: [] as RecentTeam[]};
  const team = new Map(teams.map(x => [x.yatid,x.team_name]));
  const seen = new Set<string>();
  for(const r of rows) {
    const key=r.hsid+':'+r.yatid;
    if(seen.has(key)) continue;
    seen.add(key);
    const u=usage.get(r.yatid);
    const name=txt(r.display_name) || [txt(r.first_name),txt(r.last_name)].filter(Boolean).join(' ') || r.yatid;
    const level=txt(r.level_label ?? r.display_level_label);
    const pitcher=u?.pitches && !u.bats ? true : u?.bats && !u.pitches ? false : isPitcher(r.position);
    // W-L comes from real 2026 club participation, never today's 2027 assignment.
    live[r.hsid].push([r.yatid,name,level,pitcher?1:0,txt(team.get(r.yatid))]);
    publicRows[r.hsid].push({
      playerid:r.playerid,yatid:r.yatid,display_name:name,level,
      is_pitcher:pitcher,is_two_way_2026:Boolean(u?.pitches && u.bats),
      current_teamid:null
    });
  }
  for(const hsid of hsids) {
    live[hsid].sort((a,b)=>a[1].localeCompare(b[1]));
    publicRows[hsid].sort((a,b)=>txt(a.display_name).localeCompare(txt(b.display_name)));
  }
  return {live,public:publicRows,ids};
}

// One game's historical snapshot, built from source records for dates <= asof.
// The regular bracket scoring engine generates its metrics and full daily player rows.
export async function fieldReplayGame(read: Read, gameId: number, asof: string):
 Promise<{box:GameBox; innings:number[]; winner:number|null; decidedBy:string|null; rosterCounts:[number,number]}|null> {
  const {rows:[g]} = await read<Game>(
    "SELECT game_id,week,round,region,game_no,home_hsid,away_hsid,home_seed,away_seed,home_school_name,away_school_name " +
    "FROM public.master_bracket WHERE season_key='2026-replay-2027-field' AND game_id=$1 LIMIT 1",
    [gameId]);
  if(!g || g.home_hsid==null || g.away_hsid==null) return null;
  const home=Number(g.home_hsid),away=Number(g.away_hsid);
  const weeks=tournamentWeeks(START,34);
  const [weekStart,weekEnd]=weeks[g.week-1] || [];
  if(!weekStart) throw Error('Missing replay week');
  const rosters=await fieldReplayRosters(read,[home,away],asof);
  const schoolOf=new Map<string,string>();
  for(const [hsid,ps] of Object.entries(rosters.live)) for(const p of ps) {
    const prev=schoolOf.get(p[0]);
    if(prev && prev!==hsid) throw Error('Conflicting school for YAT ID '+p[0]);
    schoolOf.set(p[0],hsid);
  }
  const {rows:logs}=rosters.ids.length?await read<Line>(
    "SELECT DISTINCT ON (yatid,source,source_game_id,stat_type) yatid::text, " +
    "(game_date::date-$2::date) AS day,stat_type,stats,source_game_id::text AS game,team_name AS team, " +
    "game_status AS status,raw_payload->'sport'->>'abbreviation' AS level FROM public.player_game_logs " +
    "WHERE yatid=ANY($1::text[]) AND game_date >= $2::date " +
    "AND game_date < $2::date + INTERVAL '7 days' AND game_date <= $3::date " +
    "AND stat_type IN ('batting','pitching') " +
    "ORDER BY yatid,source,source_game_id,stat_type,updated_at DESC",
    [rosters.ids,weekStart,asof]) : {rows:[] as Line[]};
  const lines:Live['lines']=logs.map(r=>[
    schoolOf.get(r.yatid)!,r.yatid,Number(r.day),r.stat_type==='batting'?'b':'p',
    r.stat_type==='batting'?bat(r.stats||{}):pit(r.stats||{}),
    r.game,txt(r.team),done(r.status)?1:0,txt(r.level)
  ]);
  const clubNames=[...new Set([
    ...logs.map(r=>txt(r.team)),
    ...Object.values(rosters.live).flat().map(p=>p[4])
  ].filter(Boolean))];
  const {rows:schedules}=clubNames.length?await read<Schedule>(
    "SELECT game_pk::text AS game,(game_date::date-$2::date) AS day,status,game_time_utc::text AS start, " +
    "home_team_name AS home,away_team_name AS away,home_score AS home_runs,away_score AS away_runs " +
    "FROM public.team_schedules WHERE (home_team_name=ANY($1::text[]) OR away_team_name=ANY($1::text[])) " +
    "AND game_date >= $2::date AND game_date < $2::date + INTERVAL '7 days' AND game_date <= $3::date",
    [clubNames,weekStart,asof]) : {rows:[] as Schedule[]};
  const {rows:clubLines}=clubNames.length?await read<Club>(
    "SELECT DISTINCT ON (team_name,source_game_id) team_name AS team,source_game_id::text AS game, " +
    "(game_date::date-$2::date) AS day,(raw_payload->>'isWin')::boolean AS won " +
    "FROM public.player_game_logs WHERE team_name=ANY($1::text[]) AND game_date >= $2::date " +
    "AND game_date < $2::date + INTERVAL '7 days' AND game_date <= $3::date " +
    "AND game_status ~* '^(final|game over|completed)' AND raw_payload ? 'isWin' " +
    "AND jsonb_typeof(raw_payload->'isWin')='boolean' " +
    "ORDER BY team_name,source_game_id,updated_at DESC",
    [clubNames,weekStart,asof]) : {rows:[] as Club[]};
  const clubs:Live['clubs']={}, games:NonNullable<Live['games']>={};
  const scheduled=new Map<string,boolean>(), recorded=new Set<string>();
  const put=(club:string,day:number,game:string,won:boolean,rd=0)=>{
    const key=club+':'+game;
    if(recorded.has(key))return;
    recorded.add(key);
    (clubs[club] ||= []).push([day,game,won?1:0,rd]);
  };
  const wanted=new Set(clubNames);
  for(const g of schedules){
    const d=Number(g.day),fin=final(g.status);
    scheduled.set(g.game,fin);
    for(const [name,us,them] of [[g.home,g.home_runs,g.away_runs],[g.away,g.away_runs,g.home_runs]] as const){
      if(!wanted.has(name))continue;
      (games[name] ||= []).push([d,g.game,done(g.status)?1:0,started(g.status)?1:0,g.start?Date.parse(g.start)||0:0]);
      if(fin && us!=null && them!=null && us!==them)put(name,d,g.game,us>them,us-them);
    }
  }
  for(const c of clubLines)if(!scheduled.has(c.game) || scheduled.get(c.game))put(c.team,Number(c.day),c.game,c.won);
  const live:Live={asOf:asof,roster:rosters.live,lines,clubs,games,fans:{}};
  const gameRow:GameRow=[g.game_id,g.week,home,away,'',[],null];
  const series:SeriesRow=[g.region,home,away,g.home_seed||0,g.away_seed||0,0,[0,0],[gameRow]];
  const index:Index={
    season:2026,weeks,schools:{
      [String(home)]:[g.home_school_name||String(home),g.region,g.home_seed||0],
      [String(away)]:[g.away_school_name||String(away),g.region,g.away_seed||0]
    },
    rounds:[{r:g.round,name:'Round '+g.round,start:weekStart,end:weekEnd,series:[series]}],
    lbt:[],gf:[],champion:0,lbLeaders:[],lbChampion:0,grandChampion:0
  };
  const boxes=scoreLive(index,live,asof,g.week);
  const box=boxes[String(g.game_id)];
  // A known matchup before its week starts still has an unplayed full roster.
  if(!box) return null;
  return {box,innings:gameRow[5],winner:gameRow[6],decidedBy:gameRow[4]||null,
    rosterCounts:[rosters.live[String(home)].length,rosters.live[String(away)].length]};
}
