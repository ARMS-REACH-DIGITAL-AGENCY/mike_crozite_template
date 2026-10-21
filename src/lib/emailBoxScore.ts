/**
 * Email-safe, noninteractive version of the fantasy Stat Ledger.
 * Roster membership comes from /api/players/[hsid]'s authoritative players.
 * Values come ONLY from recorded player_game_logs; never from bracket simulations.
 */
export type LedgerPlayer = {
  playerid: string;
  display_name?: string | null;
  name?: string | null;
  position?: string | null;
  current_team_name?: string | null;
  is_pitcher?: boolean;
  is_two_way_2026?: boolean;
  has_batting_2026?: boolean;
  has_pitching_2026?: boolean;
};
export type LedgerGameLog = {
  playerid: string;
  stat_type: string;
  stats: Record<string, unknown> | null;
};
type LedgerStats = {
  ab: number; h: number; doubles: number; triples: number; hr: number;
  bb: number; hbp: number; sf: number; pa: number; r: number; rbi: number;
  outs: number; er: number; k: number; w: number; l: number;
};
const zero = (): LedgerStats => ({
  ab:0,h:0,doubles:0,triples:0,hr:0,bb:0,hbp:0,sf:0,pa:0,r:0,rbi:0,
  outs:0,er:0,k:0,w:0,l:0,
});
const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const htmlSafe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' } as Record<string,string>)[c]
);
function aggregate(logs: LedgerGameLog[], statType: 'batting' | 'pitching'): LedgerStats {
  const a = zero();
  for (const log of logs) {
    if (log.stat_type !== statType) continue;
    const s = log.stats || {};
    if (statType === 'batting') {
      a.pa += num(s.plateAppearances);
      a.ab += num(s.atBats);
      a.h += num(s.hits);
      a.doubles += num(s.doubles);
      a.triples += num(s.triples);
      a.hr += num(s.homeRuns);
      a.bb += num(s.baseOnBalls);
      a.hbp += num(s.hitByPitch);
      a.sf += num(s.sacFlies);
      a.r += num(s.runs);
      a.rbi += num(s.rbi);
    } else {
      a.outs += num(s.outs);
      a.h += num(s.hits);
      a.r += num(s.runs);
      a.er += num(s.earnedRuns);
      a.hr += num(s.homeRuns);
      a.bb += num(s.baseOnBalls);
      a.hbp += num(s.hitBatsmen ?? s.hitByPitch);
      a.k += num(s.strikeOuts);
      a.w += num(s.wins);
      a.l += num(s.losses);
    }
  }
  return a;
}
function sum(rows: LedgerStats[]): LedgerStats {
  const result = zero();
  for (const row of rows) for (const key of Object.keys(result) as Array<keyof LedgerStats>) result[key] += row[key];
  return result;
}
const rate = (n: number) => (Number.isFinite(n) ? n.toFixed(3).replace(/^0/, '') : '.000');
const innings = (outs: number) => String(Math.floor(outs / 3)) + '.' + String(outs % 3);
const obp = (s: LedgerStats) => {
  const den = s.ab + s.bb + s.hbp + s.sf;
  return den ? (s.h + s.bb + s.hbp) / den : 0;
};
const slg = (s: LedgerStats) => s.ab ? (s.h + s.doubles + 2*s.triples + 3*s.hr)/s.ab : 0;
function batterCells(s: LedgerStats): string[] {
  // OPS+ and club W-L are not in the recorded player game logs; never invent them.
  return ['—','—',s.ab,s.h,s.doubles,s.triples,s.hr,s.bb,s.hbp,s.sf,rate(obp(s)),rate(slg(s)),rate(obp(s)+slg(s))].map(String);
}
function pitcherCells(s: LedgerStats): string[] {
  const ip = s.outs/3;
  const whip = ip ? (s.h+s.bb)/ip : 0;
  const kbb = s.bb ? (s.k/s.bb) : 0;
  // FIP- and FIP are absent from these individual real-game records.
  return ['—',s.w+'-'+s.l,innings(s.outs),s.h,s.r,s.er,s.hr,s.bb,s.hbp,s.k,rate(whip),kbb.toFixed(2),'—'].map(String);
}
function pitcherRole(p: LedgerPlayer) {
  return Boolean(p.is_pitcher) || /^(P|LHP|RHP|PITCHER)$/.test(String(p.position||'').trim().toUpperCase());
}
const headStyle='background:#006e47;color:#fff;font:bold 10px Arial,sans-serif;white-space:nowrap;text-align:right;padding:8px 3px;border-right:1px solid rgba(255,255,255,.12)';
const cellStyle='color:#1d2822;font:11px Arial,sans-serif;white-space:nowrap;text-align:right;padding:7px 3px;border-bottom:1px solid #d9e2dc';
function ledgerTable(label:'BATTERS'|'PITCHERS', players: LedgerPlayer[], logs: Map<string, LedgerGameLog[]>) {
  const batting=label==='BATTERS';
  const cols=batting
    ? ['OPS+','W-L','AB','H','2B','3B','HR','BB','HBP','SF','OBP','SLG','OPS']
    : ['FIP-','W-L','IP','H','R','ER','HR','BB','HBP','K','WHIP','K/BB','FIP'];
  const entries=players.map(p=>({p,stats:aggregate(logs.get(String(p.playerid))||[],batting?'batting':'pitching')}));
  const total=sum(entries.map(x=>x.stats));
  const th=(val:string,first=false)=>'<th style="'+headStyle+(first?';text-align:left;min-width:134px':'')+'">'+htmlSafe(val)+'</th>';
  const row=(values:string[],name:string,team:string,idx:number,bold=false)=>{
    const bg=bold?'#e6f0e9':idx%2?'#ffffff':'#f5f8f5';
    const nameTd='<td style="'+cellStyle+';text-align:left;white-space:normal;min-width:134px"><strong>'+htmlSafe(name)+'</strong>'+
      (team?'<div style="font:9px Arial;color:#51675c">'+htmlSafe(team)+'</div>':'')+'</td>';
    return '<tr style="background:'+bg+'">'+nameTd+values.map(v=>'<td style="'+cellStyle+'">'+htmlSafe(v)+'</td>').join('')+'</tr>';
  };
  return '<div style="margin:12px 0 22px"><div style="background:#005735;color:#fff;font:bold 13px Arial;padding:9px 10px;letter-spacing:1px">'+label+'</div>'+
    '<div style="width:100%;overflow-x:auto"><table role="table" cellspacing="0" cellpadding="0" width="100%" style="min-width:710px;border-collapse:collapse;table-layout:fixed">'+
    '<thead><tr>'+th(label,true)+cols.map(c=>th(c)).join('')+'</tr></thead><tbody>'+
    entries.map(({p,stats},i)=>row(batting?batterCells(stats):pitcherCells(stats),
      String(p.display_name||p.name||p.playerid),String(p.current_team_name||''),i)).join('')+
    row(batting?batterCells(total):pitcherCells(total),label+' TOTAL','',entries.length,true)+
    '</tbody></table></div></div>';
}
function section(name:string,players:LedgerPlayer[],logs:Map<string,LedgerGameLog[]>) {
  const bat=players.filter(p=>!pitcherRole(p)||p.is_two_way_2026);
  const pit=players.filter(p=>pitcherRole(p)||p.is_two_way_2026);
  return '<section style="margin:18px 0"><div style="background:#173e30;color:#fff;padding:12px 10px;font:bold 16px Arial,sans-serif">'+
    htmlSafe(name)+' <span style="color:#e1c55b;font:12px Arial">('+players.length+' players)</span></div>'+
    ledgerTable('BATTERS',bat,logs)+ledgerTable('PITCHERS',pit,logs)+'</section>';
}
export function renderAlumniStatsEmail(input:{
  date:string;schoolName:string;schoolLocation?:string;
  schoolUrl?:string;home:LedgerPlayer[];favorites:LedgerPlayer[];logs:LedgerGameLog[];
}) {
  const indexed=new Map<string,LedgerGameLog[]>();
  for(const log of input.logs) {
    const id=String(log.playerid);
    indexed.set(id,[...(indexed.get(id)||[]),log]);
  }
  const dateLabel=new Date(input.date+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'});
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>'+
    '<body style="margin:0;padding:0;background:#f0f1ed">'+
    '<div style="max-width:820px;margin:0 auto;background:#fff;color:#19241e;font-family:Arial,sans-serif">'+
    '<div style="background:#151715;text-align:center;padding:20px 10px;color:#fff">'+
    '<div style="font:bold 15px Georgia,serif;letter-spacing:2px">YAT?STATS</div>'+
    '<h1 style="margin:6px 0;font:bold 25px Georgia,serif">THE ALUMNI DAILY</h1>'+
    '<div style="font:12px Arial;color:#d5dfd8">'+htmlSafe(dateLabel)+'</div></div>'+
    '<div style="padding:10px 12px 18px"><p style="font:12px Arial;margin:12px 0">REAL GAME STATS &bull; FULL ALUMNI ROSTER &bull; YOUR SUPER FAN FAVORITES</p>'+
    section(input.schoolName+(input.schoolLocation?' | '+input.schoolLocation:''),input.home,indexed)+
    (input.favorites.length?section('SUPER FAN CROSS-SCHOOL FAVORITES',input.favorites,indexed):'')+
    '<p style="color:#56665b;font:11px Arial">Every roster member is shown even when no game was recorded (zeros). OPS+, FIP-, FIP and club W-L display an em dash when the official game-log source does not supply them. Pitcher W-L records are individual decisions.</p>'+
    (input.schoolUrl?'<p style="font:12px Arial"><a style="color:#006e47" href="'+htmlSafe(input.schoolUrl)+'">View '+htmlSafe(input.schoolName)+' on YAT?STATS</a></p>':'')+
    '</div></div></body></html>';
}
