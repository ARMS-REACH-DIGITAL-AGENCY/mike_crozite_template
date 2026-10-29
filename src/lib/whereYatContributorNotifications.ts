import 'server-only';
import { findOrCreateGhlContact, sendGHLEmail } from './gohighlevel';
import { resolveSchoolNewsOrigins } from './schoolNewsLinks';
import { query } from './db';
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]);
export async function notifyWhereYatContributor(info:{id:number;hsid:string;email:string;name:string;outcome:'received'|'approved'|'rejected'}) {
 if(process.env.VERCEL_ENV!=='production')return false;
 const addresses=await resolveSchoolNewsOrigins([info.hsid],query);
 const origin=addresses.get(info.hsid);
 if(!origin)return false;
 const proof=new URL('/'+info.hsid+'/where-yat-proof?submission='+info.id,origin).toString();
 const first=info.name.split(' ')[0]||'Alumnus';
 const text=info.outcome==='received'
 ? 'Thanks for sharing your Where YAT Now? update. Your proof is saved. Review it online, where you can see exactly what you submitted. Identity review is still required before publication.'
 : info.outcome==='approved'
 ? 'Your Where YAT Now? update has been approved and published to your player profile.'
 : 'Your Where YAT Now? submission was not approved for publication. Please contact YAT?STATS to resolve any questions.';
 const contact=await findOrCreateGhlContact(info.email,first);
 if(!contact)return false;
 return sendGHLEmail(contact,'YAT?STATS | Where YAT Now? '+info.outcome.toUpperCase(),
 '<p>Hi '+esc(first)+',</p><p>'+esc(text)+'</p><p><a href="'+esc(proof)+'">VIEW YOUR ONLINE PROOF</a></p><p>YAT?STATS · Connect, Contribute, Remember</p>');
}
