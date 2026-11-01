import 'server-only';
import { findOrCreateGhlContact, sendGHLEmail } from './gohighlevel';
import { resolveSchoolNewsOrigins } from './schoolNewsLinks';
import { query } from './db';
import {toSlugFromDisplay} from './slug';
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]);
export async function notifyWhereYatContributor(info:{id:number;hsid:string;email:string;name:string;outcome:'received'|'approved'|'rejected'}) {
 if(process.env.VERCEL_ENV!=='production')return false;
 const addresses=await resolveSchoolNewsOrigins([info.hsid],query);
 const origin=addresses.get(info.hsid);
 if(!origin)return false;
 const record=await query<{playerid:string;display_name:string}>(
   'SELECT playerid,display_name FROM public.alumni_where_yat_now WHERE id=$1 AND hsid=$2 LIMIT 1',[info.id,info.hsid]);
 const item=record.rows[0];
 const destination=info.outcome==='approved'&&item
   ? '/'+info.hsid+'/player/'+encodeURIComponent(item.playerid)+'/'+toSlugFromDisplay(item.display_name)+'#ppTab-schedule'
   : '/'+info.hsid+'/player/'+encodeURIComponent(item?.playerid||'')+'/'+toSlugFromDisplay(item?.display_name||info.name)+'#ppTab-schedule';
 const target=new URL(destination,origin).toString();
 const first=info.name.split(' ')[0]||'Alumnus';
 const text=info.outcome==='received'
 ? 'Thanks for sharing your Where YAT Now? update. Your approved layout has been submitted for YAT?STATS corporate review. We will contact you and let you know when it is published.'
 : info.outcome==='approved'
 ? 'Your Where YAT Now? update has been approved and published to your player profile.'
 : 'Your Where YAT Now? submission was not approved for publication. Please contact YAT?STATS to resolve any questions.';
 const contact=await findOrCreateGhlContact(info.email,first);
 if(!contact)return false;
 return sendGHLEmail(contact,'YAT?STATS | Where YAT Now? '+info.outcome.toUpperCase(),
 '<p>Hi '+esc(first)+',</p><p>'+esc(text)+'</p><p><a href="'+esc(target)+'">'+(info.outcome==='approved'?'VIEW YOUR PUBLISHED PROFILE':'VISIT YOUR PLAYER PROFILE')+'</a></p><p>YAT?STATS · Connect, Contribute, Remember</p>');
}
