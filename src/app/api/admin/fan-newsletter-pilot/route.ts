import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { GET as rosterGET } from '@/app/api/players/[hsid]/route';
import { lookupGHLContactByEmail } from '@/lib/gohighlevel';
import { sendDailyPilotEmail } from '@/lib/alumniEmailSender';
import { renderAlumniStatsEmail, type LedgerPlayer, type LedgerGameLog } from '@/lib/emailBoxScore';
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
const allowed = new Set(['test1','test2','test3','test4','test5','test6'].map(x=>x+'@yatstats.com').concat('pcdaction@gmail.com'));
type Fan={firebase_uid:string;home_hsid:string;plan:string;subscription_status:string|null;promo_code:string|null;promo_expires_at:string|null;stripe_subscription_id:string|null};
type School={hsname:string;hslocation:string|null;microsite_url:string|null};
type Favorite=LedgerPlayer&{name:string};
function isSuperfan(p:Fan){
 const st=String(p.subscription_status||'').toLowerCase();
 return (!!p.stripe_subscription_id&&['active','trialing'].includes(st))||
 (!!p.promo_code&&(!p.promo_expires_at||new Date(p.promo_expires_at)>new Date()))||
 ['demo_comped','demo-comped'].includes(st)||
 (p.plan==='superfan'&&!p.stripe_subscription_id&&!p.promo_code&&!['cancelled','canceled','unpaid','past_due'].includes(st));
}
export async function POST(req:NextRequest){
 if(!process.env.CRON_SECRET||req.headers.get('authorization')!=='Bearer '+process.env.CRON_SECRET) return NextResponse.json({error:'Unauthorized'},{status:401});
 const body=await req.json().catch(()=>null), date=String(body?.date||''), emails=body?.emails;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(emails)||!emails.length||emails.length>7||emails.some((e:unknown)=>typeof e!=='string'||!allowed.has(e.toLowerCase()))) return NextResponse.json({error:'Invalid date or recipients'},{status:400});
 const result=[];
 for(const email of [...new Set((emails as string[]).map(x=>x.toLowerCase()))]){
 try {
 const fan=(await query<Fan>('SELECT firebase_uid,home_hsid,plan,subscription_status,promo_code,promo_expires_at,stripe_subscription_id FROM user_profiles WHERE lower(email)=$1 LIMIT 1',[email])).rows[0];
 if(!fan?.home_hsid){result.push({email,status:'missing_profile'});continue;}
 const school=(await query<School>('SELECT hsname,hslocation,microsite_url FROM school_success WHERE hsid::text=$1 LIMIT 1',[fan.home_hsid])).rows[0];
 if(!school?.hsname) throw Error('School identity unavailable');
 const response=await rosterGET(req,{params:Promise.resolve({hsid:fan.home_hsid})});
 if(!response.ok) throw Error('Canonical fantasy roster unavailable');
 const home=(await response.json()) as LedgerPlayer[];
 if(!Array.isArray(home)||!home.length)throw Error('Canonical fantasy roster empty');
 const favorites=(await query<Favorite>(`SELECT f.playerid::text AS playerid,
 COALESCE(NULLIF(s.display_name,''),f.playerid::text) AS name,s.current_team_name,s.position
 FROM user_favorites f LEFT JOIN LATERAL(
 SELECT display_name,current_team_name,position FROM flip_card_front_stage
 WHERE playerid::text=f.playerid::text ORDER BY (hsid::text=f.hsid::text) DESC NULLS LAST,stage_updated_at DESC NULLS LAST LIMIT 1
 )s ON true WHERE f.firebase_uid=$1 ORDER BY name`,[fan.firebase_uid])).rows;
 const homeIds=new Set(home.map(p=>String(p.playerid)));
 const extra=isSuperfan(fan)?favorites.filter(p=>!homeIds.has(String(p.playerid))).map(p=>({...p,display_name:p.name})):[] as LedgerPlayer[];
 const all=[...home,...extra];
 const logs=(await query<LedgerGameLog>('SELECT playerid::text AS playerid,stat_type,stats FROM player_game_logs WHERE game_date::date=$1::date AND playerid::text=ANY($2::text[])',[date,all.map(p=>String(p.playerid))])).rows;
 const html=renderAlumniStatsEmail({date,schoolName:school.hsname,schoolLocation:school.hslocation||'',schoolUrl:school.microsite_url||'',home,favorites:extra,logs});
 const subject='YAT?STATS | '+school.hsname+' Stat Ledger | '+date;
 if(body?.send===true){
 if(process.env.YATSTATS_SENDING_DOMAIN_VERIFIED!=='true'){
  result.push({email,status:'blocked_unverified_sending_domain',school:school.hsname});continue;
 }
 const id=await lookupGHLContactByEmail(email);
 if(!id){result.push({email,status:'missing_arms_contact'});continue;}
 // Concurrency-safe claim: one send per recipient per reporting day, even if cron retries.
 const claim=await query(
  `INSERT INTO public.alumni_daily_email_delivery
  (report_date,recipient_email,status,school_name,home_player_count,favorite_count,game_stat_count)
  VALUES ($1::date,$2,'sending',$3,$4,$5,$6)
  ON CONFLICT (report_date,recipient_email) DO NOTHING
  RETURNING recipient_email`,
  [date,email,school.hsname,home.length,extra.length,logs.length]
 );
 if(!claim.rowCount){result.push({email,status:'previously_attempted',school:school.hsname});continue;}
 const sent=await sendDailyPilotEmail(id,subject,html);
 await query(
  'UPDATE public.alumni_daily_email_delivery SET status=$3,error_detail=$4,updated_at=now() WHERE report_date=$1::date AND recipient_email=$2',
  [date,email,sent?'queued':'failed',sent?null:'HighLevel rejected or could not accept email']
 );
 result.push({email,status:sent?'queued':'send_failed',school:school.hsname,homePlayers:home.length,favorites:extra.length,statLines:logs.length});
 }else result.push({email,status:'preview',school:school.hsname,homePlayers:home.length,favorites:extra.length,statLines:logs.length,subject,html});
 }catch(error){result.push({email,status:'error',error:String(error).slice(0,160)});}
 }
 return NextResponse.json({date,result});
}
