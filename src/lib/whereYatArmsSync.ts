import 'server-only';
import { query } from '@/lib/db';
import { getGHLApiKey, getGHLLocationId, findOrCreateGhlContact, addTagToGHLContact } from '@/lib/gohighlevel';
import { whereYatReviewUrl } from '@/lib/whereYatReviewNotifications';
import { whereYatCrmSyncAllowed } from './whereYatSwitches';

const OWNER_ID = 'tINEwNdSXZeJdjdpdJC0';
type Submission = Record<string, any>;
const text = (value: unknown) => String(value ?? '').trim();
const parts = (name: string) => { const p=name.trim().split(/\s+/);return {first:p.shift()||'Alumnus',last:p.join(' ')}; };

async function api(path:string,method:'POST'|'PUT',body:unknown) {
 const key=getGHLApiKey();
 if(!key || getGHLLocationId()!=='8eYj1Uj7Ugt0PDUGHblx')throw new Error('YAT?STATS ARMS location credential unavailable or mismatched');
 const response=await fetch('https://services.leadconnectorhq.com'+path,{method,
  headers:{Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json',Version:'2021-07-28'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('ARMS '+method+' '+path+' HTTP '+response.status);
 return response.json().catch(()=>({}));
}
async function saveState(id:number,values:Record<string,unknown>) {
 const keys=Object.keys(values),params=keys.map(k=>values[k]);
 await query('UPDATE public.alumni_where_yat_now SET '+keys.map((k,i)=>k+'=$'+(i+2)).join(', ')+' WHERE id=$1',[id,...params]);
}
function noteSections(s:Submission,reviewUrl:string) {
 const business=Array.isArray(s.businesses_json)?s.businesses_json:[];
 return [
  {key:'identity',body:['YAT?STATS — RETIRED PLAYER QUESTIONNAIRE #'+s.id,'Player ID: '+s.playerid,'School ID: '+s.hsid,'Contributor email: '+s.contact_email,'Retirement year: '+text(s.retirement_year),'City/state: '+[s.location_city,s.location_state].filter(Boolean).join(', '),'Occupation: '+text(s.occupation),'Identity status: AWAITING MANUAL VERIFICATION','Review: '+reviewUrl].join('\n')},
  {key:'stories',body:['QUESTIONNAIRE ANSWERS — #'+s.id,'Most memorable high school baseball moment:\n'+text(s.favorite_hs_memory),'Most memorable moment after graduation:\n'+text(s.favorite_post_hs_memory),'Life & family:\n'+text(s.family_life),'What life looks like now:\n'+text(s.story)].join('\n\n')},
  {key:'business',body:['BUSINESS AND CONTACT DETAILS — #'+s.id,'Business name: '+text(s.company_name),'Website: '+text(s.business_website),'LinkedIn: '+text(s.linkedin_url),'Facebook: '+text(s.facebook_url),'X: '+text(s.x_url),'Instagram: '+text(s.instagram_url),'Business contact email: '+text(s.business_contact_email),'Business phone: '+text(s.business_contact_phone),'Business message: '+text(s.business_message),'Business offer: '+text(s.business_offer),'Public business opt-in: '+Boolean(s.business_public_opt_in),'Businesses: '+JSON.stringify(business),'Company logo: '+text(s.company_logo_url),'Business headshot: '+text(s.business_headshot_url)].join('\n')},
  {key:'media',body:['ADDITIONAL QUESTIONNAIRE DETAILS — #'+s.id,'Teammate leads (private): '+text(s.private_teammate_tips),'Alumni photos: '+JSON.stringify(s.life_photos_json||[]),'Memory-specific photos: '+JSON.stringify(s.memory_photos_json||{}),'Featured memory: '+text(s.featured_memory_key),'Personal photo: '+text(s.photo_url),'Callback number (private): '+text(s.contact_phone),'Replaces submission: '+text(s.replaces_submission_id),'Contributor proof confirmed: '+Boolean(s.proof_confirmed_at),'Alumni identity attested: '+Boolean(s.alumni_claim_attested),'Partner interest: '+Boolean(s.sponsorship_interest)].join('\n')}
 ];
}
export async function syncWhereYatSubmissionToArms(id:number):Promise<boolean> {
 if(process.env.VERCEL_ENV!=='production'||!whereYatCrmSyncAllowed(id))return false;
 const rows=await query<Submission>('SELECT * FROM public.alumni_where_yat_now WHERE id=$1 LIMIT 1',[id]);
 const s=rows.rows[0];if(!s)return false;
 if(s.arms_sync_status==='sent')return true;
 // Best effort lease. Failed runs are retryable; partial note/task ids persist.
 const lease=await query('UPDATE public.alumni_where_yat_now SET arms_sync_status=\'syncing\', arms_sync_started_at=now(),arms_sync_attempts=arms_sync_attempts+1 WHERE id=$1 AND (arms_sync_status IN (\'not_sent\',\'failed\') OR (arms_sync_status=\'syncing\' AND arms_sync_started_at<now()-interval \'10 minutes\')) RETURNING id',[id]);
 if(!lease.rows.length)return false;
 try {
  const name=parts(text(s.display_name));
  const contactId=text(s.arms_contact_id)||await findOrCreateGhlContact(text(s.contact_email),name.first,name.last,text(s.hsid));
  if(!contactId)throw new Error('ARMS contact upsert failed');
  await saveState(id,{arms_contact_id:contactId});
  for(const tag of ['Retired Alumni','Retired Player','yatstats:retired-player','yatstats:alumni-review-pending','hsid:'+s.hsid]) {
   const applied=await addTagToGHLContact(contactId,tag);
   if(!applied.success)throw new Error('Could not add ARMS tag '+tag);
  }
  const reviewUrl=await whereYatReviewUrl(text(s.hsid),Number(s.id))||'https://yatstats.com/contribute-review?alumni='+s.id;
  let ids=typeof s.arms_note_ids==='object'&&s.arms_note_ids?{...s.arms_note_ids}:{};
  for(const item of noteSections(s,reviewUrl)) {
   if(ids[item.key])continue;
   const result=await api('/contacts/'+encodeURIComponent(contactId)+'/notes','POST',{body:item.body});
   const noteId=result.note?.id||result.id;
   if(!noteId)throw new Error('ARMS note created without a returned id');
   ids[item.key]=noteId;
   await saveState(id,{arms_note_ids:JSON.stringify(ids)});
  }
  if(!text(s.arms_task_id)){
   const due=new Date(Date.now()+24*60*60*1000).toISOString();
   const result=await api('/contacts/'+encodeURIComponent(contactId)+'/tasks','POST',{
    title:'Review retired alum questionnaire — '+s.display_name,
    body:'Verify identity, read answers, call to thank the alum, invite #YATABOY sharing, and discuss relevant opportunities. '+reviewUrl,
    dueDate:due,completed:false,assignedTo:OWNER_ID
   });
   const taskId=result.task?.id||result.id;
   if(!taskId)throw new Error('ARMS follow-up task created without a returned id');
   await saveState(id,{arms_task_id:taskId});
  }
  await saveState(id,{arms_sync_status:'sent',arms_synced_at:new Date(),arms_sync_error:null});
  return true;
 }catch(error) {
  const message=error instanceof Error?error.message:'Unknown CRM sync failure';
  await saveState(id,{arms_sync_status:'failed',arms_sync_error:message.slice(0,400)}).catch(()=>{});
  console.error('[where-yat-arms] sync failed',{submissionId:id,message});
  return false;
 }
}
