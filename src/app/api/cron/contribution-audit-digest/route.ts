import {NextRequest,NextResponse} from 'next/server';
import {writerQuery as query} from '@/lib/dbWriter';
import {findOrCreateGhlContact,sendGHLEmail} from '@/lib/gohighlevel';
export const runtime='nodejs';export const dynamic='force-dynamic';
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  // Arizona has no daylight-saving time; calendar-day boundaries remain fixed.
  const {rows}=await query<{
   id:string;occurred_at:string;entity_type:string;entity_id:string;playerid:string|null;hsid:string|null;
   actor_uid:string|null;actor_email:string|null;event_type:string;before_data:unknown;after_data:unknown;source:string|null;
  }>(`SELECT a.id::text,a.occurred_at::text,a.entity_type,a.entity_id,a.playerid,a.hsid,
    COALESCE(a.actor_uid,fa.firebase_uid) actor_uid,
    COALESCE(a.actor_email,u.email) actor_email,
    a.event_type,a.before_data,a.after_data,a.source
   FROM public.contribution_change_audit a
   LEFT JOIN LATERAL (
     SELECT f.firebase_uid FROM public.fan_activity f
     WHERE a.entity_type='photo' AND f.action LIKE 'contribute_photo%'
       AND f.details->>'upload_id'=a.entity_id
     ORDER BY f.created_at DESC LIMIT 1
   ) fa ON TRUE
   LEFT JOIN public.user_profiles u ON u.firebase_uid=COALESCE(a.actor_uid,fa.firebase_uid)
   WHERE a.occurred_at >= (date_trunc('day',now() AT TIME ZONE 'America/Phoenix')-interval '1 day') AT TIME ZONE 'America/Phoenix'
     AND a.occurred_at < date_trunc('day',now() AT TIME ZONE 'America/Phoenix') AT TIME ZONE 'America/Phoenix'
   ORDER BY a.occurred_at DESC LIMIT 1000`);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-86400000));
  const html=`<h2>YAT?STATS contribution and change audit — ${escape(date)}</h2>
   <p>${rows.length} recorded player/photo changes. This report includes changes from automated sources as well as user submissions. Blank user indicates the originating database job has not supplied an identity.</p>
   <p>Records are append-only, including previous and new states.</p>
   <table border="1" cellpadding="5" style="border-collapse:collapse"><tr><th>Arizona time</th><th>Who</th><th>Event / source</th><th>Player / school</th><th>Before</th><th>After</th></tr>${rows.map(r=>`<tr><td>${escape(new Date(r.occurred_at).toLocaleString('en-US',{timeZone:'America/Phoenix'}))}</td><td>${escape(r.actor_email||r.actor_uid||'system/unknown')}</td><td>${escape(r.event_type)}<div>${escape(r.source)}</div></td><td>${escape(r.playerid)} / ${escape(r.hsid)}</td><td><pre>${escape(JSON.stringify(r.before_data))}</pre></td><td><pre>${escape(JSON.stringify(r.after_data))}</pre></td></tr>`).join('')}</table>
   ${rows.length===1000?'<p>Showing first 1,000 changes; additional entries remain in database.</p>':''}`;
  const contact=await findOrCreateGhlContact('pete@yatstats.com','Pete','DeLuca',undefined,'YAT?STATS Operations');
  if(!contact)throw Error('Unable to resolve daily audit email contact');
  const sent=await sendGHLEmail(contact,'YAT?STATS Daily Contribution Audit — '+date,html);
  if(!sent)throw Error('Daily audit email was not sent');
  return NextResponse.json({ok:true,day:date,reported:rows.length});
 }catch(e){console.error('[contribution-audit-digest]',e);return NextResponse.json({ok:false,error:'Audit email failed'},{status:500});}
}