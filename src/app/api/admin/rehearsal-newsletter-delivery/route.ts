// Narrow, owner-authorized simulation mail bridge. The existing rehearsal
// token never authorizes arbitrary HTML, subjects, recipients or production writes.
// Actual sending uses the same authenticated production HighLevel transport.
import { timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { NextRequest, NextResponse } from 'next/server';
import { readNewsletterPreferences } from '@/lib/newsletter/finishedPublication';
import { deliverNewsletterEdition, newsletterPeriods, readNewsletterReview } from '@/lib/newsletter/scheduledPublication';
import { getGHLLocationId, lookupGHLContactByEmail } from '@/lib/gohighlevel';
import { sendDailyPilotEmail } from '@/lib/alumniEmailSender';
import { canDeliverDay, parseDeliveryRequest, verifiedHost, QA_ENDPOINT, LIVE_ENDPOINT, SEASON, REVIEW_BASE, REHEARSAL_IMAGE_ENV } from '@/lib/newsletter/rehearsalDeliveryGuard';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const configError=(code:string)=>reply({ok:false,error:code},503);

async function verifiedPool(connection:string,endpoint:string) {
  const pool=new Pool({connectionString:verifiedHost(connection,endpoint),ssl:{rejectUnauthorized:false},max:2,connectionTimeoutMillis:5000});
  try {
    const {rows:[id]}=await pool.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint");
    if(id?.endpoint!==endpoint)throw Error('wrong_connected_database');
    return pool;
  }catch(error){await pool.end();throw error;}
}

export async function POST(request:NextRequest) {
  const token=process.env.REHEARSAL_LIVE_FAN_TOKEN;
  const given=request.headers.get('authorization')||'',expected='Bearer '+(token||'');
  if(process.env.VERCEL_ENV!=='production'||!token||token.length<32||Buffer.byteLength(given)!==Buffer.byteLength(expected)||
    !timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return reply({ok:false,error:'unauthorized'},401);
  const input=parseDeliveryRequest(await request.json().catch(()=>null));
  if(!input)return reply({ok:false,error:'invalid_request'},400);
  const qaConnection=process.env.REHEARSAL_DATABASE_URL,liveConnection=process.env.PLAYERS_DATABASE_URL||process.env.DATABASE_URL;
  if(!qaConnection||!liveConnection)return configError('existing_database_connection_unavailable');
  // These are the existing production transport's runtime settings, not new
  // GitHub secrets. Fail closed rather than fabricate verification or send.
  if(!process.env.GHL_API_KEY||getGHLLocationId()!=='8eYj1Uj7Ugt0PDUGHblx'||process.env.YATSTATS_SENDING_DOMAIN_VERIFIED!=='true')
    return configError('existing_server_sender_not_ready');
  let qa:Pool|undefined,live:Pool|undefined;
  try {
    qa=await verifiedPool(qaConnection,QA_ENDPOINT);
    live=await verifiedPool(liveConnection,LIVE_ENDPOINT);
    const {rows:[control]}=await qa.query<{enabled:boolean;first_report_date:string|null}>(
      'SELECT enabled,first_report_date::text FROM public.rehearsal_email_delivery_control WHERE singleton');
    if(!control)return configError('missing_simulation_approval');
    const {rows:[counts]}=await qa.query<{approved:number;excluded:number}>(`SELECT count(*) FILTER(WHERE approved)::int AS approved,
      count(*) FILTER(WHERE NOT approved)::int AS excluded FROM public.rehearsal_email_recipient_policy`);
    if(counts?.approved!==30||counts.excluded!==9)return configError('recipient_approval_count_changed');
    if(input.action==='preflight'){
      // Check access without sending or disclosing a contact, credential or email.
      const {rows:[priv]}=await qa.query(`SELECT bool_and(has_table_privilege(current_user,relation,'SELECT')
        AND has_table_privilege(current_user,relation,'INSERT') AND has_table_privilege(current_user,relation,'UPDATE')) AS writable
        FROM unnest(ARRAY['public.alumni_daily_email_delivery','public.alumni_weekly_email_delivery']) AS r(relation)`);
      if(!priv?.writable)return configError('existing_qa_sender_connection_cannot_record_claims');
      const {rows:controls}=await live.query<{enabled:boolean;approved_layout_version:string}>('SELECT enabled,approved_layout_version FROM public.alumni_newsletter_control');
      const layouts=String(controls[0]?.approved_layout_version||'').split(',').map(x=>x.trim());
      if(controls.length!==1||!controls[0].enabled||!['daily-digest-phone8-v2','gazette-test3-v1'].every(x=>layouts.includes(x)))return configError('approved_live_layouts_unavailable');
      const {rows:sample}=await qa.query<{email:string}>('SELECT email FROM public.rehearsal_email_recipient_policy WHERE approved ORDER BY email LIMIT 5');
      let contact=false;
      for(const row of sample){if(await lookupGHLContactByEmail(row.email)){contact=true;break;}}
      if(!contact)return configError('existing_server_contact_lookup_unavailable');
      return reply({ok:true,mode:'preflight',approved:counts.approved,excluded:counts.excluded,enabled:control.enabled,
        firstReportDate:control.first_report_date,sender:'existing_highlevel',contactLookupVerified:true,emailsSent:0});
    }
    const {rows:[policy]}=await qa.query<{approved:boolean}>('SELECT approved FROM public.rehearsal_email_recipient_policy WHERE email=$1',[input.email]);
    if(!policy?.approved)return reply({ok:false,error:'recipient_not_approved'},403);
    const {rows:[checkpoint]}=await qa.query<{report_date:string;phase:string;branch_id:string;audit_status:string;effective_at:string}>(
      `SELECT report_date::text,phase,branch_id,evidence->'audit'->>'status' AS audit_status,effective_at::text
      FROM public.bracket_rehearsal_days WHERE season_key=$1 ORDER BY report_date DESC LIMIT 1`,[SEASON]);
    if(!canDeliverDay(input.day,control,checkpoint,true))return reply({ok:false,error:'not_latest_authorized_audited_day'},409);
    // Each day must have generated real personalized proofs before delivery.
    const {rows:[proof]}=await qa.query<{summary:Array<{email:string;cadence:string;date:string;status:string}>}>(
      'SELECT summary FROM public.rehearsal_fan_proof_runs WHERE report_date=$1::date ORDER BY created_at DESC LIMIT 1',[input.day]);
    const {rows:[registered]}=await live.query('SELECT 1 FROM public.newsletter_recipients WHERE lower(btrim(email))=$1 LIMIT 1',[input.email]);
    if(!registered)return reply({ok:true,statuses:newsletterPeriods(input.day).map(period=>({cadence:period.cadence,status:'not_a_registered_fan'}))});
    const result:Array<{cadence:string;status:string}>=[];
    for(const period of newsletterPeriods(input.day)){
      try {
        if(!Array.isArray(proof?.summary)||!proof.summary.some(x=>x.email===input.email&&x.cadence===period.cadence&&x.date===period.date&&x.status==='built')){
          result.push({cadence:period.cadence,status:'proof_unavailable'});continue;
        }
        const livePool=live;
        const edition=await readNewsletterReview(qa,{...period,email:input.email,seasonKey:SEASON,reviewBaseUrl:REVIEW_BASE,
          simulation:true,imageEnv:REHEARSAL_IMAGE_ENV},async pref=>{
          const db=await livePool.connect();
          try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const value=await readNewsletterPreferences(db,pref);await db.query('COMMIT');return value;}
          catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
        });
        if(!edition.subject.startsWith('[SIMULATION TEST] '))throw Error('simulation_subject_missing');
        // ONLY QA owns claims. Live is consulted read-only for current registration,
        // unsubscribe/format and approved layouts by the normal production helper.
        const sent=await deliverNewsletterEdition(qa,edition,{
          domainVerified:true,lookupContact:lookupGHLContactByEmail,
          send:(contact,rendered,format)=>sendDailyPilotEmail(contact,rendered.subject,rendered.html,{format,text:rendered.text}),
        },live);
        result.push({cadence:period.cadence,status:sent.status});
      }catch{result.push({cadence:period.cadence,status:'edition_delivery_error'});}
    }
    const ok=result.every(x=>['queued','previously_queued','not_subscribed','not_a_registered_fan'].includes(x.status));
    return reply({ok,statuses:result},ok?200:503);
  }catch(error){
    // Do not log raw credentials, personalized content, recipient or error text.
    console.error('[rehearsal-newsletter-delivery] failed',typeof (error as {code?:unknown})?.code==='string'?'database_or_transport_error':'guard_or_configuration_error');
    return configError('simulation_delivery_unavailable');
  }finally{await qa?.end();await live?.end();}
}
