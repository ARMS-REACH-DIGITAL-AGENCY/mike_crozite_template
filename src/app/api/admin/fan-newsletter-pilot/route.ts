import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { lookupGHLContactByEmail, sendGHLEmail } from '@/lib/gohighlevel';
import { rosterStatRows } from '@/lib/newsletterRoster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEST_EMAILS = new Set([
  'test1@yatstats.com', 'test2@yatstats.com', 'test3@yatstats.com',
  'test4@yatstats.com', 'test5@yatstats.com', 'test6@yatstats.com',
  'draftpicks@yatstats.com', 'top100prospects@yatstats.com',
]);
type Fan = { firebase_uid: string; home_hsid: string; plan: string; subscription_status: string; promo_code: string | null; promo_expires_at: string | null; stripe_subscription_id: string | null };
type Player = { playerid: string; name: string; hsid: string };
type Stat = { playerid: string; stat_type: string; stats: Record<string,unknown> };
const safe = (x: unknown) => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]);
const n = (s:Record<string,unknown>, k:string) => Number(s[k] || 0);
const line = (x:Stat) => {
  const s=x.stats || {};
  if(x.stat_type==='pitching') {
    const outs=n(s,'outs');
    return Math.floor(outs/3)+'.'+(outs%3)+' IP | '+n(s,'hits')+' H | '+n(s,'earnedRuns')+' ER | '+n(s,'baseOnBalls')+' BB | '+n(s,'strikeOuts')+' K';
  }
  return n(s,'atBats')+' AB | '+n(s,'hits')+' H | '+n(s,'runs')+' R | '+n(s,'rbi')+' RBI | '+n(s,'homeRuns')+' HR | '+n(s,'baseOnBalls')+' BB';
};
function table(players:Player[], byId:Map<string,Stat[]>) {
  return '<table width="100%" style="border-collapse:collapse;font:13px Arial"><thead><tr style="background:#e9e9e9"><th align="left">ALUMNUS</th><th align="left">DAILY BOX SCORE</th></tr></thead><tbody>'+
    rosterStatRows(players,byId).map(p => '<tr><td style="padding:8px;border-bottom:1px solid #ddd">'+safe(p.name)+'</td><td style="padding:8px;border-bottom:1px solid #ddd">'+
      (((p.stats as Stat[]|null)||[]).map(line).join('<hr>') || '0 AB | 0 H | 0 R | 0 RBI | 0 HR | 0 BB (no game recorded)')+
      '</td></tr>').join('')+'</tbody></table>';
}
export async function POST(req:NextRequest) {
  if(!process.env.CRON_SECRET || req.headers.get('authorization')!=='Bearer '+process.env.CRON_SECRET)
    return NextResponse.json({error:'Unauthorized'},{status:401});
  const body=await req.json().catch(()=>null);
  const date=String(body?.date || '');
  const emails=body?.emails;
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || !Array.isArray(emails) || !emails.length || emails.length>8 ||
    emails.some((e:unknown)=>typeof e!=='string' || !TEST_EMAILS.has(e.toLowerCase())))
    return NextResponse.json({error:'Invalid date or test recipient'},{status:400});
  const results=[];
  for(const email of [...new Set((emails as string[]).map(e=>e.toLowerCase()))]) {
    try {
      const profile=(await query<Fan>('SELECT firebase_uid,home_hsid,plan,subscription_status,promo_code,promo_expires_at,stripe_subscription_id FROM user_profiles WHERE lower(email)=lower($1) LIMIT 1',[email])).rows[0];
      if(!profile?.home_hsid) {results.push({email,status:'missing_fan_profile'});continue;}
      const home=(await query<Player>("SELECT DISTINCT ON (playerid) playerid::text AS playerid,COALESCE(NULLIF(display_name,''),trim(concat_ws(' ',first_name,last_name))) AS name,hsid::text AS hsid FROM flip_card_front_stage WHERE hsid::text=$1 ORDER BY playerid,stage_updated_at DESC NULLS LAST",[profile.home_hsid])).rows;
      const favorites=(await query<{playerid:string}>('SELECT DISTINCT playerid::text AS playerid FROM user_favorites WHERE firebase_uid=$1',[profile.firebase_uid])).rows;
      const status=String(profile.subscription_status||'').toLowerCase();
      const superfan=(!!profile.stripe_subscription_id&&['active','trialing'].includes(status)) ||
        (!!profile.promo_code&&(!profile.promo_expires_at||new Date(profile.promo_expires_at)>new Date())) ||
        ['demo_comped','demo-comped'].includes(status) ||
        (profile.plan==='superfan'&&!profile.promo_code&&!profile.stripe_subscription_id&&!['cancelled','canceled','unpaid','past_due'].includes(status));
      const homeIds=new Set(home.map(p=>p.playerid));
      const extraIds=superfan?favorites.map(p=>p.playerid).filter(id=>!homeIds.has(id)):[];
      const extra=extraIds.length?(await query<Player>("SELECT DISTINCT ON (playerid) playerid::text AS playerid,COALESCE(NULLIF(display_name,''),trim(concat_ws(' ',first_name,last_name))) AS name,hsid::text AS hsid FROM flip_card_front_stage WHERE playerid::text=ANY($1::text[]) ORDER BY playerid,stage_updated_at DESC NULLS LAST",[extraIds])).rows:[];
      const all=[...home,...extra];
      const logs=all.length?(await query<Stat>('SELECT playerid::text AS playerid,stat_type,stats FROM player_game_logs WHERE game_date::date=$1::date AND playerid::text=ANY($2::text[])',[date,all.map(p=>p.playerid)])).rows:[];
      const byId=new Map<string,Stat[]>();
      for(const s of logs)byId.set(s.playerid,[...(byId.get(s.playerid)||[]),s]);
      const subject='YAT?STATS Alumni Daily — '+date;
      const html='<main style="max-width:700px;margin:auto;font-family:Georgia;color:#222"><p style="text-align:center">WHERE THEY YAT?</p><h1 style="text-align:center;border-bottom:4px double #222">THE ALUMNI DAILY</h1><p>'+safe(date)+' | Actual player performances</p><h2>Your Home School Alumni</h2>'+table(home,byId)+(superfan?'<h2>Your Super Fan Favorites</h2>'+table(extra,byId):'')+'<p style="font-size:12px">All roster members are shown even if they did not play. Actual performances also power the YAT?STATS fantasy high-school tournament.</p></main>';
      if(body?.send===true) {
        const contact=await lookupGHLContactByEmail(email);
        const sent=contact?await sendGHLEmail(contact,subject,html):false;
        results.push({email,status:sent?'sent':'send_failed',homePlayers:home.length,superFavorites:extra.length,statLines:logs.length});
      } else results.push({email,status:'preview',homePlayers:home.length,superFavorites:extra.length,statLines:logs.length,subject,html});
    } catch(e) {results.push({email,status:'error',message:String(e).slice(0,200)});}
  }
  return NextResponse.json({date,results});
}
