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
// The Stat Ledger drawer's columns, less the ones the game logs can't fill
// (OPS+, FIP-, FIP and club W-L were always an em dash here).
const BAT_COLS = ['AB','H','2B','3B','HR','BB','HBP','SF','OBP','SLG','OPS'];
const PIT_COLS = ['W-L','IP','H','R','ER','HR','BB','HBP','K','WHIP','K/BB'];
const WIDE = new Set(['OBP','SLG','OPS','WHIP','K/BB','W-L','IP']);
function batterCells(s: LedgerStats): string[] {
  return [s.ab,s.h,s.doubles,s.triples,s.hr,s.bb,s.hbp,s.sf,rate(obp(s)),rate(slg(s)),rate(obp(s)+slg(s))].map(String);
}
function pitcherCells(s: LedgerStats): string[] {
  const ip = s.outs/3;
  const whip = ip ? (s.h+s.bb)/ip : 0;
  const kbb = s.bb ? (s.k/s.bb) : 0;
  return [s.w+'-'+s.l,innings(s.outs),s.h,s.r,s.er,s.hr,s.bb,s.hbp,s.k,whip.toFixed(2),kbb.toFixed(2)].map(String);
}
function pitcherRole(p: LedgerPlayer) {
  return Boolean(p.is_pitcher) || /^(P|LHP|RHP|PITCHER)$/.test(String(p.position||'').trim().toUpperCase());
}
// The bracket game's Stat Ledger drawer in its light theme: white panel,
// light green header rows with yellow labels and rounded ends, thin grey
// rules, tabular numbers, every column narrow enough to fit a phone.
const C = { page:'#f4f4f4', panel:'#ffffff', line:'#e1e4e8', text:'#121212', muted:'#5f6670', green:'#2e8b5f', yellow:'#ffd34f', dark:'#1f6b45' };
const FONT = 'Arial,Helvetica,sans-serif';
// Single quotes: these go inside style="..." attributes.
const COND = "'Arial Narrow','Roboto Condensed',Arial,Helvetica,sans-serif";
const pill = (text: string) => '<div style="margin:0 0 8px;padding:7px 10px 6px;border-radius:5px;background:'+C.green+';color:'+C.yellow+';font:700 13px/1.2 '+COND+';letter-spacing:.04em;text-transform:uppercase">'+text+'</div>';
type Played = { p: LedgerPlayer; stats: LedgerStats };
function ledgerTable(label:'BATTERS'|'PITCHERS', rows: Played[]) {
  if (!rows.length) return '';
  const batting = label === 'BATTERS';
  const cols = batting ? BAT_COLS : PIT_COLS;
  const th = (val: string, i: number) => {
    const first = i === 0, last = i === cols.length;
    const radius = first ? 'border-radius:5px 0 0 5px;' : last ? 'border-radius:0 5px 5px 0;' : '';
    return '<th style="'+radius+'background:'+C.green+';color:'+C.yellow+';font:700 '+(first?'11':'9.5')+'px/1 '+COND+';padding:6px '+(first?'6px':'0')+';text-align:'+(first?'left':'center')+';white-space:nowrap'+(first?'':';width:'+(WIDE.has(val)?29:val==='HBP'?21:18)+'px')+'">'+htmlSafe(val)+'</th>';
  };
  const td = (v: string, bold: boolean) => '<td style="padding:6px 0;text-align:center;border-bottom:1px solid '+C.line+';color:'+C.text+';font:'+(bold?'700 ':'')+'11px/1.2 '+FONT+';white-space:nowrap">'+htmlSafe(v)+'</td>';
  const nameTd = (name: string, team: string) => '<td style="padding:6px 4px 6px 6px;text-align:left;border-bottom:1px solid '+C.line+';color:'+C.text+'">'+
    '<div style="font:700 12px/1.2 '+FONT+'">'+htmlSafe(name)+'</div>'+
    (team ? '<div style="font:10px/1.25 '+FONT+';color:'+C.muted+'">'+htmlSafe(team)+'</div>' : '')+'</td>';
  const cells = (st: LedgerStats) => batting ? batterCells(st) : pitcherCells(st);
  const body = rows.map(({ p, stats }) => '<tr>'+nameTd(String(p.display_name||p.name||p.playerid).trim(), String(p.current_team_name||'').trim())+cells(stats).map((v) => td(v, false)).join('')+'</tr>').join('');
  const total = rows.length > 1
    ? '<tr>'+'<td style="padding:6px 4px 6px 6px;text-align:left;color:'+C.text+';font:700 11px/1.2 '+COND+';text-transform:uppercase">'+label+' total</td>'+cells(sum(rows.map((r) => r.stats))).map((v) => td(v, true)).join('')+'</tr>'
    : '';
  return '<table role="table" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;margin:0 0 14px;font-variant-numeric:tabular-nums">'+
    '<thead><tr>'+[label, ...cols].map(th).join('')+'</tr></thead><tbody>'+body+total+'</tbody></table>';
}
function section(title: string, players: LedgerPlayer[], logs: Map<string, LedgerGameLog[]>) {
  const has = (p: LedgerPlayer, type: 'batting' | 'pitching') => (logs.get(String(p.playerid)) || []).some((l) => l.stat_type === type);
  const lines = (type: 'batting' | 'pitching') => players
    .filter((p) => has(p, type))
    .map((p) => ({ p, stats: aggregate(logs.get(String(p.playerid)) || [], type) }));
  const bat = lines('batting'), pit = lines('pitching');
  // Everyone on the roster is still named: the ones without a game that day
  // in one quiet line instead of a table of zeros.
  const idle = players.filter((p) => !has(p, 'batting') && !has(p, 'pitching'))
    .map((p) => String(p.display_name || p.name || p.playerid).trim()).filter(Boolean);
  const none = !bat.length && !pit.length;
  return '<div style="margin:0 0 22px">'+pill(title)+
    (none ? '<div style="padding:4px 2px 10px;color:'+C.text+';font:13px/1.4 '+FONT+'">No games played.</div>' : '')+
    ledgerTable('BATTERS', bat)+ledgerTable('PITCHERS', pit)+
    (idle.length ? '<div style="padding:2px 2px 0;color:'+C.muted+';font:11px/1.45 '+FONT+'"><b style="color:'+C.text+'">No game:</b> '+idle.map(htmlSafe).join(', ')+'</div>' : '')+
    '</div>';
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
  const school = input.schoolName+(input.schoolLocation?' | '+input.schoolLocation:'');
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>'+
    '<body style="margin:0;padding:0;background:'+C.page+'">'+
    '<div style="max-width:600px;margin:0 auto;background:'+C.panel+';color:'+C.text+';font-family:'+FONT+'">'+
    '<div style="padding:18px 12px 12px;border-bottom:3px solid '+C.green+'">'+
    '<div style="font:700 12px/1 '+COND+';letter-spacing:.12em;color:'+C.dark+'">YAT?STATS</div>'+
    '<div style="margin:5px 0 3px;font:700 24px/1.1 '+COND+';letter-spacing:.02em;color:'+C.text+'">THE ALUMNI DAILY</div>'+
    '<div style="font:12px/1.3 '+FONT+';color:'+C.muted+'">'+htmlSafe(dateLabel)+'</div></div>'+
    '<div style="padding:14px 8px 18px">'+
    section(htmlSafe(school), input.home, indexed)+
    (input.favorites.length ? section('Your favorites', input.favorites, indexed) : '')+
    (input.schoolUrl ? '<div style="padding:4px 2px 0"><a href="'+htmlSafe(input.schoolUrl)+'" style="display:inline-block;padding:10px 14px;border-radius:5px;background:'+C.green+';color:'+C.yellow+';font:700 12px/1 '+COND+';letter-spacing:.05em;text-decoration:none;text-transform:uppercase">See '+htmlSafe(input.schoolName)+' on YAT?STATS</a></div>' : '')+
    '<p style="margin:14px 2px 0;color:'+C.muted+';font:10px/1.4 '+FONT+'">Real game stats from yesterday&#39;s box scores. Pitcher W-L are individual decisions.</p>'+
    '</div></div></body></html>';
}
