import 'server-only';
import { createHash } from 'crypto';
import { query } from '@/lib/db';

type Tip = { id: string; intake_source: string; matched_playerid: string | null; matched_hsid: string | null; raw_player_name: string | null; article_url: string; notes: string | null };
type Missing = { id: string; hsid: string; player_name: string; grad_year: number | null; notes: string | null };
type Outcome = { published: number; review: number; failed: number };
// Track a completed queue record in the existing append-only audit log, avoiding
// UPDATE privileges on the publicly writable intake table.
async function markTip(t:Tip,status:'published'|'needs_review',reason:string) {
 await query(`INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)
 VALUES('system:contribution-publisher','contribute_processed',$1,$2,$3::jsonb)`,
 [t.matched_playerid,t.matched_hsid,JSON.stringify({queue_id:t.id,status,reason})]);
}
const handle = (v: string) => v.trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?(?:instagram\.com|x\.com|twitter\.com)\//i,'').replace(/[/?#].*$/,'');
const clip = (url: string) => /^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?|youtube\.com\/shorts\/|youtu\.be\/|instagram\.com\/(?:p|reel)\/|facebook\.com\/|fb\.watch\/|milb\.com\/)/i.test(url);
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0,32);
function parsed(v: string | null): Record<string, unknown> | null { try { const x=JSON.parse(v || ''); return x && typeof x==='object' && !Array.isArray(x) ? x : null; } catch { return null; } }
function year(v: unknown) { const y=Number(v); return Number.isInteger(y) && y>=1900 && y<=new Date().getFullYear()+1 ? String(y) : null; }
async function stage(id: string) {
 const { rows } = await query<{ playerid:string; hsid:string; first_name:string; last_name:string; class_of:string|null; position:string|null }>(
 'SELECT playerid,hsid,first_name,last_name,class_of,position FROM flip_card_front_stage WHERE playerid=$1 LIMIT 1',[id]);
 return rows[0] || null;
}
async function processCorrection(t:Tip):Promise<boolean> {
 const meta = parsed(t.notes);
 const fields = (meta?.fields && typeof meta.fields === 'object' && !Array.isArray(meta.fields)) ? meta.fields as Record<string,unknown> : {};
 const oldGrad = /^\[grad_year\]\s*(\d{4})$/.exec(t.notes || '');
 const requestedYear = year(fields.class_of || oldGrad?.[1]);
 const requestedPosition = typeof fields.position==='string' ? fields.position.trim().toUpperCase() : '';
 const player = t.matched_playerid ? await stage(t.matched_playerid) : null;
 if (!player || (t.matched_hsid && player.hsid!==t.matched_hsid)) return false;
 // Never partially publish a correction when other fields conflict or need human review.
 const keys=Object.keys(fields).filter(k=>fields[k]!==null && fields[k]!==undefined && String(fields[k]).trim());
 if(keys.some(k=>!['class_of','position','instagram','x'].includes(k)))return false;
 if(requestedYear && player.class_of && player.class_of!==requestedYear)return false;
 if(requestedPosition && player.position && player.position!==requestedPosition)return false;
 if(requestedPosition && !/^[A-Z0-9 -]{1,12}$/.test(requestedPosition))return false;
 // Verified legacy data cannot be replaced by unverified fan input.
 if(requestedYear && (!player.class_of || player.class_of===requestedYear)) {
   await query('UPDATE flip_card_front_stage SET class_of=$2,updated_at=now() WHERE playerid=$1 AND (class_of IS NULL OR class_of=$2)',[player.playerid,requestedYear]);
 }
 if(requestedPosition && (!player.position || player.position===requestedPosition)) {
   await query('UPDATE flip_card_front_stage SET position=$2,updated_at=now() WHERE playerid=$1 AND (position IS NULL OR position=$2)',[player.playerid,requestedPosition]);
 }
 for(const platform of ['instagram','x'] as const){
   const raw=fields[platform];
   if(typeof raw!=='string'||!raw.trim())continue;
   const name=handle(raw);
   if(!/^[a-zA-Z0-9._]{1,30}$/.test(name))continue;
   // A handle attached to another player is an exception, not an identity reassignment.
   const existing=await query<{playerid:string|null}>('SELECT playerid FROM social_sources WHERE platform=$1 AND lower(handle)=lower($2) LIMIT 1',[platform,name]);
   if(existing.rows[0] && existing.rows[0].playerid!==player.playerid)return false;
   if(existing.rows.length===0){
     await query("INSERT INTO social_sources(platform,handle,owner_type,hsid,playerid,authorization_type,status) VALUES ($1,$2,'player',$3,$4,'public','active') ON CONFLICT (platform,handle) DO NOTHING",[platform,name,player.hsid,player.playerid]);
   }
 }
 return keys.length>0 || Boolean(oldGrad && requestedYear);
}
async function processTip(t:Tip):Promise<boolean> {
 if(!t.matched_playerid || !t.matched_hsid || !/^https:\/\//i.test(t.article_url))return false;
 const player=await stage(t.matched_playerid);
 if(!player || player.hsid!==t.matched_hsid)return false;
 let u:URL;try{u=new URL(t.article_url)}catch{return false}
 if(!['https:'].includes(u.protocol) || !clip(t.article_url))return false;
 // Do not automatically embed temporary Instagram Stories or unknown external sources.
 const title=(t.notes||'').replace(/^\[(clip|news)\]\s*/,'').trim().slice(0,150);
 const label=title || `Video shared about ${player.first_name} ${player.last_name}`;
 const permalink=t.article_url;
 const identifier=hash(t.id);
 await query(`INSERT INTO news_articles(uuid,playerid,player_name,hsid,title,source,published_at,url,
   snippet,local_recap,discovery_source,verification_status,verification_reason,newsworthiness,raw_payload)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'contribute','VERIFIED','Fan provided link to named player','NORMAL',$11::jsonb)
   ON CONFLICT(uuid) DO NOTHING`,
   [identifier,player.playerid,`${player.first_name} ${player.last_name}`,player.hsid,label,u.hostname.replace(/^www\./,''),new Date().toISOString(),permalink,title||null,title||null,JSON.stringify({contribution_id:t.id,contributor_source:t.intake_source})]);
 return true;
}
export async function publishPendingContributions(limit=35):Promise<Outcome>{
 const outcome:Outcome={published:0,review:0,failed:0};
 const {rows}=await query<Tip>(`SELECT id::text,intake_source,matched_playerid,matched_hsid,raw_player_name,article_url,notes
 FROM news_tip_queue q WHERE q.status='new' AND q.intake_source IN ('correction','fan_drawer','manual_seed') AND NOT EXISTS (SELECT 1 FROM fan_activity fa WHERE fa.action='contribute_processed' AND fa.details->>'queue_id'=q.id::text)
 ORDER BY submitted_at ASC LIMIT $1`,[limit]);
 for(const item of rows){
   try{
     const isCorrection=item.intake_source==='correction';
     const ok=isCorrection ? await processCorrection(item) : await processTip(item);
     if(ok){await markTip(item,'published','automatically processed');outcome.published++;}
     else{await markTip(item,'needs_review','Conflicting/unsupported field or unverified destination');outcome.review++;}
   } catch(e){console.error('[contribution-publisher] tip failed',{id:item.id,error:String(e)});outcome.failed++;}
 }
 // New player submissions need a match check and a dedicated stable YAT ID.
 // Creation happens through an atomic insert only when the full structured form is present.
 const missing=await query<Missing>(`SELECT id::text,hsid,player_name,grad_year,notes FROM missing_player_submission
 WHERE processed_status='new' ORDER BY created_at ASC LIMIT $1`,[limit]);
 for(const item of missing.rows){
   try{
     const details=parsed(item.notes);const fields=(details?.fields||{}) as Record<string,unknown>;
     const first=String(fields.first_name||'').trim(),last=String(fields.last_name||'').trim();
     if(!first||!last||!/^\d+$/.test(item.hsid)||!year(item.grad_year)) {
       await query("UPDATE missing_player_submission SET processed_status='needs_review',error_message='Incomplete identity or legacy submission' WHERE id=$1",[item.id]);outcome.review++;continue;
     }
     const dup=await query<{playerid:string}>(`SELECT playerid FROM flip_card_front_stage WHERE hsid=$1 AND lower(trim(first_name))=lower($2) AND lower(trim(last_name))=lower($3) LIMIT 2`,[item.hsid,first,last]);
     if(dup.rows.length){
       await query("UPDATE missing_player_submission SET processed_status='needs_review',error_message='Potential existing player; resolve identity first' WHERE id=$1",[item.id]);outcome.review++;continue;
     }
     const playerid='YAT'+(BigInt('0x'+item.id.replace(/-/g,'').slice(0,15)) % 1000000000000000n).toString().padStart(15,'0');
     const status=String(fields.status_label||'UNKNOWN').slice(0,40);
     const level=String(fields.level_label||'HIGH SCHOOL').slice(0,40);
     const position=String(fields.position||'').slice(0,20)||null;
     const team=String(fields.current_team_name||'').slice(0,120)||null;
     await query(`INSERT INTO flip_card_front_stage(playerid,hsid,first_name,last_name,display_name,class_of,position,status_label,level_label,current_team_name,source_notes,source_summary)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'fan-contributed; unverified',jsonb_build_object('submission_id',$11::text,'source','contribute'))
       ON CONFLICT(playerid) DO NOTHING`,[playerid,item.hsid,first,last,`${first} ${last}`,year(item.grad_year),position,status,level,team,item.id]);
     await query("UPDATE missing_player_submission SET processed_status='published',published_playerid=$2,processed_at=now(),error_message=NULL WHERE id=$1 AND processed_status='new'",[item.id,playerid]);
     outcome.published++;
   }catch(e){console.error('[contribution-publisher] missing player failed',{id:item.id,error:String(e)});outcome.failed++;}
 }
 return outcome;
}
